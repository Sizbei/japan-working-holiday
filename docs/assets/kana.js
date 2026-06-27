'use strict';
// S10 — Kana reference chart (hiragana / katakana gojūon). Collapsible on the phrasebook page;
// toggle script, tap any kana to hear it. Cells stagger in the first time the chart is opened
// (reduce-motion gated). Reference data is standard/static, kept in-module.
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';
import { prefersReducedMotion } from './motion.js';

// rows of the gojūon: each cell [hiragana, katakana, romaji] or null for a gap
const ROWS = [
  [['あ','ア','a'],['い','イ','i'],['う','ウ','u'],['え','エ','e'],['お','オ','o']],
  [['か','カ','ka'],['き','キ','ki'],['く','ク','ku'],['け','ケ','ke'],['こ','コ','ko']],
  [['さ','サ','sa'],['し','シ','shi'],['す','ス','su'],['せ','セ','se'],['そ','ソ','so']],
  [['た','タ','ta'],['ち','チ','chi'],['つ','ツ','tsu'],['て','テ','te'],['と','ト','to']],
  [['な','ナ','na'],['に','ニ','ni'],['ぬ','ヌ','nu'],['ね','ネ','ne'],['の','ノ','no']],
  [['は','ハ','ha'],['ひ','ヒ','hi'],['ふ','フ','fu'],['へ','ヘ','he'],['ほ','ホ','ho']],
  [['ま','マ','ma'],['み','ミ','mi'],['む','ム','mu'],['め','メ','me'],['も','モ','mo']],
  [['や','ヤ','ya'],null,['ゆ','ユ','yu'],null,['よ','ヨ','yo']],
  [['ら','ラ','ra'],['り','リ','ri'],['る','ル','ru'],['れ','レ','re'],['ろ','ロ','ro']],
  [['わ','ワ','wa'],null,null,null,['を','ヲ','wo']],
  [['ん','ン','n'],null,null,null,null],
];
const SPK = canSpeak();
let script = 'hira';   // 'hira' | 'kata'
let revealed = false;

function gridHTML() {
  const cells = [];
  ROWS.forEach(row => row.forEach(c => {
    if (!c) { cells.push('<span class="kana-cell kana-gap" aria-hidden="true"></span>'); return; }
    const g = esc(script === 'kata' ? c[1] : c[0]);
    const tag = SPK ? 'button' : 'span';
    const attrs = SPK ? ` type="button" data-jp="${esc(c[0])}" aria-label="${esc(c[2])} — play"` : '';
    cells.push(`<${tag} class="kana-cell"${attrs}><span class="kana-glyph" lang="ja">${g}</span><span class="kana-romaji">${esc(c[2])}</span></${tag}>`);
  }));
  return `<div class="kana-grid">${cells.join('')}</div>`;
}

function paint(host) {
  const grid = host.querySelector('.kana-chart-body');
  if (!grid) return;
  grid.innerHTML = gridHTML();
  if (SPK) grid.querySelectorAll('.kana-cell[data-jp]').forEach(b =>
    b.addEventListener('click', () => speak(b.dataset.jp, b)));
}

function stagger(host) {
  if (revealed || prefersReducedMotion() || document.documentElement.dataset.reduceMotion === 'on') return;
  if (typeof Element.prototype.animate !== 'function') return;
  revealed = true;
  [...host.querySelectorAll('.kana-cell:not(.kana-gap)')].slice(0, 50).forEach((el, i) =>
    el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 220, delay: Math.min(i, 25) * 18, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
}

export function mountKana() {
  const host = $('#kanaChart');
  if (!host) return;
  host.innerHTML = `<section class="acc kana-acc" data-acc="kana">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-kana" aria-label="Kana chart">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Kana chart · hiragana &amp; katakana</span>
    </button>
    <div class="acc-panel" id="acc-panel-kana" role="region" aria-label="Kana chart">
      <div class="acc-inner">
        <div class="kana-switch" role="group" aria-label="Script">
          <button type="button" class="kana-tab is-on" data-script="hira" aria-pressed="true">ひらがな</button>
          <button type="button" class="kana-tab" data-script="kata" aria-pressed="false">カタカナ</button>
        </div>
        <div class="kana-chart-body"></div>
      </div>
    </div>
  </section>`;
  paint(host);
  host.querySelectorAll('.kana-tab').forEach(t => t.addEventListener('click', () => {
    script = t.dataset.script;
    host.querySelectorAll('.kana-tab').forEach(x => {
      const on = x === t;
      x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    paint(host);
  }));
  // reveal the cells the first time the chart is expanded
  host.querySelector('.acc-head')?.addEventListener('click', () => setTimeout(() => stagger(host), 0));
  mountAccordion(host);
}
