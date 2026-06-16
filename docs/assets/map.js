'use strict';
// Map page (#/map). Static-friendly: an OpenStreetMap embed (no API key, no JS lib)
// + an area-grouped index of every place in the data, each a Google Maps deep link
// (opens the native Maps app on mobile). Zero dependencies.

import { $, esc } from './lib/dom.js';

const AREAS = ['Shibuya', 'Shinjuku', 'Akihabara', 'Nakano', 'Koenji', 'Shimokitazawa', 'Shimokita',
  'Ebisu', 'Ikebukuro', 'Harajuku', 'Aoyama', 'Omotesando', 'Daikanyama', 'Nakameguro', 'Asakusa',
  'Ochanomizu', 'Toyosu', 'Roppongi', 'Ginza', 'Setagaya', 'Sangenjaya', 'Kichijoji', 'Ueno'];

function areaOf(s) {
  const l = (s || '').toLowerCase();
  for (const a of AREAS) if (l.includes(a.toLowerCase())) return a === 'Shimokita' ? 'Shimokitazawa' : a;
  return 'Around Tokyo';
}
function gmaps(query) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' Tokyo'); }
function dedupe(arr) { const seen = new Set(); return arr.filter(p => { const k = p.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }

export function mountMap(data) {
  const wrap = $('#mapList');
  if (!wrap) return;
  const places = [];
  const add = (arr) => (arr || []).forEach(i => { const area = i.area || i.area_or_park || ''; if (i.name) places.push({ name: i.name, area, group: areaOf(area) }); });
  ['music', 'geek', 'building', 'restaurants', 'livemusic', 'activities', 'disney', 'meetups'].forEach(k => add(data[k]));
  (data.rooms || []).forEach(r => places.push({ name: r.name, area: r.area, group: areaOf(r.area) }));
  (data.calendar || []).forEach(e => { if (e.area && e.category !== 'holiday') places.push({ name: e.title, area: e.area, group: areaOf(e.area) }); });

  const groups = {};
  places.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
  const order = [...new Set(AREAS.map(a => a === 'Shimokita' ? 'Shimokitazawa' : a)), 'Around Tokyo'];
  const keys = order.filter(k => groups[k]);

  wrap.innerHTML = keys.map(k => `
    <div class="map-group">
      <h3 class="map-area"><a href="${esc(gmaps(k))}" target="_blank" rel="noopener">📍 ${esc(k)}</a> <span class="map-count">${dedupe(groups[k]).length}</span></h3>
      <ul class="map-places">${dedupe(groups[k]).map(p => `<li><a href="${esc(gmaps(p.name + ' ' + (p.area || '')))}" target="_blank" rel="noopener">${esc(p.name)}</a></li>`).join('')}</ul>
    </div>`).join('');
}
