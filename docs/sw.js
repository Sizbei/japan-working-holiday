'use strict';
// Offline service worker — network-first so data/code updates always land when online,
// with a cached fallback so the whole planner still works at Narita / the ward office.

const CACHE = 'jwh-v110';
const ASSETS = [
  './', 'index.html', 'data/tips.json', 'manifest.webmanifest', 'icon.svg',
  'assets/style.css', 'assets/main.js', 'assets/content.js', 'assets/checklist-page.js', 'assets/calendar.js',
  'assets/dashboard.js', 'assets/collapse.js', 'assets/celebrate.js', 'assets/packing.js', 'assets/budget.js', 'assets/phrases.js', 'assets/tracker.js', 'assets/gate.js', 'assets/router.js', 'assets/motion.js', 'assets/dnd.js', 'assets/konami.js', 'assets/rooms.js', 'assets/map.js', 'assets/plan.js', 'assets/eventsearch.js', 'assets/lang.js', 'assets/i18n.js', 'assets/backup.js', 'assets/gestures.js', 'assets/guide.js', 'assets/easter.js', 'assets/going-page.js', 'assets/palette.js', 'assets/emergency.js', 'assets/print.js', 'assets/cardtranslate.js', 'assets/datepicker.js',
  'assets/lib/dom.js', 'assets/lib/store.js', 'assets/lib/rooms.js', 'assets/lib/dates.js', 'assets/lib/homelayout.js', 'assets/lib/packing.js', 'assets/lib/budget.js',
  'assets/lib/notify.js', 'assets/lib/ics.js', 'assets/lib/places.js', 'assets/lib/geo.js', 'assets/lib/transit.js', 'assets/lib/dayplan.js', 'assets/lib/modal.js', 'assets/lib/going.js', 'assets/lib/directions.js', 'assets/lib/audio.js', 'assets/lib/placestats.js', 'assets/lib/menu.js', 'assets/lib/calevents.js', 'assets/lib/placesearch.js', 'assets/lib/palette.js', 'assets/lib/checklist.js', 'assets/lib/listctl.js', 'assets/lib/readiness.js', 'assets/lib/anki.js', 'assets/lib/ankiconnect.js', 'assets/lib/translate.js', 'assets/lib/userphrases.js', 'assets/lib/translatecache.js', 'assets/lib/priority.js', 'assets/lib/smartviews.js', 'assets/lib/weekgrid.js', 'assets/lib/minical.js', 'assets/lib/tags.js',
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
    // cache:'reload' bypasses the BROWSER http-cache so network-first truly hits the network —
    // otherwise a deploy can be shadowed by the browser's own cached copy (GH Pages sends
    // max-age on assets), and "updates always land when online" silently fails. The SW's own
    // CACHE (updated below) remains the offline fallback.
    fetch(e.request, { cache: 'reload' })
      .then(resp => {
        // only cache a clean 200 — never poison the offline cache with a 4xx/5xx/redirect/partial
        if (resp && resp.ok && resp.status === 200 && resp.type !== 'opaque') {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});   // .put rejects on 206 — swallow
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match('index.html')))
  );
});
