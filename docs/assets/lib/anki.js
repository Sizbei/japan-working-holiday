'use strict';
// Pure helpers for the Anki round-trip (TSV export/import) + note-field mapping.
// stripHtml is the one DOM-touching function — for DISPLAY cleanliness, not security
// (esc() on render is the XSS boundary). Import-safe: stripHtml degrades when DOMParser absent.

function cell(s) { return String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim(); }

export function toAnkiTSV(rows) {
  return (rows || []).map(r => [cell(r.front), cell(r.back), cell((r.tags || []).join(' '))].join('\t')).join('\n');
}

export function parseAnkiTSV(text) {
  return String(text || '').split(/\r?\n/)
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const cols = line.split('\t');
      const tagCol = (cols[2] || '').trim();
      return { front: (cols[0] || '').trim(), back: (cols[1] || '').trim(), tags: tagCol ? tagCol.split(/\s+/) : [] };
    })
    .filter(r => r.front);
}

const RE_JP = /front|expression|japanese|日本語|word|kanji/i;
const RE_EN = /back|meaning|english|英語|translation/i;
const RE_READ = /reading|kana|furigana|読み/i;
export function mapNoteFields(fields) {
  const named = (fields || []).map((f, i) => ({ i, name: (f && f.name) || '' }));
  const find = (re) => { const m = named.find(f => re.test(f.name)); return m ? m.i : -1; };
  let jpIdx = find(RE_JP), enIdx = find(RE_EN), readIdx = find(RE_READ);
  if (jpIdx < 0) jpIdx = 0;
  if (enIdx < 0) enIdx = (jpIdx === 1) ? 0 : 1;
  if (readIdx < 0) readIdx = 2;
  return { jpIdx, enIdx, readIdx };
}

export function stripHtml(s) {
  const str = String(s ?? '');
  if (typeof DOMParser === 'undefined') return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const doc = new DOMParser().parseFromString('<body>' + str, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

// ====================================================================================
// Core-2000 rapid refresher (2026-07-10 plan): parse a full Anki "Notes in Plain Text"
// export (any deck) into display cards — column AUTO-DETECT by charset, field cleaning
// ([sound:…], tags, furigana brackets), chunking, shaky pile, seeded shuffle. Pure.

const CJK_RE = /[一-鿿㐀-䶿]/;
const KANA_RE = /[぀-ゟ゠-ヿー]/;
const LATIN_RE = /[A-Za-z]/;

// strip Anki noise from a field for display: [sound:x], tags, 漢字[かんじ] furigana, entities
export function cleanField(v) {
  return String(v ?? '')
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/([一-鿿㐀-䶿])\s*\[[^\]]*\]/g, '$1')   // furigana brackets directly after kanji
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function sniffDelim(lines, header) {
  if (header.separator) {
    const map = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', colon: ':' };
    return map[header.separator.toLowerCase()] || header.separator;
  }
  let best = '\t', bestN = 0;
  for (const d of ['\t', ';', ',']) {
    const counts = lines.slice(0, 5).map(l => l.split(d).length - 1);
    const n = Math.min(...counts);
    if (n > bestN) { bestN = n; best = d; }
  }
  return best;
}

// score columns by charset → expression / reading / meaning / sentence / sentenceMeaning
export function detectColumns(rows) {
  const n = Math.max(...rows.map(r => r.length));
  const stats = Array.from({ length: n }, (_, i) => {
    const vals = rows.map(r => cleanField(r[i] || '')).filter(Boolean);
    const s = { i, kanji: 0, kana: 0, latin: 0, len: 0, sent: 0, filled: vals.length };
    for (const v of vals) {
      if (CJK_RE.test(v)) s.kanji++;
      if (KANA_RE.test(v) && !CJK_RE.test(v)) s.kana++;
      if (LATIN_RE.test(v) && !CJK_RE.test(v) && !KANA_RE.test(v)) s.latin++;
      s.len += v.length;
      if (/[。！？]/.test(v)) s.sent++;
    }
    s.len = vals.length ? s.len / vals.length : 0;
    return s;
  });
  const used = new Set();
  const pick = (pred, cmp) => {
    const c = stats.filter(x => !used.has(x.i) && x.filled && pred(x)).sort(cmp)[0];
    if (c) used.add(c.i);
    return c ? c.i : -1;
  };
  const sentence = pick(x => x.sent > x.filled * 0.5 && x.kanji, (a, b) => b.len - a.len);
  const expression = pick(x => x.kanji, (a, b) => a.len - b.len);
  const reading = pick(x => x.kana > x.filled * 0.6, (a, b) => a.len - b.len);
  const meaning = pick(x => x.latin > x.filled * 0.6 && x.sent <= x.filled * 0.5, (a, b) => a.len - b.len);
  const sentenceMeaning = pick(x => x.latin > x.filled * 0.6, (a, b) => b.len - a.len);
  return { expression, reading, meaning, sentence, sentenceMeaning };
}

/**
 * Parse a whole-deck export → { cards, cols, delim }. `mapping` overrides detected indices.
 * Card: { id, w, r, m, s, sm }. Throws on unusable input (caller shows the message).
 */
export function parseAnkiExport(text, mapping) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const header = {};
  const lines = [];
  for (const l of raw) {
    if (/^#\w+:/.test(l)) { const m = /^#(\w+):(.*)$/.exec(l); header[m[1]] = m[2]; continue; }
    if (l.trim()) lines.push(l);
  }
  if (!lines.length) throw new Error('no data rows');
  const delim = sniffDelim(lines, header);
  const rows = lines.map(l => l.split(delim));
  const cols = { ...detectColumns(rows.slice(0, 50)), ...(mapping || {}) };
  if (cols.expression < 0 && cols.meaning < 0) throw new Error('could not detect columns');
  const cards = rows.map((r, i) => ({
    id: 'a' + i,
    w: cleanField(r[cols.expression] ?? ''),
    r: cols.reading >= 0 ? cleanField(r[cols.reading] ?? '') : '',
    m: cols.meaning >= 0 ? cleanField(r[cols.meaning] ?? '') : '',
    s: cols.sentence >= 0 ? cleanField(r[cols.sentence] ?? '') : '',
    sm: cols.sentenceMeaning >= 0 ? cleanField(r[cols.sentenceMeaning] ?? '') : '',
  })).filter(c => c.w || c.m);
  if (!cards.length) throw new Error('no usable cards');
  return { cards, cols, delim };
}

export function chunkCount(total, size = 100) { return Math.max(1, Math.ceil(total / size)); }
export function chunkSlice(cards, chunk, size = 100) { return cards.slice(chunk * size, (chunk + 1) * size); }
export function chunkLabel(chunk, total, size = 100) {
  const a = chunk * size + 1, b = Math.min((chunk + 1) * size, total);
  return `${a}–${b}`;
}

export function toggleShaky(shaky, id) {
  const set = new Set(shaky || []);
  set.has(id) ? set.delete(id) : set.add(id);
  return [...set];
}

// deterministic mulberry32 shuffle — no Math.random in pure code; caller passes a seed
export function shuffled(cards, seed = 1) {
  let a = seed >>> 0;
  const rand = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// pile = flagged cards in DECK ORDER (stage 3; snapshot at run start — never mutated mid-run)
export function pileOrder(cards, shaky) {
  const set = new Set(shaky || []);
  return (cards || []).filter(c => c && set.has(c.id));
}
