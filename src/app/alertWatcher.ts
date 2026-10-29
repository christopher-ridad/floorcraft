import { effect, type ReadonlySignal } from '@preact/signals-core';
import { alertKey, nextAlert, type Alert } from '../domain/alerts';
import type { Competition } from '../domain/competition';
import type { NoticeChannel } from './notices';
import type { AlertOutput } from './ports';
import type { Preferences } from './preferences';

const ALERT_SIGNALS: Record<Alert['type'], { chimes: number; vibration: number[] }> = {
  'heads-up': { chimes: 1, vibration: [250, 100, 250] },
  'on-deck': { chimes: 2, vibration: [300, 120, 300, 120, 300] },
};
const TEST_SIGNAL = { chimes: 2, vibration: [300, 120, 300] };

interface AlertWatcherOptions {
  competition: ReadonlySignal<Competition>;
  preferences: ReadonlySignal<Preferences>;
  output: AlertOutput;
  notices: NoticeChannel;
}

export interface AlertWatcher {
  /** Lets alerts already given fire again, e.g. after live tracking is cleared. */
  forgetGiven(): void;
  /** Plays the on-deck sound, as a test. */
  playTest(): void;
  dispose(): void;
}

/**
 * Gives each alert once, whenever the floor or the preferences change. Changing who this phone
 * alerts for, or how early, starts over.
 */
export function watchAlerts({
  competition,
  preferences,
  output,
  notices,
}: AlertWatcherOptions): AlertWatcher {
  const given = new Set<string>();
  let lastTarget = '';

  const play = (signal: { chimes: number; vibration: number[] }) => {
    const { chime, vibrate } = preferences.peek();
    if (chime) output.chime(signal.chimes);
    if (vibrate) output.vibrate(signal.vibration);
  };

  const dispose = effect(() => {
    const { dancer, alertThresholdHeats } = preferences.value;
    const target = `${dancer}|${alertThresholdHeats}`;
    if (target !== lastTarget) {
      given.clear();
      lastTarget = target;
    }
    const alert = nextAlert(
      competition.value,
      { dancer, thresholdHeats: alertThresholdHeats },
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
    dispose,
  };
}
