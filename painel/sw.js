'use strict';
const CACHE = 'gavioes-shell-v4';
const CORE = ['/painel/', '/painel/index.html', '/painel/manifest.webmanifest', '/painel/offline.html', '/painel/icons/app-192.png', '/painel/icons/app-512.png', '/painel/icons/app-maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/manus-storage/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, {cache: 'no-store'}).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put('/painel/index.html', response.clone()));
      return response;
    }).catch(async () => (await caches.match('/painel/index.html')) || (await caches.match('/painel/offline.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok && response.type === 'basic') caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    });
    return cached || network;
  }));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : '' }; }
  const title = String(payload.title || 'Painel Gaviões').slice(0, 80);
  const options = {
    body: String(payload.body || 'Há uma atualização no painel.').slice(0, 180),
    icon: '/painel/icons/app-192.png',
    badge: '/painel/icons/app-192.png',
    tag: String(payload.tag || payload.eventId || 'gavioes-update').slice(0, 100),
    renotify: Boolean(payload.renotify),
    data: { url: typeof payload.url === 'string' ? payload.url : '/painel/#matriculas' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  let target = new URL('/painel/', self.location.origin);
  try { const candidate = new URL(raw || '/painel/', self.location.origin); if (candidate.origin === self.location.origin) target = candidate; } catch {}
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (new URL(client.url).origin === self.location.origin) return client.navigate(target.href).then(() => client.focus());
    }
    return self.clients.openWindow(target.href);
  }));
});
