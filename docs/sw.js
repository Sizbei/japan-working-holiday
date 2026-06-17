'use strict';
// Offline service worker — network-first so data/code updates always land when online,
// with a cached fallback so the whole planner still works at Narita / the ward office.

const CACHE = 'jwh-v29';
const ASSETS = [
  './', 'index.html', 'data/tips.json', 'manifest.webmanifest', 'icon.svg',
  'assets/style.css', 'assets/main.js', 'assets/content.js', 'assets/calendar.js',
  'assets/dashboard.js', 'assets/tracker.js', 'assets/gate.js', 'assets/router.js', 'assets/motion.js', 'assets/dnd.js', 'assets/dashboard-mytokyo.js', 'assets/konami.js', 'assets/rooms.js', 'assets/map.js', 'assets/plan.js', 'assets/eventsearch.js', 'assets/lang.js', 'assets/backup.js',
  'assets/lib/dom.js', 'assets/lib/store.js', 'assets/lib/dates.js',
  'assets/lib/notify.js', 'assets/lib/ics.js', 'assets/lib/places.js', 'assets/lib/geo.js', 'assets/lib/transit.js', 'assets/lib/dayplan.js', 'assets/lib/modal.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(resp => { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return resp; })
      .catch(() => caches.match(e.request).then(c => c || caches.match('index.html')))
  );
});
