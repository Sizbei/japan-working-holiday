'use strict';
// Map page (#/map). PROGRESSIVE ENHANCEMENT over an always-rendered, offline-safe link
// index (#mapList): the grouped Google-Maps links ALWAYS render (the only part that works
// offline). Leaflet + markercluster (unpkg, lazy, network-only, never precached) + OSM
// tiles + Nominatim layer ADDITIVELY into #mapCanvas; if they fail, the link index stands.
//
// All user-place mutation goes through lib/places.js (one source of truth). Pins come from
// THREE sources unified by placesModel(): upcoming events, the baked catalogue (neighbourhood
// centroid + jitter = coordKind 'approx'), and user-saved places (exact for drop/search).
// fav/locked pins live on a separate un-clustered layer (pinTop) so they're always visible.

import { $, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { AREAS, areaOf, AREA_ORDER, centroid, jitter } from './lib/geo.js';
import {
  loadPlaces, savePlaces, placeById, placeByName, upsertPlace, patchPlace, deletePlace, catId, slug,
} from './lib/places.js';
import { prefersReducedMotion } from './motion.js';

let DATA = null, map = null, pinLayer = null, pinTop = null, leafletReady = false, leafletTried = false;
let armed = false, openPlaceId = null, allBounds = [];
const markersById = new Map();

function gmaps(query) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' Tokyo'); }
function dedupe(arr) { const seen = new Set(); return arr.filter(p => { const k = (p.name || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }
function isSoon(d) { if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const diff = (Date.parse(d) - Date.now()) / 86400000; return diff >= -1 && diff <= 45; }
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---- filter state (persisted) ----
const SRC_CAT = { music: 'music', livemusic: 'music', geek: 'geek', building: 'build', restaurants: 'food', activities: 'seasonal', disney: 'disney', meetups: 'meet' };
const CAT_GLYPH = { music: '🎵', geek: '🕹️', build: '🏙️', food: '🍜', meet: '👥', disney: '🏰', seasonal: '🎏', personal: '📍', stay: '🏠', event: '📅', mine: '⭐' };
const FILTER_CATS = [
  { key: 'event', label: 'Events' }, { key: 'music', label: 'Music' }, { key: 'food', label: 'Food' },
  { key: 'geek', label: 'Geek' }, { key: 'build', label: 'Buildings' }, { key: 'meet', label: 'Meetups' },
  { key: 'disney', label: 'Disney' }, { key: 'stay', label: 'Stays' }, { key: 'mine', label: 'Yours' },
];
function filters() { return { hidden: [], area: 'all', ...(get(KEYS.mapFilters, {}) || {}) }; }
function setFilters(f) { set(KEYS.mapFilters, f); }
function bucketOf(pt) {
  if (pt.kind === 'user') return 'mine';
  if (pt.kind === 'event') return 'event';
  if (pt.cat === 'personal') return 'stay';          // rooms
  if (pt.cat === 'seasonal') return 'event';         // activities
  return pt.cat;                                      // music/geek/build/food/meet/disney
}

export function mountMap(data) {
  DATA = data;
  renderIndex();                                  // offline-safe link index — ALWAYS
  renderSaved();                                  // your-pins sidebar (works without Leaflet too)
  renderFilters();
  wireAddPlace();
  $('#mapFit')?.addEventListener('click', fitAllPins);
  $('#mapDrop')?.addEventListener('click', toggleArm);
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'map') ensureLeaflet(); });
  document.addEventListener('jwh:data-changed', () => { renderSaved(); if (leafletReady) renderPins(); });
}

// ====================================================================== the unified model
// Every map point with a STABLE id, shared by pins + list + sidebar (parity + sync).
function placesModel() {
  const today = todayISO();
  const out = [];
  const seenName = new Set();
  const seenId = new Set();
  const users = loadPlaces();
  users.forEach(p => seenName.add((p.name || '').toLowerCase().trim()));
  // 1) user-saved places (exact or approx) — always included
  users.forEach(p => { out.push({ ...p, kind: 'user', cat: p.category || 'personal' }); seenId.add(p.id); });
  // 2) upcoming dated events
  (DATA.calendar || []).forEach(e => {
    if (!e.area || !e.date || e.date < today || e.category === 'holiday') return;
    const nm = (e.title || '').toLowerCase().trim();
    if (seenName.has(nm)) return; seenName.add(nm);
    const c = centroid(DATA.areaGeo, areaOf(e.area)), j = jitter(e.title);
    out.push({ id: 'evt:' + slug(e.title), kind: 'event', name: e.title, area: e.area, group: areaOf(e.area),
      lat: c.lat + j.dy, lng: c.lng + j.dx, cat: e.category || 'festival', coordKind: 'approx', date: e.date, pulse: isSoon(e.date) });
  });
  // 3) baked catalogue (carry pillar for a stable catId that reconciles with a favourite)
  Object.keys(SRC_CAT).forEach(pillar => (DATA[pillar] || []).forEach(i => {
    if (!i.name) return;
    const id = catId(pillar, i.name);
    const nm = i.name.toLowerCase().trim();
    if (seenId.has(id) || seenName.has(nm)) return; seenId.add(id); seenName.add(nm);
    const area = i.area || i.area_or_park || '';
    const c = centroid(DATA.areaGeo, areaOf(area)), j = jitter(i.name);
    out.push({ id, kind: 'catalogue', pillar, name: i.name, area, group: areaOf(area),
      lat: c.lat + j.dy, lng: c.lng + j.dx, cat: SRC_CAT[pillar], coordKind: 'approx' });
  }));
  (DATA.rooms || []).forEach(r => {
    if (!r.name) return;
    const id = catId('rooms', r.name), nm = r.name.toLowerCase().trim();
    if (seenId.has(id) || seenName.has(nm)) return; seenId.add(id); seenName.add(nm);
    const c = centroid(DATA.areaGeo, areaOf(r.area)), j = jitter(r.name);
    out.push({ id, kind: 'catalogue', pillar: 'rooms', name: r.name, area: r.area, group: areaOf(r.area),
      lat: c.lat + j.dy, lng: c.lng + j.dx, cat: 'personal', coordKind: 'approx' });
  });
  return out;
}

// ====================================================================== Leaflet bootstrap
function loadCSS(href) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
function loadScript(src, ok, err) { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err; document.head.appendChild(s); }
function ensureLeaflet() {
  if (leafletReady || leafletTried) return;
  leafletTried = true;
  const fail = () => { leafletTried = false; const e = $('#mapCanvas'); if (e) e.classList.add('failed'); };  // offline → link index stands; retry next visit
  if (window.L && window.L.markerClusterGroup) { initMap(); return; }
  loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  loadCSS('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
  loadCSS('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');
  loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    () => loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', initMap, fail), fail);
}
function initMap() {
  const el = $('#mapCanvas');
  if (!el || map || !window.L) return;
  map = L.map(el, { scrollWheelZoom: false }).setView([35.69, 139.73], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  pinLayer = window.L.markerClusterGroup
    ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, spiderfyOnMaxZoom: true })
    : L.layerGroup();
  pinTop = L.layerGroup();                          // fav/locked pins never cluster
  map.addLayer(pinLayer); map.addLayer(pinTop);
  // delegated popup buttons for catalogue/event pins (no per-marker listeners)
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'plan') planVisit(b.dataset.id);
    else if (act === 'save') saveCatalogue(b.dataset.id);
  });
  // drop-a-pin: Leaflet's own click (suppressed on markers/popups)
  map.on('click', (e) => { if (armed) dropPin(e.latlng); });
  // Backspace/Delete removes the open (unlocked, user) pin — never while typing
  document.addEventListener('keydown', onKeydown);
  leafletReady = true;
  el.classList.add('ready');
  renderPins();
}
function onKeydown(e) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
  const t = e.target;
  if (t && ((t.matches && t.matches('input,textarea,select,[contenteditable]')) || t.isContentEditable)) return;
  if (!openPlaceId) return;
  const p = placeById(openPlaceId);
  if (!p || p.locked) return;
  e.preventDefault();
  if (confirm(`Delete "${p.name}"?`)) { deletePlace(openPlaceId); map.closePopup(); }
}

// ====================================================================== pins
function divIcon(pt) {
  const cat = (pt.cat || 'personal').toLowerCase();
  const cls = ['jwh-pin'];
  if (pt.pulse) cls.push('pulse');
  if (pt.kind === 'user' && pt.fav) cls.push('fav');
  if (pt.kind === 'user' && pt.locked) cls.push('locked');
  const badge = (pt.kind === 'user' && pt.fav) ? '<b class="jwh-pin-star">★</b>' : (pt.kind === 'user' && pt.locked ? '<b class="jwh-pin-lock">🔒</b>' : '');
  return L.divIcon({ className: cls.join(' '), html: `<i class="jwh-pin-dot cat-${esc(cat)}" data-g="${esc(glyphFor(pt))}"></i>${badge}`, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });
}
function glyphFor(pt) { const b = bucketOf(pt); return ({ event: 'E', music: '♪', food: 'F', geek: 'G', build: 'B', meet: 'M', disney: 'D', stay: 'H', mine: '★' })[b] || '•'; }

function renderPins() {
  if (!pinLayer || !window.L) return;
  pinLayer.clearLayers(); pinTop.clearLayers(); markersById.clear();
  const f = filters();
  const bounds = [];
  let shown = 0, total = 0;
  placesModel().forEach(pt => {
    if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number' || isNaN(pt.lat) || isNaN(pt.lng)) return;
    total++;
    if (f.hidden.includes(bucketOf(pt))) return;
    if (f.area !== 'all' && pt.group !== f.area) return;
    shown++;
    const top = pt.kind === 'user' && (pt.fav || pt.locked);
    const m = L.marker([pt.lat, pt.lng], { icon: divIcon(pt), riseOnHover: true });
    m.bindPopup(popupFor(pt));
    if (pt.kind === 'user') m.on('popupopen', () => { openPlaceId = pt.id; wireUserPopup(pt); }).on('popupclose', () => { if (openPlaceId === pt.id) openPlaceId = null; });
    (top ? pinTop : pinLayer).addLayer(m);
    markersById.set(pt.id, m);
    bounds.push([pt.lat, pt.lng]);
  });
  allBounds = bounds;
  const el = $('#mapCount'); if (el) el.textContent = total ? `showing ${shown} of ${total}` : '';
}

function fitAllPins() {
  if (!map || !allBounds.length) return;
  map.invalidateSize();
  map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 15, animate: !prefersReducedMotion() });
}
// list/sidebar → map: fly to a pin (un-clustering it first if needed) and open its popup
function focusPlace(id) {
  ensureLeaflet();
  const go = () => {
    const m = markersById.get(id);
    if (!m || !map) return;
    const open = () => { map.setView(m.getLatLng(), 15, { animate: !prefersReducedMotion() }); m.openPopup(); announce('Centred map on ' + (placeById(id)?.name || 'pin')); };
    if (pinLayer.zoomToShowLayer && pinLayer.hasLayer(m)) pinLayer.zoomToShowLayer(m, open); else open();
  };
  if (leafletReady) go(); else setTimeout(go, 900);   // allow lazy Leaflet to finish on first map visit
}
function announce(msg) { const el = $('#mapLive'); if (el) el.textContent = msg; }

// ====================================================================== popups
const approxNote = (pt) => pt.coordKind === 'approx' ? `<div class="pin-approx">≈ neighbourhood location</div>` : '';
function popupFor(pt) { return pt.kind === 'user' ? userPopup(pt) : cataloguePopup(pt); }
function cataloguePopup(pt) {
  const saved = !!placeById(pt.id);
  const isFood = pt.cat === 'food';
  return `<div class="pin-pop"><b>${esc(pt.name)}</b>
    ${pt.area ? `<div class="pin-addr">${esc(pt.area)}</div>` : ''}
    ${pt.date ? `<div class="pin-rem">📅 ${esc(pt.date)}</div>` : ''}
    ${approxNote(pt)}
    <div class="pin-acts">
      <a href="${esc(gmaps(pt.name + ' ' + (pt.area || '')))}" target="_blank" rel="noopener">Maps ↗</a>
      ${pt.kind === 'catalogue' ? `<button type="button" data-act="save" data-id="${esc(pt.id)}">${saved ? '★ Saved' : (isFood ? '⭐ Tabetai' : '★ Save')}</button>` : ''}
      <button type="button" data-act="plan" data-id="${esc(pt.id)}">📅 Plan a visit</button>
    </div></div>`;
}
function userPopup(p) {
  const safeLink = (p.link && /^https:\/\//i.test(p.link)) ? p.link : '';
  return `<div class="pin-pop">
    <b>${esc(p.name)}</b>
    ${p.address ? `<div class="pin-addr">${esc(p.address)}</div>` : ''}
    ${p.note ? `<div>${esc(p.note)}</div>` : ''}
    ${p.remindDate ? `<div class="pin-rem">⏰ ${esc(p.remindDate)}</div>` : ''}
    ${approxNote(p)}
    <div class="pin-acts">
      <button type="button" data-uact="fav" aria-pressed="${p.fav ? 'true' : 'false'}">${p.fav ? '★' : '☆'} ${p.fav ? 'Pinned' : 'Pin'}</button>
      <button type="button" data-uact="lock" aria-pressed="${p.locked ? 'true' : 'false'}">${p.locked ? '🔒' : '🔓'}</button>
      <button type="button" data-uact="cal">📅</button>
      <button type="button" data-uact="rem">⏰</button>
      ${p.coordKind === 'approx' ? `<button type="button" data-uact="exact">📍 set exact</button>` : ''}
      ${safeLink ? `<a href="${esc(safeLink)}" target="_blank" rel="noopener">🎟 ticket ↗</a>` : ''}
      <button type="button" data-uact="del" aria-label="Delete place"${p.locked ? ' disabled title="unlock to delete"' : ''}>✕</button>
    </div></div>`;
}
function wireUserPopup(p) {
  const pop = document.querySelector('.leaflet-popup .pin-acts');
  if (!pop) return;
  const on = (sel, fn) => pop.querySelector(`[data-uact="${sel}"]`)?.addEventListener('click', fn);
  on('fav', () => { patchPlace(p.id, { fav: !p.fav }); map.closePopup(); change(); });
  on('lock', () => { patchPlace(p.id, { locked: !p.locked }); map.closePopup(); change(); });
  on('cal', () => addToCalendar(p));
  on('rem', () => setReminder(p));
  on('exact', () => setExact(p));
  on('del', () => { if (deletePlace(p.id)) map.closePopup(); });
}

// ====================================================================== actions
function pushEvent(title, date, note) {
  const id = 'u' + Date.now();
  const u = get(KEYS.events, []) || [];
  u.push({ id, title, date, endDate: '', category: 'personal', note: note || '' });
  set(KEYS.events, u);
  return id;
}
function change() { document.dispatchEvent(new CustomEvent('jwh:data-changed')); }

function saveCatalogue(id) {
  const pt = placesModel().find(x => x.id === id);
  if (!pt) return;
  if (placeById(id)) { patchPlace(id, { fav: true }); }   // already saved → ensure pinned
  else upsertPlace({ id, name: pt.name, address: pt.area || '', lat: pt.lat, lng: pt.lng, category: pt.cat,
    source: pt.pillar === 'restaurants' ? 'tabetai' : 'catalogue', fav: true, coordKind: 'approx', visited: false });
  if (map) map.closePopup();
  change();
}
function planVisit(id) {
  const pt = placesModel().find(x => x.id === id);
  if (!pt) return;
  const existing = placeById(id) || placeByName(pt.name);
  const date = prompt(`Plan a visit to "${pt.name}" on (YYYY-MM-DD):`, (DATA.meta?.arrival_date || '2026-06-30'));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return;
  const d = date.trim();
  const eid = pushEvent('Visit: ' + pt.name, d, pt.area || '');
  if (existing) patchPlace(existing.id, { date: d, remindDate: d, eventId: eid });
  else upsertPlace({ id, name: pt.name, address: pt.area || '', lat: pt.lat, lng: pt.lng, category: pt.cat,
    source: pt.pillar === 'restaurants' ? 'tabetai' : 'catalogue', coordKind: 'approx', date: d, remindDate: d, eventId: eid });
  if (map) map.closePopup();
  change();
}
function dropPin(latlng) {
  const name = prompt('Name this pin:', '');
  if (!name || !name.trim()) return;
  toggleArm(false);
  upsertPlace({ id: 'p' + Date.now(), name: name.trim(), address: '', lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6),
    category: 'personal', source: 'drop', coordKind: 'exact' });
  change();
  setTimeout(() => focusPlace(placeByName(name.trim())?.id), 50);
}
function addToCalendar(p) {
  const date = prompt(`Add "${p.name}" to the calendar on (YYYY-MM-DD):`, (DATA.meta?.arrival_date || '2026-06-30'));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return;
  if (p.eventId) removeEvent(p.eventId);
  const eid = pushEvent('Visit: ' + p.name, date.trim(), p.address);
  patchPlace(p.id, { date: date.trim(), eventId: eid });
  if (map) map.closePopup(); change();
}
function setReminder(p) {
  const date = prompt(`Remind me about "${p.name}" on (YYYY-MM-DD) — shows in notifications:`, p.remindDate || '');
  if (date === null) return;
  const d = date.trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) { alert('Use YYYY-MM-DD.'); return; }
  if (p.eventId) removeEvent(p.eventId);
  const eid = d ? pushEvent('⏰ ' + p.name, d, p.address) : '';
  patchPlace(p.id, { remindDate: d, eventId: eid });
  if (map) map.closePopup(); change();
}
function setExact(p) {
  const q = prompt(`Search an address for "${p.name}" (or paste "lat, lng"):`, p.address || '');
  if (!q) return;
  const m = q.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (m) { patchPlace(p.id, { lat: +m[1], lng: +m[2], coordKind: 'exact' }); if (map) map.closePopup(); change(); return; }
  // else geocode via Nominatim (one-shot)
  fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } })
    .then(r => r.ok ? r.json() : []).then(d => {
      if (!d.length) { alert('No match — try a different address or "lat, lng".'); return; }
      patchPlace(p.id, { lat: +d[0].lat, lng: +d[0].lon, address: d[0].display_name, coordKind: 'exact' });
      if (map) map.closePopup(); change();
    }).catch(() => alert('Geocoding unavailable.'));
}
function removeEvent(id) { set(KEYS.events, (get(KEYS.events, []) || []).filter(x => x.id !== id)); }

function toggleArm(force) {
  armed = (force === true || force === false) ? force : !armed;
  const btn = $('#mapDrop'), el = $('#mapCanvas');
  if (btn) { btn.classList.toggle('armed', armed); btn.setAttribute('aria-pressed', armed ? 'true' : 'false'); btn.textContent = armed ? '✕ Cancel drop' : '＋ Drop a pin'; }
  if (el) el.classList.toggle('arming', armed);
}

// ====================================================================== filters UI
function renderFilters() {
  const wrap = $('#mapFilters'); if (!wrap) return;
  const f = filters();
  const areaOpts = ['<option value="all">All neighbourhoods</option>']
    .concat(AREA_ORDER.map(a => `<option value="${esc(a)}"${f.area === a ? ' selected' : ''}>${esc(a)}</option>`)).join('');
  wrap.innerHTML = `
    <div class="map-chiprow" role="group" aria-label="Filter pins by category">
      ${FILTER_CATS.map(c => `<button type="button" class="map-chip cat-${esc(c.key)}" data-cat="${esc(c.key)}" aria-pressed="${f.hidden.includes(c.key) ? 'false' : 'true'}"><span class="map-chip-dot"></span>${esc(c.label)}</button>`).join('')}
    </div>
    <label class="map-arealbl">Area <select id="mapArea">${areaOpts}</select></label>`;
  wrap.querySelector('.map-chiprow').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    const f2 = filters(); const k = b.dataset.cat;
    f2.hidden = f2.hidden.includes(k) ? f2.hidden.filter(x => x !== k) : [...f2.hidden, k];
    setFilters(f2); b.setAttribute('aria-pressed', f2.hidden.includes(k) ? 'false' : 'true');
    if (leafletReady) renderPins();
  });
  wrap.querySelector('#mapArea').addEventListener('change', (e) => {
    const f2 = filters(); f2.area = e.target.value; setFilters(f2); if (leafletReady) renderPins();
  });
}

// ====================================================================== your-pins sidebar
function renderSaved() {
  const wrap = $('#mapSaved'); if (!wrap) return;
  const places = loadPlaces();
  if (!places.length) { wrap.innerHTML = `<h3 class="map-side-h">Your pins</h3><p class="map-empty">No saved pins yet — search a place above, ⭐ a restaurant, or “Drop a pin”.</p>`; return; }
  const row = (p) => {
    const icon = CAT_GLYPH[p.source === 'tabetai' ? 'food' : (p.fav ? 'mine' : (p.category || 'personal'))] || '📍';
    const links = [
      (p.date || p.eventId) ? `<a href="#/calendar" class="map-ic" title="On your calendar" aria-label="Open calendar">📅</a>` : '',
      (p.link && /^https:\/\//i.test(p.link)) ? `<a href="${esc(p.link)}" target="_blank" rel="noopener" class="map-ic" title="Ticket / booking" aria-label="Open ticket link">🎟️</a>` : '',
      `<a href="#/checklist" class="map-ic" title="Your checklist" aria-label="Open checklist">✓</a>`,
    ].join('');
    return `<li class="map-srow${p.fav ? ' is-fav' : ''}" data-pid="${esc(p.id)}">
      <button type="button" class="map-sgo" data-pid="${esc(p.id)}" title="Show on map">
        <span class="map-sicon" aria-hidden="true">${icon}</span>
        <span class="map-sname">${esc(p.name)}${p.coordKind === 'approx' ? ' <span class="map-approx">≈</span>' : ''}</span>
      </button>
      <span class="map-slinks">${links}
        <button type="button" class="map-ic" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}"${p.locked ? ' disabled title="locked"' : ''}>✕</button>
      </span></li>`;
  };
  wrap.innerHTML = `<h3 class="map-side-h">Your pins <span class="map-count">${places.length}</span></h3>
    <ul class="map-slist dense-list">${places.map(row).join('')}</ul>`;
  wrap.querySelectorAll('.map-sgo').forEach(b => b.addEventListener('click', () => focusPlace(b.dataset.pid)));
  wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { if (confirm('Delete this pin?')) deletePlace(b.dataset.del); }));
}

// ====================================================================== offline link index
function renderIndex() {
  const wrap = $('#mapList'); if (!wrap) return;
  const places = [];
  const add = (arr) => (arr || []).forEach(i => { const area = i.area || i.area_or_park || ''; if (i.name) places.push({ name: i.name, area, group: areaOf(area) }); });
  ['music', 'geek', 'building', 'restaurants', 'livemusic', 'activities', 'disney', 'meetups'].forEach(k => add(DATA[k]));
  (DATA.rooms || []).forEach(r => places.push({ name: r.name, area: r.area, group: areaOf(r.area) }));
  (DATA.calendar || []).forEach(e => { if (e.area && e.category !== 'holiday') places.push({ name: e.title, area: e.area, group: areaOf(e.area) }); });
  const groups = {};
  places.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
  wrap.innerHTML = `<h3 class="map-side-h">All places by area</h3>` + AREA_ORDER.filter(k => groups[k]).map(k => `
    <details class="map-group" open>
      <summary class="map-area"><a href="${esc(gmaps(k))}" target="_blank" rel="noopener">📍 ${esc(k)}</a> <span class="map-count">${dedupe(groups[k]).length}</span></summary>
      <ul class="map-places dense-list">${dedupe(groups[k]).map(p => `<li><a href="${esc(gmaps(p.name + ' ' + (p.area || '')))}" target="_blank" rel="noopener">${esc(p.name)}</a></li>`).join('')}</ul>
    </details>`).join('');
}

// ====================================================================== add-place (Nominatim)
function wireAddPlace() {
  const input = $('#placeSearch'), sug = $('#placeSug');
  if (!input || !sug) return;
  let timer, controller, lastReq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { sug.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const now = Date.now();
      if (now - lastReq < 1100) return;
      lastReq = now;
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=5&q=${encodeURIComponent(q)}`, { signal: controller.signal, headers: { 'Accept-Language': 'en' } });
        if (!r.ok) { sug.innerHTML = '<li class="sug-msg">Search unavailable — try again</li>'; return; }
        const data = await r.json();
        sug.innerHTML = data.length ? data.map(d =>
          `<li><button type="button" data-lat="${esc(String(d.lat))}" data-lng="${esc(String(d.lon))}" data-name="${esc(d.display_name.split(',')[0])}" data-addr="${esc(d.display_name)}">${esc(d.display_name)}</button></li>`).join('')
          : '<li class="sug-msg">No matches</li>';
      } catch (e) { if (e.name !== 'AbortError') sug.innerHTML = '<li class="sug-msg">Search unavailable (offline?)</li>'; }
    }, 450);
  });
  sug.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lat]'); if (!b) return;
    const dateEl = $('#placeDate');
    const date = (dateEl?.value || '').trim();
    const id = 'p' + Date.now();
    const rec = { id, name: b.dataset.name, address: b.dataset.addr, lat: +b.dataset.lat, lng: +b.dataset.lng, category: 'personal', source: 'searched', coordKind: 'exact' };
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { rec.date = date; rec.remindDate = date; rec.eventId = pushEvent('Visit: ' + rec.name, date, rec.address); }
    upsertPlace(rec);
    input.value = ''; sug.innerHTML = ''; if (dateEl) dateEl.value = '';
    ensureLeaflet();
    focusPlace(id);
  });
}
