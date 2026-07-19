'use strict';
// #/study — R13 timed mock-exam mode. A per-level grammar-section simulation assembled by the pure
// lib/exam.js (`buildExam`) from the SAME generators the practice runner uses — 文法形式 MCQ, 文の
// 組み立て ★ scramble, and the R12 文章の文法 passage bank — then run EXAM-style: exam numbering
// (問 n), a question palette (answered / flagged / current), prev/next navigation, a soft overall
// countdown, and NO per-question feedback (feedback lands ONLY on the end report). The report is
// honest: an indicative band explicitly labelled as the grammar HALF of the shared 19/60 Language-
// Knowledge floor — never a section pass.
//
// This is a dedicated exam runner (NOT the feedback-y practice cards): exam mode reveals nothing
// mid-exam and the anime peg is suppressed (it leaks the pattern). Parked in study.js's `activeFlow`,
// so the shell's delegated click/keydown forward here (the R8 stopPropagation guard already scopes
// exam keys away from the route-nav). Conventions: every dynamic string through esc(); ruby via
// rubyHTML; token spans use .stok, NEVER .jp; focus restored after each rebuild; announce() drives
// the shared #stuLive live region; reduce-motion handled in CSS.
// Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R13).

import { esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { nowISO } from './lib/dates.js';
import { buildExam, scoreExam, examBand, recordExam, KATA_COUNT, STAR_COUNT, PASSAGE_COUNT } from './lib/exam.js';
import { canSpeak, speakExample } from './speak.js';
import { shortcutsEnabled } from './lib/shortcuts.js';
import { confirmModal } from './lib/modal.js';

// K3/K4a turn-off-aware kbd hint (mirrors study.js kbHint): no dead-key chips/aria when shortcuts are
// off. `ksVal` is the aria-keyshortcuts token (e.g. ArrowLeft); `glyph` is the readable <kbd> label.
const kbHint = (ksVal, glyph = ksVal) => shortcutsEnabled()
  ? { ks: ` aria-keyshortcuts="${esc(ksVal)}"`, chip: ` <kbd aria-hidden="true">${esc(glyph)}</kbd>` }
  : { ks: '', chip: '' };

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const PASSAGES_FILE = 'data/grammar-passages.json';
const FMT_LABEL = { kata: '文法形式', star: '文の組み立て', passage: '文章の文法' };

// The honest sectional-floor label — VERBATIM intent (never imply a section pass).
const FLOOR_LABEL = 'Language Knowledge (vocab+grammar) shares the 19/60 sectional floor — this mock covers the grammar half only, so treat it as directional, not a section pass.';

// startExam(ctx) → a controller { onAct(name, btn), onKey(e), teardown() } for study.js's activeFlow.
// ctx: { root, announce, pointsCache, getState, commit, done }. Fetches the passage bank first (it's
// SW-precached, so this is offline-safe; a fetch failure just yields a passage shortfall).
export async function startExam(ctx) {
  const passages = await loadPassages();
  return examController(ctx, passages);
}

async function loadPassages() {
  try {
    const r = await fetch(PASSAGES_FILE);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return Array.isArray(j) ? j : (Array.isArray(j.passages) ? j.passages : []);
  } catch (err) {
    console.error('[study-exam] load passages', err);
    return [];
  }
}

function examController(ctx, passages) {
  const root = ctx.root;
  const announce = ctx.announce || (() => {});

  // pointsByLevel from the warmed pointsCache (study.js warms every level before launching us).
  const byLevel = { N5: [], N4: [], N3: [], N2: [], N1: [] };
  for (const p of Object.values(ctx.pointsCache || {})) {
    const lv = p && p.level;
    if (byLevel[lv]) byLevel[lv].push(p);
  }
  const passageCountFor = (lv) => passages.filter(p => p && p.level === lv).length;

  let screen = 'picker';        // 'picker' | 'running' | 'report'
  let exam = null;              // buildExam result
  let answers = [];            // per-item response (number | slots-array | null)
  const flags = new Set();
  let pos = 0;
  let pendingSubmit = false;    // two-press submit when blanks remain
  let exiting = false;          // K4a: an exit-confirm modal is open (re-entrancy guard for Esc)

  // timing
  let timerId = 0;
  let remaining = 0;           // seconds left in the soft budget
  let overtime = false;
  let itemMs = [];             // dwell ms per item
  let lastTick = 0;

  renderPicker();

  // ── picker ──────────────────────────────────────────────────────────────────
  function renderPicker() {
    screen = 'picker';
    stopTimer();
    const cards = LEVELS.map(lv => {
      const pc = passageCountFor(lv);
      const kata = KATA_COUNT[lv];
      const total = kata + STAR_COUNT + Math.min(PASSAGE_COUNT, pc);
      const passNote = pc >= PASSAGE_COUNT ? `${PASSAGE_COUNT} passage`
        : pc > 0 ? `${pc}/${PASSAGE_COUNT} passage` : 'passage bank in R14';
      const mins = Math.round(total * 60 / 60);   // ~1 min/item
      return `<button type="button" class="stu-btn stu-mock-pick" data-act="examPick" data-level="${esc(lv)}">
        <span class="stu-mock-pick-lv">${esc(lv)}</span>
        <span class="stu-mock-pick-meta">${esc(String(kata))} 形式 · ${STAR_COUNT} ★ · ${esc(passNote)}</span>
        <span class="stu-mock-pick-sub">${esc(String(total))} questions · ~${esc(String(mins))} min</span>
      </button>`;
    }).join('');
    root.innerHTML = `
      <div class="stu-mock stu-mock-picker">
        <div class="stu-mock-head">
          <h3 class="stu-mock-h"><span aria-hidden="true">試</span> Mock exam — grammar section</h3>
          <p class="stu-note">A timed, feedback-free simulation of the JLPT 文字・語彙・文法 grammar items. Pick a level to begin.</p>
        </div>
        <div class="stu-mock-picks">${cards}</div>
        <div class="stu-mock-picker-foot">
          <button type="button" class="stu-btn stu-btn-ghost" data-act="examBack">← Back to course home</button>
        </div>
      </div>`;
    root.querySelector('.stu-mock-pick')?.focus({ preventScroll: true });
    announce('Mock exam. Pick a level to start a timed grammar-section simulation.');
  }

  // ── build + start ─────────────────────────────────────────────────────────────
  function startLevel(level) {
    const seed = (Date.now() >>> 0) ^ (level.charCodeAt(1) * 2654435761);
    exam = buildExam(level, byLevel, passages, seed >>> 0);
    if (!exam.items.length) { announce('Could not assemble this level offline. Try again when online.'); renderPicker(); return; }
    answers = new Array(exam.items.length).fill(null);
    itemMs = new Array(exam.items.length).fill(0);
    flags.clear();
    pos = 0; pendingSubmit = false; overtime = false;
    remaining = exam.budgetSec;
    lastTick = Date.now();
    startTimer();
    renderRunning();
  }

  // ── timer ─────────────────────────────────────────────────────────────────────
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (remaining > 0) { remaining--; if (remaining === 0) { overtime = true; announce('Time is up. You can still finish — the report will note it.'); } }
      paintTimer();
    }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }
  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function paintTimer() {
    const el = root.querySelector('#stuExamTimer');
    if (!el) return;
    el.textContent = overtime ? `⏱ 00:00 · over` : `⏱ ${fmtClock(remaining)}`;
    el.classList.toggle('is-low', !overtime && remaining <= 60);
    el.classList.toggle('is-over', overtime);
  }

  // account the time spent on the item we're leaving
  function chargeDwell() {
    const now = Date.now();
    if (pos >= 0 && pos < itemMs.length) itemMs[pos] += now - lastTick;
    lastTick = now;
  }

  // ── answered-state helpers ─────────────────────────────────────────────────────
  function isAnswered(i) {
    const a = answers[i], q = exam.items[i];
    if (!q) return false;
    if (q.format === 'star') return Array.isArray(a) && a.length === 4 && a.every(x => x != null);
    return typeof a === 'number';
  }
  function answeredCount() { let n = 0; for (let i = 0; i < exam.items.length; i++) if (isAnswered(i)) n++; return n; }

  // ── running screen ──────────────────────────────────────────────────────────────
  function renderRunning(focusSel) {
    screen = 'running';
    const total = exam.items.length;
    const q = exam.items[pos];
    root.innerHTML = `
      <div class="stu-mock stu-mock-run">
        <div class="stu-mock-bar">
          <button type="button" class="stu-btn stu-btn-ghost stu-mock-exit" data-act="examExit" aria-label="Exit the mock exam"${kbHint('Escape', 'Esc').ks}>✕ Exit${kbHint('Escape', 'Esc').chip}</button>
          <span class="stu-mock-timer" id="stuExamTimer">⏱ ${esc(fmtClock(remaining))}</span>
          <span class="stu-mock-count">問 ${esc(String(pos + 1))} / ${esc(String(total))}</span>
          <button type="button" class="stu-btn stu-btn-ghost stu-mock-flag${flags.has(pos) ? ' is-on' : ''}" data-act="examFlag" aria-pressed="${flags.has(pos) ? 'true' : 'false'}"${kbHint('F').ks}>⚑ ${flags.has(pos) ? 'Flagged' : 'Flag'}${kbHint('F').chip}</button>
        </div>
        <div class="stu-mock-body" id="stuExamBody">${cardHTML(q)}</div>
        <div class="stu-mock-nav">
          <button type="button" class="stu-btn stu-btn-ghost" data-act="examPrev"${pos === 0 ? ' disabled' : ''}${kbHint('ArrowLeft', '←').ks}>← 前${kbHint('ArrowLeft', '←').chip}</button>
          <button type="button" class="stu-btn stu-btn-ghost" data-act="examNext"${pos === total - 1 ? ' disabled' : ''}${kbHint('ArrowRight', '→').ks}>次 →${kbHint('ArrowRight', '→').chip}</button>
          <button type="button" class="stu-btn stu-btn-primary stu-mock-submit" data-act="examSubmit"${kbHint('Enter', '⏎').ks}>${submitLabel()}</button>
        </div>
        ${paletteHTML()}
      </div>`;
    focusCard(focusSel);
    paintTimer();
    // K4a: the dedicated run-container listener handles the WCAG-2.1.4-EXEMPT nav keys (arrows / Enter
    // / Esc) so they work regardless of the shortcut toggle; it lives on the freshly-built element, so
    // no manual cleanup is needed (the next root.innerHTML drops it). Printable keys (F / digits) stay
    // on the controller's onKey, which study.js only forwards while shortcutsEnabled() (WCAG-gated).
    root.querySelector('.stu-mock-run')?.addEventListener('keydown', onRunKey);
    announce(`Question ${pos + 1} of ${total}. ${FMT_LABEL[q.format]}.`);
  }

  function submitLabel() {
    const blanks = exam.items.length - answeredCount();
    if (pendingSubmit && blanks > 0) return `Submit anyway — ${blanks} blank${blanks === 1 ? '' : 's'}`;
    return blanks > 0 ? `採点 Submit (${answeredCount()}/${exam.items.length})` : '採点 Submit';
  }

  // restore focus to a REAL control after every rebuild: an explicit target, else the first
  // option/tile, else the always-present flag button (never a non-focusable container).
  function focusCard(focusSel) {
    const el = (focusSel && root.querySelector(focusSel))
      || root.querySelector('.stu-mc-opt') || root.querySelector('.stu-tile')
      || root.querySelector('.stu-mock-flag');
    if (el) el.focus({ preventScroll: true });
  }

  // ── per-format card bodies (NO feedback, NO peg) ─────────────────────────────────
  function cardHTML(q) {
    if (q.format === 'kata') return kataHTML(q);
    if (q.format === 'passage') return passageHTML(q);
    if (q.format === 'star') return starHTML(q);
    return '';
  }

  function stemHTML(stem) {
    return (Array.isArray(stem) ? stem : []).map(b => {
      if (b.blank) return `<span class="stu-blank stu-blank-mcq" aria-label="blank">＿＿</span>`;
      const tok = b.token;
      if (typeof tok === 'string') return esc(tok);
      if (!tok || typeof tok !== 'object') return '';
      return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
    }).join('');
  }

  function optionsHTML(options, picked) {
    return `<div class="stu-mc" role="group" aria-label="Choices">${options.map((o, k) =>
      `<button type="button" class="stu-mc-opt${k === picked ? ' is-picked' : ''}" data-act="examOpt" data-k="${k}" aria-pressed="${k === picked ? 'true' : 'false'}">
        <span class="stu-mc-key" aria-hidden="true">${k + 1}</span><span lang="ja">${esc(o)}</span></button>`).join('')}</div>`;
  }

  function kataHTML(q) {
    return `<p class="stu-mock-fmt">${FMT_LABEL.kata} · ${esc(q.level)}</p>
      <p class="stu-sentence" lang="ja">${stemHTML(q.mcq.stem)}</p>
      ${optionsHTML(q.mcq.options, answers[pos])}`;
  }

  // passage: whole passage shown, the ACTIVE blank highlighted, other blanks neutral (never revealed).
  function passageTokensHTML(q) {
    const active = q.blank.n;
    return (q.passage.tokens || []).map(tok => {
      if (tok && typeof tok === 'object' && tok.blank) {
        const on = tok.n === active;
        return `<span class="stu-mock-bk${on ? ' is-active' : ''}" aria-label="${on ? 'blank to answer' : 'blank ' + (tok.n + 1)}">（${esc(String(tok.n + 1))}）</span>`;
      }
      if (typeof tok === 'string') return esc(tok);
      if (tok && typeof tok === 'object') return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
      return '';
    }).join('');
  }
  function passageHTML(q) {
    return `<p class="stu-mock-fmt">${FMT_LABEL.passage} · ${esc(q.passage.title || '')}</p>
      <p class="stu-sentence stu-mock-passage" lang="ja">${passageTokensHTML(q)}</p>
      <p class="stu-mock-bk-q">（${esc(String(q.blank.n + 1))}）に入るものは？</p>
      ${optionsHTML(q.blank.options, answers[pos])}`;
  }

  // star: slot-fill, no auto-check. answers[pos] holds the working slots array (length 4, null-able).
  function starHTML(q) {
    const sc = q.scramble;
    let slots = answers[pos];
    if (!Array.isArray(slots)) { slots = [null, null, null, null]; answers[pos] = slots; }
    const placed = new Set(slots.filter(x => x != null));
    const tileRuby = (i) => rubyHTML(sc.chunks[i].rt, sc.chunks[i].text);
    const slotHTML = slots.map((ti, p) => {
      const isStar = p === sc.star, filled = ti != null;
      return `<button type="button" class="stu-slot${isStar ? ' stu-slot-star' : ''}${filled ? ' is-filled' : ''}" data-act="examSlot" data-pos="${p}"
        aria-label="Slot ${p + 1}${isStar ? ', star' : ''}${filled ? ', ' + esc(sc.chunks[ti].text) : ', empty'}">
        ${isStar ? '<span class="stu-slot-star-mark" aria-hidden="true">★</span>' : ''}
        <span class="stu-slot-body" lang="ja">${filled ? tileRuby(ti) : '<span class="stu-slot-ph" aria-hidden="true">＿</span>'}</span></button>`;
    }).join('');
    // K4a: a numbered badge per tile is the visible affordance for the digit place-path (press N to
    // drop piece N into the next empty slot — mirrors the 文法形式 option numbers; tap parity via click).
    const tileHTML = sc.chunks.map((c, i) => placed.has(i) ? ''
      : `<button type="button" class="stu-tile" data-act="examTile" data-i="${i}"><span class="stu-mc-key" aria-hidden="true">${i + 1}</span><span lang="ja">${tileRuby(i)}</span></button>`).join('');
    return `<p class="stu-mock-fmt">${FMT_LABEL.star}</p>
      <p class="stu-scram-q">並べ替え — arrange all four pieces (★ = the starred slot). No feedback until you submit.</p>
      <div class="stu-slots" role="group" aria-label="Answer slots">${slotHTML}</div>
      <div class="stu-tiles" role="group" aria-label="Pieces">${tileHTML}</div>`;
  }

  // ── palette (answered / flagged / current) ──────────────────────────────────────
  function paletteHTML() {
    const cells = exam.items.map((q, i) => {
      const cls = [
        i === pos ? 'is-current' : '',
        isAnswered(i) ? 'is-answered' : '',
        flags.has(i) ? 'is-flagged' : '',
      ].filter(Boolean).join(' ');
      // roving tabindex: the current question's cell is the ONE tab stop; the run-container listener
      // rolls the 0 as arrows/Home/End move focus within the palette (K4a — not the K4b heat grid).
      return `<button type="button" class="stu-mock-pcell ${cls}" data-act="examJump" data-i="${i}" tabindex="${i === pos ? '0' : '-1'}"${i === pos ? ' aria-current="true"' : ''}
        aria-label="Question ${i + 1}${isAnswered(i) ? ', answered' : ', blank'}${flags.has(i) ? ', flagged' : ''}${i === pos ? ', current' : ''}">${i + 1}</button>`;
    }).join('');
    return `<div class="stu-mock-palette" role="group" aria-label="Question palette (arrow keys move, Enter jumps)">${cells}</div>`;
  }

  // ── interactions ────────────────────────────────────────────────────────────────
  function pick(k) {
    const q = exam.items[pos];
    if (!q || (q.format !== 'kata' && q.format !== 'passage')) return;
    const opts = q.format === 'kata' ? q.mcq.options : q.blank.options;
    if (k < 0 || k >= opts.length) return;
    answers[pos] = k;
    pendingSubmit = false;
    renderRunning(`.stu-mc-opt[data-k="${k}"]`);
  }
  function placeTile(i) {
    const q = exam.items[pos];
    if (!q || q.format !== 'star') return;
    let slots = answers[pos]; if (!Array.isArray(slots)) slots = answers[pos] = [null, null, null, null];
    if (slots.includes(i)) return;
    const empty = slots.indexOf(null);
    if (empty < 0) return;
    slots[empty] = i;
    pendingSubmit = false;
    renderRunning();
    announce(`Piece placed in slot ${empty + 1}.`);
  }
  function clearSlot(p) {
    const q = exam.items[pos];
    if (!q || q.format !== 'star') return;
    const slots = answers[pos];
    if (!Array.isArray(slots) || slots[p] == null) return;
    slots[p] = null;
    renderRunning();
    announce(`Slot ${p + 1} cleared.`);
  }
  function go(next) {
    if (next < 0 || next >= exam.items.length || next === pos) return;
    chargeDwell();
    pos = next; pendingSubmit = false;
    renderRunning();
  }
  function toggleFlag() {
    if (flags.has(pos)) flags.delete(pos); else flags.add(pos);
    renderRunning('.stu-mock-flag');   // keep focus on the flag control (tap + F both re-toggle here)
    announce(flags.has(pos) ? 'Flagged.' : 'Unflagged.');
  }
  function trySubmit() {
    const blanks = exam.items.length - answeredCount();
    if (blanks > 0 && !pendingSubmit) {
      pendingSubmit = true;
      const b = root.querySelector('.stu-mock-submit');
      if (b) b.textContent = submitLabel();
      announce(`${blanks} question${blanks === 1 ? '' : 's'} still blank. Press Submit again to finish anyway.`);
      return;
    }
    chargeDwell();
    stopTimer();
    renderReport();
  }

  // K4a: exit the running mock with a confirm (NEVER a silent discard). The confirm modal (modal.js)
  // owns its own focus trap + Esc; `exiting` guards against re-entry. The modal DOM lives outside the
  // run container, so its Esc can't bubble back into onRunKey. On confirm we stop the timer + go home;
  // on cancel the modal restores focus to where it was.
  async function tryExit() {
    if (exiting) return;
    exiting = true;
    let ok = false;
    try {
      ok = await confirmModal('Leave this mock exam? Your progress on it will be discarded.', { ok: 'Leave', cancel: 'Keep going', danger: true });
    } catch (err) { console.error('[study-exam] exit confirm', err); }
    exiting = false;
    if (ok) { stopTimer(); ctx.done(); }
  }

  // ── roving tabindex within the question palette (K4a — NOT the K4b heat grid) ─────
  function paletteCells() { return [...root.querySelectorAll('.stu-mock-pcell')]; }
  function moveInPalette(where) {
    const cells = paletteCells();
    const cur = cells.indexOf(document.activeElement);
    if (cur < 0) return false;
    const next = where === 'first' ? 0 : where === 'last' ? cells.length - 1
      : Math.min(cells.length - 1, Math.max(0, cur + where));
    cells[cur].tabIndex = -1;
    cells[next].tabIndex = 0;
    cells[next].focus({ preventScroll: true });
    return true;
  }

  // The WCAG-2.1.4-EXEMPT nav keys, live regardless of the shortcut toggle (Enter/Esc/arrows are named
  // keys, not single printable chars). Bound on the run container (fires before study.js's root
  // handler); F / digit picks stay on onKey (WCAG-gated). Enter on a focused BUTTON falls through to
  // native activation (the BUTTON-fallthrough guard) so we never double-fire the submit/nav controls.
  function onRunKey(e) {
    if (screen !== 'running') return;
    if (e.isComposing || e.keyCode === 229) return;
    const k = e.key;
    const inPalette = !!(e.target.closest && e.target.closest('.stu-mock-palette'));
    if (inPalette) {
      if (k === 'ArrowRight' || k === 'ArrowDown') { if (moveInPalette(1)) { e.preventDefault(); e.stopPropagation(); } return; }
      if (k === 'ArrowLeft' || k === 'ArrowUp') { if (moveInPalette(-1)) { e.preventDefault(); e.stopPropagation(); } return; }
      if (k === 'Home') { if (moveInPalette('first')) { e.preventDefault(); e.stopPropagation(); } return; }
      if (k === 'End') { if (moveInPalette('last')) { e.preventDefault(); e.stopPropagation(); } return; }
      // Enter on a palette cell = native jump (examJump); Esc handled below.
    } else {
      if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(pos - 1); return; }
      if (k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(pos + 1); return; }
    }
    if (k === 'Enter') {
      if (e.target.tagName === 'BUTTON') return;   // native activation of the focused control
      e.preventDefault(); e.stopPropagation(); trySubmit(); return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); tryExit(); return; }
  }

  // ── report (feedback lands HERE, and only here) ─────────────────────────────────
  function renderReport() {
    screen = 'report';
    const score = scoreExam(answers, exam.items);
    const band = examBand(score.raw, score.total);

    // persist to the ring log for R15's trendline
    try {
      const st = ctx.getState();
      ctx.commit(recordExam(st, { level: exam.level, date: nowISO(), raw: score.raw, total: score.total, byFormat: score.byFormat, byCluster: score.byCluster }));
    } catch (err) { console.error('[study-exam] record', err); }

    root.innerHTML = `
      <div class="stu-mock stu-mock-report">
        <h3 class="stu-mock-h">Results — ${esc(exam.level)} grammar section</h3>
        ${score.skipped > 0 ? `<p class="stu-note">${esc(String(score.skipped))} left blank (counted as not correct, not as wrong picks).</p>` : ''}
        <div class="stu-mock-score">
          <div class="stu-mock-score-raw"><span class="stu-mock-score-n">${esc(String(score.raw))}</span><span class="stu-mock-score-d">/ ${esc(String(score.total))}</span></div>
          <div class="stu-mock-band stu-mock-band-${esc(band.label.toLowerCase().replace(/\s+/g, '-'))}">
            <span class="stu-mock-band-pct">${esc(String(band.pct))}%</span>
            <span class="stu-mock-band-label">${esc(band.label)}</span>
          </div>
        </div>
        <p class="stu-mock-floor">${esc(FLOOR_LABEL)}</p>
        <p class="stu-mock-ready">${esc(readinessHint(exam.level, band))}</p>
        ${shortfallHTML()}
        ${formatHTML(score.byFormat)}
        ${clusterHTML(score.byCluster)}
        ${timeHTML(score.byFormat)}
        ${reviewHTML()}
        <div class="stu-mock-report-foot">
          <button type="button" class="stu-btn stu-btn-primary" data-act="examRetake" data-level="${esc(exam.level)}">Retake ${esc(exam.level)} (new draw)</button>
          <button type="button" class="stu-btn stu-btn-ghost" data-act="examBack">Done — back to course home</button>
        </div>
      </div>`;
    root.querySelector('.stu-btn-primary')?.focus({ preventScroll: true });
    announce(`Mock complete. ${score.raw} of ${score.total} correct, ${band.pct}%, ${band.label}. This is the grammar half only — directional, not a section pass.`);
  }

  function readinessHint(level, band) {
    const base = `${level} readiness (grammar half): `;
    if (band.pct >= 90) return base + 'strong recognition — hold this with weekly ★ drills and shift effort to vocab + reading.';
    if (band.pct >= 75) return base + 'on track — keep the daily timed ★ drills and close the 形式 gaps below.';
    if (band.pct >= 60) return base + 'borderline — the grammar half alone would not clear the floor comfortably; drill the confusable clusters below.';
    if (band.pct >= 40) return base + 'below the line — prioritise the missed 形式 points and re-run this mock in a week.';
    return base + 'well below — build coverage through the course first, then come back to timed mocks.';
  }

  function shortfallHTML() {
    const sf = exam.shortfall || {};
    if (!sf.passage) return '';
    return `<p class="stu-note stu-mock-shortfall">Passage section ran with ${esc(String(exam.counts.passage))} of ${PASSAGE_COUNT} items — the ${esc(exam.level)} 文章の文法 bank arrives in R14. Score is over the ${esc(String(exam.items.length))} items actually presented.</p>`;
  }

  function formatHTML(bf) {
    const row = (key, label) => {
      const f = bf[key] || { correct: 0, total: 0 };
      const pct = f.total ? Math.round(f.correct / f.total * 100) : 0;
      return `<div class="stu-mock-frow">
        <span class="stu-mock-fname">${esc(label)}</span>
        <span class="stu-mock-fbar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <span class="stu-mock-fscore">${esc(String(f.correct))} / ${esc(String(f.total))}</span></div>`;
    };
    return `<section class="stu-mock-sec"><h4 class="stu-mock-sec-h">By format</h4>
      ${row('kata', '文法形式 (grammar form)')}${row('star', '文の組み立て (★ ordering)')}${row('passage', '文章の文法 (passage)')}</section>`;
  }

  function clusterHTML(bc) {
    const keys = Object.keys(bc || {});
    if (!keys.length) return `<section class="stu-mock-sec"><h4 class="stu-mock-sec-h">Confusable traps</h4><p class="stu-note">No 文法形式 misses — no trap clusters to review.</p></section>`;
    const rows = keys.sort((a, b) => bc[b].count - bc[a].count).map(k => {
      const c = bc[k];
      const label = c.chosen ? `Chose <b lang="ja">${esc(c.chosen)}</b> instead` : 'Other distractors';
      return `<div class="stu-mock-crow"><span class="stu-mock-cn">×${esc(String(c.count))}</span><span class="stu-mock-cl">${label}</span></div>`;
    }).join('');
    return `<section class="stu-mock-sec"><h4 class="stu-mock-sec-h">Confusable traps</h4>
      <p class="stu-note">Where your wrong 文法形式 picks landed — drill these pairs (the R8 nuance duels target exactly these).</p>${rows}</section>`;
  }

  function timeHTML(bf) {
    const used = itemMs.reduce((a, b) => a + b, 0) / 1000;
    const budget = exam.budgetSec;
    // per-format average seconds
    const sums = { kata: 0, star: 0, passage: 0 }, counts = { kata: 0, star: 0, passage: 0 };
    exam.items.forEach((q, i) => { if (sums[q.format] != null) { sums[q.format] += itemMs[i] / 1000; counts[q.format]++; } });
    const avg = (k) => counts[k] ? sums[k] / counts[k] : 0;
    const starAvg = avg('star'), otherAvg = (counts.kata + counts.passage) ? (sums.kata + sums.passage) / (counts.kata + counts.passage) : 0;
    const starSink = starAvg > 60 || (otherAvg > 0 && starAvg > otherAvg * 1.5);
    const line = (k, label) => `<span>${esc(label)}: ${esc(String(Math.round(avg(k))))}s avg</span>`;
    const over = used > budget;
    return `<section class="stu-mock-sec"><h4 class="stu-mock-sec-h">Time</h4>
      <p class="stu-mock-time ${over || overtime ? 'is-over' : ''}">${esc(fmtClock(used))} used of ${esc(fmtClock(budget))} budget${over || overtime ? ' — over the soft budget' : ''}.</p>
      <p class="stu-note">${line('kata', '形式')} · ${line('star', '★')} · ${line('passage', 'passage')}</p>
      ${starSink ? `<p class="stu-mock-warn">⚠ The ★ 文の組み立て items ate the clock (${esc(String(Math.round(starAvg)))}s each). On the real exam these are the classic time-sink — bank speed with daily timed ★ drills.</p>` : ''}
    </section>`;
  }

  // ── post-exam audio review (POST-EXAM ONLY — never rendered during the timed run) ──
  // A 🔊 per point-based item (文法形式 / ★) that reads the source sentence by its DATA kana. Passage
  // items are omitted (they reference the passage bank, not a single grammar point's example).
  function reviewHTML() {
    if (!canSpeak()) return '';
    const rows = exam.items.map((q, i) => {
      if (q.format !== 'kata' && q.format !== 'star') return '';
      return `<div class="stu-mock-review-row">
        <span class="stu-mock-review-n">問 ${esc(String(i + 1))}</span>
        <span class="stu-mock-review-pat" lang="ja">${esc(q.pattern || '')}</span>
        <button type="button" class="stu-speak" data-act="examSpeak" data-i="${esc(String(i))}" aria-label="Play audio for question ${esc(String(i + 1))}" title="Play audio">音</button>
      </div>`;
    }).join('');
    if (!rows) return '';
    return `<section class="stu-mock-sec stu-mock-review"><h4 class="stu-mock-sec-h">Review — hear each sentence</h4>
      <p class="stu-note">Post-exam audio. Tap 音 to hear the grammar spoken in its sentence.</p>${rows}</section>`;
  }
  function speakItem(i, btn) {
    const q = exam.items[i];
    if (!q) return;
    const p = (ctx.pointsCache || {})[q.pointId];
    if (!p || !Array.isArray(p.examples)) return;
    const ex = (q.exampleIdx != null && p.examples[q.exampleIdx]) || p.examples[0];
    if (ex && ex.ja) speakExample(ex.ja, btn);
  }

  // ── controller surface (study.js forwards its delegated click/keydown here) ──────
  return {
    teardown() { stopTimer(); },
    onAct(name, btn) {
      switch (name) {
        case 'examPick': startLevel(btn.dataset.level); break;
        case 'examOpt': pick(parseInt(btn.dataset.k, 10)); break;
        case 'examBack': stopTimer(); ctx.done(); break;
        case 'examExit': tryExit(); break;
        case 'examFlag': toggleFlag(); break;
        case 'examPrev': go(pos - 1); break;
        case 'examNext': go(pos + 1); break;
        case 'examJump': go(parseInt(btn.dataset.i, 10)); break;
        case 'examSubmit': trySubmit(); break;
        case 'examTile': placeTile(parseInt(btn.dataset.i, 10)); break;
        case 'examSlot': clearSlot(parseInt(btn.dataset.pos, 10)); break;
        case 'examRetake': startLevel(btn.dataset.level); break;
        case 'examSpeak': speakItem(parseInt(btn.dataset.i, 10), btn); break;
      }
    },
    // Printable-key accelerators (F flag + 1–4 pick/place) — WCAG-gated: study.js only forwards this
    // onKey while shortcutsEnabled(). The named nav keys (arrows/Enter/Esc) live in onRunKey instead,
    // so they keep working when the toggle is off. study.js already stopPropagation'd these bare keys.
    onKey(e) {
      if (screen !== 'running') return;
      const q = exam.items[pos];
      if (!q) return;
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlag(); return; }
      if (/^[1-9]$/.test(e.key)) {
        const k = parseInt(e.key, 10) - 1;
        if (q.format === 'kata' || q.format === 'passage') {
          const opts = q.format === 'kata' ? q.mcq.options : q.blank.options;
          if (k < opts.length) { e.preventDefault(); pick(k); }
        } else if (q.format === 'star' && q.scramble && k < q.scramble.chunks.length) {
          e.preventDefault(); placeTile(k);   // place piece #(k+1) into the next empty slot (digit path)
        }
      }
    },
  };
}
