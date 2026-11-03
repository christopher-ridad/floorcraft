import type { Connectivity } from '../../app/ports';

/** The browser's own view of the connection (navigator.onLine and online/offline events). */
export function browserConnectivity(): Connectivity {
  return {
    isOnline: () => navigator.onLine,
    onChange(listener) {
      const online = () => listener(true);
      const offline = () => listener(false);
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      return () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      };
    },
  };
}
