// Tennis Player OS — service worker v1.3.9
// Navigations are network-fresh (offline.html as fallback). In production every
// JS/CSS URL carries ?v=APP_VERSION (rewritten by the GitHub Action), so a
// versioned asset never changes: it is served cache-first and downloaded only
// once per release. Unversioned assets and local development stay network-fresh.
const CACHE_NAME = 'tpos-pwa-v1.3.9';
const ASSET_CACHE = 'tpos-assets';
const OFFLINE_URL = './offline.html';
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname)
  || self.location.hostname.endsWith('.localhost')
  || self.location.hostname.endsWith('.test');

let prunedForVersion = '';

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

// Drop assets of older releases once a new version is first requested.
async function pruneOtherVersions(version) {
  if (prunedForVersion === version) return;
  prunedForVersion = version;
  const cache = await caches.open(ASSET_CACHE);
  const requests = await cache.keys();
  await Promise.all(requests
    .filter((request) => new URL(request.url).searchParams.get('v') !== version)
    .map((request) => cache.delete(request)));
}

async function versionedAsset(request, version) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request, { cache: 'no-store' });
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    pruneOtherVersions(version).catch(() => {});
  }
  return response;
}

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
    const version = url.searchParams.get('v');
    if (version && !IS_LOCAL && /\.(?:js|css)$/i.test(url.pathname)) {
      event.respondWith(
        versionedAsset(request, version)
          .catch(() => fetch(request, { cache: 'no-store' }))
      );
      return;
    }
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
