'use strict';
// S11 — Numbers, money, counters & dates reference. Collapsible on the phrasebook page; tap any
// term to hear it. Curated/static reference data (kept in-module, like the kana chart) — chosen
// over a generative converter to avoid reading-generation errors (rendaku in counters/dates).
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';

const SPK = canSpeak();

// each section: { title, note?, rows: [jp, reading, english] }
const SECTIONS = [
  { title: 'Money (¥)', rows: [
    ['一円', 'いち えん', '¥1'], ['五円', 'ご えん', '¥5'], ['十円', 'じゅう えん', '¥10'],
    ['五十円', 'ごじゅう えん', '¥50'], ['百円', 'ひゃく えん', '¥100'], ['五百円', 'ごひゃく えん', '¥500'],
    ['千円', 'せん えん', '¥1,000'], ['五千円', 'ごせん えん', '¥5,000'], ['一万円', 'いちまん えん', '¥10,000'],
  ] },
  { title: 'Counters', note: 'Readings change with the number (rendaku) — these are the common forms.', rows: [
    ['一個・二個・三個', 'いっこ・にこ・さんこ', 'general objects (〜個)'],
    ['一人・二人・三人', 'ひとり・ふたり・さんにん', 'people (〜人)'],
    ['一枚・二枚', 'いちまい・にまい', 'flat things — tickets, cards (〜枚)'],
    ['一本・二本・三本', 'いっぽん・にほん・さんぼん', 'long things — bottles (〜本)'],
    ['一杯・二杯', 'いっぱい・にはい', 'cups/glasses (〜杯)'],
    ['一時・二時', 'いちじ・にじ', "o'clock (〜時)"],
    ['一分・三分', 'いっぷん・さんぷん', 'minutes (〜分)'],
  ] },
  { title: 'Days of the week', rows: [
    ['月曜日', 'げつようび', 'Monday'], ['火曜日', 'かようび', 'Tuesday'], ['水曜日', 'すいようび', 'Wednesday'],
    ['木曜日', 'もくようび', 'Thursday'], ['金曜日', 'きんようび', 'Friday'], ['土曜日', 'どようび', 'Saturday'],
    ['日曜日', 'にちようび', 'Sunday'],
  ] },
  { title: 'Days of the month (irregular)', note: '1st–10th, then 14th/20th/24th are irregular; others add 〜日 (にち).', rows: [
    ['一日', 'ついたち', '1st'], ['二日', 'ふつか', '2nd'], ['三日', 'みっか', '3rd'], ['四日', 'よっか', '4th'],
    ['五日', 'いつか', '5th'], ['六日', 'むいか', '6th'], ['七日', 'なのか', '7th'], ['八日', 'ようか', '8th'],
    ['九日', 'ここのか', '9th'], ['十日', 'とおか', '10th'], ['十四日', 'じゅうよっか', '14th'],
    ['二十日', 'はつか', '20th'], ['二十四日', 'にじゅうよっか', '24th'],
  ] },
];
const BIG_NOTE = 'Japanese groups large numbers by 万 (10,000), not thousands: 100,000 = 十万 (jū-man), 1,000,000 = 百万 (hyaku-man).';

function rowHTML(jp, read, en) {
  const spk = SPK ? `<button type="button" class="phrase-spk" data-jp="${esc(jp)}" aria-label="Play ${esc(en)}">🔊</button>` : '';
  return `<li class="phrase-row num-row">
    <div class="phrase-main">
      <span class="jp" lang="ja" data-word="${esc(jp)}">${esc(jp)}</span>
      <span class="phrase-read">${esc(read)}</span>
      <span class="phrase-en">${esc(en)}</span>
    </div>${spk}
  </li>`;
}

export function mountNumbers() {
  const host = $('#numbersRef');
  if (!host) return;
  const body = SECTIONS.map(s => {
    const note = s.note ? `<p class="num-note">${esc(s.note)}</p>` : '';
    const rows = s.rows.map(r => rowHTML(r[0], r[1], r[2])).join('');
    return `<h4 class="num-h">${esc(s.title)}</h4>${note}<ul class="phrase-list">${rows}</ul>`;
  }).join('');
  host.innerHTML = `<section class="acc num-acc" data-acc="numbers">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-numbers" aria-label="Numbers, money and counters">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Numbers, money &amp; counters</span>
    </button>
    <div class="acc-panel" id="acc-panel-numbers" role="region" aria-label="Numbers, money and counters">
      <div class="acc-inner">${body}<p class="num-bignote">${esc(BIG_NOTE)}</p></div>
    </div>
  </section>`;
  if (SPK) host.querySelectorAll('.phrase-spk').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  mountAccordion(host);
}
