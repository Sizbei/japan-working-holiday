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
const ID_RE = /^n[1-5]-[a-z0-9]+(-[a-z0-9]+)*$/;
const KANA_SEG = /^[ぁ-ゖァ-ヺーー]*$/;        // token furigana readings
const READING_RE = /^[ぁ-ゖーー〜・]+$/;                  // point reading: hiragana + 〜 + ・ (dual-form patterns)
const KANJI = /[一-鿿々]/;

// Pure: validate an array of points for one level file. `allIds` (a Set) enables
// cross-file `related` referential checks — pass the union of every loaded file's ids.
export function validatePoints(points, level, allIds) {
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
    if (!CONFIDENCE.includes(p.confidence)) bad(id, 'bad confidence');
    if (!Array.isArray(p.tags)) bad(id, 'tags must be an array');
    if (!Array.isArray(p.related)) bad(id, 'related must be an array');
    else p.related.forEach(r => { if (!allIds.has(r)) bad(id, `related → unknown id ${r}`); });
    if (seenPatterns.has(p.pattern)) bad(id, `duplicate pattern (also ${seenPatterns.get(p.pattern)})`);
    seenPatterns.set(p.pattern, id);
    if (!Array.isArray(p.examples) || p.examples.length < 1 || p.examples.length > 3) {
      bad(id, 'examples must be an array of 1–3'); return;
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
  let total = 0;
  for (const { file, level, points } of loaded) {
    const errs = validatePoints(points, level, allIds);
    total += errs.length;
    console.log(`${basename(file)}: ${points.length} points, ${errs.length} errors`);
    errs.forEach(e => console.log('  ✗ ' + e));
  }
  process.exit(total ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
