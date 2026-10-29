import type {
  AlertOutput,
  CompetitionDocuments,
  CompetitionSync,
  DocumentName,
  PreferencesStore,
  ScreenWakeLock,
  SyncConnector,
  SyncErrorCode,
  SyncFailure,
} from '../../src/app/ports';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/app/preferences';

type Listener = (value: unknown) => void;
type ErrorListener = (code: SyncErrorCode) => void;

/** An in-memory backend. Tests push remote changes with `emit` and inspect `saved`. */
export class FakeSync implements CompetitionSync {
  readonly saved: [DocumentName, unknown][] = [];
  failSavesWith: SyncFailure | null = null;
  private readonly listeners = new Map<DocumentName, { change: Listener; error: ErrorListener }>();

  constructor(
    readonly mode: 'shared' | 'local',
    private readonly initial: Partial<CompetitionDocuments> = {},
  ) {}

  subscribe<Name extends DocumentName>(
    name: Name,
    onChange: (value: CompetitionDocuments[Name]) => void,
    onError: ErrorListener,
  ) {
    this.listeners.set(name, { change: onChange as Listener, error: onError });
    const value = this.initial[name];
    if (value !== undefined) onChange(value as CompetitionDocuments[Name]);
    return () => void this.listeners.delete(name);
  }

  async save<Name extends DocumentName>(name: Name, value: CompetitionDocuments[Name]) {
    if (this.failSavesWith) throw this.failSavesWith;
    this.saved.push([name, value]);
  }

  emit<Name extends DocumentName>(name: Name, value: CompetitionDocuments[Name]) {
    this.listeners.get(name)?.change(value);
  }

  emitError(name: DocumentName, code: SyncErrorCode) {
    this.listeners.get(name)?.error(code);
  }

  isListening(name: DocumentName) {
    return this.listeners.has(name);
  }
}

export function fakeConnector(shared: Promise<FakeSync | null>, local = new FakeSync('local')) {
  return {
    local,
    connector: {
      connectShared: () => shared,
      createLocal: () => local,
    } satisfies SyncConnector,
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
