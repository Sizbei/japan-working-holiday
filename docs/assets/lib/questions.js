'use strict';
// Pure question generators + answer-matching for #/study (the grammar gym). R2 ships the
// typed-cloze generator and the answer arbitration; R4 adds the ★-scramble (文の組み立て)
// generator; MCQ/passage generators land in later rounds (R8/R12). 100% pure: no DOM, no
// store, no Date. Node-import-safe and unit-tested from the repo root (see tests/lib.test.mjs).
// Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R2 + R4).

import { readingOf } from './grammar.js';

// ── cloze ────────────────────────────────────────────────────────────────────
// Blank the pattern-anchored (`p`-marked) tokens of one example. Returns the token list
// re-shaped for rendering — each entry is { blank:true } for a p token, else { token } with
// the original token (string or object) preserved — plus the accepted answers: the concatenated
// SURFACE (`t`) of the p tokens AND their concatenated kana READING (via readingOf on the f
// segments). Both are accepted so a learner can type either kanji-surface or plain kana.
export function clozeFor(point, exampleIdx = 0) {
  const ex = (point && point.examples && point.examples[exampleIdx]) || null;
  const ja = (ex && Array.isArray(ex.ja)) ? ex.ja : [];
  const blankedTokens = [];
  let surface = '', reading = '';
  for (const tok of ja) {
    const isP = tok && typeof tok === 'object' && tok.p;
    if (isP) {
      blankedTokens.push({ blank: true, fill: String(tok.t || '') });   // per-blank reveal text
      surface += String(tok.t || '');
      reading += readingOf(tok.f) || String(tok.t || '');
    } else {
      blankedTokens.push({ blank: false, token: tok });
    }
  }
  // dedupe (kana-only patterns have surface === reading), drop empties
  const answers = [...new Set([surface, reading].filter(Boolean))];
  return { blankedTokens, answers, exampleIdx };
}

// ── answer normalisation ───────────────────────────────────────────────────────
// NFKC (folds full-width → ASCII, half-width kana → full-width), trim, strip spaces and the
// Japanese comma/period 、。, then fold katakana → hiragana so カ and か match. This is the
// canonical form both the learner's input and the accepted answers are compared in.
export function normalizeAnswer(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .trim()
    .replace(/[\s、。]/g, '')
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// ── Levenshtein (small, capped use) ────────────────────────────────────────────
// Two-row DP; inputs here are single short answers, so the O(a·b) cost is trivial.
export function levenshtein(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// checkAnswer(input, answers) → { ok, close }. ok = exact match (after normalisation) of any
// accepted answer; close = within Levenshtein 1 of any answer but not exact (the "take it?"
// prompt path — the session contract caps an accepted close-match at Hard).
export function checkAnswer(input, answers) {
  const ni = normalizeAnswer(input);
  if (!ni) return { ok: false, close: false };
  const norm = (answers || []).map(normalizeAnswer).filter(Boolean);
  if (norm.includes(ni)) return { ok: true, close: false };
  const close = norm.some(a => levenshtein(ni, a) === 1);
  return { ok: false, close };
}

// ── ★ scramble (文の組み立て) ─────────────────────────────────────────────────
// Group one example's tokens into exactly 4 contiguous chunks the learner must re-order. This
// is the JLPT 文の組み立て format: the exam ANSWER is which chunk lands on ★, but for learning
// the session checks the WHOLE order (matching how you must build the whole chain) and highlights
// the ★ chunk. 100% deterministic: `seed` shuffles PRESENTATION order only — the correct order,
// the chunk boundaries, and ★ are fixed by the sentence.
const PUNCT = /^[、。，．,.!?！？…‥・「」『』（）〜～\s]+$/;
const surfaceOf = (tok) => (typeof tok === 'string' ? tok : String((tok && tok.t) || ''));
const isPunctTok = (tok) => typeof tok === 'string' && PUNCT.test(tok);

// Deterministic FNV-1a seed hash (mirrors lib/study.js hash — kept local so questions.js stays
// import-standalone; the only randomness in this module).
function seedHash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Fisher–Yates over [0..n) driven by a small LCG — returns a permutation.
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

// Merge tokens into "units": punctuation glues to the PRECEDING unit so a chunk never begins on
// 。/、. Each unit tracks its surface, its furi segments (for ruby on the tile), and whether it
// holds a `p` (pattern) token.
function unitsOf(tokens) {
  const units = [];
  let lead = '';   // leading punctuation with nothing before it → prepended to the first real unit
  for (const tok of tokens) {
    const surf = surfaceOf(tok);
    if (isPunctTok(tok)) {
      if (units.length) { const u = units[units.length - 1]; u.text += surf; u.segs.push([surf, '']); }
      else lead += surf;
      continue;
    }
    const segs = [];
    if (typeof tok === 'string') segs.push([surf, '']);
    else if (Array.isArray(tok.f) && tok.f.length) for (const s of tok.f) segs.push([s[0] || '', s[1] || '']);
    else segs.push([surf, '']);
    units.push({ text: lead + surf, segs: lead ? [[lead, ''], ...segs] : segs, p: !!(tok && typeof tok === 'object' && tok.p) });
    lead = '';
  }
  if (lead && units.length) { const u = units[0]; u.text = lead + u.text; u.segs = [[lead, ''], ...u.segs]; }
  return units;
}

// scrambleFor(point, exampleIdx, seed?) → { chunks:[{text, rt?}], order:[correct chunk indices],
// star } or null when the example can't yield 4 non-empty chunks. `order.map(i => chunks[i].text)`
// reconstructs the original surface EXACTLY. `star` is the ★ SLOT — a position (0-indexed) in the
// correct order, always 1 or 2 (JLPT convention): the slot the first-`p` chunk lands in, clamped.
export function scrambleFor(point, exampleIdx = 0, seed) {
  const ex = (point && point.examples && point.examples[exampleIdx]) || null;
  const tokens = (ex && Array.isArray(ex.ja)) ? ex.ja : [];
  if (!tokens.length) return null;
  const units = unitsOf(tokens);
  if (units.length < 4) return null;                       // <4 usable tokens → not scramble-able

  // 4 balanced contiguous chunks. Clamping keeps 1 ≤ c1 < c2 < c3 ≤ U-1, so every chunk is
  // non-empty for any U ≥ 4; the pattern span, left as adjacent units, naturally straddles a
  // boundary when it spans ≥2 units (the authentic 文の組み立て difficulty).
  const U = units.length;
  const c1 = Math.min(Math.max(Math.round(U / 4), 1), U - 3);
  const c2 = Math.min(Math.max(Math.round(U / 2), c1 + 1), U - 2);
  const c3 = Math.min(Math.max(Math.round(3 * U / 4), c2 + 1), U - 1);
  const bounds = [0, c1, c2, c3, U];

  const correct = [];
  for (let k = 0; k < 4; k++) {
    const slice = units.slice(bounds[k], bounds[k + 1]);
    if (!slice.length) return null;                        // guard: never emit an empty chunk
    const chunk = { text: slice.map(u => u.text).join('') };
    let segs = [];
    for (const u of slice) segs = segs.concat(u.segs);
    if (segs.some(s => s[1])) chunk.rt = segs;             // ruby only when a segment carries a reading
    correct.push(chunk);
  }

  // ★ slot = the chunk holding the first p unit, clamped to positions 1..2 (0-indexed).
  let pUnit = units.findIndex(u => u.p);
  if (pUnit < 0) pUnit = 0;
  let pChunk = 0;
  for (let k = 0; k < 4; k++) if (pUnit >= bounds[k] && pUnit < bounds[k + 1]) { pChunk = k; break; }
  const star = Math.min(2, Math.max(1, pChunk));

  // presentation shuffle (seed touches THIS only): chunks[k] = correct[pres[k]]; order is inverse.
  const sd = (seed == null) ? seedHash(String((point && point.id) || '') + ':' + exampleIdx) : (seed >>> 0);
  let pres = lcgShuffle(4, sd);
  // never present the identity permutation (a pre-solved card) — rotate left by one, which is
  // deterministic and guaranteed non-identity for n=4. ~8% of raw shuffles were identity.
  if (pres.every((v, i) => v === i)) pres = [pres[1], pres[2], pres[3], pres[0]];
  const chunks = pres.map(i => correct[i]);
  const order = new Array(4);
  for (let k = 0; k < 4; k++) order[pres[k]] = k;
  return { chunks, order, star };
}

// scramblable(point) → true iff ANY of the point's examples yields a non-null scramble. Points
// whose every example is too short (n5-wa-dou-desu-ka, n4-te-sumimasen, n4-nakya) degrade to cloze/MCQ only.
export function scramblable(point) {
  const exs = (point && Array.isArray(point.examples)) ? point.examples : [];
  for (let i = 0; i < exs.length; i++) if (scrambleFor(point, i)) return true;
  return false;
}
