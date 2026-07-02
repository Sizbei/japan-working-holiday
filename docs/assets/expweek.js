'use strict';
// "This week" band at the top of #/explore (expansion ledger S3). Display-only: derives the
// next 7 days from allEvents() — no storage, no mutation; hides itself when the week is empty.

import { $, esc } from './lib/dom.js';
import { allEvents } from './calendar.js';
import { nowISO, fmtShort, daysBetween } from './lib/dates.js';

function render() {
  const host = $('#exploreWeek');
  if (!host) return;
  const today = nowISO();
  const week = allEvents()
    .filter(e => {
      const d = (e.date || '').slice(0, 10), x = (e.endDate || '').slice(0, 10);
      const dn = daysBetween(today, d);
      return (dn !== null && dn >= 0 && dn < 7) || (d < today && x >= today);   // starts this week, or a span covering today
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);
  if (!week.length) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  host.innerHTML = `<p class="expw-h">This week</p><div class="expw-row">${week.map(e => {
    const d = (e.date || '').slice(0, 10);
    const when = d <= today ? 'now' : fmtShort(d);
    return `<a class="expw-chip cat-${esc((e.category || 'personal').toLowerCase())}" href="#/calendar"><b>${esc(when)}</b> ${esc(e.title)}${e.area ? ` <span class="expw-area">· ${esc(e.area)}</span>` : ''}</a>`;
  }).join('')}</div>`;
}

export function mountExpWeek() {
  render();
  document.addEventListener('jwh:data-changed', render);
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'explore') render(); });   // fresh "today" on entry
}
