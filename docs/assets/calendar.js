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
import { isGoing, toggleGoing, setGoing } from './lib/going.js';
import { approxCoord } from './lib/geo.js';
import { makeMovable, dndToast } from './dnd.js';
import { duplicateUserEvent, eventMenuSpec } from './lib/calevents.js';
import { customItem, loadChecklistCustom, saveChecklistCustom } from './lib/checklist.js';
import { checklistItems, revealChecklistItem } from './checklist-page.js';
import { parseEvent } from './lib/nlevent.js';
import { openMenu } from './lib/menu.js';
import { monthGrid, addMonths, WEEKDAYS_SHORT } from './lib/minical.js';
import { weekDays, isMultiDay, packLanes, parseHM, layoutDay } from './lib/weekgrid.js';
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
  const areaOv = get(KEYS.evArea, {}) || {};   // user-edited locations (Going page ✎) — works for baked AND user events
  const hidden = new Set(get(KEYS.evHidden, []) || []);   // baked events the user deleted (tips.json itself is immutable)
  _evCache = [...bakedEvents().filter(e => !copied.has(e.id) && !hidden.has(e.id)), ...user]
    .filter(e => parseISO(e.date))
    .map(e => (typeof areaOv[e.id] === 'string' && areaOv[e.id]) ? { ...e, area: areaOv[e.id] } : e);
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
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route !== 'calendar') { closeSidePanel(); dismissPopover(); } });   // the side panel + day popover are portaled to <body> (fixed) — close them when leaving the calendar so they don't hang over other pages
  // EF3: while the calendar is hidden, a data change marks it dirty instead of re-rendering
  // the whole month grid (render on next entry). The _evCache invalidation listener above is
  // separate and stays unconditional — other pages read allEvents() fresh.
  document.addEventListener('jwh:data-changed', () => {
    if (document.getElementById('view-calendar')?.classList.contains('is-active')) render();
    else _calDirty = true;
  });
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
    const id = 'u' + Date.now();
    setGoing(id, true);   // a quick-added event is a plan you're making — mark it ✓ Going up front
    saveUser([...loadUser(), { id, title, date: p.date, endDate: '', time: p.time || '', category: 'personal', note: '' }]);
    input.value = ''; hint.textContent = '';
    dndToast(`Added ✓ Going: ${title} · ${fmtShort(p.date)}`);
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
  else hideBakedEvent(id, ev.title);                        // baked → hide from the merged stream (undoable via the toast)
}
// "Delete" for a researched event: tips.json is immutable, so hide its id from allEvents()
// (calendar, Going, map, dashboard all re-derive). The toast offers Undo.
function hideBakedEvent(id, title) {
  set(KEYS.evHidden, [...new Set([...(get(KEYS.evHidden, []) || []), id])]);
  if (isGoing(id)) toggleGoing(id);                          // also drop it from Going (toggle dispatches data-changed)
  else document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  closeSidePanel();
  dndToast(`Deleted “${title}”`, () => {
    set(KEYS.evHidden, (get(KEYS.evHidden, []) || []).filter(x => x !== id));
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  });
}
function onCalKeydown(e) {
  if (location.hash !== '#/calendar') return;
  // any open dialog (event editor/app/date-picker) owns the keyboard — EXCEPT our own event
  // side panel: it's aria-modal too, and it's exactly where −/Del/Backspace should delete the
  // open event (this guard used to kill the panel path, so Backspace "never worked")
  const sp = document.getElementById('calSidePanel');
  const inSidePanel = !!(sp && !sp.hidden && sp.classList.contains('is-open'));   // the popover is role=dialog, not aria-modal — detect it directly
  const modal = document.querySelector('[aria-modal="true"]');                    // a genuine modal (event editor / day popover)
  if (modal && !inSidePanel) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;           // leave combos to the global/browser handlers
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

  if (e.key === '-' || e.key === 'Delete' || e.key === 'Backspace') {
    const chip = e.target.closest?.('.cal-chip[data-ev], .agenda-row[data-ev], .wkl-ev[data-ev], .wk-chip[data-ev]');
    const id = _sidePanelEv || chip?.dataset.ev;
    if (id) { e.preventDefault(); removeEventByKey(id); }
    return;
  }
  if (inSidePanel) return;   // with the panel open, ONLY the remove keys apply — arrows/n/t stay out of a dialog
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault(); const t = parseISO(TODAY); if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); weekAnchor = TODAY; mode = 'month'; render(); }
    $(`#calView .cal-date[data-day="${TODAY}"]`)?.focus({ preventScroll: true }); return;
  }
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault(); const day = e.target.closest?.('.cal-cell[data-day], .wk2-dayhd[data-day], .wk2-add[data-day]')?.dataset.day || TODAY; openModal(null, day); return;
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
  TODAY = nowISO();   // a tab left open across midnight must not keep highlighting yesterday
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
    wireMonthSelect();
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
  requestAnimationFrame(alignRail);
}

// align the sidebar rail to the GRID's real height (owner: "aligned so we just scroll") — the
// rail scrolls internally instead of running past the month. Boot renders while the view is
// hidden (rects are 0), so this also re-runs on every entry to #/calendar. Non-month uncaps.
function alignRail() {
  const p = document.querySelector('.cal-panel'), g = document.querySelector('.cal-weeks');
  if (!p) return;
  if (mode === 'month' && g && g.offsetHeight > 300) {
    p.style.maxHeight = Math.round(g.getBoundingClientRect().bottom - p.getBoundingClientRect().top) + 'px';
  } else { p.style.maxHeight = ''; }
}
let _calDirty = false;
document.addEventListener('jwh:route', (e) => {
  if (e.detail?.route !== 'calendar') return;
  if (_calDirty) { _calDirty = false; render(); }   // EF3: catch up on changes made while hidden
  requestAnimationFrame(alignRail);
  setTimeout(alignRail, 300);   // again after the view transition settles — the rAF can land mid-swap
});

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
const WK_HH = 44;   // px per hour in the time grid

// a single-day event's timed placement, or null if it's all-day (goes to the band).
// no endTime, or a bad one → a default 60-min block.
function timedOf(e) {
  if (isMultiDay(e)) return null;
  const start = parseHM(e.time);
  if (start == null) return null;
  let end = parseHM(e.endTime);
  if (end == null || end <= start) end = Math.min(24 * 60, start + 60);
  return { startMin: start, endMin: end };
}

function weekHTML() {
  if (isNarrowWeek()) return weekListHTML();
  const days = weekDays(weekAnchor);
  const hd = days.map(d => {
    const t = parseISO(d), dow = t.getUTCDay();
    const cls = (d === TODAY ? ' today' : '') + (dow === 0 || dow === 6 ? ' weekend' : '');
    return `<div class="wk2-dayhd${cls}" data-day="${esc(d)}"><span class="wk2-dn">${DOW[dow]}</span><span class="wk2-dd">${t.getUTCDate()}</span><button type="button" class="wk2-add" data-day="${esc(d)}" aria-label="Add event on ${esc(fmtShort(d))}">＋</button></div>`;
  }).join('');

  const evs = allEvents().filter(visible);
  // multi-day → lane-packed BARS in the all-day band (reuses barHTML + the drag-resize wiring)
  const packed = packLanes(evs.filter(isMultiDay), days);
  const laneN = packed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  let lanes = '';
  for (let ln = 0; ln < laneN; ln++) lanes += `<div class="wk-lane">${packed.filter(p => p.lane === ln).map(barHTML).join('')}</div>`;
  // single-day, NO time → chips in the band; single-day WITH time → positioned in the hour grid
  const bandCols = Array.from({ length: 7 }, () => []);
  const timedCols = Array.from({ length: 7 }, () => []);
  evs.filter(e => !isMultiDay(e)).forEach(e => {
    const i = days.indexOf(e.date.slice(0, 10)); if (i < 0) return;
    const t = timedOf(e); if (t) timedCols[i].push({ id: e.id, ev: e, ...t }); else bandCols[i].push(e);
  });
  const chips = bandCols.map(c => `<div class="wk-chipcol">${c.map(chipHTML).join('')}</div>`).join('');

  // hour gutter (JST, 24h) — a label sits at the top of each hour block
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="wk2-hr" style="height:${WK_HH}px"><span>${String(h).padStart(2, '0')}</span></div>`).join('');

  // 7 day columns: hour rules (bg gradient) + absolutely-positioned timed blocks + now-line on today
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const dayCols = days.map((d, i) => {
    const laid = layoutDay(timedCols[i]);
    const blocks = laid.map(b => {
      const top = Math.round(b.startMin / 60 * WK_HH);
      const h = Math.max(20, Math.round((b.endMin - b.startMin) / 60 * WK_HH));
      const w = 100 / b.cols, left = b.col * w;
      const tm = b.ev.time + (b.ev.endTime ? '–' + b.ev.endTime : '');
      const aria = `${b.ev.time}${b.ev.endTime ? ' to ' + b.ev.endTime : ''}, ${b.ev.title}`;
      return `<button type="button" class="wk2-ev" data-id="${esc(b.id)}" style="top:${top}px;height:${h}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);--cat:var(--c-${safeCat(b.ev)}-ink)" aria-label="${esc(aria)}">`
        + `<span class="wk2-etime" aria-hidden="true">${esc(tm)}</span><span class="wk2-et" aria-hidden="true">${esc(b.ev.title)}</span></button>`;
    }).join('');
    const now = d === TODAY ? `<div class="wk2-now" style="top:${Math.round(nowMin / 60 * WK_HH)}px"><span class="wk2-now-dot"></span></div>` : '';
    return `<div class="wk2-col${d === TODAY ? ' today' : ''}" data-day="${esc(d)}" style="height:${24 * WK_HH}px">${now}${blocks}</div>`;
  }).join('');

  return `<div class="wk2">
    <div class="wk2-head"><div class="wk2-corner"></div>${hd}</div>
    <div class="wk2-band">
      <div class="wk2-blabel">all-day</div>
      <div class="wk2-bcols" id="wkAllday">
        ${lanes || '<div class="wk-lane"></div>'}
        <div class="wk-chips">${chips}</div>
      </div>
    </div>
    <div class="wk2-scroll" id="wkScroll" tabindex="0" role="group" aria-label="Hour grid — scroll through the day">
      <div class="wk2-inner" style="height:${24 * WK_HH}px">
        <div class="wk2-hours">${hours}</div>
        ${dayCols}
      </div>
    </div>
  </div>`;
}
// a category guaranteed to have a --c-* token (an imported .ics could carry an arbitrary one →
// var(--c-<unknown>) would be undefined and the bar would render unstyled/unreadable)
function safeCat(e) { const c = catOf(e); return CATS.includes(c) ? c : 'imported'; }
function barHTML(p) {
  const e = p.ev, cls = (p.contL ? ' cont-l' : '') + (p.contR ? ' cont-r' : '');
  const user = e.source === 'user';   // only your own events resize (baked spans are fixed research)
  const gl = (user && !p.contL) ? '<span class="wk-resize wk-resize-l" aria-hidden="true"></span>' : '';   // grips only on edges visible this week
  const gr = (user && !p.contR) ? '<span class="wk-resize wk-resize-r" aria-hidden="true"></span>' : '';
  return `<button type="button" class="wk-bar${cls}${user ? ' wk-user' : ''}" data-id="${esc(e.id)}" style="grid-column:${p.col0 + 1}/${p.col1 + 2};--cat:var(--c-${safeCat(e)}-ink)" title="${esc(e.title)}">`
    + `${gl}${p.contL ? '<span class="wk-arr" aria-hidden="true">‹</span>' : ''}<span class="wk-dot" aria-hidden="true"></span><span class="wk-bt">${esc(e.title)}</span>${p.contR ? '<span class="wk-arr" aria-hidden="true">›</span>' : ''}${gr}</button>`;
}
function chipHTML(e) {
  return `<button type="button" class="wk-chip" data-id="${esc(e.id)}" style="--cat:var(--c-${safeCat(e)}-ink)" title="${esc(e.title)}"><span class="wk-dot" aria-hidden="true"></span><span class="wk-bt">${esc(e.title)}</span></button>`;
}
function wireWeek() {
  const view = $('#calView'); if (!view) return;
  $$('#calView .wk-add, #calView .wk2-add').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openModal(null, b.dataset.day); }));   // per-day add (mobile list ＋ and desktop day-header ＋) — keyboard-reachable
  wireWeekDragCreate();
  wireWeekResize();
  // LOCKED decision: only SINGLE-DAY chips are draggable to reschedule (a multi-day seasonal bar must
  // never drag — that would shift the whole window). Bars are click-to-edit only. Day headers = drop targets.
  makeMovable(view, {
    itemSelector: '.wk-chip[data-id]', label: 'event',
    idOf: el => el.dataset.id,
    targetSelector: '.wk2-dayhd[data-day]', keyOf: t => t.dataset.day,
    onMove: rescheduleEvent,
  });
  // click an EMPTY spot in a day column → new event at that day + rounded hour (grid view only)
  $$('#calView .wk2-col[data-day]').forEach(col => col.addEventListener('click', (e) => {
    if (e.target.closest('.wk2-ev')) return;                  // a block owns its own click → panel
    const rect = col.getBoundingClientRect();
    const min = Math.max(0, Math.min(23 * 60, Math.round((e.clientY - rect.top) / WK_HH * 60 / 30) * 30));
    const hh = String(Math.floor(min / 60)).padStart(2, '0'), mm = String(min % 60).padStart(2, '0');
    openModal(null, col.dataset.day, '', `${hh}:${mm}`);
  }));
  // auto-scroll the hour grid to ~7am (or an hour before "now" if today is in view)
  const scroll = $('#wkScroll');
  if (scroll && !scroll.dataset.scrolled) {
    scroll.dataset.scrolled = '1';
    const days = weekDays(weekAnchor);
    const target = days.includes(TODAY) ? Math.max(0, (new Date().getHours() - 1)) : 7;
    scroll.scrollTop = target * WK_HH;
  }
  // click/Enter a chip OR bar → openSidePanel (baked → detail view w/ Going/Reset/Copy; user → edit modal).
  // A real drag releases over a day header, so it never also fires this.
  $$('#calView .wk-chip[data-id], #calView .wk-bar[data-id], #calView .wkl-ev[data-id], #calView .wk2-ev[data-id]').forEach(el => el.addEventListener('click', () => {
    if (_wkResizeSuppressClick) return;                       // a resize drag just ended on this bar — don't also open it
    const ev = allEvents().find(x => x.id === el.dataset.id);
    if (ev) openSidePanel(ev, el);
  }));
}
// Drag a USER bar's left/right edge grip to reschedule its start / end day (multi-day user events).
// Only edges visible this week have grips (barHTML), so we never truncate the off-screen part.
let _wkResizeSuppressClick = false;
function wireWeekResize() {
  // Bind ONCE on the persistent #calView (render() only swaps its innerHTML, never the node itself),
  // and read `days` LIVE inside each handler — capturing weekDays(weekAnchor) once would go stale
  // after week navigation and, combined with re-binding every render, persist wrong dates.
  const view = $('#calView'); if (!view || view.dataset.wkResizeWired) return;
  view.dataset.wkResizeWired = '1';
  const colOf = (clientX, rect) => Math.max(0, Math.min(6, Math.floor((clientX - rect.left) / (rect.width / 7))));
  let st = null;   // { bar, ev, side, rect, moved }
  view.addEventListener('pointerdown', (e) => {
    if (isNarrowWeek()) return;                              // narrow week is a list (no bars/grips)
    const grip = e.target.closest('.wk-resize'); if (!grip) return;
    const bar = grip.closest('.wk-bar[data-id]'); if (!bar) return;
    const evObj = allEvents().find(x => x.id === bar.dataset.id); if (!evObj || evObj.source !== 'user') return;
    e.preventDefault(); e.stopPropagation();
    const lane = bar.closest('#wkAllday') || bar.parentElement;
    st = { bar, ev: evObj, side: grip.classList.contains('wk-resize-l') ? 'l' : 'r', rect: lane.getBoundingClientRect(), moved: false };
    try { view.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  });
  view.addEventListener('pointermove', (e) => {
    if (!st) return;
    st.moved = true;
    const days = weekDays(weekAnchor);
    const col = colOf(e.clientX, st.rect);
    const s0 = days.indexOf(st.ev.date.slice(0, 10)), e0 = days.indexOf((st.ev.endDate || st.ev.date).slice(0, 10));
    let lo = s0 < 0 ? 0 : s0, hi = e0 < 0 ? 6 : e0;
    if (st.side === 'r') hi = Math.max(lo, col); else lo = Math.min(hi, col);
    st.bar.style.gridColumn = `${lo + 1}/${hi + 2}`;         // live preview; discarded on the save re-render
  });
  const finish = (e) => {
    if (!st) return;
    const { ev, side, moved, rect } = st; st = null;
    if (!moved) return;
    _wkResizeSuppressClick = true; setTimeout(() => { _wkResizeSuppressClick = false; }, 350);
    const days = weekDays(weekAnchor);
    const col = colOf(e.clientX, rect);
    const s0 = ev.date.slice(0, 10), en0 = (ev.endDate || ev.date).slice(0, 10);
    let start = s0, end = en0;
    if (side === 'r') end = days[col] >= s0 ? days[col] : s0;            // clamp end ≥ start
    else start = days[col] <= en0 ? days[col] : en0;                     // clamp start ≤ end
    saveUser(loadUser().map(x => x.id === ev.id ? { ...x, date: start, endDate: (end && end !== start) ? end : '' } : x));
  };
  view.addEventListener('pointerup', finish);
  view.addEventListener('pointercancel', () => { st = null; });
}
// Drag across the week's all-day area to block out a date range → opens the editor pre-filled with
// that span (a plain click = a single-day add, matching the month grid). Desktop grid only.
function wireWeekDragCreate() {
  if (isNarrowWeek()) return;
  const lane = $('#wkAllday');
  if (!lane || lane.dataset.dragWired) return;
  lane.dataset.dragWired = '1';
  const days = weekDays(weekAnchor);
  // capture the grid geometry ONCE per drag (the week grid never moves mid-drag, and re-reading it
  // live drifted the end column by ±1 when a scrollbar toggled) → start and end map with the same ruler
  let startCol = null, ghost = null, dragRect = null;
  const colOf = (clientX) => Math.max(0, Math.min(6, Math.floor((clientX - dragRect.left) / (dragRect.width / 7))));
  const clearGhost = () => { if (ghost) { ghost.remove(); ghost = null; } };
  const draw = (a, b) => {
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'wk-dragsel'; ghost.setAttribute('aria-hidden', 'true'); lane.appendChild(ghost); }
    const lo = Math.min(a, b), hi = Math.max(a, b);
    ghost.style.left = `${(lo / 7) * 100}%`;
    ghost.style.width = `${((hi - lo + 1) / 7) * 100}%`;
  };
  lane.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.wk-bar, .wk-chip, button, a')) return;   // leave existing items/controls alone
    dragRect = lane.getBoundingClientRect();
    startCol = colOf(e.clientX);
    try { lane.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    draw(startCol, startCol);
    e.preventDefault();
  });
  lane.addEventListener('pointermove', (e) => {
    if (startCol == null) return;
    draw(startCol, colOf(e.clientX));
  });
  const finish = (e) => {
    if (startCol == null) return;
    const endCol = colOf(e.clientX);
    const lo = Math.min(startCol, endCol), hi = Math.max(startCol, endCol);
    startCol = null; dragRect = null; clearGhost();
    openModal(null, days[lo], lo === hi ? '' : days[hi]);   // single col → one-day add; span → pre-fill End
  };
  lane.addEventListener('pointerup', finish);
  lane.addEventListener('pointercancel', () => { startCol = null; clearGhost(); });
}

function pad(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

const MONTH_LANES = 3;        // max spanning-bar lanes shown per week (overflow → "+N more")
const MONTH_SINGLES = 2;      // single-day chips shown per cell before overflow

// Notion-style month: 6 week-rows. Multi-day events render as ONE continuous bar per week
// (lane-packed, with ‹/› arrows where they wrap), reusing the week view's packLanes(); single-day
// events stay as chips below the reserved bar lanes.
function monthHTML() {
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeks = monthGrid(viewY, viewM);                    // 6 rows of {iso, day, inMonth}
  const multi = allEvents().filter(e => visible(e) && isMultiDay(e));

  const rows = weeks.map(week => {
    const days = week.map(c => c.iso);
    const packed = packLanes(multi, days);                  // [{ev,lane,col0,col1,contL,contR}]
    const laneN = Math.min(MONTH_LANES, packed.reduce((m, p) => Math.max(m, p.lane + 1), 0));
    const bars = packed.filter(p => p.lane < MONTH_LANES).map(p => {
      const e = p.ev, cont = (p.contL ? ' cont-l' : '') + (p.contR ? ' cont-r' : '');
      return `<button class="cal-bar cat-${esc(catOf(e))}${cont}" data-ev="${esc(e.id)}" style="grid-column:${p.col0 + 1}/${p.col1 + 2};grid-row:${p.lane + 1}" title="${esc(e.title)}">`
        + `${p.contL ? '<span class="cal-bar-arr" aria-hidden="true">‹</span>' : ''}<span class="cal-bar-t">${esc(e.title)}</span>${p.contR ? '<span class="cal-bar-arr" aria-hidden="true">›</span>' : ''}</button>`;
    }).join('');
    const cells = week.map((c, i) => {
      const date = c.iso, weekend = (i === 0 || i === 6), isToday = date === TODAY;
      const singles = c.inMonth ? eventsOn(date, true).filter(e => !isMultiDay(e)) : [];
      const tks = c.inMonth ? tasksOn(date) : [];
      const hasBook = singles.some(e => e.bookBy);
      const hiddenBars = packed.filter(p => p.lane >= MONTH_LANES && p.col0 <= i && p.col1 >= i).length;   // bars past the lane cap that cover this day
      const items = [...singles.map(e => ({ ev: e })), ...tks.map(t => ({ tk: t }))];
      const chips = items.slice(0, MONTH_SINGLES).map(x => x.tk
        ? taskChipHTML(x.tk)
        : `<button class="cal-chip cat-${esc(catOf(x.ev))}" data-ev="${esc(x.ev.id)}" title="${esc(x.ev.title)}"><span class="cc-t">${esc(x.ev.title)}</span></button>`).join('');
      const moreN = (items.length - Math.min(items.length, MONTH_SINGLES)) + hiddenBars;
      const more = moreN > 0 ? `<button type="button" class="cal-more" data-day="${esc(date)}">+${moreN} more</button>` : '';
      const bk = hasBook ? `<span class="bk-dot" title="has a booking deadline"></span>` : '';
      const barsHere = packed.filter(p => p.col0 <= i && p.col1 >= i).length;
      const aria = `${esc(date)}, ${singles.length + barsHere} event${(singles.length + barsHere) === 1 ? '' : 's'}${tks.length ? `, ${tks.length} task${tks.length === 1 ? '' : 's'}` : ''}`;
      const cls = ['cal-cell', isToday && 'today', !c.inMonth && 'out', weekend && 'weekend'].filter(Boolean).join(' ');
      return `<div class="${cls}" data-day="${esc(date)}">
        <span class="cal-row"><button type="button" class="cal-date" data-day="${esc(date)}" aria-label="${aria}">${c.day}</button>${bk}</span>
        <div class="cal-barspace" aria-hidden="true"></div>
        ${chips}${more}</div>`;
    }).join('');
    return `<div class="cal-week" style="--lanes:${laneN}"><div class="cal-cells">${cells}</div><div class="cal-bars">${bars}</div></div>`;
  }).join('');
  return `<div class="cal-dowrow">${dows.map(x => `<div class="cal-dow">${esc(x)}</div>`).join('')}</div><div class="cal-weeks">${rows}</div>`;
}

// ---- month cockpit: up next · book by · tasks due ----
function sevOf(iso) { const d = daysBetween(TODAY, iso); if (d === null) return ''; if (d < 0) return 'overdue'; if (d <= 14) return 'due-soon'; return 'upcoming'; }
// an "evergreen" event is a season-long span (start→end beyond SPAN_CAP): the ongoing/permanent
// layer (teamLab, "retro hunting"), which reads as "now", not a discrete upcoming event. Detect by
// SPAN, not by category — a short, genuinely-dated seasonal event should still count as upcoming.
function isEvergreen(e) { const en = (e.endDate || '').slice(0, 10); if (!en) return false; const span = daysBetween(e.date.slice(0, 10), en); return span != null && span > SPAN_CAP; }
function panelHTML() {
  const monthKey = `${viewY}-${pad(viewM + 1)}`;
  const isPast = monthKey < TODAY.slice(0, 7);
  const evs = allEvents().filter(visible);
  // full (uncapped) lists so the count badge + "+N more" are honest, then a display slice.
  // Up next = discrete upcoming events. Exclude the 'seasonal' category (this dataset's evergreen /
  // ongoing / permanent bucket — teamLab, "retro hunting"; genuinely-dated seasonal things use the
  // fireworks/festival/holiday/nature categories instead) AND any long-span residency (isEvergreen).
  const upAll = evs.filter(e => !isEvergreen(e) && catOf(e) !== 'seasonal' && e.date.slice(0, 7) === monthKey && e.date.slice(0, 10) >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date));
  const deadAll = evs.filter(e => e.bookBy && /^\d{4}-\d{2}-\d{2}$/.test(e.bookBy) && e.bookBy.slice(0, 7) <= monthKey && (e.endDate || e.date).slice(0, 10) >= TODAY)
    .sort((a, b) => a.bookBy.localeCompare(b.bookBy));
  const taskAll = allTasks().filter(t => t.date.slice(0, 7) === monthKey).sort((a, b) => a.date.localeCompare(b.date));
  const upnext = upAll.slice(0, 5), deadlines = deadAll.slice(0, 5), tasks = taskAll.slice(0, 6);
  const more = (total, shown) => total > shown ? `<button type="button" class="cp-more" data-goagenda>+${total - shown} more →</button>` : '';
  const count = (n) => n ? ` <span class="cp-count">${n}</span>` : '';

  const upHTML = upnext.length ? upnext.map(e => {
    const d = daysBetween(TODAY, e.date.slice(0, 10));
    const cd = d == null ? '' : d <= 0 ? 'now' : `${d}d`;
    return `<button class="cp-up" data-ev="${esc(e.id)}">
      <span class="cp-cd cat-${safeCat(e)}">${esc(cd)}<small>${esc(fmtShort(e.date))}</small></span>
      <span class="cp-uptt">${esc(e.title)}${isGoing(e.id) ? '<span class="cp-going">✓ going</span>' : ''}</span></button>`;
  }).join('') + more(upAll.length, upnext.length) : `<p class="cp-empty">${isPast ? 'This month has passed.' : 'Nothing more coming up this month.'}</p>`;

  const dlHTML = deadlines.length ? deadlines.map(e => {
    const sev = sevOf(e.bookBy), days = daysBetween(TODAY, e.bookBy);
    const badge = days < 0 ? 'overdue' : `${days}d`;
    return `<button class="cp-deadline" data-ev="${esc(e.id)}">
      <span class="cp-dot sev-${sev}"></span>
      <span class="cp-body"><span class="cp-title">${esc(e.title)}</span>
        <span class="cp-sub">book by ${esc(fmtShort(e.bookBy))}</span></span>
      <span class="cp-badge sev-${sev}">${esc(badge)}</span></button>`;
  }).join('') + more(deadAll.length, deadlines.length) : `<p class="cp-empty">Nothing to book${isPast ? '.' : " — you're clear 🎏"}</p>`;

  const taskHTML = tasks.length ? tasks.map(t => `<button class="cp-task" data-task="${esc(t.taskId)}" title="Open on the checklist">
    <span class="cp-tdue">${esc(fmtShort(t.date))}</span>
    <span class="cp-ttt">${esc(t.title)}</span>
    <span class="cp-tgo" aria-hidden="true">›</span></button>`).join('') + more(taskAll.length, tasks.length) : `<p class="cp-empty">No due dates — set them on the checklist.</p>`;

  return `<h3 class="cp-head">Up next</h3>
    <div class="cp-list">${upHTML}</div>
    <hr class="cp-hr"><h3 class="cp-head">Book by${count(deadAll.length)}</h3><div class="cp-list">${dlHTML}</div>
    <hr class="cp-hr"><h3 class="cp-head">Tasks due${count(taskAll.length)}</h3><div class="cp-list">${taskHTML}</div>`;
}
function wirePanel() {
  $$('#calPanel .cp-up, #calPanel .cp-deadline').forEach(b => b.addEventListener('click', () => {
    const ev = allEvents().find(x => x.id === b.dataset.ev); if (ev) openSidePanel(ev, b);
  }));
  $$('#calPanel .cp-task').forEach(b => b.addEventListener('click', () => gotoTask(b.dataset.task)));
  $$('#calPanel .cp-more').forEach(b => b.addEventListener('click', () => { mode = 'agenda'; render(); }));   // "+N more" → the full uncapped agenda
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
    // opens the event; on a day WITH items, a bare click peeks the day popover; on an EMPTY day it
    // goes straight to the new-event editor (Notion-style — no empty popover in the way).
    c.addEventListener('click', (e) => {
      if (_calDragSelected) { _calDragSelected = false; return; }              // a range-drag just ended — don't also add/peek
      const chip = e.target.closest('.cal-chip');
      if (chip) {
        if (chip.dataset.task) { gotoTask(chip.dataset.task); return; }     // task chip → jump to the checklist item
        const ev = allEvents().find(x => x.id === chip.dataset.ev); if (ev) openSidePanel(ev, chip); return;
      }
      if (c.querySelector('.cal-chip, .cal-more')) dayPopover(c.dataset.day, c);   // day has events/tasks → peek
      else openModal(null, c.dataset.day);                                        // empty day → add straight away
    });
  });
  // multi-day BARS live in the .cal-bars overlay (siblings of the cells), so wire them directly → popover
  $$('#calView .cal-bar[data-ev]').forEach(b => b.addEventListener('click', () => {
    const ev = allEvents().find(x => x.id === b.dataset.ev); if (ev) openSidePanel(ev, b);
  }));
}
// Notion-style: drag across the month grid to select a date range → opens the editor pre-filled with
// that span. A plain click (no drag) falls through to wireCells (add / peek). Chips/date-buttons excluded.
let _calDragSelected = false;
function wireMonthSelect() {
  const grid = $('#calView .cal-weeks');
  if (!grid || grid.dataset.selWired) return;
  grid.dataset.selWired = '1';
  const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.cal-cell[data-day]');
  const clear = () => $$('#calView .cal-cell.cal-selecting').forEach(c => c.classList.remove('cal-selecting'));
  const paint = (a, b) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    $$('#calView .cal-cell[data-day]').forEach(c => c.classList.toggle('cal-selecting', c.dataset.day >= lo && c.dataset.day <= hi));
  };
  let startDay = null, moved = false;
  grid.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.cal-chip, .cal-more, button, a')) return;   // let chips/date-button/more work
    const cell = e.target.closest('.cal-cell[data-day]'); if (!cell) return;
    startDay = cell.dataset.day; moved = false;
    try { grid.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    paint(startDay, startDay);
  });
  grid.addEventListener('pointermove', (e) => {
    if (startDay == null) return;
    const cell = cellAt(e.clientX, e.clientY); if (!cell) return;
    if (cell.dataset.day !== startDay) moved = true;
    paint(startDay, cell.dataset.day);
  });
  const finish = (e) => {
    if (startDay == null) return;
    const endDay = cellAt(e.clientX, e.clientY)?.dataset.day || startDay;
    const s = startDay; startDay = null; clear();
    if (!moved || endDay === s) return;                              // plain click → wireCells handles it
    _calDragSelected = true; setTimeout(() => { _calDragSelected = false; }, 350);
    const lo = s < endDay ? s : endDay, hi = s < endDay ? endDay : s;
    openModal(null, lo, hi);
  };
  grid.addEventListener('pointerup', finish);
  grid.addEventListener('pointercancel', () => { startDay = null; clear(); });
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
  const thisPop = popEl;   // guard: if the popover was dismissed before this task ran, don't attach unremovable listeners
  const mainEl = document.getElementById('main');   // app-shell: content scrolls INSIDE main, not the window
  setTimeout(() => { if (popEl !== thisPop) return; document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, { passive: true }); mainEl?.addEventListener('scroll', onScroll, { passive: true }); popEl.querySelector('.pop-open, .pop-add')?.focus(); }, 0);
  popCleanup = () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); mainEl?.removeEventListener('scroll', onScroll); };
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
  if (trig && document.contains(trig)) trig.focus({ preventScroll: true });
  else $('#calAdd')?.focus({ preventScroll: true });
}

// Anchor the detail CARD beside the clicked event, flipping to the side with room so the event
// stays visible (owner: "on the left if the event is on the right"). Desktop only — ≤699px is a
// bottom sheet (CSS), so we clear any inline coords there.
function positionSidePanel(panel) {
  const card = panel.querySelector('.sp-inner');
  if (!card) return;
  if (!window.matchMedia('(min-width: 700px)').matches) { card.style.left = card.style.top = card.style.width = ''; return; }
  const trig = _sidePanelTrigger;
  const W = 320, gap = 10, m = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const sx = window.scrollX, sy = window.scrollY;                    // the card is DOCUMENT-anchored → add scroll so it scrolls WITH the page (owner: "fixed in place", not floating in the viewport)
  card.style.width = W + 'px';
  const r = (trig && document.contains(trig)) ? trig.getBoundingClientRect() : null;
  let left, top;
  if (r && r.width && r.height) {
    if (r.width > vw * 0.5) {                                        // a wide multi-day bar: no room beside it → sit just below, left-aligned
      left = r.left; top = r.bottom + gap;
    } else {
      const mid = (r.left + r.right) / 2;
      const placeLeft = mid > vw * 0.55 || (vw - r.right - gap) < W; // right-ish event or no room right → go left
      left = placeLeft ? r.left - gap - W : r.right + gap;
      top = r.top;
    }
  } else { left = vw - W - m; top = 72; }                            // no trigger → top-right fallback
  left = Math.max(m, Math.min(left, vw - W - m));
  card.style.left = (left + sx) + 'px';
  card.style.top = (sy) + 'px';                                      // set, then correct with real height below
  const ch = Math.min(card.offsetHeight, vh * 0.85);
  top = Math.max(m, Math.min(top, vh - ch - m));                     // start on-screen, but in doc coords so it travels with the event on scroll
  card.style.top = (top + sy) + 'px';
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
  // friendly countdown chip: "in N days" / today / tomorrow / on now / past, + "· N-day" duration
  const startISO = ev.date.slice(0, 10), endISO = (ev.endDate || ev.date).slice(0, 10);
  const dTo = daysBetween(TODAY, startISO);
  let cd = '';
  if (dTo != null) cd = dTo > 1 ? `in ${dTo} days` : dTo === 1 ? 'tomorrow' : dTo === 0 ? 'today' : (endISO >= TODAY ? 'on now' : 'past');
  const span = ev.endDate ? (daysBetween(startISO, endISO) ?? 0) + 1 : 0;
  const cdFull = [cd, span > 1 ? `${span}-day` : ''].filter(Boolean).join(' · ');
  const goBtn = `<button class="btn sp-going${going ? ' is-going' : ''}" id="spGoing" aria-pressed="${going ? 'true' : 'false'}">${going ? '✓ Going' : '＋ Going'}</button>`;
  const gcal = `<a class="btn ghost" href="${esc(gcalUrl(ev))}" target="_blank" rel="noopener noreferrer">Google Cal</a>`;
  const actions = isBaked
    ? `${goBtn}<div class="sp-sec">${ev.moved ? '<button class="btn" id="spReset">↺ Reset date</button>' : ''}<button class="btn" id="spPlan">＋ Day plan</button>${gcal}<button class="btn" id="spCopy">Copy</button></div>`
    : `${goBtn}<div class="sp-sec"><button class="btn" id="spEdit">Edit</button>${gcal}<button class="btn danger" id="spDel">Delete</button></div>`;

  panel.innerHTML = `
    <div class="sp-backdrop" id="spBackdrop" aria-hidden="true"></div>
    <div class="sp-inner" role="dialog" aria-label="${esc(ev.title)}" style="--cat:var(--c-${safeCat(ev)}-ink)">
      <div class="sp-band">
        <div class="sp-cattop">
          <span class="sp-cat"><span class="sp-dot" aria-hidden="true"></span>${esc(ev.category || 'event')}</span>
          <button class="sp-close" id="spClose" aria-label="Close">✕</button>
        </div>
        <h2 class="sp-title">${esc(ev.title)}</h2>
        ${cdFull ? `<span class="sp-cd">${esc(cdFull)}</span>` : ''}
      </div>
      <div class="sp-body" tabindex="0">
        <div class="sp-meta">
          <span class="sp-k">When</span><span class="sp-v">${dateRange}</span>
          ${ev.area ? `<span class="sp-k">Where</span><span class="sp-v">${esc(ev.area)}</span>` : ''}
          ${ev.cost ? `<span class="sp-k">Cost</span><span class="sp-v">${esc(ev.cost)}</span>` : ''}
          ${ev.bookBy ? `<span class="sp-k">Book by</span><span class="sp-v sp-bookby">${esc(fmtDate(ev.bookBy))}</span>` : ''}
        </div>
        ${(ev.note || ev.bookingNotes || ev.why) ? `<p class="sp-note">${esc(ev.note || ev.bookingNotes || ev.why || '')}</p>` : ''}
        ${ev.moved ? '<p class="sp-moved">↩ You rescheduled this from its researched date.</p>' : ''}
        ${srcline(ev.sources)}
      </div>
      <div class="sp-actions">${actions}</div>
    </div>`;

  panel.hidden = false;
  positionSidePanel(panel);            // desktop: anchor the card beside the clicked event (flip L/R)
  void panel.offsetWidth;              // force one reflow so the entrance transition fires immediately
  panel.classList.add('is-open');

  // wire actions
  panel.querySelector('#spClose')?.addEventListener('click', closeSidePanel);
  // click-away + reposition-on-resize, bound ONCE at the document/window level. Desktop: the container
  // is pointer-events:none so a real click lands on an event (→ switch) or empty space (→ close);
  // mobile: the backdrop tap also lands here (its own click listener would double-close → stole focus).
  if (!document._spAway) {
    document._spAway = true;
    document.addEventListener('pointerdown', (e) => {
      if (!_sidePanelEv) return;
      if (e.target.closest('.sp-inner, [data-ev], .wk2-ev, .wk-bar, .wk-chip, .wkl-ev, .modal-overlay, .app-modal, .dp-overlay, .lp-menu')) return;   // clicking any event switches (its handler reopens); everything else closes
      closeSidePanel();
    });
    window.addEventListener('resize', () => { const p = $('#calSidePanel'); if (p && !p.hidden && p.classList.contains('is-open')) positionSidePanel(p); });   // re-anchor / reset inline coords across the desktop↔mobile breakpoint
  }
  panel.querySelector('#spGoing')?.addEventListener('click', () => {
    const id = ev.id;
    toggleGoingEv(ev);                                                            // synchronous jwh:data-changed → the calendar re-renders → the trigger node is replaced
    const fresh = document.querySelector(`#calView [data-ev="${id}"], #calView [data-id="${id}"]`) || _sidePanelTrigger;   // re-anchor to the NEW element (else the popover jumped to the corner)
    openSidePanel(ev, fresh);
  });
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

  // Esc closes; Tab is contained inside the dialog for keyboard convenience while it's open. It is a
  // role=dialog but NOT aria-modal — the background stays live (click another event to switch), so we
  // don't claim modality to AT; we just keep Tab from wandering behind an open popover.
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSidePanel(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  _sidePanelCleanup = () => document.removeEventListener('keydown', onKey, true);

  // focus first focusable element inside the panel
  setTimeout(() => { panel.querySelector('#spClose, button, [href]')?.focus({ preventScroll: true }); }, 40);
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
  saveUser([...loadUser(), { id: 'u' + Date.now(), title: ev.title, date: ev.date.slice(0, 10), endDate: (ev.endDate || '').slice(0, 10), time: ev.time || '', endTime: ev.endTime || '', category: ev.category || 'personal', note: ev.bookingNotes || ev.why || '', area: ev.area || '', bookBy: ev.bookBy || '', copyOf: ev.id }]);   // carry time so a copied flight stays in the grid (review)
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
  const arr = (s || []).filter(u => /^https?:\/\//i.test(u));   // only real web URLs into href (no javascript:)
  return arr.length ? `<p class="modal-src">${arr.slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ${i + 1} ↗</a>`).join('')}</p>` : '';
}

// ---- add/edit modal ----
function openModal(ev, presetDate, presetEnd, presetTime) {
  const e = ev || { id: '', title: '', date: presetDate || TODAY, endDate: presetEnd || '', time: presetTime || '', endTime: '', category: 'personal', note: '' };
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
        <label>End date (optional)<input name="endDate" type="date" value="${esc((e.endDate || '').slice(0, 10))}"></label>
      </div>
      <div class="row2">
        <label>Start time (optional)<input name="time" type="time" value="${esc(e.time || '')}"></label>
        <label>End time (optional)<input name="endTime" type="time" value="${esc(e.endTime || '')}"></label>
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
    if (obj.endTime && !obj.time) { alertModal('Add a start time before an end time.'); return; }
    if (obj.time && obj.endTime && !obj.endDate && obj.endTime <= obj.time) { alertModal('End time must be after the start time (same day).'); return; }
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
