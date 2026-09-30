const CACHE_NAME = __CACHE_NAME__;
const ASSETS = __PRECACHE__;
const SHELL = new Set(ASSETS);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  // Do not replace a worker under a running lesson. The new version activates
  // after all pages using the previous one have closed.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('free-impro-shell-') && name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const isPage = request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html');
  const key = isPage ? '/index.html' : url.pathname;
  if (!SHELL.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(key) || fetch(request);
  })());
});
