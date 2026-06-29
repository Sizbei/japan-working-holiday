'use strict';
// S15 — Quiz / self-test. Multiple-choice over the phrasebook + vocab, either direction
// (JP→EN or EN→JP). Correct answers flash green + pulse, wrong shake red and reveal the answer.
// N24 — adaptive: per-item right/wrong is saved, weak/unseen items come up more often, and a
// "to review" count is shown. Collapsible on the phrasebook page. Feedback motion reduce-motion gated.
import { $, esc } from './lib/dom.js';
import { get, set, KEYS } from './lib/store.js';
import { mountAccordion } from './collapse.js';
import { rubyHTML } from './lib/furigana.js';
import { prefersReducedMotion } from './motion.js';

let POOL = [];
let dir = 'jp2en';   // 'jp2en' | 'en2jp'
let cur = null, score = 0, total = 0, answered = false;

const reduced = () => prefersReducedMotion() || document.documentElement.dataset.reduceMotion === 'on';

// --- N24 adaptive review: weight selection by how weak each item is ---
const keyOf = (it) => it.id || it.jp;
function loadStats() { return get(KEYS.quizStats, {}) || {}; }
function record(it, right) {
  const s = loadStats(); const k = keyOf(it);
  const e = s[k] || { right: 0, wrong: 0 };
  if (right) e.right++; else e.wrong++;
  s[k] = e; set(KEYS.quizStats, s);
}
function weightOf(it, stats) {
  const e = stats[keyOf(it)];
  if (!e) return 3;                          // never seen → surface it
  return Math.max(0.4, 3 - (e.right - e.wrong));   // more net-wrong → heavier
}
function weightedPick(stats) {
  const totalW = POOL.reduce((s, it) => s + weightOf(it, stats), 0);
  let r = Math.random() * totalW;
  for (const it of POOL) { r -= weightOf(it, stats); if (r <= 0) return it; }
  return POOL[POOL.length - 1];
}
function dueCount(stats) {
  return POOL.filter(it => { const e = stats[keyOf(it)]; return !e || e.wrong >= e.right; }).length;
}

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function pickDistractors(n, correct) {
  const others = POOL.filter(x => x !== correct && x.en !== correct.en && x.jp !== correct.jp);
  return shuffle(others).slice(0, n);
}

function promptHTML(it) {
  return dir === 'jp2en'
    ? `<span class="jp" lang="ja" data-word="${esc(it.jp)}">${rubyHTML(it.furi, it.jp)}</span>`
    : `<span class="quiz-en-prompt">${esc(it.en)}</span>`;
}
function optionHTML(it) {
  return dir === 'jp2en'
    ? esc(it.en)
    : `<span class="jp" lang="ja">${rubyHTML(it.furi, it.jp)}</span>`;
}

function render(body) {
  if (POOL.length < 4) { body.innerHTML = '<p class="quiz-empty">Not enough items to quiz.</p>'; return; }
  answered = false;
  const stats = loadStats();
  cur = weightedPick(stats);
  const opts = shuffle([cur, ...pickDistractors(3, cur)]);
  body.innerHTML = `
    <div class="quiz-bar">
      <div class="quiz-dir" role="group" aria-label="Quiz direction">
        <button type="button" class="quiz-tab${dir === 'jp2en' ? ' is-on' : ''}" data-dir="jp2en">JP → EN</button>
        <button type="button" class="quiz-tab${dir === 'en2jp' ? ' is-on' : ''}" data-dir="en2jp">EN → JP</button>
      </div>
      <span class="quiz-meta"><span class="quiz-due" title="unseen or more-wrong-than-right">${dueCount(stats)} to review</span><span class="quiz-score" aria-live="polite">${score} / ${total}</span></span>
    </div>
    <div class="quiz-q">${promptHTML(cur)}</div>
    <div class="quiz-opts">${opts.map(o =>
      `<button type="button" class="quiz-opt"${o === cur ? ' data-correct="1"' : ''}>${optionHTML(o)}</button>`).join('')}</div>
    <div class="quiz-feedback" aria-live="polite"></div>
    <button type="button" class="quiz-next" hidden>Next →</button>`;
  body.querySelectorAll('.quiz-tab').forEach(t => t.addEventListener('click', () => {
    dir = t.dataset.dir; render(body);
  }));
  body.querySelectorAll('.quiz-opt').forEach(b => b.addEventListener('click', () => choose(body, b)));
  body.querySelector('.quiz-next').addEventListener('click', () => render(body));
}

function choose(body, btn) {
  if (answered) return;
  answered = true; total++;
  const right = btn.dataset.correct === '1';   // explicit flag — robust even if two items share jp
  record(cur, right);                          // N24 — persist familiarity
  const due = body.querySelector('.quiz-due'); if (due) due.textContent = `${dueCount(loadStats())} to review`;
  body.querySelectorAll('.quiz-opt').forEach(b => { b.disabled = true; });
  if (right) {
    score++;
    btn.classList.add('quiz-right');
    if (!reduced()) btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    body.querySelector('.quiz-feedback').textContent = '正解 — correct!';
  } else {
    btn.classList.add('quiz-wrong');
    if (!reduced()) btn.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
       { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 380 });
    body.querySelectorAll('.quiz-opt').forEach(b => { if (b.dataset.correct === '1') b.classList.add('quiz-right'); });
    body.querySelector('.quiz-feedback').textContent = `Answer: ${dir === 'jp2en' ? cur.en : cur.jp}`;
  }
  body.querySelector('.quiz-score').textContent = `${score} / ${total}`;
  const next = body.querySelector('.quiz-next'); next.hidden = false; next.focus();
}

export function mountQuiz(data) {
  const host = $('#quizMode');
  if (!host) return;
  const phrases = Array.isArray(data && data.phrases) ? data.phrases : [];
  const vocab = Array.isArray(data && data.vocab) ? data.vocab : [];
  POOL = [...phrases, ...vocab].filter(x => x && x.jp && x.en);
  if (POOL.length < 4) { host.hidden = true; return; }
  host.innerHTML = `<section class="acc quiz-acc" data-acc="quiz">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-quiz" aria-label="Quiz yourself">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Quiz yourself</span>
    </button>
    <div class="acc-panel" id="acc-panel-quiz" role="region" aria-label="Quiz yourself">
      <div class="acc-inner"><div class="quiz-body"></div></div>
    </div>
  </section>`;
  render(host.querySelector('.quiz-body'));
  mountAccordion(host);
}
