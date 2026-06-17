'use strict';
// Editable calendar — enhanced month grid + side deadline panel.
// Merges baked events (tips.json, read-only) with user events (localStorage, CRUD).
// Grid cells show a density meter + ticket glyph; the legend doubles as a category
// filter; the side panel lists this month's book-by deadlines; clicking a day opens
// a popover. Tag-filtered .ics/Google export + .ics import.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { parseISO, daysBetween, fmtDate, fmtShort, MONTHS, nowISO } from './lib/dates.js';
import { toICS, gcalUrl, parseICS } from './lib/ics.js';
import { alertModal, confirmModal } from './lib/modal.js';
import { upsertStop, newStop } from './lib/dayplan.js';
import { loadPlaces, patchPlace } from './lib/places.js';
import { approxCoord } from './lib/geo.js';
import { makeMovable } from './dnd.js';

let DATA = null;
let viewY = 2026, viewM = 5;
let mode = 'month';
let TODAY = '2026-06-15';
let hiddenCats = new Set();
let popEl = null, popCleanup = null;

const CATS = ['festival', 'fireworks', 'illumination', 'convention', 'seasonal', 'nature', 'holiday', 'food', 'disney', 'music', 'personal', 'imported'];
const SPAN_CAP = 10;

function loadUser() { return get(KEYS.events, []) || []; }
function saveUser(a) { set(KEYS.events, a); changed(); }
function changed() { document.dispatchEvent(new CustomEvent('jwh:data-changed')); }

function loadOverrides() { return get(KEYS.eventOverrides, {}) || {}; }
function saveOverrides(o) { set(KEYS.eventOverrides, o); changed(); }
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// shift endDate by the same delta the start moved, so a multi-day event keeps its span
function shiftEnd(oldStart, newStart, endDate) {
  if (!endDate) return '';
  const delta = daysBetween(oldStart.slice(0, 10), newStart);
  return delta == null ? '' : addDaysISO(endDate.slice(0, 10), delta);
}
function bakedEvents() {
  const ov = loadOverrides();
  return (DATA.calendar || []).map(e => ov[e.id]
    ? { ...e, date: ov[e.id], endDate: shiftEnd(e.date, ov[e.id], e.endDate), source: 'baked', moved: true }
    : { ...e, source: 'baked' });
}
let _evCache = null;   // memoized for one render pass (eventsOn is called ~once per day cell)
export function allEvents() {
  if (_evCache) return _evCache;
  const user = loadUser().map(e => ({ ...e, source: 'user' }));
  const copied = new Set(user.map(e => e.copyOf).filter(Boolean));   // "Copy to my events" takes over the baked original — hide it to avoid a duplicate chip
  _evCache = [...bakedEvents().filter(e => !copied.has(e.id)), ...user].filter(e => parseISO(e.date));
  return _evCache;
}
// Invalidate the memo on ANY mutation, order-independently: this listener is registered at
// module-eval (import) time — before any mount() — so it runs before dashboard/calendar
// re-read allEvents(), regardless of listener registration order. (Every event writer —
// calendar saveUser/saveOverrides, map pushEvent/removeEvent, plan, deletePlace — dispatches
// jwh:data-changed.) render() still nulls it too, as belt-and-suspenders.
document.addEventListener('jwh:data-changed', () => { _evCache = null; });
function catOf(e) { return e.category || 'personal'; }
function visible(e) { return !hiddenCats.has(catOf(e)); }

function eventsOn(iso, capLong = false) {
  return allEvents().filter(e => {
    if (!visible(e)) return false;
    const s = e.date.slice(0, 10);
    const en = (e.endDate && parseISO(e.endDate)) ? e.endDate.slice(0, 10) : '';
    if (!en) return s === iso;
    if (capLong) { const span = daysBetween(s, en); if (span !== null && span > SPAN_CAP) return s === iso; }
    return iso >= s && iso <= en;
  });
}

export function mountCalendar(data, today) {
  DATA = data;
  TODAY = today || nowISO();
  const cf = get(KEYS.calFilters, []); hiddenCats = new Set(Array.isArray(cf) ? cf : []);   // guard a corrupted (non-array) stored value
  const t = parseISO(TODAY);
  if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); }
  wireToolbar();
  buildLegend();
  render();
  document.addEventListener('jwh:data-changed', render);   // panel re-renders here; render() never dispatches changed → no loop
  document.addEventListener('jwh:cal-quickadd', (e) => { const d = e.detail?.date; if (d) { if (location.hash !== '#/calendar') location.hash = '#/calendar'; openModal(null, d); } });   // long-press a day → add event
}

function wireToolbar() {
  $('#calPrev')?.addEventListener('click', () => shift(-1));
  $('#calNext')?.addEventListener('click', () => shift(1));
  $('#calToday')?.addEventListener('click', () => { const t = parseISO(TODAY); viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); render(); });
  $('#calModeMonth')?.addEventListener('click', () => { mode = 'month'; render(); });
  $('#calModeAgenda')?.addEventListener('click', () => { mode = 'agenda'; render(); });
  $('#calAdd')?.addEventListener('click', () => openModal(null, TODAY));
  $('#calExport')?.addEventListener('click', openExport);
  $('#calImportBtn')?.addEventListener('click', () => $('#calImport').click());
  $('#calImport')?.addEventListener('change', onImport);
}
function shift(d) { viewM += d; while (viewM < 0) { viewM += 12; viewY--; } while (viewM > 11) { viewM -= 12; viewY++; } render(); }

// jump the month view to a given ISO date (used by event search)
export function goToDate(iso) {
  const t = parseISO(iso); if (!t) return;
  viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); mode = 'month'; render();
}

// ---- legend doubles as category filter (built from categories actually present) ----
function buildLegend() {
  const el = $('#calLegend');
  if (!el) return;
  const present = [...new Set(allEvents().map(catOf))].sort();
  el.innerHTML = present.map(c =>
    `<button class="lg cat-${esc(c)} ${hiddenCats.has(c) ? 'off' : ''}" data-cat="${esc(c)}" aria-pressed="${!hiddenCats.has(c)}">${esc(c)}</button>`
  ).join('') + `<button class="lg-all" id="lgAll" type="button">${hiddenCats.size ? 'All' : 'None'}</button>`;
  $$('#calLegend .lg').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.cat;
    if (hiddenCats.has(c)) hiddenCats.delete(c); else hiddenCats.add(c);
    persistFilters(); buildLegend(); render();
    $('#calLegend .lg[data-cat="' + (window.CSS ? CSS.escape(c) : c) + '"]')?.focus();   // buildLegend replaced the button → restore keyboard focus
  }));
  $('#lgAll')?.addEventListener('click', () => {
    if (hiddenCats.size) hiddenCats.clear(); else present.forEach(c => hiddenCats.add(c));
    persistFilters(); buildLegend(); render();
    $('#lgAll')?.focus();
  });
}
function persistFilters() { set(KEYS.calFilters, [...hiddenCats]); }

function render() {
  _evCache = null;   // invalidate the per-render event cache (data may have changed since last render)
  dismissPopover();
  const mEl = $('#calModeMonth'), aEl = $('#calModeAgenda');
  mEl?.classList.toggle('active', mode === 'month'); mEl?.setAttribute('aria-pressed', String(mode === 'month'));
  aEl?.classList.toggle('active', mode === 'agenda'); aEl?.setAttribute('aria-pressed', String(mode === 'agenda'));
  const label = $('#calLabel'); if (label) label.textContent = mode === 'agenda' ? `Agenda — from ${MONTHS[viewM]} ${viewY}` : `${MONTHS[viewM]} ${viewY}`;
  const view = $('#calView'); if (!view) return;
  const panel = $('#calPanel');
  if (mode === 'month') {
    view.innerHTML = monthHTML();
    if (panel) { panel.hidden = false; panel.innerHTML = panelHTML(); wirePanel(); }
    wireCells();
    wireReschedule();
  } else {
    view.innerHTML = agendaHTML();
    if (panel) panel.hidden = true;   // agenda already lists everything; panel would duplicate
    wireAgenda();
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function densityClass(n) { return n >= 5 ? 3 : n >= 3 ? 2 : 1; }

function monthHTML() {
  const first = new Date(Date.UTC(viewY, viewM, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty" aria-hidden="true"></div>`;
  for (let d = 1; d <= days; d++) {
    const date = iso(viewY, viewM, d);
    const evs = eventsOn(date, true);
    const isToday = date === TODAY;
    const hasBook = evs.some(e => e.bookBy);
    const seasonStart = evs.find(e => e.endDate && daysBetween(e.date.slice(0, 10), e.endDate.slice(0, 10)) > SPAN_CAP);
    const topCat = (evs[0] && catOf(evs[0])) || 'personal';
    const meter = evs.length
      ? `<span class="cal-meter cat-${esc(topCat)}" title="${evs.length} event${evs.length === 1 ? '' : 's'}">${'<i></i>'.repeat(densityClass(evs.length))}</span>` : '';
    const ticket = hasBook ? `<span class="cal-ticket" title="has a booking deadline">🎟</span>` : '';
    const chips = evs.slice(0, 3).map(e => {
      const ong = e.endDate && daysBetween(e.date.slice(0, 10), e.endDate.slice(0, 10)) > SPAN_CAP ? ' →' : '';
      return `<button class="cal-chip cat-${esc(catOf(e))}" data-ev="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}${ong}</button>`;
    }).join('');
    const more = evs.length > 3 ? `<span class="cal-more">+${evs.length - 3} more</span>` : '';
    cells += `<div class="cal-cell ${isToday ? 'today' : ''} ${seasonStart ? 'season-start' : ''}" ${seasonStart ? `style="--stripe:var(--c-${esc(catOf(seasonStart))})"` : ''} data-day="${date}">
      <span class="cal-row"><button type="button" class="cal-date" data-day="${date}" aria-label="${date}, ${evs.length} event${evs.length === 1 ? '' : 's'}">${d}</button><span class="cal-cluster">${ticket}${meter}</span></span>
      ${chips}${more}</div>`;
  }
  return `<div class="cal-grid">${dows.map(x => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>`;
}

// ---- side panel: this month's book-by deadlines + a "happening" tally ----
function sevOf(iso) { const d = daysBetween(TODAY, iso); if (d === null) return ''; if (d < 0) return 'overdue'; if (d <= 14) return 'due-soon'; return 'upcoming'; }
function panelHTML() {
  const monthKey = `${viewY}-${pad(viewM + 1)}`;
  const evs = allEvents().filter(visible);
  // deadlines: events with bookBy in or before the visible month, whose event date is still upcoming
  const deadlines = evs.filter(e => e.bookBy && /^\d{4}-\d{2}-\d{2}$/.test(e.bookBy) && e.bookBy.slice(0, 7) <= monthKey && (e.endDate || e.date).slice(0, 10) >= TODAY)
    .sort((a, b) => a.bookBy.localeCompare(b.bookBy));
  const inMonth = evs.filter(e => {
    const s = e.date.slice(0, 7), en = (e.endDate || e.date).slice(0, 7);
    return s <= monthKey && en >= monthKey;
  });
  const tally = {};
  inMonth.forEach(e => { tally[catOf(e)] = (tally[catOf(e)] || 0) + 1; });
  const dl = deadlines.length ? deadlines.map(e => {
    const sev = sevOf(e.bookBy), days = daysBetween(TODAY, e.bookBy);
    const badge = days < 0 ? 'overdue' : `${days}d`;
    return `<button class="cp-deadline" data-ev="${esc(e.id)}">
      <span class="cp-dot sev-${sev}"></span>
      <span class="cp-body"><span class="cp-title">${esc(e.title)}</span>
        <span class="cp-sub">book by ${esc(fmtShort(e.bookBy))}</span></span>
      <span class="cp-badge sev-${sev}">${esc(badge)}</span></button>`;
  }).join('') : `<p class="cp-empty">No book-by deadlines through ${MONTHS[viewM]} — you're clear. 🎏</p>`;
  const tallyHTML = Object.keys(tally).sort((a, b) => tally[b] - tally[a]).map(c =>
    `<div class="cp-tally"><span class="cp-bar cat-${esc(c)}" style="width:${Math.min(tally[c] * 10, 120)}px"></span><span class="cp-tlabel">${esc(c)} ${tally[c]}</span></div>`).join('');
  return `<h3 class="cp-head">Deadlines through ${MONTHS[viewM]} <span class="cp-count">${deadlines.length}</span></h3>
    <div class="cp-list">${dl}</div>
    <hr class="cp-hr">
    <h3 class="cp-head">Happening in ${MONTHS[viewM]}</h3>
    <div class="cp-tallies">${tallyHTML || '<p class="cp-empty">Nothing this month.</p>'}</div>`;
}
function wirePanel() {
  $$('#calPanel .cp-deadline').forEach(b => b.addEventListener('click', () => {
    const ev = allEvents().find(x => x.id === b.dataset.ev); if (ev) openDetail(ev);
  }));
  // auto-scroll the first upcoming (non-overdue) deadline into view
  const next = $('#calPanel .cp-deadline .cp-dot.sev-due-soon, #calPanel .cp-deadline .cp-dot.sev-upcoming');
  if (next) next.closest('.cp-deadline').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function agendaHTML() {
  const upcoming = allEvents().filter(e => visible(e) && (e.endDate || e.date).slice(0, 10) >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
  if (!upcoming.length) {
    const hidden = hiddenCats.size > 0;
    return `<div class="empty empty-state">
      <div class="empty-emoji" aria-hidden="true">📭</div>
      <p class="empty-h">No upcoming events${hidden ? ' in the shown categories' : ''}.</p>
      ${hidden ? '<p class="empty-sub">Some categories are filtered out — tap a greyed legend chip above to show them.</p>' : ''}
    </div>`;
  }
  let last = '';
  return `<div class="agenda">${upcoming.map(e => {
    const mk = e.date.slice(0, 7);
    const head = mk !== last ? (last = mk, `<div class="agenda-month">${MONTHS[+e.date.slice(5, 7) - 1]} ${e.date.slice(0, 4)}</div>`) : '';
    return head + `<div class="agenda-row" data-ev="${esc(e.id)}">
      <span class="agenda-date cat-${esc(catOf(e))}">${esc(fmtShort(e.date))}</span>
      <span class="agenda-body"><button type="button" class="agenda-title" data-ev="${esc(e.id)}">${esc(e.title)}</button>
        ${e.area ? `<span class="agenda-area">${esc(e.area)}</span>` : ''}
        ${e.bookBy ? `<span class="agenda-book">book by ${esc(fmtShort(e.bookBy))}</span>` : ''}</span>
      <a class="agenda-gcal" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" data-stop>+G</a></div>`;
  }).join('')}</div>`;
}
function wireAgenda() {
  // the .agenda-title button is the keyboard trigger (native Enter/Space); its click bubbles to the
  // row. A mouse click anywhere on the row (except the +G link) also opens the detail.
  $$('#calView .agenda-row').forEach(r => {
    r.addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) return; const ev = allEvents().find(x => x.id === r.dataset.ev); if (ev) openDetail(ev); });
  });
}

// ---- day popover ----
function wireCells() {
  $$('#calView .cal-cell[data-day]').forEach(c => {
    // the .cal-date button is the keyboard-focusable trigger; its click bubbles here. A chip click
    // opens the event; any other click on the cell (the date button or empty space) opens the day popover.
    c.addEventListener('click', (e) => { if (e.target.closest('.cal-chip')) { const ev = allEvents().find(x => x.id === e.target.closest('.cal-chip').dataset.ev); if (ev) openDetail(ev); return; } dayPopover(c.dataset.day, c); });
  });
}
// drag a USER event chip onto another day to reschedule (baked events are fixed)
function wireReschedule() {
  const view = $('#calView');
  if (!view) return;
  makeMovable(view, {
    itemSelector: '.cal-chip[data-ev]', label: 'event',
    canDrag: () => true,                       // any event can be rescheduled now (baked → override layer)
    idOf: el => el.dataset.ev,
    targetSelector: '.cal-cell[data-day]', keyOf: t => t.dataset.day,
    onMove: (id, day) => {
      const ev = allEvents().find(x => x.id === id);
      if (!ev) return;
      if (ev.date.slice(0, 10) === day) return;   // dropped on its own day — not a real move (no phantom override / "moved" flag)
      if (ev.source === 'user') {
        saveUser(loadUser().map(x => x.id === id ? { ...x, date: day, endDate: shiftEnd(x.date, day, x.endDate) } : x));   // keep multi-day span
        syncPlaceDate(id, day);                   // a linked "Visit:" place must follow its event's new date
      } else {                                    // baked event → store a date override (tips.json stays untouched)
        const orig = (DATA.calendar || []).find(c => c.id === id);
        if (orig && day === (orig.date || '').slice(0, 10)) { const { [id]: _d, ...o } = loadOverrides(); saveOverrides(o); }   // back to researched date → drop the override
        else saveOverrides({ ...loadOverrides(), [id]: day });
      }
    },
  });
}
// keep a place's stored date in step when its linked calendar event is rescheduled (place↔event parity)
function syncPlaceDate(eventId, day) {
  const linked = loadPlaces().find(p => p.eventId === eventId);
  if (linked) patchPlace(linked.id, linked.remindDate ? { remindDate: day } : { date: day });
}

function dismissPopover() {
  if (popCleanup) { popCleanup(); popCleanup = null; }
  if (popEl) { popEl.remove(); popEl = null; }
}
function dayPopover(date, anchor) {
  dismissPopover();
  const evs = eventsOn(date);
  const rows = evs.length ? evs.map(e => `
    <div class="pop-row">
      <span class="pop-sw cat-${esc(catOf(e))}"></span>
      <span class="pop-body"><button class="pop-open" data-ev="${esc(e.id)}">${esc(e.title)}</button>
        ${e.bookBy ? `<span class="pop-book">book by ${esc(fmtShort(e.bookBy))}</span>` : ''}</span>
      <a class="pop-gcal" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" title="Add to Google Calendar">+G</a>
    </div>`).join('') : `<p class="pop-empty">Nothing booked this day.</p>`;
  popEl = document.createElement('div');
  popEl.className = 'cal-pop';
  popEl.setAttribute('role', 'dialog');
  popEl.setAttribute('aria-modal', 'true');
  popEl.setAttribute('aria-label', 'Events on ' + fmtDate(date));
  popEl.innerHTML = `<div class="pop-head">${esc(fmtDate(date))}</div>${rows}
    <button class="pop-add" data-add="${esc(date)}">+ Add your own event</button>`;
  document.body.appendChild(popEl);
  const r = anchor.getBoundingClientRect();
  const top = window.scrollY + r.bottom + 6, left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - popEl.offsetWidth - 12);
  const flipUp = r.bottom + popEl.offsetHeight + 12 > window.innerHeight;
  popEl.style.top = (flipUp ? window.scrollY + r.top - popEl.offsetHeight - 6 : top) + 'px';
  popEl.style.left = Math.max(window.scrollX + 8, left) + 'px';
  popEl.querySelectorAll('.pop-open').forEach(b => b.addEventListener('click', () => { const ev = allEvents().find(x => x.id === b.dataset.ev); dismissPopover(); if (ev) openDetail(ev); }));
  popEl.querySelector('.pop-add').addEventListener('click', () => { dismissPopover(); openModal(null, date); });
  const onDoc = (e) => { if (popEl && !popEl.contains(e.target) && e.target !== anchor) dismissPopover(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { dismissPopover(); anchor.focus?.(); return; }   // Esc returns focus to the day cell
    if (e.key !== 'Tab' || !popEl) return;
    const f = [...popEl.querySelectorAll('button,[href]')].filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const onScroll = () => dismissPopover();
  setTimeout(() => { document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, { passive: true }); popEl.querySelector('.pop-open, .pop-add')?.focus(); }, 0);
  popCleanup = () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); };
}

// ---- detail (baked read-only, user editable) ----
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
    ${ev.moved ? '<p class="modal-line">↩ You rescheduled this from its researched date.</p>' : ''}
    <div class="modal-actions">
      ${ev.moved ? '<button class="btn" id="mdReset">↺ Reset date</button>' : ''}
      <button class="btn" id="mdPlan">＋ Add to day plan</button>
      <a class="btn ghost" href="${esc(gcalUrl(ev))}" target="_blank" rel="noopener noreferrer">+ Google Calendar</a>
      <button class="btn" id="mdCopy">Copy to my events</button>
    </div>`;
  const ov = showModal(body);
  ov.querySelector('#mdReset')?.addEventListener('click', () => { const { [ev.id]: _drop, ...o } = loadOverrides(); saveOverrides(o); closeModal(ov, { rerender: true }); });
  ov.querySelector('#mdPlan')?.addEventListener('click', () => {
    const c = approxCoord(DATA.areaGeo, ev.area || '', ev.title);
    upsertStop(ev.date.slice(0, 10), newStop({ name: ev.title, area: ev.area || '', lat: c.lat, lng: c.lng, coordKind: 'approx', seed: Math.random() }));
    closeModal(ov, { rerender: true }); alertModal(`Added “${ev.title}” to your plan for ${fmtDate(ev.date)}.`);
  });
  ov.querySelector('#mdCopy')?.addEventListener('click', () => {
    saveUser([...loadUser(), { id: 'u' + Date.now(), title: ev.title, date: ev.date.slice(0, 10), endDate: (ev.endDate || '').slice(0, 10), category: ev.category || 'personal', note: ev.bookingNotes || ev.why || '', area: ev.area || '', bookBy: ev.bookBy || '', copyOf: ev.id }]);
    closeModal(ov, { rerender: true });   // jwh:data-changed → render() (single path)
  });
}
function srcline(s) {
  const arr = (s || []).filter(Boolean);
  return arr.length ? `<p class="modal-src">${arr.slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ${i + 1} ↗</a>`).join('')}</p>` : '';
}

// ---- add/edit modal ----
function openModal(ev, presetDate) {
  const e = ev || { id: '', title: '', date: presetDate || TODAY, endDate: '', time: '', category: 'personal', note: '' };
  // preserve a non-standard (e.g. imported .ics) category instead of silently rewriting it to the first option
  const cats = (e.category && !CATS.includes(e.category)) ? [e.category, ...CATS] : CATS;
  const opts = cats.map(c => `<option value="${c}" ${c === (e.category || 'personal') ? 'selected' : ''}>${c}</option>`).join('');
  const gbtn = ev ? `<a class="btn ghost" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer">+ Google</a>` : '';
  const body = `
    <h3 class="modal-title">${ev ? 'Edit event' : 'Add event'}</h3>
    <form id="evForm" class="modal-form">
      <label>Title<input name="title" value="${esc(e.title)}" required></label>
      <div class="row2">
        <label>Date<input name="date" type="date" value="${esc((e.date || '').slice(0, 10))}" required></label>
        <label>End (optional)<input name="endDate" type="date" value="${esc((e.endDate || '').slice(0, 10))}"></label>
      </div>
      <div class="row2">
        <label>Category<select name="category">${opts}</select></label>
      </div>
      <label>Note<textarea name="note" rows="3">${esc(e.note || '')}</textarea></label>
      <div class="modal-actions">
        ${ev ? '<button type="button" class="btn danger" id="mdDel">Delete</button>' : ''}
        ${gbtn}
        <button type="submit" class="btn primary">${ev ? 'Save' : 'Add'}</button>
      </div>
    </form>`;
  const ov = showModal(body);
  ov.querySelector('#evForm').addEventListener('submit', (sub) => {
    sub.preventDefault();
    const obj = Object.fromEntries(new FormData(sub.target).entries());
    if (!obj.title.trim() || !obj.date) return;
    if (obj.endDate && obj.endDate < obj.date) { alertModal('End date can’t be before the start date.'); return; }   // else the event is invisible on the grid but counts in alerts
    const u = (ev && ev.id)
      ? loadUser().map(x => x.id === ev.id ? { ...x, ...obj } : x)
      : [...loadUser(), { id: 'u' + Date.now(), ...obj }];
    saveUser(u);
    if (ev && ev.id && obj.date !== (ev.date || '').slice(0, 10)) syncPlaceDate(ev.id, obj.date);   // a linked place follows the edited date
    closeModal(ov, { rerender: true });   // jwh:data-changed → render() (single path)
  });
  ov.querySelector('#mdDel')?.addEventListener('click', () => {
    const linked = loadPlaces().find(p => p.eventId === ev.id);   // clear the back-ref on any place that linked this event
    if (linked) patchPlace(linked.id, { eventId: '', date: '', remindDate: '' });
    saveUser(loadUser().filter(x => x.id !== ev.id));
    closeModal(ov, { rerender: true });
  });
}

// ---- bulk add: tag-filtered .ics + Google import how-to ----
function openExport() {
  const present = [...new Set(allEvents().map(catOf))].sort();
  const checks = present.map(c => `<label class="exp-tag"><input type="checkbox" value="${esc(c)}" checked> ${esc(c)}</label>`).join('');
  const body = `
    <h3 class="modal-title">Add to my calendar</h3>
    <p class="modal-line">Pick the tags, then download an <b>.ics</b> — import it into Google, Apple, or Outlook Calendar (one-time, with everything in it).</p>
    <div class="exp-tags">${checks}</div>
    <div class="modal-actions">
      <button class="btn" id="expAll">Toggle all</button>
      <button class="btn primary" id="expIcs">Download .ics</button>
    </div>
    <p class="modal-hint"><b>Google Calendar:</b> Settings → Import &amp; export → Import the .ics. Or open any single event and hit “+ Google Calendar”. (Two-way sync would need a backend — out of scope for this private, no-server planner.)</p>`;
  const ov = showModal(body);
  const picked = () => $$('.exp-tags input:checked', ov).map(i => i.value);
  ov.querySelector('#expAll').addEventListener('click', () => { const bx = $$('.exp-tags input', ov); const on = bx.every(b => b.checked); bx.forEach(b => b.checked = !on); });
  ov.querySelector('#expIcs').addEventListener('click', () => {
    const sel = new Set(picked());
    const evs = allEvents().filter(e => sel.has(catOf(e)));
    if (!evs.length) { alertModal('Pick at least one tag.'); return; }
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
function onImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const parsed = parseICS(reader.result);
    if (!parsed.length) { alertModal('No events found in that .ics file.'); return; }
    if (!await confirmModal(`Import ${parsed.length} event(s) into your calendar?`, { ok: 'Import' })) return;
    const added = parsed.map((p, i) => ({ id: 'u' + Date.now() + '-' + i, title: p.title, date: p.date, endDate: p.endDate || '', category: p.category || 'imported', note: p.note || '', area: p.area || '' }));
    saveUser([...loadUser(), ...added]);   // jwh:data-changed → render()
  };
  reader.onerror = () => alertModal('Could not read that .ics file.');
  reader.readAsText(file); e.target.value = '';
}

// ---- modal shell ----
function showModal(html) {
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="calModalTitle" tabindex="-1"><button type="button" class="modal-x" aria-label="Close">✕</button>${html}</div>`;
  document.body.appendChild(ov);
  const h = ov.querySelector('h2, h3, .modal-title'); if (h && !h.id) h.id = 'calModalTitle';   // label the dialog
  const focusables = () => [...ov.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  const restore = () => { if (prev && prev.focus) prev.focus(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) { closeModal(ov); restore(); } });
  ov.querySelector('.modal-x').addEventListener('click', () => { closeModal(ov); restore(); });
  ov.addEventListener('keydown', (e) => {     // listener lives on ov (focus is trapped inside) → auto-cleans on close
    if (e.key === 'Escape') { closeModal(ov); restore(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  setTimeout(() => (ov.querySelector('.modal input,.modal select,.modal textarea') || focusables()[0])?.focus(), 30);
  ov._restore = restore;   // commit paths call closeModal(ov, { rerender }) which restores focus
  return ov;
}
// rerender:true → the trigger element is destroyed by render(); send focus to the stable toolbar +Add button instead
function closeModal(ov, opts) {
  ov.classList.add('out'); setTimeout(() => ov.remove(), 180);
  if (opts && opts.rerender) $('#calAdd')?.focus();
  else ov._restore?.();
}
