'use strict';
// Boot: gate → load data → mount dashboard, calendar, tracker, content, TOC, service worker.

import { mountGate } from './gate.js';
import { renderContent } from './content.js';
import { mountPacking } from './packing.js';
import { mountBudget } from './budget.js';
import { mountCalendar } from './calendar.js';
import { mountGoingPage } from './going-page.js';
import { mountTracker } from './tracker.js';
import { mountDashboard } from './dashboard.js';
import { mountRooms } from './rooms.js';
import { mountMap } from './map.js';
import { mountPlan } from './plan.js';
import { mountEventSearch } from './eventsearch.js';
import { mountLang } from './lang.js';
import { mountBackup } from './backup.js';
import { initRouter } from './router.js';
import { mountGestures } from './gestures.js';
import { mountGuide, applyHomeLayout } from './guide.js';
import { initKonami } from './konami.js';
import { mountEaster } from './easter.js';
import { stagger } from './motion.js';
import { nowISO } from './lib/dates.js';
import { $, $$, esc } from './lib/dom.js';

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
      mountCalendar(data, today);
      mountGoingPage();              // dedicated "Going To" page (#/going) — events marked ✓ Going
      mountTracker(data);
      renderContent(data, today);
      mountPacking(data);            // packing page (#/packing) — categorized super-checklist
      mountBudget(data);             // budget planner (#/budget) — one-time + monthly cost estimate
      mountDashboard(data, today);   // reads calendar + content, so mount last
      mountRooms(data);              // share-room finder (#/rooms)
      mountMap(data);                // map page (#/map)
      mountPlan(data);               // day itinerary planner (#/plan)
      mountEventSearch(data);        // search all events on the calendar page
      mountLang();                   // EN/日本語 chrome toggle + hover-dictionary
      mountBackup();                 // export/import all device-local trip data
      initRouter();                  // hash-router SPA: split views, animated transitions
      mountGestures();               // swipe between pages, keyboard shortcuts, long-press menus
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

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // auto-reload once when a new SW takes control, so users never get stuck on a stale build
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return; reloaded = true; location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
