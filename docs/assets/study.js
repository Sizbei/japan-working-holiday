'use strict';
// #/study — the Grammar Gym session runner (R2 MVP). A bounded, scheduled, machine-graded
// review session over the baked JLPT grammar corpus, driven by the pure R1 engine
// (lib/study.js) and the pure R2 cloze/answer generators (lib/questions.js). This module owns
// ONLY the UI + persistence wiring — no scheduling maths live here.
//
// R2 scope: typed-cloze cards on due points, per-answer write-through, mid-session resume.
// Lessons / course home / scramble / MCQ / gate mode / hints arrive in later rounds; this is
// the shell they grow inside. Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R2).
//
// Conventions honoured here (binding): keyboard scoped to the study root with a BUTTON/INPUT
// guard; root carries data-no-swipe; the live region is a STATIC sibling (#stuLive) of the
// innerHTML-rebuilt root; focus restored after every rebuild; every dynamic string through
// esc(); ruby via rubyHTML; token spans use .stok, NEVER .jp.

import { $, esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { get, set, getRaw, KEYS } from './lib/store.js';
import { readingOf } from './lib/grammar.js';
import { newState, migrate, seedImport, buildQueue, sessionStart, sessionRecord, sessionEnd, review, effectiveGrade } from './lib/study.js';
import { clozeFor, checkAnswer } from './lib/questions.js';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const FILES = { N5: 'data/grammar-n5.json', N4: 'data/grammar-n4.json', N3: 'data/grammar-n3.json', N2: 'data/grammar-n2.json', N1: 'data/grammar-n1.json' };
const DAY = 86400000;

let state = null;                 // the store record (lib/study.js shape)
const pointsCache = {};           // id → point data (examples etc.), filled by fetched levels
const levelFetched = {};          // level → true once its file is loaded
let root = null;
let card = null;                  // { id, exIdx, point, blankedTokens, answers } for the live card
let phase = 'idle';               // 'input' | 'close' | 'graded' | 'wrong'

// ── boot ───────────────────────────────────────────────────────────────────
export async function mountStudy() {
  root = $('#studyRoot');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';

  const now = Date.now();
  const stored = get(KEYS.study, null);
  if (stored) {
    state = migrate(stored);
  } else {                          // first run: seed from the grammar page's ✓/◆ marks
    const g = get(KEYS.grammar, null);
    const done = g && Array.isArray(g.done) ? g.done : [];
    const shaky = g && Array.isArray(g.shaky) ? g.shaky : [];
    state = seedImport(newState(now), { done, shaky }, now);
    save();
  }

  // a tab killed between the last grade and the summary leaves session.pos === queue.length;
  // close it here so resume never shows "46/45".
  if (state.session && state.session.pos >= (state.session.queue || []).length) {
    state = sessionEnd(state); save();
  }

  wireRoot();
  applyFuri();
  // Land on the Today screen; when a session is in flight it shows the "Continue session — n/N"
  // button. Prefetch the in-flight queue's levels up front so Continue (and every subsequent
  // synchronous renderCard) has its point data ready — a missing level must never make a card
  // silently skip.
  renderToday();
  if (state.session && state.session.queue.length) {
    await ensureLevelsFor(state.session.queue);
  }
}

function save() { set(KEYS.study, state); }

// ── data: lazy per-level fetch (same SWR-cached files the grammar page uses) ──
function levelOf(id) { const m = /^n([1-5])-/.exec(String(id || '')); return m ? 'N' + m[1] : null; }

async function ensureLevelsFor(ids) {
  const want = new Set();
  for (const id of ids) { const l = levelOf(id); if (l && FILES[l] && !levelFetched[l]) want.add(l); }
  await Promise.all([...want].map(loadLevel));
}

async function loadLevel(level) {
  if (levelFetched[level] || !FILES[level]) return;
  levelFetched[level] = true;
  try {
    const r = await fetch(FILES[level]);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const points = await r.json();
    if (Array.isArray(points)) for (const p of points) if (p && p.id) pointsCache[p.id] = p;
  } catch (err) {
    levelFetched[level] = false;   // allow a retry
    console.error('[study] load', level, err);
  }
}

// ── furigana (shared site preference — same string sentinel the grammar/phrases pages use) ──
function applyFuri() {
  const off = getRaw(KEYS.furi, '') === 'off';
  $('#study')?.classList.toggle('furi-off', off);
}

// ── Today screen ─────────────────────────────────────────────────────────────
function renderToday() {
  phase = 'idle'; card = null;
  const now = Date.now();
  const q = buildQueue(state, now);
  const due = q.reviews.length;
  const resuming = !!(state.session && state.session.queue.length);
  const pos = resuming ? state.session.pos : 0;
  const total = resuming ? state.session.queue.length : due;
  const primary = resuming
    ? `<button type="button" class="stu-btn stu-btn-primary" data-act="continue">Continue session — ${esc(String(pos + 1))}/${esc(String(total))}</button>`
    : (due
      ? `<button type="button" class="stu-btn stu-btn-primary" data-act="start">Start session — ${esc(String(due))} due</button>`
      : `<button type="button" class="stu-btn stu-btn-primary" data-act="start" disabled>Nothing due — mark points ✓ on the Grammar page to seed reviews</button>`);

  root.innerHTML = `
    <div class="stu-today">
      <h3 class="stu-today-h">Today's session</h3>
      <div class="stu-stats">
        <div class="stu-stat"><span class="stu-stat-n">${esc(String(due))}</span><span class="stu-stat-l">reviews due</span></div>
        <div class="stu-stat"><span class="stu-stat-n">${esc(String(q.lessons))}</span><span class="stu-stat-l">new lessons</span></div>
      </div>
      ${primary}
      <p class="stu-note">Typed-cloze review over your due grammar points. Guided lessons, scramble &amp; the mastery gate arrive in later updates.</p>
    </div>`;
  const btn = root.querySelector('.stu-btn-primary');
  if (btn && !btn.disabled) btn.focus({ preventScroll: true });
  announce(resuming
    ? `Session in progress — ${pos + 1} of ${total}`
    : (due ? `${due} reviews due today` : 'No reviews due — caught up'));
}

async function continueSession() {
  if (!state.session || !state.session.queue.length) { renderToday(); return; }
  await ensureLevelsFor(state.session.queue);   // no-op if the mount prefetch already finished
  renderCard();
}

async function startSession() {
  const now = Date.now();
  const q = buildQueue(state, now);
  if (!q.reviews.length) { renderToday(); return; }
  state = sessionStart(state, q);
  save();
  await ensureLevelsFor(state.session.queue);
  renderCard();
}

// ── Card screen ────────────────────────────────────────────────────────────────
// Derive the card for the current session position. Missing point data (e.g. a level that
// failed to fetch, or an id no longer in the corpus) is skipped by advancing the session
// position WITHOUT any review() call, so an unrenderable card never wedges the session and
// never touches the schedule.
function buildCard() {
  const s = state.session;
  const id = s.queue[s.pos];
  const point = pointsCache[id];
  if (!point || !Array.isArray(point.examples) || !point.examples.length) return null;
  const p = state.points[id];
  const exIdx = (((p && p.reps) || 0) + idHash(id)) % point.examples.length;
  const { blankedTokens, answers } = clozeFor(point, exIdx);
  if (!answers.length) return null;   // degenerate example with no p token — skip
  return { id, exIdx, point, blankedTokens, answers };
}

// small stable hash so the shown example is deterministic across a resume (no Math.random)
function idHash(id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function renderCard() {
  const s = state.session;
  if (!s || s.pos >= s.queue.length) { renderSummary(); return; }
  card = buildCard();
  if (!card) {                       // unrenderable — advance without touching the schedule
    state = sessionRecord(state, { id: s.queue[s.pos], skipped: true });
    save();
    renderCard();
    return;
  }
  phase = 'input';
  const sentence = renderSentence(card.blankedTokens, false);
  const total = s.queue.length, n = s.pos + 1;
  root.innerHTML = `
    <div class="stu-card">
      <div class="stu-prog"><span class="stu-prog-n">${esc(String(n))} / ${esc(String(total))}</span>
        <span class="stu-prog-bar" aria-hidden="true"><i style="width:${Math.round(n / total * 100)}%"></i></span></div>
      <p class="stu-lvl">${esc(card.point.level || '')} · <span lang="ja">${esc(card.point.pattern || '')}</span></p>
      <p class="stu-sentence" lang="ja">${sentence}</p>
      <p class="stu-en" hidden>${esc(exampleEN(card))}</p>
      <div class="stu-answer">
        <input type="text" class="stu-input" id="stuInput" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Type the missing grammar in kana">
      </div>
      <div class="stu-feedback" id="stuFeedback" aria-live="off"></div>
      <div class="stu-controls" id="stuControls">${controlsFor('input')}</div>
      <span class="stu-tap stu-tap-l" id="stuTapL" aria-hidden="true"></span>
      <span class="stu-tap stu-tap-r" id="stuTapR" aria-hidden="true"></span>
    </div>`;
  $('#stuInput')?.focus({ preventScroll: true });
  announce(`Card ${n} of ${total}. ${card.point.pattern || ''} — type the missing grammar.`);
}

// render the token list; `revealed` swaps the blanks for the highlighted answer pattern
function renderSentence(blankedTokens, revealed) {
  return blankedTokens.map(b => {
    if (b.blank) {
      return revealed
        ? `<span class="stok stu-fill">${esc(b.fill || card.answers[0] || '')}</span>`
        : `<span class="stu-blank" aria-label="blank">＿＿</span>`;
    }
    const tok = b.token;
    if (typeof tok === 'string') return esc(tok);
    return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
  }).join('');
}

function exampleEN(c) { const ex = c.point.examples[c.exIdx]; return (ex && ex.en) || ''; }

// per-phase control bar. Buttons carry data-act; the delegated click handler + the keyboard
// map both route through the same handlers.
function controlsFor(ph) {
  if (ph === 'input') return `
    <button type="button" class="stu-btn stu-btn-ghost" data-act="reveal">Don't know</button>
    <button type="button" class="stu-btn stu-btn-primary" data-act="check">Check ⏎</button>`;
  if (ph === 'close') return `
    <button type="button" class="stu-btn stu-btn-ghost" data-act="reject">No — reveal (esc)</button>
    <button type="button" class="stu-btn stu-btn-primary" data-act="accept">Take it (⏎)</button>`;
  if (ph === 'graded') return `
    <button type="button" class="stu-btn stu-grade" data-act="grade" data-g="2">Hard <kbd>2</kbd></button>
    <button type="button" class="stu-btn stu-grade stu-good" data-act="grade" data-g="3">Good <kbd>3</kbd></button>
    <button type="button" class="stu-btn stu-grade" data-act="grade" data-g="4">Easy <kbd>4</kbd></button>`;
  if (ph === 'wrong') return `
    <button type="button" class="stu-btn stu-btn-primary" data-act="again">Continue ⏎</button>`;
  return '';
}

// ── answer flow ──────────────────────────────────────────────────────────────
function submitAnswer() {
  if (phase !== 'input') return;
  const input = $('#stuInput');
  const val = input ? input.value : '';
  if (!String(val).trim()) return;                 // don't grade an empty box
  const res = checkAnswer(val, card.answers);
  card.answerSurface = card.answers[0];
  if (res.ok) { reveal('graded', { closeAccepted: false }); return; }
  if (res.close) {
    phase = 'close';
    const fb = $('#stuFeedback');
    if (fb) fb.innerHTML = `<span class="stu-fb-close">Close — take it?</span>`;
    setControls('close');
    focusControl('.stu-btn-primary');
    announce('Close match — take it? Enter to accept, escape to reveal.');
    return;
  }
  reveal('wrong');
}

// reveal the full sentence + EN; open either the grade buttons (correct / close-accept) or the
// Again continue (wrong).
function reveal(next, opts = {}) {
  const sentEl = root.querySelector('.stu-sentence');
  if (sentEl) sentEl.innerHTML = renderSentence(card.blankedTokens, true);
  root.querySelector('.stu-en')?.removeAttribute('hidden');
  const input = $('#stuInput');
  if (input) input.disabled = true;
  const fb = $('#stuFeedback');
  if (next === 'graded') {
    phase = 'graded';
    card.closeAccepted = !!opts.closeAccepted;
    if (fb) fb.innerHTML = card.closeAccepted
      ? `<span class="stu-fb-close">Accepted — capped at Hard. How did it feel?</span>`
      : `<span class="stu-fb-ok">Correct — how did it feel?</span>`;
    setControls('graded');
    focusControl('.stu-good');
    announce(card.closeAccepted ? 'Accepted, capped at Hard. Choose Hard, Good or Easy.' : 'Correct. Choose Hard, Good or Easy.');
  } else {
    phase = 'wrong';
    if (fb) fb.innerHTML = `<span class="stu-fb-wrong">Not quite — the answer is <b lang="ja">${esc(card.answers[0])}</b>.</span>`;
    setControls('wrong');
    focusControl('.stu-btn-primary');
    announce(`Not quite. The answer is ${card.answers[0]}.`);
  }
}

function acceptClose() { if (phase === 'close') reveal('graded', { closeAccepted: true }); }
function rejectClose() { if (phase === 'close') reveal('wrong'); }

function setControls(ph) { const c = $('#stuControls'); if (c) c.innerHTML = controlsFor(ph); }
function focusControl(sel) { const el = root.querySelector(sel); if (el) el.focus({ preventScroll: true }); }

// grade(g): apply the engine review with the arbitrated effective grade, WRITE THROUGH
// immediately, record the session result (display-only), advance. `typedCorrect:false` (the
// wrong path) forces Again regardless of g.
function grade(g, { typedCorrect = true } = {}) {
  if (phase !== 'graded' && phase !== 'wrong') return;
  const eff = effectiveGrade({ typedCorrect, closeAccepted: !!card.closeAccepted, chosen: g });
  const pass = eff > 1;
  const now = Date.now();
  state = review(state, card.id, { pass, grade: eff, exampleIdx: card.exIdx, mode: 'review' }, now);
  state = sessionRecord(state, { id: card.id, grade: eff, ok: typedCorrect });
  save();
  renderCard();
}

// ── Summary screen ───────────────────────────────────────────────────────────
function renderSummary() {
  const results = (state.session && state.session.results) || [];
  const graded = results.filter(r => !r.skipped);
  const n = graded.length;
  const okN = graded.filter(r => r.ok).length;
  const acc = n ? Math.round(okN / n * 100) : 0;
  state = sessionEnd(state);
  state = { ...state, lastSession: Date.now() };
  save();

  const now = Date.now();
  const nextDue = Object.values(state.points).filter(p => !p.suspended && p.due != null && p.due > now && p.due <= now + DAY).length;
  root.innerHTML = `
    <div class="stu-summary">
      <div class="stu-sum-art" aria-hidden="true">✓</div>
      <h3 class="stu-sum-h">Session complete</h3>
      <div class="stu-stats">
        <div class="stu-stat"><span class="stu-stat-n">${esc(String(n))}</span><span class="stu-stat-l">reviewed</span></div>
        <div class="stu-stat"><span class="stu-stat-n">${esc(String(acc))}%</span><span class="stu-stat-l">accuracy</span></div>
      </div>
      <p class="stu-note">${nextDue ? `${esc(String(nextDue))} due in the next 24 hours.` : 'Nothing else due in the next 24 hours.'}</p>
      <button type="button" class="stu-btn stu-btn-primary" data-act="done">Done</button>
    </div>`;
  root.querySelector('.stu-btn-primary')?.focus({ preventScroll: true });
  announce(`Session complete. ${n} reviewed, ${acc}% accuracy. ${nextDue} due in the next 24 hours.`);
}

// ── wiring (delegated once on the persistent root) ───────────────────────────
function wireRoot() {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) { act(b.dataset.act, b); return; }
    const tapR = e.target.closest('.stu-tap-r'); if (tapR) { primaryAction(); return; }
    const tapL = e.target.closest('.stu-tap-l'); if (tapL) { secondaryAction(); }
  });

  // keyboard: scoped to the study root only, with a phase-aware dispatch. The typed input owns
  // Enter during the input phase; grade/close keys act in their phases. BUTTON default keys
  // (Enter/Space on a focused control) fall through to native activation to avoid double-fire.
  root.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;   // don't fight an IME (matches gestures.js)
    const t = e.target;
    if (phase === 'input') {
      if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
      return;
    }
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (phase === 'close') {
      if (e.key === 'Enter') { if (t.tagName === 'BUTTON') return; e.preventDefault(); acceptClose(); }
      else if (e.key === 'Escape') { e.preventDefault(); rejectClose(); }
      return;
    }
    if (phase === 'graded') {
      if (e.key === '2') { e.preventDefault(); grade(2); }
      else if (e.key === '3') { e.preventDefault(); grade(3); }
      else if (e.key === '4') { e.preventDefault(); grade(4); }
      else if (e.key === 'Enter' && t.tagName !== 'BUTTON') { e.preventDefault(); grade(3); }
      return;
    }
    if (phase === 'wrong') {
      if ((e.key === 'Enter' || e.key === ' ')) { if (t.tagName === 'BUTTON') return; e.preventDefault(); grade(1, { typedCorrect: false }); }
    }
  });

  // repaint furigana toggle if it changes elsewhere on the site while this page is mounted
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'study') applyFuri(); });
}

function act(name, btn) {
  switch (name) {
    case 'start': if (!btn.disabled) startSession(); break;
    case 'continue': continueSession(); break;
    case 'check': submitAnswer(); break;
    case 'reveal': if (phase === 'input') reveal('wrong'); break;
    case 'accept': acceptClose(); break;
    case 'reject': rejectClose(); break;
    case 'grade': grade(parseInt(btn.dataset.g, 10)); break;
    case 'again': grade(1, { typedCorrect: false }); break;
    case 'done': renderToday(); break;
  }
}

// tap-zone actions map to the phase's primary / secondary control.
function primaryAction() {
  if (phase === 'input') submitAnswer();
  else if (phase === 'close') acceptClose();
  else if (phase === 'graded') grade(3);
  else if (phase === 'wrong') grade(1, { typedCorrect: false });
}
function secondaryAction() {
  // input phase: do nothing — a background tap (e.g. dismissing the keyboard) must never
  // reveal the answer and burn the card; giving up is the explicit Reveal button only.
  if (phase === 'close') rejectClose();
  else if (phase === 'graded') grade(2);
}

// ── live region (static #stuLive sibling in index.html) ──────────────────────
let liveTimer = 0;
function announce(msg) {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { const el = document.getElementById('stuLive'); if (el) el.textContent = msg; }, 200);
}
