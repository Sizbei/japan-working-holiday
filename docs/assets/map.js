'use strict';
// Map page (#/map). PROGRESSIVE ENHANCEMENT over an always-rendered, offline-safe
// link index:
//   • The grouped Google-Maps link index (#mapList) ALWAYS renders — it's the only
//     part that works offline (Narita / ward office), so it must never regress.
//   • Leaflet (unpkg CDN) + OSM tiles + Nominatim are ALL cross-origin / network-only
//     (the SW deliberately doesn't cache them). They layer ADDITIVELY into #mapCanvas;
//     if they fail (offline / blocked), the link index stands alone.
// ADR: this is the one place the "no CDN but Google Fonts" rule is bent — a pinned map
// needs a tile lib. Contained by: lazy-load only on #/map, never precache, link index
// is the fallback. Reminders/places route through calendar events (one source of truth).

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { prefersReducedMotion } from './motion.js';

let DATA = null, map = null, pinLayer = null, leafletReady = false, leafletTried = false;

const AREAS = ['Shibuya', 'Shinjuku', 'Akihabara', 'Nakano', 'Koenji', 'Shimokitazawa', 'Shimokita',
  'Ebisu', 'Ikebukuro', 'Harajuku', 'Aoyama', 'Omotesando', 'Daikanyama', 'Nakameguro', 'Asakusa',
  'Ochanomizu', 'Toyosu', 'Roppongi', 'Ginza', 'Setagaya', 'Sangenjaya', 'Kichijoji', 'Ueno'];
function areaOf(s) { const l = (s || '').toLowerCase(); for (const a of AREAS) if (l.includes(a.toLowerCase())) return a === 'Shimokita' ? 'Shimokitazawa' : a; return 'Around Tokyo'; }
function gmaps(query) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' Tokyo'); }
function dedupe(arr) { const seen = new Set(); return arr.filter(p => { const k = p.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }

const loadPlaces = () => get(KEYS.places, []) || [];
const savePlaces = (a) => set(KEYS.places, a);

export function mountMap(data) {
  DATA = data;
  renderIndex();                                  // offline-safe link index — ALWAYS
  wireAddPlace();
  $('#mapFit')?.addEventListener('click', fitAllPins);
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'map') ensureLeaflet(); });
  document.addEventListener('jwh:data-changed', () => { if (leafletReady) renderPins(); });
}

// ---- the always-on grouped link index (offline fallback) ----
function renderIndex() {
  const wrap = $('#mapList');
  if (!wrap) return;
  const places = [];
  const add = (arr) => (arr || []).forEach(i => { const area = i.area || i.area_or_park || ''; if (i.name) places.push({ name: i.name, area, group: areaOf(area) }); });
  ['music', 'geek', 'building', 'restaurants', 'livemusic', 'activities', 'disney', 'meetups'].forEach(k => add(DATA[k]));
  (DATA.rooms || []).forEach(r => places.push({ name: r.name, area: r.area, group: areaOf(r.area) }));
  (DATA.calendar || []).forEach(e => { if (e.area && e.category !== 'holiday') places.push({ name: e.title, area: e.area, group: areaOf(e.area) }); });
  const groups = {};
  places.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
  const order = [...new Set(AREAS.map(a => a === 'Shimokita' ? 'Shimokitazawa' : a)), 'Around Tokyo'];
  wrap.innerHTML = order.filter(k => groups[k]).map(k => `
    <div class="map-group">
      <h3 class="map-area"><a href="${esc(gmaps(k))}" target="_blank" rel="noopener">📍 ${esc(k)}</a> <span class="map-count">${dedupe(groups[k]).length}</span></h3>
      <ul class="map-places">${dedupe(groups[k]).map(p => `<li><a href="${esc(gmaps(p.name + ' ' + (p.area || '')))}" target="_blank" rel="noopener">${esc(p.name)}</a></li>`).join('')}</ul>
    </div>`).join('');
}

// ---- lazy Leaflet + markercluster bootstrap (only on #/map, network-only, init once) ----
function loadCSS(href) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
function loadScript(src, ok, err) { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err; document.head.appendChild(s); }
function ensureLeaflet() {
  if (leafletReady || leafletTried) return;
  leafletTried = true;
  const fail = () => { const e = $('#mapCanvas'); if (e) e.classList.add('failed'); };  // offline → link index stands alone
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
  map.addLayer(pinLayer);
  el.addEventListener('click', (e) => {   // delegated: "plan a visit" on a catalogue pin → saves it + a calendar event
    const b = e.target.closest('[data-act="plan"]');
    if (b) planVisit({ name: b.dataset.name, area: b.dataset.area, lat: +b.dataset.lat, lng: +b.dataset.lng });
  });
  leafletReady = true;
  el.classList.add('ready');
  renderPins();
}
function flyTo(p) {
  if (!map || typeof p.lat !== 'number' || typeof p.lng !== 'number' || isNaN(p.lat) || isNaN(p.lng)) return;
  map.invalidateSize();   // ensure the container has a valid size before panning
  map.setView([p.lat, p.lng], 15, { animate: !prefersReducedMotion() });   // setView pan is stable (avoids the flyTo NaN bug)
}

// ---- pins: upcoming events + baked catalogue (area centroid + jitter) + user-saved (real coords) ----
function isSoon(d) { if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const diff = (Date.parse(d) - Date.now()) / 86400000; return diff >= -1 && diff <= 45; }
// deterministic per-name jitter so places sharing one neighbourhood centroid don't stack exactly
function jitter(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return { dy: ((h % 1000) / 1000 - 0.5) * 0.011, dx: (((h >>> 10) % 1000) / 1000 - 0.5) * 0.011 }; }
function centroid(group) { const g = DATA.areaGeo || {}; return g[group] || g['Around Tokyo'] || { lat: 35.68, lng: 139.74 }; }
function icon(cat, pulse) {
  return L.divIcon({ className: 'jwh-pin' + (pulse ? ' pulse' : ''), html: `<i class="jwh-pin-dot cat-${(cat || 'personal').toLowerCase()}"></i>`, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });
}
function pinIcon(p) { return icon(p.category, isSoon(p.remindDate || p.date)); }

const SRC_CAT = { music: 'music', livemusic: 'music', geek: 'geek', building: 'build', restaurants: 'food', activities: 'seasonal', disney: 'disney', meetups: 'meet' };
function bakedList() {
  const out = [];
  Object.keys(SRC_CAT).forEach(k => (DATA[k] || []).forEach(i => { const area = i.area || i.area_or_park || ''; if (i.name) out.push({ name: i.name, area, group: areaOf(area), cat: SRC_CAT[k] }); }));
  (DATA.rooms || []).forEach(r => { if (r.name) out.push({ name: r.name, area: r.area, group: areaOf(r.area), cat: 'personal' }); });
  return dedupe(out);
}

let allBounds = [];
function renderPins() {
  if (!pinLayer || !window.L) return;
  pinLayer.clearLayers();
  const today = new Date().toISOString().slice(0, 10);
  const key = (s) => (s || '').toLowerCase().trim();
  const seen = new Set(loadPlaces().map(p => key(p.name)));   // user-saved names win — no catalogue dupe
  const bounds = [];
  const addPt = (lat, lng, cat, pulse, popup) => { if (isNaN(lat) || isNaN(lng)) return; const m = L.marker([lat, lng], { icon: icon(cat, pulse), riseOnHover: true }); m.bindPopup(popup); pinLayer.addLayer(m); bounds.push([lat, lng]); };

  // 1) coming-up events (pulse) at their neighbourhood
  (DATA.calendar || []).forEach(e => {
    if (!e.area || !e.date || e.date < today || e.category === 'holiday' || seen.has(key(e.title))) return;
    seen.add(key(e.title));
    const c = centroid(areaOf(e.area)), j = jitter(e.title);
    addPt(c.lat + j.dy, c.lng + j.dx, e.category || 'festival', isSoon(e.date), eventPopupHTML(e.title, e.date, e.area));
  });
  // 2) baked catalogue places
  bakedList().forEach(p => {
    if (seen.has(key(p.name))) return; seen.add(key(p.name));
    const c = centroid(p.group), j = jitter(p.name);
    addPt(c.lat + j.dy, c.lng + j.dx, p.cat, false, bakedPopupHTML(p, c.lat + j.dy, c.lng + j.dx));
  });
  // 3) user-saved places (real coords, full actions)
  loadPlaces().forEach(p => {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || isNaN(p.lat) || isNaN(p.lng)) return;
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true });
    m.bindPopup(popupHTML(p));
    m.on('popupopen', () => wirePopup(p));
    pinLayer.addLayer(m); bounds.push([p.lat, p.lng]);
  });

  allBounds = bounds;
  const el = $('#mapCount'); if (el) el.textContent = bounds.length ? `${bounds.length} pins` : '';
}
function eventPopupHTML(title, date, area) {
  return `<div class="pin-pop"><b>${esc(title)}</b>
    <div class="pin-rem">📅 ${esc(date)}</div>
    ${area ? `<div class="pin-addr">${esc(area)}</div>` : ''}
    <div class="pin-acts"><a href="${esc(gmaps(area || title))}" target="_blank" rel="noopener">Maps ↗</a></div></div>`;
}
function bakedPopupHTML(p, lat, lng) {
  return `<div class="pin-pop"><b>${esc(p.name)}</b>
    ${p.area ? `<div class="pin-addr">${esc(p.area)}</div>` : ''}
    <div class="pin-acts">
      <a href="${esc(gmaps(p.name + ' ' + (p.area || '')))}" target="_blank" rel="noopener">Maps ↗</a>
      <button type="button" data-act="plan" data-name="${esc(p.name)}" data-area="${esc(p.area || '')}" data-lat="${lat}" data-lng="${lng}">📅 Plan a visit</button>
    </div></div>`;
}
function planVisit(p) {
  const date = prompt(`Plan a visit to "${p.name}" on (YYYY-MM-DD):`, (DATA.meta?.arrival_date || '2026-06-30'));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return;
  const place = { id: 'p' + Date.now(), name: p.name, address: p.area || '', lat: p.lat, lng: p.lng, category: 'personal', note: '', link: '', date: date.trim(), remindDate: date.trim(), eventId: '' };
  place.eventId = pushEvent('Visit: ' + p.name, date.trim(), p.area || '');
  savePlaces([...loadPlaces(), place]);
  if (map) map.closePopup();
  renderPins();
}
function fitAllPins() {
  if (!map || !allBounds.length) return;
  map.invalidateSize();
  map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 15, animate: !prefersReducedMotion() });
}
function popupHTML(p) {
  const safeLink = (p.link && /^https:\/\//i.test(p.link)) ? p.link : '';
  return `<div class="pin-pop">
    <b>${esc(p.name)}</b>
    ${p.address ? `<div class="pin-addr">${esc(p.address)}</div>` : ''}
    ${p.note ? `<div>${esc(p.note)}</div>` : ''}
    ${p.remindDate ? `<div class="pin-rem">⏰ reminder ${esc(p.remindDate)}</div>` : ''}
    <div class="pin-acts">
      <button type="button" data-act="cal">📅 Calendar</button>
      <button type="button" data-act="rem">⏰ Remind</button>
      ${safeLink ? `<a href="${esc(safeLink)}" target="_blank" rel="noopener">link ↗</a>` : ''}
      <button type="button" data-act="del" aria-label="Delete place">✕</button>
    </div></div>`;
}
function wirePopup(p) {
  const pop = map?.getPane ? document.querySelector('.leaflet-popup .pin-acts') : null;
  if (!pop) return;
  pop.querySelector('[data-act="cal"]')?.addEventListener('click', () => addToCalendar(p));
  pop.querySelector('[data-act="rem"]')?.addEventListener('click', () => setReminder(p));
  pop.querySelector('[data-act="del"]')?.addEventListener('click', () => {
    savePlaces(loadPlaces().filter(x => x.id !== p.id));
    if (p.eventId) removeEvent(p.eventId);
    map.closePopup(); renderPins();
  });
}

// ---- one source of truth: a place's date lives as a calendar user event ----
function pushEvent(title, date, note) {
  const id = 'u' + Date.now();
  const u = get(KEYS.events, []) || [];
  u.push({ id, title, date, endDate: '', category: 'personal', note: note || '' });
  set(KEYS.events, u);
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  return id;
}
function removeEvent(id) {
  set(KEYS.events, (get(KEYS.events, []) || []).filter(x => x.id !== id));
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));
}
function addToCalendar(p) {
  const date = prompt(`Add "${p.name}" to the calendar on (YYYY-MM-DD):`, (DATA.meta?.arrival_date || '2026-06-30'));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return;
  const eid = pushEvent('Visit: ' + p.name, date.trim(), p.address);
  patchPlace(p.id, { eventId: eid });
  map.closePopup();
}
function setReminder(p) {
  const date = prompt(`Remind me about "${p.name}" on (YYYY-MM-DD) — it'll show in your notifications:`, p.remindDate || '');
  if (date === null) return;
  const d = date.trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) { alert('Use YYYY-MM-DD.'); return; }
  if (p.eventId) removeEvent(p.eventId);
  const eid = d ? pushEvent('⏰ ' + p.name, d, p.address) : '';
  patchPlace(p.id, { remindDate: d, eventId: eid });
  map.closePopup(); renderPins();
}
function patchPlace(id, fields) {
  const arr = loadPlaces();
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) { arr[i] = { ...arr[i], ...fields }; savePlaces(arr); }
}

// ---- add a place with Nominatim autofill (debounce + 1s floor + abort + min-length) ----
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
      if (now - lastReq < 1100) return;            // hard 1 req/s floor (Nominatim policy)
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
    const b = e.target.closest('button[data-lat]');
    if (!b) return;
    const dateEl = $('#placeDate');
    const date = (dateEl?.value || '').trim();
    const place = { id: 'p' + Date.now(), name: b.dataset.name, address: b.dataset.addr, lat: +b.dataset.lat, lng: +b.dataset.lng, category: 'personal', note: '', link: '', date: '', remindDate: '', eventId: '' };
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {        // a dated place spawns a calendar event (→ agenda + notifications) AND a dated pin
      place.date = date; place.remindDate = date;
      place.eventId = pushEvent('Visit: ' + place.name, date, place.address);
    }
    savePlaces([...loadPlaces(), place]);
    input.value = ''; sug.innerHTML = ''; if (dateEl) dateEl.value = '';
    ensureLeaflet();
    if (leafletReady) { renderPins(); flyTo(place); }
  });
}
