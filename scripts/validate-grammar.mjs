#!/usr/bin/env node
'use strict';
// Grammar-data validator — gates every grammar data PR (plan P1, specs/plans/
// 2026-07-10-jlpt-grammar.md). Checks SHAPE, not truth: a wrong-but-well-formed reading
// passes here; that risk is owned by the per-batch reading review. Validation ≠ escaping —
// the renderer still esc()es every field.
//
// Usage: node scripts/validate-grammar.mjs [file...]     (default: docs/data/grammar-*.json)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const CONFIDENCE = ['high', 'medium', 'low'];
const PEG_KINDS = ['verbatim', 'styled'];
// Register-honesty tags (yakuwarigo research). Absence of flags = standard neutral-polite.
const FLAG_VOCAB = ['anime-common', 'casual-spoken', 'written-formal', 'yakuwarigo-recognize-only', 'rude-in-life', 'keigo-critical'];
const ID_RE = /^n[1-5]-[a-z0-9]+(-[a-z0-9]+)*$/;
const KANA_SEG = /^[ぁ-ゖァ-ヺーー]*$/;        // token furigana readings
const READING_RE = /^[ぁ-ゖーー〜・]+$/;                  // point reading: hiragana + 〜 + ・ (dual-form patterns)
const KANJI = /[一-鿿々]/;

// Pure: validate an array of points for one level file. `allIds` (a Set) enables
// cross-file `related`/`confusable` referential checks — pass the union of every loaded
// file's ids. `allById` (an id→point Map, OPTIONAL) additionally enables the R7 confusable
// symmetry check and the "≥3 MCQ wrong-options" corpus gate — pass the full corpus map to
// arm those (fixture callers that only test shape rules may omit it).
export function validatePoints(points, level, allIds, allById) {
  const errs = [];
  const bad = (id, msg) => errs.push(`${id || '(no id)'}: ${msg}`);
  if (!Array.isArray(points)) return ['file: top level must be an array of points'];
  const seenPatterns = new Map();
  points.forEach((p, i) => {
    const id = p && p.id;
    if (!p || typeof p !== 'object') return bad(`[${i}]`, 'not an object');
    if (!ID_RE.test(String(id || ''))) bad(id || `[${i}]`, 'bad id format');
    if (p.level !== level) bad(id, `level ${p.level} ≠ file level ${level}`);
    if (!LEVELS.includes(p.level)) bad(id, 'bad level enum');
    if (!p.pattern || typeof p.pattern !== 'string') bad(id, 'missing pattern');
    if (KANJI.test(p.pattern || '') && !p.reading) bad(id, 'pattern has kanji but no reading');
    if (p.reading && !READING_RE.test(p.reading)) bad(id, `reading not kana: ${p.reading}`);
    if (!p.meaning) bad(id, 'missing meaning');
    if (!p.connection) bad(id, 'missing connection');
    // depth fields (owner 2026-07-11: every lesson expands to textbook depth, uniformly)
    if (!p.nuance || typeof p.nuance !== 'string') bad(id, 'missing nuance');
    if (!p.register || !/^[a-z][a-z /-]*$/.test(p.register)) bad(id, 'missing/bad register (lowercase, e.g. "neutral", "casual", "formal/written")');
    if (!p.caution || typeof p.caution !== 'string') bad(id, 'missing caution');
    if (!CONFIDENCE.includes(p.confidence)) bad(id, 'bad confidence');
    if (!Array.isArray(p.tags)) bad(id, 'tags must be an array');
    if (!Array.isArray(p.related)) bad(id, 'related must be an array');
    else p.related.forEach(r => { if (!allIds.has(r)) bad(id, `related → unknown id ${r}`); });
    // R7 confusable graph + distractors (both OPTIONAL). confusable: a SYMMETRIC id graph
    // (cross-file OK like related, no self-ref) authoring the deliberate near-synonym traps;
    // distractors: 2–4 authored wrong surface strings for when confusables can't fill a
    // 4-choice set. Referential + self-ref + distractor-shape run always; symmetry + the
    // "≥3 wrong-options" gate run only when the full corpus map (allById) is supplied.
    if (p.confusable !== undefined) {
      if (!Array.isArray(p.confusable)) bad(id, 'confusable must be an array');
      else p.confusable.forEach(c => {
        if (c === id) bad(id, 'confusable → self-reference');
        else if (!allIds.has(c)) bad(id, `confusable → unknown id ${c}`);
        else if (allById && !(Array.isArray(allById.get(c)?.confusable) && allById.get(c).confusable.includes(id)))
          bad(id, `confusable → ${c} not symmetric (${c} must list ${id} back)`);
      });
    }
    if (p.distractors !== undefined) {
      if (!Array.isArray(p.distractors)) bad(id, 'distractors must be an array');
      else {
        if (p.distractors.length < 2 || p.distractors.length > 4) bad(id, `distractors must have 2–4 entries (has ${p.distractors.length})`);
        p.distractors.forEach(d => {
          if (typeof d !== 'string' || !d) bad(id, `distractor must be a non-empty string (got ${JSON.stringify(d)})`);
          else if (d === p.pattern) bad(id, `distractor "${d}" equals the point's own pattern`);
        });
      }
    }
    // corpus gate: every point must assemble ≥3 distinct wrong options so a 4-choice MCQ is
    // always possible. Only armed when the full corpus map is passed.
    if (allById) {
      const opts = mcqOptions(p, allById);
      if (opts.length < 3) bad(id, `cannot assemble ≥3 MCQ wrong-options (has ${opts.length}) — add confusables/distractors`);
    }
    if (seenPatterns.has(p.pattern)) bad(id, `duplicate pattern (also ${seenPatterns.get(p.pattern)})`);
    seenPatterns.set(p.pattern, id);
    // peg (R5 anime doctrine): a famous line (verbatim) or in-character original (styled)
    // as the retrieval hook — NOT a hint tier. Verbatim is catchphrase-length + attributed.
    if (!p.peg || typeof p.peg !== 'object' || Array.isArray(p.peg)) bad(id, 'missing peg object');
    else {
      const peg = p.peg;
      for (const k of ['ja', 'romaji', 'en', 'source', 'kind']) {
        if (typeof peg[k] !== 'string' || !peg[k]) bad(id, `peg.${k} must be a non-empty string`);
      }
      if (typeof peg.kind === 'string' && !PEG_KINDS.includes(peg.kind)) bad(id, `peg.kind must be one of ${PEG_KINDS.join('|')}`);
      if (typeof peg.source === 'string' && peg.source.length < 2) bad(id, 'peg.source too short (need ≥2 chars)');
      if (peg.kind === 'verbatim' && typeof peg.ja === 'string') {
        if ([...peg.ja].length > 40) bad(id, `verbatim peg.ja > 40 code points (${[...peg.ja].length})`);
        if (peg.ja.includes('\n')) bad(id, 'verbatim peg.ja must be a single line');
      }
      if (peg.kind === 'verbatim' && typeof peg.source === 'string' && !(peg.source.includes('—') || peg.source.includes(' - '))) {
        bad(id, 'verbatim peg.source needs attribution (e.g. "Title — Character")');
      }
    }
    // flags[] (register honesty): closed vocabulary, no duplicates, may be empty
    if (!Array.isArray(p.flags)) bad(id, 'flags must be an array (may be empty)');
    else {
      const seenFlags = new Set();
      p.flags.forEach(fl => {
        if (!FLAG_VOCAB.includes(fl)) bad(id, `unknown flag ${JSON.stringify(fl)}`);
        if (seenFlags.has(fl)) bad(id, `duplicate flag ${JSON.stringify(fl)}`);
        seenFlags.add(fl);
      });
    }
    if (!Array.isArray(p.examples) || p.examples.length !== 3) {
      bad(id, 'examples must be an array of exactly 3'); return;
    }
    p.examples.forEach((ex, j) => {
      const at = `${id} ex[${j}]`;
      if (!ex || !ex.en) bad(at, 'missing en');
      if (!Array.isArray(ex.ja) || !ex.ja.length) return bad(at, 'ja tokens missing');
      let hasP = false;
      ex.ja.forEach((tok, k) => {
        const tat = `${at} tok[${k}]`;
        if (typeof tok === 'string') { if (!tok) bad(tat, 'empty string token'); return; }
        if (!tok || typeof tok !== 'object') return bad(tat, 'bad token type');
        if (!tok.t || typeof tok.t !== 'string') return bad(tat, 'object token missing t');
        if (!Array.isArray(tok.f) || !tok.f.length) return bad(tat, `"${tok.t}": missing f segments`);
        let cat = '';
        tok.f.forEach(seg => {
          if (!Array.isArray(seg) || seg.length !== 2 || !seg[0] || typeof seg[1] !== 'string') return bad(tat, `"${tok.t}": bad f segment`);
          if (!KANA_SEG.test(seg[1])) bad(tat, `"${tok.t}": reading not kana: ${seg[1]}`);
          cat += seg[0];
        });
        if (cat !== tok.t) bad(tat, `f segments "${cat}" ≠ t "${tok.t}"`);
        if (tok.p !== undefined && tok.p !== 1) bad(tat, 'p must be 1 when present');
        if (tok.p) hasP = true;
        // g: required on non-p tokens; optional (but non-empty) on p tokens
        if (!tok.p && !tok.g) bad(tat, `"${tok.t}": non-p token missing g`);
        if (tok.g !== undefined && (typeof tok.g !== 'string' || !tok.g)) bad(tat, `"${tok.t}": empty g`);
      });
      if (!hasP) bad(at, 'no p (pattern) token in example');
    });
  });
  return errs;
}

// Pure (R8's MCQ generator consumes this): the candidate wrong-answer surface strings for a
// 4-choice question on `point` — its confusables' `pattern` fields (in order) followed by its
// authored `distractors[]`, deduped, with the point's own pattern excluded. `allById`
// (id→point Map, optional) resolves confusable ids to patterns; unresolved ids are skipped.
export function mcqOptions(point, allById) {
  const own = point && point.pattern;
  const byId = allById || new Map();
  const seen = new Set();
  const out = [];
  const add = (s) => {
    if (typeof s !== 'string' || !s || s === own || seen.has(s)) return;
    seen.add(s); out.push(s);
  };
  (Array.isArray(point && point.confusable) ? point.confusable : []).forEach(cid => {
    const c = byId.get(cid);
    if (c) add(c.pattern);
  });
  (Array.isArray(point && point.distractors) ? point.distractors : []).forEach(add);
  return out;
}

const UNIT_ID_RE = /^n[1-5]-u\d+$/;

// Pure: validate the R3 unit map (grammar-units.json). `allIds` (a Set) is the union of every
// corpus point id. Checks: unit id shape, level enum + level↔point-prefix agreement, sizes
// 6–16, no duplicate/unknown point ids, and — across all units — every corpus id covered
// EXACTLY once (the units are a navigation layer over the same 353 points, no gaps, no overlap).
export function validateUnits(units, allIds) {
  const errs = [];
  const bad = (id, msg) => errs.push(`${id || '(no unit id)'}: ${msg}`);
  if (!Array.isArray(units)) return ['file: top level must be an array of units'];
  const seenUnitIds = new Set();
  const coverage = new Map();   // point id → count across all units
  units.forEach((u, i) => {
    const id = u && u.id;
    if (!u || typeof u !== 'object') return bad(`[${i}]`, 'not an object');
    if (!UNIT_ID_RE.test(String(id || ''))) bad(id || `[${i}]`, 'bad unit id format (want n<level>-u<n>)');
    if (seenUnitIds.has(id)) bad(id, 'duplicate unit id');
    seenUnitIds.add(id);
    if (!LEVELS.includes(u.level)) bad(id, 'bad level enum');
    if (!u.title || typeof u.title !== 'string') bad(id, 'missing title');
    if (!Array.isArray(u.points)) { bad(id, 'points must be an array'); return; }
    if (u.points.length < 6 || u.points.length > 16) bad(id, `unit size ${u.points.length} out of range 6–16`);
    const levelPrefix = String(u.level || '').toLowerCase() + '-';
    u.points.forEach(pid => {
      if (!allIds.has(pid)) bad(id, `unknown point id ${pid}`);
      else if (u.level && !String(pid).startsWith(levelPrefix)) bad(id, `point ${pid} is not level ${u.level}`);
      coverage.set(pid, (coverage.get(pid) || 0) + 1);
    });
  });
  for (const [pid, n] of coverage) if (n > 1) bad('(coverage)', `point ${pid} appears in ${n} units`);
  for (const pid of allIds) if (!coverage.has(pid)) bad('(coverage)', `point ${pid} is in no unit`);
  return errs;
}

function main() {
  const dataDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs', 'data');
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(dataDir).filter(f => /^grammar-n[1-5]\.json$/.test(f)).map(f => join(dataDir, f));
  if (!files.length) { console.error('no grammar-*.json files found'); process.exit(1); }
  const loaded = files.map(f => {
    const level = (basename(f).match(/grammar-(n[1-5])\.json/) || [])[1]?.toUpperCase();
    return { file: f, level, points: JSON.parse(readFileSync(f, 'utf8')) };
  });
  const allIds = new Set(loaded.flatMap(l => l.points.map(p => p && p.id)));
  const allById = new Map(loaded.flatMap(l => l.points).map(p => [p && p.id, p]));
  let total = 0;
  for (const { file, level, points } of loaded) {
    const errs = validatePoints(points, level, allIds, allById);
    total += errs.length;
    const pegged = points.filter(p => p && p.peg).length;
    const flagged = points.filter(p => p && Array.isArray(p.flags) && p.flags.length).length;
    const confused = points.filter(p => p && Array.isArray(p.confusable) && p.confusable.length).length;
    console.log(`${basename(file)}: ${points.length} points (${pegged}/${points.length} pegs, ${flagged} flagged, ${confused} confusable-linked), ${errs.length} errors`);
    errs.forEach(e => console.log('  ✗ ' + e));
  }
  // Units file — validated against the union of every point id (only when the default full run
  // is used, or when it's explicitly passed).
  const unitsPath = join(dataDir, 'grammar-units.json');
  const runningDefault = !process.argv.slice(2).length;
  const unitsPassed = process.argv.slice(2).some(f => /grammar-units\.json$/.test(f));
  if (runningDefault || unitsPassed) {
    try {
      const units = JSON.parse(readFileSync(unitsPath, 'utf8'));
      const errs = validateUnits(units, allIds);
      total += errs.length;
      console.log(`grammar-units.json: ${Array.isArray(units) ? units.length : 0} units, ${errs.length} errors`);
      errs.forEach(e => console.log('  ✗ ' + e));
    } catch (err) {
      total += 1;
      console.log(`grammar-units.json: read/parse error — ${err.message}`);
    }
  }
  process.exit(total ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
