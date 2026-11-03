import { computed, effect, signal, type ReadonlySignal } from '@preact/signals-core';
import { deriveCompetition, type Competition } from '../domain/competition';
import { resolveCouples } from '../domain/team';
import {
  randomId,
  type CompetitionInfo,
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
  type CompetitionSnapshot,
  type HeatSheetRepository,
  type PreferencesStore,
  type ScreenWakeLock,
  type SyncErrorCode,
  type SyncMode,
  type TeamSnapshot,
} from './ports';
import type { Preferences } from './preferences';

export const EMPTY_TEAM: TeamSnapshot = {
  team: null,
  dancers: [],
  partnerships: [],
  competitions: [],
};
export const EMPTY_COMPETITION: CompetitionSnapshot = {
  schedule: { items: [], events: [] },
  entries: {},
  floor: { currentItemId: null, currentSetAt: null },
  callbacks: {},
};

export interface AppDependencies {
  repository: HeatSheetRepository;
  preferences: PreferencesStore;
  clock: Clock;
  alertOutput: AlertOutput;
  wakeLock: ScreenWakeLock;
  createId?: IdFactory;
}

export interface LoadedData {
  team: boolean;
  /** The active competition's data has arrived. */
  competition: boolean;
}

export interface AppStore {
  team: ReadonlySignal<TeamSnapshot>;
  /** The competition everyone sees, or null before one is set up. */
  activeCompetition: ReadonlySignal<CompetitionInfo | null>;
  competitionData: ReadonlySignal<CompetitionSnapshot>;
  schedule: ReadonlySignal<ScheduleItem[]>;
  couples: ReadonlySignal<Couple[]>;
  live: ReadonlySignal<LiveState>;
  loaded: ReadonlySignal<LoadedData>;
  syncMode: ReadonlySignal<SyncMode>;
  /** Why the team's data can't be read or written, if it can't. */
  syncError: ReadonlySignal<SyncErrorCode | null>;
  preferences: ReadonlySignal<Preferences>;
  /** Everything derived for the active competition. Recomputed only when its inputs change. */
  competition: ReadonlySignal<Competition>;
  actions: Actions;
  onNotice(listener: NoticeListener): () => void;
  /** Starts watching the team's data, alerts and keep-awake. */
  start(): void;
  dispose(): void;
}

export function createAppStore(deps: AppDependencies): AppStore {
  const { repository } = deps;
  const team = signal<TeamSnapshot>(EMPTY_TEAM);
  const competitionData = signal<CompetitionSnapshot>(EMPTY_COMPETITION);
  const loaded = signal<LoadedData>({ team: false, competition: false });
  const syncMode = signal<SyncMode>('connecting');
  const syncError = signal<SyncErrorCode | null>(null);
  const preferences = signal<Preferences>(deps.preferences.load());
  const notices = new NoticeChannel();

  const activeCompetitionId = computed(() => team.value.team?.activeCompetitionId ?? null);
  const activeCompetition = computed(
    () => team.value.competitions.find((info) => info.id === activeCompetitionId.value) ?? null,
  );
  const couples = computed(() => resolveCouples(team.value.dancers, team.value.partnerships));
  const live = computed<LiveState>(() => ({
    ...competitionData.value.floor,
    callbacks: competitionData.value.callbacks,
  }));
  const schedule = computed(() => competitionData.value.schedule.items);
  const competition = computed(() =>
    deriveCompetition({
      schedule: schedule.value,
      events: competitionData.value.schedule.events,
      couples: couples.value,
      entries: competitionData.value.entries,
      live: live.value,
    }),
  );

  /** Reports a failed save. The change itself shows (or not) through the watchers. */
  function save(write: Promise<void>) {
    write.catch((error: unknown) => {
      notices.publish({
        kind: 'save-failed',
        code: error instanceof SyncFailure ? error.code : 'network',
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  }

  let alertWatcher: AlertWatcher | null = null;
  const stops: (() => void)[] = [];

  function watchTeam() {
    return repository.watchTeam(
      (snapshot) => {
        team.value = snapshot;
        syncMode.value = repository.isShared ? 'shared' : 'local';
        syncError.value = null;
        if (!loaded.peek().team) loaded.value = { ...loaded.peek(), team: true };
      },
      (code) => (syncError.value = code),
    );
  }

  /** Follows whichever competition is active. */
  function watchActiveCompetition() {
    return effect(() => {
      const competitionId = activeCompetitionId.value;
      competitionData.value = EMPTY_COMPETITION;
      loaded.value = { ...loaded.peek(), competition: false };
      if (!competitionId) return;
      return repository.watchCompetition(
        competitionId,
        (snapshot) => {
          competitionData.value = snapshot;
          if (!loaded.peek().competition) loaded.value = { ...loaded.peek(), competition: true };
        },
        (code) => (syncError.value = code),
      );
    });
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
    repository,
    team,
    competitionData,
    activeCompetition,
    competition,
    preferences,
    save,
    clock: deps.clock,
    createId: deps.createId ?? randomId,
    savePreferences: (value) => deps.preferences.save(value),
    forgetGivenAlerts: () => alertWatcher?.forgetGiven(),
    playTestAlert: () => alertWatcher?.playTest(),
  });

  return {
    team,
    activeCompetition,
    competitionData,
    schedule,
    couples,
    live,
    loaded,
    syncMode,
    syncError,
    preferences,
    competition,
    actions,
    onNotice: (listener) => notices.subscribe(listener),

    start() {
      alertWatcher = watchAlerts({ competition, preferences, output: deps.alertOutput, notices });
      stops.push(
        () => alertWatcher?.dispose(),
        watchWakeLock(),
        watchTeam(),
        watchActiveCompetition(),
      );
    },

    dispose() {
      while (stops.length) stops.pop()?.();
    },
  };
}
