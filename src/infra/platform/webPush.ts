import type { FirebaseApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';
import type { PushNotifications, PushStatus } from '../../app/ports';

/** The service worker that shows notifications (public/sw.js), next to the page. */
const SERVICE_WORKER = './sw.js';

const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac with a touch screen.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Opened from the Home Screen rather than in a browser tab. */
const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Web push through Firebase Cloud Messaging. On iPhone and iPad it only works once the app is
 * on the Home Screen (iOS 16.4 and later); elsewhere, in any current browser.
 */
export function webPush(app: FirebaseApp, { enabled = true } = {}): PushNotifications {
  const status = (): PushStatus => {
    if (!enabled || !('serviceWorker' in navigator)) return 'unavailable';
    if (isAppleMobile() && !isInstalled()) return 'install-first';
    if (!('PushManager' in window) || !('Notification' in window)) return 'unavailable';
    if (Notification.permission === 'granted') return 'on';
    return Notification.permission === 'denied' ? 'blocked' : 'off';
  };

  return {
    status,
    async getToken() {
      // First, while the tap still counts: iPhones only ask from a tap.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications were not allowed.');
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER, { scope: './' });
      await navigator.serviceWorker.ready;
      return getToken(getMessaging(app), { serviceWorkerRegistration: registration });
    },
  };
}
