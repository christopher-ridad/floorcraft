import { BACKUP_FORMAT, BACKUP_VERSION, type TeamBackup } from '../../src/app/backup';
import type {
  AlertOutput,
  HeatSheetRepository,
  PreferencesStore,
  ScreenWakeLock,
  SyncErrorCode,
  SyncFailure,
} from '../../src/app/ports';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/app/preferences';
import type { Dancer, Entries, FloorState, Partnership } from '../../src/domain/types';
import { localRepository } from '../../src/infra/local/localRepository';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { couples, entries, events, schedule } from '../domain/fixture';

export const COMPETITION_ID = 'classic';

/** The domain fixture as a team: dancers and partnerships named as in the fixture's couples. */
export const fixtureDancers: Dancer[] = [
  { id: 'chris', name: 'Chris', active: true },
  { id: 'brooke', name: 'Brooke', active: true },
  { id: 'alex', name: 'Alex (TBA)', active: true },
  { id: 'sam', name: 'Sam', active: true },
  { id: 'jo', name: 'Jo', active: true },
  { id: 'pat', name: 'Pat', active: true },
];
export const fixturePartnerships: Partnership[] = [
  { id: 'c1', leadId: 'chris', followId: 'brooke', active: true },
  { id: 'c2', leadId: 'alex', followId: 'sam', active: true },
  { id: 'c3', leadId: 'sam', followId: 'jo', active: true },
  { id: 'c4', leadId: 'pat', followId: null, active: true },
];

export function fixtureBackup({
  floor = { currentItemId: null, currentSetAt: null },
  callbacks = {},
  teamEntries = entries,
}: {
  floor?: FloorState;
  callbacks?: TeamBackup['competitions'][0]['callbacks'];
  teamEntries?: Entries;
} = {}): TeamBackup {
  if (couples.length !== fixturePartnerships.length) throw new Error('fixture changed');
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(0).toISOString(),
    team: { name: 'Purdue', activeCompetitionId: COMPETITION_ID },
    dancers: fixtureDancers,
    partnerships: fixturePartnerships,
    competitions: [
      {
        info: { id: COMPETITION_ID, name: 'Classic', date: '2026-11-14', status: 'active' },
        schedule: { items: schedule, events },
        entries: teamEntries,
        floor,
        callbacks,
      },
    ],
  };
}

type WriteMethod = Exclude<
  keyof HeatSheetRepository,
  'isShared' | 'watchTeam' | 'watchCompetition'
>;
const WRITE_METHODS: readonly WriteMethod[] = [
  'updateTeam',
  'saveDancers',
  'savePartnerships',
  'saveCompetition',
  'saveSchedule',
  'saveEntries',
  'saveFloor',
  'saveCallback',
  'clearLive',
];

/**
 * A shared repository for tests, backed by the real local repository in memory.
 * `writes` logs every write this phone makes; `otherPhone` writes as another phone would
 * (listeners see it, the log doesn't); `failWith` makes this phone's writes fail;
 * `failReadsWith` reports a read error to the watchers.
 */
export function fakeRepository(seed: TeamBackup = fixtureBackup()) {
  const otherPhone = localRepository(memoryStorage(), { seed });
  const writes: [WriteMethod, ...unknown[]][] = [];
  const readErrorListeners = new Set<(code: SyncErrorCode) => void>();
  const control = { failWith: null as SyncFailure | null };

  const repository = {
    isShared: true,
    watchTeam(onChange, onError) {
      readErrorListeners.add(onError);
      const stop = otherPhone.watchTeam(onChange, onError);
      return () => {
        readErrorListeners.delete(onError);
        stop();
      };
    },
    watchCompetition(competitionId, onChange, onError) {
      readErrorListeners.add(onError);
      const stop = otherPhone.watchCompetition(competitionId, onChange, onError);
      return () => {
        readErrorListeners.delete(onError);
        stop();
      };
    },
  } as HeatSheetRepository;
  for (const method of WRITE_METHODS) {
    (repository as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      if (control.failWith) throw control.failWith;
      writes.push([method, ...args]);
      await (otherPhone[method] as (...a: unknown[]) => Promise<void>)(...args);
    };
  }

  return {
    repository,
    otherPhone,
    writes,
    set failWith(failure: SyncFailure | null) {
      control.failWith = failure;
    },
    failReadsWith: (code: SyncErrorCode) =>
      readErrorListeners.forEach((listener) => listener(code)),
  };
}

export function fakePreferences(initial: Partial<Preferences> = {}) {
  let stored: Preferences = { ...DEFAULT_PREFERENCES, ...initial };
  return {
    get stored() {
      return stored;
    },
    store: {
      load: () => stored,
      save: (preferences: Preferences) => {
        stored = preferences;
      },
    } satisfies PreferencesStore,
  };
}

export function fakeAlertOutput() {
  const played: string[] = [];
  return {
    played,
    output: {
      chime: (times: number) => void played.push(`chime ${times}`),
      vibrate: (pattern: readonly number[]) => void played.push(`vibrate ${pattern.join(',')}`),
    } satisfies AlertOutput,
  };
}

export function fakeWakeLock(grants: boolean) {
  const calls: string[] = [];
  return {
    calls,
    wakeLock: {
      enable: async () => {
        calls.push('enable');
        return grants;
      },
      disable: async () => void calls.push('disable'),
    } satisfies ScreenWakeLock,
  };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
