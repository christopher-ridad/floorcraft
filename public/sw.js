/**
 * Service worker: lets the installed app open offline and shows push notifications.
 *
 * The app page is fetched from the network whenever there is one, so phones with signal always
 * get the latest version; the saved copy is only used offline. The build stamps VERSION with a
 * hash of the page, which makes every release a new service worker the app can offer to reload
 * into.
 */
const VERSION = '__BUILD_VERSION__';
const CACHE = `heat-sheet-${VERSION}`;
const APP_SHELL = [
  './',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// The app asks a waiting new version to take over when the person taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data === 'activate-update') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Newest page when online; the saved one offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./').then((saved) => saved ?? Response.error())),
    );
    return;
  }

  event.respondWith(caches.match(request).then((saved) => saved ?? fetch(request)));
});

/** Reads a push sent through Firebase Cloud Messaging: `{ data: { title, body, tag } }`. */
function readPush(event) {
  try {
    const payload = event.data ? event.data.json() : {};
    const message = payload.data ?? payload.notification ?? payload;
    return {
      title: message.title || 'Heat Sheet',
      body: message.body || '',
      tag: message.tag || undefined,
    };
  } catch {
    return { title: 'Heat Sheet', body: event.data ? event.data.text() : '', tag: undefined };
  }
}

self.addEventListener('push', (event) => {
  const { title, body, tag } = readPush(event);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // The app is open on screen: its own alert already chimed.
      if (windows.some((client) => client.visibilityState === 'visible')) return undefined;
      return self.registration.showNotification(title, {
        body,
        tag,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
