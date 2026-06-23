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
