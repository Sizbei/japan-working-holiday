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

// ---- lazy Leaflet bootstrap (only on #/map, network-only, init once) ----
function ensureLeaflet() {
  if (leafletReady || leafletTried) return;
  leafletTried = true;
  if (window.L) { initMap(); return; }
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);
  const js = document.createElement('script');
  js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.onload = initMap;
  js.onerror = () => { const e = $('#mapCanvas'); if (e) e.classList.add('failed'); };  // offline → link index stands alone
  document.head.appendChild(js);
}
function initMap() {
  const el = $('#mapCanvas');
  if (!el || map || !window.L) return;
  map = L.map(el, { scrollWheelZoom: false }).setView([35.69, 139.73], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  pinLayer = L.layerGroup().addTo(map);
  leafletReady = true;
  el.classList.add('ready');
  renderPins();
}
function flyTo(p) {
  if (!map || typeof p.lat !== 'number' || typeof p.lng !== 'number' || isNaN(p.lat) || isNaN(p.lng)) return;
  map.invalidateSize();   // ensure the container has a valid size before panning
  map.setView([p.lat, p.lng], 15, { animate: !prefersReducedMotion() });   // setView pan is stable (avoids the flyTo NaN bug)
}

// ---- user pins (escaped popups, https-only links) ----
function renderPins() {
  if (!pinLayer || !window.L) return;
  pinLayer.clearLayers();
  loadPlaces().forEach(p => {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
    const m = L.marker([p.lat, p.lng]);
    m.bindPopup(popupHTML(p));
    m.on('popupopen', () => wirePopup(p));
    m.addTo(pinLayer);
  });
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
    const place = { id: 'p' + Date.now(), name: b.dataset.name, address: b.dataset.addr, lat: +b.dataset.lat, lng: +b.dataset.lng, category: 'personal', note: '', link: '', remindDate: '', eventId: '' };
    savePlaces([...loadPlaces(), place]);
    input.value = ''; sug.innerHTML = '';
    ensureLeaflet();
    if (leafletReady) { renderPins(); flyTo(place); }
  });
}
