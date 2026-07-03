'use strict';
// Emergency quick-reference page (#/emergency). Read-only, offline-first: Japan emergency
// numbers, embassy/key contacts, always-carry reminders, and survival phrases.
// No storage, no mutation, no jwh:data-changed. Every dynamic string esc()'d; the page is
// glanced at under stress, so it stays high-contrast and scannable.

import { $, esc } from './lib/dom.js';
import { wireJpAccents } from './lang.js';
import { fetchQuakes } from './lib/quakes.js';

export function mountEmergency(data) {
  const host = $('#emergencyContent');
  if (!host) return;
  const em = data?.emergency || {};
  const { numbers = [], contacts = [], carry = [], phrases = [] } = em;

  const sections = [];

  if (numbers.length) {
    const rows = numbers.map(n => {
      const num = String(n?.num || '');
      const note = n?.note ? `<p class="em-note">${esc(n.note)}</p>` : '';
      return `<a class="em-call" href="tel:${esc(num)}">
        <span class="em-num">${esc(num)}</span>
        <span class="em-call-label">${esc(n?.label || '')}</span>
        ${note}
      </a>`;
    }).join('');
    sections.push(`<section class="em-section" aria-labelledby="em-h-numbers">
      <h3 id="em-h-numbers" class="em-h">Emergency numbers</h3>
      <div class="em-calls">${rows}</div>
    </section>`);
  }

  if (contacts.length) {
    const rows = contacts.map(c => {
      const note = c?.note ? `<p class="em-note">${esc(c.note)}</p>` : '';
      return `<div class="em-contact">
        <p class="em-contact-label">${esc(c?.label || '')}</p>
        <p class="em-contact-detail">${esc(c?.detail || '')}</p>
        ${note}
      </div>`;
    }).join('');
    sections.push(`<section class="em-section" aria-labelledby="em-h-contacts">
      <h3 id="em-h-contacts" class="em-h">Key contacts</h3>
      <div class="em-contacts">${rows}</div>
    </section>`);
  }

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
      return `<div class="em-phrase">
        <span class="jp" lang="ja">${esc(p?.jp || '')}</span>
        ${read}
        <span class="em-en">${esc(p?.en || '')}</span>
      </div>`;
    }).join('');
    sections.push(`<section class="em-section" aria-labelledby="em-h-phrases">
      <h3 id="em-h-phrases" class="em-h">Emergency phrases</h3>
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
  wireJpAccents($('#view-emergency'));

  let quakesAt = 0, quakesBusy = false;
  document.addEventListener('jwh:route', async (e) => {
    if (e.detail?.route !== 'emergency') return;
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
