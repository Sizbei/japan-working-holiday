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
  // events STARTING this week lead; long-running spans covering today fill at most 2 trailing
  // slots (review finding: 7 baked seasonal spans otherwise crowded out the actual week)
  const all = allEvents();
  const starts = all.filter(e => { const dn = daysBetween(today, (e.date || '').slice(0, 10)); return dn !== null && dn >= 0 && dn < 7; })
    .sort((a, b) => a.date.localeCompare(b.date));
  const spans = all.filter(e => { const d = (e.date || '').slice(0, 10), x = (e.endDate || '').slice(0, 10); return d < today && x >= today; })
    .sort((a, b) => b.date.localeCompare(a.date));   // most recently started first
  const week = [...starts.slice(0, 8), ...spans.slice(0, Math.max(0, Math.min(2, 8 - starts.length)))];
  if (!week.length) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  host.innerHTML = `<p class="expw-h">This week</p><div class="expw-row">${week.map(e => {
    const d = (e.date || '').slice(0, 10);
    const when = d === today ? 'today' : d < today ? 'now' : fmtShort(d);   // 'now' = an ongoing span; 'today' = starts today
    return `<a class="expw-chip" href="#/calendar"><b>${esc(when)}</b> <span class="expw-t">${esc(e.title)}${e.area ? ` <span class="expw-area">· ${esc(e.area)}</span>` : ''}</span></a>`;
  }).join('')}</div>`;
}

export function mountExpWeek() {
  render();
  document.addEventListener('jwh:data-changed', render);
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'explore') render(); });   // fresh "today" on entry
}
