import { computed, signal, type ReadonlySignal } from '@preact/signals-core';
import type { Competition } from '../domain/competition';
import { purdueCompetition } from '../domain/purdue';
import type { Preferences } from './preferences';

/** How often "now" moves along the schedule. */
const TICK_MS = 30_000;

export interface PreferencesStore {
  load(): Preferences;
  save(preferences: Preferences): void;
}

export interface Clock {
  now(): number;
}

export interface AppDependencies {
  preferences: PreferencesStore;
  clock: Clock;
}

export interface AppStore {
  /** The schedule and the team's heats, with "now" placed by the clock. */
  competition: ReadonlySignal<Competition>;
  preferences: ReadonlySignal<Preferences>;
  updatePreferences(change: Partial<Preferences>): void;
  /** Catches "now" up with the clock, e.g. when the page is shown again. */
  refresh(): void;
  /** Starts following the clock. Returns a function that stops it. */
  start(): () => void;
}

export function createAppStore(deps: AppDependencies): AppStore {
  const now = signal(deps.clock.now());
  const preferences = signal(deps.preferences.load());
  const competition = computed(() => purdueCompetition(now.value));

  return {
    competition,
    preferences,

    updatePreferences(change) {
      const next = { ...preferences.peek(), ...change };
      preferences.value = next;
      deps.preferences.save(next);
    },

    refresh() {
      now.value = deps.clock.now();
    },

    start() {
      const timer = setInterval(() => (now.value = deps.clock.now()), TICK_MS);
      return () => clearInterval(timer);
    },
  };
}
