'use strict';
// Event search on the Calendar page. Searches every event (baked + your own) by title /
// area / category / why, lists matches chronologically, and lets you jump the calendar to
// that month, drop it into a day plan, or add it to Google Calendar. Reuses the calendar's
// allEvents() + goToDate() and the Plan-a-Day store — no duplicate data.

import { $, $$, esc } from './lib/dom.js';
import { fmtShort } from './lib/dates.js';
import { allEvents, goToDate } from './calendar.js';
import { approxCoord } from './lib/geo.js';
import { gcalUrl } from './lib/ics.js';
import { upsertStop, newStop } from './lib/dayplan.js';

let DATA = null;

export function mountEventSearch(data) {
  DATA = data;
  const input = $('#calSearch'), results = $('#calSearchResults');
  if (!input || !results) return;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.innerHTML = ''; results.classList.remove('open'); return; }
    const matches = allEvents()
      .filter(e => `${e.title} ${e.area || ''} ${e.category || ''} ${e.why || ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 14);
    results.classList.add('open');
    results.innerHTML = matches.length ? matches.map(rowHTML).join('')
      : `<li class="cs-empty">No events match “${esc(q)}”.</li>`;
  };
  input.addEventListener('input', render);
  results.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { goToDate(go.dataset.go); input.value = ''; results.innerHTML = ''; results.classList.remove('open'); $('#calView')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const plan = e.target.closest('[data-plan]');
    if (plan) { addToPlan(plan.dataset); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; results.innerHTML = ''; results.classList.remove('open'); } });
}

function rowHTML(e) {
  const c = approxCoord(DATA.areaGeo, e.area || '', e.title);
  return `<li class="cs-row">
    <span class="cs-sw cat-${esc((e.category || 'personal'))}"></span>
    <div class="cs-main">
      <button type="button" class="cs-title" data-go="${esc(e.date)}" title="Jump to this month">${esc(e.title)}</button>
      <span class="cs-meta">${esc(fmtShort(e.date))}${e.area ? ' · ' + esc(e.area) : ''}</span>
    </div>
    <span class="cs-acts">
      <button type="button" class="cs-ic" data-plan="1" data-date="${esc(e.date)}" data-title="${esc(e.title)}" data-area="${esc(e.area || '')}" data-lat="${esc(String(c.lat))}" data-lng="${esc(String(c.lng))}" title="Add to a day plan" aria-label="Add ${esc(e.title)} to a day plan">＋📋</button>
      <a class="cs-ic" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener" title="Add to Google Calendar" aria-label="Add to Google Calendar">+G</a>
    </span></li>`;
}

function addToPlan(d) {
  upsertStop(d.date, newStop({ name: d.title, area: d.area, lat: +d.lat, lng: +d.lng, coordKind: 'approx', seed: Math.random() }));
  const live = $('#calSearchResults');
  if (live) { const note = document.createElement('li'); note.className = 'cs-note'; note.textContent = `Added “${d.title}” to your plan for ${fmtShort(d.date)}.`; live.prepend(note); setTimeout(() => note.remove(), 3500); }
}
