'use strict';
// S7 — "Point & show" survival cards. Tap a situation → a big Japanese sentence fills a modal
// you literally show to staff (pharmacy/medication, hospital, allergy, lost, police, no-Japanese).
// Data-driven from tips.json.pointToSay[]. Read-only; every dynamic string esc()'d.
import { $, esc } from './lib/dom.js';
import { showModal } from './lib/modal.js';
import { speak, canSpeak } from './speak.js';

let CARDS = [];

function openCard(c) {
  if (!c) return;
  const spk = canSpeak()
    ? `<button type="button" class="pts-speak" data-jp="${esc(c.jp)}">🔊 Hear it</button>` : '';
  const note = c.note ? `<p class="pts-note">${esc(c.note)}</p>` : '';
  const html = `<div class="pts-big" lang="ja">${esc(c.jp)}</div>
    <p class="pts-en">${esc(c.en)}</p>${note}${spk}`;
  showModal(c.label, html, { wide: true });
  const b = document.querySelector('.pts-speak');
  if (b) b.addEventListener('click', () => speak(b.dataset.jp, b));
}

export function mountPointToSay(data) {
  const host = $('#pointToSay');
  if (!host) return;
  CARDS = Array.isArray(data && data.pointToSay) ? data.pointToSay : [];
  if (!CARDS.length) { host.hidden = true; return; }
  host.innerHTML = `<h3 class="pts-title">Point &amp; show</h3>
    <p class="pts-sub">Tap a card, then show the big Japanese to staff.</p>
    <div class="pts-row">${CARDS.map((c, i) =>
      `<button type="button" class="pts-card" data-i="${i}" aria-label="${esc(c.label)}">
        <span class="pts-icon" aria-hidden="true">${esc(c.icon || '🗣')}</span>
        <span class="pts-label">${esc(c.label)}</span>
      </button>`).join('')}</div>`;
  host.querySelectorAll('.pts-card').forEach(btn =>
    btn.addEventListener('click', () => openCard(CARDS[+btn.dataset.i])));
}
