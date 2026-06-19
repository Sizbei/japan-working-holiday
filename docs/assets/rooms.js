'use strict';
// Share-room finder (#/rooms). Curated foreigner-friendly providers/houses, enriched once from
// free text (lib/rooms.js) into a filterable/sortable list with parsed cost, transit, and flags.
// Save/Contacted/note state is device-local (jwh-rooms-v1). No provider has a public listings
// API, so live availability lives on the links. Renders lazily on first visit to #/rooms.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { enrich, LINE_LABELS } from './lib/rooms.js';

let DATA = null;
let ROOMS = [];
let rendered = false;

const yen = (n) => '¥' + Number(n).toLocaleString('en-US');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const isOn = (sel) => !!$(sel)?.classList.contains('active');

// ---- status store (saved / contacted / note per room id) ----
function allStatus() { return get(KEYS.rooms, {}); }
function statusOf(id) { return allStatus()[id] || {}; }
function writeStatus(mutator) { const all = { ...allStatus() }; mutator(all); set(KEYS.rooms, all); }
function tidy(all, id, cur) { if (Object.keys(cur).length) all[id] = cur; else delete all[id]; }

function toggleStatus(id, key) {
  writeStatus(all => { const cur = { ...(all[id] || {}) }; if (cur[key]) delete cur[key]; else cur[key] = true; tidy(all, id, cur); });
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));   // single path → render() re-derives
}
function saveNote(id, val) {
  // No dispatch / re-render: the note is already in the DOM; re-rendering would nuke the focused textarea.
  writeStatus(all => { const cur = { ...(all[id] || {}) }; const v = val.trim(); if (v) cur.note = v; else delete cur.note; tidy(all, id, cur); });
}

export function mountRooms(data) {
  DATA = data;
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'rooms') ensureRendered(); });
  document.addEventListener('jwh:data-changed', () => { if (rendered) render(); });
}

function ensureRendered() {
  if (rendered) { render(); return; }            // revisit: cheap re-render picks up any external change
  ROOMS = enrich(DATA.rooms || []);
  buildLineChips();
  wireControls();
  rendered = true;
  render();
}

// ---- area/line chips (union across rooms, in dictionary order) ----
function buildLineChips() {
  const cont = $('#roomLines'); if (!cont) return;
  const present = new Set();
  ROOMS.forEach(r => r._lines.forEach(l => present.add(l)));
  const ordered = LINE_LABELS.filter(l => present.has(l));
  cont.innerHTML = ordered.map(l =>
    `<button class="chip" type="button" data-line="${esc(l)}" aria-pressed="false">${esc(l)}</button>`).join('');
  $$('#roomLines .chip').forEach(ch => ch.addEventListener('click', () => {
    const on = ch.classList.toggle('active'); ch.setAttribute('aria-pressed', on ? 'true' : 'false'); render();
  }));
}

// ---- filtering / sorting ----
function readFilters() {
  const budget = +($('#roomBudget')?.value || 200000);
  return {
    q: ($('#roomSearch')?.value || '').trim().toLowerCase(),
    ceiling: budget >= 200000 ? Infinity : budget,
    room: $('#roomTypeF .chip.active')?.dataset.room || 'all',
    lines: $$('#roomLines .chip.active').map(c => c.dataset.line),
    sort: $('#roomSort')?.value || 'newcomer',
    noKey: isOn('#roomNoKey'), noGuar: isOn('#roomNoGuar'),
    abroad: isOn('#roomAbroad'), women: isOn('#roomWomen'), savedOnly: isOn('#roomSavedOnly'),
  };
}

function matches(r, f) {
  if (f.q && !r._blob.includes(f.q)) return false;
  if (f.ceiling !== Infinity && r._price.monthlyMin != null && r._price.monthlyMin > f.ceiling) return false;
  if (f.room === 'private' && !(r.roomType === 'private' || r.roomType === 'private-apartment' || r.roomType === 'both')) return false;
  if (f.room === 'dorm' && !(r.roomType === 'dorm' || r.roomType === 'both')) return false;
  if (f.lines.length && !f.lines.some(l => r._lines.includes(l))) return false;
  if (f.noKey && !r.noKeyMoney) return false;
  if (f.noGuar && !r._noGuarantor) return false;
  if (f.abroad && !r._bookAbroad) return false;
  if (f.women && !r._women) return false;
  if (f.savedOnly && !statusOf(r.id).saved) return false;
  return true;
}

const soon = (r) => /rolling|flexible/i.test(r.moveIn || '') ? 1 : 0;
function sortRooms(arr, sort) {
  const a = [...arr];
  const nl = (v) => v == null ? Infinity : v;
  if (sort === 'rent') a.sort((x, y) => nl(x._price.monthlyMin) - nl(y._price.monthlyMin));
  else if (sort === 'movein') a.sort((x, y) => nl(x._moveIn.total) - nl(y._moveIn.total));
  else if (sort === 'soonest') a.sort((x, y) => soon(y) - soon(x));
  return a;                                        // 'newcomer' → keep enrich/original order
}

// ---- card ----
function transitText(r) {
  const st = (r.station || '').trim();
  if (!st || /^various\b|^filter\b/i.test(st)) return 'Citywide — many houses';
  return st;
}
function flagBadges(r) {
  const out = [];
  if (r.noKeyMoney) out.push('NO KEY MONEY');
  if (r._noGuarantor) out.push('NO GUARANTOR');
  if (r._bookAbroad) out.push('BOOK FROM ABROAD');
  if (r._women) out.push('WOMEN-ONLY');
  return out.map(x => `<span class="room-flag">${esc(x)}</span>`).join('');
}
function card(r) {
  const s = statusOf(r.id);
  const allIn = r._allIn != null ? `~${yen(r._allIn)}/mo all-in` : 'Rent varies';
  const moveIn = r._moveIn.total != null ? `~${yen(r._moveIn.total)} move-in` : 'Move-in varies';
  const badges = flagBadges(r);
  return `<article class="room-card tier-${esc(r.tier)}" data-id="${esc(r.id)}">
    <div class="room-head"><h3 class="room-name">${esc(r.name)}</h3></div>
    <div class="room-provider">${esc(r.provider)} · <span class="room-area">📍 ${esc(r.area)}</span></div>
    <div class="room-cost-line"><b>${esc(allIn)}</b> <span class="room-est">${esc(moveIn)} · est</span></div>
    <div class="room-transit">🚉 ${esc(transitText(r))}</div>
    ${badges ? `<div class="room-flags">${badges}</div>` : ''}
    <p class="room-note">${esc(r.note)}</p>
    <div class="room-actions">
      <button type="button" class="room-act${s.saved ? ' on' : ''}" data-act="save" aria-pressed="${s.saved ? 'true' : 'false'}">${s.saved ? '★ Saved' : '☆ Save'}</button>
      <button type="button" class="room-act${s.contacted ? ' on' : ''}" data-act="contacted" aria-pressed="${s.contacted ? 'true' : 'false'}">${s.contacted ? '✓ Contacted' : 'Contacted?'}</button>
    </div>
    <details class="room-note-wrap"${s.note ? ' open' : ''}>
      <summary>Note</summary>
      <textarea class="room-note-edit" rows="2" aria-label="Private note for ${esc(r.name)}" placeholder="When you applied, who you emailed, the rent they quoted…">${esc(s.note || '')}</textarea>
    </details>
    <div class="room-links">
      <a class="btn primary" href="${esc(r.listingUrl)}" target="_blank" rel="noopener noreferrer">Browse listings ↗</a>
      <a class="btn ghost" href="${esc(r.providerUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.provider)} ↗</a>
    </div>
  </article>`;
}

// ---- render ----
function render() {
  const grid = $('#roomsGrid'); if (!grid) return;
  const f = readFilters();
  const subset = sortRooms(ROOMS.filter(r => matches(r, f)), f.sort);
  grid.innerHTML = subset.map(card).join('');
  if (!subset.length) {
    const p = document.createElement('p');
    p.className = 'room-empty'; p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite');
    p.textContent = 'No rooms match these filters — clear a filter or raise the budget.';
    grid.appendChild(p);
  }
  updateSummary(subset.length);
}
function updateSummary(n) {
  const all = allStatus();
  const ids = Object.keys(all);
  const saved = ids.filter(k => all[k].saved).length;
  const contacted = ids.filter(k => all[k].contacted).length;
  const el = $('#roomCount');
  if (el) el.textContent = `${n} of ${ROOMS.length} · ${saved} saved · ${contacted} contacted`;
}

function updateBudgetLabel() {
  const v = +($('#roomBudget')?.value || 200000);
  const out = $('#roomBudgetVal'); if (out) out.textContent = v >= 200000 ? 'Any' : `≤ ${yen(v)}/mo`;
}

// ---- wiring (bound once; the grid is rebuilt each render so card actions use delegation) ----
function wireControls() {
  $('#roomSearch')?.addEventListener('input', debounce(render, 150));
  $('#roomBudget')?.addEventListener('input', () => { updateBudgetLabel(); render(); });
  $('#roomSort')?.addEventListener('change', render);
  $$('#roomTypeF .chip').forEach(ch => ch.addEventListener('click', () => {
    $$('#roomTypeF .chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    ch.classList.add('active'); ch.setAttribute('aria-pressed', 'true'); render();
  }));
  ['#roomNoKey', '#roomNoGuar', '#roomAbroad', '#roomWomen', '#roomSavedOnly'].forEach(sel => {
    $(sel)?.addEventListener('click', () => { const on = $(sel).classList.toggle('active'); $(sel).setAttribute('aria-pressed', on ? 'true' : 'false'); render(); });
  });
  updateBudgetLabel();

  const grid = $('#roomsGrid');
  grid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.room-act'); if (!btn) return;
    const id = btn.closest('.room-card')?.dataset.id; if (!id) return;
    toggleStatus(id, btn.dataset.act === 'save' ? 'saved' : 'contacted');
  });
  const noteTimers = new Map();
  grid?.addEventListener('input', (e) => {
    const ta = e.target.closest('.room-note-edit'); if (!ta) return;
    const id = ta.closest('.room-card')?.dataset.id; if (!id) return;
    clearTimeout(noteTimers.get(id));
    noteTimers.set(id, setTimeout(() => saveNote(id, ta.value), 300));
  });
}
