'use strict';
// Boot: gate → load data → mount dashboard, calendar, tracker, content, TOC, service worker.

import { mountGate } from './gate.js';
import { renderContent } from './content.js';
import { mountPacking } from './packing.js';
import { mountBudget } from './budget.js';
import { mountPhrases } from './phrases.js';
import { mountCalendar, allEvents } from './calendar.js';
import { mountGoogleSync } from './google-sync.js';
import { mountGoingPage } from './going-page.js';
import { mountTracker } from './tracker.js';
import { mountDashboard } from './dashboard.js';
import { mountRooms } from './rooms.js';
import { mountMap } from './map.js';
import { mountPlan } from './plan.js';
import { mountEmergency } from './emergency.js';
import { mountPrint } from './print.js';
import { mountEventSearch } from './eventsearch.js';
import { mountLang } from './lang.js';
import { mountBackup } from './backup.js';
import { initRouter } from './router.js';
import { mountGestures } from './gestures.js';
import { mountPalette } from './palette.js';
import { mountGuide, applyHomeLayout } from './guide.js';
import { initKonami } from './konami.js';
import { mountEaster } from './easter.js';
import { stagger } from './motion.js';
import { nowISO } from './lib/dates.js';
import { $, $$, esc } from './lib/dom.js';
import { get, set, KEYS } from './lib/store.js';

// Clickjacking defense: a static host can't send X-Frame-Options and frame-ancestors is
// ignored in a <meta> CSP, so bust out of any (cross-origin) frame before rendering.
if (window.top !== window.self) {
  try { window.top.location = window.self.location; } catch { document.documentElement.style.display = 'none'; }
}

// surface localStorage quota errors (otherwise saves fail silently → data loss)
document.addEventListener('jwh:storage-full', () => {
  import('./lib/modal.js').then(m => m.alertModal('Could not save — this browser’s storage may be full. Back up your data, then clear old items.'));
});

mountGate(boot);

function boot() {
  applyHomeLayout();   // set <html data-home> before the dashboard paints (avoids a layout flash)
  fetch('data/tips.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('Failed to load tips.json'); return r.json(); })
    .then(data => {
      const today = nowISO();
      const m = data.meta || {};
      setText('#footGen', m.generated || '');
      seedOnce();                    // one-time: tick already-done items + drop a home base (before any mount reads them)
      mountCalendar(data, today);
      mountGoogleSync(() => allEvents());
      mountGoingPage();              // dedicated "Going To" page (#/going) — events marked ✓ Going
      mountTracker(data);
      renderContent(data, today);
      mountPacking(data);            // packing page (#/packing) — categorized super-checklist
      mountBudget(data);             // budget planner (#/budget) — one-time + monthly cost estimate
      mountPhrases(data);            // phrasebook (#/phrases) — curated survival-Japanese phrases
      mountDashboard(data, today);   // reads calendar + content, so mount last
      mountRooms(data);              // share-room finder (#/rooms)
      mountMap(data);                // map page (#/map)
      mountPlan(data);               // day itinerary planner (#/plan)
      mountEmergency(data);          // emergency quick-reference (#/emergency) — read-only, offline
      mountPrint(data, today);       // 🖨 one-page printable trip summary (footer button)
      mountEventSearch(data);        // search all events on the calendar page
      mountLang();                   // EN/日本語 chrome toggle + hover-dictionary
      mountBackup();                 // export/import all device-local trip data
      initRouter();                  // hash-router SPA: split views, animated transitions
      mountGestures();               // swipe between pages, keyboard shortcuts, long-press menus
      mountPalette(data);            // ⌘K / "/" command palette — jump to any route or content
      mountGuide();                  // ⚙ Guide & Settings overlay (tutorial + theme/arcade/reduce-motion toggles)
      initKonami();                  // ↑↑↓↓←→←→ b a → arcade mode
      mountEaster();                 // hidden interactions + seasonal/2am eggs + mini-synth + console art
      stagger($$('.hero > *'), { y: 14, step: 60 });   // signature hero entrance, once
    })
    .catch(err => {
      const d = $('#domains');
      if (d) d.innerHTML = `<div class="empty">Could not load data (${esc(err.message)}). If local, serve over HTTP: <code>python3 -m http.server</code>.</div>`;
    });
  registerSW();
}

function setText(sel, txt) { const el = $(sel); if (el) el.textContent = txt; }

// One-time seed (guarded by jwh-seed-v1): tick the items the owner has already completed
// (visa granted, passport ready, first accommodation booked, NCD permit in hand) and drop a
// Sakura House home base. Additive only — never un-checks, never overrides an existing home.
// Runs BEFORE any feature mounts so the checklist's first render shows the ticks (the hash
// router won't re-render it later) and the map/dashboard read the seeded place.
function seedOnce() {
  if (get(KEYS.seed, false)) return;
  const SEED_DONE = ['chk-confirm-whv-eligibility-age-1', 'chk-gather-visa-documents-passpor', 'chk-show-proof-of-funds-in-your-ac', 'chk-book-consulate-appointment-and', 'chk-check-passport-validity-blan', 'chk-lock-the-proof-of-funds-figure-2', 'chk-reserve-a-furnished-share-hous', 'chk-book-first-week-accommodation-2', 'chk-line-up-a-no-key-money-share-h-2', 'chk-adhd-ncd-permit'];
  const checks = get(KEYS.checklist, {}) || {};
  SEED_DONE.forEach(id => { checks[id] = true; });   // additive — only sets true, never un-checks
  set(KEYS.checklist, checks);
  const places = get(KEYS.places, []) || [];
  if (!places.some(p => p.id === 'p-sakura-house-makoto')) {
    const hasHome = places.some(p => p.home);        // respect the single-home invariant
    places.push({ id: 'p-sakura-house-makoto', name: 'Makoto Guesthouse', address: '2-3-9 Towa, Adachi-ku, Tokyo (Booking.com)', area: 'Ayase', lat: 35.7684, lng: 139.8264, category: 'personal', source: 'seed', coordKind: 'approx', fav: false, locked: false, visited: false, emoji: '', home: !hasHome });
    set(KEYS.places, places);
  }
  set(KEYS.seed, true);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // auto-reload once when a new SW takes control, so users never get stuck on a stale build
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return; reloaded = true; location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
