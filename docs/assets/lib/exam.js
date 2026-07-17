'use strict';
// Pure mock-exam assembly + scoring for #/study (R13). Builds ONE timed grammar-section mock per
// JLPT level from the SAME generators the practice runner uses — `mcqFor` (文法形式), `scrambleFor`
// (文の組み立て), and the R12 passage bank (文章の文法) — never re-authoring questions. 100% pure:
// no DOM, no store, no Date, no Math.random — deterministic by `seed`. Node-import-safe and
// unit-tested from the repo root (see tests/lib.test.mjs).
// Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R13).

import { mcqFor, scrambleFor, scramblable } from './questions.js';

// Per-level section composition (from the plan's embedded JLPT format facts): N 文法形式 MCQ +
// 5 文の組み立て ★ scramble + 5 文章の文法 passage-blanks. N is the only per-level variable.
export const KATA_COUNT = { N5: 16, N4: 15, N3: 13, N2: 12, N1: 10 };
export const STAR_COUNT = 5;
export const PASSAGE_COUNT = 5;
// The JLPT allots ~1 min/grammar item — the overall soft budget is that per item, shown not enforced.
export const SECONDS_PER_ITEM = 60;
const EXAM_LOG_MAX = 100;   // the ring log is bounded — keep the last N mocks for R15's trendline

// ── deterministic shuffle (mirrors questions.js — kept local so exam.js stays self-contained) ──
function seedHash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function lcgShuffle(n, seed) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = (seed >>> 0) || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx;
}
const shuffled = (arr, seed) => lcgShuffle(arr.length, seed).map(i => arr[i]);

// first example index that yields a renderable MCQ / scramble for this point, seeded start; -1 if none.
function pickMcqExample(point, byId, seed) {
  const n = (point && point.examples || []).length;
  if (!n) return -1;
  const start = seed % n;
  for (let k = 0; k < n; k++) { const i = (start + k) % n; if (mcqFor(point, byId, i)) return i; }
  return -1;
}
function pickScrambleExample(point, seed) {
  const n = (point && point.examples || []).length;
  if (!n) return -1;
  const start = seed % n;
  for (let k = 0; k < n; k++) { const i = (start + k) % n; if (scrambleFor(point, i)) return i; }
  return -1;
}

// a 文法形式 item: the blanked-stem MCQ + an option→confusable-cluster map (drives the report's
// per-confusable-cluster breakdown — a wrong pick that IS a confusable's pattern attributes there).
function kataItem(point, mcq, byId) {
  const optionClusters = {};   // option surface → the confusable id it belongs to
  for (const cid of (Array.isArray(point.confusable) ? point.confusable : [])) {
    const c = byId.get(cid);
    if (c && c.pattern) optionClusters[c.pattern] = cid;
  }
  return {
    format: 'kata', pointId: point.id, level: point.level || '', pattern: point.pattern || '',
    mcq: { stem: mcq.stem, options: mcq.options, correct: mcq.correct, en: mcq.en || '' },
    optionClusters,
  };
}

// buildExam(level, pointsByLevel, passages, seed) → the assembled mock. Pure + deterministic by seed.
//   level         'N5'|'N4'|'N3'|'N2'|'N1'
//   pointsByLevel { N5:[point], N4:[point], … } — the target level supplies the MCQ/scramble pool;
//                 every level is folded into a by-id map so cross-level confusables resolve for mcqFor.
//   passages      the R12 bank (array, or { passages:[…] }) — passage-blanks for `level` only.
// Graceful shortfall: a level that can't fill a quota (e.g. N2/N1 have no passages until R14) yields
// fewer items and reports the gap in `shortfall` — the exam still assembles and runs.
export function buildExam(level, pointsByLevel, passages, seed = 1) {
  const pbl = pointsByLevel || {};
  const target = Array.isArray(pbl[level]) ? pbl[level] : [];
  const byId = new Map();
  for (const k of Object.keys(pbl)) for (const p of (pbl[k] || [])) if (p && p.id) byId.set(p.id, p);

  const base = (seed >>> 0) || 1;
  const items = [];

  // ── 文法形式 MCQ ──────────────────────────────────────────────────────────
  const kataN = KATA_COUNT[level] || 0;
  const kataPool = shuffled(target.filter(p => mcqFor(p, byId, 0)), base ^ 0x1111);
  let kataDone = 0;
  for (const p of kataPool) {
    if (kataDone >= kataN) break;
    const exSeed = seedHash(p.id + ':kata');
    const exIdx = pickMcqExample(p, byId, exSeed);
    if (exIdx < 0) continue;
    const mcq = mcqFor(p, byId, exIdx, exSeed);
    if (!mcq) continue;
    items.push(kataItem(p, mcq, byId));
    kataDone++;
  }

  // ── 文の組み立て ★ scramble ────────────────────────────────────────────────
  const starPool = shuffled(target.filter(p => scramblable(p)), base ^ 0x2222);
  let starDone = 0;
  for (const p of starPool) {
    if (starDone >= STAR_COUNT) break;
    const exSeed = seedHash(p.id + ':star');
    const exIdx = pickScrambleExample(p, exSeed);
    if (exIdx < 0) continue;
    const sc = scrambleFor(p, exIdx, exSeed);
    if (!sc) continue;
    const ex = p.examples[exIdx];
    items.push({
      format: 'star', pointId: p.id, level: p.level || level, pattern: p.pattern || '',
      exampleIdx: exIdx, scramble: sc, en: (ex && ex.en) || '',
    });
    starDone++;
  }

  // ── 文章の文法 passage-blanks ──────────────────────────────────────────────
  const bank = Array.isArray(passages) ? passages : (passages && passages.passages) || [];
  const levelPassages = shuffled(bank.filter(p => p && p.level === level), base ^ 0x3333);
  let passDone = 0;
  for (const pas of levelPassages) {
    if (passDone >= PASSAGE_COUNT) break;
    for (const bl of (pas.blanks || [])) {
      if (passDone >= PASSAGE_COUNT) break;
      items.push({
        format: 'passage', level, pointId: bl.pointId || null,
        passage: { id: pas.id, title: pas.title || '', tokens: pas.tokens || [], en: pas.en || '' },
        blank: { n: bl.n, answer: bl.answer, options: (bl.options || []).slice(), kind: bl.kind || '', pointId: bl.pointId || null },
      });
      passDone++;
    }
  }

  const counts = { kata: kataDone, star: starDone, passage: passDone };
  const shortfall = {
    kata: Math.max(0, kataN - kataDone),
    star: Math.max(0, STAR_COUNT - starDone),
    passage: Math.max(0, PASSAGE_COUNT - passDone),
  };
  return { level, seed: base, items, counts, shortfall, budgetSec: items.length * SECONDS_PER_ITEM };
}

// scoreExam(answers, questions) → { raw, total, byFormat, byCluster }. Pure.
//   answers[i] is the learner's response to questions[i]:
//     kata / passage → the chosen option INDEX (number); anything else = unanswered → wrong.
//     star           → the placed order (array of chunk indices per slot); correct iff === order.
//   byFormat  per-format { correct, total }.
//   byCluster wrong 文法形式 answers grouped by the confusable cluster the wrong pick fell in
//             (option that equals a confusable's pattern → that cluster; else 'other').
export function scoreExam(answers, questions) {
  const ans = Array.isArray(answers) ? answers : [];
  const qs = Array.isArray(questions) ? questions : [];
  const byFormat = { kata: { correct: 0, total: 0 }, star: { correct: 0, total: 0 }, passage: { correct: 0, total: 0 } };
  const byCluster = {};
  let raw = 0, skipped = 0;
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], a = ans[i], f = q && q.format;
    if (byFormat[f]) byFormat[f].total++;
    const unanswered = a == null || (Array.isArray(a) && a.length === 0);
    if (unanswered) skipped++;
    let ok = false;
    if (f === 'kata') {
      ok = typeof a === 'number' && a === q.mcq.correct;
      if (!ok && !unanswered) {   // only a real mis-pick lands in a trap cluster; a blank is 'skipped', not a wrong choice
        const chosen = q.mcq.options[a] != null ? q.mcq.options[a] : null;
        const cid = (chosen && q.optionClusters) ? q.optionClusters[chosen] : null;
        const key = cid || 'other';
        if (!byCluster[key]) byCluster[key] = { count: 0, cluster: cid || null, chosen: cid ? chosen : null };
        byCluster[key].count++;
      }
    } else if (f === 'passage') {
      const chosen = (typeof a === 'number' && q.blank.options[a] != null) ? q.blank.options[a] : null;
      ok = chosen != null && chosen === q.blank.answer;
    } else if (f === 'star') {
      const order = q.scramble && q.scramble.order;
      ok = Array.isArray(a) && Array.isArray(order) && a.length === order.length && a.every((v, k) => v === order[k]);
    }
    if (ok) { raw++; if (byFormat[f]) byFormat[f].correct++; }
  }
  return { raw, total: qs.length, byFormat, byCluster, skipped };
}

// examBand(raw, total) → { pct, label }. An INDICATIVE directional band — NOT a section verdict.
// The caller pairs it with the honest 19/60 sectional-floor label (this mock is the grammar half only).
export function examBand(raw, total) {
  const pct = total ? Math.round(raw / total * 100) : 0;
  let label;
  if (pct < 40) label = 'Well below';
  else if (pct < 60) label = 'Approaching';
  else if (pct < 75) label = 'Borderline';
  else if (pct < 90) label = 'On track';
  else label = 'Strong';
  return { pct, label };
}

// recordExam(state, entry) → new state with the exam appended to the bounded `examLog` ring (pure
// append; last EXAM_LOG_MAX kept). Initialised on first write like `units`/`log`, so a migrated
// pre-R13 state gains it without a schema bump. entry: { level, date, raw, total, byFormat }.
export function recordExam(state, entry) {
  const log = Array.isArray(state && state.examLog) ? state.examLog : [];
  const next = [...log, entry].slice(-EXAM_LOG_MAX);
  return { ...state, examLog: next };
}
