'use strict';
// N22 — Verb conjugation reference. The key forms (polite, negative, past, te) for common verbs,
// grouped by type so the patterns are visible. Collapsible on the phrasebook page; tap the
// dictionary form to hear it. Static reference data.
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';

const SPK = canSpeak();

// each verb: { jp (dictionary), read, en, group, forms: [[label, form], …] }
const VERBS = [
  { jp: '食べる', read: 'たべる · taberu', en: 'to eat', group: 'ru-verb', forms: [['polite ます', '食べます'], ['negative ない', '食べない'], ['past た', '食べた'], ['te-form', '食べて']] },
  { jp: '見る', read: 'みる · miru', en: 'to see', group: 'ru-verb', forms: [['polite ます', '見ます'], ['negative ない', '見ない'], ['past た', '見た'], ['te-form', '見て']] },
  { jp: '飲む', read: 'のむ · nomu', en: 'to drink', group: 'u-verb', forms: [['polite ます', '飲みます'], ['negative ない', '飲まない'], ['past た', '飲んだ'], ['te-form', '飲んで']] },
  { jp: '買う', read: 'かう · kau', en: 'to buy', group: 'u-verb', forms: [['polite ます', '買います'], ['negative ない', '買わない'], ['past た', '買った'], ['te-form', '買って']] },
  { jp: '行く', read: 'いく · iku', en: 'to go', group: 'u-verb (irregular te)', forms: [['polite ます', '行きます'], ['negative ない', '行かない'], ['past た', '行った'], ['te-form', '行って']] },
  { jp: 'する', read: 'する · suru', en: 'to do', group: 'irregular', forms: [['polite ます', 'します'], ['negative ない', 'しない'], ['past た', 'した'], ['te-form', 'して']] },
  { jp: '来る', read: 'くる · kuru', en: 'to come', group: 'irregular', forms: [['polite ます', '来ます'], ['negative ない', '来ない'], ['past た', '来た'], ['te-form', '来て']] },
];

export function mountVerbs() {
  const host = $('#verbsRef');
  if (!host) return;
  const cards = VERBS.map(v => {
    const spk = SPK ? `<button type="button" class="phrase-spk" data-jp="${esc(v.jp)}" aria-label="Play ${esc(v.en)}">🔊</button>` : '';
    const chips = v.forms.map(f =>
      `<div class="verb-form"><span class="verb-label">${esc(f[0])}</span><span class="verb-val jp" lang="ja">${esc(f[1])}</span></div>`).join('');
    return `<div class="verb-card">
      <div class="verb-head">
        <span class="verb-dict jp" lang="ja" data-word="${esc(v.jp)}">${esc(v.jp)}</span>
        <span class="verb-read">${esc(v.read)}</span>
        <span class="verb-en">${esc(v.en)}</span>
        <span class="verb-group">${esc(v.group)}</span>
        ${spk}
      </div>
      <div class="verb-forms">${chips}</div>
    </div>`;
  }).join('');
  host.innerHTML = `<section class="acc verb-acc" data-acc="verbs">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-verbs" aria-label="Verb conjugation">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Verb conjugation</span>
    </button>
    <div class="acc-panel" id="acc-panel-verbs" role="region" aria-label="Verb conjugation">
      <div class="acc-inner">${cards}</div>
    </div>
  </section>`;
  if (SPK) host.querySelectorAll('.phrase-spk').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  mountAccordion(host);
}
