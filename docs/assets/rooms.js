'use strict';
// Share-room finder (#/rooms). Curated foreigner-friendly providers/houses, enriched once from
// free text (lib/rooms.js) into a filterable/sortable list with parsed cost, transit, and flags.
// Save/Contacted/note state is device-local (jwh-rooms-v1). No provider has a public listings
// API, so live availability lives on the links. Renders lazily on first visit to #/rooms.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { enrich, LINE_LABELS } from './lib/rooms.js';
import { showModal } from './lib/modal.js';

let DATA = null;
let ROOMS = [];
let rendered = false;
const noteTimers = new Map();   // per-room debounced note saves (module-scope so a toggle can flush them)
const compareSet = new Set();   // room ids selected for compare (max 4); UI-only, not persisted

const yen = (n) => '¥' + Number(n).toLocaleString('en-US');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const isOn = (sel) => !!$(sel)?.classList.contains('active');

// ---- status store (saved / contacted / note per room id) ----
function allStatus() { return get(KEYS.rooms, {}); }
function writeStatus(mutator) { const all = { ...allStatus() }; mutator(all); set(KEYS.rooms, all); }
function tidy(all, id, cur) { if (Object.keys(cur).length) all[id] = cur; else delete all[id]; }

// Persist any in-flight (debounced) note edits NOW — call before a render that rebuilds the grid,
// so the rebuilt textarea reads the just-typed text instead of a stale value.
function flushNotes() {
  noteTimers.forEach((t, id) => {
    clearTimeout(t);
    const ta = document.querySelector(`.room-card[data-id="${CSS.escape(id)}"] .room-note-edit`);
    if (ta) saveNote(id, ta.value);
  });
  noteTimers.clear();
}

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
  let roomsDirty = false;   // EF3: hidden → dirty; catch up on entry
  document.addEventListener('jwh:data-changed', () => {
    if (!rendered) return;
    if (document.getElementById('view-rooms')?.classList.contains('is-active')) render();
    else roomsDirty = true;
  });
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'rooms' && roomsDirty && rendered) { roomsDirty = false; render(); } });
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
    furnished: isOn('#roomFurnished'), shortTerm: isOn('#roomShortTerm'),
  };
}

function matches(r, f, status) {
  if (f.q && !r._blob.includes(f.q)) return false;
  if (f.ceiling !== Infinity && r._price.monthlyMin != null && r._price.monthlyMin > f.ceiling) return false;
  if (f.room === 'private' && !(r.roomType === 'private' || r.roomType === 'private-apartment' || r.roomType === 'both')) return false;
  if (f.room === 'dorm' && !(r.roomType === 'dorm' || r.roomType === 'both')) return false;
  if (f.lines.length && !f.lines.some(l => r._lines.includes(l))) return false;
  if (f.noKey && !r.noKeyMoney) return false;
  if (f.noGuar && !r._noGuarantor) return false;
  if (f.abroad && !r._bookAbroad) return false;
  if (f.women && !r._women) return false;
  if (f.furnished && !r.furnished) return false;
  if (f.shortTerm && !r.shortTerm) return false;
  if (f.savedOnly && !(status[r.id] && status[r.id].saved)) return false;
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
  if (!st) return 'Citywide — many houses';
  // Genericize only a bare "Various"/"Filter…" with no authored detail; keep any "— …", "e.g.", or
  // "(…)" nuance (e.g. "Various — many danchi are a bus ride from the nearest station").
  if (/^(various|filter)\b/i.test(st) && !/[—(]|e\.g\./i.test(st)) return 'Citywide — many houses';
  return st;
}
function flagBadges(r) {
  const out = [];
  if (r.noKeyMoney) out.push('NO KEY MONEY');     // headline foreigner-friendly flags lead
  if (r._noGuarantor) out.push('NO GUARANTOR');
  if (r._bookAbroad) out.push('BOOK FROM ABROAD');
  if (r._women) out.push('WOMEN-ONLY');
  if (r.furnished) out.push('FURNISHED');          // then the two new filter-match badges
  if (r.shortTerm) out.push('SHORT-TERM OK');
  return out.map(x => `<span class="room-flag">${esc(x)}</span>`).join('');
}
function card(r, status) {
  const s = status[r.id] || {};
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
      <label class="room-compare"><input type="checkbox" data-act="compare"${compareSet.has(r.id) ? ' checked' : ''}${!compareSet.has(r.id) && compareSet.size >= 4 ? ' disabled title="Comparing 4 already — remove one to add this"' : ''}> Compare</label>
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

// Keyboard-focus continuity across the grid rebuild (matches the calendar/checklist convention).
function focusKey() {
  const a = document.activeElement;
  const grid = $('#roomsGrid');
  if (!a || !grid || !grid.contains(a) || !a.dataset.act) return null;
  const id = a.closest('.room-card')?.dataset.id;
  return id ? { id, act: a.dataset.act } : null;
}
function restoreFocus(key) {
  if (!key) return;
  const grid = $('#roomsGrid'); if (!grid) return;
  grid.querySelector(`.room-card[data-id="${CSS.escape(key.id)}"] [data-act="${key.act}"]`)?.focus();
}

// ---- render ----
// any filter narrowing the list? (drives the Reset button's visibility — sort isn't a filter)
function anyFilterActive(f) {
  return !!(f.q || f.ceiling !== Infinity || f.room !== 'all' || f.lines.length
    || f.noKey || f.noGuar || f.abroad || f.women || f.furnished || f.shortTerm || f.savedOnly);
}
function clearAllFilters() {
  const s = $('#roomSearch'); if (s) s.value = '';
  const b = $('#roomBudget'); if (b) b.value = '200000';
  $$('#roomTypeF .chip').forEach(c => { const on = c.dataset.room === 'all'; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); });
  $$('#roomLines .chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
  ['#roomNoKey', '#roomNoGuar', '#roomAbroad', '#roomWomen', '#roomFurnished', '#roomShortTerm', '#roomSavedOnly']
    .forEach(sel => { const el = $(sel); if (el) { el.classList.remove('active'); el.setAttribute('aria-pressed', 'false'); } });
  updateBudgetLabel(); render();
}

function render() {
  const grid = $('#roomsGrid'); if (!grid) return;
  const f = readFilters();
  $('#roomReset')?.toggleAttribute('hidden', !anyFilterActive(f));   // show Reset only when something's filtered
  const status = allStatus();                       // read once per render (not per room)
  const key = focusKey();                            // capture focus before the rebuild
  const subset = sortRooms(ROOMS.filter(r => matches(r, f, status)), f.sort);
  grid.innerHTML = subset.map(r => card(r, status)).join('');
  if (!subset.length) {
    const p = document.createElement('p');
    p.className = 'room-empty'; p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite');
    p.textContent = 'No rooms match these filters — clear a filter or raise the budget.';
    grid.appendChild(p);
  }
  restoreFocus(key);
  updateSummary(subset.length, status);
  renderDrawer();
}
function updateSummary(n, status) {
  const ids = Object.keys(status);
  const saved = ids.filter(k => status[k].saved).length;
  const contacted = ids.filter(k => status[k].contacted).length;
  const el = $('#roomCount');
  if (el) el.textContent = `${n} of ${ROOMS.length} · ${saved} saved · ${contacted} contacted`;
}

// ---- compare (UI-only selection; ≤4) ----
// Selection persists across filter changes (cart model): a room you picked stays in the drawer
// even if a later filter hides its card. Reads from the full ROOMS list, not the filtered subset.
function renderDrawer() {
  const bar = $('#roomCompareBar'); if (!bar) return;
  if (compareSet.size === 0) { bar.hidden = true; bar.innerHTML = ''; return; }
  const chips = [...compareSet].map(id => {
    const r = ROOMS.find(x => x.id === id); const nm = r ? r.name : id;
    return `<span class="rc-chip">${esc(nm)} <button type="button" class="rc-x" data-rm="${esc(id)}" aria-label="Remove ${esc(nm)}">×</button></span>`;
  }).join('');
  bar.hidden = false;
  bar.innerHTML = `<div class="rc-chips">${chips}</div>
    <div class="rc-acts">
      <button type="button" class="btn primary" id="rcCompare"${compareSet.size < 2 ? ' disabled' : ''}>Compare (${compareSet.size}) →</button>
      <button type="button" class="btn ghost" id="rcClear">Clear</button>
    </div>`;
  $('#rcCompare')?.addEventListener('click', openCompare);
  $('#rcClear')?.addEventListener('click', () => { compareSet.clear(); render(); });
  bar.querySelectorAll('.rc-x').forEach(b => b.addEventListener('click', () => { compareSet.delete(b.dataset.rm); render(); }));
}

function openCompare() {
  const rows = [...compareSet].map(id => ROOMS.find(r => r.id === id)).filter(Boolean);
  if (rows.length < 2) return;
  const head = `<tr><th></th>${rows.map(r => `<th>${esc(r.name)}</th>`).join('')}</tr>`;
  const line = (label, fn) => `<tr><th>${esc(label)}</th>${rows.map(r => `<td>${esc(fn(r))}</td>`).join('')}</tr>`;
  const body = [
    line('Rent (all-in)', r => r._allIn != null ? `~${yen(r._allIn)}/mo` : r.rent),
    line('Move-in (est)', r => r._moveIn.total != null ? `~${yen(r._moveIn.total)}` : '—'),
    line('Fees', r => r.fees),
    line('Deposit', r => r.deposit),
    line('Room type', r => r.roomType + (r.gender ? ` · ${r.gender}` : '')),
    line('Requirements', r => (r.requirements || []).join(' · ')),
    line('Transit', r => transitText(r)),
    line('Move-in', r => r.moveIn),
  ].join('');
  const links = `<tr><th>Links</th>${rows.map(r => `<td><a href="${esc(r.listingUrl)}" target="_blank" rel="noopener noreferrer">listings ↗</a></td>`).join('')}</tr>`;
  const table = `<div class="rc-table-wrap"><table class="rc-table"><thead>${head}</thead><tbody>${body}${links}</tbody></table></div>`;
  showModal('Compare rooms', table, { wide: true });   // every cell above is esc()'d → safe to inject raw
}

function updateBudgetLabel() {
  const v = +($('#roomBudget')?.value || 200000);
  const out = $('#roomBudgetVal'); if (out) out.textContent = v >= 200000 ? 'Any' : `≤ ${yen(v)}/mo`;
}

// ---- wiring (bound once; the grid is rebuilt each render so card actions use delegation) ----
function wireControls() {
  const renderSoon = debounce(render, 150);
  $('#roomSearch')?.addEventListener('input', renderSoon);
  // label updates live; the filter/render (and its #roomCount aria-live announce) is debounced so a
  // slider drag doesn't fire a render + screen-reader announcement on every tick.
  $('#roomBudget')?.addEventListener('input', () => { updateBudgetLabel(); renderSoon(); });
  $('#roomSort')?.addEventListener('change', render);
  $$('#roomTypeF .chip').forEach(ch => ch.addEventListener('click', () => {
    $$('#roomTypeF .chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    ch.classList.add('active'); ch.setAttribute('aria-pressed', 'true'); render();
  }));
  ['#roomNoKey', '#roomNoGuar', '#roomAbroad', '#roomWomen', '#roomFurnished', '#roomShortTerm', '#roomSavedOnly'].forEach(sel => {
    $(sel)?.addEventListener('click', () => { const on = $(sel).classList.toggle('active'); $(sel).setAttribute('aria-pressed', on ? 'true' : 'false'); render(); });
  });
  $('#roomReset')?.addEventListener('click', clearAllFilters);
  updateBudgetLabel();

  const grid = $('#roomsGrid');
  grid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.room-act'); if (!btn) return;
    const id = btn.closest('.room-card')?.dataset.id; if (!id) return;
    flushNotes();   // persist any in-flight note edit before the rebuild reads from the store
    toggleStatus(id, btn.dataset.act === 'save' ? 'saved' : 'contacted');
  });
  grid?.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-act="compare"]'); if (!cb) return;
    const id = cb.closest('.room-card')?.dataset.id; if (!id) return;
    if (cb.checked) { if (compareSet.size < 4) compareSet.add(id); } else compareSet.delete(id);
    render();   // rebuild reflects checked + disables the rest at the cap, and refreshes the drawer
  });
  grid?.addEventListener('input', (e) => {
    const ta = e.target.closest('.room-note-edit'); if (!ta) return;
    const id = ta.closest('.room-card')?.dataset.id; if (!id) return;
    clearTimeout(noteTimers.get(id));
    noteTimers.set(id, setTimeout(() => saveNote(id, ta.value), 300));
  });
}
