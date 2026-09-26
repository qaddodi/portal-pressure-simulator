// Offline support. Stamped files (…?v=<hash>) never change, so they are served from the cache
// first; everything else (the page itself, fonts, icons) is served from the network when there
// is one and from the cache when there isn't, so the simulator keeps working in an exam hall
// with poor Wi-Fi. Bump CACHE to drop old entries.
const CACHE = 'pps-v3';
const SHELL = ['./', 'index.html', 'fonts/fonts.css', 'manifest.webmanifest', 'brand/mark.svg', 'brand/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const stamped = /[?&]v=[0-9a-f]{6,}/.test(req.url);
  if (stamped) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  // Revalidate with the server rather than trusting the HTTP cache, so an installed app picks up
  // a new release on its next launch.
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(fresh.then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
