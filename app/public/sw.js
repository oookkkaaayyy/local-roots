function notificationTarget(rawUrl) {
  const fallback = new URL('/admin/dyed-and-unattached', self.location.origin);
  try {
    const target = new URL(rawUrl || fallback.pathname, self.location.origin);
    return target.origin === self.location.origin ? target.href : fallback.href;
  } catch {
    return fallback.href;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Dyed & Unattached';
  const options = {
    body: payload.body || 'A new stencil request is ready for review.',
    tag: payload.tag || 'du-submission',
    renotify: true,
    icon: '/brand/local-roots-lr.svg',
    badge: '/brand/local-roots-lr.svg',
    data: {
      url: notificationTarget(payload.url),
    },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if ('setAppBadge' in self.navigator) {
      try {
        await self.navigator.setAppBadge(Number(payload.badge || 1));
      } catch {
        // Badging is supplemental; notification delivery must not depend on it.
      }
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = notificationTarget(event.notification.data?.url);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (!client.url.startsWith(self.location.origin)) continue;
      if ('navigate' in client) await client.navigate(targetUrl);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
