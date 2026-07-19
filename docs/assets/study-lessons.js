'use strict';
// #/study — R3 learning surfaces that grow BESIDE the R2 session runner: the 3-beat lesson
// flow, the placement sweep, and the test-out runner. Lazy-imported by study.js only when a
// learn/placement/test-out flow starts, so the daily review path stays lean.
//
// Each flow is a "controller" { onAct(name, btn), onKey(e), teardown() } that study.js parks in
// its single delegated root click/keydown handlers (one wiring, per repo convention; the IME
// guard already sits above the delegation). A flow renders into the shared root, mutates the
// store through ctx.commit (which write-throughs), announces via the static #stuLive region, and
// calls ctx.done() to hand control back to the course home. Lessons are ephemeral: a reload
// restarts the CURRENT point's lesson (acceptable — no mid-lesson persistence), because the only
// durable effect is the first-encounter review() at the end of beat 3.
//
// Conventions honoured: every dynamic string through esc(); ruby via rubyHTML; token spans use
// .stok, NEVER .jp; focus restored after each rebuild; keyboard scoped to the study root.

import { esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { pegHTML, flagBadgesHTML } from './lib/peg.js';
import { clozeFor, checkAnswer, scrambleFor, mcqFor } from './lib/questions.js';
import { review, effectiveGrade, testOutResult, gateMode, checkpointQuestions, recordCheckpoint, hash } from './lib/study.js';
import { scrambleCard } from './study-scramble.js';
import { mcqCard } from './study-mcq.js';
import { celebrate } from './celebrate.js';
import { canSpeak, speak } from './speak.js';
import { blip } from './lib/audio.js';

const NEW_PER_DAY_FALLBACK = 4;
const TESTOUT_SECONDS = 20;   // soft display timer only — NO hard cutoff in R3

// ── shared render helpers ────────────────────────────────────────────────────
function tokensHTML(ja) {
  return (Array.isArray(ja) ? ja : []).map(tok => {
    if (typeof tok === 'string') return esc(tok);
    if (!tok || typeof tok !== 'object') return '';
    return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
  }).join('');
}
function clozeHTML(blankedTokens, revealed) {
  return blankedTokens.map(b => {
    if (b.blank) return revealed
      ? `<span class="stok stu-fill">${esc(b.fill || '')}</span>`
      : `<span class="stu-blank" aria-label="blank">＿＿</span>`;
    const tok = b.token;
    if (typeof tok === 'string') return esc(tok);
    return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
  }).join('');
}
function exampleEN(point, idx) { const ex = point.examples && point.examples[idx]; return (ex && ex.en) || ''; }
function focusIn(root, sel) { const el = root.querySelector(sel); if (el) el.focus({ preventScroll: true }); }

// ── editorial lesson chrome (the redesigned 3-beat card) ──────────────────────
// the 1-2-3 step rail: Learn → Spot it → Produce. Steps before `active` read done (✓).
const RAIL_STEPS = [[1, 'Learn'], [2, 'Spot it'], [3, 'Produce']];
function stepRailHTML(active) {
  return `<ol class="stu-rail" aria-label="Lesson steps">${RAIL_STEPS.map(([n, label]) => {
    const cls = n < active ? 'is-done' : n === active ? 'is-on' : '';
    const dot = n < active ? '✓' : String(n);
    return `<li class="stu-rail-step ${cls}"${n === active ? ' aria-current="step"' : ''}><span class="stu-rail-dot" aria-hidden="true">${dot}</span><span class="stu-rail-label">${esc(label)}</span></li>`;
  }).join('')}</ol>`;
}

// connection string → a visual formula (chips joined by + → / operators). Display-only.
// The chip(s) carrying the grammar pattern surface get .stu-chip-key (indigo fill) — simple
// heuristic: a chip shares ≥2 chars of the point's pattern (stripped of 〜/space). No match → plain.
function formulaHTML(conn, pattern) {
  if (!conn) return '';
  const key = pattern ? String(pattern).replace(/[〜～\s]/g, '') : '';
  const isKey = (pt) => {
    if (!key || key.length < 2) return false;
    const t = pt.replace(/\s/g, '');
    return t.length >= 2 && (key.includes(t) || t.includes(key));
  };
  const parts = String(conn).split(/\s*([+→/])\s*/).filter(s => s !== '' && s != null);
  const chips = parts.map(pt => /^[+→/]$/.test(pt)
    ? `<span class="stu-formula-op" aria-hidden="true">${esc(pt === '/' ? '／' : pt)}</span>`
    : `<span class="stu-chip${isKey(pt) ? ' stu-chip-key' : ''}" lang="ja">${esc(pt)}</span>`).join('');
  return `<div class="stu-formula" role="group" aria-label="How it connects">${chips}</div>`;
}

// an example sentence for the RULE card (beat 1), with the pattern highlighted. Anti-leak: NEVER the
// beat-3 cloze example (index 0). Only when the point has ≥2 examples — else the pattern reading
// (already shown + spoken) stands alone. Uses clozeFor to mark the pattern tokens in context.
function ruleExampleHTML(p) {
  const exs = Array.isArray(p.examples) ? p.examples : [];
  if (exs.length < 2) return '';
  const idx = exs.length - 1;                     // last example — never the beat-3 cloze (index 0)
  const { blankedTokens, answers } = clozeFor(p, idx);
  const ja = (blankedTokens && answers.length)
    ? blankedTokens.map(b => b.blank
        ? `<mark class="stu-eg-mark">${esc(b.fill || '')}</mark>`
        : (typeof b.token === 'string' ? esc(b.token) : `<span class="stok" lang="ja">${rubyHTML(b.token.f, b.token.t)}</span>`)).join('')
    : tokensHTML(exs[idx].ja);
  const en = exampleEN(p, idx);
  return `<figure class="stu-eg"><p class="stu-eg-ja" lang="ja">${ja}</p>${en ? `<figcaption class="stu-eg-en">${esc(en)}</figcaption>` : ''}</figure>`;
}

// nuance / register / watch-out as distinct notes (not a flat dl). Meaning→gloss, connection→formula
// are surfaced separately on the rule card.
function notesHTML(p) {
  const items = [];
  if (p.nuance) items.push(['◆', 'Nuance', p.nuance, '']);
  if (p.register) items.push(['◈', 'Register', p.register, '']);
  if (p.caution) items.push(['⚠', 'Watch out', p.caution, 'stu-note-warn']);
  if (!items.length) return '';
  return `<div class="stu-notes">${items.map(([ic, label, body, cls]) =>
    `<div class="stu-note-item ${cls}"><span class="stu-note-ic" aria-hidden="true">${ic}</span><p class="stu-note-bd"><b>${esc(label)}</b>${esc(body)}</p></div>`).join('')}</div>`;
}

// pick another same-level point's example sentence as a recognition distractor
function pickDistractor(pointsCache, level, excludeId) {
  const pool = Object.values(pointsCache).filter(p =>
    p && p.level === level && p.id !== excludeId && Array.isArray(p.examples) && p.examples.length);
  if (!pool.length) return null;
  const p = pool[Math.floor(Math.random() * pool.length)];
  const idx = Math.floor(Math.random() * p.examples.length);
  return { point: p, idx };
}

// ── a reusable typed-cloze mini-card (used by beat 3 and by test-out) ─────────
// Renders one blanked example + input + Check, then feedback + Continue. Reports
// { pass, closeAccepted } to onResult on Continue. `timer` shows a soft countdown (no cutoff).
// Returns a small handle { onAct, onKey } the flow forwards its delegated events to.
function clozeCard(ctx, host, point, exIdx, { timer = false, onResult }) {
  const { blankedTokens, answers } = clozeFor(point, exIdx);
  let step = 'input';                 // 'input' | 'close' | 'done'
  let result = null;                  // { pass, closeAccepted }
  let ticker = 0, left = TESTOUT_SECONDS;

  const timerHTML = () => timer
    ? `<span class="stu-timer" id="stuTimer" aria-hidden="true">${left}s</span>` : '';

  function paint() {
    host.innerHTML = `
      <p class="stu-sentence" lang="ja">${clozeHTML(blankedTokens, false)}</p>
      <div class="stu-answer">
        <input type="text" class="stu-input" id="stuInput" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Type the missing grammar in kana">
        ${timerHTML()}
      </div>
      <div class="stu-feedback" id="stuFeedback" aria-live="off"></div>
      <div class="stu-controls" id="stuControls">
        <button type="button" class="stu-btn stu-btn-primary" data-act="check">Check ⏎</button>
      </div>`;
    focusIn(host, '#stuInput');
    if (timer) startTicker();
  }
  function startTicker() {
    stopTicker();
    ticker = setInterval(() => {
      left = Math.max(0, left - 1);
      const el = host.querySelector('#stuTimer');
      if (el) { el.textContent = left + 's'; if (left === 0) el.classList.add('stu-timer-up'); }
      if (left === 0) stopTicker();       // soft: display stops, answering still allowed
    }, 1000);
  }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = 0; } }

  function revealAnswer(fbHTML) {
    stopTicker();
    const sent = host.querySelector('.stu-sentence');
    if (sent) sent.innerHTML = clozeHTML(blankedTokens, true);
    const inp = host.querySelector('#stuInput'); if (inp) inp.disabled = true;
    const fb = host.querySelector('#stuFeedback'); if (fb) fb.innerHTML = fbHTML;
    const c = host.querySelector('#stuControls');
    if (c) c.innerHTML = `<button type="button" class="stu-btn stu-btn-primary" data-act="next">Continue ⏎</button>`;
    focusIn(host, '.stu-btn-primary');
  }

  function submit() {
    if (step !== 'input') return;
    const inp = host.querySelector('#stuInput');
    const val = inp ? inp.value : '';
    if (!String(val).trim()) return;
    const res = checkAnswer(val, answers);
    if (res.ok) { result = { pass: true, closeAccepted: false }; step = 'done'; revealAnswer(`<span class="stu-fb-ok">Correct.</span>`); ctx.announce('Correct.'); return; }
    if (res.close) {
      step = 'close';
      const c = host.querySelector('#stuControls');
      if (c) c.innerHTML = `
        <button type="button" class="stu-btn stu-btn-ghost" data-act="reject">No (esc)</button>
        <button type="button" class="stu-btn stu-btn-primary" data-act="accept">Take it (⏎)</button>`;
      const fb = host.querySelector('#stuFeedback'); if (fb) fb.innerHTML = `<span class="stu-fb-close">Close — take it?</span>`;
      focusIn(host, '.stu-btn-primary');
      ctx.announce('Close match — take it? Enter to accept, escape to reveal.');
      return;
    }
    result = { pass: false, closeAccepted: false }; step = 'done';
    revealAnswer(`<span class="stu-fb-wrong">Not quite — the answer is <b lang="ja">${esc(answers[0] || '')}</b>.</span>`);
    ctx.announce(`Not quite. The answer is ${answers[0] || ''}.`);
  }
  function accept() { if (step !== 'close') return; result = { pass: true, closeAccepted: true }; step = 'done'; revealAnswer(`<span class="stu-fb-close">Accepted.</span>`); ctx.announce('Accepted.'); }
  function reject() { if (step !== 'close') return; result = { pass: false, closeAccepted: false }; step = 'done'; revealAnswer(`<span class="stu-fb-wrong">The answer is <b lang="ja">${esc(answers[0] || '')}</b>.</span>`); ctx.announce(`The answer is ${answers[0] || ''}.`); }

  paint();
  return {
    teardown: stopTicker,
    onAct(name) {
      if (name === 'check') submit();
      else if (name === 'accept') accept();
      else if (name === 'reject') reject();
      else if (name === 'next' && step === 'done') { stopTicker(); onResult(result); }
    },
    onKey(e) {
      if (step === 'input') { if (e.key === 'Enter') { e.preventDefault(); submit(); } return; }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON')) {
        if (step === 'close' && e.key === 'Escape') { e.preventDefault(); reject(); }
        return;   // let a focused button activate natively; input owns nothing past input step
      }
      if (step === 'close') { if (e.key === 'Enter') { e.preventDefault(); accept(); } else if (e.key === 'Escape') { e.preventDefault(); reject(); } }
      else if (step === 'done') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stopTicker(); onResult(result); } }
    },
  };
}

// ── Flow 1: the 3-beat lesson ─────────────────────────────────────────────────
// beat 1 rule card → beat 2 two guided-recognition taps → beat 3 one typed cloze → review()
// first-encounter (grade from the cloze) so the point enters the scheduler (Seed or Sprout, by first grade).
export function startLessons(ctx, ids) {
  const { root, pointsCache } = ctx;
  const queue = ids.slice();
  let i = 0;                          // which point
  let beat = 1;
  let sub = null;                     // active clozeCard handle (beat 3)
  let mcRound = 0, mcData = null;     // beat 2 state

  function point() { return pointsCache[queue[i]]; }

  function render() {
    sub = null;
    const p = point();
    if (!p) { finish(); return; }
    if (beat === 1) renderRule(p);
    else if (beat === 2) renderMC(p);
    else renderCloze(p);
  }

  function renderRule(p) {
    root.innerHTML = `
      <div class="stu-lesson stu-rule-card">
        ${stepRailHTML(1)}
        <div class="stu-lesson-meta"><span class="stu-lesson-tag" lang="ja">新しい文法 · point ${esc(String(i + 1))} of ${esc(String(queue.length))}</span><span class="stu-lesson-lvl">${esc(p.level || '')}</span></div>
        <p class="stu-pat" lang="ja">${esc(p.pattern || '')}${canSpeak() ? ` <button type="button" class="stu-speak stu-rule-speak" data-act="ruleSpeak" aria-label="Play the pattern">音</button>` : ''}</p>
        ${p.reading ? `<p class="stu-pat-read" lang="ja">${esc(p.reading)}</p>` : ''}
        ${p.meaning ? `<p class="stu-gloss">${esc(p.meaning)}</p>` : ''}
        ${formulaHTML(p.connection, p.pattern)}
        ${ruleExampleHTML(p)}
        ${flagBadgesHTML(p) ? `<p class="stu-flags">${flagBadgesHTML(p)}</p>` : ''}
        ${notesHTML(p)}
        ${pegHTML(p)}
        <div class="stu-controls"><button type="button" class="stu-btn stu-btn-primary" data-act="beat2">Got it — spot it →</button></div>
      </div>`;
    focusIn(root, '.stu-btn-primary');
    ctx.announce(`Lesson ${i + 1} of ${queue.length}. ${p.pattern || ''}. ${p.meaning || ''}`);
  }

  function renderMC(p) {
    const exIdx = mcRound % (p.examples.length || 1);
    const d = pickDistractor(pointsCache, p.level, p.id);
    if (!d) { beat = 3; render(); return; }               // no distractor available → skip to cloze
    const correctFirst = Math.random() < 0.5;
    const target = { html: tokensHTML(p.examples[exIdx].ja), correct: true };
    const other = { html: tokensHTML(d.point.examples[d.idx].ja), correct: false };
    const opts = correctFirst ? [target, other] : [other, target];
    mcData = { answered: false };
    root.innerHTML = `
      <div class="stu-lesson">
        ${stepRailHTML(2)}
        <div class="stu-lesson-meta"><span class="stu-lesson-tag" lang="ja">見つけよう · spot it ${esc(String(mcRound + 1))} of 2</span><span class="stu-lesson-lvl">${esc(p.level || '')}</span></div>
        <p class="stu-mc-q">Which one uses <b lang="ja">${esc(p.pattern || '')}</b>?</p>
        <div class="stu-mc" id="stuMC">
          ${opts.map((o, k) => `<button type="button" class="stu-mc-opt" data-act="mc" data-k="${k}" data-correct="${o.correct ? 1 : 0}"><span lang="ja">${o.html}</span></button>`).join('')}
        </div>
        <div class="stu-feedback" id="stuFeedback" aria-live="off"></div>
        <div class="stu-controls" id="stuControls" hidden><button type="button" class="stu-btn stu-btn-primary" data-act="mcNext">Continue ⏎</button></div>
      </div>`;
    focusIn(root, '.stu-mc-opt');
    ctx.announce(`Which sentence uses ${p.pattern || ''}? Two options.`);
  }

  function answerMC(btn) {
    if (!mcData || mcData.answered) return;
    mcData.answered = true;
    const correct = btn.dataset.correct === '1';
    root.querySelectorAll('.stu-mc-opt').forEach(o => {
      o.disabled = true;
      if (o.dataset.correct === '1') o.classList.add('stu-mc-right');
      else if (o === btn) o.classList.add('stu-mc-wrong');
    });
    const fb = root.querySelector('#stuFeedback');
    if (fb) fb.innerHTML = correct ? `<span class="stu-fb-ok">Yes — that's the one.</span>` : `<span class="stu-fb-wrong">Not that one — the highlighted sentence uses it.</span>`;
    const c = root.querySelector('#stuControls'); if (c) c.hidden = false;
    focusIn(root, '#stuControls .stu-btn-primary');
    ctx.announce(correct ? 'Correct.' : 'Not that one. The correct sentence is highlighted.');
  }
  function mcNext() {
    mcRound++;
    if (mcRound >= 2) { beat = 3; mcRound = 0; render(); }
    else renderMC(point());
  }

  function renderCloze(p) {
    const exIdx = 0;
    root.innerHTML = `
      <div class="stu-lesson">
        ${stepRailHTML(3)}
        <div class="stu-lesson-meta"><span class="stu-lesson-tag" lang="ja">書いてみよう · produce</span><span class="stu-lesson-lvl">${esc(p.level || '')}</span></div>
        <p class="stu-mc-q">Fill the blank — type <b lang="ja">${esc(p.pattern || '')}</b> in kana.</p>
        <div id="stuClozeHost"></div>
        <p class="stu-en" hidden>${esc(exampleEN(p, exIdx))}</p>
      </div>`;
    const host = root.querySelector('#stuClozeHost');
    sub = clozeCard(ctx, host, p, exIdx, {
      onResult(res) {
        root.querySelector('.stu-en')?.removeAttribute('hidden');
        const eff = effectiveGrade({ typedCorrect: res.pass, closeAccepted: res.closeAccepted, chosen: 3 });
        const st = review(ctx.getState(), p.id, { pass: res.pass, grade: eff, exampleIdx: exIdx, mode: 'review' }, Date.now());
        ctx.commit(st);                 // write-through: point now seeded at Seed
        next();
      },
    });
  }

  function next() { i++; beat = 1; if (i >= queue.length) finish(); else render(); }

  function finish() {
    sub = null;
    root.innerHTML = `
      <div class="stu-summary">
        <div class="stu-sum-art" aria-hidden="true">✦</div>
        <h3 class="stu-sum-h">${esc(String(queue.length))} new ${queue.length === 1 ? 'point' : 'points'} planted</h3>
        <p class="stu-note">They'll come back as reviews on their own schedule. Keep the streak going.</p>
        <button type="button" class="stu-btn stu-btn-primary" data-act="done">Done</button>
      </div>`;
    focusIn(root, '.stu-btn-primary');
    ctx.announce(`${queue.length} new points learned. They enter your review schedule now.`);
  }

  render();
  return {
    teardown() { if (sub && sub.teardown) sub.teardown(); },
    onAct(name, btn) {
      if (sub) { sub.onAct(name, btn); return; }
      if (name === 'ruleSpeak') { const p = point(); if (p) speak(p.reading || p.pattern || '', btn); }
      else if (name === 'beat2') { beat = 2; mcRound = 0; render(); }
      else if (name === 'mc') answerMC(btn);
      else if (name === 'mcNext') mcNext();
      else if (name === 'done') ctx.done();
    },
    onKey(e) {
      if (sub) { sub.onKey(e); return; }
      const t = e.target;
      if (t && t.tagName === 'BUTTON') return;   // focused buttons activate natively
      if ((beat === 1 || (beat === 2 && mcData && mcData.answered)) && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (beat === 1) { beat = 2; mcRound = 0; render(); } else mcNext();
      }
    },
  };
}

// ── Flow 2: the placement sweep ───────────────────────────────────────────────
// Per level N5→N1 (skipping levels already in settings.placed), a rapid triage list — each row
// tap-cycles know → unsure → skip. Points already in the store are shown pre-checked and
// uneditable (the ✓ seed already covers them). "Finish level" adds the level to settings.placed
// and queues the "know" points into the test-out runner (2 timed clozes each) before the next
// level. know → seeds via a passed test-out (Mature); unsure/skip → left for normal lessons.
export function startPlacement(ctx, levels) {
  const { root, pointsCache } = ctx;
  const queue = levels.slice();       // levels to sweep, N5→N1
  let li = 0;
  let marks = {};                     // id → 'know' | 'unsure' | 'skip'
  let sub = null;                     // active test-out controller

  async function render() {
    sub = null;
    if (li >= queue.length) { finishAll(); return; }
    const level = queue[li];
    await ctx.ensureLevelsFor([level.toLowerCase() + '-x']);   // levelOf() keys off the prefix
    // single-level filter over pointsCache preserves file (pedagogical) insertion order
    const pts = Object.values(pointsCache).filter(p => p && p.level === level);
    const state = ctx.getState();
    marks = {};
    const rows = pts.map(p => {
      const known = !!state.points[p.id];
      const mk = known ? 'know' : (marks[p.id] || 'unsure');
      if (!known) marks[p.id] = 'unsure';
      return `<button type="button" class="stu-pl-row" data-act="pl" data-id="${esc(p.id)}" data-mark="${mk}" ${known ? 'disabled aria-disabled="true"' : ''}>
        <span class="stu-pl-mark" aria-hidden="true"></span><span class="sr-only stu-pl-state">${esc(known ? 'already learned' : mk)}</span>
        <span class="stu-pl-pat" lang="ja">${esc(p.pattern || '')}</span>
        <span class="stu-pl-mean">${esc(p.meaning || '')}</span></button>`;
    }).join('');
    root.innerHTML = `
      <div class="stu-placement">
        <div class="stu-lesson-top"><span class="stu-lesson-tag">Placement · ${esc(level)}</span><span class="stu-lvl">${esc(String(li + 1))}/${esc(String(queue.length))}</span></div>
        <p class="stu-note">Tap each point to sort it: <b>know</b> → <b>unsure</b> → <b>skip</b>. "Know" points get a quick 2-question test-out; already-learned points are pre-checked.</p>
        <div class="stu-pl-list">${rows}</div>
        <div class="stu-controls"><button type="button" class="stu-btn stu-btn-primary" data-act="plFinish">Finish ${esc(level)} →</button></div>
      </div>`;
    focusIn(root, '.stu-btn-primary');
    ctx.announce(`Placement for ${level}. ${pts.length} points. Tap to sort know, unsure or skip.`);
  }

  const CYCLE = { know: 'unsure', unsure: 'skip', skip: 'know' };
  function cycle(btn) {
    const id = btn.dataset.id;
    const next = CYCLE[marks[id] || 'unsure'];
    marks[id] = next;
    btn.dataset.mark = next;
    const st = btn.querySelector('.stu-pl-state');   // keep the accessible name in sync
    if (st) st.textContent = next;
    ctx.announce(`${btn.querySelector('.stu-pl-pat')?.textContent || ''} — ${next}`);
  }

  function finishLevel() {
    const level = queue[li];
    const state = ctx.getState();
    const known = Object.keys(marks).filter(id => marks[id] === 'know' && !state.points[id]);
    // mark the level placed immediately (idempotent even if the test-outs are interrupted)
    const placed = state.settings.placed.includes(level) ? state.settings.placed : [...state.settings.placed, level];
    ctx.commit({ ...state, settings: { ...state.settings, placed } });
    if (!known.length) { li++; render(); return; }
    sub = startTestOuts(ctx, known, { host: root, onDone() { sub = null; li++; render(); } });
  }

  function finishAll() {
    root.innerHTML = `
      <div class="stu-summary">
        <div class="stu-sum-art" aria-hidden="true">◉</div>
        <h3 class="stu-sum-h">Placement done</h3>
        <p class="stu-note">Everything you already knew is banked; the rest is queued as lessons. One session a day from here.</p>
        <button type="button" class="stu-btn stu-btn-primary" data-act="done">Done</button>
      </div>`;
    focusIn(root, '.stu-btn-primary');
    ctx.announce('Placement complete. Known points banked; the rest are queued as lessons.');
  }

  render();
  return {
    teardown() { if (sub && sub.teardown) sub.teardown(); },
    onAct(name, btn) {
      if (sub) { sub.onAct(name, btn); return; }
      if (name === 'pl') cycle(btn);
      else if (name === 'plFinish') finishLevel();
      else if (name === 'done') ctx.done();
    },
    onKey(e) { if (sub) sub.onKey(e); },
  };
}

// ── Flow 3: the test-out runner ───────────────────────────────────────────────
// For each queued id: 3 hint-free checks — 2 typed clozes on DISTINCT examples + 1 confusable
// 文法形式 MCQ (R8). ALL pass → testOutResult lands the point at Mature (~2-week due); any fail →
// the point is left unseeded, so it re-enters as a normal lesson.
// Modality follows the point's gate mode (lib/study.js gateMode) — N1 / `written-formal` points are
// the whole-test-out recognition case: ★-scramble where the example scrambles, else MCQ. An MCQ
// item that can't assemble (no confusables resolvable) degrades to a cloze.
function testOutItems(p) {
  const recog = gateMode(p, { level: p.level, flags: p.flags }) === 'recognition';
  if (recog) return [
    { type: scrambleFor(p, 0) ? 'scramble' : 'mcq', ex: 0 },
    { type: scrambleFor(p, 1) ? 'scramble' : 'mcq', ex: 1 },
    { type: 'mcq', ex: 0 },
  ];
  return [{ type: 'cloze', ex: 0 }, { type: 'cloze', ex: 1 }, { type: 'mcq', ex: 0 }];
}

export function startTestOuts(ctx, ids, { host, onDone } = {}) {
  const { root, pointsCache } = ctx;
  const container = host || root;
  const queue = ids.slice();
  let i = 0, cursor = 0, items = [], results = [];
  let sub = null;
  let passedCount = 0;

  const PROMPT = { cloze: 'Prove it — type', scramble: 'Prove it — build the sentence with', mcq: 'Prove it — pick the grammar for' };
  function renderShell(pattern, level, type) {
    container.innerHTML = `
      <div class="stu-testout">
        <div class="stu-lesson-top"><span class="stu-lesson-tag">Test-out · ${esc(String(i + 1))}/${esc(String(queue.length))}</span><span class="stu-lvl">${esc(level || '')}</span></div>
        <p class="stu-mc-q">${PROMPT[type] || PROMPT.cloze} <b lang="ja">${esc(pattern || '')}</b> (${esc(String(cursor + 1))} of ${esc(String(items.length))}).</p>
        <div id="stuClozeHost"></div>
      </div>`;
  }

  function startPoint() {
    const p = pointsCache[queue[i]];
    if (!p || !Array.isArray(p.examples) || p.examples.length < 2) { skipPoint(); return; }
    items = testOutItems(p); cursor = 0; results = [];
    renderItem();
  }

  function renderItem() {
    const p = pointsCache[queue[i]];
    let { type, ex } = items[cursor];
    let mcq = null;
    if (type === 'mcq') { mcq = mcqFor(p, pointsCache, ex); if (!mcq) type = 'cloze'; }   // degrade if unassemblable
    renderShell(p.pattern, p.level, type);
    const hostEl = container.querySelector('#stuClozeHost');
    const onResult = (res) => {
      results.push(!!res.pass);
      cursor++;
      if (cursor >= items.length) commitPoint();
      else renderItem();
    };
    const exJa = (p.examples[ex] && p.examples[ex].ja) || null;
    sub = type === 'scramble' ? scrambleCard(ctx, hostEl, p, ex, { grade: false, onResult })
      : type === 'mcq' ? mcqCard({ announce: ctx.announce }, hostEl, mcq, { grade: false, point: p, exampleJa: exJa, onResult })
      : clozeCard(ctx, hostEl, p, ex, { timer: true, onResult });
  }

  function commitPoint() {
    const p = pointsCache[queue[i]];
    const st = testOutResult(ctx.getState(), p.id, results, Date.now());
    if (results.every(Boolean)) { passedCount++; blip('coin'); }   // this point tested out
    ctx.commit(st);                    // pass → Mature; fail → unchanged (stays unseeded)
    advance();
  }
  function skipPoint() { advance(); }
  function advance() { i++; cursor = 0; items = []; results = []; if (i >= queue.length) finish(); else startPoint(); }

  function finish() {
    sub = null;
    container.innerHTML = `
      <div class="stu-summary">
        <div class="stu-sum-art" aria-hidden="true">✦</div>
        <h3 class="stu-sum-h">${esc(String(passedCount))}/${esc(String(queue.length))} tested out</h3>
        <p class="stu-note">Passed points are banked at two weeks out. Any you missed come back as lessons.</p>
        <button type="button" class="stu-btn stu-btn-primary" data-act="toDone">Continue ⏎</button>
      </div>`;
    focusIn(container, '.stu-btn-primary');
    ctx.announce(`${passedCount} of ${queue.length} tested out. The rest return as lessons.`);
  }

  startPoint();
  const controller = {
    teardown() { if (sub && sub.teardown) sub.teardown(); },
    onAct(name, btn) {
      if (name === 'toDone') { if (onDone) onDone(); else ctx.done(); return; }
      if (sub) sub.onAct(name, btn);
    },
    onKey(e) { if (sub) sub.onKey(e); },
  };
  return controller;
}

// ── Flow 4: the unit checkpoint (R8 — the Coursera module quiz) ───────────────
// A 10-question quiz (mcq/scramble/cloze mix, from lib/study.js checkpointQuestions) over ONE
// unit's points. ≥8/10 → ✓★ gold + celebrate(); below → the missed points are surfaced ("review
// these" — they're already in the SRS, so nothing is scheduled here) and a Retake is offered.
// FORMATIVE: pass or fail, this only writes the unit's checkpoint record via recordCheckpoint — it
// NEVER calls review()/testOutResult, so the SRS gate stays the only mastery truth. The quiz seed
// folds in the attempt count so a retake draws different items.
export function startCheckpoint(ctx, unit) {
  const { root, pointsCache } = ctx;
  const PASS = 8, TOTAL = 10;

  function attemptsSoFar() {
    const u = (ctx.getState().units || {})[unit.id];
    return (u && u.checkpoint && u.checkpoint.attempts) || 0;
  }

  let qs = [], qi = 0, correctN = 0, missed = [];
  let sub = null;

  function begin() {
    const seed = hash(unit.id + ':cp:' + attemptsSoFar()) || 1;
    qs = checkpointQuestions(unit, pointsCache, seed);
    qi = 0; correctN = 0; missed = [];
    if (!qs.length) { finish(); return; }
    renderQ();
  }

  function renderQ() {
    sub = null;
    const q = qs[qi];
    const p = pointsCache[q.id];
    if (!p || !Array.isArray(p.examples) || !p.examples.length) { onQ({ pass: false }); return; }
    let type = q.type, ex = Math.min(q.exampleIdx || 0, p.examples.length - 1);
    let mcq = null;
    if (type === 'mcq') { mcq = mcqFor(p, pointsCache, ex); if (!mcq) type = scrambleFor(p, ex) ? 'scramble' : 'cloze'; }
    if (type === 'scramble' && !scrambleFor(p, ex)) type = 'cloze';
    root.innerHTML = `
      <div class="stu-testout stu-checkpoint">
        <div class="stu-lesson-top"><span class="stu-lesson-tag">Checkpoint · ${esc(String(qi + 1))}/${esc(String(TOTAL))}</span><span class="stu-lvl">${esc(unit.level || '')}</span></div>
        <p class="stu-cp-unit">${esc(unit.title || '')}</p>
        <div class="stu-cp-bar" aria-hidden="true"><i style="width:${Math.round(qi / TOTAL * 100)}%"></i></div>
        <div id="stuClozeHost"></div>
      </div>`;
    const hostEl = root.querySelector('#stuClozeHost');
    const exJa = (p.examples[ex] && p.examples[ex].ja) || null;
    sub = type === 'mcq' ? mcqCard({ announce: ctx.announce }, hostEl, mcq, { grade: false, point: p, exampleJa: exJa, onResult: onQ })
      : type === 'scramble' ? scrambleCard(ctx, hostEl, p, ex, { grade: false, onResult: onQ })
      : clozeCard(ctx, hostEl, p, ex, { timer: false, onResult: onQ });
    ctx.announce(`Checkpoint question ${qi + 1} of ${TOTAL}.`);
  }

  function onQ(res) {
    if (res && res.pass) correctN++;
    else { const id = qs[qi] && qs[qi].id; if (id && !missed.includes(id)) missed.push(id); }
    qi++;
    if (qi >= qs.length) finish();
    else renderQ();
  }

  function finish() {
    sub = null;
    const passed = correctN >= PASS;
    ctx.commit(recordCheckpoint(ctx.getState(), unit.id, correctN, PASS));   // formative record only
    if (passed) celebrate(`Checkpoint passed — ${unit.title} ✓★`);   // celebrate() plays its own 1-up
    else blip('wrong');
    const missedHTML = (!passed && missed.length)
      ? `<div class="stu-cp-missed"><p class="stu-note">Review these — they'll come back on their normal schedule:</p>
           <ul class="stu-cp-missed-list">${missed.map(id => {
             const p = pointsCache[id];
             return `<li lang="ja">${esc(p ? p.pattern : id)}</li>`;
           }).join('')}</ul></div>` : '';
    const actions = passed
      ? `<button type="button" class="stu-btn stu-btn-primary" data-act="cpDone">Done ⏎</button>`
      : `<button type="button" class="stu-btn stu-btn-ghost" data-act="cpDone">Done</button>
         <button type="button" class="stu-btn stu-btn-primary" data-act="cpRetake">Retake ⏎</button>`;
    root.innerHTML = `
      <div class="stu-summary">
        <div class="stu-sum-art" aria-hidden="true">${passed ? '✓★' : '◉'}</div>
        <h3 class="stu-sum-h">${esc(String(correctN))}/${esc(String(TOTAL))} — ${passed ? 'checkpoint passed' : 'not yet'}</h3>
        <p class="stu-note">${passed ? `${esc(unit.title)} is gold. On to the next.` : `Need ${PASS} to pass. Give it another go when you're ready.`}</p>
        ${missedHTML}
        <div class="stu-controls">${actions}</div>
      </div>`;
    focusIn(root, '.stu-btn-primary');
    ctx.announce(`Checkpoint ${passed ? 'passed' : 'not passed'}. ${correctN} of ${TOTAL} correct.`);
  }

  begin();
  return {
    teardown() { if (sub && sub.teardown) sub.teardown(); },
    onAct(name, btn) {
      if (sub) { sub.onAct(name, btn); return; }
      if (name === 'cpDone') ctx.done();
      else if (name === 'cpRetake') begin();
    },
    onKey(e) {
      if (sub) { sub.onKey(e); return; }
      const t = e.target;
      if (t && t.tagName === 'BUTTON') return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const b = root.querySelector('.stu-controls .stu-btn-primary'); if (b) b.click(); }
    },
  };
}

export { NEW_PER_DAY_FALLBACK };
