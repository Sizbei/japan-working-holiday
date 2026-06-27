'use strict';
// S9 — JLPT N5 starter vocabulary. Themed, collapsible word list on the phrasebook page.
// Reuses the phrase-row styling, accordion, furigana toggle, and speaker. Read-only;
// data-driven from tips.json.vocab[]. Every dynamic string esc()'d.
import { $, esc } from './lib/dom.js';
import { groupByCategory } from './lib/packing.js';
import { mountAccordion } from './collapse.js';
import { wireJpAccents } from './lang.js';
import { rubyHTML } from './lib/furigana.js';
import { speak, canSpeak } from './speak.js';
import { slug } from './lib/places.js';

const THEME_ORDER = ['Numbers', 'Time', 'Places', 'People', 'Food', 'Verbs', 'Adjectives', 'Daily'];
const SPK = canSpeak();

function rowHTML(w) {
  const spk = SPK
    ? `<button type="button" class="phrase-spk" data-jp="${esc(w.jp)}" aria-label="Play pronunciation of ${esc(w.en)}">🔊</button>` : '';
  return `<li class="phrase-row vocab-row" data-id="${esc(w.id)}">
    <div class="phrase-main">
      <span class="jp phrase-jp" lang="ja" data-word="${esc(w.jp)}">${rubyHTML(w.furi, w.jp)}</span>
      <span class="phrase-read">${esc(w.read)}</span>
      <span class="phrase-en">${esc(w.en)}</span>
    </div>${spk}
  </li>`;
}

export function mountVocab(data) {
  const host = $('#vocabList');
  if (!host) return;
  const all = Array.isArray(data && data.vocab) ? data.vocab : [];
  if (!all.length) { host.hidden = true; return; }
  const groups = groupByCategory(all.map(w => ({ ...w, cat: w.theme })), THEME_ORDER);
  host.innerHTML = groups.map(g => {
    const accId = `voc-${slug(g.cat)}`;
    const rows = g.items.map(rowHTML).join('');
    return `<section class="acc vocab-cat" data-acc="${esc(accId)}">
      <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-${esc(accId)}" aria-label="${esc(g.cat)}">
        <span class="acc-chevron" aria-hidden="true">›</span>
        <span class="acc-title">${esc(g.cat)}</span>
        <span class="acc-count">${esc(String(g.items.length))}</span>
      </button>
      <div class="acc-panel" id="acc-panel-${esc(accId)}" role="region" aria-label="${esc(g.cat)}">
        <div class="acc-inner"><ul class="phrase-list">${rows}</ul></div>
      </div>
    </section>`;
  }).join('');
  host.querySelectorAll('.phrase-spk').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  wireJpAccents(host);
  mountAccordion(host);
}
