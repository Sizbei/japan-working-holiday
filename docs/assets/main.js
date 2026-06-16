'use strict';
// Boot: gate → load data → mount dashboard, calendar, tracker, content, TOC, service worker.

import { mountGate } from './gate.js';
import { renderContent } from './content.js';
import { mountCalendar } from './calendar.js';
import { mountTracker } from './tracker.js';
import { mountDashboard } from './dashboard.js';
import { mountMyTokyo } from './dashboard-mytokyo.js';
import { initRouter } from './router.js';
import { initKonami } from './konami.js';
import { stagger } from './motion.js';
import { nowISO } from './lib/dates.js';
import { $, $$, esc } from './lib/dom.js';

mountGate(boot);

function boot() {
  fetch('data/tips.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('Failed to load tips.json'); return r.json(); })
    .then(data => {
      const today = nowISO();
      const m = data.meta || {};
      setText('#heroSub', m.subtitle || '');
      setText('#metaArrival', m.arrival_date ? `Arrival: ${m.arrival_date}` : '');
      setText('#footGen', m.generated || '');
      mountCalendar(data, today);
      mountTracker(data);
      renderContent(data, today);
      mountDashboard(data, today);   // reads calendar + content, so mount last
      mountMyTokyo(data);            // surface my interests at the top of the dashboard
      initRouter();                  // hash-router SPA: split views, animated transitions
      initKonami();                  // ↑↑↓↓←→←→ b a → arcade mode
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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
