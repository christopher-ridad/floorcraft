import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import {
  SyncFailure,
  type CompetitionSnapshot,
  type HeatSheetRepository,
  type SyncErrorCode,
  type TeamInfo,
  type TeamSnapshot,
} from '../../app/ports';
import type {
  CallbackMark,
  CompetitionInfo,
  CompetitionStatus,
  Dancer,
  EventDetails,
  Partnership,
  ScheduleItem,
} from '../../domain/types';

/** Firestore allows 500 writes per batch. */
const BATCH_LIMIT = 450;

type Data = DocumentData;
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);
const list = <Item>(value: unknown) => (Array.isArray(value) ? (value as Item[]) : []);
const STATUSES: readonly CompetitionStatus[] = ['setup', 'active', 'archived'];

const toTeam = (data: Data): TeamInfo => ({
  name: text(data.name),
  captainUids: list<string>(data.captainUids),
  activeCompetitionId: textOrNull(data.activeCompetitionId),
});
const toDancer = (id: string, data: Data): Dancer => ({
  id,
  name: text(data.name),
  active: data.active !== false,
});
const toPartnership = (id: string, data: Data): Partnership => ({
  id,
  leadId: textOrNull(data.leadId),
  followId: textOrNull(data.followId),
  active: data.active !== false,
});
const toCompetition = (id: string, data: Data): CompetitionInfo => ({
  id,
  name: text(data.name),
  date: text(data.date),
  status: STATUSES.find((status) => status === data.status) ?? 'setup',
  ...(typeof data.officialVersion === 'number' ? { officialVersion: data.officialVersion } : {}),
});
const toMark = (data: Data): CallbackMark | null =>
  [1, 2, 3, 4, 5].includes(data.reachedRound)
    ? { reachedRound: data.reachedRound, eliminated: data.eliminated === true }
    : null;

/**
 * A Firestore error's code, e.g. `permission-denied`. Read from the error itself rather than with
 * `instanceof`, which fails when more than one copy of the SDK is loaded.
 */
function firestoreCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  return String(code).replace(/^firestore\//, '');
}

function readErrorCode(error: unknown): SyncErrorCode {
  return firestoreCode(error) === 'permission-denied' ? 'unavailable' : 'network';
}

function toWriteFailure(error: unknown): SyncFailure {
  const code = firestoreCode(error);
  const syncCode: SyncErrorCode =
    code === 'permission-denied' || code === 'unauthenticated'
      ? 'read-only'
      : code === 'resource-exhausted'
        ? 'quota-exceeded'
        : 'network';
  return new SyncFailure(syncCode, error instanceof Error ? error.message : String(error));
}

/** Runs a write and turns Firestore errors into SyncFailures. */
async function write(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    throw toWriteFailure(error);
  }
}

/**
 * Combines several live listeners into one snapshot, reported once all of them have loaded and
 * after every change. Returns a function that stops them all.
 */
function combine<Snapshot>(
  parts: ((update: () => void) => () => void)[],
  read: () => Snapshot,
  onChange: (snapshot: Snapshot) => void,
): () => void {
  const loaded = new Set<number>();
  const stops = parts.map((listen, index) =>
    listen(() => {
      loaded.add(index);
      if (loaded.size === parts.length) onChange(read());
    }),
  );
  return () => stops.forEach((stop) => stop());
}

export interface FirestoreRepositoryOptions {
  firestore: Firestore;
  teamId: string;
  /** The signed-in user, who signs live-tracking writes. */
  currentUid: () => string | null;
}

/** The team's data in Firestore, laid out as in docs/design/firebase-competitions.md. */
export function firestoreRepository({
  firestore,
  teamId,
  currentUid,
}: FirestoreRepositoryOptions): HeatSheetRepository {
  const teamPath = `teams/${teamId}`;
  const competitionPath = (competitionId: string) => `${teamPath}/competitions/${competitionId}`;
  const signature = () => ({ updatedBy: currentUid(), updatedAt: serverTimestamp() });

  /** Writes many documents in as few batches as Firestore allows. */
  async function writeAll(writes: [path: string, data: Data][]) {
    for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
      const batch = writeBatch(firestore);
      for (const [path, data] of writes.slice(start, start + BATCH_LIMIT)) {
        batch.set(doc(firestore, path), data);
      }
      await batch.commit();
    }
  }

  const listenToCollection =
    (
      path: string,
      onDocs: (snapshot: QuerySnapshot) => void,
      onError: (code: SyncErrorCode) => void,
    ) =>
    (update: () => void) =>
      onSnapshot(
        collection(firestore, path),
        (snapshot) => {
          onDocs(snapshot);
          update();
        },
        (error) => onError(readErrorCode(error)),
      );

  const listenToDoc =
    (path: string, onData: (data: Data | null) => void, onError: (code: SyncErrorCode) => void) =>
    (update: () => void) =>
      onSnapshot(
        doc(firestore, path),
        (snapshot) => {
          onData(snapshot.exists() ? snapshot.data() : null);
          update();
        },
        (error) => onError(readErrorCode(error)),
      );

  return {
    isShared: true,

    watchTeam(onChange, onError) {
      const snapshot: TeamSnapshot = {
        team: null,
        dancers: [],
        partnerships: [],
        competitions: [],
      };
      return combine(
        [
          listenToDoc(teamPath, (data) => (snapshot.team = data ? toTeam(data) : null), onError),
          listenToCollection(
            `${teamPath}/dancers`,
            (docs) => (snapshot.dancers = docs.docs.map((d) => toDancer(d.id, d.data()))),
            onError,
          ),
          listenToCollection(
            `${teamPath}/partnerships`,
            (docs) => (snapshot.partnerships = docs.docs.map((d) => toPartnership(d.id, d.data()))),
            onError,
          ),
          listenToCollection(
            `${teamPath}/competitions`,
            (docs) => (snapshot.competitions = docs.docs.map((d) => toCompetition(d.id, d.data()))),
            onError,
          ),
        ],
        () => ({ ...snapshot }),
        onChange,
      );
    },

    watchCompetition(competitionId, onChange, onError) {
      const path = competitionPath(competitionId);
      const snapshot: CompetitionSnapshot = {
        schedule: { items: [], events: [] },
        entries: {},
        floor: { currentItemId: null, currentSetAt: null },
        callbacks: {},
      };
      return combine(
        [
          listenToDoc(
            `${path}/schedule/current`,
            (data) =>
              (snapshot.schedule = {
                items: list<ScheduleItem>(data?.items),
                events: list<EventDetails>(data?.events),
              }),
            onError,
          ),
          listenToCollection(
            `${path}/entries`,
            (docs) =>
              (snapshot.entries = Object.fromEntries(
                docs.docs.map((d) => [d.id, list<string>(d.data().eventIds)]),
              )),
            onError,
          ),
          listenToDoc(
            `${path}/live/floor`,
            (data) =>
              (snapshot.floor = {
                currentItemId: textOrNull(data?.currentItemId),
                currentSetAt: numberOrNull(data?.currentSetAt),
              }),
            onError,
          ),
          listenToCollection(
            `${path}/callbacks`,
            (docs) =>
              (snapshot.callbacks = Object.fromEntries(
                docs.docs.flatMap((d) => {
                  const mark = toMark(d.data());
                  return mark ? [[d.id, mark]] : [];
                }),
              )),
            onError,
          ),
        ],
        () => ({ ...snapshot }),
        onChange,
      );
    },

    updateTeam: (change) => write(() => updateDoc(doc(firestore, teamPath), { ...change })),

    saveDancers: (dancers) =>
      write(() =>
        writeAll(
          dancers.map(({ id, name, active }) => [`${teamPath}/dancers/${id}`, { name, active }]),
        ),
      ),

    savePartnerships: (partnerships) =>
      write(() =>
        writeAll(
          partnerships.map(({ id, leadId, followId, active }) => [
            `${teamPath}/partnerships/${id}`,
            { leadId, followId, active },
          ]),
        ),
      ),

    saveCompetition: ({ id, name, date, status, officialVersion }) =>
      write(() =>
        setDoc(doc(firestore, competitionPath(id)), {
          name,
          date,
          status,
          ...(officialVersion === undefined ? {} : { officialVersion }),
        }),
      ),

    saveSchedule: (competitionId, { items, events }) =>
      write(() =>
        setDoc(doc(firestore, `${competitionPath(competitionId)}/schedule/current`), {
          items,
          events,
        }),
      ),

    saveEntries: (competitionId, entries) =>
      write(() =>
        writeAll(
          Object.entries(entries).map(([partnershipId, eventIds]) => [
            `${competitionPath(competitionId)}/entries/${partnershipId}`,
            { eventIds: [...eventIds] },
          ]),
        ),
      ),

    saveFloor: (competitionId, { currentItemId, currentSetAt }) =>
      write(() =>
        setDoc(doc(firestore, `${competitionPath(competitionId)}/live/floor`), {
          currentItemId,
          currentSetAt,
          ...signature(),
        }),
      ),

    saveCallback: (competitionId, key, mark) =>
      write(() => {
        const ref = doc(firestore, `${competitionPath(competitionId)}/callbacks/${key}`);
        return mark ? setDoc(ref, { ...mark, ...signature() }) : deleteDoc(ref);
      }),

    clearLive: (competitionId) =>
      write(async () => {
        const path = competitionPath(competitionId);
        const marks = await getDocs(collection(firestore, `${path}/callbacks`));
        for (let start = 0; start < marks.docs.length; start += BATCH_LIMIT) {
          const batch = writeBatch(firestore);
          for (const mark of marks.docs.slice(start, start + BATCH_LIMIT)) batch.delete(mark.ref);
          await batch.commit();
        }
        await setDoc(doc(firestore, `${path}/live/floor`), {
          currentItemId: null,
          currentSetAt: null,
          ...signature(),
        });
      }),
  };
}
