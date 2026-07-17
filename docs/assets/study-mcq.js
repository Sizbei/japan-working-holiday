'use strict';
// #/study — the 文法形式 MCQ (4-choice) card. A shared sub-controller used by the R8 session runner
// (study.js, with grade buttons), the unit-checkpoint runner and the test-out runner
// (study-lessons.js, auto-graded). Given a generated `mcq` ({ stem, options, correct, en } from
// lib/questions.js `mcqFor`) it renders the blanked stem + 4 tappable option buttons; a selection
// checks immediately — correct → grade (or Continue in auto mode); wrong → highlight the picked
// wrong option AND the correct one, reveal, Again. The anime peg lands POST-answer only (teaching
// model item 9), same as the cloze/scramble cards.
//
// Interaction: options are real <button>s — Tab/arrows/Enter/Space are native; onKey only adds the
// numeric shortcuts (1–4 to pick, 2/3/4 to grade a correct answer). Every dynamic string through
// esc(); ruby via rubyHTML; token spans use .stok, NEVER .jp; focus restored after each rebuild.
//
// Conventions honoured: keyboard scoped to the study root (the caller forwards its delegated
// events here, above the IME guard); reports once, on the learner's final action.

import { esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { pegHTML } from './lib/peg.js';

// render the blanked stem tokens (clozeFor/mcqFor `stem` shape: { blank } | { token })
function stemHTML(stem) {
  return (Array.isArray(stem) ? stem : []).map(b => {
    if (b.blank) return `<span class="stu-blank stu-blank-mcq" aria-label="blank">＿＿</span>`;
    const tok = b.token;
    if (typeof tok === 'string') return esc(tok);
    if (!tok || typeof tok !== 'object') return '';
    return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
  }).join('');
}

// mcqCard(ctx, host, mcq, opts) → controller { teardown, onAct(name, btn), onKey(e) }.
// opts: { onResult({ pass, chosen }), grade:bool (Hard/Good/Easy on correct, else plain Continue),
// point (for the post-answer peg) }.
export function mcqCard(ctx, host, mcq, opts = {}) {
  const { onResult, grade = false, point = null } = opts;
  const announce = ctx.announce || (() => {});
  const options = (mcq && Array.isArray(mcq.options)) ? mcq.options : [];
  if (!mcq || options.length < 2 || typeof mcq.correct !== 'number') {
    if (typeof onResult === 'function') onResult({ pass: false });
    return { teardown() {}, onAct() {}, onKey() {} };
  }
  let step = 'choose';                 // 'choose' | 'graded' | 'wrong'
  let picked = -1, result = null;

  function paint() {
    const optHTML = options.map((o, k) => {
      const chosen = k === picked, right = k === mcq.correct;
      const cls = step === 'choose' ? '' :
        (right ? ' stu-mc-right' : (chosen ? ' stu-mc-wrong' : ''));
      return `<button type="button" class="stu-mc-opt${cls}" data-act="mcq" data-k="${k}"${step !== 'choose' ? ' disabled' : ''}>
          <span class="stu-mc-key" aria-hidden="true">${k + 1}</span><span lang="ja">${esc(o)}</span></button>`;
    }).join('');
    host.innerHTML = `
      <div class="stu-mcq">
        <p class="stu-mc-q">${esc(mcq.q || 'Which grammar fills the blank?')}</p>
        <p class="stu-sentence stu-mcq-stem" lang="ja">${stemHTML(mcq.stem)}</p>
        <p class="stu-en" hidden>${esc(mcq.en || '')}</p>
        <div class="stu-mc" id="stuMC" role="group" aria-label="Choices">${optHTML}</div>
        <div class="stu-feedback" id="stuFeedback" aria-live="off"></div>
        <div class="stu-controls" id="stuControls"></div>
      </div>`;
    const first = host.querySelector('.stu-mc-opt');
    if (step === 'choose' && first) first.focus({ preventScroll: true });
  }

  function choose(k) {
    if (step !== 'choose' || k < 0 || k >= options.length) return;
    picked = k;
    const ok = k === mcq.correct;
    result = { pass: ok };
    step = ok ? 'graded' : 'wrong';
    paint();
    host.querySelector('.stu-en')?.removeAttribute('hidden');
    const fb = host.querySelector('#stuFeedback');
    const c = host.querySelector('#stuControls');
    const answer = options[mcq.correct];
    if (ok) {
      if (fb) fb.innerHTML = `<span class="stu-fb-ok">Correct — <b lang="ja">${esc(answer)}</b>.</span>`;
      if (c) c.innerHTML = grade
        ? `<button type="button" class="stu-btn stu-grade" data-act="grade" data-g="2">Hard <kbd>2</kbd></button>
           <button type="button" class="stu-btn stu-grade stu-good" data-act="grade" data-g="3">Good <kbd>3</kbd></button>
           <button type="button" class="stu-btn stu-grade" data-act="grade" data-g="4">Easy <kbd>4</kbd></button>`
        : `<button type="button" class="stu-btn stu-btn-primary" data-act="next">Continue ⏎</button>`;
      announce(grade ? 'Correct. Choose Hard, Good or Easy.' : 'Correct.');
    } else {
      if (fb) fb.innerHTML = `<span class="stu-fb-wrong">Not quite — the answer is <b lang="ja">${esc(answer)}</b>.</span>`;
      if (c) c.innerHTML = `<button type="button" class="stu-btn stu-btn-primary" data-act="again">Continue ⏎</button>`;
      announce(`Not quite. The answer is ${answer}.`);
    }
    if (fb && point) fb.insertAdjacentHTML('beforeend', pegHTML(point));   // post-answer peg reward
    const btn = host.querySelector('#stuControls .stu-good, #stuControls .stu-btn-primary');
    if (btn) btn.focus({ preventScroll: true });
  }

  function finalize(chosen) {
    if (typeof onResult === 'function') onResult({ pass: !!(result && result.pass), chosen });
  }

  paint();
  return {
    teardown() {},
    onAct(name, btn) {
      if (name === 'mcq') choose(parseInt(btn.dataset.k, 10));
      else if (name === 'grade') { if (step === 'graded') finalize(parseInt(btn.dataset.g, 10)); }
      else if (name === 'again') { if (step === 'wrong') finalize(); }
      else if (name === 'next') { if (step === 'graded') finalize(); }
    },
    onKey(e) {
      if (step === 'choose') {
        // digits 1–N always pick — the option buttons are focusable (one is focused on paint), so we
        // do NOT gate on "a button is focused" here (that would block the shortcut entirely). Enter/
        // Space still native-activate the focused option; digits are the direct-pick accelerator.
        if (/^[1-9]$/.test(e.key)) {
          const k = parseInt(e.key, 10) - 1;
          if (k < options.length) { e.preventDefault(); choose(k); }
        }
        return;
      }
      if (step !== 'graded' || !grade) return;
      if (e.key === '2') { e.preventDefault(); finalize(2); }
      else if (e.key === '3') { e.preventDefault(); finalize(3); }
      else if (e.key === '4') { e.preventDefault(); finalize(4); }
    },
  };
}
