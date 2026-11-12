/**
 * Works out which phones are due a notification and sends them, once each. Pure Firestore reads
 * and writes plus an injected sender, so it can be tested against the emulator.
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { localDate, minutesSinceMidnight } from '../../src/domain/clock';
import { deriveCompetition } from '../../src/domain/competition';
import { dancerName } from '../../src/domain/dancers';
import { planPushAlerts, type PlannedPush, type PushRecipient } from '../../src/domain/pushAlerts';
import { resolveCouples } from '../../src/domain/team';
import type {
  CallbackMark,
  Dancer,
  EventDetails,
  Partnership,
  ScheduleItem,
} from '../../src/domain/types';

/** Sends one notification. `gone` means the phone's token no longer works. */
export type PushSender = (token: string, push: PlannedPush) => Promise<'sent' | 'gone'>;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
const list = <Item>(value: unknown) => (Array.isArray(value) ? (value as Item[]) : []);

/** Firestore's code for "a document with this id already exists". */
const ALREADY_EXISTS = 6;

export async function sendDueAlerts(
  db: Firestore,
  teamId: string,
  now: number,
  send: PushSender,
): Promise<PlannedPush[]> {
  const teamPath = `teams/${teamId}`;
  const team = (await db.doc(teamPath).get()).data();
  const competitionId = textOrNull(team?.activeCompetitionId);
  if (!competitionId) return [];
  const competitionPath = `${teamPath}/competitions/${competitionId}`;

  const [competitionDoc, floorDoc] = await Promise.all([
    db.doc(competitionPath).get(),
    db.doc(`${competitionPath}/live/floor`).get(),
  ]);
  const date = text(competitionDoc.data()?.date);
  const floor = floorDoc.data();
  const currentItemId = textOrNull(floor?.currentItemId);
  const currentSetAt = typeof floor?.currentSetAt === 'number' ? floor.currentSetAt : null;
  // Only while the floor is moving today: on competition day, or during a practice run before
  // it. A floor left over from another day sends nothing.
  if (!currentItemId || !currentSetAt || localDate(currentSetAt) !== localDate(now)) return [];
  // On a practice day, pace is read from the floor as on the day (not ignored as another day's).
  const isCompetitionDay = localDate(now) === date;

  const docs = (path: string) =>
    db
      .collection(path)
      .get()
      .then((snapshot) => snapshot.docs);
  const [
    dancerDocs,
    partnershipDocs,
    scheduleDoc,
    entryDocs,
    callbackDocs,
    memberDocs,
    tokenDocs,
    sentDocs,
  ] = await Promise.all([
    docs(`${teamPath}/dancers`),
    docs(`${teamPath}/partnerships`),
    db.doc(`${competitionPath}/schedule/current`).get(),
    docs(`${competitionPath}/entries`),
    docs(`${competitionPath}/callbacks`),
    docs(`${teamPath}/members`),
    docs(`${teamPath}/pushTokens`),
    docs(`${competitionPath}/pushSent`),
  ]);

  const dancers: Dancer[] = dancerDocs.map((doc) => ({
    id: doc.id,
    name: text(doc.data().name),
    active: doc.data().active !== false,
  }));
  const partnerships: Partnership[] = partnershipDocs.map((doc) => ({
    id: doc.id,
    leadId: textOrNull(doc.data().leadId),
    followId: textOrNull(doc.data().followId),
    active: doc.data().active !== false,
  }));
  const schedule = scheduleDoc.data() ?? {};
  const callbacks: Record<string, CallbackMark> = {};
  for (const doc of callbackDocs) {
    const mark = toMark(doc.data());
    if (mark) callbacks[doc.id] = mark;
  }

  const competition = deriveCompetition({
    schedule: list<ScheduleItem>(schedule.items),
    events: list<EventDetails>(schedule.events),
    couples: resolveCouples(dancers, partnerships),
    entries: Object.fromEntries(
      entryDocs.map((doc) => [doc.id, list<string>(doc.data().eventIds)]),
    ),
    live: { currentItemId, currentSetAt, callbacks },
    date: isCompetitionDay ? date : undefined,
  });

  const dancerOf = new Map(
    memberDocs.map((doc) => [doc.id, textOrNull(doc.data().dancerId)] as const),
  );
  const nameOf = new Map(dancers.map((dancer) => [dancer.id, dancerName(dancer.name)]));
  const recipients: PushRecipient[] = tokenDocs.flatMap((doc) => {
    const token = text(doc.data().token);
    const dancerId = dancerOf.get(doc.id);
    const dancer = dancerId ? nameOf.get(dancerId) : undefined;
    return token && dancer ? [{ uid: doc.id, token, dancer }] : [];
  });

  const planned = planPushAlerts(
    competition,
    recipients,
    minutesSinceMidnight(new Date(now)),
    new Set(sentDocs.map((doc) => doc.id)),
  );

  const sent: PlannedPush[] = [];
  for (const push of planned) {
    // Claim the notification first, so a floor change and the minute check never both send it.
    try {
      await db.doc(`${competitionPath}/pushSent/${push.key}`).create({
        uid: push.recipient.uid,
        heatId: push.alert.heatId,
        type: push.alert.type,
        sentAt: now,
      });
    } catch (error) {
      if ((error as { code?: unknown }).code === ALREADY_EXISTS) continue;
      throw error;
    }
    const result = await send(push.recipient.token, push);
    if (result === 'gone') await db.doc(`${teamPath}/pushTokens/${push.recipient.uid}`).delete();
    else sent.push(push);
  }
  return sent;
}

function toMark(data: DocumentData): CallbackMark | null {
  return [1, 2, 3, 4, 5].includes(data.reachedRound)
    ? { reachedRound: data.reachedRound, eliminated: data.eliminated === true }
    : null;
}
