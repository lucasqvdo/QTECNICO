// Legacy cleanup worker. QTECNICO no longer uses a PWA service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
