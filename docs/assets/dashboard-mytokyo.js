'use strict';
// "MY TOKYO" — surfaces the owner's interests (gear / arcade / digging / build) at the
// top of #/dashboard, pulled from the already-loaded tips.json. Reuses the .card2 shape.

import { $, esc } from './lib/dom.js';

function pick(arr, needle, idx) {
  return (arr || []).find(x => (x.name || '').toLowerCase().includes(needle)) || (arr || [])[idx] || null;
}

export function mountMyTokyo(data) {
  const grid = $('#myTokyoGrid');
  if (!grid) return;
  const cards = [
    { cat: 'GEAR', cls: 'cat-gear', item: pick(data.music, 'five g', 3) },
    { cat: 'ARCADE', cls: 'cat-arcade', item: pick(data.geek, 'super potato', 1) },
    { cat: 'DIGGING', cls: 'cat-listen', item: pick(data.music, 'disk union', 7) },
    { cat: 'BUILD', cls: 'cat-build', item: pick(data.building, 'cic', 3) },
  ].filter(c => c.item);
  if (!cards.length) { const s = $('#myTokyo'); if (s) s.style.display = 'none'; return; }
  grid.innerHTML = cards.map(c => `
    <a class="card2 crt mt-card ${c.cls}" href="#/explore">
      <span class="mt-eyebrow">${esc(c.cat)}</span>
      <div class="c-name">${esc(c.item.name)}</div>
      ${c.item.area_or_park ? `<div class="c-detail">📍 ${esc(c.item.area_or_park)}</div>` : ''}
    </a>`).join('');
}
