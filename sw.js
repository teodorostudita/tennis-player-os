// Tennis Player OS — service worker v1.0.19
// Keep application code network-fresh. The cache is used only for the offline navigation fallback.
const CACHE_NAME = 'tpos-pwa-v1.0.19';
const OFFLINE_URL = './offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
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

    // If this replaces an older TPOS worker, reload open clients once so
    // index.html and all ES modules come from the same release.
    if (previousCaches.length) {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      await Promise.all(clients.map(async (client) => {
        try {
          if ('navigate' in client) await client.navigate(client.url);
        } catch (_) {
          // A closed/background client may no longer be navigable.
        }
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

  // TPOS is a network application. Never allow an old HTTP-cache copy of
  // executable/style assets to be mixed with a newer shell.
  if (/\.(?:js|css|html)$/i.test(url.pathname) || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
