'use strict';
// #/study — the Grammar Gym session runner (R2 MVP). A bounded, scheduled, machine-graded
// review session over the baked JLPT grammar corpus, driven by the pure R1 engine
// (lib/study.js) and the pure R2 cloze/answer generators (lib/questions.js). This module owns
// ONLY the UI + persistence wiring — no scheduling maths live here.
//
// R3 grows the Coursera face BESIDE the untouched R2 session runner: the course home (the new
// #/study landing — five level cards with progress rings → unit accordion), ONE priority-ordered
// ▶ Continue button, the exam-priority lever, and the entry points into the lazy `study-lessons.js`
// flows (3-beat lessons, placement sweep, test-out). The R2 typed-cloze session below is
// unchanged — Continue state 3 launches it exactly as before.
// Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R2 + R3).
//
// Conventions honoured here (binding): keyboard scoped to the study root with a BUTTON/INPUT
// guard; root carries data-no-swipe; the live region is a STATIC sibling (#stuLive) of the
// innerHTML-rebuilt root; focus restored after every rebuild; every dynamic string through
// esc(); ruby via rubyHTML; token spans use .stok, NEVER .jp.

import { $, esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { get, set, getRaw, KEYS } from './lib/store.js';
import { readingOf } from './lib/grammar.js';
import { newState, migrate, seedImport, buildQueue, sessionStart, sessionRecord, sessionEnd, review, effectiveGrade, lessonOrder, unitProgress, stageOf } from './lib/study.js';
import { clozeFor, checkAnswer, scramblable, scrambleFor } from './lib/questions.js';
import { pegHTML } from './lib/peg.js';
import { scrambleCard } from './study-scramble.js';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const FILES = { N5: 'data/grammar-n5.json', N4: 'data/grammar-n4.json', N3: 'data/grammar-n3.json', N2: 'data/grammar-n2.json', N1: 'data/grammar-n1.json' };
const UNITS_FILE = 'data/grammar-units.json';
const EXAM_LEVELS = [['', 'Not preparing'], ['N3', 'N3 · Dec 2026'], ['N2', 'N2 · Jul 2027'], ['N1', 'N1 · Jul 2027']];
const DAY = 86400000;

let state = null;                 // the store record (lib/study.js shape)
let units = [];                   // grammar-units.json — the R3 unit map (fetched once)
const pointsCache = {};           // id → point data (examples etc.), filled by fetched levels
const levelFetched = {};          // level → true once its file is loaded
let root = null;
let card = null;                  // { id, exIdx, point, type, ... } for the live card
let cardCtl = null;               // active ★-scramble sub-controller (study-scramble.js) while a scramble card shows
let phase = 'idle';               // 'input' | 'close' | 'graded' | 'wrong' | 'scramble'
let activeFlow = null;            // a study-lessons.js controller { onAct, onKey, teardown } while a lesson/placement/test-out flow runs
const expandedLevels = new Set(); // course-home accordion: which level cards are open

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
  await loadUnits();
  // Land on the course home. Its ▶ Continue button resolves to the right next action (resume /
  // placement / due session / next lesson / caught-up). Prefetch the in-flight queue's levels so
  // a resumed session's synchronous renderCard has its point data ready.
  renderCourseHome();
  if (state.session && state.session.queue.length) {
    await ensureLevelsFor(state.session.queue);
  }
}

function save() { set(KEYS.study, state); }

// ── units (the R3 course/syllabus map — one small file, SWR-cached like the grammar files) ──
async function loadUnits() {
  if (units.length) return;
  try {
    const r = await fetch(UNITS_FILE);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const u = await r.json();
    if (Array.isArray(u)) units = u;
  } catch (err) {
    units = [];   // course home degrades to the Continue button + a note if units can't load
    console.error('[study] load units', err);
  }
}

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

// ── Course home (the #/study landing) ────────────────────────────────────────
// The Coursera syllabus: five level cards (progress ring + unit count), each expanding to a unit
// accordion, over ONE priority-ordered ▶ Continue button + the exam-priority lever.
// NOTE: ✓★ gold (checkpoint-passed) decoration arrives with R8; R3 shows the plain
// ○ untouched / ● in-progress / ✓ done ladder from unitProgress().
const GLYPH = { done: '✓', inprogress: '●', untouched: '○' };

function relatedMap() {
  const m = {};
  for (const id in pointsCache) { const r = pointsCache[id] && pointsCache[id].related; if (Array.isArray(r)) m[id] = r; }
  return m;
}
function lessonIds() {
  return lessonOrder(units, state.points, { examLevel: state.settings.examLevel || null, related: relatedMap() });
}
function unitOf(id) { return units.find(u => u.points.includes(id)) || null; }

// The ▶ Continue state machine, in strict priority order.
function continueState() {
  const now = Date.now();
  const s = state.session;
  if (s && s.queue && s.queue.length && s.pos < s.queue.length) return { kind: 'session', pos: s.pos, total: s.queue.length };
  const placedEmpty = !(state.settings.placed && state.settings.placed.length);
  const noPoints = Object.keys(state.points).length === 0;
  if (placedEmpty && noPoints) return { kind: 'placement' };
  const q = buildQueue(state, now);
  if (q.reviews.length) return { kind: 'due', due: q.reviews.length };
  const ids = lessonIds();
  if (ids.length && q.lessons > 0) {
    const u = unitOf(ids[0]);
    return { kind: 'lessons', n: Math.min(q.lessons, ids.length), title: u ? u.title : '' };
  }
  return { kind: 'caught-up' };
}

function continueButtonHTML(cs) {
  switch (cs.kind) {
    case 'session': return `<button type="button" class="stu-btn stu-btn-primary stu-cont" data-act="continue">▶ Continue session — ${esc(String(cs.pos + 1))}/${esc(String(cs.total))}</button>`;
    case 'placement': return `<button type="button" class="stu-btn stu-btn-primary stu-cont" data-act="placementStart">▶ Start placement</button>`;
    case 'due': return `<button type="button" class="stu-btn stu-btn-primary stu-cont" data-act="start">▶ Start today's session — ${esc(String(cs.due))} due</button>`;
    case 'lessons': return `<button type="button" class="stu-btn stu-btn-primary stu-cont" data-act="learn">▶ Learn next: ${esc(cs.title)} <span class="stu-cont-sub">(${esc(String(cs.n))} new)</span></button>`;
    default: return `<button type="button" class="stu-btn stu-btn-primary stu-cont" data-act="start" disabled>✓ All caught up — nothing due</button>`;
  }
}

function ringHTML(introduced, total) {
  const pct = total ? Math.round(introduced / total * 100) : 0;
  const C = 2 * Math.PI * 15.5;   // r=15.5
  const off = C * (1 - pct / 100);
  return `<span class="stu-ring" role="img" aria-label="${esc(String(pct))}% introduced">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="stu-ring-bg" cx="18" cy="18" r="15.5"/>
    <circle class="stu-ring-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
    <span class="stu-ring-pct">${esc(String(pct))}%</span></span>`;
}

function levelCardHTML(level) {
  const lus = units.filter(u => u.level === level);
  let intro = 0, total = 0;
  for (const u of lus) { const pr = unitProgress(u, state.points); intro += pr.introduced; total += pr.total; }
  const open = expandedLevels.has(level);
  const rows = open ? lus.map(u => {
    const pr = unitProgress(u, state.points);
    const pct = pr.total ? Math.round(pr.introduced / pr.total * 100) : 0;
    return `<div class="stu-unit stu-unit-${esc(pr.state)}">
      <span class="stu-unit-glyph" aria-hidden="true">${GLYPH[pr.state]}</span>
      <span class="stu-unit-title">${esc(u.title)}</span>
      <span class="stu-unit-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <span class="stu-unit-n">${esc(String(pr.introduced))}/${esc(String(pr.total))}</span></div>`;
  }).join('') : '';
  return `<div class="stu-lvl-card${open ? ' is-open' : ''}">
    <button type="button" class="stu-lvl-head" data-act="expand" data-level="${esc(level)}" aria-expanded="${open ? 'true' : 'false'}">
      ${ringHTML(intro, total)}
      <span class="stu-lvl-name">${esc(level)}</span>
      <span class="stu-lvl-meta">${esc(String(lus.length))} units · ${esc(String(intro))}/${esc(String(total))} introduced</span>
      <span class="stu-lvl-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
    </button>
    ${open ? `<div class="stu-unit-list">${rows}</div>` : ''}</div>`;
}

function renderCourseHome(focusSel) {
  phase = 'idle'; card = null; cardCtl = null; activeFlow = null;
  const cs = continueState();
  const examVal = state.settings.examLevel || '';
  const examOpts = EXAM_LEVELS.map(([v, l]) => `<option value="${esc(v)}"${v === examVal ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const cards = units.length ? LEVELS.map(levelCardHTML).join('')
    : `<p class="stu-note">Course map unavailable offline — your ▶ Continue button still works.</p>`;
  root.innerHTML = `
    <div class="stu-home">
      <div class="stu-cont-wrap">${continueButtonHTML(cs)}</div>
      <div class="stu-home-cards">${cards}</div>
      <div class="stu-home-foot">
        <button type="button" class="stu-btn stu-btn-ghost stu-pl-btn" data-act="placementStart">Placement sweep</button>
        <label class="stu-exam"><span>Preparing for</span>
          <select class="stu-exam-sel" data-act="exam" aria-label="Exam you're preparing for">${examOpts}</select></label>
      </div>
    </div>`;
  const focusEl = (focusSel && root.querySelector(focusSel)) || root.querySelector('.stu-cont');
  if (focusEl && !focusEl.disabled) focusEl.focus({ preventScroll: true });
  else root.querySelector('.stu-cont')?.focus({ preventScroll: true });
  announceHome(cs);
}

function announceHome(cs) {
  const msg = {
    session: `Session in progress — ${cs.pos + 1} of ${cs.total}. Continue to resume.`,
    placement: 'Course home. Start placement to sort what you already know.',
    due: `Course home. ${cs.due} reviews due today.`,
    lessons: `Course home. Next lesson: ${cs.title}.`,
    'caught-up': 'Course home. All caught up — nothing due.',
  }[cs.kind];
  announce(msg || 'Course home.');
}

function toggleLevel(level) {
  if (expandedLevels.has(level)) expandedLevels.delete(level); else expandedLevels.add(level);
  renderCourseHome(`.stu-lvl-head[data-level="${level}"]`);
}

function setExamLevel(v) {
  const examLevel = v || null;
  state = { ...state, settings: { ...state.settings, examLevel } };
  save();
  renderCourseHome('.stu-exam-sel');
}

// ── flow launchers (lazy-import study-lessons.js; park the returned controller in activeFlow) ──
function flowCtx() {
  return {
    root, pointsCache, units,
    getState: () => state,
    commit: (ns) => { state = ns; save(); },
    announce, ensureLevelsFor,
    done: () => { activeFlow = null; renderCourseHome(); },
  };
}

let launching = false;   // re-entrancy guard: a fast double-tap must not spawn two flows

async function launchLessons() {
  if (launching || activeFlow) return;
  launching = true;
  try {
    // The prereq closure in lessonOrder needs the FULL related map — warm every level first
    // (SWR-cached after the first visit), or the exam lever could front-run a prerequisite.
    await ensureAllLevels();
    const ids = lessonIds();
    const q = buildQueue(state, Date.now());
    const take = Math.min(q.lessons || state.settings.newPerDay || 4, ids.length);
    const todays = ids.slice(0, take);
    if (!todays.length) { renderCourseHome(); return; }
    const m = await import('./study-lessons.js');
    activeFlow = m.startLessons(flowCtx(), todays);
  } catch (err) {
    console.error('lessons failed to load', err);
    renderCourseHome();
    announce('Could not load lessons — check your connection and try again.');
  } finally { launching = false; }
}

async function launchPlacement() {
  if (launching || activeFlow) return;
  launching = true;
  try {
    const placed = state.settings.placed || [];
    const un = LEVELS.filter(l => !placed.includes(l));
    const levels = un.length ? un : LEVELS.slice();   // all placed already → allow a re-sweep
    const m = await import('./study-lessons.js');
    activeFlow = m.startPlacement(flowCtx(), levels);
  } catch (err) {
    console.error('placement failed to load', err);
    renderCourseHome();
    announce('Could not load placement — check your connection and try again.');
  } finally { launching = false; }
}

async function ensureAllLevels() {
  await Promise.all(LEVELS.filter(l => !levelFetched[l]).map(loadLevel));
}

async function continueSession() {
  if (!state.session || !state.session.queue.length) { renderCourseHome(); return; }
  await ensureLevelsFor(state.session.queue);   // no-op if the mount prefetch already finished
  renderCard();
}

async function startSession() {
  const now = Date.now();
  // Interleaving / confusable co-scheduling ON (R4): warm every level first so the related map is
  // complete, then feed it to buildQueue — confusable siblings due within 2 days join this session.
  await ensureAllLevels();
  const q = buildQueue(state, now, { coSchedule: relatedMap() });
  if (!q.reviews.length) { renderCourseHome(); return; }
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
  // Format mix by stage (R4): young/mature/deep points alternate typed-cloze / ★-scramble day by
  // day; seed/sprout/ghost points stay cloze-only (fresh material is produced, not reassembled).
  const stage = p ? stageOf(p) : 'seed';
  const eligible = !(p && p.ghost) && (stage === 'young' || stage === 'mature' || stage === 'deep');
  if (eligible && scramblable(point) && (idHash(id) + Math.floor(Date.now() / DAY)) % 2 === 0) {
    const sIdx = scrambleFor(point, exIdx) ? exIdx : point.examples.findIndex((_, i) => scrambleFor(point, i));
    if (sIdx >= 0) return { id, exIdx: sIdx, point, type: 'scramble' };
  }
  const { blankedTokens, answers } = clozeFor(point, exIdx);
  if (!answers.length) return null;   // degenerate example with no p token — skip
  return { id, exIdx, point, type: 'cloze', blankedTokens, answers };
}

// small stable hash so the shown example is deterministic across a resume (no Math.random)
function idHash(id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function renderCard() {
  const s = state.session;
  if (!s || s.pos >= s.queue.length) { renderSummary(); return; }
  cardCtl = null;
  card = buildCard();
  if (!card) {                       // unrenderable — advance without touching the schedule
    state = sessionRecord(state, { id: s.queue[s.pos], skipped: true });
    save();
    renderCard();
    return;
  }
  if (card.type === 'scramble') { renderScrambleCard(); return; }
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

// ── ★-scramble card (R4) ─────────────────────────────────────────────────────
// The second card type: mounts the shared study-scramble.js sub-controller into the card shell and
// parks it in cardCtl (the delegated click/keydown handlers forward to it). On the learner's final
// action it calls back through onScrambleResult — the one place scheduling happens for this card.
function renderScrambleCard() {
  const s = state.session;
  const total = s.queue.length, n = s.pos + 1;
  phase = 'scramble';
  root.innerHTML = `
    <div class="stu-card stu-card-scramble">
      <div class="stu-prog"><span class="stu-prog-n">${esc(String(n))} / ${esc(String(total))}</span>
        <span class="stu-prog-bar" aria-hidden="true"><i style="width:${Math.round(n / total * 100)}%"></i></span></div>
      <p class="stu-lvl">${esc(card.point.level || '')} · <span lang="ja">${esc(card.point.pattern || '')}</span></p>
      <div id="stuScramHost"></div>
    </div>`;
  const hostEl = root.querySelector('#stuScramHost');
  cardCtl = scrambleCard({ announce }, hostEl, card.point, card.exIdx, { grade: true, onResult: onScrambleResult });
  announce(`Card ${n} of ${total}. ${card.point.pattern || ''} — arrange the pieces to build the sentence.`);
}

// Correct order → the learner's Hard/Good/Easy; wrong order → Again (typedCorrect:false → grade 1).
function onScrambleResult({ pass, chosen }) {
  const eff = effectiveGrade({ typedCorrect: pass, chosen: chosen || 3 });
  const now = Date.now();
  state = review(state, card.id, { pass: eff > 1, grade: eff, exampleIdx: card.exIdx, mode: 'review' }, now);
  state = sessionRecord(state, { id: card.id, grade: eff, ok: pass });
  save();
  cardCtl = null;
  renderCard();
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
  // The anime peg lands ONLY here — post-answer, once the sentence is revealed (never during the
  // input phase, per teaching model item 9: it contains the pattern verbatim).
  const peg = pegHTML(card.point);
  if (next === 'graded') {
    phase = 'graded';
    card.closeAccepted = !!opts.closeAccepted;
    if (fb) fb.innerHTML = (card.closeAccepted
      ? `<span class="stu-fb-close">Accepted — capped at Hard. How did it feel?</span>`
      : `<span class="stu-fb-ok">Correct — how did it feel?</span>`) + peg;
    setControls('graded');
    focusControl('.stu-good');
    announce(card.closeAccepted ? 'Accepted, capped at Hard. Choose Hard, Good or Easy.' : 'Correct. Choose Hard, Good or Easy.');
  } else {
    phase = 'wrong';
    if (fb) fb.innerHTML = `<span class="stu-fb-wrong">Not quite — the answer is <b lang="ja">${esc(card.answers[0])}</b>.</span>` + peg;
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
  cardCtl = null;
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
    if (b) {
      if (b.tagName === 'SELECT') return;          // <select> handled by the change listener below
      if (activeFlow) { activeFlow.onAct(b.dataset.act, b); return; }   // a lesson/placement/test-out owns its buttons
      if (cardCtl) { cardCtl.onAct(b.dataset.act, b); return; }         // a live ★-scramble card owns its tiles/slots/grade
      act(b.dataset.act, b); return;
    }
    const tapR = e.target.closest('.stu-tap-r'); if (tapR) { primaryAction(); return; }
    const tapL = e.target.closest('.stu-tap-l'); if (tapL) { secondaryAction(); }
  });

  // exam-priority lever (a <select> — not a click/data-act)
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('.stu-exam-sel'); if (sel) setExamLevel(sel.value);
  });

  // keyboard: scoped to the study root only, with a phase-aware dispatch. The typed input owns
  // Enter during the input phase; grade/close keys act in their phases. BUTTON default keys
  // (Enter/Space on a focused control) fall through to native activation to avoid double-fire.
  root.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;   // don't fight an IME (matches gestures.js)
    if (activeFlow) { activeFlow.onKey(e); return; }   // active lesson/placement/test-out owns keys
    if (cardCtl) { cardCtl.onKey(e); return; }         // a live ★-scramble card owns its keys
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

  // repaint furigana toggle if it changes elsewhere; stop a test-out's soft timer if the user
  // navigates away mid-flow (display-only, but don't leave an interval running off-screen).
  document.addEventListener('jwh:route', (e) => {
    if (e.detail?.route === 'study') { applyFuri(); return; }
    if (activeFlow && activeFlow.teardown) activeFlow.teardown();
  });
}

function act(name, btn) {
  switch (name) {
    case 'start': if (!btn.disabled) startSession(); break;
    case 'continue': continueSession(); break;
    case 'learn': launchLessons(); break;
    case 'placementStart': launchPlacement(); break;
    case 'expand': toggleLevel(btn.dataset.level); break;
    case 'check': submitAnswer(); break;
    case 'reveal': if (phase === 'input') reveal('wrong'); break;
    case 'accept': acceptClose(); break;
    case 'reject': rejectClose(); break;
    case 'grade': grade(parseInt(btn.dataset.g, 10)); break;
    case 'again': grade(1, { typedCorrect: false }); break;
    case 'done': renderCourseHome(); break;
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
