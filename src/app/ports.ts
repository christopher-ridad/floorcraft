/**
 * Interfaces the app layer needs from the outside world. src/infra implements them; tests use
 * in-memory fakes.
 */
import type {
  CallbackMark,
  CallbackMarks,
  CompetitionInfo,
  Dancer,
  Entries,
  FloorState,
  Partnership,
  Schedule,
} from '../domain/types';
import type { Preferences } from './preferences';

export interface TeamInfo {
  name: string;
  /** Firebase user ids of the team's captains. */
  captainUids: string[];
  /** The competition everyone sees, or null before one is set up. */
  activeCompetitionId: string | null;
}

/** Everything about the team, as one consistent snapshot. */
export interface TeamSnapshot {
  /** Null when the team hasn't been created yet. */
  team: TeamInfo | null;
  dancers: Dancer[];
  partnerships: Partnership[];
  competitions: CompetitionInfo[];
}

/** Everything about one competition, as one consistent snapshot. */
export interface CompetitionSnapshot {
  schedule: Schedule;
  entries: Entries;
  floor: FloorState;
  callbacks: CallbackMarks;
}

export type SyncErrorCode =
  /** This phone isn't allowed to do that (not a captain, or removed from the team). */
  | 'read-only'
  | 'quota-exceeded'
  /** The data can't be read here: not signed in, or not a member of the team. */
  | 'unavailable'
  /** Anything else, usually connectivity. */
  | 'network';

export class SyncFailure extends Error {
  constructor(
    readonly code: SyncErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'SyncFailure';
  }
}

/**
 * Where the team's data lives. Watchers call back with the current snapshot right away (or as
 * soon as it loads), then after every change, including this phone's own writes.
 * Writes reject with SyncFailure.
 */
export interface HeatSheetRepository {
  /** True when changes are shared with the whole team; false for this-phone-only storage. */
  readonly isShared: boolean;

  watchTeam(
    onChange: (snapshot: TeamSnapshot) => void,
    onError: (code: SyncErrorCode) => void,
  ): () => void;
  watchCompetition(
    competitionId: string,
    onChange: (snapshot: CompetitionSnapshot) => void,
    onError: (code: SyncErrorCode) => void,
  ): () => void;

  // Setup: captains only.
  updateTeam(change: Partial<TeamInfo>): Promise<void>;
  /** Adds or replaces these dancers; others are left alone. */
  saveDancers(dancers: readonly Dancer[]): Promise<void>;
  /** Adds or replaces these partnerships; others are left alone. */
  savePartnerships(partnerships: readonly Partnership[]): Promise<void>;
  saveCompetition(info: CompetitionInfo): Promise<void>;
  saveSchedule(competitionId: string, schedule: Schedule): Promise<void>;
  /** Replaces the entries of the partnerships given; others are left alone. */
  saveEntries(competitionId: string, entries: Entries): Promise<void>;

  // Live tracking: anyone on the team.
  saveFloor(competitionId: string, floor: FloorState): Promise<void>;
  /** Stores one callback mark under its key, or removes it (null). */
  saveCallback(competitionId: string, key: string, mark: CallbackMark | null): Promise<void>;
  /** Clears the floor position and every callback mark. */
  clearLive(competitionId: string): Promise<void>;
}

/** `connecting` until the team's data first loads. */
export type SyncMode = 'connecting' | 'shared' | 'local';

export type SignInProvider = 'anonymous' | 'google';

/** A phone (or Google account) that has joined the team. */
export interface Membership {
  uid: string;
  /** The dancer this phone belongs to, or null until they pick their name (or if they don't dance). */
  dancerId: string | null;
  provider: SignInProvider;
  /** Epoch ms. */
  joinedAt: number;
}

/** What the signed-in user may see. */
export type TeamAccess =
  { kind: 'none' } | { kind: 'team'; isCaptain: boolean; membership: Membership | null };

/**
 * Joining the team and who is on it. Writes reject with SyncFailure.
 * A watcher that loses access (for example, the phone was removed) reports `none` and stops.
 */
export interface AccessRepository {
  watchAccess(uid: string, onChange: (access: TeamAccess) => void): () => void;
  /** Which phone has claimed each dancer: dancer id → user id. */
  watchClaims(onChange: (claims: Record<string, string>) => void): () => void;
  /** The current join code. Captains only. */
  watchJoinCode(onChange: (code: string | null) => void): () => void;

  /** Creates the team with this user as its only captain and member. */
  createTeam(uid: string, name: string, joinCode: string): Promise<void>;
  /** Joins with the team's join code. */
  join(uid: string, joinCode: string, provider: SignInProvider): Promise<void>;
  /** Adds a captain's own membership; captains need no code. */
  joinAsCaptain(uid: string): Promise<void>;
  /** Links this phone to a dancer, releasing the previous claim. Fails if someone else has them. */
  claimDancer(uid: string, dancerId: string, previousDancerId: string | null): Promise<void>;
  /** Records that this member now signs in with Google. */
  setProvider(uid: string, provider: SignInProvider): Promise<void>;
  /** Replaces the join code. Members who already joined stay; the old link stops working. */
  setJoinCode(joinCode: string): Promise<void>;
  /**
   * Frees a dancer's name so another phone can pick it (e.g. the same person on their Home Screen
   * app). Captains only.
   */
  releaseDancer(dancerId: string, holderUid: string): Promise<void>;
  /** Stores where to send this phone's notifications. */
  savePushToken(uid: string, token: string): Promise<void>;
}

/**
 * Whether this phone can get notifications while the app is closed:
 * - `unavailable`: this browser can't (or this is a test build).
 * - `install-first`: an iPhone or iPad; the app must be added to the Home Screen first.
 * - `off`: possible; not asked yet.
 * - `blocked`: the person said no; only the phone's settings can change that.
 * - `on`: allowed.
 */
export type PushStatus = 'unavailable' | 'install-first' | 'off' | 'blocked' | 'on';

/** Notifications that reach the phone while the app is closed. */
export interface PushNotifications {
  status(): PushStatus;
  /**
   * Asks to allow notifications if needed, and returns this phone's push token. Must start from
   * a tap. Rejects if refused or unsupported.
   */
  getToken(): Promise<string>;
}

export interface PreferencesStore {
  load(): Preferences;
  save(preferences: Preferences): void;
}

export interface Clock {
  now(): number;
}

/** Whether the phone has a network connection. */
export interface Connectivity {
  isOnline(): boolean;
  /** Calls `listener` whenever the connection comes or goes. Returns unsubscribe. */
  onChange(listener: (isOnline: boolean) => void): () => void;
}

/** Sound and vibration for alerts. Implementations fail silently where unsupported. */
export interface AlertOutput {
  chime(times: number): void;
  vibrate(pattern: readonly number[]): void;
}

export interface ScreenWakeLock {
  /** Keeps the screen on (and re-acquires it when the page is shown again). False if refused. */
  enable(): Promise<boolean>;
  disable(): Promise<void>;
}

/** Who this phone is signed in as. */
export interface AuthUser {
  uid: string;
  /** True for a phone that joined with the team link and hasn't signed in with Google. */
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
}

export type AuthErrorCode =
  /** The person closed the sign-in window. */
  | 'cancelled'
  /** That Google account is already used by another phone or person. */
  | 'account-in-use'
  | 'network'
  | 'unknown';

export class AuthFailure extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'AuthFailure';
  }
}

export interface AuthService {
  /** Calls `listener` with the current user (null when signed out), then on every change. */
  onUserChange(listener: (user: AuthUser | null) => void): () => void;
  /** Signs in with Google. Captains always use this. Rejects with AuthFailure. */
  signInWithGoogle(): Promise<void>;
  /** Signs this phone in without an account, for joining with the team link. */
  signInAnonymously(): Promise<AuthUser>;
  /** Turns this phone's anonymous sign-in into a Google account, keeping the same user id. */
  linkWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}
