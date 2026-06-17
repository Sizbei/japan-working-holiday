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
import { areaOf, AREA_ORDER, centroid, jitter } from './lib/geo.js';
import {
  loadPlaces, placeById, placeByName, upsertPlace, patchPlace, deletePlace, toggleFav, catId, slug,
} from './lib/places.js';
import { prefersReducedMotion } from './motion.js';
import { askText, askDate, confirmModal, alertModal } from './lib/modal.js';
import { nowISO } from './lib/dates.js';

let DATA = null, map = null, pinLayer = null, pinTop = null, routeLayer = null, leafletReady = false, leafletTried = false;
let armed = false, openPlaceId = null, allBounds = [], mapActive = false, pinsDirty = false;
const markersById = new Map();

function gmaps(query) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' Tokyo'); }
function dedupe(arr) { const seen = new Set(); return arr.filter(p => { const k = (p.name || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }
function isSoon(d) { if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const diff = (Date.parse(d) - Date.now()) / 86400000; return diff >= -1 && diff <= 45; }
const todayISO = () => nowISO();   // local date, consistent with the rest of the app (not UTC)

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
  document.addEventListener('jwh:route', (e) => {
    mapActive = e.detail?.route === 'map';
    if (!mapActive) return;
    ensureLeaflet();
    renderSaved();
    if (leafletReady) onMapShown();   // re-measure + catch up once the SPA actually reveals the container
  });
  // off the map route, just mark pins dirty — defer the expensive 200+-marker rebuild until the map is next shown
  document.addEventListener('jwh:data-changed', () => {
    if (mapActive) { renderSaved(); if (leafletReady) renderPins(); }
    else { pinsDirty = true; }
  });
}

// ====================================================================== the unified model
// Every map point with a STABLE id, shared by pins + list + sidebar (parity + sync).
// Exported so the Plan-a-Day add-stop picker reuses the same unified point list.
export function placesModel() {
  const today = todayISO();
  const out = [];
  const seenName = new Set();
  const seenId = new Set();
  const users = loadPlaces();
  users.forEach(p => seenName.add((p.name || '').toLowerCase().trim()));
  // 1) user-saved places (exact or approx) — always included. Derive `group` so the
  // neighbourhood filter doesn't hide every personal pin (areaOf → 'Around Tokyo' fallback).
  users.forEach(p => { out.push({ ...p, kind: 'user', cat: p.category || 'personal', group: areaOf(p.address || p.area || '') }); seenId.add(p.id); });
  // 2) upcoming dated events
  (DATA.calendar || []).forEach(e => {
    if (!e.area || !e.date || e.date < today || e.category === 'holiday') return;
    const nm = (e.title || '').toLowerCase().trim();
    if (seenName.has(nm)) return; seenName.add(nm);
    const c = centroid(DATA.areaGeo, areaOf(e.area)), j = jitter(e.title);
    out.push({ id: 'evt:' + slug(e.title), kind: 'event', name: e.title, area: e.area, group: areaOf(e.area),
      lat: c.lat + j.dy, lng: c.lng + j.dx, cat: e.category || 'festival', coordKind: 'approx', date: e.date, pulse: isSoon(e.date) });
  });
  // 2b) user-CREATED calendar events → map + plan picker parity. Skip the auto-spawned
  // Visit:/⏰/plan: events that merely mirror a place (the place is already pinned).
  (get(KEYS.events, []) || []).forEach(e => {
    if (!e.date || e.date < today) return;
    if (/^(Visit: |⏰ )/.test(e.title || '') || String(e.id).startsWith('plan:')) return;
    const nm = (e.title || '').toLowerCase().trim();
    if (!nm || seenName.has(nm)) return; seenName.add(nm);
    const area = e.area || e.note || '';
    const c = centroid(DATA.areaGeo, areaOf(area)), j = jitter(e.title);
    out.push({ id: 'uevt:' + e.id, kind: 'event', name: e.title, area, group: areaOf(area),
      lat: c.lat + j.dy, lng: c.lng + j.dx, cat: e.category || 'personal', coordKind: 'approx', date: e.date, pulse: isSoon(e.date) });
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
// Pinned Subresource-Integrity hashes (sha384, computed from the immutable @version files).
// A tampered/hijacked unpkg asset fails the integrity check → onerror → the offline link
// index stands alone. crossOrigin='anonymous' is required for SRI to be enforced.
const SRI = {
  leafletCss: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
  leafletJs: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  mcCss: 'sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV',
  mcDefCss: 'sha384-wgw+aLYNQ7dlhK47ZPK7FRACiq7ROZwgFNg0m04avm4CaXS+Z9Y7nMu8yNjBKYC+',
  mcJs: 'sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr',
};
function loadCSS(href, integrity) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; if (integrity) { l.integrity = integrity; l.crossOrigin = 'anonymous'; } document.head.appendChild(l); }
function loadScript(src, ok, err, integrity) { const s = document.createElement('script'); s.src = src; if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; } s.onload = ok; s.onerror = err; document.head.appendChild(s); }
function ensureLeaflet() {
  if (leafletReady || leafletTried) return;
  leafletTried = true;
  const fail = () => { leafletTried = false; const e = $('#mapCanvas'); if (e) e.classList.add('failed'); };  // offline / integrity-fail → link index stands; retry next visit
  if (window.L && window.L.markerClusterGroup) { initMap(); return; }
  loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', SRI.leafletCss);
  loadCSS('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', SRI.mcCss);
  loadCSS('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css', SRI.mcDefCss);
  loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    () => loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', initMap, fail, SRI.mcJs), fail, SRI.leafletJs);
}
// The hash router fires jwh:route BEFORE the view is laid out (display:none→block), so a
// Leaflet map measured then reads 0×0 and markercluster renders nothing. Poll until the
// canvas is actually visible, then invalidateSize() (+ renderPins once if off-route edits queued).
function onMapShown(tries = 0) {
  if (!mapActive || !leafletReady) return;
  const el = $('#mapCanvas');
  if (el && el.offsetParent !== null && el.offsetWidth > 0) {
    map.invalidateSize();
    if (pinsDirty) { pinsDirty = false; renderPins(); }
  } else if (tries < 25) {
    setTimeout(() => onMapShown(tries + 1), 40);
  }
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
async function onKeydown(e) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
  const t = e.target;
  if (t && ((t.matches && t.matches('input,textarea,select,[contenteditable]')) || t.isContentEditable)) return;
  if (!openPlaceId) return;
  const id = openPlaceId, p = placeById(id);
  if (!p || p.locked) return;
  e.preventDefault();
  if (await confirmModal(`Delete “${p.name}”?`, { ok: 'Delete', danger: true })) { deletePlace(id); map.closePopup(); }
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

// ---- day-plan route line (numbered stops + polyline), called from plan.js ----
export function drawRoute(stops) {
  ensureLeaflet();
  const go = () => {
    if (!map || !window.L) return;
    if (!routeLayer) routeLayer = L.layerGroup().addTo(map);
    routeLayer.clearLayers();
    const pts = (stops || []).filter(s => typeof s.lat === 'number' && typeof s.lng === 'number' && !isNaN(s.lat) && !isNaN(s.lng));
    pts.forEach((s, i) => {
      const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'jwh-route-pin' + (s.coordKind === 'approx' ? ' approx' : ''), html: `<b>${esc(String(i + 1))}</b>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] }), zIndexOffset: 1000 });
      m.bindPopup(`<div class="pin-pop"><b>${esc(String(i + 1))}. ${esc(s.name)}</b></div>`);
      routeLayer.addLayer(m);
    });
    if (pts.length > 1) {
      const line = L.polyline(pts.map(s => [s.lat, s.lng]), { color: '#5a3fb5', weight: 3, opacity: .85, dashArray: pts.some(s => s.coordKind === 'approx') ? '6 7' : null });
      routeLayer.addLayer(line);
      map.fitBounds(line.getBounds(), { padding: [50, 50], maxZoom: 15, animate: !prefersReducedMotion() });
    } else if (pts.length === 1) { map.setView([pts[0].lat, pts[0].lng], 14, { animate: !prefersReducedMotion() }); }
  };
  if (leafletReady) go(); else setTimeout(go, 900);
}
export function clearRoute() { if (routeLayer) routeLayer.clearLayers(); }

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
      <a href="${esc(gmaps(pt.name + ' ' + (pt.area || '')))}" target="_blank" rel="noopener noreferrer">Maps ↗</a>
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
      ${safeLink ? `<a href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">🎟 ticket ↗</a>` : ''}
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
  on('del', async () => { if (await confirmModal(`Delete “${p.name}”?`, { ok: 'Delete', danger: true }) && deletePlace(p.id) && map) map.closePopup(); });
}

// ====================================================================== actions
function pushEvent(title, date, note) {
  const id = 'u' + Date.now();
  set(KEYS.events, [...(get(KEYS.events, []) || []), { id, title, date, endDate: '', category: 'personal', note: note || '' }]);
  return id;
}
function change() { document.dispatchEvent(new CustomEvent('jwh:data-changed')); }

// NOTE: upsertPlace/deletePlace dispatch jwh:data-changed themselves; patchPlace is a SILENT
// writer, so only the patchPlace branches call change() — never double-dispatch (CLAUDE.md).
function saveCatalogue(id) {
  const pt = placesModel().find(x => x.id === id);
  if (!pt) return;
  if (placeById(id)) { patchPlace(id, { fav: true }); change(); }   // already saved → ensure pinned
  else upsertPlace({ id, name: pt.name, address: pt.area || '', lat: pt.lat, lng: pt.lng, category: pt.cat,
    source: pt.pillar === 'restaurants' ? 'tabetai' : 'catalogue', fav: true, coordKind: 'approx', visited: false });
  if (map) map.closePopup();
}
async function planVisit(id) {
  const pt = placesModel().find(x => x.id === id);
  if (!pt) return;
  const existing = placeById(id) || placeByName(pt.name);
  const date = await askDate(`Plan a visit to “${pt.name}” on:`, { value: existing?.date || (DATA.meta?.arrival_date || '2026-06-30') });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return;
  const d = date.trim();
  if (existing?.eventId) removeEvent(existing.eventId);   // clear the old event so we don't orphan it
  const eid = pushEvent('Visit: ' + pt.name, d, pt.area || '');
  if (existing) { patchPlace(existing.id, { date: d, remindDate: d, eventId: eid }); change(); }
  else upsertPlace({ id, name: pt.name, address: pt.area || '', lat: pt.lat, lng: pt.lng, category: pt.cat,
    source: pt.pillar === 'restaurants' ? 'tabetai' : 'catalogue', coordKind: 'approx', date: d, remindDate: d, eventId: eid });
  if (map) map.closePopup();
}
async function dropPin(latlng) {
  const name = await askText('Name this pin:', { ok: 'Drop pin' });
  if (!name) { toggleArm(false); return; }
  toggleArm(false);
  upsertPlace({ id: 'p' + Date.now(), name, address: '', lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6),
    category: 'personal', source: 'drop', coordKind: 'exact' });   // dispatches → renders synchronously
  setTimeout(() => focusPlace(placeByName(name)?.id), 50);
}
async function addToCalendar(p) {
  const date = await askDate(`Add “${p.name}” to the calendar on:`, { value: p.date || (DATA.meta?.arrival_date || '2026-06-30') });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return;
  if (p.eventId) removeEvent(p.eventId);
  const eid = pushEvent('Visit: ' + p.name, date.trim(), p.address);
  patchPlace(p.id, { date: date.trim(), eventId: eid, remindDate: '' });   // one event slot per place — clear the stale reminder
  if (map) map.closePopup(); change();
}
async function setReminder(p) {
  const date = await askText(`Remind me about “${p.name}” on (blank to clear) — shows in notifications:`, { type: 'date', value: p.remindDate || '', ok: 'Set', min: '2026-01-01', max: '2027-12-31' });
  if (date === null) return;
  const d = date.trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) { alertModal('Use a valid date (YYYY-MM-DD).'); return; }
  if (!d) {                                  // clearing a reminder — the shared event slot may hold a VISIT; never destroy that
    if (!p.remindDate) { if (map) map.closePopup(); return; }   // nothing to clear; leave a planned visit intact
    if (p.eventId) removeEvent(p.eventId);
    patchPlace(p.id, { remindDate: '', eventId: '' });
    if (map) map.closePopup(); change(); return;
  }
  if (p.eventId) removeEvent(p.eventId);      // setting a reminder replaces whatever the slot held (visit or prior reminder)
  const eid = pushEvent('⏰ ' + p.name, d, p.address);
  patchPlace(p.id, { remindDate: d, eventId: eid, date: '' });
  if (map) map.closePopup(); change();
}
async function setExact(p) {
  const q = await askText(`Address for “${p.name}” (or paste "lat, lng"):`, { value: p.address || '', ok: 'Find' });
  if (!q) return;
  const m = q.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (m) {
    const lat = +m[1], lng = +m[2];
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { alertModal('Those coordinates are out of range.'); return; }
    patchPlace(p.id, { lat, lng, coordKind: 'exact' }); if (map) map.closePopup(); change(); return;
  }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } });
    const d = r.ok ? await r.json() : [];
    if (!d.length) { alertModal('No match — try a different address or "lat, lng".'); return; }
    patchPlace(p.id, { lat: +d[0].lat, lng: +d[0].lon, address: d[0].display_name, coordKind: 'exact' });
    if (map) map.closePopup(); change();
  } catch { alertModal('Geocoding unavailable.'); }
}
// SILENT writers — pushEvent/removeEvent do NOT dispatch; every caller follows with change()
// or upsertPlace() (which dispatches), so exactly one jwh:data-changed fires per action.
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
      (p.link && /^https:\/\//i.test(p.link)) ? `<a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer" class="map-ic" title="Ticket / booking" aria-label="Open ticket link">🎟️</a>` : '',
      `<a href="#/checklist" class="map-ic" title="Your checklist" aria-label="Open checklist">✓</a>`,
    ].join('');
    return `<li class="map-srow${p.fav ? ' is-fav' : ''}" data-pid="${esc(p.id)}">
      <button type="button" class="map-sgo" data-pid="${esc(p.id)}" aria-label="Show ${esc(p.name)} on map" title="Show on map">
        <span class="map-sicon" aria-hidden="true">${icon}</span>
        <span class="map-sname">${esc(p.name)}${p.coordKind === 'approx' ? ' <span class="map-approx" aria-hidden="true">≈</span>' : ''}</span>
      </button>
      <span class="map-slinks">${links}
        <button type="button" class="map-ic" data-fav="${esc(p.id)}" aria-pressed="${p.fav ? 'true' : 'false'}" aria-label="${p.fav ? 'Unpin' : 'Pin'} ${esc(p.name)}" title="${p.fav ? 'Pinned — always visible' : 'Pin — always visible'}">${p.fav ? '★' : '☆'}</button>
        <button type="button" class="map-ic" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}"${p.locked ? ' disabled title="locked"' : ''}>✕</button>
      </span></li>`;
  };
  wrap.innerHTML = `<h3 class="map-side-h">Your pins <span class="map-count">${places.length}</span></h3>
    <ul class="map-slist dense-list">${places.map(row).join('')}</ul>`;
  wrap.querySelectorAll('.map-sgo').forEach(b => b.addEventListener('click', () => focusPlace(b.dataset.pid)));
  wrap.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => toggleFav(b.dataset.fav)));
  wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { if (await confirmModal('Delete this pin?', { ok: 'Delete', danger: true }) && !deletePlace(b.dataset.del)) alertModal('This pin is locked — unlock it first.'); }));
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
      <summary class="map-area"><a href="${esc(gmaps(k))}" target="_blank" rel="noopener noreferrer">📍 ${esc(k)}</a> <span class="map-count">${dedupe(groups[k]).length}</span></summary>
      <ul class="map-places dense-list">${dedupe(groups[k]).map(p => `<li><a href="${esc(gmaps(p.name + ' ' + (p.area || '')))}" target="_blank" rel="noopener noreferrer">${esc(p.name)}</a></li>`).join('')}</ul>
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
