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
import { nowISO } from './lib/dates.js';
import { rubyHTML } from './lib/furigana.js';
import { get, set, getRaw, setRaw, KEYS } from './lib/store.js';
import { readingOf } from './lib/grammar.js';
import { canSpeak, speakExample, speakBtnHTML } from './speak.js';
import { blip } from './lib/audio.js';
import { newState, migrate, seedImport, buildQueue, sessionStart, sessionRecord, sessionEnd, review, effectiveGrade, lessonOrder, unitProgress, stageOf, gateMode, checkpointPassed, nextCheckpointUnit, leechList, ghostCount, unsuspend, recordSession, masteryStats, isMasterComplete, STAGES, LEVEL_TOTALS } from './lib/study.js';
import { clozeFor, checkAnswer, scramblable, scrambleFor, mcqFor } from './lib/questions.js';
import { pegHTML } from './lib/peg.js';
import { celebrate } from './celebrate.js';
import { confirmModal } from './lib/modal.js';
import { scrambleCard } from './study-scramble.js';
import { mcqCard } from './study-mcq.js';
import { isGateCard, buildGateCard, gateHeaderHTML, gatePasses, mountGateTimer, gateFeedback } from './study-gate.js';
import { resolveKey, shortcutsEnabled } from './lib/shortcuts.js';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const FILES = { N5: 'data/grammar-n5.json', N4: 'data/grammar-n4.json', N3: 'data/grammar-n3.json', N2: 'data/grammar-n2.json', N1: 'data/grammar-n1.json' };
const UNITS_FILE = 'data/grammar-units.json';
const EXAM_LEVELS = [['', 'Not preparing'], ['N3', 'N3 · Dec 2026'], ['N2', 'N2 · Jul 2027'], ['N1', 'N1 · Jul 2027']];
// climb-home per-level chapter labels (editorial redesign — the ascent to N1)
const LEVEL_SUB = { N5: 'first steps', N4: 'conversational core', N3: 'the bridge', N2: 'written register', N1: 'the summit' };
const DAY = 86400000;

let state = null;                 // the store record (lib/study.js shape)
let units = [];                   // grammar-units.json — the R3 unit map (fetched once)
const pointsCache = {};           // id → point data (examples etc.), filled by fetched levels
const levelFetched = {};          // level → true once its file is loaded
let root = null;
let card = null;                  // { id, exIdx, point, type, ... } for the live card
let cardCtl = null;               // active ★-scramble sub-controller (study-scramble.js) while a scramble card shows
let gateTimerCtl = null;          // R10: the soft gate-card countdown controller (torn down on every rebuild)
let phase = 'idle';               // 'input' | 'close' | 'graded' | 'wrong' | 'scramble'
let activeFlow = null;            // a study-lessons.js controller { onAct, onKey, teardown } while a lesson/placement/test-out flow runs
const expandedLevels = new Set(); // course-home accordion: which level cards are open
// K1 Enter-safety state: `lastRevealTs` stamps the input→graded/wrong transition so a single Enter
// can't submit AND then skip past the revealed result (key-repeat / IME double-fire); `lastComposeEnd`
// stamps the last compositionend so a stray finalize-Enter (Safari/mobile mis-set isComposing) can't
// submit half-composed text. Both are short time windows — see the wireRoot keydown handler.
let lastRevealTs = 0;
let lastComposeEnd = 0;
const ENTER_DEBOUNCE_MS = 250;    // submit→continue: ignore Enter/Space this long after a reveal
const COMPOSE_GUARD_MS = 120;     // finalize fallback: ignore a submit-Enter this long after compositionend

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
  // R9: warm the levels of any persisted leeches so the course-home leech deck renders with real
  // patterns/meanings on first paint (leeches persist across sessions; their levels may be cold).
  const leeches0 = leechList(state);
  if (leeches0.length) await ensureLevelsFor(leeches0.map(l => l.id));

  // Land on the course home. Its ▶ Continue button resolves to the right next action (resume /
  // placement / due session / next lesson / caught-up). Prefetch the in-flight queue's levels so
  // a resumed session's synchronous renderCard has its point data ready.
  renderCourseHome();
  if (state.session && state.session.queue.length) {
    await ensureLevelsFor(state.session.queue);
  }
}

function save() { set(KEYS.study, state); }

// R10: stop the soft gate countdown (idempotent) — called before every root rebuild + on nav away.
function teardownGateTimer() { if (gateTimerCtl) { gateTimerCtl.teardown(); gateTimerCtl = null; } }

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

// ── audio (kana-driven TTS + autoplay opt-in) ────────────────────────────────
// autoplay is a string-sentinel preference (default OFF) — speak the example on REVEAL only,
// never during an unanswered input/pick/place phase (that would leak the answer, like the peg).
function autoplayOn() { return getRaw(KEYS.studyTts, '') === 'on'; }
// Session-safe (K2a): the `A` key can flip autoplay mid-session, where re-rendering the course home
// would blow away the live card. So only re-render when the course-home toggle is actually present
// (its click path — keeps the visible button's label/aria-pressed in sync); otherwise just persist +
// announce via #stuLive. Announced in both branches for a consistent SR cue.
function toggleTts() {
  const on = !autoplayOn();
  setRaw(KEYS.studyTts, on ? 'on' : '');
  announce(`Autoplay ${on ? 'on' : 'off'}`);
  if (root.querySelector('.stu-tts-toggle')) renderCourseHome('.stu-tts-toggle');
  return on;
}
// the ja token array of the live card's shown example (for the 🔊 control + autoplay)
function cardExampleJa() {
  const ex = card && card.point && Array.isArray(card.point.examples) && card.point.examples[card.exIdx];
  return ex ? ex.ja : null;
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

// R10 mastery surfacing (mastered-per-level + in-gate counts) is now the pure lib selector
// masteryStats(state) — reused here and by the R11 dashboard widget (single source of truth).

// the pool for the optional "Build a sentence" drill: Deep + Mastered points whose corpus data is
// loaded (so a model example is available). Practice-only — never scheduled.
function buildPointIds() {
  const out = [];
  for (const [id, p] of Object.entries(state.points)) {
    const st = stageOf(p);
    if ((st === 'deep' || st === 'mastered') && pointsCache[id]) out.push(id);
  }
  return out;
}
function pickBuildPoint() {
  const ids = buildPointIds();
  if (!ids.length) return null;
  return pointsCache[ids[Math.floor(Math.random() * ids.length)]];
}

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
  // R8: an unlocked (lessons-done) but unpassed checkpoint is the next Continue action, BEFORE new
  // lessons — so checkpoints happen in the zero-decision flow, not as an optional side quest.
  const cpUnit = nextCheckpointUnit(units, state.points, state.units || {});
  if (cpUnit) return { kind: 'checkpoint', unit: cpUnit };
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
    case 'checkpoint': return `<button type="button" class="stu-btn stu-btn-primary stu-cont" data-act="checkpoint" data-unit="${esc(cs.unit.id)}">▶ Checkpoint: ${esc(cs.unit.title)} <span class="stu-cont-sub">(10 Q)</span></button>`;
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

// The "you are here" level on the climb: the lowest (N5→N1) level not yet fully mastered, preferring
// one already in progress. Purely derived from real state — display only.
function currentLevel(mstats) {
  let firstUnstarted = null, withProgress = null;
  for (const lv of LEVELS) {                          // N5 → N1
    const total = LEVEL_TOTALS[lv] || 0;
    const mastered = (mstats.perLevel[lv] || 0);
    if (total > 0 && mastered >= total) continue;      // climbed past this level
    let intro = 0;
    for (const u of units.filter(u => u.level === lv)) intro += unitProgress(u, state.points).introduced;
    if (intro > 0 && withProgress === null) withProgress = lv;
    if (firstUnstarted === null) firstUnstarted = lv;
  }
  return withProgress || firstUnstarted || 'N5';
}

// the here-card sub-line: what today's session holds, keyed off the Continue state (display only).
function hereContext(cs) {
  if (cs.kind === 'session') return `Session in progress · ${cs.pos + 1} of ${cs.total}`;
  if (cs.kind === 'placement') return 'Sort what you already know to skip ahead';
  if (cs.kind === 'caught-up') return 'All caught up — nothing due right now';
  const q = buildQueue(state, Date.now());
  const due = q.reviews.length, neu = q.lessons;
  const bits = [];
  if (due) bits.push(`${due} review${due === 1 ? '' : 's'} ripe`);
  if (neu) bits.push(`${neu} new point${neu === 1 ? '' : 's'} in reach`);
  return bits.join(' · ') || 'Ready when you are';
}

// A climb rung: a level's row on the ascent rail. `here` docks the session card (hereCardHTML) at the
// current level; each rung stays an expandable accordion to its unit list (data-act="expand").
function levelCardHTML(level, mstats, here, hereCardHTML = '') {
  const lus = units.filter(u => u.level === level);
  let intro = 0, total = 0;
  for (const u of lus) { const pr = unitProgress(u, state.points); intro += pr.introduced; total += pr.total; }
  const mastered = (mstats && mstats.perLevel[level]) || 0;
  const done = total > 0 && mastered >= total;
  const open = expandedLevels.has(level);
  const rows = open ? lus.map(u => {
    const pr = unitProgress(u, state.points);
    const pct = pr.total ? Math.round(pr.introduced / pr.total * 100) : 0;
    // R8 unit-state glyphs: ✓★ gold once the checkpoint is passed; a lessons-done-but-unpassed
    // unit surfaces its "Checkpoint" button; ●/○ otherwise.
    const passed = pr.state === 'done' && checkpointPassed(state, u.id);
    const glyph = passed ? '✓★' : GLYPH[pr.state];
    const cls = passed ? 'stu-unit-passed' : `stu-unit-${esc(pr.state)}`;
    const cpBtn = (pr.state === 'done' && !passed)
      ? `<button type="button" class="stu-btn stu-btn-ghost stu-cp-btn" data-act="checkpoint" data-unit="${esc(u.id)}">Checkpoint · 10 Q →</button>` : '';
    return `<div class="stu-unit-item">
      <div class="stu-unit ${cls}">
        <span class="stu-unit-glyph" aria-hidden="true">${glyph}</span>
        <span class="stu-unit-title">${esc(u.title)}</span>
        <span class="stu-unit-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <span class="stu-unit-n">${esc(String(pr.introduced))}/${esc(String(pr.total))}</span></div>
      ${cpBtn}</div>`;
  }).join('') : '';
  const sub = here ? 'you are here' : (LEVEL_SUB[level] || '');
  const cls = `stu-lvl-card${done ? ' stu-lvl-done' : here ? ' stu-lvl-here' : ''}${open ? ' is-open' : ''}`;
  const seal = done ? ` <span class="stu-seal" aria-hidden="true">✦</span>` : '';
  return `<div class="${cls}">
    <button type="button" class="stu-lvl-head" data-act="expand" data-level="${esc(level)}" aria-expanded="${open ? 'true' : 'false'}">
      ${ringHTML(intro, total)}
      <span class="stu-lvl-name">${esc(level)}${seal}<small class="stu-lvl-sub">${esc(sub)}</small></span>
      <span class="stu-lvl-meta">${esc(String(intro))}/${esc(String(total))} introduced${mastered ? ` · <span class="stu-lvl-mastered">${esc(String(mastered))} mastered</span>` : ''}</span>
      <span class="stu-lvl-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
    </button>
    ${here ? hereCardHTML : ''}
    ${open ? `<div class="stu-unit-list">${rows}</div>` : ''}</div>`;
}

// ── R9: the Leech deck (a course-home section) ───────────────────────────────
// Points the engine has flagged as leeches (lapses ≥ 5) — the ones actively resisting. Each row
// carries its pattern + meaning + lapse count + confusables, a "Duel it" shortcut (the R8 nuance
// duel vs a confusable) and a "Study" shortcut (a focused one-card session). Suspended leeches
// (lapses ≥ 8, auto-excluded from the queue) are surfaced SEPARATELY with an unsuspend nudge so an
// auto-suspended point is always visible and recoverable, never silently gone.
function firstConfusable(point) {
  const cs = (point && Array.isArray(point.confusable)) ? point.confusable : [];
  for (const cid of cs) if (pointsCache[cid]) return cid;      // prefer a resolvable pair
  return cs[0] || null;                                        // else the first id (its level may load on demand)
}
function leechRowHTML(l, suspended) {
  const p = pointsCache[l.id];
  const pat = p ? (p.pattern || l.id) : l.id;
  const mean = p ? (p.meaning || '') : '';
  const conf = p ? firstConfusable(p) : null;
  const duelBtn = conf
    ? `<button type="button" class="stu-btn stu-btn-ghost stu-leech-duel" data-act="leechDuel" data-id="${esc(l.id)}" data-other="${esc(conf)}">⚔ Duel it</button>` : '';
  const actions = suspended
    ? `<button type="button" class="stu-btn stu-btn-primary stu-leech-unsuspend" data-act="leechUnsuspend" data-id="${esc(l.id)}">Unsuspend</button>`
    : `${duelBtn}<button type="button" class="stu-btn stu-btn-ghost stu-leech-study" data-act="leechStudy" data-id="${esc(l.id)}">Study</button>`;
  const nudge = suspended
    ? `<p class="stu-leech-nudge">Suspended after ${esc(String(l.lapses))} misses — unsuspend to retry.</p>` : '';
  return `<div class="stu-leech${suspended ? ' stu-leech-suspended' : ''}">
    <div class="stu-leech-main">
      <span class="stu-leech-pat" lang="ja">${esc(pat)}</span>
      <span class="stu-leech-mean">${esc(mean)}</span>
      <span class="stu-leech-lapses" title="${esc(String(l.lapses))} lapses">×${esc(String(l.lapses))}</span>
    </div>
    ${nudge}
    <div class="stu-leech-actions">${actions}</div>
  </div>`;
}
function leechPanelHTML() {
  const leeches = leechList(state);
  if (!leeches.length) return '';
  const active = leeches.filter(l => !l.suspended);
  const suspended = leeches.filter(l => l.suspended);
  const activeHTML = active.length
    ? `<div class="stu-leech-list">${active.map(l => leechRowHTML(l, false)).join('')}</div>` : '';
  const suspendedHTML = suspended.length
    ? `<div class="stu-leech-sub"><h4 class="stu-leech-sub-h">Suspended</h4>
        <div class="stu-leech-list">${suspended.map(l => leechRowHTML(l, true)).join('')}</div></div>` : '';
  return `<section class="stu-leeches" aria-label="Leeches">
    <h3 class="stu-leeches-h"><span class="stu-mark-shu" aria-hidden="true">虫</span> Leeches <span class="stu-leeches-n">${esc(String(leeches.length))}</span></h3>
    <p class="stu-note stu-leeches-lede">The points fighting back hardest (5+ lapses). Drill the ones you keep confusing, or take a focused pass.</p>
    ${activeHTML}${suspendedHTML}
  </section>`;
}

function renderCourseHome(focusSel) {
  phase = 'idle'; card = null; cardCtl = null; activeFlow = null;
  teardownGateTimer();
  const cs = continueState();
  const mstats = masteryStats(state);
  const examVal = state.settings.examLevel || '';
  const examOpts = EXAM_LEVELS.map(([v, l]) => `<option value="${esc(v)}"${v === examVal ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const totalMastered = LEVELS.reduce((a, lv) => a + (mstats.perLevel[lv] || 0), 0);
  const streakN = (state.settings.streak && state.settings.streak.count) || 0;
  const here = currentLevel(mstats);
  // a secondary "learn N new" link beside Continue when new lessons are in reach but Continue is doing
  // something else (a session/review/checkpoint). Skipped when Continue already IS the learn action
  // (kind 'lessons') or when placement hasn't run yet — no duplicate lever.
  const learnable = (cs.kind !== 'lessons' && cs.kind !== 'placement')
    ? Math.min(buildQueue(state, Date.now()).lessons || 0, lessonIds().length) : 0;
  const learnMini = learnable > 0
    ? `<button type="button" class="stu-btn stu-btn-ghost stu-mini" data-act="learn">Learn ${esc(String(learnable))} new</button>` : '';
  // the session card docked at the "you are here" rung: context sub-line + the one ▶ Continue button
  const hereCard = `<div class="stu-here-card">
      <p class="stu-here-sub">${esc(hereContext(cs))}</p>
      <div class="stu-here-row">${continueButtonHTML(cs)}${learnMini}</div>
    </div>`;
  // the ascent: N1 (summit) at the top → N5 (first steps) at the base; the current level is docked
  const cards = units.length ? [...LEVELS].reverse().map(l => levelCardHTML(l, mstats, l === here, hereCard)).join('')
    : `<div class="stu-here-card">${continueButtonHTML(cs)}<p class="stu-note">Course map unavailable offline — your ▶ Continue button still works.</p></div>`;
  const nGhost = ghostCount(state);
  const hauntHTML = nGhost
    ? `<p class="stu-haunt-count"><span class="stu-mark-shu" aria-hidden="true">幽</span> ${esc(String(nGhost))} haunting — on a tight relearn schedule until ${nGhost === 1 ? 'it settles' : 'they settle'}.</p>` : '';
  // R10: Deep points are the ones actively being gated (their next reviews are mastery checks).
  const gateHTML = mstats.inGate
    ? `<p class="stu-gate-count"><span aria-hidden="true">◉</span> ${esc(String(mstats.inGate))} in the gate — mastery ${mstats.inGate === 1 ? 'check' : 'checks'} in progress.</p>` : '';
  const canBuild = mstats.inGate > 0 || Object.values(mstats.perLevel).some(n => n > 0);
  const buildBtn = canBuild
    ? `<button type="button" class="stu-btn stu-btn-ghost stu-build-btn" data-act="buildStart"><span aria-hidden="true">作</span> Build a sentence</button>` : '';
  // 🔊 autoplay toggle (only when the platform can speak) — auto-plays the example on reveal.
  const ttsBtn = canSpeak()
    ? `<button type="button" class="stu-btn stu-btn-ghost stu-tts-toggle${autoplayOn() ? ' is-on' : ''}" data-act="ttsToggle" aria-pressed="${autoplayOn() ? 'true' : 'false'}" aria-keyshortcuts="A"><span aria-hidden="true">音</span> Autoplay ${autoplayOn() ? 'on' : 'off'} <kbd aria-hidden="true">A</kbd></button>` : '';
  root.innerHTML = `
    <div class="stu-home stu-climb-home">
      <header class="stu-climb-head">
        <div class="stu-climb-headline">
          <p class="stu-climb-kick"><span class="stu-kick-jp" lang="ja">文法帖</span> The Grammar Almanac</p>
          <h3 class="stu-climb-title">Your climb to N1</h3>
          <p class="stu-climb-mastered">${esc(String(totalMastered))} / 353 points mastered</p>
        </div>
        ${streakN ? `<p class="stu-climb-streak">連 ${esc(String(streakN))}<span>day streak</span></p>` : ''}
      </header>
      ${gateHTML}
      ${hauntHTML}
      <div class="stu-climb">${cards}</div>
      ${leechPanelHTML()}
      <div class="stu-home-foot">
        ${buildBtn}
        ${ttsBtn}
        <button type="button" class="stu-btn stu-btn-ghost stu-stats-btn" data-act="statsStart"><span aria-hidden="true">表</span> Progress</button>
        <button type="button" class="stu-btn stu-btn-ghost stu-mock-btn" data-act="examStart"><span aria-hidden="true">試</span> Mock exam</button>
        <button type="button" class="stu-btn stu-btn-ghost stu-pl-btn" data-act="placementStart"><span aria-hidden="true">◉</span> Placement</button>
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
    checkpoint: `Course home. Checkpoint unlocked for ${cs.unit.title}. Continue to take the 10-question quiz.`,
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
    // Completing a lessons batch, placement sweep, or unit checkpoint is a "day shown up"
    // too — record it toward the streak (recordSession is idempotent per calendar day, so a
    // day that also does a review session still counts exactly once).
    done: () => { activeFlow = null; state = recordSession(state, nowISO()); save(); renderCourseHome(); },
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

// R10: the optional "Build a sentence" practice drill (study-build.js). Warms every level so any
// Deep/Mastered point resolves to a model example, then hands a random one to the lazy build flow.
// Practice ONLY — the flow never calls review()/schedules (asserted by the module's contract).
async function launchBuild() {
  if (launching || activeFlow) return;
  launching = true;
  try {
    await ensureAllLevels();
    const p = pickBuildPoint();
    if (!p) { renderCourseHome(); return; }
    const m = await import('./study-build.js');
    activeFlow = m.startBuild({
      root, announce,
      nextPoint: pickBuildPoint,
      done: () => { activeFlow = null; renderCourseHome('.stu-build-btn'); },
    }, p);
  } catch (err) {
    console.error('build failed to load', err);
    renderCourseHome();
    announce('Could not load the practice drill — check your connection and try again.');
  } finally { launching = false; }
}

// R13: the timed mock-exam mode (lazy study-exam.js). Warm every level (the exam's MCQ items need
// cross-level confusables resolvable) then hand off; the exam owns the picker → run → report screens
// and parks itself in activeFlow. Its ctx mirrors flowCtx but done() just returns home (no streak
// bump — the mock is a self-check, not a scheduled review session).
async function launchExam() {
  if (launching || activeFlow) return;
  launching = true;
  try {
    await ensureAllLevels();
    const m = await import('./study-exam.js');
    activeFlow = await m.startExam({
      root, announce, pointsCache,
      getState: () => state,
      commit: (ns) => { state = ns; save(); },
      done: () => { activeFlow = null; renderCourseHome('.stu-mock-btn'); },
    });
  } catch (err) {
    console.error('mock exam failed to load', err);
    renderCourseHome();
    announce('Could not load the mock exam — check your connection and try again.');
  } finally { launching = false; }
}

// R15: the Mastery analytics tab (lazy study-stats.js). Warm every level (the heat grid needs each
// point's pattern + the confusable graph for the weakness rollup), then hand off; the flow owns the
// analytics + certificate screens and parks itself in activeFlow. A heat-grid cell tap routes back
// through ctx.drill → a focused single-card session (the studyLeech path). `view:'cert'` opens the
// certificate directly (the master-complete moment).
function statsCtx(opts) {
  return {
    root, announce, pointsCache, units,
    getState: () => state,
    commit: (ns) => { state = ns; save(); },
    ensureAllLevels,
    drill: async (id) => { activeFlow = null; if (await studyLeech(id) === 'kept') await launchStats(); },
    done: () => { activeFlow = null; renderCourseHome('.stu-stats-btn'); },
    ...(opts || {}),
  };
}
async function launchStats(opts) {
  if (launching || activeFlow) return;
  launching = true;
  try {
    await ensureAllLevels();
    const m = await import('./study-stats.js');
    activeFlow = m.startStats(statsCtx(), opts || {});
  } catch (err) {
    console.error('progress tab failed to load', err);
    renderCourseHome();
    announce('Could not load Progress — check your connection and try again.');
  } finally { launching = false; }
}

// The JLPT Master moment: all 353 gates just passed. Open the certificate screen directly (it plays
// the celebration burst, self-gated on reduce-motion). Guarded so a mid-session render can't re-fire.
async function launchCertificate() {
  if (activeFlow) return;
  try {
    await ensureAllLevels();
    const m = await import('./study-stats.js');
    activeFlow = m.startStats(statsCtx(), { view: 'cert' });
  } catch (err) { console.error('certificate failed to load', err); }
}

// R8: run a unit's 10-question checkpoint (lazy study-lessons.js flow). Every level must be warm so
// the MCQ generator can resolve cross-level confusables into 4-choice sets.
async function launchCheckpoint(unitId) {
  if (launching || activeFlow) return;
  launching = true;
  try {
    await ensureAllLevels();
    const unit = units.find(u => u.id === unitId);
    if (!unit) { renderCourseHome(); return; }
    const m = await import('./study-lessons.js');
    activeFlow = m.startCheckpoint(flowCtx(), unit);
  } catch (err) {
    console.error('checkpoint failed to load', err);
    renderCourseHome();
    announce('Could not load the checkpoint — check your connection and try again.');
  } finally { launching = false; }
}

// ── R9: leech-deck actions ───────────────────────────────────────────────────
// "Study" → a focused single-card session over the one leech (recognition/production picked by the
// same pickFormat rules). "Duel it" → the R8 nuance duel vs a confusable (formative overlay).
// "Unsuspend" → clear the auto-suspend + make it due now (engine `unsuspend`), then re-render.
async function studyLeech(id) {
  if (launching || activeFlow) return;
  // a focused leech drill replaces state.session — never discard an in-flight session silently
  if (state.session && state.session.queue && state.session.pos < state.session.queue.length) {
    const ok = await confirmModal('You have a session in progress. Start a focused leech drill and discard the rest of that session?', { ok: 'Drill this leech', cancel: 'Keep my session', danger: true });
    if (!ok) return 'kept';   // caller (heat-grid drill) restores its screen; the leech deck stays on the course home
  }
  launching = true;
  try {
    await ensureAllLevels();                     // MCQ/scramble need confusables resolvable
    if (!pointsCache[id]) { renderCourseHome(); return; }
    state = sessionStart(state, [id]);
    save();
    renderCard();
  } catch (err) {
    console.error('leech study failed', err);
    renderCourseHome();
  } finally { launching = false; }
}
async function leechDuel(id, otherId) {
  try {
    await ensureLevelsFor([id, otherId]);
    const a = pointsCache[id], b = pointsCache[otherId];
    if (!a || !b) { announce('Could not open the duel — the pair data is unavailable offline.'); return; }
    const m = await import('./study-duel.js');
    m.openDuel(a, b);
  } catch (err) { console.error('leech duel failed', err); }
}
function unsuspendLeech(id) {
  state = unsuspend(state, id, Date.now());
  save();
  const p = pointsCache[id];
  announce(`${p ? p.pattern : id} unsuspended — it's due again now.`);
  renderCourseHome();
}

async function continueSession() {
  if (!state.session || !state.session.queue.length) { renderCourseHome(); return; }
  await ensureLevelsFor(state.session.queue);   // no-op if the mount prefetch already finished
  await ensureAllLevels();                      // MCQ cards need every level's confusables resolvable
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
  // R10: a point at Deep runs its scheduled review in GATE MODE (production cloze, or recognition
  // MCQ/scramble per gateMode) — this OVERRIDES the R4/R8 format rotation. Falls through to a normal
  // review only if the gate card can't render (buildGateCard → null).
  if (p && isGateCard(p)) { const gc = buildGateCard(id, point, p, pointsCache); if (gc) return gc; }
  const exIdx = (((p && p.reps) || 0) + idHash(id)) % point.examples.length;
  const fmt = pickFormat(id, point, p);
  if (fmt === 'scramble') {
    const sIdx = scrambleFor(point, exIdx) ? exIdx : point.examples.findIndex((_, i) => scrambleFor(point, i));
    if (sIdx >= 0) return { id, exIdx: sIdx, point, type: 'scramble' };
  }
  if (fmt === 'mcq') {
    const mcq = mcqFor(point, pointsCache, exIdx);
    if (mcq) return { id, exIdx, point, type: 'mcq', mcq };   // else fall through to cloze
  }
  const { blankedTokens, answers } = clozeFor(point, exIdx);
  if (!answers.length) return null;   // degenerate example with no p token — skip
  return { id, exIdx, point, type: 'cloze', blankedTokens, answers };
}

// Format mix by stage (R4/R8): young/mature/deep points rotate typed-cloze / ★-scramble / MCQ,
// deterministic by id + day. Seed/sprout/ghost stay cloze (fresh material is produced, not
// recognised). N1 / `written-formal` points gate as RECOGNITION (lib/study.js gateMode), so they
// bias toward MCQ/scramble over typed cloze — producing a written-register point from memory is
// fake rigor; the exam recognises it. Falls back to whatever the point can actually render.
function pickFormat(id, point, p) {
  const stage = p ? stageOf(p) : 'seed';
  if ((p && p.ghost) || !(stage === 'young' || stage === 'mature' || stage === 'deep')) return 'cloze';
  const canScr = scramblable(point);
  const canMcq = !!mcqFor(point, pointsCache, 0);
  const rot = (idHash(id) + Math.floor(Date.now() / DAY)) % 3;
  const recog = gateMode(point, { level: point.level, flags: point.flags }) === 'recognition';
  if (recog) {                                   // prefer recognition formats; avoid typed cloze
    if (rot % 2 === 0 && canScr) return 'scramble';
    if (canMcq) return 'mcq';
    if (canScr) return 'scramble';
    return 'cloze';
  }
  if (rot === 1 && canScr) return 'scramble';
  if (rot === 2 && canMcq) return 'mcq';
  if (rot === 0) return 'cloze';
  return canScr ? 'scramble' : (canMcq ? 'mcq' : 'cloze');
}

// small stable hash so the shown example is deterministic across a resume (no Math.random)
function idHash(id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// R9: the "haunted" badge — shown on a card whose point is currently a ghost (◆ shaky / lapsed,
// riding the tight relearn ladder). Engine state only; this VISUALISES it.
function hauntBadge(id) {
  const p = id && state.points[id];
  return (p && p.ghost) ? ` <span class="stu-haunt" title="Haunted — on the tight relearn ladder until two clean passes">幽 haunted</span>` : '';
}

function renderCard() {
  const s = state.session;
  if (!s || s.pos >= s.queue.length) { renderSummary(); return; }
  cardCtl = null;
  teardownGateTimer();
  card = buildCard();
  if (!card) {                       // unrenderable — advance without touching the schedule
    state = sessionRecord(state, { id: s.queue[s.pos], skipped: true });
    save();
    renderCard();
    return;
  }
  if (card.type === 'scramble') { renderScrambleCard(); return; }
  if (card.type === 'mcq') { renderMcqCard(); return; }
  phase = 'input';
  const sentence = renderSentence(card.blankedTokens, false);
  const total = s.queue.length, n = s.pos + 1;
  root.innerHTML = `
    <div class="stu-card${card.gate ? ' stu-card-gate' : ''}">
      <div class="stu-prog"><span class="stu-prog-n">${esc(String(n))} / ${esc(String(total))}</span>
        <span class="stu-prog-bar" aria-hidden="true"><i style="transform:scaleX(${total ? (n / total).toFixed(4) : 0})"></i></span></div>
      ${card.gate ? gateHeaderHTML(gatePasses(state.points[card.id])) : ''}
      <p class="stu-lvl">${esc(card.point.level || '')} · <span lang="ja">${esc(card.point.pattern || '')}</span>${hauntBadge(card.id)}</p>
      <p class="stu-sentence" lang="ja">${sentence}</p>
      <div class="stu-hints" id="stuHints" hidden></div>
      <p class="stu-en" hidden>${esc(exampleEN(card))}</p>
      <div class="stu-answer">
        <input type="text" class="stu-input" id="stuInput" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Type the missing grammar in kana">
      </div>
      <p class="stu-cap" id="stuCap" hidden></p>
      <div class="stu-feedback" id="stuFeedback" aria-live="off"></div>
      <div class="stu-controls" id="stuControls">${controlsFor('input', card.gate)}</div>
      <span class="stu-tap stu-tap-l" id="stuTapL" aria-hidden="true"></span>
      <span class="stu-tap stu-tap-r" id="stuTapR" aria-hidden="true"></span>
    </div>`;
  $('#stuInput')?.focus({ preventScroll: true });
  if (card.gate) gateTimerCtl = mountGateTimer($('#stuGateTimer'));
  announce(`Card ${n} of ${total}. ${card.gate ? 'Mastery check. ' : ''}${card.point.pattern || ''} — type the missing grammar.`);
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
    <div class="stu-card stu-card-scramble${card.gate ? ' stu-card-gate' : ''}">
      <div class="stu-prog"><span class="stu-prog-n">${esc(String(n))} / ${esc(String(total))}</span>
        <span class="stu-prog-bar" aria-hidden="true"><i style="transform:scaleX(${total ? (n / total).toFixed(4) : 0})"></i></span></div>
      ${card.gate ? gateHeaderHTML(gatePasses(state.points[card.id])) : ''}
      <p class="stu-lvl">${esc(card.point.level || '')} · <span lang="ja">${esc(card.point.pattern || '')}</span>${hauntBadge(card.id)}</p>
      <div id="stuScramHost"></div>
    </div>`;
  const hostEl = root.querySelector('#stuScramHost');
  cardCtl = scrambleCard({ announce }, hostEl, card.point, card.exIdx, { grade: true, autoSpeak: autoplayOn(), onResult: onScrambleResult });
  if (card.gate) gateTimerCtl = mountGateTimer($('#stuGateTimer'));
  announce(`Card ${n} of ${total}. ${card.gate ? 'Mastery check. ' : ''}${card.point.pattern || ''} — arrange the pieces to build the sentence.`);
}

// ── MCQ card (R8) ────────────────────────────────────────────────────────────
// The third card type: mounts the shared study-mcq.js sub-controller (recognition-style — a
// correct pick opens Hard/Good/Easy) and parks it in cardCtl. onMcqResult is the one place
// scheduling happens for this card.
function renderMcqCard() {
  const s = state.session;
  const total = s.queue.length, n = s.pos + 1;
  phase = 'mcq';
  root.innerHTML = `
    <div class="stu-card stu-card-mcq${card.gate ? ' stu-card-gate' : ''}">
      <div class="stu-prog"><span class="stu-prog-n">${esc(String(n))} / ${esc(String(total))}</span>
        <span class="stu-prog-bar" aria-hidden="true"><i style="transform:scaleX(${total ? (n / total).toFixed(4) : 0})"></i></span></div>
      ${card.gate ? gateHeaderHTML(gatePasses(state.points[card.id])) : ''}
      <p class="stu-lvl">${esc(card.point.level || '')} · <span lang="ja">${esc(card.point.pattern || '')}</span>${hauntBadge(card.id)}</p>
      <div id="stuMcqHost"></div>
    </div>`;
  const hostEl = root.querySelector('#stuMcqHost');
  cardCtl = mcqCard({ announce }, hostEl, card.mcq, { grade: true, point: card.point, exampleJa: cardExampleJa(), autoSpeak: autoplayOn(), onResult: onMcqResult });
  if (card.gate) gateTimerCtl = mountGateTimer($('#stuGateTimer'));
  announce(`Card ${n} of ${total}. ${card.gate ? 'Mastery check. ' : ''}${card.point.pattern || ''} — choose the grammar that fills the blank.`);
}

// Correct pick → the learner's Hard/Good/Easy; wrong pick → Again (typedCorrect:false → grade 1).
function onMcqResult({ pass, chosen }) {
  const eff = effectiveGrade({ typedCorrect: pass, chosen: chosen || 3 });
  const now = Date.now();
  const gate = !!card.gate;
  const wasGhost = !!(state.points[card.id] && state.points[card.id].ghost);
  const snap = progressSnap(card.id);
  state = review(state, card.id, { pass: eff > 1, grade: eff, exampleIdx: card.exIdx, mode: gate ? 'gate' : 'review' }, now);
  state = sessionRecord(state, { id: card.id, grade: eff, ok: pass });
  save();
  let milestone = false;
  if (gate) milestone = gateFeedback(card.point, state.points[card.id], eff > 1, announce) === true;
  else maybeGhostExit(card.id, wasGhost);
  if (celebrateProgress(card.id, snap, card.point.pattern)) milestone = true;
  if (!pass) blip('wrong'); else if (!milestone) blip('coin');
  cardCtl = null;
  renderCard();
}

// Correct order → the learner's Hard/Good/Easy; wrong order → Again (typedCorrect:false → grade 1).
function onScrambleResult({ pass, chosen }) {
  const eff = effectiveGrade({ typedCorrect: pass, chosen: chosen || 3 });
  const now = Date.now();
  const gate = !!card.gate;
  const wasGhost = !!(state.points[card.id] && state.points[card.id].ghost);
  const snap = progressSnap(card.id);
  state = review(state, card.id, { pass: eff > 1, grade: eff, exampleIdx: card.exIdx, mode: gate ? 'gate' : 'review' }, now);
  state = sessionRecord(state, { id: card.id, grade: eff, ok: pass });
  save();
  let milestone = false;
  if (gate) milestone = gateFeedback(card.point, state.points[card.id], eff > 1, announce) === true;
  else maybeGhostExit(card.id, wasGhost);
  if (celebrateProgress(card.id, snap, card.point.pattern)) milestone = true;
  if (!pass) blip('wrong'); else if (!milestone) blip('coin');
  cardCtl = null;
  renderCard();
}

// R11: celebrate() on the two milestone transitions a graded answer can trigger — a first climb to
// Mature (a real stage-up, NOT a gate-fail demotion that also lands at Mature), and a LEVEL
// completion (its final point mastered — a bigger moment, stacked after the gate's own Mastered
// burst). `snap` is captured BEFORE review(): the point's stage + its level's mastered count.
// celebrate() self-gates on the reduce-motion / celebrations-off preferences.
function progressSnap(id) {
  const lv = levelOf(id);
  return { stage: stageOf(state.points[id] || null), lv, mastered: lv ? masteryStats(state).perLevel[lv] : 0, complete: isMasterComplete(state) };
}
function celebrateProgress(id, snap, pattern) {
  const p = state.points[id];
  if (!p) return false;
  let fired = false;
  const after = stageOf(p);
  if (after === 'mature' && STAGES.indexOf(after) > STAGES.indexOf(snap.stage)) { celebrate(`Mature — ${pattern || ''} ✦`); fired = true; }
  const lv = snap.lv;
  if (lv && LEVEL_TOTALS[lv] && after === 'mastered' && snap.mastered < LEVEL_TOTALS[lv]
      && masteryStats(state).perLevel[lv] >= LEVEL_TOTALS[lv]) { celebrate(`${lv} complete — every point mastered! ✦`); fired = true; }
  // R15: the JLPT Master moment — the final gate just passed (was incomplete, now 353/353). Open the
  // certificate after this card's own bursts settle (the cert screen plays its own celebration).
  if (!snap.complete && isMasterComplete(state)) { setTimeout(() => launchCertificate(), 1200); fired = true; }
  return fired;
}

// R9: when a point that WAS a ghost is no longer one after grading, it just passed its 2nd clean
// pass and exited the relearn ladder — a small acknowledgement (toast + live-region), never confetti.
function maybeGhostExit(id, wasGhost) {
  if (!wasGhost) return;
  const p = state.points[id];
  if (p && !p.ghost && !p.suspended) ghostToast(pointsCache[id] ? pointsCache[id].pattern : id);
}
let ghostToastEl = null, ghostToastTimer = 0;
function ghostToast(pattern) {
  if (ghostToastEl) ghostToastEl.remove();
  ghostToastEl = document.createElement('div');
  ghostToastEl.className = 'stu-toast';
  ghostToastEl.setAttribute('role', 'status');
  ghostToastEl.innerHTML = `✦ Exorcised — <b lang="ja">${esc(pattern || '')}</b> is back on track.`;
  document.body.appendChild(ghostToastEl);
  clearTimeout(ghostToastTimer);
  ghostToastTimer = setTimeout(() => { if (ghostToastEl) { ghostToastEl.remove(); ghostToastEl = null; } }, 3200);
  announce(`${pattern || ''} cleared the relearn ladder — no longer haunted.`);
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
function controlsFor(ph, gate) {
  if (ph === 'input') return `
    ${gate ? '' : '<button type="button" class="stu-btn stu-btn-ghost stu-hint-btn" data-act="hint"><span aria-hidden="true">灯</span> Hint</button>'}
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

// ── R9: progressive hint ladder (cloze cards only) ───────────────────────────
// Three tiers, each press advancing: gloss (EN meaning) → structure (connection string) → kana
// (first kana of the answer). The anime peg is DELIBERATELY NOT a tier (it contains the pattern
// verbatim — teaching model item 9); giving up is the separate "Don't know" reveal. Each tier
// caps the self-graded score through effectiveGrade's `hintTier` param: gloss/structure → Good,
// kana → Hard (reveal → Again). We track the highest (most-revealing = tightest) tier used and pass
// it on grade. Recognition cards (MCQ/scramble) have no typed answer, so no hint ladder there.
const HINT_TIERS = ['gloss', 'structure', 'kana'];
function firstKana() {
  const a = (card && card.answers) || [];
  const kana = a.length > 1 ? a[a.length - 1] : (a[0] || '');   // clozeFor returns [surface, reading]
  return Array.from(kana)[0] || '';
}
function hintContent(tier) {
  const p = card.point;
  if (tier === 'gloss') return { label: 'Meaning', body: p.meaning || '—', ja: false };
  if (tier === 'structure') return { label: 'Structure', body: p.connection || '—', ja: true };
  return { label: 'Starts with', body: (firstKana() || '？') + '…', ja: true };   // kana
}
function hintCapLabel() {
  let cap = 4;
  if (card.closeAccepted) cap = Math.min(cap, 2);
  if (card.hintTier === 'gloss' || card.hintTier === 'structure') cap = Math.min(cap, 3);
  if (card.hintTier === 'kana') cap = Math.min(cap, 2);
  return cap === 2 ? 'Hard' : cap === 3 ? 'Good' : 'Easy';
}
function useHint() {
  // hints are DISABLED in gate mode (a mastery check must be hint-free); the button isn't even
  // rendered on a gate card, but guard here too so a stray keybinding can't open the ladder.
  if (phase !== 'input' || !card || card.type !== 'cloze' || card.gate) return;
  const used = card.hintUsed || 0;
  if (used >= HINT_TIERS.length) return;
  const tier = HINT_TIERS[used];
  card.hintUsed = used + 1;
  card.hintTier = tier;                                // latest = most revealing = tightest cap
  const box = $('#stuHints');
  if (box) {
    const c = hintContent(tier);
    box.hidden = false;
    box.insertAdjacentHTML('beforeend',
      `<p class="stu-hint-line"><span class="stu-hint-k">${esc(c.label)}</span> <span${c.ja ? ' lang="ja"' : ''}>${esc(c.body)}</span></p>`);
  }
  updateCapNote();
  if (card.hintUsed >= HINT_TIERS.length) {
    const hb = root.querySelector('.stu-hint-btn');
    if (hb) { hb.disabled = true; hb.textContent = 'No more hints'; }
  }
  $('#stuInput')?.focus({ preventScroll: true });
  announce(`Hint: ${hintContent(tier).label}. Max grade now ${hintCapLabel()}.`);
}
function updateCapNote() {
  const el = $('#stuCap');
  if (!el) return;
  if (!card.hintTier) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = `Max grade: ${hintCapLabel()} (hint used)`;
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
  lastRevealTs = Date.now();   // K1: start the submit→continue debounce window (the phase just flipped to graded/wrong)
  if (card.gate) teardownGateTimer();   // the soft timer's job ends the moment the answer is shown
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
    const hinted = !card.closeAccepted && !!card.hintTier;   // hint cap only worth surfacing when not already close-capped
    const okMsg = hinted
      ? `<span class="stu-fb-ok">Correct — capped at ${esc(hintCapLabel())} (hint). How did it feel?</span>`
      : `<span class="stu-fb-ok">Correct — how did it feel?</span>`;
    if (fb) fb.innerHTML = (card.closeAccepted
      ? `<span class="stu-fb-close">Accepted — capped at Hard. How did it feel?</span>`
      : okMsg) + peg;
    setControls('graded');
    focusControl('.stu-good');
    announce(card.closeAccepted ? 'Accepted, capped at Hard. Choose Hard, Good or Easy.'
      : hinted ? `Correct, capped at ${hintCapLabel()} from the hint. Choose Hard, Good or Easy.`
      : 'Correct. Choose Hard, Good or Easy.');
  } else {
    phase = 'wrong';
    const gateNote = card.gate ? ' <span class="stu-fb-gate-reset">Mastery gate restarts.</span>' : '';
    if (fb) fb.innerHTML = `<span class="stu-fb-wrong">Not quite — the answer is <b lang="ja">${esc(card.answers[0])}</b>.</span>${gateNote}` + peg;
    setControls('wrong');
    focusControl('.stu-btn-primary');
    announce(`Not quite. The answer is ${card.answers[0]}.`);
  }
  // 🔊 on the now-revealed full sentence (post-answer only — never in the input phase). Autoplay
  // (opt-in, default off) reads it aloud immediately; the button lets the learner replay it.
  const ja = cardExampleJa();
  const sb = ja ? speakBtnHTML('', 'R') : '';   // 'R' chip: the R replay key is wired for this shell reveal (graded/wrong)
  if (sb && fb) fb.insertAdjacentHTML('beforeend', sb);
  if (ja && autoplayOn()) speakExample(ja, root.querySelector('.stu-speak'));
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
  const eff = effectiveGrade({ typedCorrect, closeAccepted: !!card.closeAccepted, hintTier: card.hintTier, chosen: g });
  const pass = eff > 1;
  const now = Date.now();
  const gate = !!card.gate;
  const wasGhost = !!(state.points[card.id] && state.points[card.id].ghost);
  const snap = progressSnap(card.id);
  state = review(state, card.id, { pass, grade: eff, exampleIdx: card.exIdx, mode: gate ? 'gate' : 'review' }, now);
  state = sessionRecord(state, { id: card.id, grade: eff, ok: typedCorrect });
  save();
  let milestone = false;
  if (gate) milestone = gateFeedback(card.point, state.points[card.id], pass, announce) === true;
  else maybeGhostExit(card.id, wasGhost);
  if (celebrateProgress(card.id, snap, card.point.pattern)) milestone = true;
  if (!pass) blip('wrong'); else if (!milestone) blip('coin');   // a milestone's own 1up carries the sound
  renderCard();
}

// ── Summary screen ───────────────────────────────────────────────────────────
function renderSummary() {
  cardCtl = null;
  teardownGateTimer();
  const results = (state.session && state.session.results) || [];
  const graded = results.filter(r => !r.skipped);
  const n = graded.length;
  const okN = graded.filter(r => r.ok).length;
  const acc = n ? Math.round(okN / n * 100) : 0;
  // R11: a session that reaches this summary bumps the days-shown-up streak + the weekly-goal
  // counter EXACTLY ONCE. recordSession is idempotent per calendar day (a resumed/re-rendered
  // session can't double-count), and the hadSession guard blocks a re-entry after the session has
  // already closed (state.session === null → empty results, must not record).
  const hadSession = !!state.session;
  state = sessionEnd(state);
  state = { ...state, lastSession: Date.now() };
  if (hadSession) state = recordSession(state, nowISO());
  save();

  const now = Date.now();
  const nextDue = Object.values(state.points).filter(p => !p.suspended && p.due != null && p.due > now && p.due <= now + DAY).length;
  const streakN = (state.settings.streak && state.settings.streak.count) || 0;
  const weekDone = (state.settings.week && state.settings.week.done) || 0;
  const weekGoal = state.settings.weeklyGoal || 5;
  root.innerHTML = `
    <div class="stu-summary">
      <div class="stu-sum-art" aria-hidden="true">✓</div>
      <h3 class="stu-sum-h">Session complete</h3>
      <div class="stu-stats">
        <div class="stu-stat"><span class="stu-stat-n">${esc(String(n))}</span><span class="stu-stat-l">reviewed</span></div>
        <div class="stu-stat"><span class="stu-stat-n">${esc(String(acc))}%</span><span class="stu-stat-l">accuracy</span></div>
        <div class="stu-stat"><span class="stu-stat-n"><span class="stu-mark-gold" aria-hidden="true">連</span> ${esc(String(streakN))}</span><span class="stu-stat-l">day streak</span></div>
      </div>
      <p class="stu-note">${esc(String(weekDone))} / ${esc(String(weekGoal))} sessions this week · ${nextDue ? `${esc(String(nextDue))} due in the next 24 hours.` : 'nothing else due in the next 24 hours.'}</p>
      <button type="button" class="stu-btn stu-btn-primary" data-act="done">Done</button>
    </div>`;
  root.querySelector('.stu-btn-primary')?.focus({ preventScroll: true });
  announce(`Session complete. ${n} reviewed, ${acc}% accuracy. ${streakN}-day streak. ${nextDue} due in the next 24 hours.`);
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

  // keyboard: scoped to the study root only. The shell's phase-specific contract now routes through
  // the shared pure resolver (lib/shortcuts.js resolveKey) + the WCAG turn-off gate; card
  // sub-controllers (scramble/MCQ/lessons) keep their own onKey in K1 (incremental registry adoption).
  root.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;   // IME first — never removed (matches gestures.js)

    // ── Leak fix (WIDENED): while a card/flow owns the keyboard, stop EVERY bare key from bubbling
    // to gestures' document-level route-nav — EXCEPT `?` (it must reach gestures so the help sheet
    // opens). Previously only {1-9, Enter, Space, Escape} were stopped, so ] [ 0 b \ , / leaked, and
    // `]` navigated to a neighbour route, ABANDONING the session (#/study is hidden → currentRoute
    // fell back to dashboard). Modified keys (⌘K / ⌘Z …) are NOT stopped — they must reach gestures.
    const cardActive = activeFlow || cardCtl || ['input', 'close', 'graded', 'wrong', 'scramble', 'mcq'].includes(phase);
    const bareKey = !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Escape');
    if (cardActive && bareKey && e.key !== '?') e.stopPropagation();

    // WCAG 2.1.4 turn-off: when shortcuts are disabled, no bare key commands on any study surface
    // (native Tab + Enter/Space-on-a-focused-button still operate every control — Principle 5).
    const enabled = shortcutsEnabled();

    if (activeFlow) { if (enabled) activeFlow.onKey(e); return; }   // active lesson/placement/test-out owns keys
    if (cardCtl) { if (enabled) cardCtl.onKey(e); return; }         // a live ★-scramble / MCQ card owns its keys

    // submit→continue debounce: one physical Enter/Space must not submit AND then skip past the
    // revealed result (key-repeat / IME double-fire). We preventDefault so the focused grade/Continue
    // BUTTON doesn't activate natively during the window either.
    if (enabled && (e.key === 'Enter' || e.key === ' ') && (phase === 'graded' || phase === 'wrong')
        && (Date.now() - lastRevealTs) < ENTER_DEBOUNCE_MS) { e.preventDefault(); return; }

    const id = resolveKey({ key: e.key, phase, targetKind: targetKindOf(e.target), composing: e.isComposing, enabled });
    if (!id) return;
    // finalize-side IME fallback: ignore a submit-Enter fired right after compositionend — Safari/
    // mobile have mis-set isComposing=false on the finalize-Enter, which would submit half-composed text.
    if (id === 'submit' && (Date.now() - lastComposeEnd) < COMPOSE_GUARD_MS) return;
    e.preventDefault();
    runAction(id);
  });

  // track the last IME finalize so the submit path can ignore a stray finalize-Enter (see above).
  root.addEventListener('compositionend', () => { lastComposeEnd = Date.now(); });

  // repaint furigana toggle if it changes elsewhere; stop a test-out's soft timer if the user
  // navigates away mid-flow (display-only, but don't leave an interval running off-screen).
  document.addEventListener('jwh:route', (e) => {
    if (e.detail?.route === 'study') { applyFuri(); return; }
    if (activeFlow && activeFlow.teardown) activeFlow.teardown();
    teardownGateTimer();   // don't leave the soft gate countdown ticking off-screen
  });
}

// the active-element KIND resolveKey needs (kept in the module so resolveKey stays DOM-free/pure).
function targetKindOf(el) {
  if (!el) return 'other';
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return 'input';
  if (el.tagName === 'BUTTON') return 'button';
  return 'other';
}
// map a resolved actionId → the existing shell handler (the same ones the delegated click routes to).
function runAction(id) {
  switch (id) {
    case 'submit': submitAnswer(); break;
    case 'accept': acceptClose(); break;
    case 'reject': rejectClose(); break;
    case 'grade-2': grade(2); break;
    case 'grade-3': grade(3); break;
    case 'grade-4': grade(4); break;
    case 'grade-default': grade(3); break;                       // Enter in graded, no control focused → Good
    case 'advance': grade(1, { typedCorrect: false }); break;   // wrong phase: Enter/Space = Continue
    case 'speak-graded': case 'speak-wrong': {                  // R: replay (post-answer only; no-op if no audio)
      const ja = cardExampleJa(); if (ja) speakExample(ja, root.querySelector('.stu-speak')); break;
    }
    case 'autoplay': toggleTts(); break;                        // A: toggle autoplay (session-safe; announces)
  }
}

function act(name, btn) {
  switch (name) {
    case 'start': if (!btn.disabled) startSession(); break;
    case 'continue': continueSession(); break;
    case 'learn': launchLessons(); break;
    case 'checkpoint': launchCheckpoint(btn.dataset.unit); break;
    case 'placementStart': launchPlacement(); break;
    case 'buildStart': launchBuild(); break;
    case 'statsStart': launchStats(); break;
    case 'examStart': launchExam(); break;
    case 'expand': toggleLevel(btn.dataset.level); break;
    case 'leechStudy': studyLeech(btn.dataset.id); break;
    case 'leechDuel': leechDuel(btn.dataset.id, btn.dataset.other); break;
    case 'leechUnsuspend': unsuspendLeech(btn.dataset.id); break;
    case 'hint': useHint(); break;
    case 'check': submitAnswer(); break;
    case 'reveal': if (phase === 'input') reveal('wrong'); break;
    case 'accept': acceptClose(); break;
    case 'reject': rejectClose(); break;
    case 'grade': grade(parseInt(btn.dataset.g, 10)); break;
    case 'again': grade(1, { typedCorrect: false }); break;
    case 'speak': { const ja = cardExampleJa(); if (ja) speakExample(ja, btn); break; }
    case 'ttsToggle': toggleTts(); break;
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
