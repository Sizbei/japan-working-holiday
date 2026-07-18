'use strict';
// Core-2000 rapid refresher (#/phrases → "Core deck" section). Import your own Anki
// .apkg deck export (unzipped + read client-side — keeps audio/images), shown as a stream of
// one-card-at-a-time display cards — everything visible at once, NO per-card animation (a 100+×/session surface;
// the frequency gate says instant). Owner's HYBRID design: stream is the default; the skim
// list + shaky re-run is STAGE 3 (not built here). All state device-local (jwh-anki-v1),
// walked automatically by the backup export/import (it iterates jwh-* keys).
//
// The imported file is UNTRUSTED input: every dynamic field goes through esc() before innerHTML
// (cleanField in lib/anki.js is for display cleanliness, esc() is the XSS boundary).

import { $, esc } from './lib/dom.js';
import { KEYS, get, set, del, getRaw, setRaw } from './lib/store.js';
import { confirmModal, askText, openDialog } from './lib/modal.js';
import { speak, canSpeak } from './speak.js';
import {
  cardsFromRows, chunkCount, chunkSlice, chunkLabel, toggleShaky, shuffled, pileOrder,
} from './lib/anki.js';
import { listZip, readZipEntry } from './lib/zip.js';
import { openSqlite, sqliteTables, sqliteRows } from './lib/sqlite.js';
import { parseMediaManifest, soundRef, imgRef, mediaPut, mediaGet, mediaClear, mediaDeletePrefix } from './lib/ankimedia.js';

const CHUNK = 100;
const FIELDS = ['expression', 'reading', 'meaning', 'sentence', 'sentenceMeaning'];
const FIELD_LABEL = { expression: 'word', reading: 'reading', meaning: 'meaning', sentence: 'sentence', sentenceMeaning: 'sentence meaning' };

let DATA = null;         // last parse result held for the preview → save step: { cards, cols, delim, raw }
let root = null;

// ---- deck LIBRARY: several saved decks + history. The INDEX (KEYS.ankiLib) holds only lightweight
// metadata; each deck's full data (cards + resume state) lives under its own key jwh-anki-d-<id>, so
// advancing a card rewrites ONE deck, not the whole library. Media is deck-scoped (<id>/<filename>).
const deckKey = id => 'jwh-anki-d-' + id;
function genId() { return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
function deckBody(d) { return { cards: d.cards, pos: d.pos, shaky: d.shaky, shuffle: d.shuffle, seed: d.seed, view: d.view === 'skim' ? 'skim' : 'stream', autoplay: !!d.autoplay, chunk: d.chunk | 0 }; }

function loadLib() {
  const raw = get(KEYS.ankiLib, null);
  let lib = (raw && typeof raw === 'object' && Array.isArray(raw.decks))
    ? { active: raw.active || null, decks: raw.decks.filter(m => m && m.id).map(m => ({ id: m.id, name: String(m.name || 'Deck').slice(0, 60), cardCount: m.cardCount | 0, importedAt: m.importedAt | 0 })) }
    : { active: null, decks: [] };
  // one-time migration: fold the legacy single deck (KEYS.anki) into the library
  if (!lib.decks.length) {
    const old = get(KEYS.anki, null);
    if (old && typeof old === 'object' && Array.isArray(old.cards) && old.cards.length) {
      const id = genId();
      set(deckKey(id), deckBody({ cards: old.cards, pos: old.pos, shaky: old.shaky, shuffle: old.shuffle, seed: old.seed, view: old.view, autoplay: old.autoplay }));
      lib = { active: id, decks: [{ id, name: 'My deck', cardCount: old.cards.length, importedAt: 0 }] };
      set(KEYS.ankiLib, lib);
      del(KEYS.anki);   // migrated — drop the legacy blob so it can't resurrect on a later empty lib
    }
  }
  if (lib.decks.length && !lib.decks.some(d => d.id === lib.active)) lib.active = lib.decks[0].id;
  return lib;
}
function saveLib(lib) { set(KEYS.ankiLib, { active: lib.active, decks: lib.decks }); }
function deckMeta() { return loadLib().decks; }

function loadDeck() {
  const lib = loadLib();
  if (!lib.active) return null;
  const d = get(deckKey(lib.active), null);
  if (!d || typeof d !== 'object' || !Array.isArray(d.cards) || !d.cards.length) return null;
  return {
    id: lib.active,
    name: lib.decks.find(m => m.id === lib.active)?.name || 'Deck',
    cards: d.cards,
    pos: (d.pos && typeof d.pos === 'object' && !Array.isArray(d.pos)) ? d.pos : {},
    shaky: Array.isArray(d.shaky) ? d.shaky : [],
    shuffle: !!d.shuffle,
    seed: Number.isFinite(d.seed) ? d.seed : 1,
    view: d.view === 'skim' ? 'skim' : 'stream',
    autoplay: !!d.autoplay,
    chunk: Number.isFinite(d.chunk) ? d.chunk : 0,   // the set you were on (100-card chunk) — restored on re-entry
  };
}
// persist the ACTIVE deck's data (one key — never touches other decks). set() returns false on a full
// quota (it never throws — it also fires the global jwh:storage-full modal); returned for callers who care.
function saveDeck(d) { if (!d || !d.id) return true; return set(deckKey(d.id), deckBody(d)); }

// add a freshly-imported deck to the library and make it active. Returns false if the data write hit
// the quota (set() returns false, doesn't throw) so the Save handler can roll back + warn.
function addDeck(id, name, body) {
  if (!set(deckKey(id), deckBody(body))) return false;
  const lib = loadLib();
  lib.decks = [{ id, name: String(name || 'Deck').slice(0, 60), cardCount: body.cards.length, importedAt: Date.now() }, ...lib.decks.filter(d => d.id !== id)];
  lib.active = id;
  saveLib(lib);
  return true;
}
function switchDeck(id) {
  const lib = loadLib();
  if (!lib.decks.some(d => d.id === id) || id === lib.active) return;
  lib.active = id; saveLib(lib);
  stream = null; DATA = null; render();
}
function renameDeck(id, name) {
  const lib = loadLib();
  const d = lib.decks.find(x => x.id === id);
  if (!d) return;
  d.name = String(name || '').trim().slice(0, 60) || d.name;
  saveLib(lib);
}
function deleteDeck(id) {
  del(deckKey(id));
  mediaDeletePrefix(id + '/').catch(() => {});
  const lib = loadLib();
  lib.decks = lib.decks.filter(d => d.id !== id);
  if (lib.active === id) lib.active = lib.decks[0]?.id || null;
  saveLib(lib);
}

// Study toggles — hide the reading (hiragana), the English meaning, or the example sentence to
// self-quiz. Persisted sentinels (own keys, independent of the site furigana). English HIDDEN by default.
function hiraOff() { return getRaw(KEYS.ankiHira, '') === 'off'; }
function enOff() { return getRaw(KEYS.ankiEn, 'off') === 'off'; }
function exOff() { return getRaw(KEYS.ankiEx, '') === 'off'; }
function flipHira() { setRaw(KEYS.ankiHira, hiraOff() ? '' : 'off'); applyToggles(); }
function flipEn() { setRaw(KEYS.ankiEn, enOff() ? '' : 'off'); applyToggles(); }
function flipEx() { setRaw(KEYS.ankiEx, exOff() ? '' : 'off'); applyToggles(); }
// reflect the toggle state as classes on the deck ROOT (they survive the innerHTML rebuilds) — CSS
// hides `.ank-word rt` / `.ank-mean`+`.ank-sentm` / `.ank-sent` with visibility so nothing reflows.
// ank-has-hidden gates the per-card "Reveal" peek (only offered when something is actually hidden).
function applyToggles() {
  if (!root) return;
  const h = hiraOff(), e = enOff(), x = exOff();
  root.classList.toggle('ank-hira-off', h);
  root.classList.toggle('ank-en-off', e);
  root.classList.toggle('ank-ex-off', x);
  root.classList.toggle('ank-has-hidden', h || e || x);
  const hb = $('#ankHira'); if (hb) { hb.classList.toggle('is-on', !h); hb.setAttribute('aria-pressed', String(!h)); }
  const eb = $('#ankEn'); if (eb) { eb.classList.toggle('is-on', !e); eb.setAttribute('aria-pressed', String(!e)); }
  const xb = $('#ankEx'); if (xb) { xb.classList.toggle('is-on', !x); xb.setAttribute('aria-pressed', String(!x)); }
}
// peek the hidden side on the CURRENT card (transient — paintCard clears it on the next card)
function revealCard() { $('#ankCard')?.classList.add('ank-revealed'); scheduleAuto(); }
// flashcard flow: if a field is hidden and not yet shown, the FIRST Space/tap flips to the answer;
// the next one advances. When nothing is hidden it just advances (fast-refresher behavior).
function revealOrAdvance() {
  if (root?.classList.contains('ank-has-hidden') && !$('#ankCard')?.classList.contains('ank-revealed')) revealCard();
  else advance(1);
}

// quick-edit the CURRENT card's fields (fix an import typo / bad column split) — writes back to the deck.
const EDIT_FIELDS = [['w', 'Word'], ['r', 'Reading'], ['m', 'Meaning'], ['s', 'Example sentence'], ['sm', 'Sentence meaning']];
async function editCard() {
  if (!stream || stream.deck.view === 'skim') return;
  if (document.querySelector('[aria-modal="true"]')) return;   // a dialog is already open — don't stack
  const card = stream.order?.[stream.idx];
  if (!card) return;
  stopAuto();
  const body = EDIT_FIELDS.map(([k, label]) =>
    `<label class="ank-edit-f"><span>${esc(label)}</span><input data-f="${k}" value="${esc(card[k] || '')}" lang="ja"></label>`).join('');
  const vals = await openDialog(
    `<h2 id="amTitle" class="app-modal-title">Edit card</h2><div class="app-modal-body ank-edit">${body}</div>
     <div class="app-modal-acts"><button type="button" class="am-btn" data-cancel>Cancel</button><button type="button" class="am-btn am-primary" data-save>Save</button></div>`,
    { onMount: (el, done) => {
        el.querySelector('[data-cancel]').addEventListener('click', () => done(null));
        el.querySelector('[data-save]').addEventListener('click', () => {
          const out = {}; el.querySelectorAll('input[data-f]').forEach(i => out[i.dataset.f] = i.value.trim());
          done(out);
        });
      }, initialFocus: 'input[data-f="w"]' });
  if (!vals) { scheduleAuto(); return; }   // cancelled
  const target = stream.deck.cards.find(c => c.id === card.id) || card;   // same object either way, by id to be safe
  Object.assign(target, vals);
  saveDeck(stream.deck);
  paintCard();
}

// ---- auto-advance: hands-free drilling. Delay (seconds) cycles off → 4s → 8s. Each tick does one
// revealOrAdvance (so a hidden card flips, then advances) — the resulting paintCard/revealCard reschedules,
// which also resets the countdown on any manual step. Stops itself when the deck isn't visible.
const AUTO_STEPS = ['', '4', '8'];
let _autoT = null;
function autoAdvSecs() { const n = parseInt(getRaw(KEYS.ankiAutoAdv, ''), 10); return Number.isFinite(n) && n > 0 ? n : 0; }
function stopAuto() { if (_autoT) { clearTimeout(_autoT); _autoT = null; } }
// don't auto-advance when the deck isn't the focus: hidden route, skim view, or the search dropdown is
// open (the user is reading/choosing a result — cards must not flip under them).
function autoBlocked() {
  return !stream || !root || root.offsetParent === null || stream.deck.view === 'skim'
    || $('#ankSearchRes')?.hidden === false;
}
function scheduleAuto() {
  stopAuto();
  if (!autoAdvSecs() || autoBlocked()) return;
  _autoT = setTimeout(() => { if (autoBlocked()) { stopAuto(); return; } revealOrAdvance(); }, autoAdvSecs() * 1000);
}
function syncAutoAdv() {
  const b = $('#ankAutoAdv'); if (!b) return;
  const s = autoAdvSecs();
  b.classList.toggle('is-on', !!s);
  b.setAttribute('aria-pressed', String(!!s));
  b.textContent = s ? `⏱ Auto ${s}s` : '⏱ Auto-advance';
}

export function mountAnki() {
  DATA = null;
  root = $('#ankiDeck');
  if (!root) return;
  wireDeckKeys();
  render();
}

// Deck keys at DOCUMENT level (attached once) so ←/→/Space/S/P drive the refresher the moment the
// Phrases page is open — no click-to-focus first (owner: the refresher is the main surface). Guarded to
// the deck being visible (offsetParent null when the route is hidden) and to skip while typing in a field.
let _kbdWired = false;
function wireDeckKeys() {
  if (_kbdWired) return;
  _kbdWired = true;
  document.addEventListener('keydown', (e) => {
    if (!stream || !root || root.offsetParent === null) return;   // deck not mounted / route hidden
    if (stream.deck.view === 'skim') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;               // leave Cmd/Ctrl/Alt combos (palette, undo…)
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (t && t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;   // let a focused button activate
    if (e.key === 'p' || e.key === 'P') { $('#ankAudio')?.click(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); flipHira(); return; }   // n = hiragana
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); flipEn(); return; }     // m = English
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); editCard(); return; }   // e = edit this card
    if (e.key === 'ArrowDown') { e.preventDefault(); revealCard(); return; }          // ↓ = reveal the hidden side
    if (e.key === ' ') { e.preventDefault(); revealOrAdvance(); return; }             // Space = flip to the answer, then advance
    if (e.key === 'ArrowRight' || e.key === '.') { e.preventDefault(); advance(1); }   // . = forward (skip without revealing)
    else if (e.key === 'ArrowLeft' || e.key === ',') { e.preventDefault(); advance(-1); }   // , = back
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleShakyCurrent(); }
  });
}

function render() {
  if (!root) return;
  _lastAutoId = null;   // fresh deck load (mount / Replace) — don't let a repeated card id (a0, a1…) skip autoplay
  const deck = loadDeck();
  if (deck) (deck.view === 'skim' ? renderSkim(deck) : renderStream(deck));
  else renderImport();
}

// ───────────────────────────── import / empty state ─────────────────────────────

function renderImport(preview) {
  root.innerHTML = `
    <div class="ank-head">
      <h3 class="ank-h">Core deck — rapid refresher</h3>
      <p class="ank-sub">Blast through your Anki cards with the answer already showing — a fast refresher, not a review session. Your export stays on this device.</p>
    </div>
    ${deckBarHTML()}
    <div class="ank-drop" id="ankDrop" tabindex="0" role="button" aria-label="Drop an Anki .apkg export file, or choose a file">
      <span class="ank-drop-ic" aria-hidden="true">⬇</span>
      <span class="ank-drop-t">Drop your Anki <b>.apkg</b> export (full deck — keeps audio/images). When exporting, tick <b>“Support older Anki versions”</b>.</span>
      <span class="ank-drop-or">or</span>
      <button type="button" class="ank-btn" id="ankPick">Choose a file</button>
      <input type="file" id="ankFile" accept=".apkg" hidden>
    </div>
    <div class="ank-err" id="ankErr" role="alert" hidden></div>
    <div class="ank-preview" id="ankPreview" hidden></div>`;
  wireImport();
  wireDeckChips();   // the deck bar shows here too when the library isn't empty — keep switch/delete working
  if (preview) showPreview(preview);
}

function wireImport() {
  const drop = $('#ankDrop'), pick = $('#ankPick'), file = $('#ankFile');
  pick?.addEventListener('click', () => file?.click());
  drop?.addEventListener('click', (e) => { if (e.target === pick) return; file?.click(); });
  drop?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file?.click(); } });
  file?.addEventListener('change', () => { const f = file.files && file.files[0]; if (f) readFile(f); file.value = ''; });
  ['dragenter', 'dragover'].forEach(t => drop?.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop?.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop?.addEventListener('drop', (e) => { const f = e.dataTransfer?.files && e.dataTransfer.files[0]; if (f) readFile(f); });
}

function showErr(msg) {
  const el = $('#ankErr');
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false; el.textContent = msg;   // textContent = auto-escaped
}

function readFile(f) {
  showErr('');
  if (/\.apkg$/i.test(f.name || '')) { importApkg(f); return; }
  showErr('Please choose an Anki .apkg export — in Anki: File → Export → Anki Deck Package, and tick “Support older Anki versions”.');
}

// ---- .apkg import: unzip → minimal sqlite read of notes.flds → the SAME preview/remap
// flow as the TSV path. Media (audio/images) extracts into IndexedDB at Save time.
// zstd-only exports (collection.anki21b, Anki 2.1.50+ default) can't be read without a
// zstd decoder — the error tells the owner to re-export with the legacy checkbox.
function colIdx(createSql, name) {
  // Strip SQL comments FIRST. Anki's real `notes` schema annotates every column with a `/* N */`
  // index comment; because that comment sits AFTER the column's comma, a naive comma-split glues
  // it onto the NEXT column's name (`flds` parses as `/*`), so the field is never found → an empty
  // import that silently fails. Drop /* … */ and -- … comments before splitting.
  const sql = String(createSql || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const inner = /\(([\s\S]*)\)/.exec(sql);
  if (!inner) return -1;
  return inner[1].split(',').map(s => s.trim().split(/\s+/)[0].replace(/["'\u0060\[\]]/g, '')).indexOf(name);
}
// the real deck name lives in the collection's `col.decks` JSON ({deckId: {name, dyn}}). Pick the first
// real (non-Default, non-filtered) deck; deck paths are "Parent::Child" so keep the leaf. '' → caller
// falls back to the filename. Best-effort — any schema surprise just yields '' (never throws the import).
function readDeckName(db) {
  try {
    const colTbl = sqliteTables(db).find(t => t.name === 'col');
    if (!colTbl) return '';
    const di = colIdx(colTbl.sql, 'decks');
    if (di < 0) return '';
    const row = sqliteRows(db, 'col')[0];
    const decks = JSON.parse(row && row[di] || '{}');
    const names = Object.values(decks).filter(d => d && d.name && d.name !== 'Default' && !d.dyn).map(d => String(d.name));
    const name = names.sort((a, b) => a.length - b.length)[0] || '';   // shortest = usually the top-level deck
    return (name.includes('::') ? name.split('::').pop() : name).trim().slice(0, 60);
  } catch { return ''; }
}
const MAX_APKG = 300 * 1024 * 1024;   // 300MB — a Core-2000-with-audio apkg is ~50MB; guards f.arrayBuffer() OOM on a hostile huge file
const MEDIA_CAP = 250 * 1024 * 1024;  // stop writing media to IndexedDB past this (quota guard)
async function importApkg(f) {
  try {
    showErr('');
    if (f.size > MAX_APKG) throw new Error('file too large (' + Math.round(f.size / 1048576) + 'MB) — is this really an Anki export?');
    const u8 = new Uint8Array(await f.arrayBuffer());
    const byName = new Map(listZip(u8).map(e => [e.name, e]));
    const colEntry = byName.get('collection.anki21') || byName.get('collection.anki2');
    if (!colEntry) {
      throw new Error(byName.has('collection.anki21b')
        ? 'new-format apkg — in Anki, export again with “Support older Anki versions” checked'
        : 'no collection database found in that archive');
    }
    const db = openSqlite(await readZipEntry(u8, colEntry));
    const notesTbl = sqliteTables(db).find(t => t.name === 'notes');
    if (!notesTbl) throw new Error('no notes table in the deck');
    const fi = colIdx(notesTbl.sql, 'flds');
    if (fi < 0) throw new Error('unrecognised notes schema');
    const rows = sqliteRows(db, 'notes').map(r => String(r[fi] ?? '').split('\x1f'));
    if (!rows.length) throw new Error('no data rows');
    let manifest = null;
    if (byName.has('media')) {
      try { manifest = parseMediaManifest(await readZipEntry(u8, byName.get('media'))); } catch { manifest = null; }
    }
    const res = cardsFromRows(rows);
    DATA = { ...res, apkg: { u8, byName, manifest, rows }, nCols: Math.max(...rows.slice(0, 50).map(r => r.length)),
      fileName: String(f.name || '').replace(/\.apkg$/i, '').trim(), deckName: readDeckName(db) };
    renderImport(DATA);
  } catch (err) { showErr(friendlyErr(err)); }
}

// extract only the media the kept cards actually reference; attach a/img refs to the cards. Media is
// stored under DECK-SCOPED keys (`<deckId>/<filename>`) so decks in the library don't collide and a
// delete only drops that deck's blobs — NOT mediaClear() (which would wipe every other deck's media).
async function attachMedia(cards, apkg, deckId, cols, onProgress) {
  const { u8, byName, manifest, rows } = apkg;
  if (!manifest) return cards.map(({ srcIdx, ...c }) => c);
  const wordCols = [cols?.expression, cols?.reading].filter(i => i >= 0);   // WORD audio lives in these
  const out = cards.map(c => {
    const fields = rows[c.srcIdx] || [];
    // TWO audios: the word's own pronunciation (in the expression/reading field) AND the example
    // sentence's audio (in the sentence field) — many vocab decks ship both; we used to keep only the first.
    let a = null, a2 = null, img = null;
    for (const i of wordCols) a = a || soundRef(fields[i]);
    if (cols?.sentence >= 0) a2 = soundRef(fields[cols.sentence]);
    if (!a) for (const f of fields) { a = soundRef(f); if (a) break; }   // fallback: first sound anywhere
    for (const f of fields) { img = img || imgRef(f); }
    if (a2 && a2 === a) a2 = null;                                        // same file → not a distinct 2nd audio
    const { srcIdx, ...rest } = c;
    return { ...rest, ...(a && manifest.has(a) ? { a } : {}), ...(a2 && manifest.has(a2) ? { a2 } : {}), ...(img && manifest.has(img) ? { img } : {}) };
  });
  const refs = [...new Set(out.flatMap(c => [c.a, c.a2, c.img].filter(Boolean)))];
  let total = 0;
  const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  for (let i = 0; i < refs.length; i++) {
    const name = refs[i];
    const entry = byName.get(manifest.get(name));
    if (!entry) continue;
    const bytes = await readZipEntry(u8, entry);
    total += bytes.length;
    if (total > MEDIA_CAP) { if (onProgress) onProgress(refs.length, refs.length); break; }   // quota guard — deck still saves with the media loaded so far
    const ext = (name.split('.').pop() || '').toLowerCase();
    await mediaPut(deckId + '/' + name, new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
    if (onProgress && i % 20 === 0) onProgress(i + 1, refs.length);
  }
  return out;
}

function friendlyErr(err) {
  const m = String((err && err.message) || err || '');
  if (/no data rows/.test(m)) return 'That deck has no cards — is it a full Anki .apkg export?';
  if (/could not detect columns/.test(m)) return 'Could not tell which fields are the word/meaning — pick them below, or check the deck.';
  if (/no usable cards/.test(m)) return 'No usable cards found — every row was empty after cleaning.';
  return 'Could not read that .apkg (' + m + '). In Anki: File → Export → Anki Deck Package, and tick “Support older Anki versions”.';
}

function showPreview(res) {
  const box = $('#ankPreview');
  if (!box) return;
  const cards = res.cards.slice(0, 3);
  const rowsHtml = cards.map(c => `
    <tr>
      <td class="ank-pc-w" lang="ja">${esc(c.w)}</td>
      <td class="ank-pc-r" lang="ja">${esc(c.r)}</td>
      <td class="ank-pc-m">${esc(c.m)}</td>
      <td class="ank-pc-s" lang="ja">${esc(c.s)}</td>
    </tr>`).join('');
  // remap row: one <select> per display field, each listing the raw column indices
  const nCols = DATA?.nCols || 0;   // apkg column count (the only import path)
  const colOpts = (sel) => {
    let out = `<option value="-1"${sel < 0 ? ' selected' : ''}>— none —</option>`;
    for (let i = 0; i < nCols; i++) out += `<option value="${i}"${sel === i ? ' selected' : ''}>col ${i + 1}</option>`;
    return out;
  };
  const remap = FIELDS.map(f => `
    <label class="ank-remap-f"><span>${esc(FIELD_LABEL[f])}</span>
      <select data-field="${f}">${colOpts(res.cols[f])}</select></label>`).join('');

  box.hidden = false;
  box.innerHTML = `
    <p class="ank-prev-h">${esc(String(res.cards.length))} cards found · showing the first 3. If the columns look wrong, remap them below.</p>
    <div class="ank-prev-scroll">
      <table class="ank-prev-tbl">
        <thead><tr><th>word</th><th>reading</th><th>meaning</th><th>sentence</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <details class="ank-remap">
      <summary>Remap columns</summary>
      <div class="ank-remap-grid">${remap}</div>
    </details>
    <div class="ank-prev-acts">
      <button type="button" class="ank-btn ank-btn-primary" id="ankSave">Save deck — ${esc(String(res.cards.length))} cards</button>
      <button type="button" class="ank-btn ank-btn-ghost" id="ankCancel">Cancel</button>
    </div>`;

  $('#ankSave')?.addEventListener('click', async () => {
    const btn = $('#ankSave');
    const id = genId();
    // the deck's OWN name from the .apkg, falling back to the filename, then a generic label
    const name = (DATA?.deckName || DATA?.fileName || '').slice(0, 60) || `Deck ${deckMeta().length + 1}`;
    let cards = res.cards;
    if (DATA?.apkg) {
      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Importing media…'; }
        cards = await attachMedia(res.cards, DATA.apkg, id, res.cols, (n, t) => { if (btn) btn.textContent = `Importing media… ${n}/${t}`; });
      } catch (err) {
        console.error('[anki] media import', err);
        showErr('Media import failed (' + (err?.message || err) + ') — the deck was saved without audio/images.');
        cards = res.cards.map(({ srcIdx, ...c }) => c);
      }
    } else cards = res.cards.map(({ srcIdx, ...c }) => c);   // srcIdx is import plumbing — never persisted
    if (!addDeck(id, name, { cards, pos: {}, shaky: [], shuffle: false, seed: 1, view: 'stream', autoplay: false })) {
      // localStorage full — roll back this deck's data + media so nothing is orphaned, and tell the owner to prune
      del(deckKey(id));
      mediaDeletePrefix(id + '/').catch(() => {});
      if (btn) { btn.disabled = false; btn.textContent = `Save deck — ${res.cards.length} cards`; }
      showErr('Not enough storage to save this deck. Remove an old deck from “Your decks” below and try again.');
      return;
    }
    DATA = null;
    render();
  });
  $('#ankCancel')?.addEventListener('click', () => { DATA = null; renderImport(); });
  box.querySelectorAll('select[data-field]').forEach(sel => sel.addEventListener('change', () => {
    const mapping = {};
    box.querySelectorAll('select[data-field]').forEach(s => { mapping[s.dataset.field] = parseInt(s.value, 10); });
    // apkg: rebuild the cards from the sqlite rows with the manual column override
    try { const r2 = cardsFromRows(DATA.apkg.rows, mapping); DATA = { ...DATA, ...r2 }; renderImport(DATA); }
    catch (err) { showErr(friendlyErr(err)); }
  }));
}

// ───────────────────────────── deck library / history ─────────────────────────────

// the "Your decks" row — every saved deck as a switch chip (active highlighted) + a ✕ to delete, plus
// an Import affordance. Shown above the card so switching decks / seeing history is one tap away.
function deckBarHTML() {
  const { active, decks } = loadLib();
  if (!decks.length) return '';
  const chips = decks.map(d => {
    const on = d.id === active;
    return `<span class="ank-deck${on ? ' is-active' : ''}">
      <button type="button" class="ank-deck-pick" data-deck="${esc(d.id)}"${on ? ' aria-current="true"' : ''} title="${esc(d.name)} — ${esc(String(d.cardCount))} cards">
        <span class="ank-deck-n">${esc(d.name)}</span><span class="ank-deck-c">${esc(String(d.cardCount))}</span>
      </button>
      <button type="button" class="ank-deck-edit" data-rename-deck="${esc(d.id)}" aria-label="Rename deck ${esc(d.name)}" title="Rename deck">✎</button>
      <button type="button" class="ank-deck-x" data-del-deck="${esc(d.id)}" aria-label="Delete deck ${esc(d.name)}" title="Delete deck">✕</button>
    </span>`;
  }).join('');
  return `<div class="ank-decks" role="group" aria-label="Your decks">
      <span class="ank-decks-lbl">Your decks</span>${chips}
      <button type="button" class="ank-deck-add" id="ankAddDeck" aria-label="Import another deck">＋ Import</button>
    </div>`;
}

// switch to the import view with a way back to the current deck (used by both "Import deck" and the
// deck-row "＋ Import"). On the first-ever import render() shows this without a Back button.
function enterImport() {
  DATA = null; stream = null;
  renderImport();
  root.insertAdjacentHTML('afterbegin', `<button type="button" class="ank-mini ank-back" id="ankBack">← Back to deck</button>
    <button type="button" class="ank-mini ank-back" id="ankClearFlags">Clear all flags</button>`);
  $('#ankBack')?.addEventListener('click', () => { render(); });
  $('#ankClearFlags')?.addEventListener('click', () => { const d = loadDeck(); if (d) { d.shaky = []; saveDeck(d); } render(); });
}

// ───────────────────────────── stream / skim (stage 3) ─────────────────────────────

let stream = null;   // { deck, mode: 'chunk'|'pile', chunk, idx, order } — order is a SNAPSHOT (pile never mutates mid-run)

// SR announce: #ankLive is a STATIC sibling of #ankiDeck in index.html — a live region inside
// this innerHTML-rebuilt root could never announce. Trailing 200ms coalesce; paint-triggered,
// so the FIRST card speaks too.
let _liveT = 0;
function announce(text) {
  clearTimeout(_liveT);
  _liveT = setTimeout(() => { const n = document.getElementById('ankLive'); if (n) n.textContent = text; }, 200);
}

function orderFor(deck, chunk, mode) {
  if (mode === 'pile') return pileOrder(deck.cards, deck.shaky);          // deck order, snapshot at entry
  const slice = chunkSlice(deck.cards, chunk, CHUNK);
  return deck.shuffle ? shuffled(slice, deck.seed + chunk) : slice;
}

// strip + view seg shared by both views (extracted — they were inlined in renderStream)
function stripHTML(deck, chunk, mode) {
  const nChunks = chunkCount(deck.cards.length, CHUNK);
  const chips = Array.from({ length: nChunks }, (_, i) => `
    <button type="button" class="ank-chip${mode === 'chunk' && i === chunk ? ' active' : ''}" data-chunk="${i}" aria-pressed="${mode === 'chunk' && i === chunk ? 'true' : 'false'}">
      ${esc(chunkLabel(i, deck.cards.length, CHUNK))}</button>`).join('');
  const n = deck.shaky.length;
  return `${chips}
    <button type="button" class="ank-chip ank-chip-pile${mode === 'pile' ? ' active' : ''}" data-pile="1" aria-pressed="${mode === 'pile' ? 'true' : 'false'}" ${n ? '' : 'disabled'}>◆ Shaky (<span id="ankPileN">${esc(String(n))}</span>)</button>`;
}
function barHTML(deck) {
  return `
    <div class="ank-bar">
      <h3 class="ank-h ank-h-sm">Core deck</h3>
      <div class="ank-bar-acts">
        <span class="ank-seg" role="group" aria-label="View">
          <button type="button" class="ank-mini${deck.view !== 'skim' ? ' is-on' : ''}" id="ankViewStream" aria-pressed="${deck.view !== 'skim'}">▶ Stream</button>
          <button type="button" class="ank-mini${deck.view === 'skim' ? ' is-on' : ''}" id="ankViewSkim" aria-pressed="${deck.view === 'skim'}">☰ Skim</button>
        </span>
        <button type="button" class="ank-mini" id="ankHira" title="Show or hide the reading (hiragana) — key: n">あ Hiragana</button>
        <button type="button" class="ank-mini" id="ankEn" title="Show or hide the English meaning — key: m">EN English</button>
        <button type="button" class="ank-mini" id="ankEx" title="Show or hide the example sentence">例 Example</button>
        <button type="button" class="ank-mini${deck.shuffle ? ' is-on' : ''}" id="ankShuffle" aria-pressed="${deck.shuffle ? 'true' : 'false'}">⇄ Shuffle</button>
        <button type="button" class="ank-mini${deck.autoplay ? ' is-on' : ''}" id="ankAuto" aria-pressed="${deck.autoplay ? 'true' : 'false'}" title="Auto-play audio on each card">🔊 Auto</button>
        <button type="button" class="ank-mini" id="ankAutoAdv" title="Auto-advance through cards (tap to cycle the delay)">⏱ Auto-advance</button>
        <button type="button" class="ank-mini" id="ankEdit" title="Edit this card's fields — key: e">✎ Edit</button>
      </div>
      <div class="ank-search-wrap">
        <input type="search" id="ankSearch" class="ank-search" placeholder="Search this deck…" aria-label="Search cards in this deck" autocomplete="off">
        <div class="ank-search-res" id="ankSearchRes" role="listbox" hidden></div>
      </div>
    </div>`;
}
function refreshPileChip() {
  const { deck } = stream;
  const el = document.getElementById('ankPileN');
  if (el) el.textContent = String(deck.shaky.length);
  const chip = root.querySelector('.ank-chip-pile');
  if (chip && deck.shaky.length) chip.removeAttribute('disabled');
}

function renderStream(deck) {
  const nChunks = chunkCount(deck.cards.length, CHUNK);
  const mode = stream && stream.deck === deck ? stream.mode : 'chunk';
  const chunk = stream && stream.deck === deck && stream.chunk < nChunks
    ? stream.chunk
    : Math.min(Math.max(0, deck.chunk | 0), Math.max(0, nChunks - 1));   // fresh load → the persisted set (not always chunk 1)
  const order = orderFor(deck, chunk, mode);
  if (mode === 'pile' && !order.length) { renderAllClear(deck); return; }
  const pos = mode === 'pile' ? 0 : Math.min(Math.max(0, deck.pos[chunk] | 0), Math.max(0, order.length - 1));
  stream = { deck, mode, chunk, idx: Math.min(pos, Math.max(0, order.length - 1)), order };

  // The tap zones live in a wrapper as SIBLINGS of #ankCard — paintCard() rewrites #ankCard's
  // innerHTML each card, so overlays placed inside it would be wiped. The bottom control bar
  // (touch only, hidden on desktop by CSS) drives the same next/back/shaky/audio actions.
  root.innerHTML = `${barHTML(deck)}${deckBarHTML()}
    <div class="ank-strip" id="ankStrip">${stripHTML(deck, chunk, mode)}</div>
    <div class="ank-cardwrap">
      <div class="ank-card" id="ankCard" tabindex="0" role="group" aria-label="Card — tap or press space for next"></div>
      <span class="ank-tap ank-tap-l" id="ankTapPrev" aria-hidden="true"><span class="ank-tap-hint">‹</span></span>
      <span class="ank-tap ank-tap-r" id="ankTapNext" aria-hidden="true"><span class="ank-tap-hint">›</span></span>
    </div>
    <div class="ank-prog" id="ankProg"></div>
    <p class="ank-hint">space / → next · ← back · <b>S</b> flag shaky · <b>E</b> edit · tap the card = next</p>
    <div class="ank-controls" role="group" aria-label="Card controls">
      <button type="button" class="ank-ctl ank-ctl-prev" id="ankPrevBtn">◀ Back</button>
      <button type="button" class="ank-ctl ank-ctl-icon" id="ankAudioBtn" aria-label="Play audio">🔊</button>
      <button type="button" class="ank-ctl ank-ctl-icon" id="ankShakyBtn" aria-label="Flag shaky">⚑</button>
      <button type="button" class="ank-ctl ank-ctl-next" id="ankNextBtn">Next ▶</button>
    </div>`;

  paintCard();
  wireCommon();
  wireStream();
}

// pile empty at entry — nothing shaky left
function renderAllClear(deck) {
  stream = { deck, mode: 'chunk', chunk: 0, idx: 0, order: [] };
  root.innerHTML = `${barHTML(deck)}${deckBarHTML()}
    <div class="ank-clear">
      <div class="ank-clear-art" aria-hidden="true">◆ ✓</div>
      <h4>All clear — nothing flagged.</h4>
      <p>Blast through a chunk and press <b>S</b> on anything that makes you hesitate.</p>
      <button type="button" class="ank-btn ank-btn-primary" id="ankClearBack">Back to chunk 1</button>
    </div>`;
  wireCommon();
  $('#ankClearBack')?.addEventListener('click', () => { stream = null; renderStream(deck); });
  announce('Shaky pile is empty — all clear.');
}

// ───────────────────────────── skim (stage 3) ─────────────────────────────

function renderSkim(deck) {
  const nChunks = chunkCount(deck.cards.length, CHUNK);
  const mode = stream && stream.deck === deck ? stream.mode : 'chunk';
  const chunk = stream && stream.deck === deck && stream.chunk < nChunks
    ? stream.chunk
    : Math.min(Math.max(0, deck.chunk | 0), Math.max(0, nChunks - 1));   // fresh load → the persisted set (not always chunk 1)
  const order = orderFor(deck, chunk, mode);
  stream = { deck, mode, chunk, idx: 0, order };
  if (mode === 'pile' && !order.length) { renderAllClear(deck); return; }

  const rows = order.map((c, i) => {
    const on = deck.shaky.includes(c.id);
    return `<button type="button" class="ank-row${on ? ' is-shaky' : ''}" data-id="${esc(c.id)}" tabindex="${i === 0 ? '0' : '-1'}" aria-pressed="${on}" aria-label="${esc(c.w)}${c.r ? ', ' + esc(c.r) : ''}${c.m ? ', ' + esc(c.m) : ''} — press to flag shaky">
      <span class="ank-row-w" lang="ja">${esc(c.w)}</span>
      <span class="ank-row-r" lang="ja">${esc(c.r)}</span>
      <span class="ank-row-m">${esc(c.m)}</span>
    </button>`;
  }).join('');

  root.innerHTML = `${barHTML(deck)}${deckBarHTML()}
    <div class="ank-strip" id="ankStrip">${stripHTML(deck, chunk, mode)}</div>
    <div class="ank-skim" id="ankSkim" role="group" aria-label="Skim — tap any row to flag it shaky">${rows}</div>
    <p class="ank-hint">tap / Enter / <b>S</b> flags a row · ↑↓ move · switch to Stream to study</p>`;

  wireCommon();
  wireSkim();
}

function wireSkim() {
  const host = $('#ankSkim');
  if (!host) return;
  const rows = [...host.querySelectorAll('.ank-row')];
  const toggleRow = (btn) => {
    const { deck } = stream;
    deck.shaky = toggleShaky(deck.shaky, btn.dataset.id);
    saveDeck(deck);
    const on = deck.shaky.includes(btn.dataset.id);
    btn.classList.toggle('is-shaky', on);
    btn.setAttribute('aria-pressed', String(on));
    refreshPileChip();
    const w = btn.querySelector('.ank-row-w')?.textContent || '';
    announce(`${w} — ${on ? 'flagged' : 'unflagged'}`);
  };
  rows.forEach(btn => btn.addEventListener('click', () => toggleRow(btn)));
  // roving tabindex: ONE tab stop; ↑↓ move focus, Enter/Space (native click) or S toggles
  host.addEventListener('keydown', (e) => {
    const cur = e.target.closest?.('.ank-row');
    if (!cur) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = rows.indexOf(cur), next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) { cur.tabIndex = -1; next.tabIndex = 0; next.focus(); next.scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleRow(cur); }
  });
}

// ───────────────────────────── shared wiring ─────────────────────────────

// media fill — async (IndexedDB), token-guarded against stale paints; one objectURL at
// a time for the image, audio URLs revoked on 'ended'. Deck audio is deliberate-tap
// (or P) — never autoplay: the refresher's speed is the point.
let _mediaTok = 0, _imgUrl = null, _audio = null;
let _suppressTap = false;   // a horizontal swipe just advanced — swallow the click it would also fire
let _lastAutoId = null;     // last card auto-played (so a re-paint of the same card doesn't replay)
function fillMedia(card) {
  const tok = ++_mediaTok;
  if (_imgUrl) { URL.revokeObjectURL(_imgUrl); _imgUrl = null; }
  if (_audio) { try { _audio.pause(); } catch { /* already stopped */ } _audio = null; }
  try { window.speechSynthesis?.cancel(); } catch { /* no TTS */ }   // stop any in-flight spoken word on card change
  const mkey = f => (stream?.deck?.id ? stream.deck.id + '/' : '') + f;   // deck-scoped media key
  // try the deck-scoped key, then fall back to the bare filename — a deck MIGRATED from the old single-slot
  // schema has its media stored unprefixed, so the prefixed lookup would miss and silently drop audio/images.
  const getMedia = f => mediaGet(mkey(f)).then(b => (b || mkey(f) === f) ? b : mediaGet(f));
  if (card.img) {
    getMedia(card.img).then(b => {
      if (tok !== _mediaTok || !b) return;
      const el = $('#ankImg'); if (!el) return;
      _imgUrl = URL.createObjectURL(b);
      el.src = _imgUrl; el.hidden = false;
    }).catch(() => {});
  }
  // play a recorded media file — one at a time.
  const playRec = (file) => {
    getMedia(file).then(b => {
      if (tok !== _mediaTok || !b) return;   // ignore a stale in-flight read when a newer card loaded
      if (_audio) { try { _audio.pause(); } catch { /* already stopped */ } }
      const u = URL.createObjectURL(b);
      _audio = new Audio(u);
      _audio.addEventListener('ended', () => URL.revokeObjectURL(u), { once: true });
      _audio.play().catch(() => {});
    }).catch(() => {});
  };
  // each button plays its recorded file, or SPEAKS the text (TTS) when the deck has no audio for it.
  const wireAudio = (id, file, ttsText) => {
    const b = $('#' + id); if (!b) return;
    b.addEventListener('click', (e) => {
      e.stopPropagation();   // play without also advancing the card (the card click = next)
      if (b.dataset.tts) { try { window.speechSynthesis?.cancel(); } catch {} speak(ttsText, b); }
      else playRec(file);
    });
  };
  wireAudio('ankAudio', card.a, card.w);
  wireAudio('ankAudio2', card.a2, card.s);
}

// the meaning field of many decks is a part-of-speech label ("Noun", "Verb"…) rather than a gloss;
// show those as a tag. Anything else is a real meaning. Kept to whole-string known POS names so a
// real gloss that merely CONTAINS "verb" isn't mislabelled.
const POS_SET = new Set(['noun', 'verb', 'adjective', 'i-adjective', 'い-adjective', 'na-adjective', 'な-adjective',
  'adverb', 'particle', 'expression', 'pronoun', 'conjunction', 'interjection', 'prefix', 'suffix', 'counter',
  'adnominal', 'numeral', 'auxiliary', 'auxiliary verb', 'copula', 'phrase', 'adjectival noun', 'godan verb', 'ichidan verb']);
function isPOS(m) {
  const s = String(m || '').trim().toLowerCase();
  return s.length <= 24 && POS_SET.has(s);
}

// show the target word inside the example sentence: fill an empty （）/() cloze with it, else
// highlight its first occurrence. esc() is applied to BOTH sentence and word before the <mark> is
// spliced in, so the only unescaped markup is our own trusted tag.
function sentenceHTML(s, w) {
  s = String(s || ''); w = String(w || '');
  const mark = `<mark class="ank-cloze" lang="ja">${esc(w)}</mark>`;
  // Split the RAW string and esc() each segment separately, then splice in the (already-esc'd)
  // mark by concatenation — NOT String.replace. This avoids two hazards with untrusted decks:
  // `$`/`$&` in the word being read as replacement operators, and matching a word like "amp"
  // inside an `&amp;` entity produced by escaping first.
  const cloze = s.match(/（\s*）|\(\s*\)/);              // fill an empty cloze with the word
  if (cloze) return esc(s.slice(0, cloze.index)) + mark + esc(s.slice(cloze.index + cloze[0].length));
  const i = w ? s.indexOf(w) : -1;                       // else highlight the word in place
  if (i >= 0) return esc(s.slice(0, i)) + mark + esc(s.slice(i + w.length));
  return esc(s);
}

function paintCard() {
  const { deck, order, idx, chunk, mode } = stream;
  const card = order[idx];
  const el = $('#ankCard');
  if (!el || !card) return;
  const isShaky = deck.shaky.includes(card.id);
  const hair = (card.s || card.sm) ? `<div class="ank-hair" aria-hidden="true"></div>` : '';
  // audio: recorded file when the deck ships one, else TTS the text (data-tts) so decks with no audio
  // still speak. Word audio lives in the media row; sentence audio sits inline after the sentence.
  const _tts = canSpeak();
  const sentAudio = (card.a2 || (_tts && card.s))
    ? ` <button type="button" class="ank-sentaudio" id="ankAudio2"${card.a2 ? '' : ' data-tts="1"'} aria-label="Play sentence audio">🔊</button>` : '';
  const sent = card.s ? `<div class="ank-sent" lang="ja">${sentenceHTML(card.s, card.w)}${sentAudio}</div>` : '';
  const hasWordAudio = card.a || (_tts && card.w);
  const sentM = card.sm ? `<div class="ank-sentm">${esc(card.sm)}</div>` : '';
  // reading now rides ABOVE the word as ruby (toggle-able via the site .furi-off rule); the meaning
  // field is a POS tag when it names a part of speech, otherwise a meaning line under the word.
  const wordHTML = card.r
    ? `<ruby class="ank-word" lang="ja">${esc(card.w) || '&nbsp;'}<rt>${esc(card.r)}</rt></ruby>`
    : `<div class="ank-word" lang="ja">${esc(card.w) || '&nbsp;'}</div>`;
  const isPos = card.m && isPOS(card.m);
  el.classList.toggle('is-shaky', isShaky);
  el.classList.remove('ank-revealed');   // each new card starts hidden again — reveal is per-card
  el.innerHTML = `
    ${isShaky ? '<span class="ank-flag" aria-label="flagged shaky" title="flagged shaky">◆ shaky</span>' : ''}
    ${isPos ? `<span class="ank-pos">${esc(card.m)}</span>` : ''}
    ${wordHTML}
    ${card.m && !isPos ? `<div class="ank-mean">${esc(card.m)}</div>` : ''}
    ${hair}${sent}${sentM}
    ${(hasWordAudio || card.img) ? `<div class="ank-media">${card.img ? '<img class="ank-img" id="ankImg" alt="" hidden>' : ''}${hasWordAudio ? `<button type="button" class="ank-audio" id="ankAudio"${card.a ? '' : ' data-tts="1"'} aria-label="Play audio (P)">🔊</button>` : ''}</div>` : ''}
    <button type="button" class="ank-peek" aria-label="Reveal the hidden side">👁 Reveal <kbd class="ank-peek-k">↓</kbd></button>`;
  fillMedia(card);
  // auto-play audio ONLY when the card actually changed (not on a re-paint from flagging shaky) —
  // gated on card.id. Browsers block play() until a gesture; advancing IS a gesture, so it works
  // from the first tap onward (the very first mount paint is silently blocked, which is fine).
  if (deck.autoplay && hasWordAudio && card.id !== _lastAutoId) { _lastAutoId = card.id; $('#ankAudio')?.click(); }

  const total = deck.cards.length;
  const prog = $('#ankProg');
  if (prog) {
    const pct = Math.round((idx + 1) / order.length * 100);
    const jump = `<label class="ank-jump-l">→ <input class="ank-jump" id="ankJump" type="number" inputmode="numeric" min="1" max="${esc(String(total))}" value="${esc(String(chunk * CHUNK + idx + 1))}" aria-label="Jump to card number"></label>`;
    prog.innerHTML = mode === 'pile'
      ? `<span class="ank-prog-n">${esc(String(idx + 1))} / ${esc(String(order.length))} shaky</span>
         <span class="ank-prog-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`
      : `<span class="ank-prog-n">${esc(String(chunk * CHUNK + idx + 1))} / ${esc(String(total))}</span>
         <span class="ank-prog-dot" aria-hidden="true">·</span>
         <span class="ank-prog-lbl">chunk ${esc(chunkLabel(chunk, total, CHUNK))}</span>
         <span class="ank-prog-mini">${esc(String(idx + 1))}/${esc(String(order.length))}</span>
         <span class="ank-prog-bar ank-scrub" aria-hidden="true" title="Tap to jump within this set"><i style="width:${pct}%"></i></span>
         ${jump}`;
  }
  announce(`${card.w}${card.r ? ', ' + card.r : ''}${card.m ? ', ' + card.m : ''}${isShaky ? ', flagged shaky' : ''}`);
  scheduleAuto();   // (re)start the auto-advance countdown for this card (no-op when auto is off)
}

function persistPos() {
  const { deck, chunk, idx, mode } = stream;
  if (mode === 'pile') return;   // the pile is a snapshot run — it does not own a resume slot
  deck.pos[chunk] = idx;
  deck.chunk = chunk;            // remember WHICH set you're on, so re-entry doesn't drop back to chunk 1
  saveDeck(deck);
}

function advance(delta) {
  const { deck, order, idx, mode, chunk } = stream;
  const next = idx + delta;
  if (next >= 0 && next < order.length) {
    stream.idx = next;
    paintCard();
    persistPos();
    return;
  }
  // stepped off the end/start of the current pile — hop to the adjacent pile (chunk mode only; the
  // shaky pile is a self-contained run). Forward → first card of the next pile; back → last of the prev.
  if (mode !== 'chunk') return;
  const nChunks = chunkCount(deck.cards.length, CHUNK);
  if (delta > 0 && chunk + 1 < nChunks) {
    deck.pos[chunk + 1] = 0;
    switchChunk(chunk + 1);
  } else if (delta < 0 && chunk > 0) {
    deck.pos[chunk - 1] = Math.max(0, orderFor(deck, chunk - 1, 'chunk').length - 1);
    switchChunk(chunk - 1);
  }
}

// jump to a GLOBAL card number (1-based across the whole deck) — resolves to its chunk + index.
function jumpToCard(n) {
  if (!stream || !Number.isFinite(n)) return;
  const total = stream.deck.cards.length;
  n = Math.min(Math.max(1, n | 0), total);
  const chunk = Math.floor((n - 1) / CHUNK), idx = (n - 1) % CHUNK;
  stream.deck.pos[chunk] = idx;                                    // switchChunk reads pos → lands on idx
  if (stream.mode !== 'chunk' || chunk !== stream.chunk) { switchChunk(chunk); }
  else { stream.idx = Math.min(idx, stream.order.length - 1); paintCard(); persistPos(); }
}

// scrub within the current set (chunk or pile) from a click x on the progress bar.
function scrubTo(bar, clientX) {
  if (!stream) return;
  const r = bar.getBoundingClientRect();
  const frac = r.width ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
  stream.idx = Math.min(Math.max(0, Math.round(frac * (stream.order.length - 1))), stream.order.length - 1);
  paintCard();
  persistPos();
}

function toggleShakyCurrent() {
  const { deck, order, idx } = stream;
  const card = order[idx];
  if (!card) return;
  // NON-destructive everywhere (stage-3 review): in a pile run the card stays in THIS run's
  // snapshot; the flag + chip count update, and the next pile entry re-derives membership.
  deck.shaky = toggleShaky(deck.shaky, card.id);
  saveDeck(deck);
  refreshPileChip();
  paintCard();
}

function switchChunk(chunk) {
  const { deck } = stream;
  const order = orderFor(deck, chunk, 'chunk');
  const pos = Math.min(Math.max(0, deck.pos[chunk] | 0), Math.max(0, order.length - 1));
  stream = { deck, mode: 'chunk', chunk, idx: pos, order };
  persistPos();   // remember the new set immediately — leaving without advancing must still resume here
  deck.view === 'skim' ? renderSkim(deck) : rePaintAfterSwitch();
}
function enterPile() {
  const { deck } = stream;
  stream = { deck, mode: 'pile', chunk: stream.chunk, idx: 0, order: [] };
  deck.view === 'skim' ? renderSkim(deck) : renderStream(deck);
}
function rePaintAfterSwitch() {
  const { deck, chunk, mode } = stream;
  root.querySelectorAll('.ank-chip').forEach(b => {
    const on = b.dataset.pile ? mode === 'pile' : (mode === 'chunk' && parseInt(b.dataset.chunk, 10) === chunk);
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  root.querySelector('.ank-chip.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  paintCard();
}

function wireCommon() {
  $('#ankStrip')?.querySelectorAll('.ank-chip[data-chunk]').forEach(b => b.addEventListener('click', () => switchChunk(parseInt(b.dataset.chunk, 10))));
  root.querySelector('.ank-chip-pile')?.addEventListener('click', enterPile);
  $('#ankAuto')?.addEventListener('click', () => {
    const d = stream.deck; d.autoplay = !d.autoplay; saveDeck(d);
    const b = $('#ankAuto'); if (b) { b.classList.toggle('is-on', d.autoplay); b.setAttribute('aria-pressed', String(d.autoplay)); }
    if (d.autoplay) { _lastAutoId = null; $('#ankAudio')?.click(); }   // play the current card now (this click is the gesture)
  });
  $('#ankViewStream')?.addEventListener('click', () => { const d = stream.deck; if (d.view !== 'stream') { d.view = 'stream'; saveDeck(d); renderStream(d); } });
  $('#ankViewSkim')?.addEventListener('click', () => { const d = stream.deck; if (d.view !== 'skim') { d.view = 'skim'; saveDeck(d); renderSkim(d); } });
  $('#ankShuffle')?.addEventListener('click', () => {
    const deck = stream.deck;
    const keep = stream.chunk;                     // stage-3 fix: the re-derive was snapping to chunk 0
    deck.shuffle = !deck.shuffle;
    saveDeck(deck);
    stream = { deck, mode: stream.mode, chunk: keep, idx: 0, order: [] };
    deck.view === 'skim' ? renderSkim(deck) : renderStream(deck);
  });
  $('#ankHira')?.addEventListener('click', flipHira);
  $('#ankEn')?.addEventListener('click', flipEn);
  $('#ankEx')?.addEventListener('click', flipEx);
  $('#ankAutoAdv')?.addEventListener('click', () => {
    const cur = getRaw(KEYS.ankiAutoAdv, '');
    const nextSecs = AUTO_STEPS[(AUTO_STEPS.indexOf(AUTO_STEPS.includes(cur) ? cur : '') + 1) % AUTO_STEPS.length];
    setRaw(KEYS.ankiAutoAdv, nextSecs);
    syncAutoAdv(); scheduleAuto();
  });
  $('#ankEdit')?.addEventListener('click', editCard);
  wireSearch();
  wireDeckChips();
  applyToggles();   // sync the hiragana/English toggle classes + button state after every (re)render of the bar
  syncAutoAdv();    // reflect the persisted auto-advance delay on the button
}

// deck search — jump to any card by word / reading / meaning / sentence (a 2000-card deck needs it).
function wireSearch() {
  const input = $('#ankSearch'), res = $('#ankSearchRes');
  if (!input || !res || !stream) return;
  const close = () => { res.hidden = true; res.innerHTML = ''; scheduleAuto(); };   // resume auto-advance once search is dismissed
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { close(); return; }
    const cards = stream.deck.cards;
    const hits = [];
    for (let i = 0; i < cards.length && hits.length < 12; i++) {
      const c = cards[i];
      if (`${c.w || ''} ${c.r || ''} ${c.m || ''} ${c.s || ''}`.toLowerCase().includes(q)) hits.push({ c, n: i + 1 });
    }
    res.innerHTML = hits.length
      ? hits.map(h => `<button type="button" class="ank-search-hit" role="option" data-n="${h.n}"><span class="ank-sh-w" lang="ja">${esc(h.c.w || '')}</span><span class="ank-sh-m">${esc(h.c.m || '')}</span><span class="ank-sh-n">#${h.n}</span></button>`).join('')
      : `<div class="ank-search-empty">No match</div>`;
    res.hidden = false;
    stopAuto();   // pause auto-advance while the results are open
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; close(); input.blur(); } });
  res.addEventListener('click', (e) => {
    const b = e.target.closest('.ank-search-hit'); if (!b) return;
    jumpToCard(parseInt(b.dataset.n, 10));
    input.value = ''; close(); input.blur();
  });
  if (!_searchDocWired) {   // attach the outside-click close ONCE (wireCommon re-runs every render)
    _searchDocWired = true;
    document.addEventListener('click', (e) => { if (!e.target.closest('.ank-search-wrap')) { const r = $('#ankSearchRes'); if (r && !r.hidden) { r.hidden = true; r.innerHTML = ''; scheduleAuto(); } } });
  }
}
let _searchDocWired = false;

// deck library wiring — shared by the deck view and the import view (so you can switch/delete decks even
// when the active deck's data is missing and you've landed on the import screen). Switch / delete / import.
function wireDeckChips() {
  $('#ankAddDeck')?.addEventListener('click', enterImport);
  root.querySelectorAll('.ank-deck-pick[data-deck]').forEach(b => b.addEventListener('click', () => switchDeck(b.dataset.deck)));
  root.querySelectorAll('.ank-deck-edit[data-rename-deck]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.renameDeck;
    const meta = deckMeta().find(d => d.id === id);
    const name = await askText('Rename deck', { value: meta?.name || '', placeholder: 'Deck name', ok: 'Rename' });
    if (name == null || !String(name).trim()) return;
    renameDeck(id, name);
    render();
  }));
  root.querySelectorAll('.ank-deck-x[data-del-deck]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.delDeck;
    const meta = deckMeta().find(d => d.id === id);
    const ok = await confirmModal(`Delete “${meta?.name || 'this deck'}” (${meta?.cardCount || 0} cards)? It's removed from this device along with its audio/images.`, { ok: 'Delete', danger: true });
    if (!ok) return;
    deleteDeck(id);
    stream = null; DATA = null; render();
  }));
}

function wireStream() {
  const card = $('#ankCard');
  const tap = (fn) => () => { if (_suppressTap) { _suppressTap = false; return; } fn(); };   // swallow the click a swipe also fires
  card?.addEventListener('click', (e) => {
    if (e.target.closest('.ank-peek')) { e.stopPropagation(); revealCard(); return; }   // tap the peek = flip, NOT advance
    if (_suppressTap) { _suppressTap = false; return; }
    revealOrAdvance();   // tap flips to the answer first (when something's hidden), then advances
  });
  // touch controls (rebuilt every renderStream) — wire to the SAME actions as the keys.
  // Tap zones sit over the card halves; the bottom bar is the accessible equivalent.
  $('#ankTapPrev')?.addEventListener('click', tap(() => advance(-1)));
  $('#ankTapNext')?.addEventListener('click', tap(() => advance(1)));
  $('#ankPrevBtn')?.addEventListener('click', () => advance(-1));
  $('#ankNextBtn')?.addEventListener('click', () => advance(1));
  $('#ankShakyBtn')?.addEventListener('click', () => toggleShakyCurrent());
  $('#ankAudioBtn')?.addEventListener('click', () => $('#ankAudio')?.click());   // no-op if this card has no audio

  // swipe (touch/pen only): swipe left = next, right = back. Requires a mostly-horizontal move past a
  // distance OR velocity threshold, so a vertical scroll or a tap never triggers it; the ensuing click
  // is swallowed via _suppressTap (reset on the next pointerdown so it can't get stuck).
  const wrap = root.querySelector('.ank-cardwrap');
  if (wrap) {
    let sx = 0, sy = 0, st = 0, tracking = false;
    wrap.addEventListener('pointerdown', (e) => {
      _suppressTap = false;
      if (e.pointerType === 'mouse') return;
      sx = e.clientX; sy = e.clientY; st = e.timeStamp; tracking = true;
    });
    wrap.addEventListener('pointerup', (e) => {
      if (!tracking) return; tracking = false;
      const dx = e.clientX - sx, dy = e.clientY - sy, dt = Math.max(1, e.timeStamp - st);
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && (Math.abs(dx) > 70 || Math.abs(dx) / dt > 0.3)) {
        _suppressTap = true;
        advance(dx < 0 ? 1 : -1);
      }
    });
  }

  // jump-to-card — the number input jumps to a global card #, the progress bar scrubs within the set.
  // Delegated on #ankProg (its innerHTML rebuilds every paintCard, but #ankProg itself persists).
  const prog = $('#ankProg');
  if (prog) {
    prog.addEventListener('change', (e) => { if (e.target.id === 'ankJump') jumpToCard(parseInt(e.target.value, 10)); });
    prog.addEventListener('click', (e) => { const bar = e.target.closest('.ank-scrub'); if (bar) scrubTo(bar, e.clientX); });
  }

  // keys are handled at document level (wireDeckKeys) so they work without focusing the deck first
}
