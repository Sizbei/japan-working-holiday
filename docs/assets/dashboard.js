'use strict';
// Top bar (theme + live countdown + top-right notifications bell) and the home widgets.
// Builds one unified alert stream from deadlines, book-by windows, checklist due dates,
// and calendar events, then drives the bell badge, the dropdown, and the widgets.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { countdown, windowStatus, fmtShort, nowISO } from './lib/dates.js';
import { computeAlerts } from './lib/notify.js';
import { prefersReducedMotion } from './motion.js';
import { fetchWeather, wmoInfo } from './lib/weather.js';
import { fetchUsdPerJpy } from './lib/rates.js';
import { loadPlaces } from './lib/places.js';
import { checklistItems } from './checklist-page.js';
import { isBirthday } from './lib/people.js';
import { spendSummary } from './lib/spend.js';
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
  refreshWeather();   // async — re-fills the Today strip when the fetch lands
  refreshRates();     // async — the budget teaser picks the cached ¥→$ up on its next render
  document.addEventListener('jwh:data-changed', refresh);
  // Budget/packing mutations happen on their OWN routes and re-render locally; they intentionally
  // do NOT dispatch jwh:data-changed (that would trigger no-op re-renders across other listeners).
  // So landing back on the dashboard is the natural refresh trigger for their teasers.
  document.addEventListener('jwh:route', (e) => { if (e.detail && e.detail.route === 'dashboard') { refreshTeasers(); refreshWeather(); } });
}

function gcDismissed() {
  // Keep a dismissal until 90 days AFTER its encoded @date, so a dismissed overdue item STAYS
  // dismissed (not resurrected the next day) while storage stays bounded. A RESCHEDULED date yields
  // a new @date → a new id → a fresh, non-dismissed alert (this gc never touches that new id).
  // Legacy bare ids (no @date) can no longer match a computed alert id, so drop them.
  const d = get(KEYS.dismissed, []) || [];
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const keep = d.filter(id => { const at = String(id).lastIndexOf('@'); return at >= 0 && String(id).slice(at + 1) >= cutoff; });
  if (keep.length !== d.length) set(KEYS.dismissed, keep);
}

function refresh() {
  TODAY = nowISO();   // a tab left open across midnight must not keep computing against yesterday
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
  const fx = get(KEYS.fx, null);
  const usd = (fx && Number.isFinite(fx.usd) && Number.isFinite(fx.at) && Date.now() - fx.at < 48 * 3600e3) ? fx.usd : null;
  const arrived = countdown(DATA.meta?.arrival_date || '2026-06-30', nowISO()).phase === 'arrived';
  // "to land" is a paid sunk cost once arrived — show monthly burn instead. USD twin follows suit.
  const yenFig = arrived ? s.monthlyTotal : s.toLand;
  const inUsd = (usd && yenFig > 0) ? ` (~$${Math.round(yenFig * usd).toLocaleString('en-US')})` : '';
  // actuals beat estimates: with real spends in the trailing 30 days, show measured burn + runway
  const bs = get(KEYS.budget, {}) || {};
  const sp = arrived ? spendSummary((get(KEYS.spend, {}) || {}).items || [], s.monthlyTotal, bs.savings || 0, bs.monthlyIncome || 0, nowISO(), bs.savingsAsOf) : null;
  // real logged spends ALWAYS beat the onboarding nudge — actuals are the feature's whole premise
  const budgetText = sp
    ? `spent ${fmtYen(sp.actualThisMonth)}${s.monthlyTotal > 0 ? ` of ${fmtYen(s.monthlyTotal)}` : ''}${sp.confident ? ` · runway ~${sp.actualRunwayMonths === Infinity ? '∞' : sp.actualRunwayMonths + ' mo'} (logged)` : ' · keep logging for real runway'}`
    : (s.oneTimeTotal === 0 && s.monthlyTotal === 0 && savings === 0)
      ? 'Set up your budget'
      : `Runway: ${s.runwayMonths === Infinity ? 'sustainable' : s.runwayMonths + ' mo'} · ${arrived ? `burn ${fmtYen(s.monthlyTotal)}/mo` : `to land ${fmtYen(s.toLand)}`}${inUsd}`;
  teaser('#tBudget', budgetText, '#/budget');

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

  // Post-arrival, "trip readiness" (packing + visa prep) is a finished story — the score that
  // matters now is settling in: the Do Now / dependency-bucket / Later checklist phases.
  if (c.phase === 'arrived') {
    const SETTLE = ['Do Now', 'Needs Residence', 'Needs Number', 'Later'];
    const items = (DATA.checklist || []).filter(p => SETTLE.some(s => (p.phase || '').startsWith(s))).flatMap(p => p.items || []);
    const done = items.filter(it => checks[it.id]).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 100;
    const tone = pct >= 75 ? 'good' : pct >= 40 ? 'ok' : 'low';
    const bLabel = { ready: 'ready', tight: 'tight', unset: 'unset' }[budgetReady] || 'unset';
    const h = el.querySelector('.widget-h [data-i18n]');
    if (h) { h.textContent = 'Settling in'; h.dataset.i18n = 'head.readiness.arrived'; }
    const bodyA = el.querySelector('.widget-body');
    if (bodyA) bodyA.innerHTML = `
    <div class="rdy" data-tone="${esc(tone)}">
      <div class="rdy-score"><span class="rdy-num" data-countup="${esc(String(pct))}">${esc(String(pct))}</span><span class="rdy-pct">%</span><span class="sr-only"> settled in</span></div>
      <div class="rdy-meta">
        <div class="rdy-days">Day ${esc(String((c.days ?? 0) + 1))} in Japan</div>
        <div class="rdy-parts">
          <a href="#/checklist">Settling-in tasks ${esc(String(done))}/${esc(String(items.length))}</a>
          <span aria-hidden="true">·</span>
          <a href="#/budget">Budget ${esc(bLabel)}</a>
        </div>
      </div>
    </div>
    ${yearStatsHTML()}`;
    return;
  }

  const r = readiness({ checklistPct, packingPct: pk.pct, budgetReady, daysToArrival: c.days });
  const budgetLabel = { ready: 'ready', tight: 'tight', unset: 'unset' }[r.parts[2].status] || 'unset';
  const toneWord = { good: 'on track', ok: 'getting there', low: 'just starting' }[r.tone] || '';
  const daysLine = c.phase === 'arrived'
    ? `Day ${(c.days ?? 0) + 1} in Japan`
    : `${c.days ?? '—'} day${c.days === 1 ? '' : 's'} to Tokyo`;

  const bodyB = el.querySelector('.widget-body');
  if (bodyB) bodyB.innerHTML = `
    <div class="rdy" data-tone="${esc(r.tone)}">
      <div class="rdy-score"><span class="rdy-num" data-countup="${esc(String(r.score))}">${esc(String(r.score))}</span><span class="rdy-pct">%</span><span class="sr-only"> ready — ${esc(toneWord)}</span></div>
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
  // Drop dead history: a deadline/book/task more than 30 days past isn't actionable — it's just
  // clutter that re-floods the bell. Future + ≤30-day-past items are kept (still worth surfacing).
  const floor = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return items.filter(it => it.when >= floor);
}

// ---- countdown: hero numeral (canonical) + small topbar copy ----
// Recomputes "today" each call so the minute-timer (mountDashboard) rolls the count over at midnight.
function renderCountdown() {
  if (nowISO() !== TODAY) refresh();   // midnight rolled over — recompute alerts/widgets, not just the number
  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', nowISO());
  const arrived = c.phase === 'arrived';
  // day-in-Japan counts INCLUSIVELY (landing day = day 1) — matches the Settling-in widget
  const dayN = arrived ? (c.days ?? 0) + 1 : c.days;
  // topbar (decorative, aria-hidden in markup)
  const el = $('#countdown');
  if (el) {
    const unit = arrived ? (dayN === 1 ? 'DAY IN' : 'DAYS IN') : (dayN === 1 ? 'DAY TO NRT' : 'DAYS TO NRT');
    const html = `<span class="cd-num">${dayN ?? ''}</span><span class="cd-label">${unit}</span><span class="cd-credit">CREDIT 01</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('arrived', arrived);
  }
  // hero (the aria-live region) — only mutate when the day count actually changes, so the
  // minute-timer never re-announces the same number to screen readers.
  const hero = $('#heroCount');
  if (hero) {
    const num = String(dayN ?? '');
    const numEl = hero.querySelector('.hc-num');
    if (numEl?.textContent !== num) {
      const unit = arrived ? (dayN === 1 ? 'day in Japan' : 'days in Japan') : (dayN === 1 ? 'day until I land' : 'days until I land');
      if (numEl) numEl.textContent = num;
      const unitEl = hero.querySelector('.hc-unit');
      if (unitEl) unitEl.textContent = unit;
    }
    // sub-label was hardcoded "NRT · 2026-06-30" — post-arrival it should read the settled-in phase
    if (arrived) {
      const dateEl = hero.querySelector('.hc-date');
      if (dateEl) dateEl.textContent = 'Tokyo · since Jun 30';
    }
    hero.classList.toggle('arrived', arrived);
  }
}

// ---- bell + panel ----
function wireBell() {
  const bell = $('#notifBell'), panel = $('#notifPanel');
  if (!bell || !panel) return;
  if (bell.dataset.wired) return;   // guard: the two document-level listeners must mount once
  bell.dataset.wired = '1';
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
    const idx = $$('#notifPanel .np-x').indexOf(b);
    dismiss(b.dataset.dismiss);
    // dismiss() re-rendered the panel and destroyed the focused ✕ — keep keyboard focus in the list
    const xs = $$('#notifPanel .np-x');
    (xs[Math.min(idx, xs.length - 1)] || $('#notifBell'))?.focus();
  }));
  // swipe-to-dismiss (pointer; tap still navigates, vertical scroll preserved)
  const reduce = prefersReducedMotion();   // honours the app's ⚙ toggle as well as the OS setting
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
    $('#notifBell')?.focus();   // the clicked button just re-rendered away
  });
}

// ---- home: promoted "needs me" cards + demoted teasers ----
function renderWidgets(alerts) {
  renderToday();
  fill('#wDeadlines', alerts.filter(a => a.kind === 'deadline' || a.kind === 'task'), 3);
  renderProgress();
  renderGoingWidget();
  renderTeasers(alerts);
}

// "Today" — the post-arrival lead widget: today's day plan, today's events, tasks due today.
function renderToday() {
  const el = $('#wToday');
  if (!el) return;
  const bits = [];
  const plan = (loadPlans() || {})[TODAY];
  if (plan && plan.stops && plan.stops.length) {
    const t = plan.stops.find(s => s.startTime)?.startTime || '';
    bits.push(`<li><a href="#/plan"><span class="w-when">${esc(t || 'plan')}</span> ${esc(clip(plan.title || 'Day plan', 38))} · ${plan.stops.length} stop${plan.stops.length === 1 ? '' : 's'}</a> <a class="wt-map" href="#/map" aria-label="Show today's route on the map">🧭</a></li>`);
  }
  allEvents()
    .filter(e => { const d = (e.date || '').slice(0, 10); const end = (e.endDate || '').slice(0, 10); return d === TODAY || (d < TODAY && end >= TODAY); })
    .slice(0, 3)
    .forEach(e => bits.push(`<li><a href="#/calendar"><span class="w-when">${esc(e.time || 'today')}</span> ${esc(clip(e.title, 46))}</a></li>`));
  const due = get(KEYS.due, {}) || {};
  const checks = get(KEYS.checklist, {}) || {};
  checklistItems(DATA).filter(it => due[it.id] === TODAY && !checks[it.id]).slice(0, 2)
    .forEach(it => bits.push(`<li><a href="#/checklist"><span class="w-when">due</span> ${esc(clip(it.task, 46))}</a></li>`));
  // 縁 birthdays — device-local People data; only ever appears ON the day (zero ambient noise)
  (get(KEYS.people, []) || []).filter(p => isBirthday(p.birthday, TODAY)).slice(0, 2)
    .forEach(p => bits.push(`<li><a href="#/people"><span class="w-when">🎂</span> ${esc(clip(String(p.name || ''), 40))}’s birthday</a></li>`));
  const body = el.querySelector('.widget-body'); if (!body) return;
  body.innerHTML = `<div class="wx-strip" id="wxStrip" hidden></div>` + (bits.length
    ? `<ul>${bits.join('')}</ul>`
    : `<p class="w-empty">Nothing on for today — <a href="#/plan">plan a day</a> or <a href="#/explore">find something</a>.</p>`);
  renderWxStrip();   // fill from cache synchronously; refreshWeather() re-fills when a fetch lands
}

// ---- local weather strip (Open-Meteo, keyless) — top of the Today widget ----
const WX_FRESH_MS = 30 * 60e3;    // don't re-fetch more than every 30 min
const WX_MAX_AGE_MS = 3 * 3600e3; // never show a reading older than 3h (hide instead of lying)
// shape-validated cache read — get()'s type guard is inert with a null fallback, and a backup
// import can write ANY shape into jwh-wx-v1, so validate the fields this module dereferences
function wxCache() {
  const c = get(KEYS.weather, null);
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  if (!Number.isFinite(c.at) || c.at - Date.now() > 60e3) return null;   // non-numeric/NaN or future 'at' would defeat the age math
  if (!c.data || typeof c.data !== 'object' || typeof c.data.temp !== 'number') return null;
  return c;
}
function renderWxStrip() {
  const el = $('#wxStrip');
  if (!el) return;
  const c = wxCache();
  if (!c || Date.now() - c.at > WX_MAX_AGE_MS) { el.hidden = true; return; }
  const w = c.data, i = wmoInfo(w.code);
  el.hidden = false;
  el.innerHTML = `<span aria-hidden="true">${esc(i.emoji)}</span> ${esc(String(w.temp))}°`
    + (w.feels != null && w.feels !== w.temp ? ` <span class="wx-dim">feels ${esc(String(w.feels))}°</span>` : '')
    + ` · ${esc(i.label)}`
    + (w.hi != null && w.lo != null ? ` <span class="wx-dim">· H${esc(String(w.hi))}° L${esc(String(w.lo))}°</span>` : '')
    // "☔ 100%" is the DAY'S max, not the current sky — say so, and give SRs the word the emoji carries
    + (w.rainPct != null && w.rainPct > 0 ? ` · <span aria-hidden="true">☔</span> <span class="sr-only">rain </span>${esc(String(w.rainPct))}% <span class="wx-dim">today</span>` : '')
    + (w.sunrise && w.sunset ? ` <span class="wx-dim">· <span aria-hidden="true">🌅</span><span class="sr-only">sunrise </span>${esc(w.sunrise)} <span aria-hidden="true">🌇</span><span class="sr-only">sunset </span>${esc(w.sunset)}</span>` : '');
}
// "year so far" stat strip (expansion ledger S7) — read-only, derived from existing stores;
// fills the Settling-in card's spare space instead of orphaning a 7th grid cell
function yearStatsHTML() {
  const visited = loadPlaces().filter(p => p.visited).length;
  const attended = allEvents().filter(e => isGoing(e.id) && (e.endDate || e.date).slice(0, 10) < TODAY).length;
  const tasksDone = Object.keys(get(KEYS.checklist, {}) || {}).length;
  const st = (n, label) => `<span class="ys-stat"><b>${esc(String(n))}</b> ${esc(label)}</span>`;
  return `<div class="ys-strip">${st(visited, 'places visited')}<span aria-hidden="true">·</span>${st(attended, 'events attended')}<span aria-hidden="true">·</span>${st(tasksDone, 'tasks done')}</div>`;
}

// ¥→USD for the budget teaser (er-api, keyless). 24h TTL — FX day-precision is plenty here.
let fxInFlight = false;
async function refreshRates() {
  const fx = get(KEYS.fx, null);
  if (fx && Number.isFinite(fx.at) && Date.now() - fx.at < 24 * 3600e3) return;
  if (fxInFlight) return;
  fxInFlight = true;
  try {
    const usd = await fetchUsdPerJpy();
    if (usd) { set(KEYS.fx, { at: Date.now(), usd }); refreshTeasers(); }
  } catch { /* offline — the teaser just shows yen only */ }
  finally { fxInFlight = false; }
}

let wxInFlight = false;   // dedupe: mount + the boot jwh:route both call this before the cache exists
async function refreshWeather() {
  const c = wxCache();
  if (c && Date.now() - c.at < WX_FRESH_MS) { renderWxStrip(); return; }
  if (wxInFlight) return;
  wxInFlight = true;
  try {   // everything after the flag is inside try — a throw anywhere must not wedge the flag
    const home = loadPlaces().find(p => p.home && Number.isFinite(p.lat) && Number.isFinite(p.lng));
    // ~1km precision is plenty for weather — don't hand a third party the exact address
    const rnd = (v) => Math.round(v * 100) / 100;
    const [lat, lng] = home ? [rnd(home.lat), rnd(home.lng)] : [35.68, 139.77];
    const data = await fetchWeather(lat, lng);
    if (data) set(KEYS.weather, { at: Date.now(), data });
  } catch { /* offline / API down — a fresh-enough cached strip stays; a stale one hides */ }
  finally { wxInFlight = false; }
  renderWxStrip();
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
  const body = el.querySelector('.teaser-body');
  if (body) body.innerHTML = `<a href="${route}">${esc(text)} <span class="teaser-go" aria-hidden="true">→</span></a>`;
}
// curated "events I'm going to" — the ones the user has marked ✓ Going (not the auto upcoming stream)
function renderGoingWidget() {
  const el = $('#wGoing');
  if (!el) return;
  const going = allEvents().filter(e => isGoing(e.id) && (e.endDate || e.date).slice(0, 10) >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
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
  // Post-arrival, scope to the same settling-in phases the readiness widget counts, so the two
  // widgets agree. Pre-arrival, count every checklist item (the full yearlong plan).
  const arrived = countdown(DATA.meta?.arrival_date || '2026-06-30', nowISO()).phase === 'arrived';
  const SETTLE = ['Do Now', 'Needs Residence', 'Needs Number', 'Later'];
  const all = arrived
    ? (DATA.checklist || []).filter(p => SETTLE.some(s => (p.phase || '').startsWith(s))).flatMap(p => p.items || [])
    : checklistItems(DATA);
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
