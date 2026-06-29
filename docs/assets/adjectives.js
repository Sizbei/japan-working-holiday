'use strict';
// N23 — Adjective conjugation reference. い-adjectives and な-adjectives with their key forms,
// grouped so the two patterns are clear. Collapsible on the phrasebook page; tap to hear.
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';

const SPK = canSpeak();

// { jp, read, en, group, forms: [[label, form], …] }
const ADJ = [
  { jp: '大きい', read: 'おおきい · ōkii', en: 'big', group: 'い-adjective', forms: [['polite です', '大きいです'], ['negative', '大きくない'], ['past', '大きかった'], ['te-form', '大きくて']] },
  { jp: '安い', read: 'やすい · yasui', en: 'cheap', group: 'い-adjective', forms: [['polite です', '安いです'], ['negative', '安くない'], ['past', '安かった'], ['te-form', '安くて']] },
  { jp: 'おいしい', read: 'おいしい · oishii', en: 'tasty', group: 'い-adjective', forms: [['polite です', 'おいしいです'], ['negative', 'おいしくない'], ['past', 'おいしかった'], ['te-form', 'おいしくて']] },
  { jp: 'いい', read: 'いい · ii', en: 'good', group: 'い-adjective (irregular → よく)', forms: [['polite です', 'いいです'], ['negative', 'よくない'], ['past', 'よかった'], ['te-form', 'よくて']] },
  { jp: '静か', read: 'しずか · shizuka', en: 'quiet', group: 'な-adjective', forms: [['polite です', '静かです'], ['negative', '静かじゃない'], ['past', '静かだった'], ['te-form', '静かで']] },
  { jp: '便利', read: 'べんり · benri', en: 'convenient', group: 'な-adjective', forms: [['polite です', '便利です'], ['negative', '便利じゃない'], ['past', '便利だった'], ['te-form', '便利で']] },
  { jp: '好き', read: 'すき · suki', en: 'liked / favourite', group: 'な-adjective', forms: [['polite です', '好きです'], ['negative', '好きじゃない'], ['past', '好きだった'], ['te-form', '好きで']] },
];

export function mountAdjectives() {
  const host = $('#adjRef');
  if (!host) return;
  const cards = ADJ.map(a => {
    const spk = SPK ? `<button type="button" class="phrase-spk" data-jp="${esc(a.jp)}" aria-label="Play ${esc(a.en)}">🔊</button>` : '';
    const chips = a.forms.map(f =>
      `<div class="verb-form"><span class="verb-label">${esc(f[0])}</span><span class="verb-val jp" lang="ja">${esc(f[1])}</span></div>`).join('');
    return `<div class="verb-card">
      <div class="verb-head">
        <span class="verb-dict jp" lang="ja" data-word="${esc(a.jp)}">${esc(a.jp)}</span>
        <span class="verb-read">${esc(a.read)}</span>
        <span class="verb-en">${esc(a.en)}</span>
        <span class="verb-group">${esc(a.group)}</span>
        ${spk}
      </div>
      <div class="verb-forms">${chips}</div>
    </div>`;
  }).join('');
  host.innerHTML = `<section class="acc adj-acc" data-acc="adjectives">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-adj" aria-label="Adjective conjugation">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Adjective conjugation</span>
    </button>
    <div class="acc-panel" id="acc-panel-adj" role="region" aria-label="Adjective conjugation">
      <div class="acc-inner">${cards}</div>
    </div>
  </section>`;
  if (SPK) host.querySelectorAll('.phrase-spk').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  mountAccordion(host);
}
