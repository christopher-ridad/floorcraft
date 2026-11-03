import type { ScreenWakeLock } from '../../app/ports';

/**
 * The Screen Wake Lock API. The browser drops the lock whenever the page is hidden, so it is
 * requested again each time the page becomes visible while enabled.
 */
export function screenWakeLock(): ScreenWakeLock {
  let sentinel: WakeLockSentinel | null = null;
  let enabled = false;

  async function request(): Promise<boolean> {
    try {
      sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (enabled && document.visibilityState === 'visible') void request();
  });

  return {
    async enable() {
      enabled = true;
      const granted = await request();
      if (!granted) enabled = false;
      return granted;
    },
    async disable() {
      enabled = false;
      const current = sentinel;
      sentinel = null;
      await current?.release().catch(() => undefined);
    },
  };
}
