'use strict';
// Editable calendar — enhanced month grid + side deadline panel.
// Merges baked events (tips.json, read-only) with user events (localStorage, CRUD).
// Grid cells show a density meter + ticket glyph; the legend doubles as a category
// filter; the side panel lists this month's book-by deadlines; clicking a day opens
// a popover. Tag-filtered .ics/Google export + .ics import.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { parseISO, daysBetween, fmtDate, fmtShort, MONTHS, nowISO } from './lib/dates.js';
import { toICS, gcalUrl, parseICS } from './lib/ics.js';
import { alertModal, confirmModal } from './lib/modal.js';
import { upsertStop, newStop } from './lib/dayplan.js';
import { loadPlaces, patchPlace } from './lib/places.js';
import { isGoing, toggleGoing } from './lib/going.js';
import { approxCoord } from './lib/geo.js';
import { makeMovable, dndToast } from './dnd.js';
import { duplicateUserEvent, eventMenuSpec } from './lib/calevents.js';
import { customItem, loadChecklistCustom, saveChecklistCustom } from './lib/checklist.js';
import { checklistItems, revealChecklistItem } from './checklist-page.js';
import { parseEvent } from './lib/nlevent.js';
import { openMenu } from './lib/menu.js';
import { monthGrid, addMonths, WEEKDAYS_SHORT } from './lib/minical.js';
import { weekDays, isMultiDay, packLanes } from './lib/weekgrid.js';
import { searchJP } from './lib/nominatim.js';

let DATA = null;
let viewY = 2026, viewM = 5;
let mode = 'month';        // 'month' | 'week' | 'agenda'
let weekAnchor = '2026-06-15';   // any ISO date inside the week the week-view shows
let TODAY = '2026-06-15';
let hiddenCats = new Set();
let goingOnly = false;            // when on, the calendar shows only events you've marked ✓ Going
let showTasks = true;             // checklist tasks with a user-set due date appear on the calendar (filterable)
let _taskCache = null;            // per-render memo of task pseudo-events
let popEl = null, popCleanup = null;
let _sidePanelEv = null;          // currently open event id (null = closed)
let _sidePanelTrigger = null;     // element that opened the panel (focus restore)
let _sidePanelCleanup = null;     // remove side-panel document listeners
let _legendTimer = null;          // discriminate legend single-click (toggle) from double-click (isolate)

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
document.addEventListener('jwh:data-changed', () => { _evCache = null; _taskCache = null; });

// ---- checklist tasks as a display-only calendar layer ----
// Only OPEN tasks with a USER-SET due date appear (KEYS.due) — never the baked `dueBy` estimates,
// mirroring the notifications rule (curated dates only, no flood). Tasks are NOT real events: they
// carry data-task (not data-ev) so drag/reschedule/export ignore them; clicking jumps to the
// checklist. Memoized per render; invalidated alongside _evCache on any data change.
function allTasks() {
  if (_taskCache) return _taskCache;
  if (!showTasks) return (_taskCache = []);
  const due = get(KEYS.due, {}) || {};
  const done = get(KEYS.checklist, {}) || {};
  _taskCache = checklistItems(DATA)
    .filter(it => due[it.id] && !done[it.id] && parseISO(due[it.id]))
    .map(it => ({ taskId: it.id, title: it.task, date: due[it.id] }));
  return _taskCache;
}
function tasksOn(iso) { return showTasks ? allTasks().filter(t => t.date.slice(0, 10) === iso) : []; }
function taskChipHTML(t) {
  return `<button type="button" class="cal-chip cal-task" data-task="${esc(t.taskId)}" title="Checklist task due — ${esc(t.title)}"><span class="cc-t">☑ ${esc(t.title)}</span></button>`;
}
// jump from a calendar task chip to the checklist item it represents
function gotoTask(taskId) {
  dismissPopover();
  if (location.hash !== '#/checklist') location.hash = '#/checklist';
  // let the route transition swap views before scrolling/focusing the target row
  setTimeout(() => revealChecklistItem(taskId), 60);
}

function catOf(e) { return e.category || 'personal'; }
function visible(e) { return !hiddenCats.has(catOf(e)) && (!goingOnly || isGoing(e.id)); }

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
  goingOnly = getRaw(KEYS.calGoingOnly, '') === 'on';   // off by default (keep suggestions visible); the ✓ Going toggle persists your choice
  showTasks = getRaw(KEYS.calShowTasks, '') !== 'off';  // on by default; the ☑ Tasks toggle persists your choice
  const t = parseISO(TODAY);
  if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); }
  weekAnchor = TODAY;
  wireToolbar();
  wireQuickAdd();
  buildLegend();
  render();
  document.addEventListener('jwh:data-changed', render);   // panel re-renders here; render() never dispatches changed → no loop
  document.addEventListener('jwh:cal-quickadd', (e) => { const d = e.detail?.date; if (d) { if (location.hash !== '#/calendar') location.hash = '#/calendar'; openModal(null, d); } });   // long-press a day → add event
  document.addEventListener('keydown', onCalKeydown);      // Notion-style: ←→↑↓ move days, Enter open, − remove, t today, n new
  // right-click an event → context menu (delegated on document: the day popover lives on <body>,
  // outside #calView, so a view-scoped listener would miss its .pop-open events).
  document.addEventListener('contextmenu', (e) => {
    const items = getEventMenu(e.target);
    if (!items) return;                       // not an event → native menu
    e.preventDefault();
    openMenu(items, e.clientX, e.clientY, { label: 'Event actions' });
  });
  // keyboard: ContextMenu key / Shift+F10 on a focused event trigger opens the menu anchored to it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
    const items = getEventMenu(document.activeElement);
    if (!items) return;                       // focus isn't on an event trigger (so inputs are naturally excluded)
    e.preventDefault();
    openMenu(items, 0, 0, { anchor: document.activeElement, label: 'Event actions' });
  });
  // re-render the week view when crossing the mobile breakpoint (grid ↔ vertical list)
  window.matchMedia('(max-width: 700px)').addEventListener('change', () => { if (mode === 'week') render(); });
}

function wireToolbar() {
  $('#calPrev')?.addEventListener('click', () => shift(-1));
  $('#calNext')?.addEventListener('click', () => shift(1));
  $('#calToday')?.addEventListener('click', () => { const t = parseISO(TODAY); viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); weekAnchor = TODAY; render(); });
  $('#calModeMonth')?.addEventListener('click', () => { mode = 'month'; render(); });
  $('#calModeWeek')?.addEventListener('click', () => { mode = 'week'; render(); });
  $('#calModeAgenda')?.addEventListener('click', () => { mode = 'agenda'; render(); });
  $('#calAdd')?.addEventListener('click', () => openModal(null, TODAY));
  $('#calExport')?.addEventListener('click', openExport);
  $('#calImportBtn')?.addEventListener('click', () => $('#calImport').click());
  $('#calImport')?.addEventListener('change', onImport);
}
// Natural-language quick-add (Fantastical-style): type "Ramen with Kenji Jul 3 7pm" → an event.
// Creates a USER event via saveUser (device-local); a live hint previews the parsed date/time.
function wireQuickAdd() {
  const form = $('#calQuickAdd'), input = $('#calQuickInput'), hint = $('#calQuickHint');
  if (!form || !input || form.dataset.wired) return;
  form.dataset.wired = '1';
  input.addEventListener('input', () => {
    const v = input.value.trim();
    const p = v ? parseEvent(v, TODAY) : null;
    hint.textContent = (p && p.title) ? `→ ${fmtShort(p.date)}${p.time ? ' · ' + p.time : ''}` : '';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    const p = parseEvent(v, TODAY);
    const title = p.title || v;
    const t = parseISO(p.date);
    if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); mode = 'month'; }   // land on the new event's month (the saveUser render shows it)
    saveUser([...loadUser(), { id: 'u' + Date.now(), title, date: p.date, endDate: '', time: p.time || '', category: 'personal', note: '' }]);
    input.value = ''; hint.textContent = '';
    dndToast(`Added: ${title} · ${fmtShort(p.date)}`);
    input.focus();
  });
}
function shift(d) {
  if (mode === 'week') { weekAnchor = addDaysISO(weekAnchor, 7 * d); render(); return; }   // week mode steps by a week
  viewM += d; while (viewM < 0) { viewM += 12; viewY--; } while (viewM > 11) { viewM -= 12; viewY++; } render();
}

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
  const goPill = `<button class="lg lg-going${goingOnly ? ' active' : ''}" id="lgGoing" type="button" aria-pressed="${goingOnly}" title="Show only the events you're going to">✓ Going</button>`;
  const taskPill = `<button class="lg lg-task${showTasks ? ' active' : ''}" id="lgTasks" type="button" aria-pressed="${showTasks}" title="Show checklist tasks that have a due date">☑ Tasks</button>`;
  el.innerHTML = goPill + taskPill + present.map(c =>
    `<button class="lg cat-${esc(c)} ${hiddenCats.has(c) ? 'off' : ''}" data-cat="${esc(c)}" aria-pressed="${!hiddenCats.has(c)}" title="Click to toggle · double-click to show only ${esc(c)}">${esc(c)}</button>`
  ).join('') + `<button class="lg-all" id="lgAll" type="button">${hiddenCats.size ? 'All' : 'None'}</button>`;
  const focusLg = (c) => $('#calLegend .lg[data-cat="' + (window.CSS ? CSS.escape(c) : c) + '"]')?.focus({ preventScroll: true });   // restore keyboard focus across the rebuild, but never auto-scroll the page
  $$('#calLegend .lg').forEach(b => {
    // single click toggles this category; double click isolates it (show only this). A 200ms timer
    // lets the dblclick cancel the pending single-click toggle so the two don't fight.
    b.addEventListener('click', () => {
      if (_legendTimer) { clearTimeout(_legendTimer); _legendTimer = null; return; }
      const c = b.dataset.cat;
      _legendTimer = setTimeout(() => {
        _legendTimer = null;
        if (hiddenCats.has(c)) hiddenCats.delete(c); else hiddenCats.add(c);
        persistFilters(); buildLegend(); render(); focusLg(c);
      }, 200);
    });
    b.addEventListener('dblclick', () => {
      if (_legendTimer) { clearTimeout(_legendTimer); _legendTimer = null; }
      const c = b.dataset.cat;
      const others = present.filter(x => x !== c);
      const isolated = !hiddenCats.has(c) && others.every(x => hiddenCats.has(x));
      hiddenCats.clear();
      if (!isolated) others.forEach(x => hiddenCats.add(x));   // isolate to c; if already isolated, un-isolate (show all)
      persistFilters(); buildLegend(); render(); focusLg(c);
    });
  });
  $('#lgGoing')?.addEventListener('click', () => {
    goingOnly = !goingOnly; setRaw(KEYS.calGoingOnly, goingOnly ? 'on' : 'off');
    buildLegend(); render(); $('#lgGoing')?.focus({ preventScroll: true });
  });
  $('#lgTasks')?.addEventListener('click', () => {
    showTasks = !showTasks; setRaw(KEYS.calShowTasks, showTasks ? 'on' : 'off'); _taskCache = null;
    buildLegend(); render(); $('#lgTasks')?.focus({ preventScroll: true });
  });
  $('#lgAll')?.addEventListener('click', () => {
    if (hiddenCats.size) hiddenCats.clear(); else present.forEach(c => hiddenCats.add(c));
    persistFilters(); buildLegend(); render();
    $('#lgAll')?.focus({ preventScroll: true });
  });
}
function persistFilters() { set(KEYS.calFilters, [...hiddenCats]); }

// ---- Notion-style keyboard shortcuts (active only on #/calendar) ----
// remove the focused/open event: user events delete; baked events leave your Going list (researched
// suggestions can't be deleted, only un-followed).
function removeEventByKey(id) {
  const ev = allEvents().find(x => x.id === id);
  if (!ev) return;
  if (ev.source === 'user') deleteUserEvent(id);            // → saveUser → data-changed → render + side-panel auto-close
  else if (isGoing(id)) toggleGoing(id);                    // baked + going → drop from your Going list
}
function onCalKeydown(e) {
  if (location.hash !== '#/calendar') return;
  if (document.querySelector('[aria-modal="true"]')) return;   // any open dialog (event editor/app/date-picker) owns the keyboard
  if (e.metaKey || e.ctrlKey || e.altKey) return;           // leave combos to the global/browser handlers
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

  if (e.key === '-' || e.key === 'Delete' || e.key === 'Backspace') {
    const chip = e.target.closest?.('.cal-chip[data-ev], .agenda-row[data-ev], .wkl-ev[data-ev], .wk-chip[data-ev]');
    const id = _sidePanelEv || chip?.dataset.ev;
    if (id) { e.preventDefault(); removeEventByKey(id); }
    return;
  }
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault(); const t = parseISO(TODAY); if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); weekAnchor = TODAY; mode = 'month'; render(); }
    $(`#calView .cal-date[data-day="${TODAY}"]`)?.focus({ preventScroll: true }); return;
  }
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault(); const day = e.target.closest?.('.cal-cell[data-day], .wk-dayhd[data-day]')?.dataset.day || TODAY; openModal(null, day); return;
  }
  // view switch (m/w/a) — Google-Calendar-style
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); if (mode !== 'month') { mode = 'month'; render(); } return; }
  if (e.key === 'w' || e.key === 'W') { e.preventDefault(); if (mode !== 'week') { mode = 'week'; render(); } return; }
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); if (mode !== 'agenda') { mode = 'agenda'; render(); } return; }
  // Shift+←/→ steps the whole period (month, or week in week mode) — distinct from plain arrows (day focus)
  if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); shift(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (mode === 'month' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    const cells = $$('#calView .cal-date[data-day]');
    if (!cells.length) return;
    const idx = cells.indexOf(e.target.closest?.('.cal-date'));
    if (idx < 0) { e.preventDefault(); cells[0].focus({ preventScroll: true }); return; }
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : 7;
    const next = cells[idx + delta];
    if (next) { e.preventDefault(); next.focus({ preventScroll: true }); }
  }
}

function renderMiniNav() {
  const host = $('#calMiniNav'); if (!host) return;
  const weeks = monthGrid(viewY, viewM);
  const rows = weeks.map(w => `<tr>${w.map(c =>
    `<td><button type="button" class="mn-day${c.inMonth ? '' : ' mn-out'}${c.iso === TODAY ? ' mn-today' : ''}" data-iso="${esc(c.iso)}" aria-label="${esc(c.iso)}">${c.day}</button></td>`
  ).join('')}</tr>`).join('');
  host.innerHTML = `
    <div class="mn-head">
      <button type="button" class="mn-arrow" data-mn="-1" aria-label="Previous month">&#x2039;</button>
      <span class="mn-title">${esc(MONTHS[viewM])} ${viewY}</span>
      <button type="button" class="mn-arrow" data-mn="1" aria-label="Next month">&#x203a;</button>
    </div>
    <table class="mn-grid"><thead><tr>${WEEKDAYS_SHORT.map(d => `<th scope="col">${esc(d)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  host.querySelectorAll('[data-mn]').forEach(b => b.addEventListener('click', () => { ({ year: viewY, month: viewM } = addMonths(viewY, viewM, +b.dataset.mn)); render(); }));
  host.querySelectorAll('.mn-day[data-iso]').forEach(b => b.addEventListener('click', () => jumpToDate(b.dataset.iso)));
}

function jumpToDate(iso) {
  const t = parseISO(iso); if (!t) return;
  viewY = t.getUTCFullYear(); viewM = t.getUTCMonth();
  if (mode === 'week') weekAnchor = iso;
  render();
}

function render() {
  _evCache = null; _taskCache = null;   // invalidate the per-render caches (data may have changed since last render)
  dismissPopover();
  const mEl = $('#calModeMonth'), wEl = $('#calModeWeek'), aEl = $('#calModeAgenda');
  mEl?.classList.toggle('active', mode === 'month'); mEl?.setAttribute('aria-pressed', String(mode === 'month'));
  wEl?.classList.toggle('active', mode === 'week'); wEl?.setAttribute('aria-pressed', String(mode === 'week'));
  aEl?.classList.toggle('active', mode === 'agenda'); aEl?.setAttribute('aria-pressed', String(mode === 'agenda'));
  const label = $('#calLabel');
  if (label) label.textContent = mode === 'agenda' ? `Agenda — from ${MONTHS[viewM]} ${viewY}` : mode === 'week' ? weekLabel() : `${MONTHS[viewM]} ${viewY}`;
  const unit = mode === 'week' ? 'week' : 'month';   // prev/next step by week in week mode
  $('#calPrev')?.setAttribute('aria-label', 'Previous ' + unit); $('#calNext')?.setAttribute('aria-label', 'Next ' + unit);
  const view = $('#calView'); if (!view) return;
  const panel = $('#calPanel');
  if (mode === 'month') {
    view.innerHTML = monthHTML();
    if (panel) { panel.hidden = false; panel.innerHTML = panelHTML(); wirePanel(); }
    wireCells();
    wireReschedule();
  } else if (mode === 'week') {
    view.innerHTML = weekHTML();
    if (panel) panel.hidden = true;   // the week view shows the whole week; the month deadline panel would duplicate
    wireWeek();
  } else {
    view.innerHTML = agendaHTML();
    if (panel) panel.hidden = true;   // agenda already lists everything; panel would duplicate
    wireAgenda();
  }
  renderMiniNav();
}

// ---- WEEK view (all-day lane + per-day add; bars/drag land in later stages) ----
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function weekLabel() {
  const days = weekDays(weekAnchor);
  const a = parseISO(days[0]), b = parseISO(days[6]);
  const am = MONTHS[a.getUTCMonth()].slice(0, 3), bm = MONTHS[b.getUTCMonth()].slice(0, 3);
  return am === bm
    ? `${am} ${a.getUTCDate()} – ${b.getUTCDate()}, ${b.getUTCFullYear()}`
    : `${am} ${a.getUTCDate()} – ${bm} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}
const isNarrowWeek = () => window.matchMedia('(max-width: 700px)').matches;
// mobile: a vertical day-by-day list (the 7-col grid is unusable on a phone; a vertical list also
// avoids the horizontal route-swipe conflict). Each day lists its overlapping events; multi-day
// events get a continues marker. Reuses the per-day ＋ (.wk-add) + click→openSidePanel wiring.
function weekListHTML() {
  const days = weekDays(weekAnchor);
  const evs = allEvents().filter(visible);
  return `<div class="wk-list">` + days.map(d => {
    const t = parseISO(d), dow = t.getUTCDay();
    const dayEvs = evs.filter(e => { const s = e.date.slice(0, 10), en = e.endDate ? e.endDate.slice(0, 10) : s; return s <= d && en >= d; })
      .sort((a, b) => a.date.localeCompare(b.date));
    const rows = dayEvs.map(e => {
      const s = e.date.slice(0, 10), en = e.endDate ? e.endDate.slice(0, 10) : s;
      const cont = isMultiDay(e) ? (d === s ? `<span class="wkl-cont">→ ${esc(fmtShort(en))}</span>` : d === en ? '<span class="wkl-cont">ends</span>' : '<span class="wkl-cont">ongoing ┄</span>') : '';
      return `<button type="button" class="wkl-ev" data-id="${esc(e.id)}" style="--cat:var(--c-${safeCat(e)}-ink)"><span class="wk-dot" aria-hidden="true"></span><span class="wk-bt">${esc(e.title)}</span>${cont}</button>`;
    }).join('') || '<p class="wkl-empty">No events</p>';
    const cls = (d === TODAY ? ' today' : '') + (dow === 0 || dow === 6 ? ' weekend' : '');
    return `<section class="wkl-day${cls}">
      <div class="wkl-head"><span class="wkl-dn">${DOW[dow]} ${t.getUTCDate()}</span>${d === TODAY ? '<span class="wkl-today">TODAY</span>' : ''}<button type="button" class="wk-add wkl-add" data-day="${esc(d)}" aria-label="Add event on ${esc(fmtShort(d))}">＋</button></div>
      <div class="wkl-evs">${rows}</div>
    </section>`;
  }).join('') + `</div>`;
}
function weekHTML() {
  if (isNarrowWeek()) return weekListHTML();
  const days = weekDays(weekAnchor);
  const hd = days.map(d => {
    const t = parseISO(d), dow = t.getUTCDay();
    const cls = (d === TODAY ? ' today' : '') + (dow === 0 || dow === 6 ? ' weekend' : '');
    return `<div class="wk-dayhd${cls}" data-day="${esc(d)}"><span class="wk-dn">${DOW[dow]}</span><span class="wk-dd">${t.getUTCDate()}</span></div>`;
  }).join('');

  // visible events overlapping the week → multi-day BARS (lane-packed) + single-day CHIPS.
  // allEvents()+clampSpan span events across columns without the month grid's SPAN_CAP flood-guard.
  const evs = allEvents().filter(visible);
  const packed = packLanes(evs.filter(isMultiDay), days);          // [{ev,lane,col0,col1,contL,contR}]
  const laneN = packed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  let lanes = '';
  for (let ln = 0; ln < laneN; ln++) lanes += `<div class="wk-lane">${packed.filter(p => p.lane === ln).map(barHTML).join('')}</div>`;

  const cols = Array.from({ length: 7 }, () => []);
  evs.filter(e => !isMultiDay(e)).forEach(e => { const i = days.indexOf(e.date.slice(0, 10)); if (i >= 0) cols[i].push(e); });
  const chips = cols.map(c => `<div class="wk-chipcol">${c.map(chipHTML).join('')}</div>`).join('');

  // always-visible per-day add (one ＋ per column, even when bars cover the day)
  const addrow = days.map(d => `<button type="button" class="wk-add" data-day="${esc(d)}" aria-label="Add event on ${esc(fmtShort(d))}">＋</button>`).join('');

  return `<div class="wk-grid">
    <div class="wk-daysrow">${hd}</div>
    <div class="wk-addrow" aria-label="Add an event">${addrow}</div>
    <div class="wk-allday" id="wkAllday">
      ${lanes || '<div class="wk-lane"></div>'}
      <div class="wk-chips">${chips}</div>
    </div>
  </div>`;
}
// a category guaranteed to have a --c-* token (an imported .ics could carry an arbitrary one →
// var(--c-<unknown>) would be undefined and the bar would render unstyled/unreadable)
function safeCat(e) { const c = catOf(e); return CATS.includes(c) ? c : 'imported'; }
function barHTML(p) {
  const e = p.ev, cls = (p.contL ? ' cont-l' : '') + (p.contR ? ' cont-r' : '');
  return `<button type="button" class="wk-bar${cls}" data-id="${esc(e.id)}" style="grid-column:${p.col0 + 1}/${p.col1 + 2};--cat:var(--c-${safeCat(e)}-ink)" title="${esc(e.title)}">`
    + `${p.contL ? '<span class="wk-arr" aria-hidden="true">‹</span>' : ''}<span class="wk-dot" aria-hidden="true"></span><span class="wk-bt">${esc(e.title)}</span>${p.contR ? '<span class="wk-arr" aria-hidden="true">›</span>' : ''}</button>`;
}
function chipHTML(e) {
  return `<button type="button" class="wk-chip" data-id="${esc(e.id)}" style="--cat:var(--c-${safeCat(e)}-ink)" title="${esc(e.title)}"><span class="wk-dot" aria-hidden="true"></span><span class="wk-bt">${esc(e.title)}</span></button>`;
}
function wireWeek() {
  const view = $('#calView'); if (!view) return;
  $$('#calView .wk-add').forEach(b => b.addEventListener('click', () => openModal(null, b.dataset.day)));   // quick-create an all-day event on that day
  // LOCKED decision: only SINGLE-DAY chips are draggable to reschedule (a multi-day seasonal bar must
  // never drag — that would shift the whole window). Bars are click-to-edit only. Day headers = drop targets.
  makeMovable(view, {
    itemSelector: '.wk-chip[data-id]', label: 'event',
    idOf: el => el.dataset.id,
    targetSelector: '.wk-dayhd[data-day]', keyOf: t => t.dataset.day,
    onMove: rescheduleEvent,
  });
  // click/Enter a chip OR bar → openSidePanel (baked → detail view w/ Going/Reset/Copy; user → edit modal).
  // A real drag releases over a day header, so it never also fires this.
  $$('#calView .wk-chip[data-id], #calView .wk-bar[data-id], #calView .wkl-ev[data-id]').forEach(el => el.addEventListener('click', () => {
    const ev = allEvents().find(x => x.id === el.dataset.id);
    if (ev) openSidePanel(ev, el);
  }));
}

function pad(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function monthHTML() {
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // stable 6-row grid: monthGrid() yields 42 cells {iso, day, inMonth}; out-of-month days render dimmed
  const cells = monthGrid(viewY, viewM).flat().map((c, i) => {
    const date = c.iso;
    const weekend = (i % 7 === 0) || (i % 7 === 6);
    const evs = c.inMonth ? eventsOn(date, true) : [];
    const tks = c.inMonth ? tasksOn(date) : [];
    const isToday = date === TODAY;
    const hasBook = evs.some(e => e.bookBy);
    const seasonStart = evs.find(e => e.endDate && daysBetween(e.date.slice(0, 10), e.endDate.slice(0, 10)) > SPAN_CAP);
    // events first, then task chips; cap the cell at 3 with a "+N more" overflow (opens the popover)
    const all = [...evs.map(e => ({ ev: e })), ...tks.map(t => ({ tk: t }))];
    const chips = all.slice(0, 3).map(x => {
      if (x.tk) return taskChipHTML(x.tk);
      const e = x.ev, ong = e.endDate && daysBetween(e.date.slice(0, 10), e.endDate.slice(0, 10)) > SPAN_CAP ? ' ›' : '';
      return `<button class="cal-chip cat-${esc(catOf(e))}" data-ev="${esc(e.id)}" title="${esc(e.title)}"><span class="cc-t">${esc(e.title)}${ong}</span></button>`;
    }).join('');
    const more = all.length > 3 ? `<button type="button" class="cal-more" data-day="${esc(date)}">+${all.length - 3} more</button>` : '';
    const bk = hasBook ? `<span class="bk-dot" title="has a booking deadline"></span>` : '';
    const aria = `${esc(date)}, ${evs.length} event${evs.length === 1 ? '' : 's'}${tks.length ? `, ${tks.length} task${tks.length === 1 ? '' : 's'}` : ''}`;
    const cls = ['cal-cell', isToday && 'today', !c.inMonth && 'out', weekend && 'weekend', seasonStart && 'season-start'].filter(Boolean).join(' ');
    return `<div class="${cls}"${seasonStart ? ` style="--stripe:var(--c-${esc(catOf(seasonStart))})"` : ''} data-day="${esc(date)}">
      <span class="cal-row"><button type="button" class="cal-date" data-day="${esc(date)}" aria-label="${aria}">${c.day}</button>${bk}</span>
      ${chips}${more}</div>`;
  }).join('');
  return `<div class="cal-dowrow">${dows.map(x => `<div class="cal-dow">${esc(x)}</div>`).join('')}</div><div class="cal-grid">${cells}</div>`;
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
    const ev = allEvents().find(x => x.id === b.dataset.ev); if (ev) openSidePanel(ev, b);
  }));
  // (removed the auto-scroll-to-next-deadline: it fired on every render — incl. legend-filter clicks —
  //  and jolted the viewport. The panel is short; no auto-positioning needed.)
}

function agendaHTML() {
  // merge upcoming events + checklist tasks (with a due date) into one date-sorted stream
  const evRows = allEvents().filter(e => visible(e) && (e.endDate || e.date).slice(0, 10) >= TODAY).map(e => ({ date: e.date, ev: e }));
  const tkRows = allTasks().filter(t => t.date.slice(0, 10) >= TODAY).map(t => ({ date: t.date, tk: t }));
  const upcoming = [...evRows, ...tkRows].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
  if (!upcoming.length) {
    const hidden = hiddenCats.size > 0;
    return `<div class="empty empty-state">
      <div class="empty-emoji" aria-hidden="true">📭</div>
      <p class="empty-h">No upcoming events${hidden ? ' in the shown categories' : ''}.</p>
      ${hidden ? '<p class="empty-sub">Some categories are filtered out — tap a greyed legend chip above to show them.</p>' : ''}
    </div>`;
  }
  let last = '';
  return `<div class="agenda">${upcoming.map(x => {
    const mk = x.date.slice(0, 7);
    const head = mk !== last ? (last = mk, `<div class="agenda-month">${MONTHS[+x.date.slice(5, 7) - 1]} ${x.date.slice(0, 4)}</div>`) : '';
    if (x.tk) {
      const t = x.tk;
      return head + `<div class="agenda-row agenda-task" data-task="${esc(t.taskId)}">
        <span class="agenda-date cat-task">${esc(fmtShort(t.date))}</span>
        <span class="agenda-body"><button type="button" class="agenda-title" data-task="${esc(t.taskId)}">☑ ${esc(t.title)}</button>
          <span class="agenda-area">checklist task</span></span></div>`;
    }
    const e = x.ev;
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
    r.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop]')) return;
      if (r.dataset.task) { gotoTask(r.dataset.task); return; }
      const ev = allEvents().find(x => x.id === r.dataset.ev); if (ev) openSidePanel(ev, e.target.closest('button') || r);
    });
  });
}

// ---- day popover ----
function wireCells() {
  $$('#calView .cal-cell[data-day]').forEach(c => {
    // the .cal-date button is the keyboard-focusable trigger; its click bubbles here. A chip click
    // opens the event; any other click on the cell (the date button or empty space) opens the day popover.
    c.addEventListener('click', (e) => {
      const chip = e.target.closest('.cal-chip');
      if (chip) {
        if (chip.dataset.task) { gotoTask(chip.dataset.task); return; }     // task chip → jump to the checklist item
        const ev = allEvents().find(x => x.id === chip.dataset.ev); if (ev) openSidePanel(ev, chip); return;
      }
      dayPopover(c.dataset.day, c);
    });
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
    onMove: rescheduleEvent,
  });
}
// shared reschedule (month grid + week chips): user → edit date (keep span); baked → date override.
function rescheduleEvent(id, day) {
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
  const tks = tasksOn(date);
  const evRows = evs.map(e => `
    <div class="pop-row">
      <span class="pop-sw cat-${esc(catOf(e))}"></span>
      <span class="pop-body"><button class="pop-open" data-ev="${esc(e.id)}">${esc(e.title)}</button>
        ${e.bookBy ? `<span class="pop-book">book by ${esc(fmtShort(e.bookBy))}</span>` : ''}</span>
      <a class="pop-gcal" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" title="Add to Google Calendar">+G</a>
    </div>`).join('');
  const tkRows = tks.map(t => `
    <div class="pop-row">
      <span class="pop-sw cat-task"></span>
      <span class="pop-body"><button class="pop-task" data-task="${esc(t.taskId)}">☑ ${esc(t.title)}</button>
        <span class="pop-book">checklist task</span></span>
    </div>`).join('');
  const rows = (evs.length || tks.length) ? evRows + tkRows : `<p class="pop-empty">Nothing booked this day.</p>`;
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
  popEl.querySelectorAll('.pop-open').forEach(b => b.addEventListener('click', () => { const ev = allEvents().find(x => x.id === b.dataset.ev); dismissPopover(); if (ev) openSidePanel(ev, anchor); }));
  popEl.querySelectorAll('.pop-task').forEach(b => b.addEventListener('click', () => gotoTask(b.dataset.task)));
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

// ---- slide-in side panel (replaces openDetail as the event-detail surface) ----
function closeSidePanel() {
  const panel = $('#calSidePanel');
  if (!panel) return;
  panel.classList.remove('is-open');
  // wait for CSS transition before hiding (150ms exit, matches CSS)
  setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 160);
  if (_sidePanelCleanup) { _sidePanelCleanup(); _sidePanelCleanup = null; }
  const trig = _sidePanelTrigger;
  _sidePanelEv = null;
  _sidePanelTrigger = null;
  if (trig && document.contains(trig)) trig.focus();
  else $('#calAdd')?.focus();
}

function openSidePanel(ev, trigger) {
  if (_sidePanelCleanup) { _sidePanelCleanup(); _sidePanelCleanup = null; }
  _sidePanelTrigger = trigger || document.activeElement;
  _sidePanelEv = ev.id;
  const panel = $('#calSidePanel');
  if (!panel) return;
  // Portal to <body>: the panel is position:fixed but lives inside <main> (z-index:1), which
  // traps its z-index:101 in main's stacking context — so the sticky route-nav (z40) and topbar
  // (z50) paint OVER the panel's header + close button. Reparenting to body lets z-index:101 win.
  if (panel.parentElement !== document.body) document.body.appendChild(panel);

  const isBaked = ev.source !== 'user';
  const going = isGoing(ev.id);
  const dateRange = esc(fmtDate(ev.date)) + (ev.endDate ? ' – ' + esc(fmtDate(ev.endDate)) : '');
  const actions = isBaked
    ? `<button class="btn ${going ? 'primary' : ''}" id="spGoing" aria-pressed="${going ? 'true' : 'false'}">${going ? '✓ Going' : '＋ Going'}</button>
       ${ev.moved ? '<button class="btn" id="spReset">↺ Reset date</button>' : ''}
       <button class="btn" id="spPlan">＋ Add to day plan</button>
       <a class="btn ghost" href="${esc(gcalUrl(ev))}" target="_blank" rel="noopener noreferrer">+ Google Calendar</a>
       <button class="btn" id="spCopy">Copy to my events</button>`
    : `<button class="btn" id="spEdit">Edit</button>
       <button class="btn ${going ? 'primary' : ''}" id="spGoing" aria-pressed="${going ? 'true' : 'false'}">${going ? '✓ Going' : '＋ Going'}</button>
       <a class="btn ghost" href="${esc(gcalUrl(ev))}" target="_blank" rel="noopener noreferrer">+ Google Calendar</a>
       <button class="btn danger" id="spDel">Delete</button>`;

  panel.innerHTML = `
    <div class="sp-backdrop" id="spBackdrop" aria-hidden="true"></div>
    <div class="sp-inner" role="dialog" aria-modal="true" aria-label="${esc(ev.title)}">
      <div class="sp-head">
        <h2 class="sp-title">${esc(ev.title)}</h2>
        <button class="sp-close" id="spClose" aria-label="Close">✕</button>
      </div>
      <div class="sp-body">
        <div class="sp-row"><span class="sp-icon" aria-hidden="true">📅</span><span>${dateRange}</span></div>
        ${ev.area ? `<div class="sp-row"><span class="sp-icon" aria-hidden="true">📍</span><span>${esc(ev.area)}</span></div>` : ''}
        ${ev.category ? `<div class="sp-row"><span class="sp-icon" aria-hidden="true">🏷</span><span>${esc(ev.category)}</span></div>` : ''}
        ${ev.cost ? `<div class="sp-row"><span class="sp-icon" aria-hidden="true">💴</span><span>${esc(ev.cost)}</span></div>` : ''}
        ${ev.bookBy ? `<div class="sp-row sp-bookby"><span class="sp-icon" aria-hidden="true">🎟️</span><span>Book by <b>${esc(fmtDate(ev.bookBy))}</b></span></div>` : ''}
        ${(ev.note || ev.bookingNotes || ev.why) ? `<p class="sp-note">${esc(ev.note || ev.bookingNotes || ev.why || '')}</p>` : ''}
        ${ev.moved ? '<p class="sp-moved">↩ You rescheduled this from its researched date.</p>' : ''}
        ${srcline(ev.sources)}
      </div>
      <div class="sp-actions">${actions}</div>
    </div>`;

  panel.hidden = false;
  // rAF so the hidden→visible transition actually fires
  requestAnimationFrame(() => { requestAnimationFrame(() => { panel.classList.add('is-open'); }); });

  // wire actions
  panel.querySelector('#spClose')?.addEventListener('click', closeSidePanel);
  panel.querySelector('#spBackdrop')?.addEventListener('click', closeSidePanel);
  panel.querySelector('#spGoing')?.addEventListener('click', () => { toggleGoingEv(ev); openSidePanel(ev, _sidePanelTrigger); });
  if (isBaked) {
    panel.querySelector('#spReset')?.addEventListener('click', () => { const { [ev.id]: _d, ...o } = loadOverrides(); saveOverrides(o); closeSidePanel(); });
    panel.querySelector('#spPlan')?.addEventListener('click', () => { addEventToPlan(ev); closeSidePanel(); });
    panel.querySelector('#spCopy')?.addEventListener('click', () => { copyBakedToUser(ev); closeSidePanel(); });
  } else {
    panel.querySelector('#spEdit')?.addEventListener('click', () => { closeSidePanel(); openModal(ev); });
    panel.querySelector('#spDel')?.addEventListener('click', () => { deleteUserEvent(ev.id); });  // single-path: deleteUserEvent→saveUser→jwh:data-changed→render; auto-close below
  }

  // Source links: open reliably in a new tab on click (user-initiated window.open can't be popup-
  // blocked). Keep the href for middle-click / new-tab / screen readers.
  panel.querySelectorAll('.sp-body .modal-src a[href]').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); });
  });

  // Esc closes
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeSidePanel(); } };
  document.addEventListener('keydown', onKey, true);
  _sidePanelCleanup = () => document.removeEventListener('keydown', onKey, true);

  // focus first focusable element inside the panel
  setTimeout(() => { panel.querySelector('#spClose, button, [href]')?.focus(); }, 40);
}

// Auto-close side panel when the open event disappears (delete / external change)
document.addEventListener('jwh:data-changed', () => {
  if (!_sidePanelEv) return;
  if (!allEvents().find(x => x.id === _sidePanelEv)) closeSidePanel();
});

// ---- shared event actions (used by both the modal handlers and the context menu) ----
function toggleGoingEv(ev) { toggleGoing(ev.id); }                     // toggleGoing dispatches
function addEventToPlan(ev) {
  const c = approxCoord(DATA.areaGeo, ev.area || '', ev.title);
  upsertStop(ev.date.slice(0, 10), newStop({ name: ev.title, area: ev.area || '', lat: c.lat, lng: c.lng, coordKind: 'approx', seed: Math.random() }));   // upsertStop → dispatch
  alertModal(`Added “${ev.title}” to your plan for ${fmtDate(ev.date)}.`);
}
// "＋ Add to checklist": create a custom checklist item from the event (title + its
// date as the due hint), landing in "My tasks". Re-renders the checklist + dashboard
// via their jwh:data-changed listeners (no content.js import → no cycle).
function addEventToChecklist(ev) {
  saveChecklistCustom([...loadChecklistCustom(),
    customItem(ev.title, 'My tasks', (ev.date || '').slice(0, 10), 'cku' + Date.now())]);
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  dndToast('Added to checklist');
}
function copyBakedToUser(ev) {
  saveUser([...loadUser(), { id: 'u' + Date.now(), title: ev.title, date: ev.date.slice(0, 10), endDate: (ev.endDate || '').slice(0, 10), category: ev.category || 'personal', note: ev.bookingNotes || ev.why || '', area: ev.area || '', bookBy: ev.bookBy || '', copyOf: ev.id }]);
}
let pendingUndo = null, undoTimer = null;
function clearPending() { pendingUndo = null; if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; } }

function deleteUserEvent(id) {
  const event = loadUser().find(x => x.id === id);
  if (!event) return;                                          // already gone — nothing to delete/undo
  const lp = loadPlaces().find(p => p.eventId === id);         // the place (if any) linked to this event
  const place = lp ? { id: lp.id, eventId: lp.eventId, date: lp.date, remindDate: lp.remindDate } : null;   // snapshot BEFORE teardown
  if (lp) patchPlace(lp.id, { eventId: '', date: '', remindDate: '' });   // clear the back-ref (silent — patchPlace doesn't dispatch)
  saveUser(loadUser().filter(x => x.id !== id));               // saveUser dispatches once → render
  clearPending();                                              // supersede any prior undoable delete (it becomes permanent)
  pendingUndo = { event, place };
  undoTimer = setTimeout(clearPending, 4200);                  // window matches dndToast's auto-dismiss
  dndToast(`Deleted “${event.title}”`, undoLastDelete);        // dndToast uses textContent → title is injection-safe
}

// Restore the most-recently-deleted event (Undo button or Ctrl/Cmd+Z). Returns true if it undid something.
export function undoLastDelete() {
  if (!pendingUndo) return false;
  const { event, place } = pendingUndo;                        // atomic consume: capture, then clear BEFORE mutating
  clearPending();
  if (place) patchPlace(place.id, { eventId: place.eventId, date: place.date, remindDate: place.remindDate });   // re-link first (silent) …
  saveUser([...loadUser(), event]);                            // … then save: one dispatch renders both. Original id → Going + place links reconnect.
  return true;
}
function focusAdd() { $('#calAdd')?.focus(); }                 // after a mutating menu action, render destroys the trigger

// Map an event object to concrete menu items (label + run). Spec (labels/order/danger) is pure (lib/calevents).
function eventMenuItems(ev) {
  const RUN = {
    open: () => openSidePanel(ev),
    edit: () => openModal(ev),
    duplicate: () => { saveUser([...loadUser(), duplicateUserEvent(ev, 'u' + Date.now())]); focusAdd(); },
    plan: () => addEventToPlan(ev),
    checklist: () => addEventToChecklist(ev),
    gcal: () => window.open(gcalUrl(ev), '_blank', 'noopener'),
    going: () => { toggleGoingEv(ev); focusAdd(); },
    copy: () => { copyBakedToUser(ev); focusAdd(); },
    delete: () => { deleteUserEvent(ev.id); focusAdd(); },
  };
  return eventMenuSpec(ev, { isGoing: isGoing(ev.id) }).map(it => it.sep ? { sep: true } : { label: it.label, danger: it.danger, run: RUN[it.key] });
}

// Resolve a DOM node to event menu items, or null if it's not an event trigger. Exported for gestures.js.
export function getEventMenu(node) {
  const trig = node?.closest?.('.cal-chip[data-ev], .agenda-title[data-ev], .agenda-row[data-ev], .pop-open[data-ev], .cp-deadline[data-ev]');
  if (!trig) return null;
  const ev = allEvents().find(x => x.id === trig.dataset.ev);
  return ev ? eventMenuItems(ev) : null;
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
      <label class="ev-loc-field">Location (optional)
        <input name="area" id="evArea" value="${esc(e.area || '')}" placeholder="Search an address…" autocomplete="off">
        <ul id="evAreaSug" class="ev-loc-sug" role="listbox" aria-label="Address suggestions"></ul>
      </label>
      <label>Note<textarea name="note" rows="3">${esc(e.note || '')}</textarea></label>
      <div class="modal-actions">
        ${ev && ev.id ? `<button type="button" class="btn ${isGoing(ev.id) ? 'primary' : ''}" id="mdGoingU" aria-pressed="${isGoing(ev.id) ? 'true' : 'false'}">${isGoing(ev.id) ? '✓ Going' : '＋ Going'}</button>` : ''}
        ${ev ? '<button type="button" class="btn danger" id="mdDel">Delete</button>' : ''}
        ${gbtn}
        <button type="submit" class="btn primary">${ev ? 'Save' : 'Add'}</button>
      </div>
    </form>`;
  const ov = showModal(body);
  wireLocationField(ov);
  ov.querySelector('#mdGoingU')?.addEventListener('click', () => { toggleGoingEv(ev); closeModal(ov, { rerender: true }); });
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
  ov.querySelector('#mdDel')?.addEventListener('click', () => { deleteUserEvent(ev.id); closeModal(ov, { rerender: true }); });
}

// Debounced Nominatim autocomplete for the event form's Location (area) field. Mirrors the map's
// add-place throttle (>=1.1s between requests). Picking a suggestion fills the input; FormData then
// persists it as event.area. Every remote string is esc()'d before innerHTML.
function wireLocationField(ov) {
  const input = ov.querySelector('#evArea'), sug = ov.querySelector('#evAreaSug');
  if (!input || !sug) return;
  let timer, controller, lastReq = 0;
  const clear = () => { sug.innerHTML = ''; };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { clear(); return; }
    const run = async () => {
      const now = Date.now();
      const wait = 1100 - (now - lastReq);
      if (wait > 0) { timer = setTimeout(run, wait); return; }   // throttle, don't drop
      lastReq = now;
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const matches = await searchJP(q, controller.signal);
        if (!sug.isConnected) return;                            // modal closed mid-request → bail (no detached write)
        sug.innerHTML = matches.length
          ? matches.map(m => `<li><button type="button" class="ev-loc-opt" data-addr="${esc(m.addr)}">${esc(m.addr)}</button></li>`).join('')
          : '<li class="ev-loc-msg">No matches</li>';
      } catch (e) { if (e.name !== 'AbortError' && sug.isConnected) sug.innerHTML = '<li class="ev-loc-msg">Search unavailable — try again</li>'; }
    };
    timer = setTimeout(run, 450);
  });
  // Select on mousedown (fires BEFORE the input's blur) + preventDefault so focus/selection isn't lost —
  // avoids the blur-vs-click race entirely (no timing-dependent setTimeout).
  sug.addEventListener('mousedown', (e) => {
    const b = e.target.closest('.ev-loc-opt'); if (!b) return;
    e.preventDefault();
    input.value = b.dataset.addr; clear();
  });
  input.addEventListener('blur', clear);   // mousedown already committed any selection, so a plain clear is safe
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
