'use strict';
// Pure question generators + answer-matching for #/study (the grammar gym). R2 ships the
// typed-cloze generator and the answer arbitration; scramble/MCQ/passage generators land in
// later rounds (R4/R8/R12). 100% pure: no DOM, no store, no Date. Node-import-safe and
// unit-tested from the repo root (see tests/lib.test.mjs).
// Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R2).

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
