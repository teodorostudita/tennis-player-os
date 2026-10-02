// Tennis Player OS — service worker v1.2.2
// Application assets are network-fresh. Cache is only an offline navigation fallback.
const CACHE_NAME = 'tpos-pwa-v1.2.2';
const OFFLINE_URL = './offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const previousCaches = keys.filter(
      (key) => key.startsWith('tpos-pwa-') && key !== CACHE_NAME
    );

    await Promise.all(previousCaches.map((key) => caches.delete(key)));
    await self.clients.claim();

    if (previousCaches.length) {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      await Promise.all(clients.map(async (client) => {
        try {
          if ('navigate' in client) await client.navigate(client.url);
        } catch (_) {}
      }));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (
    /\.(?:js|css|html)$/i.test(url.pathname)
    || url.pathname.endsWith('/manifest.webmanifest')
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
