import { computed, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals-core';
import { deriveCompetition, type Competition } from '../domain/competition';
import {
  randomId,
  type Couple,
  type IdFactory,
  type LiveState,
  type ScheduleItem,
} from '../domain/types';
import { createActions, type Actions } from './actions';
import { watchAlerts, type AlertWatcher } from './alertWatcher';
import { NoticeChannel, type NoticeListener } from './notices';
import {
  SyncFailure,
  type AlertOutput,
  type Clock,
  type CompetitionDocuments,
  type CompetitionSync,
  type DocumentName,
  type PreferencesStore,
  type ScreenWakeLock,
  type SyncConnector,
  type SyncMode,
} from './ports';
import type { Preferences } from './preferences';

/** How long to wait for the shared backend before working on this phone only. */
const DEFAULT_CONNECT_TIMEOUT_MS = 11_000;
const DOCUMENT_NAMES: readonly DocumentName[] = ['schedule', 'entries', 'live'];

export const EMPTY_LIVE: LiveState = { currentItemId: null, currentSetAt: null, callbacks: {} };

export interface AppDependencies {
  sync: SyncConnector;
  preferences: PreferencesStore;
  clock: Clock;
  alertOutput: AlertOutput;
  wakeLock: ScreenWakeLock;
  createId?: IdFactory;
  connectTimeoutMs?: number;
}

export type LoadedDocuments = Readonly<Record<DocumentName, boolean>>;

export interface AppStore {
  schedule: ReadonlySignal<ScheduleItem[]>;
  couples: ReadonlySignal<Couple[]>;
  live: ReadonlySignal<LiveState>;
  /** Which documents have arrived from the backend at least once. */
  loaded: ReadonlySignal<LoadedDocuments>;
  syncMode: ReadonlySignal<SyncMode>;
  preferences: ReadonlySignal<Preferences>;
  /** Everything derived from the documents. Recomputed only when they change. */
  competition: ReadonlySignal<Competition>;
  actions: Actions;
  onNotice(listener: NoticeListener): () => void;
  /** Connects to the shared backend, falling back to this phone only. Starts alerts. */
  start(): Promise<void>;
  dispose(): void;
}

export function createAppStore(deps: AppDependencies): AppStore {
  const documents: { [Name in DocumentName]: Signal<CompetitionDocuments[Name]> } = {
    schedule: signal<ScheduleItem[]>([]),
    entries: signal<Couple[]>([]),
    live: signal<LiveState>(EMPTY_LIVE),
  };
  const loaded = signal<LoadedDocuments>({ schedule: false, entries: false, live: false });
  const syncMode = signal<SyncMode>('connecting');
  const preferences = signal<Preferences>(deps.preferences.load());
  const competition = computed(() =>
    deriveCompetition({
      schedule: documents.schedule.value,
      couples: documents.entries.value,
      live: documents.live.value,
    }),
  );
  const notices = new NoticeChannel();

  let sync: CompetitionSync | null = null;
  let unsubscribers: (() => void)[] = [];
  let alertWatcher: AlertWatcher | null = null;
  let stopWakeLock: (() => void) | null = null;

  /** Applies a change locally right away, then saves it if a backend is attached. */
  function commit<Name extends DocumentName>(name: Name, value: CompetitionDocuments[Name]) {
    documents[name].value = value;
    sync?.save(name, value).catch((error: unknown) => {
      notices.publish({
        kind: 'save-failed',
        code: error instanceof SyncFailure ? error.code : 'network',
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  }

  function attach(next: CompetitionSync) {
    for (const unsubscribe of unsubscribers) unsubscribe();
    sync = next;
    syncMode.value = next.mode;
    unsubscribers = DOCUMENT_NAMES.map((name) =>
      next.subscribe(
        name,
        (value) => {
          documents[name].value = value;
          if (!loaded.peek()[name]) loaded.value = { ...loaded.peek(), [name]: true };
        },
        (code) => {
          if (code === 'unavailable') fallBackToLocal();
        },
      ),
    );
  }

  function fallBackToLocal() {
    if (syncMode.peek() !== 'local') attach(deps.sync.createLocal());
  }

  function watchWakeLock() {
    return effect(() => {
      if (!preferences.value.keepScreenAwake) {
        void deps.wakeLock.disable();
        return;
      }
      void deps.wakeLock.enable().then((granted) => {
        if (granted) return;
        actions.updatePreferences({ keepScreenAwake: false });
        notices.publish({ kind: 'wake-lock-refused' });
      });
    });
  }

  const actions = createActions({
    documents,
    preferences,
    competition,
    commit,
    clock: deps.clock,
    createId: deps.createId ?? randomId,
    savePreferences: (value) => deps.preferences.save(value),
    forgetGivenAlerts: () => alertWatcher?.forgetGiven(),
    playTestAlert: () => alertWatcher?.playTest(),
  });

  return {
    schedule: documents.schedule,
    couples: documents.entries,
    live: documents.live,
    loaded,
    syncMode,
    preferences,
    competition,
    actions,
    onNotice: (listener) => notices.subscribe(listener),

    async start() {
      alertWatcher = watchAlerts({ competition, preferences, output: deps.alertOutput, notices });
      stopWakeLock = watchWakeLock();

      const timeout = setTimeout(
        fallBackToLocal,
        deps.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      );
      const shared = await deps.sync.connectShared().catch(() => null);
      clearTimeout(timeout);
      // A shared connection that arrives late still replaces this-phone-only mode.
      if (shared) attach(shared);
      else fallBackToLocal();
    },

    dispose() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
      alertWatcher?.dispose();
      stopWakeLock?.();
    },
  };
}
