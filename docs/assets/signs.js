'use strict';
// S12 — Daily-life kanji signs you'll SEE (not say): 入口/出口/押/引/営業中… A recognition grid
// on the phrasebook page; tap any sign to hear it. Data-driven from tips.json.signs[].
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';

const SPK = canSpeak();

export function mountSigns(data) {
  const host = $('#signsRef');
  if (!host) return;
  const all = Array.isArray(data && data.signs) ? data.signs : [];
  if (!all.length) { host.hidden = true; return; }
  const cards = all.map(s => {
    const tag = SPK ? 'button' : 'div';
    const attrs = SPK ? ` type="button" data-jp="${esc(s.jp)}" aria-label="${esc(s.en)} — play"` : '';
    return `<${tag} class="sign-card"${attrs}>
      <span class="sign-jp" lang="ja">${esc(s.jp)}</span>
      <span class="sign-read" lang="ja">${esc(s.read)}</span>
      <span class="sign-en">${esc(s.en)}</span>
    </${tag}>`;
  }).join('');
  host.innerHTML = `<section class="acc signs-acc" data-acc="signs">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-signs" aria-label="Signs you'll see">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Signs you'll see</span>
    </button>
    <div class="acc-panel" id="acc-panel-signs" role="region" aria-label="Signs you'll see">
      <div class="acc-inner"><div class="sign-grid">${cards}</div></div>
    </div>
  </section>`;
  if (SPK) host.querySelectorAll('.sign-card[data-jp]').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  mountAccordion(host);
}
