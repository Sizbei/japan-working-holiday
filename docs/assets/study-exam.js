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
          <h3 class="stu-mock-h">🎓 Mock exam — grammar section</h3>
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
          <span class="stu-mock-timer" id="stuExamTimer">⏱ ${esc(fmtClock(remaining))}</span>
          <span class="stu-mock-count">問 ${esc(String(pos + 1))} / ${esc(String(total))}</span>
          <button type="button" class="stu-btn stu-btn-ghost stu-mock-flag${flags.has(pos) ? ' is-on' : ''}" data-act="examFlag" aria-pressed="${flags.has(pos) ? 'true' : 'false'}">⚑ ${flags.has(pos) ? 'Flagged' : 'Flag'}</button>
        </div>
        <div class="stu-mock-body" id="stuExamBody">${cardHTML(q)}</div>
        <div class="stu-mock-nav">
          <button type="button" class="stu-btn stu-btn-ghost" data-act="examPrev"${pos === 0 ? ' disabled' : ''}>← 前</button>
          <button type="button" class="stu-btn stu-btn-ghost" data-act="examNext"${pos === total - 1 ? ' disabled' : ''}>次 →</button>
          <button type="button" class="stu-btn stu-btn-primary stu-mock-submit" data-act="examSubmit">${submitLabel()}</button>
        </div>
        ${paletteHTML()}
      </div>`;
    focusCard(focusSel);
    paintTimer();
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
    const tileHTML = sc.chunks.map((c, i) => placed.has(i) ? ''
      : `<button type="button" class="stu-tile" data-act="examTile" data-i="${i}" lang="ja">${tileRuby(i)}</button>`).join('');
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
      return `<button type="button" class="stu-mock-pcell ${cls}" data-act="examJump" data-i="${i}"
        aria-label="Question ${i + 1}${isAnswered(i) ? ', answered' : ', blank'}${flags.has(i) ? ', flagged' : ''}${i === pos ? ', current' : ''}">${i + 1}</button>`;
    }).join('');
    return `<div class="stu-mock-palette" role="group" aria-label="Question palette">${cells}</div>`;
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
    renderRunning();
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

  // ── report (feedback lands HERE, and only here) ─────────────────────────────────
  function renderReport() {
    screen = 'report';
    const score = scoreExam(answers, exam.items);
    const band = examBand(score.raw, score.total);

    // persist to the ring log for R15's trendline
    try {
      const st = ctx.getState();
      ctx.commit(recordExam(st, { level: exam.level, date: nowISO(), raw: score.raw, total: score.total, byFormat: score.byFormat }));
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

  // ── controller surface (study.js forwards its delegated click/keydown here) ──────
  return {
    teardown() { stopTimer(); },
    onAct(name, btn) {
      switch (name) {
        case 'examPick': startLevel(btn.dataset.level); break;
        case 'examOpt': pick(parseInt(btn.dataset.k, 10)); break;
        case 'examBack': stopTimer(); ctx.done(); break;
        case 'examFlag': toggleFlag(); break;
        case 'examPrev': go(pos - 1); break;
        case 'examNext': go(pos + 1); break;
        case 'examJump': go(parseInt(btn.dataset.i, 10)); break;
        case 'examSubmit': trySubmit(); break;
        case 'examTile': placeTile(parseInt(btn.dataset.i, 10)); break;
        case 'examSlot': clearSlot(parseInt(btn.dataset.pos, 10)); break;
        case 'examRetake': startLevel(btn.dataset.level); break;
      }
    },
    onKey(e) {
      if (screen !== 'running') return;
      const q = exam.items[pos];
      // digit accelerators pick an option (kata/passage) — study.js already stopPropagation'd these
      if (/^[1-9]$/.test(e.key) && q && (q.format === 'kata' || q.format === 'passage')) {
        const k = parseInt(e.key, 10) - 1;
        const opts = q.format === 'kata' ? q.mcq.options : q.blank.options;
        if (k < opts.length) { e.preventDefault(); pick(k); }
      }
    },
  };
}
