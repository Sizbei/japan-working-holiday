'use strict';
// Editable calendar. Merges baked events (tips.json, read-only) with the user's own
// events (localStorage). Month grid + agenda views, click-a-day to add, edit/delete,
// tag-filtered .ics export + Google Calendar links, and .ics import.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { parseISO, daysBetween, fmtDate, fmtShort, MONTHS, nowISO } from './lib/dates.js';
import { toICS, gcalUrl, parseICS } from './lib/ics.js';

let DATA = null;
let viewY = 2026, viewM = 5;     // June 2026 (0-indexed month)
let mode = 'month';
let TODAY = '2026-06-15';

const CATS = ['festival', 'fireworks', 'illumination', 'convention', 'seasonal', 'nature', 'holiday', 'food', 'disney', 'music', 'personal', 'imported'];

function loadUser() { return get(KEYS.events, []) || []; }
function saveUser(a) { set(KEYS.events, a); changed(); }
function changed() { document.dispatchEvent(new CustomEvent('jwh:data-changed')); }

function bakedEvents() {
  return (DATA.calendar || []).map(e => ({ ...e, source: 'baked' }));
}
export function allEvents() {
  return [...bakedEvents(), ...loadUser().map(e => ({ ...e, source: 'user' }))]
    .filter(e => parseISO(e.date));
}
const SPAN_CAP = 10; // events longer than this render only on their start day in the grid
function eventsOn(iso, capLong = false) {
  return allEvents().filter(e => {
    const s = e.date.slice(0, 10);
    const en = (e.endDate && parseISO(e.endDate)) ? e.endDate.slice(0, 10) : '';
    if (!en) return s === iso;
    if (capLong) {
      const span = daysBetween(s, en);
      if (span !== null && span > SPAN_CAP) return s === iso;  // long season → opening day only
    }
    return iso >= s && iso <= en;
  });
}

export function mountCalendar(data, today) {
  DATA = data;
  TODAY = today || nowISO();
  const t = parseISO(TODAY);
  if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); }
  wireToolbar();
  render();
}

function wireToolbar() {
  $('#calPrev')?.addEventListener('click', () => { shift(-1); });
  $('#calNext')?.addEventListener('click', () => { shift(1); });
  $('#calToday')?.addEventListener('click', () => {
    const t = parseISO(TODAY); viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); render();
  });
  $('#calModeMonth')?.addEventListener('click', () => { mode = 'month'; render(); });
  $('#calModeAgenda')?.addEventListener('click', () => { mode = 'agenda'; render(); });
  $('#calAdd')?.addEventListener('click', () => openModal(null, TODAY));
  $('#calExport')?.addEventListener('click', openExport);
  $('#calImportBtn')?.addEventListener('click', () => $('#calImport').click());
  $('#calImport')?.addEventListener('change', onImport);
}
function shift(d) {
  viewM += d;
  while (viewM < 0) { viewM += 12; viewY--; }
  while (viewM > 11) { viewM -= 12; viewY++; }
  render();
}

function render() {
  $('#calModeMonth')?.classList.toggle('active', mode === 'month');
  $('#calModeAgenda')?.classList.toggle('active', mode === 'agenda');
  const label = $('#calLabel');
  if (label) label.textContent = `${MONTHS[viewM]} ${viewY}`;
  const view = $('#calView');
  if (!view) return;
  view.innerHTML = mode === 'month' ? monthHTML() : agendaHTML();
  wireCells();
}

function pad(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function monthHTML() {
  const first = new Date(Date.UTC(viewY, viewM, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const date = iso(viewY, viewM, d);
    const evs = eventsOn(date, true);
    const isToday = date === TODAY;
    const chips = evs.slice(0, 4).map(e => {
      const ongoing = e.endDate && daysBetween(e.date.slice(0, 10), e.endDate.slice(0, 10)) > SPAN_CAP ? ' →' : '';
      return `<button class="cal-chip cat-${esc(e.category || 'personal')}" data-ev="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}${ongoing}</button>`;
    }).join('');
    const more = evs.length > 4 ? `<span class="cal-more">+${evs.length - 4}</span>` : '';
    cells += `<div class="cal-cell ${isToday ? 'today' : ''}" data-day="${date}" tabindex="0" role="button" aria-label="${date}, ${evs.length} events">
      <span class="cal-date">${d}</span>${chips}${more}</div>`;
  }
  return `<div class="cal-grid">
    ${dows.map(d => `<div class="cal-dow">${d}</div>`).join('')}
    ${cells}</div>`;
}

function agendaHTML() {
  const upcoming = allEvents()
    .filter(e => (e.endDate || e.date).slice(0, 10) >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 60);
  if (!upcoming.length) return `<div class="empty">No upcoming events.</div>`;
  let lastMonth = '';
  return `<div class="agenda">${upcoming.map(e => {
    const mk = e.date.slice(0, 7);
    const head = mk !== lastMonth ? (lastMonth = mk, `<div class="agenda-month">${MONTHS[+e.date.slice(5, 7) - 1]} ${e.date.slice(0, 4)}</div>`) : '';
    return head + `<button class="agenda-row" data-ev="${esc(e.id)}">
      <span class="agenda-date cat-${esc(e.category || 'personal')}">${esc(fmtShort(e.date))}</span>
      <span class="agenda-body"><span class="agenda-title">${esc(e.title)}</span>
      ${e.area ? `<span class="agenda-area">${esc(e.area)}</span>` : ''}
      ${e.bookBy ? `<span class="agenda-book">book by ${esc(fmtShort(e.bookBy))}</span>` : ''}</span>
      <span class="agenda-cat">${esc(e.category || '')}</span></button>`;
  }).join('')}</div>`;
}

function wireCells() {
  $$('#calView .cal-cell[data-day]').forEach(c => {
    c.addEventListener('click', (e) => {
      if (e.target.closest('.cal-chip')) return;
      openModal(null, c.dataset.day);
    });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') openModal(null, c.dataset.day); });
  });
  $$('#calView [data-ev]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const ev = allEvents().find(x => x.id === b.dataset.ev);
    if (ev) openDetail(ev);
  }));
}

// ---- event detail (baked = read-only, user = editable) ----
function openDetail(ev) {
  if (ev.source === 'user') return openModal(ev);
  const body = `
    <h3 class="modal-title">${esc(ev.title)}</h3>
    <p class="modal-line"><b>${esc(fmtDate(ev.date))}${ev.endDate ? ' – ' + esc(fmtDate(ev.endDate)) : ''}</b> · ${esc(ev.category || '')}</p>
    ${ev.area ? `<p class="modal-line">📍 ${esc(ev.area)}</p>` : ''}
    ${ev.cost ? `<p class="modal-line">💴 ${esc(ev.cost)}</p>` : ''}
    ${ev.bookBy ? `<p class="modal-line book">🎟️ Book by <b>${esc(fmtDate(ev.bookBy))}</b></p>` : ''}
    ${ev.bookingNotes ? `<p class="modal-note">${esc(ev.bookingNotes)}</p>` : ''}
    ${ev.why ? `<p class="modal-note">${esc(ev.why)}</p>` : ''}
    ${srcline(ev.sources)}
    <div class="modal-actions">
      <a class="btn ghost" href="${esc(gcalUrl(ev))}" target="_blank" rel="noopener">+ Google Calendar</a>
      <button class="btn" id="mdCopy">Copy to my events</button>
    </div>`;
  const ov = showModal(body);
  ov.querySelector('#mdCopy')?.addEventListener('click', () => {
    const u = loadUser();
    u.push({ id: 'u' + Date.now(), title: ev.title, date: ev.date.slice(0, 10), endDate: (ev.endDate || '').slice(0, 10), category: ev.category || 'personal', note: ev.bookingNotes || ev.why || '' });
    saveUser(u); closeModal(ov); render();
  });
}
function srcline(s) {
  const arr = (s || []).filter(Boolean);
  return arr.length ? `<p class="modal-src">${arr.slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">source ${i + 1} ↗</a>`).join('')}</p>` : '';
}

// ---- add/edit modal (user events) ----
function openModal(ev, presetDate) {
  const e = ev || { id: '', title: '', date: presetDate || TODAY, endDate: '', time: '', category: 'personal', note: '' };
  const opts = CATS.map(c => `<option value="${c}" ${c === (e.category || 'personal') ? 'selected' : ''}>${c}</option>`).join('');
  const body = `
    <h3 class="modal-title">${ev ? 'Edit event' : 'Add event'}</h3>
    <form id="evForm" class="modal-form">
      <label>Title<input name="title" value="${esc(e.title)}" required></label>
      <div class="row2">
        <label>Date<input name="date" type="date" value="${esc((e.date || '').slice(0, 10))}" required></label>
        <label>End (optional)<input name="endDate" type="date" value="${esc((e.endDate || '').slice(0, 10))}"></label>
      </div>
      <div class="row2">
        <label>Time<input name="time" type="time" value="${esc(e.time || '')}"></label>
        <label>Category<select name="category">${opts}</select></label>
      </div>
      <label>Note<textarea name="note" rows="3">${esc(e.note || '')}</textarea></label>
      <div class="modal-actions">
        ${ev ? '<button type="button" class="btn danger" id="mdDel">Delete</button>' : ''}
        <button type="submit" class="btn primary">${ev ? 'Save' : 'Add'}</button>
      </div>
    </form>`;
  const ov = showModal(body);
  ov.querySelector('#evForm').addEventListener('submit', (sub) => {
    sub.preventDefault();
    const fd = new FormData(sub.target);
    const obj = Object.fromEntries(fd.entries());
    if (!obj.title.trim() || !obj.date) return;
    const u = loadUser();
    if (ev && ev.id) {
      const i = u.findIndex(x => x.id === ev.id);
      if (i >= 0) u[i] = { ...u[i], ...obj };
    } else {
      u.push({ id: 'u' + Date.now(), ...obj });
    }
    saveUser(u); closeModal(ov); render();
  });
  ov.querySelector('#mdDel')?.addEventListener('click', () => {
    saveUser(loadUser().filter(x => x.id !== ev.id)); closeModal(ov); render();
  });
}

// ---- export (tag-filtered) ----
function openExport() {
  const present = [...new Set(allEvents().map(e => e.category || 'personal'))].sort();
  const checks = present.map(c =>
    `<label class="exp-tag"><input type="checkbox" value="${esc(c)}" checked> ${esc(c)}</label>`).join('');
  const body = `
    <h3 class="modal-title">Export calendar</h3>
    <p class="modal-line">Pick the tags to export — only these events go into the file/links.</p>
    <div class="exp-tags">${checks}</div>
    <div class="modal-actions">
      <button class="btn" id="expAll">Toggle all</button>
      <button class="btn primary" id="expIcs">Download .ics</button>
    </div>
    <p class="modal-hint">Import the .ics into Google/Apple Calendar, or open a single event with “+ Google Calendar” from its detail view.</p>`;
  const ov = showModal(body);
  const picked = () => $$('.exp-tags input:checked', ov).map(i => i.value);
  ov.querySelector('#expAll').addEventListener('click', () => {
    const boxes = $$('.exp-tags input', ov);
    const allOn = boxes.every(b => b.checked);
    boxes.forEach(b => b.checked = !allOn);
  });
  ov.querySelector('#expIcs').addEventListener('click', () => {
    const sel = new Set(picked());
    const evs = allEvents().filter(e => sel.has(e.category || 'personal'));
    if (!evs.length) { alert('Pick at least one tag.'); return; }
    download(`my-year-in-japan-${[...sel].join('-')}.ics`, toICS(evs, 'My Year in Japan'));
    closeModal(ov);
  });
}
function download(name, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

// ---- import ----
function onImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseICS(reader.result);
    if (!parsed.length) { alert('No events found in that .ics file.'); return; }
    if (!confirm(`Import ${parsed.length} event(s) into your calendar?`)) return;
    const u = loadUser();
    parsed.forEach((p, i) => u.push({ id: 'u' + Date.now() + '-' + i, title: p.title, date: p.date, category: p.category || 'imported', note: p.note || '', area: p.area || '' }));
    saveUser(u); render();
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ---- modal shell ----
function showModal(html) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Close">✕</button>${html}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(ov); });
  ov.querySelector('.modal-x').addEventListener('click', () => closeModal(ov));
  document.addEventListener('keydown', escClose);
  function escClose(e) { if (e.key === 'Escape') { closeModal(ov); document.removeEventListener('keydown', escClose); } }
  setTimeout(() => ov.querySelector('input,select,textarea,button')?.focus(), 30);
  return ov;
}
function closeModal(ov) { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); }
