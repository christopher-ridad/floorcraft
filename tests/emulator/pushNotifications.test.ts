/**
 * Push notifications against the Firestore emulator: the Cloud Function's sending logic, and the
 * rules for phones' push tokens. Run with `npm run test:emulator`.
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sendDueAlerts, type PushSender } from '../../functions/src/sendDueAlerts';
import type { PlannedPush } from '../../src/domain/pushAlerts';
import { COMPETITION_ID, fixtureBackup } from '../app/fakes';
import { at } from '../domain/fixture';

const PROJECT = 'demo-floorcraft';
const TEAM_ID = 'pushtest';
const TEAM = `teams/${TEAM_ID}`;
const COMPETITION = `${TEAM}/competitions/${COMPETITION_ID}`;
const NOW = at(9, 20);

let env: RulesTestEnvironment;
let admin: App;
let db: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  admin = initializeApp({ projectId: PROJECT }, 'push-test');
  db = getFirestore(admin);
});
afterAll(async () => {
  await env?.cleanup();
  if (admin) await deleteApp(admin);
});

/**
 * The fixture team with its competition running: the floor reached h1 at 9:00 and it's 9:20.
 * Chris's and Alex's phones are signed up for notifications; Sam's phone isn't.
 */
beforeEach(async () => {
  await env.clearFirestore();
  const backup = fixtureBackup({ floor: { currentItemId: 'h1', currentSetAt: at(9, 0) } });
  const [competition] = backup.competitions;
  if (!competition) throw new Error('no competition');
  const writes: [string, object][] = [
    [TEAM, { name: 'Purdue', captainUids: ['captain'], activeCompetitionId: COMPETITION_ID }],
    ...backup.dancers.map(({ id, ...dancer }): [string, object] => [
      `${TEAM}/dancers/${id}`,
      dancer,
    ]),
    ...backup.partnerships.map(({ id, ...partnership }): [string, object] => [
      `${TEAM}/partnerships/${id}`,
      partnership,
    ]),
    [COMPETITION, { name: 'Classic', date: competition.info.date, status: 'active' }],
    [`${COMPETITION}/schedule/current`, competition.schedule],
    [`${COMPETITION}/live/floor`, { ...competition.floor, updatedBy: 'captain' }],
    ...Object.entries(competition.entries).map(([id, eventIds]): [string, object] => [
      `${COMPETITION}/entries/${id}`,
      { eventIds },
    ]),
    [`${TEAM}/members/chrisPhone`, { dancerId: 'chris', provider: 'anonymous', joinedAt: 1 }],
    [`${TEAM}/members/alexPhone`, { dancerId: 'alex', provider: 'anonymous', joinedAt: 1 }],
    [`${TEAM}/members/samPhone`, { dancerId: 'sam', provider: 'anonymous', joinedAt: 1 }],
    [`${TEAM}/pushTokens/chrisPhone`, { token: 't-chris', updatedAt: 1 }],
    [`${TEAM}/pushTokens/alexPhone`, { token: 't-alex', updatedAt: 1 }],
  ];
  await Promise.all(writes.map(([path, data]) => db.doc(path).set(data)));
});

function fakeSender(gone: string[] = []) {
  const sent: { token: string; push: PlannedPush }[] = [];
  const send: PushSender = async (token, push) => {
    if (gone.includes(token)) return 'gone';
    sent.push({ token, push });
    return 'sent';
  };
  return { send, sent };
}

describe('sending notifications', () => {
  it('sends each due phone its notification, once', async () => {
    const sender = fakeSender();
    await sendDueAlerts(db, TEAM_ID, NOW, sender.send);

    expect(sender.sent.map(({ token, push }) => [token, push.title, push.body])).toEqual([
      [
        't-alex',
        'Get on deck',
        'Newcomer Intl. Cha Cha 1st Round with Sam · Heat 3 · about 3 min away',
      ],
      ['t-chris', "You're up next", 'Bronze Amer. Smooth (FV) with Brooke · Heat 2'],
    ]);
    const claimed = await db.collection(`${COMPETITION}/pushSent`).get();
    expect(claimed.docs.map((d) => d.id).sort()).toEqual([
      'alexPhone_h4:on-deck',
      'chrisPhone_h2:up-next',
    ]);

    // The minute check and a floor change running again send nothing new.
    await sendDueAlerts(db, TEAM_ID, NOW, sender.send);
    await sendDueAlerts(db, TEAM_ID, NOW + 30_000, sender.send);
    expect(sender.sent).toHaveLength(2);
  });

  it('never sends the same notification twice when two runs overlap', async () => {
    const sender = fakeSender();
    await Promise.all([
      sendDueAlerts(db, TEAM_ID, NOW, sender.send),
      sendDueAlerts(db, TEAM_ID, NOW, sender.send),
    ]);
    expect(sender.sent).toHaveLength(2);
  });

  it('forgets a phone whose token no longer works', async () => {
    const sender = fakeSender(['t-alex']);
    await sendDueAlerts(db, TEAM_ID, NOW, sender.send);
    expect((await db.doc(`${TEAM}/pushTokens/alexPhone`).get()).exists).toBe(false);
    expect((await db.doc(`${TEAM}/pushTokens/chrisPhone`).get()).exists).toBe(true);
  });

  it('works for a practice run before competition day', async () => {
    await db.doc(COMPETITION).update({ date: '2026-11-14' });
    const sender = fakeSender();
    await sendDueAlerts(db, TEAM_ID, NOW, sender.send);
    expect(sender.sent.map(({ push }) => push.key)).toEqual([
      'alexPhone_h4:on-deck',
      'chrisPhone_h2:up-next',
    ]);
  });

  it('sends nothing for a floor left from another day, or before the floor moves', async () => {
    const sender = fakeSender();
    await sendDueAlerts(db, TEAM_ID, NOW + 24 * 60 * 60_000, sender.send);
    await db.doc(`${COMPETITION}/live/floor`).delete();
    await sendDueAlerts(db, TEAM_ID, NOW, sender.send);
    expect(sender.sent).toEqual([]);
  });
});

describe('push token rules', () => {
  const as = (uid: string) => env.authenticatedContext(uid).firestore();

  it('let a member set and read their own token only', async () => {
    const chris = as('chrisPhone');
    await assertSucceeds(
      setDoc(doc(chris, `${TEAM}/pushTokens/chrisPhone`), { token: 'new', updatedAt: 2 }),
    );
    await assertSucceeds(getDoc(doc(chris, `${TEAM}/pushTokens/chrisPhone`)));
    await assertFails(getDoc(doc(chris, `${TEAM}/pushTokens/alexPhone`)));
    await assertFails(
      setDoc(doc(chris, `${TEAM}/pushTokens/alexPhone`), { token: 'mine', updatedAt: 2 }),
    );
  });

  it('refuse outsiders and extra fields', async () => {
    await assertFails(
      setDoc(doc(as('stranger'), `${TEAM}/pushTokens/stranger`), { token: 'x', updatedAt: 2 }),
    );
    await assertFails(
      setDoc(doc(as('chrisPhone'), `${TEAM}/pushTokens/chrisPhone`), {
        token: 'x',
        updatedAt: 2,
        dancerId: 'alex',
      }),
    );
  });

  it('keep the record of sent notifications away from phones', async () => {
    await assertFails(getDoc(doc(as('chrisPhone'), `${COMPETITION}/pushSent/anything`)));
    await assertFails(
      setDoc(doc(as('captain'), `${COMPETITION}/pushSent/anything`), { uid: 'captain' }),
    );
  });
});
