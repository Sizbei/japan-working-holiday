'use strict';
// Top bar (theme + live countdown + top-right notifications bell) and the home widgets.
// Builds one unified alert stream from deadlines, book-by windows, checklist due dates,
// and calendar events, then drives the bell badge, the dropdown, and the widgets.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { countdown, windowStatus, fmtShort, nowISO } from './lib/dates.js';
import { computeAlerts } from './lib/notify.js';
import { checklistItems } from './content.js';
import { allEvents } from './calendar.js';

let DATA = null, TODAY = '2026-06-15';

export function mountDashboard(data, today) {
  DATA = data;
  TODAY = today || nowISO();
  initTheme();
  renderCountdown();
  wireBell();
  refresh();
  document.addEventListener('jwh:data-changed', refresh);
}

function refresh() {
  const alerts = computeAlerts(buildItems(), TODAY, get(KEYS.dismissed, []) || []);
  renderBadge(alerts);
  renderPanel(alerts);
  renderWidgets(alerts);
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
    if (e.bookBy) items.push({ id: 'bk-' + e.id, title: 'Book: ' + e.title, when: e.bookBy, kind: 'book', detail: e.bookingNotes });
  });
  return items;
}

// ---- countdown ribbon ----
function renderCountdown() {
  const el = $('#countdown');
  if (!el) return;
  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', TODAY);
  el.innerHTML = `<span class="cd-num">${c.days ?? ''}</span><span class="cd-label">${esc(c.label)}</span>`;
  el.classList.toggle('arrived', c.phase === 'arrived');
}

// ---- bell + panel ----
function wireBell() {
  const bell = $('#notifBell'), panel = $('#notifPanel');
  if (!bell || !panel) return;
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    bell.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== bell) panel.hidden = true;
  });
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
function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
function renderPanel(alerts) {
  const panel = $('#notifPanel');
  if (!panel) return;
  if (!alerts.length) {
    panel.innerHTML = `<div class="np-head">Notifications</div><div class="np-empty">All clear — nothing due soon. 🎏</div>`;
    return;
  }
  panel.innerHTML = `<div class="np-head">Notifications <button id="npClear" class="np-clear">dismiss all</button></div>
    <ul class="np-list">${alerts.slice(0, 30).map(a => `
      <li class="np-item sev-${a.severity}">
        <span class="np-ico" aria-hidden="true">${ICON[a.kind] || '•'}</span>
        <span class="np-body"><span class="np-title">${esc(clip(a.title, 76))}</span>
          <span class="np-when">${a.severity === 'overdue' ? 'overdue · ' : ''}${esc(fmtShort(a.when))}${a.days >= 0 ? ` · in ${a.days}d` : ''}</span></span>
        <button class="np-x" data-dismiss="${esc(a.id)}" aria-label="Dismiss">✕</button>
      </li>`).join('')}</ul>`;
  $$('#notifPanel .np-x').forEach(b => b.addEventListener('click', () => {
    const d = get(KEYS.dismissed, []) || [];
    d.push(b.dataset.dismiss); set(KEYS.dismissed, d); refresh();
  }));
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
}
function fill(sel, list) {
  const el = $(sel);
  if (!el) return;
  const body = list.length
    ? `<ul>${list.slice(0, 5).map(a => `<li class="sev-${a.severity}">
        <a href="#${a.kind === 'event' ? 'calendarSection' : a.kind === 'book' ? 'trackerSection' : 'checklist'}">
        <span class="w-when">${esc(fmtShort(a.when))}</span> ${esc(clip(a.title, 52))}</a></li>`).join('')}</ul>`
    : `<p class="w-empty">Nothing in the next 30 days.</p>`;
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
    <a class="w-link" href="#checklist">Open checklist →</a>`;
}

// ---- theme (owns the top-bar toggle) ----
function initTheme() {
  const saved = localStorage.getItem(KEYS.theme);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  updateToggle(theme);
  $('#themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEYS.theme, next);
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
