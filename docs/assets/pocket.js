'use strict';
// 🆘 Emergency pocket — a two-taps-away, offline overlay: tap-to-dial emergency numbers,
// tonight's stay (address → maps), and the online/offline status. Read-only; reuses the baked
// emergency numbers (tips.json.emergency) + the trip stay model (lib/trip.js). Opens in the
// existing focus-trapped modal (lib/modal.js) — NOT a new sheet system. Every dynamic string is
// esc()'d before innerHTML; the address opens in the OS maps app (no fabricated data — a stay
// phone/contact shows only when the deck actually has one).
import { $, esc } from './lib/dom.js';
import { showModal } from './lib/modal.js';
import { stayForNight, stayBooked } from './lib/trip.js';
import { nowISO, fmtShort } from './lib/dates.js';

export function mountPocket(data) {
  const btn = $('#pocketBtn');
  if (!btn) return;
  btn.addEventListener('click', () => openPocket(data));
}

function openPocket(data) {
  const em = data?.emergency || {};
  const numbers = Array.isArray(em.numbers) ? em.numbers : [];
  const cal = (data && data.calendar) || [];   // baked stays (matches the emergency page)
  const today = nowISO();
  const stay = stayForNight(cal, today);
  const online = navigator.onLine;

  const dials = numbers.slice(0, 4).map(n => {
    const num = String(n?.num || '');
    if (!num) return '';
    return `<a class="pk-dial" href="tel:${esc(num)}">
      <span class="pk-dial-num">${esc(num)}</span>
      <span class="pk-dial-lbl">${esc(n?.label || '')}</span></a>`;
  }).join('');

  let stayHTML;
  if (stay) {
    const name = String(stay.title).split(/stay:\s*/i).pop().replace(/\s*\(BOOKED\)\s*/i, '').trim();
    const addr = stay.stayAddress || '';
    const mapHref = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : '';
    stayHTML = `<div class="pk-stay">
      <p class="pk-stay-name">🛏 ${esc(name)} ${stayBooked(stay) ? '<span class="pk-badge">BOOKED ✓</span>' : '<span class="pk-badge pk-warn">NOT BOOKED</span>'}</p>
      <p class="pk-note">${esc(fmtShort(stay.date))} → ${esc(fmtShort(stay.endDate))}${stay.area ? ' · ' + esc(stay.area) : ''}</p>
      ${addr ? `<p class="pk-addr">${esc(addr)}</p>` : ''}
      ${stay.stayAddressJa ? `<p class="pk-addr" lang="ja">${esc(stay.stayAddressJa)}</p>` : ''}
      ${stay.stayContact ? `<p class="pk-note">${esc(stay.stayContact)}</p>` : ''}
      ${mapHref ? `<a class="pk-map" href="${esc(mapHref)}" target="_blank" rel="noopener noreferrer">🗺 Open in Maps ↗</a>` : ''}
    </div>`;
  } else {
    stayHTML = '<p class="pk-note">No stay tonight (checkout day).</p>';
  }

  const html = `<div class="pk">
    <section class="pk-sec">
      <h3 class="pk-h">Tap to dial</h3>
      <div class="pk-dials">${dials || '<p class="pk-note">No numbers in the data.</p>'}</div>
    </section>
    <section class="pk-sec">
      <h3 class="pk-h">Tonight's stay</h3>
      ${stayHTML}
    </section>
    <p class="pk-status ${online ? 'pk-on' : 'pk-off'}">${online ? '● Online' : '○ Offline — this info is cached and works without signal'}</p>
  </div>`;
  showModal('🆘 Emergency', html, { closeLabel: 'Close' });
}
