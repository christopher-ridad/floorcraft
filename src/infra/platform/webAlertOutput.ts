import type { AlertOutput } from '../../app/ports';

/** Two rising notes (G5, C6). */
const CHIME_NOTES_HZ = [784, 1047];
const NOTE_GAP_S = 0.16;
const CHIME_GAP_S = 0.55;
const NOTE_LENGTH_S = 0.4;
const PEAK_GAIN = 0.25;

type AudioContextClass = typeof AudioContext;

export interface WebAlertOutput extends AlertOutput {
  /**
   * Browsers only allow sound after the user interacts with the page. Call this from any tap
   * so later alerts can play.
   */
  unlock(): void;
}

/** Chimes with Web Audio and vibrates with the Vibration API (Android). */
export function webAlertOutput(): WebAlertOutput {
  let audio: AudioContext | null = null;

  const audioContext = () => {
    const Context =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    audio ??= Context ? new Context() : null;
    if (audio?.state === 'suspended') void audio.resume();
    return audio;
  };

  function playNote(context: AudioContext, frequency: number, start: number) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_LENGTH_S);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + NOTE_LENGTH_S + 0.05);
  }

  return {
    chime(times) {
      try {
        const context = audioContext();
        if (!context) return;
        for (let chime = 0; chime < times; chime++) {
          CHIME_NOTES_HZ.forEach((frequency, note) =>
            playNote(
              context,
              frequency,
              context.currentTime + chime * CHIME_GAP_S + note * NOTE_GAP_S,
            ),
          );
        }
      } catch {
        // No sound available.
      }
    },

    vibrate(pattern) {
      try {
        globalThis.navigator?.vibrate?.([...pattern]);
      } catch {
        // No vibration available.
      }
    },

    unlock() {
      if (audio?.state === 'suspended') void audio.resume();
    },
  };
}
