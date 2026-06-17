'use strict';
// Top bar (theme + live countdown + top-right notifications bell) and the home widgets.
// Builds one unified alert stream from deadlines, book-by windows, checklist due dates,
// and calendar events, then drives the bell badge, the dropdown, and the widgets.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { countdown, windowStatus, fmtShort, nowISO } from './lib/dates.js';
import { computeAlerts } from './lib/notify.js';
import { checklistItems } from './content.js';
import { allEvents } from './calendar.js';
import { makeSortable } from './dnd.js';
import { loadPlans } from './lib/dayplan.js';

let DATA = null, TODAY = nowISO();

export function mountDashboard(data, today) {
  DATA = data;
  TODAY = today || nowISO();
  initTheme();
  renderCountdown();
  wireBell();
  setupWidgetDnD();
  refresh();
  document.addEventListener('jwh:data-changed', refresh);
}

function setupWidgetDnD() {
  const dash = $('#dashHome');
  if (!dash) return;
  dash.querySelectorAll('.widget').forEach(w => {
    w.dataset.id = w.id;
    if (!w.querySelector(':scope > .dnd-handle')) {   // sibling of the heading, NOT inside it (keeps the h3 accessible name clean)
      const b = document.createElement('button');
      b.className = 'dnd-handle'; b.type = 'button'; b.textContent = '⠿';
      b.setAttribute('aria-label', `Reorder ${w.id.replace('w', '')} widget`);
      w.insertBefore(b, w.firstChild);
    }
  });
  const order = get(KEYS.widgetOrder, null);
  if (order && order.length) order.forEach(id => { const w = document.getElementById(id); if (w) dash.appendChild(w); });
  makeSortable(dash, {
    itemSelector: '.widget', handleSelector: '.dnd-handle', label: 'widget',
    idOf: el => el.dataset.id,
    onReorder: (ids) => set(KEYS.widgetOrder, ids),
  });
}

function refresh() {
  const alerts = computeAlerts(buildItems(), TODAY, get(KEYS.dismissed, []) || []);
  renderBadge(alerts);
  renderPanel(alerts);
  renderWidgets(alerts);
}

function dismiss(id) {
  if (!id) return;
  const d = get(KEYS.dismissed, []) || [];
  set(KEYS.dismissed, [...d, id]); refresh();
}

function buildItems() {
  const checks = get(KEYS.checklist, {}) || {};
  const items = [];
  (DATA.timeSensitive || []).forEach((t, i) => {
    if (t.dueBy) items.push({ id: 'ts-' + i, title: t.item, when: t.dueBy, kind: 'deadline', detail: t.action });
  });
  (DATA.bookByTimeline || []).forEach((b) =>
    items.push({ id: b.id, title: b.what, when: b.when, kind: 'book', detail: b.action }));
  const userDue = get(KEYS.due, {}) || {};
  checklistItems(DATA).forEach(it => {           // only YOUR added due dates notify (baked deadlines already live in timeSensitive/bookBy)
    if (userDue[it.id] && !checks[it.id]) items.push({ id: 'ck-' + it.id, title: it.task, when: userDue[it.id], kind: 'task', detail: it.note });
  });
  allEvents().forEach(e => {
    const start = e.date.slice(0, 10);
    if (start >= TODAY) items.push({ id: 'ev-' + e.id, title: e.title, when: start, kind: 'event', detail: e.area }); // future starts only — not already-running seasons
    if (e.bookBy && e.source === 'user') items.push({ id: 'bk-' + e.id, title: 'Book: ' + e.title, when: e.bookBy, kind: 'book', detail: e.bookingNotes });   // baked book-by already covered by bookByTimeline — don't double-count
  });
  return items;
}

// ---- countdown ribbon ----
function renderCountdown() {
  const el = $('#countdown');
  if (!el) return;
  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', TODAY);
  const unit = c.phase === 'arrived' ? (c.days === 1 ? 'DAY IN' : 'DAYS IN') : (c.days === 1 ? 'DAY TO NRT' : 'DAYS TO NRT');
  el.innerHTML = `<span class="cd-num">${c.days ?? ''}</span><span class="cd-label">${unit}</span><span class="cd-credit">CREDIT 01</span>`;
  el.classList.toggle('arrived', c.phase === 'arrived');
}

// ---- bell + panel ----
function wireBell() {
  const bell = $('#notifBell'), panel = $('#notifPanel');
  if (!bell || !panel) return;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Notifications');
  const close = (restoreFocus) => { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); if (restoreFocus) bell.focus(); };
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    bell.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) setTimeout(() => panel.querySelector('button, a, [tabindex]')?.focus(), 20);   // move focus in
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== bell) close(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(true); });   // Esc closes + returns focus to the bell
}
function renderBadge(alerts) {
  const badge = $('#notifBadge');
  if (!badge) return;
  const n = alerts.length;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.hidden = n === 0;
  const overdue = alerts.some(a => a.severity === 'overdue');
  badge.classList.toggle('hot', overdue);
}
const ICON = { deadline: '⚖️', book: '🎟️', task: '✅', event: '📅' };
const ROUTE_FOR = { deadline: '#/deadlines', book: '#/deadlines', task: '#/checklist', event: '#/calendar' };
function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
function renderPanel(alerts) {
  const panel = $('#notifPanel');
  if (!panel) return;
  if (!alerts.length) {
    panel.innerHTML = `<div class="np-head">Notifications</div><div class="np-empty">ALL CLEAR — STANDBY 🎏</div>`;
    return;
  }
  panel.innerHTML = `<div class="np-head">Notifications <button id="npClear" class="np-clear">dismiss all</button></div>
    <ul class="np-list">${alerts.slice(0, 30).map(a => `
      <li class="np-item sev-${a.severity}">
        <span class="np-ico" aria-hidden="true">${ICON[a.kind] || '•'}</span>
        <a class="np-body" href="${ROUTE_FOR[a.kind] || '#/dashboard'}"><span class="np-title">${esc(clip(a.title, 76))}</span>
          <span class="np-when">${a.severity === 'overdue' ? 'overdue · ' : ''}${esc(fmtShort(a.when))}${a.days >= 0 ? ` · in ${a.days}d` : ''}</span></a>
        <button class="np-x" data-dismiss="${esc(a.id)}" aria-label="Dismiss">✕</button>
      </li>`).join('')}</ul>`;
  $$('#notifPanel .np-body').forEach(a => a.addEventListener('click', () => { panel.hidden = true; }));   // navigate (hash) + close
  $$('#notifPanel .np-x').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    dismiss(b.dataset.dismiss);
  }));
  // swipe-to-dismiss (pointer; tap still navigates, vertical scroll preserved)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('#notifPanel .np-item').forEach(li => {
    let sx = 0, dx = 0, dragging = false;
    li.addEventListener('pointerdown', e => { sx = e.clientX; dx = 0; dragging = true; li.setPointerCapture?.(e.pointerId); });
    li.addEventListener('pointermove', e => {
      if (!dragging) return;
      dx = e.clientX - sx;
      if (Math.abs(dx) > 6) { e.preventDefault(); if (!reduce) { li.style.transform = `translateX(${dx}px)`; li.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 180)); } }
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      const id = li.querySelector('.np-x')?.dataset.dismiss;
      if (Math.abs(dx) > 90 && id) dismiss(id);
      else { li.style.transform = ''; li.style.opacity = ''; }
    };
    li.addEventListener('pointerup', end);
    li.addEventListener('pointercancel', end);
  });
  $('#npClear')?.addEventListener('click', () => {
    const d = get(KEYS.dismissed, []) || [];
    set(KEYS.dismissed, [...new Set([...d, ...alerts.map(a => a.id)])]); refresh();
  });
}

// ---- home widgets ----
function renderWidgets(alerts) {
  fill('#wDeadlines', alerts.filter(a => a.kind === 'deadline' || a.kind === 'task'));
  fill('#wEvents', alerts.filter(a => a.kind === 'event'));
  fill('#wBookBy', alerts.filter(a => a.kind === 'book'));
  renderProgress();
  renderPlanWidget();
}
// today's day plan if it exists, else the next upcoming one (plan ↔ dashboard parity)
function renderPlanWidget() {
  const el = $('#wPlan');
  if (!el) return;
  const plans = loadPlans();
  const date = Object.keys(plans).filter(d => plans[d] && plans[d].stops && plans[d].stops.length && d >= TODAY).sort()[0];
  const plan = date ? plans[date] : null;
  const body = plan
    ? `<p class="w-plan-date">${date === TODAY ? 'Today' : esc(fmtShort(date))}</p>
       <ul>${plan.stops.slice(0, 5).map(s => `<li><a href="#/plan"><span class="w-when">${s.startTime ? esc(s.startTime) : '·'}</span> ${esc(clip(s.name, 48))}</a></li>`).join('')}</ul>
       <a class="w-link" href="#/plan">Open plan →</a>`
    : `<p class="w-empty">No day planned yet — <a href="#/plan">plan a day →</a></p>`;
  el.querySelector('.widget-body').innerHTML = body;
}
function fill(sel, list) {
  const el = $(sel);
  if (!el) return;
  const body = list.length
    ? `<ul>${list.slice(0, 5).map(a => `<li class="sev-${a.severity}">
        <a href="#/${a.kind === 'event' ? 'calendar' : (a.kind === 'book' || a.kind === 'deadline') ? 'deadlines' : 'checklist'}">
        <span class="w-when">${esc(fmtShort(a.when))}</span> ${esc(clip(a.title, 52))}</a></li>`).join('')}</ul>`
    : `<p class="w-empty">Nothing due soon</p>`;
  el.querySelector('.widget-body').innerHTML = body;
}
function renderProgress() {
  const el = $('#wProgress');
  if (!el) return;
  const checks = get(KEYS.checklist, {}) || {};
  const all = checklistItems(DATA);
  const done = all.filter(it => checks[it.id]).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  el.querySelector('.widget-body').innerHTML = `
    <div class="w-prog"><div class="w-bar"><i style="width:${pct}%"></i></div>
    <span class="w-pct">${pct}% · ${done}/${all.length}</span></div>
    <a class="w-link" href="#/checklist">Open checklist →</a>`;
}

// ---- theme (owns the top-bar toggle) ----
function initTheme() {
  const saved = getRaw(KEYS.theme, '');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  updateToggle(theme);
  $('#themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setRaw(KEYS.theme, next);
    updateToggle(next);
  });
}
function updateToggle(theme) {
  const b = $('#themeToggle');
  if (!b) return;
  const isDark = theme === 'dark';
  (b.querySelector('span') || b).textContent = isDark ? '☀️' : '🌙';
  b.setAttribute('aria-pressed', String(isDark));
  b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}
