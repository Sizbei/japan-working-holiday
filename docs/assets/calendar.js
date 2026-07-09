'use strict';
// Editable calendar — coordinator/state owner for the split view modules
// (calendar-month/-week/-agenda/-editor.js). Merges baked events (tips.json,
// read-only) with user events (localStorage, CRUD). The sidebar Calendars list
// filters by source + category; the cockpit lists book-by deadlines; clicking a
// day opens a popover. Month/Week/Day/Agenda modes; .ics/Google export + import.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { parseISO, daysBetween, fmtDate, fmtShort, MONTHS, nowISO } from './lib/dates.js';
import { gcalUrl } from './lib/ics.js';
import { alertModal } from './lib/modal.js';
import { upsertStop, newStop } from './lib/dayplan.js';
import { loadPlaces, patchPlace } from './lib/places.js';
import { isGoing, toggleGoing, setGoing } from './lib/going.js';
import { approxCoord } from './lib/geo.js';
import { dndToast } from './dnd.js';
import { duplicateUserEvent, eventMenuSpec } from './lib/calevents.js';
import { customItem, loadChecklistCustom, saveChecklistCustom } from './lib/checklist.js';
import { checklistItems, revealChecklistItem } from './checklist-page.js';
import { parseEvent } from './lib/nlevent.js';
import { openMenu } from './lib/menu.js';
import { prefersReducedMotion } from './motion.js';
import { monthGrid, addMonths, WEEKDAYS_SHORT } from './lib/minical.js';
import { agendaHTML, wireAgenda } from './calendar-agenda.js';
import { weekHTML, dayHTML, wireWeek, weekLabel } from './calendar-week.js';
import { monthHTML, panelHTML, wirePanel, wireCells, wireMonthSelect, wireReschedule, wireEndless, scrollToMonth, scrollToDay } from './calendar-month.js';
import { openModal, openExport, onImport } from './calendar-editor.js';
export { openModal };   // re-export so calendar-week.js / calendar-month.js keep importing it from here

let DATA = null;
export let viewY = 2026, viewM = 5;
let mode = 'month';        // 'month' | 'week' | 'day' | 'agenda'
export let weekAnchor = '2026-06-15';   // any ISO date inside the week the week-view shows
export let TODAY = '2026-06-15';
export let hiddenCats = new Set();
let showTasks = true;             // checklist tasks with a user-set due date appear on the calendar (filterable)
let showUser = true, showBaked = true;   // source "calendars": My events (user) / Researched (baked) visibility
let sideCollapsed = false;               // hide the sidebar (mini-nav + Calendars + cockpit) to give the grid full width
let _taskCache = null;            // per-render memo of task pseudo-events
let popEl = null, popCleanup = null;
let _sidePanelEv = null;          // currently open event id (null = closed)
let _sidePanelTrigger = null;     // element that opened the panel (focus restore)
let _sidePanelCleanup = null;     // remove side-panel document listeners
let _legendTimer = null;          // discriminate legend single-click (toggle) from double-click (isolate)

export const CATS = ['festival', 'fireworks', 'illumination', 'convention', 'seasonal', 'nature', 'holiday', 'food', 'disney', 'music', 'personal', 'imported'];
export const SPAN_CAP = 10;
// an "evergreen" event is a season-long span (start→end beyond SPAN_CAP): the ongoing/permanent
// layer (teamLab, club residencies, beer gardens). These belong in the month view's "Ongoing this
// season" strip — the week/day band and the agenda exclude them (they'd flood every row for months).
export function isEvergreen(e) { const en = (e.endDate || '').slice(0, 10); if (!en) return false; const span = daysBetween(e.date.slice(0, 10), en); return span != null && span > SPAN_CAP; }

export function loadUser() { return get(KEYS.events, []) || []; }
export function saveUser(a) { set(KEYS.events, a); changed(); }
export function goAgenda() { mode = 'agenda'; render(); }
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
export function allTasks() {
  if (_taskCache) return _taskCache;
  if (!showTasks) return (_taskCache = []);
  const due = get(KEYS.due, {}) || {};
  const done = get(KEYS.checklist, {}) || {};
  _taskCache = checklistItems(DATA)
    .filter(it => due[it.id] && !done[it.id] && parseISO(due[it.id]))
    .map(it => ({ taskId: it.id, title: it.task, date: due[it.id] }));
  return _taskCache;
}
export function tasksOn(iso) { return showTasks ? allTasks().filter(t => t.date.slice(0, 10) === iso) : []; }
export function taskChipHTML(t) {
  return `<button type="button" class="cal-chip cal-task" data-task="${esc(t.taskId)}" title="Checklist task due — ${esc(t.title)}"><span class="cc-t">☑ ${esc(t.title)}</span></button>`;
}
// jump from a calendar task chip to the checklist item it represents
export function gotoTask(taskId) {
  dismissPopover();
  if (location.hash !== '#/checklist') location.hash = '#/checklist';
  // let the route transition swap views before scrolling/focusing the target row
  setTimeout(() => revealChecklistItem(taskId), 60);
}

export function catOf(e) { return e.category || 'personal'; }
export function visible(e) {
  if (hiddenCats.has(catOf(e))) return false;
  const isUser = e.source === 'user';   // baked events (incl. overrides) are 'baked'; user + imported .ics are 'user'
  if (isUser && !showUser) return false;
  if (!isUser && !showBaked) return false;
  return true;
}

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

let _calMounted = false;
export function mountCalendar(data, today) {
  if (_calMounted) return; _calMounted = true;   // mount-once: document/window listeners below must not double-register
  DATA = data;
  TODAY = today || nowISO();
  const cf = get(KEYS.calFilters, []); hiddenCats = new Set(Array.isArray(cf) ? cf : []);   // guard a corrupted (non-array) stored value
  showTasks = getRaw(KEYS.calShowTasks, '') !== 'off';  // on by default; the ☑ Tasks toggle persists your choice
  const src = get(KEYS.calSources, {}) || {}; showUser = src.showUser !== false; showBaked = src.showBaked !== false;   // both on by default
  const sb = getRaw(KEYS.calSidebar, '');
  sideCollapsed = sb === 'collapsed' ? true : sb === 'expanded' ? false : window.matchMedia('(max-width: 820px)').matches;   // sidebar visibility persists; no stored pref → collapsed on mobile
  const t = parseISO(TODAY);
  if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); }
  weekAnchor = TODAY;
  wireToolbar();
  wireQuickAdd();
  buildCalendars();
  applySidebar();   // apply the persisted collapsed/expanded state to the layout + toggle button
  render();
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route !== 'calendar') { closeSidePanel(); dismissPopover(); } });   // the side panel + day popover are portaled to <body> (fixed) — close them when leaving the calendar so they don't hang over other pages
  window.addEventListener('resize', () => requestAnimationFrame(alignRail));   // toolbar can wrap to two rows — keep --cal-tb-h (sticky-chrome offset) exact
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

// show/hide the left side panels; the toolbar toggle IS the reachability (no floating popover)
function applySidebar() {
  document.querySelector('.cal-layout')?.classList.toggle('side-collapsed', sideCollapsed);
  if (sideCollapsed && document.getElementById('calSidebar')?.contains(document.activeElement)) $('#calSideToggle')?.focus();   // don't strand focus inside a display:none sidebar
  const btn = $('#calSideToggle');
  if (!btn) return;
  const lbl = sideCollapsed ? 'Show side panels' : 'Hide side panels';
  btn.setAttribute('aria-expanded', String(!sideCollapsed));
  btn.setAttribute('aria-label', lbl); btn.title = lbl;
  btn.textContent = sideCollapsed ? '⊞' : '⊟';
}

function wireToolbar() {
  $('#calSideToggle')?.addEventListener('click', () => { sideCollapsed = !sideCollapsed; setRaw(KEYS.calSidebar, sideCollapsed ? 'collapsed' : 'expanded'); applySidebar(); });
  // compact: Import/Export/Google collapse into a ⋯ menu (items just trigger the hidden buttons, so
  // their existing wiring — file input, export dialog, google sync — is untouched)
  $('#calMore')?.addEventListener('click', () => {
    const g = $('#calGoogle');   // disabled when Google sync isn't configured — .click() would be a silent no-op
    openMenu([
      { label: 'Import .ics…', run: () => $('#calImport')?.click() },
      { label: 'Export…', run: () => $('#calExport')?.click() },
      ...(g && !g.disabled ? [{ label: 'Google…', run: () => g.click() }] : []),
    ], 0, 0, { anchor: $('#calMore'), label: 'More calendar actions' });
  });
  $('#calPrev')?.addEventListener('click', () => shift(-1));
  $('#calNext')?.addEventListener('click', () => shift(1));
  $('#calToday')?.addEventListener('click', () => {
    const t = parseISO(TODAY); weekAnchor = TODAY;
    if (mode === 'month') { scrollToDay(TODAY, !prefersReducedMotion()); return; }   // endless: navigate by scroll
    viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); render();
  });
  $('#calModeMonth')?.addEventListener('click', () => { mode = 'month'; render(); });
  $('#calModeWeek')?.addEventListener('click', () => { mode = 'week'; render(); });
  $('#calModeDay')?.addEventListener('click', () => { mode = 'day'; render(); });
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
    if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); mode = 'month'; }
    const id = 'u' + Date.now();
    setGoing(id, true);   // a quick-added event is a plan you're making — mark it ✓ Going up front
    saveUser([...loadUser(), { id, title, date: p.date, endDate: '', time: p.time || '', category: 'personal', note: '' }]);
    input.value = ''; hint.textContent = '';
    dndToast(`Added ✓ Going: ${title} · ${fmtShort(p.date)}`);
    input.focus({ preventScroll: true });                                       // a bare focus() yanked the endless grid back to the top
    requestAnimationFrame(() => scrollToDay(p.date, !prefersReducedMotion()));  // land on the new event
  });
}
function shift(d) {
  if (mode === 'week') { weekAnchor = addDaysISO(weekAnchor, 7 * d); render(); return; }   // week mode steps by a week
  if (mode === 'day') { weekAnchor = addDaysISO(weekAnchor, d); render(); return; }          // day mode steps by a day
  // endless month: ‹ › scroll to the neighbouring month's separator; the scroll handler updates the label
  let y = viewY, m = viewM + d; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; }
  scrollToMonth(`${y}-${String(m + 1).padStart(2, '0')}`, !prefersReducedMotion());
}

// jump the month view to a given ISO date (used by event search)
export function goToDate(iso) {
  const t = parseISO(iso); if (!t) return;
  viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); mode = 'month'; render();
}

// ---- the "Calendars" sidebar list: source (My events / Researched) + per-category filters ----
function buildCalendars() {
  const el = $('#calCalendars');
  if (!el) return;
  const present = [...new Set(allEvents().map(catOf))].sort();
  // btnCls (e.g. cat-festival) goes on the row so the category :is() rule sets --chip-cat, which the
  // child swatch inherits; swCls (sw-user/sw-baked/sw-task) colours the source/task swatches directly.
  const row = (attrs, btnCls, swCls, name, on) =>
    `<button class="calrow${btnCls ? ' ' + btnCls : ''}${on ? '' : ' off'}" role="switch" aria-checked="${on}" type="button" ${attrs}><span class="cal-sw${swCls ? ' ' + swCls : ''}"></span><span class="cal-nm">${name}</span></button>`;
  el.innerHTML =
    `<div class="cal-cals-head"><span>Calendars</span><button class="cal-cals-all" id="calAll" type="button">${hiddenCats.size ? 'All' : 'None'}</button></div>`
    + row('id="calSrcUser"', '', 'sw-user', 'My events', showUser)
    + row('id="calSrcBaked"', '', 'sw-baked', 'Researched', showBaked)
    + `<div class="cal-cals-div" role="separator"></div>`
    + present.map(c => row(`data-cat="${esc(c)}" title="Click to toggle · double-click or Shift+Enter to show only ${esc(c)}"`, `cat-${esc(c)}`, '', esc(c), !hiddenCats.has(c))).join('')
    + `<div class="cal-cals-div" role="separator"></div>`
    + row('id="lgTasks"', '', 'sw-task', '☑ Tasks', showTasks);

  const focusRow = (sel) => $(sel)?.focus({ preventScroll: true });   // restore keyboard focus across the rebuild
  const catSel = (c) => `#calCalendars .calrow[data-cat="${window.CSS ? CSS.escape(c) : c}"]`;
  // "show only this" (or un-isolate back to all if it's already the only one shown) — shared by
  // double-click AND Shift+activation (Shift+click / Shift+Enter, the keyboard path to isolate).
  const isolate = (c) => {
    if (_legendTimer) { clearTimeout(_legendTimer); _legendTimer = null; }
    const others = present.filter(x => x !== c);
    const isolated = !hiddenCats.has(c) && others.every(x => hiddenCats.has(x));
    hiddenCats.clear();
    if (!isolated) others.forEach(x => hiddenCats.add(x));   // isolate to c; if already isolated, un-isolate (show all)
    persistFilters(); buildCalendars(); render(); focusRow(catSel(c));
  };
  $$('#calCalendars .calrow[data-cat]').forEach(b => {
    // single click toggles this category; double click / Shift+activate isolates it. A 200ms timer
    // lets the dblclick cancel the pending single-click toggle so the two don't fight.
    b.addEventListener('click', (e) => {
      if (e.shiftKey) { isolate(b.dataset.cat); return; }     // Enter/Space fire click with shiftKey intact
      if (_legendTimer) { clearTimeout(_legendTimer); _legendTimer = null; return; }
      const c = b.dataset.cat;
      _legendTimer = setTimeout(() => {
        _legendTimer = null;
        if (hiddenCats.has(c)) hiddenCats.delete(c); else hiddenCats.add(c);
        persistFilters(); buildCalendars(); render(); focusRow(catSel(c));
      }, 200);
    });
    b.addEventListener('dblclick', () => isolate(b.dataset.cat));
  });
  $('#calSrcUser')?.addEventListener('click', () => { showUser = !showUser; persistSources(); buildCalendars(); render(); focusRow('#calSrcUser'); });
  $('#calSrcBaked')?.addEventListener('click', () => { showBaked = !showBaked; persistSources(); buildCalendars(); render(); focusRow('#calSrcBaked'); });
  $('#lgTasks')?.addEventListener('click', () => {
    showTasks = !showTasks; setRaw(KEYS.calShowTasks, showTasks ? 'on' : 'off'); _taskCache = null;
    buildCalendars(); render(); focusRow('#lgTasks');
  });
  $('#calAll')?.addEventListener('click', () => {
    if (hiddenCats.size) hiddenCats.clear(); else present.forEach(c => hiddenCats.add(c));
    persistFilters(); buildCalendars(); render(); focusRow('#calAll');
  });
}
function persistFilters() { set(KEYS.calFilters, [...hiddenCats]); }
function persistSources() { set(KEYS.calSources, { showUser, showBaked }); }

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
    e.preventDefault(); weekAnchor = TODAY;
    if (mode !== 'month') { const t = parseISO(TODAY); if (t) { viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); } mode = 'month'; render(); }
    scrollToDay(TODAY, !prefersReducedMotion());
    $(`#calView .cal-date[data-day="${TODAY}"]`)?.focus({ preventScroll: true }); return;
  }
  if (e.key === 'n' || e.key === 'N') {
    // fall back to the shown day in week/day mode (weekAnchor), not TODAY — after a mode switch, render()
    // drops focus to <body> so there's no focused cell to read.
    e.preventDefault(); const day = e.target.closest?.('.cal-cell[data-day], .wk2-dayhd[data-day], .wk2-add[data-day]')?.dataset.day || ((mode === 'day' || mode === 'week') ? weekAnchor : TODAY); openModal(null, day); return;
  }
  // view switch (m/w/a) — Google-Calendar-style
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); if (mode !== 'month') { mode = 'month'; render(); } return; }
  if (e.key === 'w' || e.key === 'W') { e.preventDefault(); if (mode !== 'week') { mode = 'week'; render(); } return; }
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); if (mode !== 'day') { mode = 'day'; render(); } return; }
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); if (mode !== 'agenda') { mode = 'agenda'; render(); } return; }
  // Shift+←/→ steps the whole period (month, or week in week mode) — distinct from plain arrows (day focus)
  if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); shift(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (mode === 'month' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    const cells = $$('#calView .cal-date[data-day]');
    if (!cells.length) return;
    const idx = cells.indexOf(e.target.closest?.('.cal-date'));
    // endless grid: cells span the whole trip year — entry lands on TODAY (cells[0] is the top of
    // the range), and focus must be followed by a scroll or it walks off-screen invisibly
    if (idx < 0) {
      e.preventDefault();
      const start = $('#calView .cal-cell.today .cal-date') || cells[0];
      start.focus({ preventScroll: true });
      (start.closest('.cal-cell') || start).scrollIntoView({ block: 'nearest' });   // scroll the CELL — nearest on the small date button leaves only a sliver of the row visible
      return;
    }
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : 7;
    const next = cells[idx + delta];
    if (next) { e.preventDefault(); next.focus({ preventScroll: true }); (next.closest('.cal-cell') || next).scrollIntoView({ block: 'nearest' }); }
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
  if (mode === 'week' || mode === 'day') { weekAnchor = iso; viewY = t.getUTCFullYear(); viewM = t.getUTCMonth(); render(); return; }
  scrollToDay(iso, !prefersReducedMotion());   // endless month: navigate by scrolling, not re-rendering
}

function render() {
  TODAY = nowISO();   // a tab left open across midnight must not keep highlighting yesterday
  _evCache = null; _taskCache = null;   // invalidate the per-render caches (data may have changed since last render)
  dismissPopover();
  const mEl = $('#calModeMonth'), wEl = $('#calModeWeek'), dEl = $('#calModeDay'), aEl = $('#calModeAgenda');
  mEl?.classList.toggle('active', mode === 'month'); mEl?.setAttribute('aria-pressed', String(mode === 'month'));
  wEl?.classList.toggle('active', mode === 'week'); wEl?.setAttribute('aria-pressed', String(mode === 'week'));
  dEl?.classList.toggle('active', mode === 'day'); dEl?.setAttribute('aria-pressed', String(mode === 'day'));
  aEl?.classList.toggle('active', mode === 'agenda'); aEl?.setAttribute('aria-pressed', String(mode === 'agenda'));
  const label = $('#calLabel');
  if (label) label.textContent = mode === 'agenda' ? `Agenda — from ${MONTHS[viewM]} ${viewY}` : mode === 'week' ? weekLabel() : mode === 'day' ? fmtDate(weekAnchor) : `${MONTHS[viewM]} ${viewY}`;
  const unit = mode === 'week' ? 'week' : mode === 'day' ? 'day' : 'month';   // prev/next step by week/day in those modes
  $('#calPrev')?.setAttribute('aria-label', 'Previous ' + unit); $('#calNext')?.setAttribute('aria-label', 'Next ' + unit);
  const view = $('#calView'); if (!view) return;
  const panel = $('#calPanel');
  if (mode === 'month') {
    // endless grid: a re-render (data change) must not teleport the user — capture + restore scroll
    const oldGrid = view.querySelector('.cal-grid');
    const gridTop = oldGrid?.scrollTop || 0;
    const mainEl = document.getElementById('main');
    const pageTop = mainEl?.scrollTop || 0, winTop = window.scrollY || 0;
    view.innerHTML = monthHTML();
    if (panel) { panel.hidden = false; panel.innerHTML = panelHTML(); wirePanel(); }
    wireCells();
    wireReschedule();
    wireMonthSelect();
    // "the rest of the page reacts": scrolling updates the label, mini-nav and cockpit for the month in view
    wireEndless((y, m) => {
      viewY = y; viewM = m;
      const lb = $('#calLabel'); if (lb) lb.textContent = `${MONTHS[viewM]} ${viewY}`;
      // announce to screen readers only after scrolling settles — a live #calLabel would queue
      // an announcement for every month crossed in one fling through the 19-month grid
      clearTimeout(_liveT);
      _liveT = setTimeout(() => { const n = document.getElementById('calLive'); if (n) n.textContent = `${MONTHS[viewM]} ${viewY}`; }, 600);
      renderMiniNav();
      dimFocus();
      if (panel && !panel.hidden) { panel.innerHTML = panelHTML(); wirePanel(); }
    });
    dimFocus();   // initial focal state (re-renders too — cells are rebuilt without .moff)
    if (oldGrid) {   // restore (same-session re-render)
      const g = view.querySelector('.cal-grid'); if (g) g.scrollTop = gridTop;
      if (mainEl) mainEl.scrollTop = pageTop;
      if (winTop) window.scrollTo(0, winTop);
    } else {
      _endlessNeedsPos = true;   // first render may happen while the view is hidden (boot) — scrollIntoView would no-op
      requestAnimationFrame(positionEndless);
    }
  } else if (mode === 'week') {
    view.innerHTML = weekHTML();
    if (panel) panel.hidden = true;   // the week view shows the whole week; the month deadline panel would duplicate
    wireWeek();
  } else if (mode === 'day') {
    view.innerHTML = dayHTML();
    if (panel) panel.hidden = true;   // single day — no month deadline panel
    wireWeek();                       // same wiring; drag/resize read the column count from the DOM (1 in day mode)
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
  // endless month: the grid spans the whole trip year, so grid-bottom geometry is meaningless —
  // the panel's own CSS max-height (min(100vh−4rem, 700px)) governs in every mode now.
  document.querySelector('.cal-panel')?.style.removeProperty('max-height');
  // sticky-chrome offset: the dow row + sidebar pin under the toolbar in normal desktop mode;
  // measure its real height (flex-wrap can make it 1–2 rows) so the CSS offset stays exact
  const tb = document.querySelector('#view-calendar .cal-toolbar');
  if (tb?.offsetHeight) document.getElementById('calendarSection')?.style.setProperty('--cal-tb-h', tb.offsetHeight + 'px');
}
let _endlessNeedsPos = false;
let _entryPos = false;   // set on each entry to #/calendar; consumed once the endless grid is visible
let _liveT = 0;          // debounce for the #calLive month announcement
// Notion focal month: dim the date numbers of every cell OUTSIDE the labeled month
function dimFocus() {
  const ym = `${viewY}-${String(viewM + 1).padStart(2, '0')}`;
  for (const c of $$('#calView .cal-cell[data-day]')) c.classList.toggle('moff', c.dataset.day.slice(0, 7) !== ym);
}
function positionEndless() {
  if ((!_endlessNeedsPos && !_entryPos) || mode !== 'month') return;
  const grid = $('#calView .cal-grid');
  if (!grid || grid.offsetParent === null) return;   // still hidden (view-transition class toggle is async) — the 300ms retry catches it
  if (_endlessNeedsPos) {
    const day = weekAnchor || TODAY;
    scrollToDay(day, false);   // first render: land on today
    // web-font load reflows the months of rows ABOVE today (serif separators) and the scroll
    // drifts — re-center once metrics are final (no-op when fonts were already cached).
    // Skip if the user has already scrolled away (reflow alone doesn't move scrollY).
    const y0 = window.scrollY, g0 = $('#calView .cal-grid')?.scrollTop || 0;
    document.fonts?.ready?.then(() => {
      const g = $('#calView .cal-grid')?.scrollTop || 0;
      if (Math.abs(window.scrollY - y0) > 80 || Math.abs(g - g0) > 80) return;
      scrollToDay(day, false);
    });
  } else {
    scrollToMonth(`${viewY}-${String(viewM + 1).padStart(2, '0')}`, false);   // re-entry: restore the month you were viewing
  }
  _endlessNeedsPos = false; _entryPos = false;
}
let _calDirty = false;
document.addEventListener('jwh:route', (e) => {
  if (e.detail?.route !== 'calendar') return;
  if (_calDirty) { _calDirty = false; render(); }   // EF3: catch up on changes made while hidden
  if (mode === 'month') {
    _entryPos = true;
    requestAnimationFrame(positionEndless);
    setTimeout(positionEndless, 300);   // again after the view transition settles — the rAF can land while the view is still hidden
  } else {
    window.scrollTo(0, 0);   // the router no longer resets the window for #/calendar (endless month owns it) — non-month modes still start at top
  }
  requestAnimationFrame(alignRail);
  setTimeout(alignRail, 300);   // again after the view transition settles — the rAF can land mid-swap
});

// a category guaranteed to have a --c-* token (an imported .ics could carry an arbitrary one →
// var(--c-<unknown>) would be undefined and the bar would render unstyled/unreadable)
export function safeCat(e) { const c = catOf(e); return CATS.includes(c) ? c : 'imported'; }
// shared reschedule (month grid + week chips): user → edit date (keep span); baked → date override.
export function rescheduleEvent(id, day) {
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
export function syncPlaceDate(eventId, day) {
  const linked = loadPlaces().find(p => p.eventId === eventId);
  if (linked) patchPlace(linked.id, linked.remindDate ? { remindDate: day } : { date: day });
}

function dismissPopover() {
  if (popCleanup) { popCleanup(); popCleanup = null; }
  if (popEl) { popEl.remove(); popEl = null; }
}
export function dayPopover(date, anchor) {
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

export function openSidePanel(ev, trigger) {
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
    // compact viewport-fit: the grid scrolls INSIDE main (window.scrollY stays 0), so the
    // document-anchored panel would visibly detach from its chip — dismiss on internal scroll,
    // mirroring the day-popover (which already listens on #main).
    document.getElementById('main')?.addEventListener('scroll', () => { if (document.documentElement.dataset.compact === 'on' && _sidePanelEv) closeSidePanel(); }, { passive: true });
    document.addEventListener('scroll', (e) => { if (document.documentElement.dataset.compact === 'on' && _sidePanelEv && e.target?.classList?.contains('cal-grid')) closeSidePanel(); }, { capture: true, passive: true });
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
export function toggleGoingEv(ev) { toggleGoing(ev.id); }                     // toggleGoing dispatches
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

export function deleteUserEvent(id) {
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

