'use strict';
// Boot: gate → load data → mount dashboard, calendar, tracker, content, TOC, service worker.

import { mountGate } from './gate.js';
import { renderContent } from './content.js';
import { mountPacking } from './packing.js';
import { mountBudget } from './budget.js';
import { mountPhraseDay } from './phraseday.js';
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
import { mountExpWeek } from './expweek.js';
import { mountLang } from './lang.js';
import { mountBackup } from './backup.js';
import { initRouter } from './router.js';
import { mountGestures } from './gestures.js';
import { mountPalette } from './palette.js';
import { mountGuide, applyHomeLayout } from './guide.js';
import { initKonami } from './konami.js';
import { mountEaster } from './easter.js';
import { stagger } from './motion.js';
import { mountAnim } from './anim.js';
import { mountCountUp } from './countup.js';
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
      // Each mount is isolated: one feature throwing must NOT blank the whole app — the router
      // still starts and every other page keeps working. Failures log to the console.
      const safe = (fn) => { try { fn(); } catch (err) { console.error('[boot]', err); } };
      safe(seedOnce);                      // one-time: tick already-done items + drop a home base (before any mount reads them)
      safe(seedNearby);                    // one-time: drop the near-base neighborhood pins (+ the festival venue)
      safe(fixHousingSeed);                // one-time: un-tick the wrongly-seeded long-term share-house items
      safe(seedDayPlanJul4);               // one-time: ready-made Plan-a-Day for the World DJ Festival (Jul 4)
      safe(() => mountCalendar(data, today));
      safe(() => mountGoogleSync(() => allEvents()));
      safe(() => mountGoingPage());        // dedicated "Going To" page (#/going) — events marked ✓ Going
      safe(() => mountTracker(data));
      safe(() => renderContent(data, today));
      safe(() => mountPacking(data));      // packing page (#/packing) — categorized super-checklist
      safe(() => mountBudget(data));       // budget planner (#/budget) — one-time + monthly cost estimate
      safe(() => mountPhraseDay(data));    // "phrase of the day" dashboard widget (deterministic by date) — stays eager
      // EF1: the 12 phrases-page modules (~76KB) lazy-load on first #/phrases entry —
      // they were parse+mount cost on EVERY boot for the least-visited route.
      let phrasesLoaded = false;
      const loadPhrases = () => {
        if (phrasesLoaded) return;
        phrasesLoaded = true;
        const view = document.getElementById('view-phrases');
        view?.setAttribute('aria-busy', 'true');   // dims + disables the static toolbar until the mounts land (see CSS)
        import('./phrasesboot.js').then(m => { m.mountPhrasesBundle(data); view?.removeAttribute('aria-busy'); })
          .catch(err => { phrasesLoaded = false; view?.removeAttribute('aria-busy'); console.error('[boot] phrases bundle', err); });
      };
      document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'phrases') loadPhrases(); });
      if (/^#\/?phrases$/.test(location.hash)) loadPhrases();   // direct load / reload on the page (exact match)
      safe(() => mountDashboard(data, today));   // reads calendar + content, so mount last
      safe(() => mountRooms(data));        // share-room finder (#/rooms)
      safe(() => mountMap(data));          // map page (#/map)
      safe(() => mountPlan(data));         // day itinerary planner (#/plan)
      safe(() => mountEmergency(data));    // emergency quick-reference (#/emergency) — read-only, offline
      safe(() => mountPrint(data, today)); // 🖨 one-page printable trip summary (footer button)
      safe(() => mountEventSearch(data));  // search all events on the calendar page
      safe(() => mountExpWeek());          // "This week" band on #/explore (display-only)
      safe(() => mountLang());             // EN/日本語 chrome toggle + hover-dictionary
      safe(() => mountBackup());           // export/import all device-local trip data
      initRouter();                        // hash-router SPA: split views, animated transitions (unwrapped — if THIS fails nothing works anyway)
      safe(() => mountAnim());             // first-visit route-view entrance cascade (reduce-motion gated)
      safe(() => mountCountUp());          // count-up the readiness score on first dashboard view (reduce-motion gated)
      safe(() => mountGestures());         // swipe between pages, keyboard shortcuts, long-press menus
      safe(() => mountPalette(data));      // ⌘K / "/" command palette — jump to any route or content
      safe(() => mountGuide());            // ⚙ Guide & Settings overlay (tutorial + theme/arcade/reduce-motion toggles)
      safe(() => initKonami());            // ↑↑↓↓←→←→ b a → arcade mode
      safe(() => mountEaster());           // hidden interactions + seasonal/2am eggs + mini-synth + console art
      safe(() => stagger($$('.hero > *'), { y: 14, step: 60 }));   // signature hero entrance, once
    })
    .catch(err => {
      // Data (or the router) failed: show the error where it's actually VISIBLE — the views are all
      // hidden until the router activates one, so writing into a view would show a blank page.
      bootError(`Could not load trip data (${err.message}). Check your connection and reload — if running locally, serve over HTTP: python3 -m http.server`);
      try { initRouter(); } catch { /* keep at least the visible error */ }
    });
  registerSW();
}

function setText(sel, txt) { const el = $(sel); if (el) el.textContent = txt; }

// Boot-failure banner: prepended to <main> (a direct child, OUTSIDE the router-hidden views)
// so it is visible even when no view ever activates.
function bootError(msg) {
  const host = $('#main') || document.body;
  const d = document.createElement('div');
  d.className = 'boot-error';
  d.setAttribute('role', 'alert');
  d.innerHTML = `<b>⚠ ${esc(msg)}</b>`;
  host.prepend(d);
}

// One-time seed (guarded by jwh-seed-v1): tick the items the owner has already completed
// (visa granted, passport ready, first accommodation booked, NCD permit in hand) and drop a
// Sakura House home base. Additive only — never un-checks, never overrides an existing home.
// Runs BEFORE any feature mounts so the checklist's first render shows the ticks (the hash
// router won't re-render it later) and the map/dashboard read the seeded place.
function seedOnce() {
  if (get(KEYS.seed, false)) return;
  // NOTE: the two LONG-TERM share-house items are NOT seeded — the owner booked only the temporary
  // Makoto Guesthouse; finding the long-term share house is still a live to-do (chk-lock-long-term-housing).
  const SEED_DONE = ['chk-confirm-whv-eligibility-age-1', 'chk-gather-visa-documents-passpor', 'chk-show-proof-of-funds-in-your-ac', 'chk-book-consulate-appointment-and', 'chk-check-passport-validity-blan', 'chk-lock-the-proof-of-funds-figure-2', 'chk-book-first-week-accommodation-2', 'chk-adhd-ncd-permit'];
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

// One-time seed (guarded by jwh-seed-nearby-v1): drop the near-base neighborhood pins + the
// World DJ Festival venue, so the map/day-planner can show travel from Makoto. Idempotent by id —
// only adds a pin that isn't already there; never marks any of them home. Runs once per device.
function seedNearby() {
  if (get(KEYS.seedNearby, false)) return;
  const NEARBY = [
    { id: 'p-kameari',   name: 'Kameari — KochiKame statues + Ario', area: 'Kameari',     lat: 35.7608, lng: 139.8487 },
    { id: 'p-shibamata', name: 'Shibamata — Taishakuten + Tora-san town', area: 'Shibamata', lat: 35.7596, lng: 139.8806 },
    { id: 'p-mizumoto',  name: 'Mizumoto Park', area: 'Mizumoto', lat: 35.7869, lng: 139.8689 },
    { id: 'p-tateishi',  name: 'Tateishi — Showa izakaya alley', area: 'Tateishi', lat: 35.7437, lng: 139.8470 },
    { id: 'p-kitasenju', name: 'Kita-Senju — food/izakaya hub', area: 'Kita-Senju', lat: 35.7497, lng: 139.8050 },
    { id: 'p-nishiarai', name: 'Nishiarai Daishi temple', area: 'Nishiarai', lat: 35.7766, lng: 139.7914 },
    { id: 'p-seaforest', name: 'World DJ Festival — Sea Forest Waterway (~2h)', area: 'Koto-ku (Tokyo Bay)', lat: 35.6047, lng: 139.8225 },
  ];
  const places = get(KEYS.places, []) || [];
  const have = new Set(places.map(p => p.id));
  let added = false;
  NEARBY.forEach(p => {
    if (have.has(p.id)) return;
    places.push({ id: p.id, name: p.name, address: '', area: p.area, lat: p.lat, lng: p.lng, category: 'personal', source: 'seed', coordKind: 'approx', fav: false, locked: false, visited: false, emoji: '', home: false });
    added = true;
  });
  if (added) set(KEYS.places, places);
  set(KEYS.seedNearby, true);
}

// One-time correction (jwh-fix-housing-v1): an earlier seed wrongly ticked the LONG-TERM share-house
// items as done. The owner only booked the temporary Makoto Guesthouse — the long-term share house is
// still a real to-do (chk-lock-long-term-housing). Un-tick those two once so the checklist reads true.
// (If the owner has genuinely found their long-term place, they can re-tick — runs only once.)
function fixHousingSeed() {
  if (get(KEYS.fixHousing, false)) return;
  const checks = get(KEYS.checklist, {}) || {};
  let changed = false;
  ['chk-reserve-a-furnished-share-hous', 'chk-line-up-a-no-key-money-share-h-2'].forEach(id => {
    if (checks[id]) { delete checks[id]; changed = true; }
  });
  if (changed) set(KEYS.checklist, checks);
  set(KEYS.fixHousing, true);
}

// One-time seed (jwh-seed-plan-v1): a ready-made Plan-a-Day for the World DJ Festival (Jul 4) so the
// #/plan timeline shows the door-to-door route from Makoto to Sea Forest Waterway with the ~2h buffer
// and the all-important return plan. Won't overwrite a plan the owner already made for that date.
function seedDayPlanJul4() {
  if (get(KEYS.seedPlan, false)) return;
  const DATE = '2026-07-04';
  const plans = get(KEYS.dayPlans, {}) || {};
  if (!plans[DATE]) {
    plans[DATE] = {
      date: DATE,
      title: 'World DJ Festival — Day 1 (Sea Forest Waterway)',
      note: 'Door-to-door ~2h from Makoto. Bring: ticket QR, cash, sunscreen, hat, portable charger, water. SORT YOUR RETURN before you go in — last trains from the bay are ~midnight.',
      stops: [
        { id: 's-jul4-depart', placeId: 'p-sakura-house-makoto', name: 'Depart — Makoto Guesthouse', lat: 35.7684, lng: 139.8264, coordKind: 'approx', area: 'Ayase', startTime: '13:00', durationMin: 0, note: 'Eat first; leave by ~1pm to comfortably catch an afternoon set.', locked: false },
        { id: 's-jul4-transit', placeId: '', name: 'Transit → the bay (Rinkai line)', lat: null, lng: null, coordKind: 'approx', area: 'Shin-Kiba / Tokyo Teleport', startTime: '13:10', durationMin: 90, note: 'Ayase → Yurakucho line → Shin-Kiba → Rinkai line → Tokyo Teleport (Toei bus to the venue) OR Kokusai-Tenjijo (free festival shuttle). Confirm the shuttle stop + times on the official WDJF site.', locked: false },
        { id: 's-jul4-festival', placeId: 'p-seaforest', name: 'World DJ Festival — Sea Forest Waterway', lat: 35.6047, lng: 139.8225, coordKind: 'approx', area: 'Koto-ku (Tokyo Bay)', startTime: '15:00', durationMin: 480, note: 'Day 1: Martin Garrix, Porter Robinson, KSHMR, Galantis, Alok. 3-6-44 Uminomori, Koto-ku.', locked: false },
        { id: 's-jul4-return', placeId: 'p-sakura-house-makoto', name: 'Return — Makoto (plan the exit!)', lat: 35.7684, lng: 139.8264, coordKind: 'approx', area: 'Ayase', startTime: '23:00', durationMin: 0, note: 'THE HARD PART: last trains from the bay are ~midnight. If sets run later, use the official late shuttle to a hub, or budget a taxi (~¥3-5k) to Shin-Kiba then a night route home.', locked: false },
      ],
    };
    set(KEYS.dayPlans, plans);
  }
  set(KEYS.seedPlan, true);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // auto-reload once when a new SW takes control, so users never get stuck on a stale build
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    // don't yank the page out from under in-progress input (typing / an open dialog) —
    // the fresh build simply lands on the user's next natural reload instead
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (typing || document.querySelector('[aria-modal="true"]')) return;
    reloaded = true; location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
