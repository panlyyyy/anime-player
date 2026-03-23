const CACHE = 'panlyyy-shell-v20260323-3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/search.html',
  '/ongoing.html',
  '/favorites.html',
  '/history.html',
  '/manifest.json?v=20260323-3',
  '/css/style.css?v=20260323-3',
  '/css/nimestream.css?v=20260323-3',
  '/js/layout-shell.js?v=20260323-3',
  '/js/api.js?v=20260323-3',
  '/js/storage.js?v=20260323-3',
  '/js/ui.js?v=20260323-3',
  '/js/player-overlay.js?v=20260323-3',
  '/js/home.js?v=20260323-3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) return;

  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  const isStaticAsset = ['style', 'script', 'image', 'font'].includes(request.destination);

  if (!isDocument && !isStaticAsset) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (isDocument) {
        return caches.match('/index.html');
      }
      throw error;
    }
  })());
});
