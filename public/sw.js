// Shows the heat sheet's push notifications (sent by functions/src/index.ts), and opens the app
// when one is tapped. Kept free of any library so it works the same on every browser.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message;
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  // Firebase Cloud Messaging delivers `{ data: {...} }`; accept `notification` too.
  const fields = { ...(message.notification || {}), ...(message.data || {}) };
  const isUpNext = fields.type === 'up-next';

  // Every push must show a notification, or iPhones stop delivering them.
  event.waitUntil(
    self.registration.showNotification(fields.title || 'Heat Sheet', {
      body: fields.body || '',
      tag: fields.tag ? `${fields.tag}:${fields.type || ''}` : undefined,
      renotify: Boolean(fields.tag),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: isUpNext ? [400, 120, 400, 120, 400] : [300, 120, 300, 120, 300],
      requireInteraction: isUpNext,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) return open.focus();
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
