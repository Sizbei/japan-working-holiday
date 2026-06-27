'use strict';
// S14 — "Phrase of the day" dashboard widget. Shows one phrase from the phrasebook, chosen
// deterministically by today's date (stable per day), with furigana + audio + an "Another" shuffle.
// The card flips/reveals on render (reduce-motion gated).
import { $, esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { speak, canSpeak } from './speak.js';
import { prefersReducedMotion } from './motion.js';

let POOL = [];
let idx = 0;

function dayIndex(n) {
  if (!n) return 0;
  const d = new Date();
  const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return key % n;
}

function flip(card) {
  if (!card || prefersReducedMotion() || document.documentElement.dataset.reduceMotion === 'on') return;
  if (typeof card.animate !== 'function') return;
  card.animate(
    [{ opacity: 0, transform: 'perspective(600px) rotateX(-14deg) translateY(7px)' },
     { opacity: 1, transform: 'perspective(600px) rotateX(0) translateY(0)' }],
    { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' }
  );
}

function paint(host, animate) {
  const p = POOL[idx];
  if (!p) return;
  const spk = canSpeak()
    ? `<button type="button" class="phrase-spk potd-spk" data-jp="${esc(p.jp)}" aria-label="Hear it">🔊</button>` : '';
  host.innerHTML = `<div class="potd">
    <div class="potd-jp jp" lang="ja" data-word="${esc(p.jp)}">${rubyHTML(p.furi, p.jp)}</div>
    <div class="potd-read">${esc(p.read)}</div>
    <div class="potd-en">${esc(p.en)}</div>
    <div class="potd-actions">${spk}<button type="button" class="potd-next">Another ↻</button></div>
  </div>`;
  const card = host.querySelector('.potd');
  if (animate) flip(card);
  host.querySelector('.potd-spk')?.addEventListener('click', e => speak(p.jp, e.currentTarget));
  host.querySelector('.potd-next')?.addEventListener('click', () => { idx = (idx + 1) % POOL.length; paint(host, true); });
}

export function mountPhraseDay(data) {
  const host = $('#wPhrase .widget-body');
  if (!host) return;
  POOL = Array.isArray(data && data.phrases) ? data.phrases.filter(p => p && p.jp) : [];
  if (!POOL.length) { const w = $('#wPhrase'); if (w) w.hidden = true; return; }
  idx = dayIndex(POOL.length);
  paint(host, true);
}
