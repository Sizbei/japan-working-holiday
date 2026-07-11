'use strict';
// Anki .apkg media plumbing: parse the archive's 'media' manifest + pull [sound:]/<img>
// refs out of note fields, plus a thin IndexedDB blob store for the extracted files.
// The PURE half (top) is import-safe in Node — no top-level indexedDB touch — and does
// NO display cleaning (that stays in anki.js); it returns RAW filenames verbatim.

// ---- PURE (node-testable) --------------------------------------------------------

// the apkg 'media' entry is JSON {"0":"a.mp3","1":"b.jpg",…} mapping numbered zip
// entry → original filename. We INVERT it: Map<filename → numbered entry name> so a
// [sound:a.mp3] ref can find the actual "0" file inside the zip. Skips non-numeric keys.
export function parseMediaManifest(u8) {
  let obj;
  try {
    const text = u8 instanceof Uint8Array ? new TextDecoder('utf-8').decode(u8) : String(u8 ?? '');
    obj = JSON.parse(text);
  } catch { throw new Error('media manifest is not valid JSON'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('media manifest is not an object');
  const map = new Map();
  for (const [entry, name] of Object.entries(obj)) {
    if (!/^\d+$/.test(entry)) continue;          // skip weird/non-numeric keys
    if (typeof name !== 'string' || !name) continue;
    map.set(name, entry);                        // filename → numbered entry name
  }
  return map;
}

// first [sound:FILE] in an Anki field → FILE (raw, no decode) or null. The FILE run
// stops at the first ']' so entities/attrs elsewhere in the field can't fool it.
export function soundRef(field) {
  const m = /\[sound:([^\]]+)\]/.exec(String(field ?? ''));
  return m ? m[1] : null;
}

// first <img … src="FILE"> src (single / double / unquoted), case-insensitive tag →
// FILE (raw) or null. Extra attributes before/after src are tolerated.
export function imgRef(field) {
  const s = String(field ?? '');
  const m = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(s);
  if (!m) return null;
  const val = m[2] ?? m[3] ?? m[4] ?? '';
  return val || null;
}

// cards [{a?, img?}] → Set of unique filenames referenced (audio + image, deduped).
export function mediaRefs(cards) {
  const out = new Set();
  for (const c of cards || []) {
    if (!c) continue;
    const snd = soundRef(c.a);
    if (snd) out.add(snd);
    const img = imgRef(c.img);
    if (img) out.add(img);
  }
  return out;
}

// notes.flds is a single string with fields joined by \x1f (unit separator). Split each
// note into its field array; empty trailing fields are preserved ('a\x1fb\x1f' → ['a','b','']).
export function notesToRawCards(fldsList) {
  return (fldsList || []).map(flds => String(flds ?? '').split('\x1f'));
}

// ---- BROWSER (IndexedDB blob store) ----------------------------------------------
// Lazily opened once, connection reused. In Node (no indexedDB) every op rejects.

const DB_NAME = 'jwh-anki-media';
const DB_VERSION = 1;
const STORE = 'files';
let _dbPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  return _dbPromise;
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'));
    if (req) req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  }));
}

export function mediaPut(name, blob) { return tx('readwrite', s => s.put(blob, name)).then(() => undefined); }
export function mediaGet(name) { return tx('readonly', s => s.get(name)).then(v => v ?? null); }
export function mediaClear() { return tx('readwrite', s => s.clear()).then(() => undefined); }
export function mediaCount() { return tx('readonly', s => s.count()); }
