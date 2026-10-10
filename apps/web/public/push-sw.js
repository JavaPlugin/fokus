// Push-Mitteilungen (eingebunden in den Workbox-Service-Worker per importScripts).
self.addEventListener('push', (event) => {
  let msg = { title: 'FOKUS', body: '', url: '/' };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    /* leere oder ungültige Nachricht: Standardtext */
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icons/icon-180.png',
      badge: '/icons/icon-180.png',
      data: { url: msg.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
