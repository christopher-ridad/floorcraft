/**
 * Interfaces the app layer needs from the outside world. src/infra implements them; tests use
 * in-memory fakes.
 */
import type { Couple, LiveState, ScheduleItem } from '../domain/types';
import type { Preferences } from './preferences';

/** The three shared documents every phone reads and writes. */
export interface CompetitionDocuments {
  schedule: ScheduleItem[];
  entries: Couple[];
  live: LiveState;
}
export type DocumentName = keyof CompetitionDocuments;

/** `connecting` until a backend is chosen; `local` keeps data on this phone only. */
export type SyncMode = 'connecting' | 'shared' | 'local';

export type SyncErrorCode =
  /** The viewer can read but not write the shared sheet. */
  | 'read-only'
  | 'quota-exceeded'
  /** The shared database can't be used here; fall back to this phone only. */
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

export interface CompetitionSync {
  readonly mode: 'shared' | 'local';
  /** Calls `onChange` with the current value, then again on every change. Returns unsubscribe. */
  subscribe<Name extends DocumentName>(
    name: Name,
    onChange: (value: CompetitionDocuments[Name]) => void,
    onError: (code: SyncErrorCode) => void,
  ): () => void;
  /** Saves a document. Saves to the same document happen in order. Rejects with SyncFailure. */
  save<Name extends DocumentName>(name: Name, value: CompetitionDocuments[Name]): Promise<void>;
}

export interface SyncConnector {
  /** The team's shared backend, or null when it isn't available here. */
  connectShared(): Promise<CompetitionSync | null>;
  /** This-phone-only storage. */
  createLocal(): CompetitionSync;
}

export interface PreferencesStore {
  load(): Preferences;
  save(preferences: Preferences): void;
}

export interface Clock {
  now(): number;
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
