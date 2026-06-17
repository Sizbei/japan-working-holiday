'use strict';
// Share-room finder (#/rooms). Curated foreigner-friendly providers/houses with
// cost, move-in, requirements, contacts, links — filterable. No provider has a
// public listings API, so this is curated; live availability lives on the links.

import { $, $$, esc } from './lib/dom.js';

let DATA = null;

export function mountRooms(data) {
  DATA = data;
  render();
  wire();
}

function card(r) {
  return `<article class="room-card tier-${esc(r.tier)}" data-tier="${esc(r.tier)}" data-nokey="${!!r.noKeyMoney}" data-room="${esc(r.roomType)}">
    <div class="room-head">
      <h3 class="room-name">${esc(r.name)}</h3>
      ${r.noKeyMoney ? '<span class="room-flag">NO KEY MONEY</span>' : ''}
    </div>
    <div class="room-provider">${esc(r.provider)} · <span class="room-area">📍 ${esc(r.area)}</span></div>
    <div class="room-cost">${esc(r.rent)}</div>
    <ul class="room-meta">
      <li><b>Move-in</b> ${esc(r.moveIn)}</li>
      <li><b>Fees</b> ${esc(r.fees)} · <b>Initial</b> ${esc(r.oneTime)}</li>
      <li><b>Room</b> ${esc(r.roomType)}${r.gender ? ' · ' + esc(r.gender) : ''}</li>
      <li><b>Requirements</b> ${esc((r.requirements || []).join(' · '))}</li>
      <li><b>Contact</b> ${esc(r.contact)}</li>
    </ul>
    <p class="room-note">${esc(r.note)}</p>
    <div class="room-links">
      <a class="btn primary" href="${esc(r.listingUrl)}" target="_blank" rel="noopener noreferrer">Browse listings ↗</a>
      <a class="btn ghost" href="${esc(r.providerUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.provider)} ↗</a>
    </div>
  </article>`;
}

function render() {
  const grid = $('#roomsGrid');
  if (!grid) return;
  grid.innerHTML = (DATA.rooms || []).map(card).join('');
  updateCount();
}

function updateCount() {
  const n = $$('#roomsGrid .room-card').filter(c => c.style.display !== 'none').length;
  const el = $('#roomCount'); if (el) el.textContent = `${n} option${n === 1 ? '' : 's'}`;
  const grid = $('#roomsGrid');
  let empty = grid?.querySelector('.room-empty');
  if (n === 0 && grid && !empty) { empty = document.createElement('p'); empty.className = 'room-empty'; empty.textContent = 'No rooms match these filters — clear a filter or search a different area.'; grid.appendChild(empty); }
  else if (n > 0 && empty) empty.remove();
}

function wire() {
  const apply = () => {
    const q = ($('#roomSearch')?.value || '').trim().toLowerCase();
    const tier = $('#roomTier .chip.active')?.dataset.tier || 'all';
    const room = $('#roomTypeF .chip.active')?.dataset.room || 'all';
    const noKey = $('#roomNoKey')?.classList.contains('active');
    $$('#roomsGrid .room-card').forEach(c => {
      const okQ = !q || c.textContent.toLowerCase().includes(q);
      const okTier = tier === 'all' || c.dataset.tier === tier;
      const okRoom = room === 'all' || c.dataset.room === room || c.dataset.room === 'both'
        || (room === 'private' && c.dataset.room === 'private-apartment');
      const okKey = !noKey || c.dataset.nokey === 'true';
      c.style.display = (okQ && okTier && okRoom && okKey) ? '' : 'none';
    });
    updateCount();
  };
  $('#roomSearch')?.addEventListener('input', apply);
  $$('#roomTier .chip, #roomTypeF .chip').forEach(ch => ch.addEventListener('click', () => {
    [...ch.parentElement.querySelectorAll('.chip')].forEach(x => x.classList.remove('active'));
    ch.classList.add('active'); apply();
  }));
  $('#roomNoKey')?.addEventListener('click', () => { const on = $('#roomNoKey').classList.toggle('active'); $('#roomNoKey').setAttribute('aria-pressed', on ? 'true' : 'false'); apply(); });
}
