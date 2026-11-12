import { effect, signal, type ReadonlySignal } from '@preact/signals-core';
import { alertKey, nextAlert, type Alert } from '../domain/alerts';
import type { Competition } from '../domain/competition';
import type { NoticeChannel } from './notices';
import { minutesSinceMidnight } from '../domain/clock';
import type { AlertOutput, Clock } from './ports';
import type { Preferences } from './preferences';

const ALERT_SIGNALS: Record<Alert['type'], { chimes: number; vibration: number[] }> = {
  'on-deck': { chimes: 2, vibration: [300, 120, 300, 120, 300] },
  'up-next': { chimes: 3, vibration: [400, 120, 400, 120, 400] },
};
/** How often to check the time, since a heat can come within 15 minutes with no floor change. */
const RECHECK_MS = 30_000;
const TEST_SIGNAL = { chimes: 2, vibration: [300, 120, 300] };

interface AlertWatcherOptions {
  competition: ReadonlySignal<Competition>;
  preferences: ReadonlySignal<Preferences>;
  output: AlertOutput;
  notices: NoticeChannel;
  clock: Clock;
}

export interface AlertWatcher {
  /** Lets alerts already given fire again, e.g. after live tracking is cleared. */
  forgetGiven(): void;
  /** Plays the on-deck sound, as a test. */
  playTest(): void;
  dispose(): void;
}

/**
 * Gives each alert once, checking whenever the floor or the preferences change and every 30
 * seconds. Changing who this phone alerts for starts over.
 */
export function watchAlerts({
  competition,
  preferences,
  output,
  notices,
  clock,
}: AlertWatcherOptions): AlertWatcher {
  const given = new Set<string>();
  const tick = signal(0);
  const timer = setInterval(() => tick.value++, RECHECK_MS);
  let lastTarget = '';

  const play = (signal: { chimes: number; vibration: number[] }) => {
    const { chime, vibrate } = preferences.peek();
    if (chime) output.chime(signal.chimes);
    if (vibrate) output.vibrate(signal.vibration);
  };

  const stopWatching = effect(() => {
    void tick.value;
    const { dancer } = preferences.value;
    if (dancer !== lastTarget) {
      given.clear();
      lastTarget = dancer;
    }
    const alert = nextAlert(
      competition.value,
      { dancer, nowMinutes: minutesSinceMidnight(new Date(clock.now())) },
      given,
    );
    if (!alert) return;
    given.add(alertKey(alert));
    play(ALERT_SIGNALS[alert.type]);
    notices.publish({ kind: 'alert', alert });
  });

  return {
    forgetGiven: () => given.clear(),
    playTest: () => play(TEST_SIGNAL),
    dispose() {
      clearInterval(timer);
      stopWatching();
    },
  };
}
