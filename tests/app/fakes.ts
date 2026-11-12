import { BACKUP_FORMAT, BACKUP_VERSION, type TeamBackup } from '../../src/app/backup';
import {
  SyncFailure as SyncFailureClass,
  type AccessRepository,
  type AlertOutput,
  type AuthFailure,
  type AuthService,
  type AuthUser,
  type HeatSheetRepository,
  type Membership,
  type PreferencesStore,
  type PushNotifications,
  type PushStatus,
  type ScreenWakeLock,
  type SyncErrorCode,
  type SyncFailure,
  type TeamAccess,
} from '../../src/app/ports';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/app/preferences';
import type { Dancer, Entries, FloorState, Partnership } from '../../src/domain/types';
import { localRepository } from '../../src/infra/local/localRepository';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { couples, entries, events, schedule } from '../domain/fixture';
import { OFFICIAL_DATA_VERSION } from '../../src/domain/purdue';

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
        // The same day as the fixture's clock times (`at`).
        // Already up to date with the built-in data, so captains' phones leave the fixture alone.
        info: {
          id: COMPETITION_ID,
          name: 'Classic',
          date: '2026-10-29',
          status: 'active',
          officialVersion: OFFICIAL_DATA_VERSION,
        },
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
  const control = { failWith: null as SyncFailure | null, held: null as Promise<void> | null };
  let release = () => {};

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
      // Like a server that hasn't answered yet: the change shows, the write isn't confirmed.
      if (control.held) await control.held;
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
    /** Holds this phone's writes unconfirmed until `releaseWrites`. */
    holdWrites() {
      control.held = new Promise((resolve) => (release = resolve));
    },
    releaseWrites() {
      control.held = null;
      release();
    },
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

/** Sign-in for tests. Anonymous sign-ins get fresh ids; `failSignIn` makes signing in fail. */
export function fakeAuth({ signedIn = null as AuthUser | null } = {}) {
  let user = signedIn;
  let anonymousCount = 0;
  const listeners = new Set<(user: AuthUser | null) => void>();
  const control = {
    failSignIn: null as AuthFailure | null,
  };
  const setUser = (next: AuthUser | null) => {
    user = next;
    listeners.forEach((listener) => listener(user));
  };
  const auth: AuthService = {
    onUserChange(listener) {
      listeners.add(listener);
      listener(user);
      return () => listeners.delete(listener);
    },
    async signInAnonymously() {
      if (control.failSignIn) throw control.failSignIn;
      const next = {
        uid: `phone-${++anonymousCount}`,
        isAnonymous: true,
        displayName: null,
        email: null,
      };
      setUser(next);
      return next;
    },
    async signOut() {
      setUser(null);
    },
  };
  return {
    auth,
    control,
    get user() {
      return user;
    },
  };
}

/**
 * Team access for tests, enforcing what the security rules enforce: the join code, one phone per
 * dancer, and that only members and captains see the team.
 */
export function fakeAccess({
  captainUids = [] as string[],
  joinCode = 'team-code',
  teamExists = true,
} = {}) {
  const state = {
    teamExists,
    captainUids: [...captainUids],
    joinCode,
    members: new Map<string, Membership>(),
    claims: new Map<string, string>(),
    pushTokens: new Map<string, string>(),
  };
  const accessWatchers = new Map<(access: TeamAccess) => void, string>();
  const claimWatchers = new Set<(claims: Record<string, string>) => void>();
  const codeWatchers = new Set<(code: string | null) => void>();

  const accessOf = (uid: string): TeamAccess => {
    const isCaptain = state.teamExists && state.captainUids.includes(uid);
    const membership = state.members.get(uid) ?? null;
    return isCaptain || membership ? { kind: 'team', isCaptain, membership } : { kind: 'none' };
  };
  const notify = () => {
    for (const [watcher, uid] of [...accessWatchers]) {
      const access = accessOf(uid);
      // Like Firestore, losing access ends the watch.
      if (access.kind === 'none') accessWatchers.delete(watcher);
      watcher(access);
    }
    claimWatchers.forEach((watcher) => watcher(Object.fromEntries(state.claims)));
    codeWatchers.forEach((watcher) => watcher(state.joinCode));
  };
  const refuse = () => Promise.reject(new SyncFailureClass('read-only'));

  const access: AccessRepository = {
    watchAccess(uid, onChange) {
      accessWatchers.set(onChange, uid);
      const current = accessOf(uid);
      if (current.kind === 'none') accessWatchers.delete(onChange);
      onChange(current);
      return () => accessWatchers.delete(onChange);
    },
    watchClaims(onChange) {
      claimWatchers.add(onChange);
      onChange(Object.fromEntries(state.claims));
      return () => claimWatchers.delete(onChange);
    },
    watchJoinCode(onChange) {
      codeWatchers.add(onChange);
      onChange(state.joinCode);
      return () => codeWatchers.delete(onChange);
    },
    async createTeam(uid, _name, code) {
      if (state.teamExists) return refuse();
      Object.assign(state, { teamExists: true, captainUids: [uid], joinCode: code });
      state.members.set(uid, { uid, dancerId: null, provider: 'anonymous', joinedAt: 1 });
      notify();
    },
    async join(uid, code, provider) {
      if (!state.teamExists || code !== state.joinCode) return refuse();
      state.members.set(uid, { uid, dancerId: null, provider, joinedAt: 1 });
      notify();
    },
    async joinAsCaptain(uid) {
      if (!state.captainUids.includes(uid)) return refuse();
      state.members.set(uid, { uid, dancerId: null, provider: 'anonymous', joinedAt: 1 });
      notify();
    },
    async claimDancer(uid, dancerId, previousDancerId) {
      const member = state.members.get(uid);
      const holder = state.claims.get(dancerId);
      if (!member || (holder && holder !== uid)) return refuse();
      if (previousDancerId) state.claims.delete(previousDancerId);
      state.claims.set(dancerId, uid);
      state.members.set(uid, { ...member, dancerId });
      notify();
    },
    async releaseDancer(dancerId, holderUid) {
      state.claims.delete(dancerId);
      const member = state.members.get(holderUid);
      if (member) state.members.set(holderUid, { ...member, dancerId: null });
      notify();
    },
    async setProvider(uid, provider) {
      const member = state.members.get(uid);
      if (!member) return refuse();
      state.members.set(uid, { ...member, provider });
      notify();
    },
    async setJoinCode(code) {
      state.joinCode = code;
      notify();
    },

    async savePushToken(uid, token) {
      state.pushTokens.set(uid, token);
    },
  };

  return {
    access,
    state,
    removeMember(uid: string) {
      state.members.delete(uid);
      for (const [dancerId, holder] of state.claims)
        if (holder === uid) state.claims.delete(dancerId);
      notify();
    },
  };
}

/** Notifications on a phone: `status` is what the browser reports; `refuse` makes asking fail. */
export function fakePush(initial: PushStatus = 'off', token = 'push-token') {
  const control = { status: initial, refuse: false, asked: 0 };
  const push: PushNotifications = {
    status: () => control.status,
    async getToken() {
      control.asked++;
      if (control.refuse) {
        control.status = 'blocked';
        throw new Error('Notifications were not allowed.');
      }
      control.status = 'on';
      return token;
    },
  };
  return { push, control };
}
