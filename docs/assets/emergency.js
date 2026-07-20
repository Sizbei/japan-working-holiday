'use strict';
// Emergency quick-reference page (#/emergency). Read-only, offline-first: Japan emergency
// numbers, embassy/key contacts, always-carry reminders, and survival phrases.
// No storage, no mutation, no jwh:data-changed. Every dynamic string esc()'d; the page is
// glanced at under stress, so it stays high-contrast and scannable.

import { $, esc } from './lib/dom.js';
import { wireJpAccents } from './lang.js';
import { fetchQuakes } from './lib/quakes.js';
import { tripWindow, stayForNight, stayBooked } from './lib/trip.js';
import { nowISO, fmtShort } from './lib/dates.js';
import { dialsHTML, linkifyIntlPhones } from './lib/emergency-render.js';

export function mountEmergency(data) {
  const host = $('#emergencyContent');
  if (!host) return;
  const em = data?.emergency || {};
  const { numbers = [], contacts = [], carry = [], phrases = [] } = em;

  const sections = [];

  // THE HERO — 110 / 119 the instant the page opens: dial-in-one-glance-and-tap from
  // anywhere, before anything scrolls. First two numbers (Police, Fire/Ambulance) render
  // as big display cards; any remaining lines (Coast Guard, helpline) ride below, slimmer.
  if (numbers.length) {
    sections.push(`<section class="em-hero" aria-labelledby="em-h-numbers">
      <h3 id="em-h-numbers" class="em-hero-kicker">Emergency · tap to call · free from any phone</h3>
      <div class="em-dialpad">${dialsHTML(numbers.slice(0, 2), { hero: 2 })}</div>
      ${numbers.length > 2 ? `<div class="em-dials-sub">${dialsHTML(numbers.slice(2))}</div>` : ''}
    </section>`);
  }

  if (contacts.length) {
    const rows = contacts.map(c => {
      const note = c?.note ? `<p class="em-note">${linkifyIntlPhones(c.note)}</p>` : '';
      return `<div class="em-contact alm-card">
        <p class="em-contact-label">${esc(c?.label || '')}</p>
        <p class="em-contact-detail">${linkifyIntlPhones(c?.detail || '')}</p>
        ${note}
      </div>`;
    }).join('');
    sections.push(`<section class="em-section" aria-labelledby="em-h-contacts">
      <h3 id="em-h-contacts" class="em-h">Embassy &amp; key contacts</h3>
      <div class="em-contacts">${rows}</div>
    </section>`);
  }

  // Tonight's stay — trip-mode only, placed AFTER numbers + contacts (110/119 stay on
  // top: a stay card is never more urgent than an ambulance). Re-rendered on every
  // #/emergency entry so an open tab never shows yesterday's stay after midnight.
  sections.push(`<div id="emStay"></div>`);

  if (carry.length) {
    const items = carry.map(c => `<li>${esc(c)}</li>`).join('');
    sections.push(`<section class="em-section" aria-labelledby="em-h-carry">
      <h3 id="em-h-carry" class="em-h">Always carry</h3>
      <ul class="em-carry">${items}</ul>
    </section>`);
  }

  if (phrases.length) {
    const rows = phrases.map(p => {
      const read = p?.read ? `<span class="em-read">${esc(p.read)}</span>` : '';
      return `<div class="em-phrase alm-card">
        <span class="jp" lang="ja">${esc(p?.jp || '')}</span>
        ${read}
        <span class="em-en">${esc(p?.en || '')}</span>
      </div>`;
    }).join('');
    sections.push(`<section class="em-section" aria-labelledby="em-h-phrases">
      <h3 id="em-h-phrases" class="em-h">Emergency phrases <span class="em-h-aside">show the Japanese</span></h3>
      <div class="em-phrases">${rows}</div>
    </section>`);
  }

  // typhoon & flood season prep (expansion ledger S6) — static data, offline-first like the rest
  const ty = em.typhoon;
  if (ty && Array.isArray(ty.items) && ty.items.length) {
    sections.push(`<section class="em-section" aria-labelledby="em-h-typhoon">
      <h3 id="em-h-typhoon" class="em-h">${esc(ty.title || 'Typhoon season')}</h3>
      ${ty.note ? `<p class="em-note">${esc(ty.note)}</p>` : ''}
      <ul class="em-carry">${ty.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </section>`);
  }

  // live JMA quake feed (P2P地震情報, keyless) — loads lazily on route entry so the static
  // page stays fully offline-first; failure just leaves the section absent.
  sections.push(`<section class="em-section" aria-labelledby="em-h-quakes">
      <h3 id="em-h-quakes" class="em-h">Recent earthquakes <span class="em-note">JMA via P2P地震情報</span></h3>
      <div id="emQuakes" class="em-quakes"><p class="em-note">Loads when online.</p></div>
    </section>`);

  host.innerHTML = sections.join('');
  renderStay(data);
  wireJpAccents($('#view-emergency'));

  let quakesAt = 0, quakesBusy = false;
  document.addEventListener('jwh:route', async (e) => {
    if (e.detail?.route !== 'emergency') return;
    renderStay(data);                                              // cheap; keeps "tonight" true across midnight
    if (quakesBusy || Date.now() - quakesAt < 10 * 60e3) return;   // refresh at most every 10 min
    quakesBusy = true;
    const el = $('#emQuakes');
    try {
      const qs = await fetchQuakes(5);
      quakesAt = Date.now();
      if (el && qs.length) {
        el.innerHTML = `<ul class="em-qlist">${qs.map(q => `<li>
          <span class="em-qtime">${esc(q.time.slice(5, 16))}</span>
          <span class="em-qname" lang="ja">${esc(q.name)}</span>
          ${q.mag != null ? `<span class="em-qmag">M${esc(String(q.mag))}</span>` : ''}
          ${q.shindo ? `<span class="em-qshindo">震度${esc(q.shindo)}</span>` : ''}
          ${q.tsunami ? '<span class="em-qtsu">🌊 tsunami advisory</span>' : ''}
        </li>`).join('')}</ul>`;
      } else if (el && !qs.length) { el.innerHTML = '<p class="em-note">No recent quakes reported.</p>'; }
    } catch { if (el) el.innerHTML = '<p class="em-note">Feed unavailable (offline?).</p>'; }
    finally { quakesBusy = false; }
  });
}

// "Tonight's stay" — offline stay card from baked calendar stays (lib/trip.js). Renders
// only while a trip window covers today; everything esc()'d; read-only.
function renderStay(data) {
  const host = $('#emStay');
  if (!host) return;
  const today = nowISO();
  const cal = (data && data.calendar) || [];
  const w = tripWindow(cal, today);
  if (!w) { host.innerHTML = ''; return; }
  const card = (s, tonight) => {
    const booked = stayBooked(s);
    const name = String(s.title).split(/stay:\s*/i).pop().replace(/\s*\(BOOKED\)\s*/i, '');
    const badge = booked
      ? '<span class="em-stay-badge">BOOKED ✓</span>'
      : `<span class="em-stay-badge em-stay-warn">NOT BOOKED${s.bookBy ? ' — book by ' + esc(fmtShort(s.bookBy)) : ''}</span>`;
    const src = (s.sources || [])[0];
    return `<div class="em-stay${tonight ? ' em-stay-tonight' : ''}">
      <p class="em-stay-name">${tonight ? '🛏 Tonight: ' : ''}${esc(name)} ${badge}</p>
      <p class="em-note">${esc(fmtShort(s.date))} → ${esc(fmtShort(s.endDate))} · ${esc(s.area || '')}</p>
      ${s.stayAddress ? `<p class="em-stay-addr">${esc(s.stayAddress)}</p>` : ''}
      ${s.stayAddressJa ? `<p class="em-stay-addr" lang="ja">${esc(s.stayAddressJa)}</p>` : ''}
      ${s.bookingNotes ? `<p class="em-note">${esc(s.bookingNotes)}</p>` : ''}
      ${s.stayContact ? `<p class="em-note">${esc(s.stayContact)}</p>` : ''}
      ${src ? `<a class="em-stay-link" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(src.replace(/^https?:\/\//, ''))} ↗</a>` : ''}
    </div>`;
  };
  const tonight = stayForNight(cal, today);
  const rest = w.stays.filter(s => s !== tonight && String(s.endDate) > today);
  host.innerHTML = `<section class="em-section" aria-labelledby="em-h-stay">
    <h3 id="em-h-stay" class="em-h">Trip stays · day ${esc(String(w.day))}/${esc(String(w.total))}</h3>
    ${tonight ? card(tonight, true) : '<p class="em-note">Checkout day — no stay tonight.</p>'}
    ${rest.map(s => card(s, false)).join('')}
  </section>`;
}
