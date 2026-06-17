'use strict';
// Plan a Day (#/plan). One day at a time: a horizontal day-chip rail picks the date; the body
// is an ordered timeline of stops with rough travel-time legs between them. Stops come from the
// unified placesModel() (saved pins + events + catalogue) or an ad-hoc typed name. Drag or ▲▼
// to reorder. Export the finished day to .ics / Google Calendar / the in-app calendar.
//
// Single-path data flow: every mutation goes through lib/dayplan.js (dispatches jwh:data-changed
// once); the listener re-renders. render() NEVER dispatches (no loop) and mutations never call
// render() directly.

import { $, esc } from './lib/dom.js';
import { nowISO, fmtShort } from './lib/dates.js';
import { areaOf } from './lib/geo.js';
import { legLabel, totalTransit, areaCount } from './lib/transit.js';
import { loadPlaces } from './lib/places.js';
import { placesModel, drawRoute, clearRoute } from './map.js';
import { toICS, gcalUrl } from './lib/ics.js';
import { KEYS, get, set } from './lib/store.js';
import {
  loadPlans, getPlan, hasPlan, newStop, planToEvents,
  upsertStop, removeStop, patchStop, reorderStops,
} from './lib/dayplan.js';
import { makeSortable } from './dnd.js';
import { alertModal } from './lib/modal.js';

let DATA = null, activeDate = '';

const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };   // UTC-pure calendar add (no timezone off-by-one)

export function mountPlan(data) {
  DATA = data;
  const arrival = (data.meta && data.meta.arrival_date) || '2026-06-30';
  const today = nowISO();
  activeDate = firstPlanned() || (arrival >= today ? arrival : today);
  renderRail();
  render();
  $('#planBody')?.addEventListener('click', onBodyClick);
  document.addEventListener('jwh:data-changed', () => { renderRail(); render(); });
  // the route line is drawn on demand (Show route on map); clear it only when leaving BOTH
  // plan and map (never auto-load Leaflet on #/plan).
  document.addEventListener('jwh:route', (e) => { const r = e.detail?.route; if (r !== 'plan' && r !== 'map') clearRoute(); });
}
function firstPlanned() { const ks = Object.keys(loadPlans()).filter(k => hasPlan(k)).sort(); return ks[0] || ''; }

// ---- day-chip rail: today→arrival+30, plus any planned dates ----
function railDates(plans) {
  const today = nowISO();
  const arrival = (DATA.meta && DATA.meta.arrival_date) || '2026-06-30';
  const start = today < arrival ? today : arrival;
  const set = new Set();
  for (let i = 0; i <= 44; i++) set.add(addDaysISO(start, i));
  Object.keys(plans).forEach(d => set.add(d));
  set.add(activeDate);
  return [...set].sort();
}
function renderRail() {
  const rail = $('#planDays'); if (!rail) return;
  const today = nowISO();
  const plans = loadPlans();   // read the plans blob ONCE, not per chip (N+1 → 1)
  const isPlanned = (d) => { const p = plans[d]; return !!(p && p.stops && p.stops.length); };
  rail.innerHTML = railDates(plans).map(d => {
    const planned = isPlanned(d);
    const isToday = d === today;
    return `<button type="button" role="tab" class="plan-chip${d === activeDate ? ' active' : ''}${planned ? ' has-plan' : ''}" data-date="${esc(d)}" aria-selected="${d === activeDate ? 'true' : 'false'}" aria-label="${esc(fmtShort(d))}${isToday ? ', today' : ''}${planned ? ', has a plan' : ''}">
      <span class="plan-chip-d" aria-hidden="true">${esc(fmtShort(d))}</span>${isToday ? '<span class="plan-chip-tag" aria-hidden="true">today</span>' : ''}${planned ? '<span class="plan-chip-dot" aria-hidden="true"></span>' : ''}
    </button>`;
  }).join('') + `<label class="plan-pick">+ date<input type="date" id="planPick" aria-label="Jump to any date"></label>`;
  rail.querySelectorAll('.plan-chip').forEach(b => b.addEventListener('click', () => { activeDate = b.dataset.date; renderRail(); render(); scrollActiveIntoView(); }));
  $('#planPick')?.addEventListener('change', (e) => { if (e.target.value) { activeDate = e.target.value; renderRail(); render(); } });
}
function scrollActiveIntoView() { $('#planDays .plan-chip.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }

// ---- the day ----
function render() {
  const body = $('#planBody'); if (!body) return;
  const plan = getPlan(activeDate);
  const stops = plan ? plan.stops : [];
  if (!stops.length) {
    body.innerHTML = `<div class="plan-empty">
      <p class="plan-empty-h">No plan for <b>${esc(fmtShort(activeDate))}</b> yet.</p>
      <p>Add your first stop — pull from your saved pins, the catalogue, upcoming events, or type your own.</p>
      <button type="button" class="plan-add" data-act="add">＋ Add a stop</button></div>`;
    return;
  }
  const rows = stops.map((s, i) => stopRow(s, i, stops)).join('');
  const mins = totalTransit(stops, DATA.areaGeo);
  const pace = stops.length >= 5 ? `<span class="plan-pace">⚠ ${stops.length} stops — that's a full day; consider trimming.</span>` : '';
  body.innerHTML = `
    <div class="plan-foot-top">
      <span class="plan-summary">${stops.length} stop${stops.length > 1 ? 's' : ''} · ≈${mins} min between · ${areaCount(stops)} area${areaCount(stops) > 1 ? 's' : ''}</span>
      ${pace}
    </div>
    <ol class="stop-list" aria-label="Itinerary for ${esc(fmtShort(activeDate))}">${rows}</ol>
    <div class="plan-actions">
      <button type="button" class="plan-add" data-act="add">＋ Add a stop</button>
      <button type="button" class="plan-btn" data-act="map">🗺 Show route on map</button>
      <button type="button" class="plan-btn" data-act="ics">⬇ .ics</button>
      <button type="button" class="plan-btn" data-act="gcal">📅 Google</button>
      <button type="button" class="plan-btn" data-act="addcal">＋ Add to calendar</button>
    </div>`;
  wireSortable();
}

function stopRow(s, i, stops) {
  const leg = i > 0 ? legLabel(stops[i - 1], s, DATA.areaGeo) : null;
  const legHTML = leg ? `<li class="leg${leg.fuzzy ? ' fuzzy' : ''}" role="presentation"><span>${esc(leg.text)}</span></li>` : '';
  const end = s.startTime ? endTime(s.startTime, s.durationMin) : '';
  return `${legHTML}
    <li class="stop" data-id="${esc(s.id)}">
      <button type="button" class="stop-grab dnd-handle" aria-label="Reorder ${esc(s.name)} — drag, or use the arrow buttons">⠿</button>
      <span class="stop-num">${i + 1}</span>
      <div class="stop-main">
        <div class="stop-name">${esc(s.name)}${s.coordKind === 'approx' ? ' <span class="stop-approx" title="neighbourhood-level location">≈</span>' : ''}${s.locked ? ' <span title="fixed time">🔒</span>' : ''}</div>
        <div class="stop-sub">${esc(areaOf(s.area))}${s.area && areaOf(s.area) !== s.area ? '' : ''}</div>
        <div class="stop-controls">
          <label class="stop-time">🕑 <input type="time" value="${esc(s.startTime || '')}" data-edit="time" data-id="${esc(s.id)}" aria-label="Start time for ${esc(s.name)}"></label>
          <span class="stop-dur" role="group" aria-label="Duration for ${esc(s.name)}">
            <button type="button" class="dur-btn" data-edit="dur-" data-id="${esc(s.id)}" aria-label="Less time">−</button>
            <span class="dur-val" aria-live="polite">${s.durationMin} min</span>
            <button type="button" class="dur-btn" data-edit="dur+" data-id="${esc(s.id)}" aria-label="More time">＋</button>
          </span>
          ${end ? `<span class="stop-end">→ ${esc(end)}</span>` : ''}
        </div>
        <input type="text" class="stop-note" value="${esc(s.note || '')}" data-edit="note" data-id="${esc(s.id)}" placeholder="note…" aria-label="Note for ${esc(s.name)}">
      </div>
      <span class="stop-move">
        <button type="button" class="mv" data-edit="up" data-id="${esc(s.id)}" aria-label="Move ${esc(s.name)} earlier"${i === 0 ? ' disabled' : ''}>▲</button>
        <button type="button" class="mv" data-edit="down" data-id="${esc(s.id)}" aria-label="Move ${esc(s.name)} later"${i === stops.length - 1 ? ' disabled' : ''}>▼</button>
      </span>
      <button type="button" class="stop-del" data-edit="del" data-id="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">✕</button>
    </li>`;
}
function endTime(start, dur) {
  const [h, m] = start.split(':').map(Number);
  if (isNaN(h)) return '';
  const t = h * 60 + m + (dur || 0);
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// ---- interactions (delegated on #planBody) ----
function onBodyClick(e) {
  const b = e.target.closest('[data-act],[data-edit]'); if (!b) return;
  const act = b.dataset.act, edit = b.dataset.edit, id = b.dataset.id;
  if (act === 'add') return openPicker();
  const plan = getPlan(activeDate);                    // every action below needs a plan with stops
  if ((act && act !== 'add') || edit) { if (!plan?.stops?.length) return; }
  if (act === 'map') { drawRoute(plan.stops); location.hash = '#/map'; return; }
  if (act === 'ics') return downloadICS();
  if (act === 'gcal') { const evs = planToEvents(plan); if (evs[0]) window.open(gcalUrl(evs[0]), '_blank', 'noopener'); return; }
  if (act === 'addcal') return addToCalendar();
  if (edit === 'del') { announce('Removed stop'); return removeStop(activeDate, id); }
  if (edit === 'up' || edit === 'down') return moveStop(id, edit);
  if (edit === 'dur-' || edit === 'dur+') return bumpDuration(id, edit === 'dur+' ? 15 : -15);
}
// note + time use change events (delegated)
function onBodyChange(e) {
  const t = e.target; const id = t.dataset.id;
  if (t.dataset.edit === 'note') patchStop(activeDate, id, { note: t.value });
  else if (t.dataset.edit === 'time') patchStop(activeDate, id, { startTime: t.value });
}
function moveStop(id, dir) {
  const stops = getPlan(activeDate).stops;
  const i = stops.findIndex(s => s.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= stops.length) return;
  const ids = stops.map(s => s.id);
  ids.splice(i, 1); ids.splice(j, 0, id);
  reorderStops(activeDate, ids);
  announce(`Moved to position ${j + 1} of ${stops.length}`);
}
function bumpDuration(id, delta) {
  const s = getPlan(activeDate).stops.find(x => x.id === id); if (!s) return;
  patchStop(activeDate, id, { durationMin: Math.max(15, (s.durationMin || 60) + delta) });
}
function wireSortable() {
  const ol = $('#planBody .stop-list'); if (!ol) return;
  makeSortable(ol, {
    itemSelector: '.stop', handleSelector: '.stop-grab', idOf: el => el.dataset.id, label: 'stop',
    onReorder: (ids) => { reorderStops(activeDate, ids.filter(Boolean)); announce('Reordered itinerary'); },
  });
}
function announce(msg) { const el = $('#planLive'); if (el) el.textContent = msg; }

// ---- add-stop picker (modal sheet over placesModel + saved) ----
function openPicker() {
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'plan-modal';
  ov.innerHTML = `<div class="plan-sheet" role="dialog" aria-modal="true" aria-label="Add a stop">
    <div class="plan-sheet-top">
      <input type="search" id="pkFilter" placeholder="filter places…" aria-label="Filter places" autocomplete="off">
      <button type="button" class="plan-sheet-x" data-x aria-label="Close">✕</button>
    </div>
    <div class="plan-tabs" role="tablist">
      <button type="button" class="pk-tab active" data-src="saved" aria-selected="true">★ Saved</button>
      <button type="button" class="pk-tab" data-src="catalogue" aria-selected="false">Catalogue</button>
      <button type="button" class="pk-tab" data-src="event" aria-selected="false">Events</button>
    </div>
    <ul class="pk-list" id="pkList" aria-live="polite"></ul>
  </div>`;
  document.body.appendChild(ov);
  let src = 'saved', q = '';
  const points = () => {
    const model = placesModel();
    if (src === 'saved') return model.filter(p => p.kind === 'user');
    if (src === 'event') return model.filter(p => p.kind === 'event');
    return model.filter(p => p.kind === 'catalogue');
  };
  const draw = () => {
    const list = points().filter(p => !q || (p.name + ' ' + (p.area || '')).toLowerCase().includes(q));
    const rows = list.slice(0, 80).map(p => `<li><button type="button" class="pk-item" data-id="${esc(p.id)}">
      <span class="pk-name">${esc(p.name)}${p.coordKind === 'approx' ? ' <span class="stop-approx">≈</span>' : ''}</span>
      <span class="pk-area">${esc(areaOf(p.area))}</span></button></li>`).join('');
    const adhoc = q ? `<li><button type="button" class="pk-item pk-adhoc" data-adhoc="${esc(q)}">＋ Add “${esc(q)}” as a custom stop</button></li>` : '';
    $('#pkList').innerHTML = (rows || '') + adhoc || `<li class="pk-empty">No matches — type a name to add a custom stop.</li>`;
  };
  draw();
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); if (prev?.focus) prev.focus(); };
  const focusables = () => [...ov.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-x]')) return close();
    const tab = e.target.closest('.pk-tab');
    if (tab) { src = tab.dataset.src; ov.querySelectorAll('.pk-tab').forEach(t => { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); }); draw(); return; }
    const adhoc = e.target.closest('[data-adhoc]');
    if (adhoc) { addAdhoc(adhoc.dataset.adhoc); close(); return; }
    const item = e.target.closest('.pk-item');
    if (item) { addFromModel(item.dataset.id); close(); }
  });
  ov.querySelector('#pkFilter').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  setTimeout(() => ov.querySelector('#pkFilter').focus(), 30);
}
function addFromModel(id) {
  const pt = placesModel().find(p => p.id === id); if (!pt) return;
  upsertStop(activeDate, newStop({ placeId: pt.id, name: pt.name, lat: pt.lat, lng: pt.lng, coordKind: pt.coordKind, area: pt.area, seed: Math.random() }));
  announce(`Added ${pt.name}`);
}
function addAdhoc(name) {
  upsertStop(activeDate, newStop({ name, area: '', coordKind: 'approx', seed: Math.random() }));
  announce(`Added ${name}`);
}

// ---- export ----
function downloadICS() {
  const evs = planToEvents(getPlan(activeDate)); if (!evs.length) return;
  const blob = new Blob([toICS(evs, 'My Tokyo Day')], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `tokyo-plan-${activeDate}.ics`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function addToCalendar() {
  const evs = planToEvents(getPlan(activeDate)); if (!evs.length) return;
  const u = (get(KEYS.events, []) || []).filter(e => e.id !== evs[0].id);   // replace any prior plan event for this day
  u.push(evs[0]); set(KEYS.events, u);
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  announce('Added the day to your calendar');
  alertModal('Added this day to your calendar — see it on the Calendar page.');
}

// wire the change-event listener once at module init (delegated)
document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#planBody')) onBodyChange(e); });
