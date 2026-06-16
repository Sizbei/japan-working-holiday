'use strict';
// Boot: gate → load data → mount dashboard, calendar, tracker, content, TOC, service worker.

import { mountGate } from './gate.js';
import { renderContent } from './content.js';
import { mountCalendar } from './calendar.js';
import { mountTracker } from './tracker.js';
import { mountDashboard } from './dashboard.js';
import { nowISO } from './lib/dates.js';
import { $, esc } from './lib/dom.js';

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
      buildTOC();
    })
    .catch(err => {
      const d = $('#domains');
      if (d) d.innerHTML = `<div class="empty">Could not load data (${esc(err.message)}). If local, serve over HTTP: <code>python3 -m http.server</code>.</div>`;
    });
  registerSW();
}

function setText(sel, txt) { const el = $(sel); if (el) el.textContent = txt; }

function buildTOC() {
  const items = [
    ['dashHome', '📊 Dashboard'], ['calendarSection', '📅 Calendar'], ['trackerSection', '🎟️ Drops'],
    ['timeSensitiveSection', '⏰ Deadlines'], ['topSection', '🏆 Top Moves'], ['checklist', '✅ Checklist'],
    ['brew', '💭 Brew'], ['activities', '🌸 Things I\'ll Do'], ['restaurants', '🍜 Restaurants'],
    ['disney', '🏰 Disney'], ['building', '💻 Building'], ['music', '🎛️ Music'], ['geek', '🎮 Games'],
    ['meetups', '🤝 Meetups'], ['canadaSection', '🇨🇦 Canada'], ['sourcesSection', '📚 Sources'],
  ];
  const toc = $('#toc');
  if (!toc) return;
  toc.innerHTML = items
    .filter(([id]) => { const el = document.getElementById(id); return el && el.style.display !== 'none'; })
    .map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('');
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
