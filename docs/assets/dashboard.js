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
import { loadPlans } from './lib/dayplan.js';
import { isGoing } from './lib/going.js';
import { summary, fmtYen } from './lib/budget.js';
import { progress } from './lib/packing.js';
import { readiness } from './lib/readiness.js';

let DATA = null, TODAY = nowISO();

export function mountDashboard(data, today) {
  DATA = data;
  TODAY = today || nowISO();
  initTheme();
  renderCountdown();
  setInterval(renderCountdown, 60000);   // roll the countdown over at midnight without a reload (spec §6)
  wireBell();
  refresh();
  document.addEventListener('jwh:data-changed', refresh);
  // Budget/packing mutations happen on their OWN routes and re-render locally; they intentionally
  // do NOT dispatch jwh:data-changed (that would trigger no-op re-renders across other listeners).
  // So landing back on the dashboard is the natural refresh trigger for their teasers.
  document.addEventListener('jwh:route', (e) => { if (e.detail && e.detail.route === 'dashboard') refreshTeasers(); });
}

function gcDismissed() {
  // drop dismissed ids whose encoded @date is in the past (and legacy bare ids that can no longer match)
  const d = get(KEYS.dismissed, []) || [];
  const keep = d.filter(id => { const at = String(id).lastIndexOf('@'); return at >= 0 && String(id).slice(at + 1) >= TODAY; });
  if (keep.length !== d.length) set(KEYS.dismissed, keep);
}

function refresh() {
  gcDismissed();
  const alerts = computeAlerts(buildItems(), TODAY, get(KEYS.dismissed, []) || []);
  renderBadge(alerts);
  renderPanel(alerts);
  renderWidgets(alerts);
  refreshTeasers();
}

// Budget + packing teasers — read localStorage fresh each call (no staleness). Cheap (two
// teaser() calls), so the dual trigger (refresh + jwh:route) isn't a meaningful double-render.
// budget/packing DON'T dispatch jwh:data-changed by design (see mountDashboard) — don't "fix"
// this into a global dispatch.
function refreshTeasers() {
  const s = summary(DATA.budget || { currency: 'JPY', oneTime: [], monthly: [] }, get(KEYS.budget, {}) || {});
  const savings = (get(KEYS.budget, {}) || {}).savings || 0;
  const budgetText = (s.oneTimeTotal === 0 && s.monthlyTotal === 0 && savings === 0)
    ? 'Set up your budget'
    : `Runway: ${s.runwayMonths === Infinity ? 'sustainable' : s.runwayMonths + ' mo'} · to land ${fmtYen(s.toLand)}`;
  teaser('#tBudget', budgetText, '#/budget');

  const p = progress([...(DATA.packing || []), ...(get(KEYS.packCustom, []) || [])], get(KEYS.packing, {}) || {});
  const packText = p.total === 0 ? 'Start your packing list' : `${p.pct}% packed · ${p.done}/${p.total}`;
  teaser('#tPacking', packText, '#/packing');

  renderReadiness();
}

// "Trip readiness" widget — one weighted score over checklist + packing + budget, with a 3-part
// breakdown and days-to-arrival. Read-only (reads localStorage fresh, dispatches nothing).
function renderReadiness() {
  const el = $('#wReadiness');
  if (!el) return;

  const checks = get(KEYS.checklist, {}) || {};
  const allChecks = checklistItems(DATA);
  const ckDone = allChecks.filter(it => checks[it.id]).length;
  const checklistPct = allChecks.length ? Math.round((ckDone / allChecks.length) * 100) : 0;

  const pk = progress([...(DATA.packing || []), ...(get(KEYS.packCustom, []) || [])], get(KEYS.packing, {}) || {});

  const budgetState = get(KEYS.budget, {}) || {};
  const s = summary(DATA.budget || { currency: 'JPY', oneTime: [], monthly: [] }, budgetState);
  const noBudget = s.oneTimeTotal === 0 && s.monthlyTotal === 0 && !(budgetState.savings > 0);
  const budgetReady = noBudget ? 'unset'
    : (s.runwayMonths === Infinity || s.runwayMonths >= 6) ? 'ready'
    : 'tight';

  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', nowISO());

  const r = readiness({ checklistPct, packingPct: pk.pct, budgetReady, daysToArrival: c.days });
  const budgetLabel = { ready: 'ready', tight: 'tight', unset: 'unset' }[r.parts[2].status] || 'unset';
  const toneWord = { good: 'on track', ok: 'getting there', low: 'just starting' }[r.tone] || '';
  const daysLine = c.phase === 'arrived'
    ? `Day ${(c.days ?? 0) + 1} in Japan`
    : `${c.days ?? '—'} day${c.days === 1 ? '' : 's'} to Tokyo`;

  el.querySelector('.widget-body').innerHTML = `
    <div class="rdy" data-tone="${esc(r.tone)}">
      <div class="rdy-score">${esc(String(r.score))}<span class="rdy-pct">%</span><span class="sr-only"> ready — ${esc(toneWord)}</span></div>
      <div class="rdy-meta">
        <div class="rdy-days">${esc(daysLine)}</div>
        <div class="rdy-parts">
          <a href="#/checklist">Checklist ${esc(String(r.parts[0].pct))}%</a>
          <span aria-hidden="true">·</span>
          <a href="#/packing">Packing ${esc(String(r.parts[1].pct))}%</a>
          <span aria-hidden="true">·</span>
          <a href="#/budget">Budget ${esc(budgetLabel)}</a>
        </div>
      </div>
    </div>`;
}

function dismiss(id) {
  if (!id) return;
  const d = get(KEYS.dismissed, []) || [];
  set(KEYS.dismissed, [...d, id]); refresh();
}

function buildItems() {
  const checks = get(KEYS.checklist, {}) || {};
  const items = [];
  // dismiss ids encode the date (@when) so re-setting a date yields a FRESH, non-dismissed alert
  (DATA.timeSensitive || []).forEach((t, i) => {
    if (t.dueBy) items.push({ id: 'ts-' + i + '@' + t.dueBy, title: t.item, when: t.dueBy, kind: 'deadline', detail: t.action });
  });
  (DATA.bookByTimeline || []).forEach((b) =>
    items.push({ id: b.id + '@' + b.when, title: b.what, when: b.when, kind: 'book', detail: b.action }));
  const userDue = get(KEYS.due, {}) || {};
  checklistItems(DATA).forEach(it => {           // only YOUR added due dates notify (baked deadlines already live in timeSensitive/bookBy)
    if (userDue[it.id] && !checks[it.id]) items.push({ id: 'ck-' + it.id + '@' + userDue[it.id], title: it.task, when: userDue[it.id], kind: 'task', detail: it.note });
  });
  allEvents().forEach(e => {
    const start = e.date.slice(0, 10);
    if (start >= TODAY) items.push({ id: 'ev-' + e.id + '@' + start, title: e.title, when: start, kind: 'event', detail: e.area }); // future starts only — not already-running seasons
    if (e.bookBy && e.source === 'user') items.push({ id: 'bk-' + e.id + '@' + e.bookBy, title: 'Book: ' + e.title, when: e.bookBy, kind: 'book', detail: e.bookingNotes });   // baked book-by already covered by bookByTimeline — don't double-count
  });
  return items;
}

// ---- countdown: hero numeral (canonical) + small topbar copy ----
// Recomputes "today" each call so the minute-timer (mountDashboard) rolls the count over at midnight.
function renderCountdown() {
  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', nowISO());
  const arrived = c.phase === 'arrived';
  // topbar (decorative, aria-hidden in markup)
  const el = $('#countdown');
  if (el) {
    const unit = arrived ? (c.days === 1 ? 'DAY IN' : 'DAYS IN') : (c.days === 1 ? 'DAY TO NRT' : 'DAYS TO NRT');
    const html = `<span class="cd-num">${c.days ?? ''}</span><span class="cd-label">${unit}</span><span class="cd-credit">CREDIT 01</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('arrived', arrived);
  }
  // hero (the aria-live region) — only mutate when the day count actually changes, so the
  // minute-timer never re-announces the same number to screen readers.
  const hero = $('#heroCount');
  if (hero) {
    const num = String(c.days ?? '');
    const numEl = hero.querySelector('.hc-num');
    if (numEl.textContent !== num) {
      const unit = arrived ? (c.days === 1 ? 'day in Japan' : 'days in Japan') : (c.days === 1 ? 'day until I land' : 'days until I land');
      numEl.textContent = num;
      hero.querySelector('.hc-unit').textContent = unit;
    }
    hero.classList.toggle('arrived', arrived);
  }
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

// ---- home: promoted "needs me" cards + demoted teasers ----
function renderWidgets(alerts) {
  fill('#wDeadlines', alerts.filter(a => a.kind === 'deadline' || a.kind === 'task'), 3);
  renderProgress();
  renderGoingWidget();
  renderTeasers(alerts);
}
function renderTeasers(alerts) {
  const book = alerts.find(a => a.kind === 'book');
  teaser('#tBookBy', book ? `${fmtShort(book.when)} · ${clip(book.title, 38)}` : 'Nothing to book yet', '#/deadlines');
  const ev = alerts.find(a => a.kind === 'event');
  teaser('#tEvents', ev ? `${fmtShort(ev.when)} · ${clip(ev.title, 38)}` : 'No upcoming events', '#/calendar');
  const plans = loadPlans();
  const date = Object.keys(plans).filter(d => plans[d] && plans[d].stops && plans[d].stops.length && d >= TODAY).sort()[0];
  teaser('#tPlan', date ? `${date === TODAY ? 'Today' : fmtShort(date)} · ${plans[date].stops.length} stop${plans[date].stops.length === 1 ? '' : 's'}` : 'Plan a day', '#/plan');
}
function teaser(sel, text, route) {
  const el = $(sel);
  if (!el) return;
  el.querySelector('.teaser-body').innerHTML = `<a href="${route}">${esc(text)} <span class="teaser-go" aria-hidden="true">→</span></a>`;
}
// curated "events I'm going to" — the ones the user has marked ✓ Going (not the auto upcoming stream)
function renderGoingWidget() {
  const el = $('#wGoing');
  if (!el) return;
  const going = allEvents().filter(e => isGoing(e.id)).sort((a, b) => a.date.localeCompare(b.date));
  const body = going.length
    ? `<ul>${going.slice(0, 2).map(e => {
        const c = countdown(e.date.slice(0, 10), TODAY);
        const when = c.phase === 'arrived' ? esc(fmtShort(e.date)) : `in ${c.days}d`;
        return `<li><a href="#/calendar"><span class="w-when">${esc(when)}</span> ${esc(clip(e.title, 46))}</a></li>`;
      }).join('')}</ul>`
    : `<p class="w-empty">Nothing locked in yet — open an event and tap <b>✓ Going</b>.</p>`;
  el.querySelector('.widget-body').innerHTML = body;
}
function fill(sel, list, max = 5) {
  const el = $(sel);
  if (!el) return;
  const body = list.length
    ? `<ul>${list.slice(0, max).map(a => `<li class="sev-${a.severity}">
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
