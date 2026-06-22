'use strict';
// Emergency quick-reference page (#/emergency). Read-only, offline-first: Japan emergency
// numbers, embassy/key contacts, always-carry reminders, and survival phrases.
// No storage, no mutation, no jwh:data-changed. Every dynamic string esc()'d; the page is
// glanced at under stress, so it stays high-contrast and scannable.

import { $, esc } from './lib/dom.js';
import { wireJpAccents } from './lang.js';

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

  host.innerHTML = sections.join('');
  wireJpAccents($('#view-emergency'));
}
