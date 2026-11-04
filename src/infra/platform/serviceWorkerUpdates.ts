import type { AppUpdates } from '../../app/ports';

/**
 * Registers the service worker and reports when a new version is waiting. A version is
 * checked for whenever the app comes back to the foreground.
 */
export function serviceWorkerUpdates(scriptUrl = './sw.js'): AppUpdates {
  const listeners = new Set<() => void>();
  let registration: ServiceWorkerRegistration | null = null;
  let isReady = false;
  const announce = () => {
    isReady = true;
    listeners.forEach((listener) => listener());
  };

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .register(scriptUrl)
      .then((registered) => {
        registration = registered;
        // A new version only counts as an update if an older one is running this page.
        if (registered.waiting && navigator.serviceWorker.controller) announce();
        registered.addEventListener('updatefound', () => {
          const installing = registered.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) announce();
          });
        });
      })
      .catch(() => undefined);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        void registration?.update().catch(() => undefined);
    });
    let isReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isReloading) return;
      isReloading = true;
      location.reload();
    });
  }

  return {
    onReady(listener) {
      listeners.add(listener);
      if (isReady) listener();
      return () => listeners.delete(listener);
    },
    apply() {
      if (registration?.waiting) registration.waiting.postMessage('activate-update');
      else location.reload();
    },
  };
}

/** For development and tests: no service worker, no updates. */
export const noAppUpdates: AppUpdates = { onReady: () => () => {}, apply: () => {} };
