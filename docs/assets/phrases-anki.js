'use strict';
// Core-2000 rapid refresher (#/phrases → "Core deck" section). Import your own Anki
// "Notes in Plain Text (.txt)" export, parsed client-side into a stream of one-card-at-a-time
// display cards — everything visible at once, NO per-card animation (a 100+×/session surface;
// the frequency gate says instant). Owner's HYBRID design: stream is the default; the skim
// list + shaky re-run is STAGE 3 (not built here). All state device-local (jwh-anki-v1),
// walked automatically by the backup export/import (it iterates jwh-* keys).
//
// The imported file is UNTRUSTED input: every dynamic field goes through esc() before innerHTML
// (cleanField in lib/anki.js is for display cleanliness, esc() is the XSS boundary).

import { $, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import {
  parseAnkiExport, cardsFromRows, chunkCount, chunkSlice, chunkLabel, toggleShaky, shuffled, pileOrder,
} from './lib/anki.js';
import { listZip, readZipEntry } from './lib/zip.js';
import { openSqlite, sqliteTables, sqliteRows } from './lib/sqlite.js';
import { parseMediaManifest, soundRef, imgRef, mediaPut, mediaGet, mediaClear } from './lib/ankimedia.js';

const CHUNK = 100;
const FIELDS = ['expression', 'reading', 'meaning', 'sentence', 'sentenceMeaning'];
const FIELD_LABEL = { expression: 'word', reading: 'reading', meaning: 'meaning', sentence: 'sentence', sentenceMeaning: 'sentence meaning' };

let DATA = null;         // last parse result held for the preview → save step: { cards, cols, delim, raw }
let root = null;

function loadDeck() {
  const d = get(KEYS.anki, null);
  if (!d || typeof d !== 'object' || !Array.isArray(d.cards) || !d.cards.length) return null;
  return {
    v: 1,
    cards: d.cards,
    pos: (d.pos && typeof d.pos === 'object' && !Array.isArray(d.pos)) ? d.pos : {},
    shaky: Array.isArray(d.shaky) ? d.shaky : [],
    shuffle: !!d.shuffle,
    seed: Number.isFinite(d.seed) ? d.seed : 1,
    view: d.view === 'skim' ? 'skim' : 'stream',   // stage 3: threaded through BOTH fns (they allow-list keys)
  };
}
function saveDeck(d) { set(KEYS.anki, { v: 1, cards: d.cards, pos: d.pos, shaky: d.shaky, shuffle: d.shuffle, seed: d.seed, view: d.view === 'skim' ? 'skim' : 'stream' }); }

export function mountAnki() {
  DATA = null;
  root = $('#ankiDeck');
  if (!root) return;
  render();
}

function render() {
  if (!root) return;
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
    <div class="ank-drop" id="ankDrop" tabindex="0" role="button" aria-label="Drop an Anki export file, or choose a file">
      <span class="ank-drop-ic" aria-hidden="true">⬇</span>
      <span class="ank-drop-t">Drop your Anki export — <b>.apkg</b> (full deck, keeps audio/images) or <b>Notes in Plain Text (.txt)</b>. For .apkg, tick <b>“Support older Anki versions”</b> when exporting.</span>
      <span class="ank-drop-or">or</span>
      <button type="button" class="ank-btn" id="ankPick">Choose a file</button>
      <input type="file" id="ankFile" accept=".txt,.tsv,.csv,.apkg" hidden>
    </div>
    <div class="ank-err" id="ankErr" role="alert" hidden></div>
    <div class="ank-preview" id="ankPreview" hidden></div>`;
  wireImport();
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
  const rd = new FileReader();
  rd.onerror = () => showErr('Could not read that file — try exporting again.');
  rd.onload = () => parseText(String(rd.result || ''));
  rd.readAsText(f);
}

// ---- .apkg import: unzip → minimal sqlite read of notes.flds → the SAME preview/remap
// flow as the TSV path. Media (audio/images) extracts into IndexedDB at Save time.
// zstd-only exports (collection.anki21b, Anki 2.1.50+ default) can't be read without a
// zstd decoder — the error tells the owner to re-export with the legacy checkbox.
function colIdx(createSql, name) {
  const inner = /\(([\s\S]*)\)/.exec(createSql || '');
  if (!inner) return -1;
  return inner[1].split(',').map(s => s.trim().split(/\s+/)[0].replace(/["'\u0060\[\]]/g, '')).indexOf(name);
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
    DATA = { ...res, apkg: { u8, byName, manifest, rows }, nCols: Math.max(...rows.slice(0, 50).map(r => r.length)) };
    renderImport(DATA);
  } catch (err) { showErr(friendlyErr(err)); }
}

// extract only the media the kept cards actually reference; attach a/img refs to the cards
async function attachMedia(cards, apkg, onProgress) {
  const { u8, byName, manifest, rows } = apkg;
  if (!manifest) return cards.map(({ srcIdx, ...c }) => c);
  const out = cards.map(c => {
    const fields = rows[c.srcIdx] || [];
    let a = null, img = null;
    for (const f of fields) { a = a || soundRef(f); img = img || imgRef(f); }
    const { srcIdx, ...rest } = c;
    return { ...rest, ...(a && manifest.has(a) ? { a } : {}), ...(img && manifest.has(img) ? { img } : {}) };
  });
  const refs = [...new Set(out.flatMap(c => [c.a, c.img].filter(Boolean)))];
  await mediaClear();
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
    await mediaPut(name, new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
    if (onProgress && i % 20 === 0) onProgress(i + 1, refs.length);
  }
  return out;
}

// parse (optionally with a manual column override) and show the 3-row preview
function parseText(text, mapping) {
  try {
    const res = parseAnkiExport(text, mapping);
    DATA = { ...res, raw: text };
    renderImport(DATA);
  } catch (err) {
    showErr(friendlyErr(err));
  }
}

function friendlyErr(err) {
  const m = String((err && err.message) || err || '');
  if (/no data rows/.test(m)) return 'That file has no rows — is it the "Notes in Plain Text" export?';
  if (/could not detect columns/.test(m)) return 'Could not tell which columns are the word/meaning — pick them below, or check the file.';
  if (/no usable cards/.test(m)) return 'No usable cards found — every row was empty after cleaning.';
  return 'Could not read that export (' + m + '). In Anki: File → Export → Notes in Plain Text.';
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
  const nCols = DATA?.apkg ? (DATA.nCols || 0) : (res.delim ? maxCols(res.raw, res.delim) : 0);
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
    let cards = res.cards;
    if (DATA?.apkg) {
      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Importing media…'; }
        cards = await attachMedia(res.cards, DATA.apkg, (n, t) => { if (btn) btn.textContent = `Importing media… ${n}/${t}`; });
      } catch (err) {
        console.error('[anki] media import', err);
        showErr('Media import failed (' + (err?.message || err) + ') — the deck was saved without audio/images.');
        cards = res.cards.map(({ srcIdx, ...c }) => c);
      }
    } else cards = res.cards.map(({ srcIdx, ...c }) => c);   // srcIdx is import plumbing — never persisted
    saveDeck({ cards, pos: {}, shaky: [], shuffle: false, seed: 1 });
    DATA = null;
    render();
    $('#ankCard')?.focus({ preventScroll: true });   // hand focus to the card so Space/→/S work immediately (keys are section-scoped by design)
  });
  $('#ankCancel')?.addEventListener('click', () => { DATA = null; renderImport(); });
  box.querySelectorAll('select[data-field]').forEach(sel => sel.addEventListener('change', () => {
    const mapping = {};
    box.querySelectorAll('select[data-field]').forEach(s => { mapping[s.dataset.field] = parseInt(s.value, 10); });
    if (DATA?.apkg) {                                  // apkg: rebuild from the sqlite rows (there is no raw text to re-parse)
      try { const r2 = cardsFromRows(DATA.apkg.rows, mapping); DATA = { ...DATA, ...r2 }; renderImport(DATA); }
      catch (err) { showErr(friendlyErr(err)); }
    } else parseText(res.raw, mapping);   // re-parse with the override
  }));
}

function maxCols(raw, delim) {
  let n = 0;
  String(raw).split('\n').slice(0, 60).forEach(l => {
    if (!l.trim() || /^#\w+:/.test(l)) return;
    n = Math.max(n, l.split(delim).length);
  });
  return n;
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
        <button type="button" class="ank-mini${deck.shuffle ? ' is-on' : ''}" id="ankShuffle" aria-pressed="${deck.shuffle ? 'true' : 'false'}">⇄ Shuffle</button>
        <button type="button" class="ank-mini" id="ankReplace">Replace deck</button>
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
  const chunk = stream && stream.deck === deck && stream.chunk < nChunks ? stream.chunk : 0;
  const order = orderFor(deck, chunk, mode);
  if (mode === 'pile' && !order.length) { renderAllClear(deck); return; }
  const pos = mode === 'pile' ? 0 : Math.min(Math.max(0, deck.pos[chunk] | 0), Math.max(0, order.length - 1));
  stream = { deck, mode, chunk, idx: Math.min(pos, Math.max(0, order.length - 1)), order };

  root.innerHTML = `${barHTML(deck)}
    <div class="ank-strip" id="ankStrip">${stripHTML(deck, chunk, mode)}</div>
    <div class="ank-card" id="ankCard" tabindex="0" role="group" aria-label="Card — tap or press space for next"></div>
    <div class="ank-prog" id="ankProg"></div>
    <p class="ank-hint">space / → next · ← back · <b>S</b> flag shaky · tap the card = next</p>`;

  paintCard();
  wireCommon();
  wireStream();
}

// pile empty at entry — nothing shaky left
function renderAllClear(deck) {
  stream = { deck, mode: 'chunk', chunk: 0, idx: 0, order: [] };
  root.innerHTML = `${barHTML(deck)}
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
  const chunk = stream && stream.deck === deck && stream.chunk < nChunks ? stream.chunk : 0;
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

  root.innerHTML = `${barHTML(deck)}
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
function fillMedia(card) {
  const tok = ++_mediaTok;
  if (_imgUrl) { URL.revokeObjectURL(_imgUrl); _imgUrl = null; }
  if (_audio) { try { _audio.pause(); } catch { /* already stopped */ } _audio = null; }
  if (card.img) {
    mediaGet(card.img).then(b => {
      if (tok !== _mediaTok || !b) return;
      const el = $('#ankImg'); if (!el) return;
      _imgUrl = URL.createObjectURL(b);
      el.src = _imgUrl; el.hidden = false;
    }).catch(() => {});
  }
  $('#ankAudio')?.addEventListener('click', () => {
    mediaGet(card.a).then(b => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      _audio = new Audio(u);
      _audio.addEventListener('ended', () => URL.revokeObjectURL(u), { once: true });
      _audio.play().catch(() => {});
    }).catch(() => {});
  });
}

function paintCard() {
  const { deck, order, idx, chunk, mode } = stream;
  const card = order[idx];
  const el = $('#ankCard');
  if (!el || !card) return;
  const isShaky = deck.shaky.includes(card.id);
  const hair = (card.s || card.sm) ? `<div class="ank-hair" aria-hidden="true"></div>` : '';
  const sent = card.s ? `<div class="ank-sent" lang="ja">${esc(card.s)}</div>` : '';
  const sentM = card.sm ? `<div class="ank-sentm">${esc(card.sm)}</div>` : '';
  el.classList.toggle('is-shaky', isShaky);
  el.innerHTML = `
    ${isShaky ? '<span class="ank-flag" aria-label="flagged shaky" title="flagged shaky">◆ shaky</span>' : ''}
    <div class="ank-word" lang="ja">${esc(card.w) || '&nbsp;'}</div>
    ${card.r ? `<div class="ank-read" lang="ja">${esc(card.r)}</div>` : ''}
    ${card.m ? `<div class="ank-mean">${esc(card.m)}</div>` : ''}
    ${hair}${sent}${sentM}
    ${(card.a || card.img) ? `<div class="ank-media">${card.img ? '<img class="ank-img" id="ankImg" alt="" hidden>' : ''}${card.a ? '<button type="button" class="ank-audio" id="ankAudio" aria-label="Play audio (P)">🔊</button>' : ''}</div>` : ''}`;
  fillMedia(card);

  const total = deck.cards.length;
  const prog = $('#ankProg');
  if (prog) {
    const pct = Math.round((idx + 1) / order.length * 100);
    prog.innerHTML = mode === 'pile'
      ? `<span class="ank-prog-n">${esc(String(idx + 1))} / ${esc(String(order.length))} shaky</span>
         <span class="ank-prog-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`
      : `<span class="ank-prog-n">${esc(String(chunk * CHUNK + idx + 1))} / ${esc(String(total))}</span>
         <span class="ank-prog-dot" aria-hidden="true">·</span>
         <span class="ank-prog-lbl">chunk ${esc(chunkLabel(chunk, total, CHUNK))}</span>
         <span class="ank-prog-mini">${esc(String(idx + 1))}/${esc(String(order.length))}</span>
         <span class="ank-prog-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
  }
  announce(`${card.w}${card.r ? ', ' + card.r : ''}${card.m ? ', ' + card.m : ''}${isShaky ? ', flagged shaky' : ''}`);
}

function persistPos() {
  const { deck, chunk, idx, mode } = stream;
  if (mode === 'pile') return;   // the pile is a snapshot run — it does not own a resume slot
  deck.pos[chunk] = idx;
  saveDeck(deck);
}

function advance(delta) {
  const { order, idx } = stream;
  const next = idx + delta;
  if (next < 0 || next >= order.length) return;
  stream.idx = next;
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
  $('#ankReplace')?.addEventListener('click', () => {
    DATA = null; stream = null;
    renderImport();
    root.insertAdjacentHTML('afterbegin', `<button type="button" class="ank-mini ank-back" id="ankBack">← Back to deck</button>
      <button type="button" class="ank-mini ank-back" id="ankClearFlags">Clear all flags</button>`);
    $('#ankBack')?.addEventListener('click', () => { render(); });
    $('#ankClearFlags')?.addEventListener('click', () => { const d = loadDeck(); if (d) { d.shaky = []; saveDeck(d); } render(); });
  });
}

function wireStream() {
  const card = $('#ankCard');
  card?.addEventListener('click', () => advance(1));
  if (!root.dataset.kbd) {
    root.dataset.kbd = '1';
    root.addEventListener('keydown', (e) => {
      if (!stream) return;
      const t = e.target;
      // BUTTON early-return (stage-3 review): S/Space on a focused skim row or strip chip must
      // not ALSO drive the stream (double-fire); buttons own their keys.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
      if (stream.deck.view === 'skim') return;
    if (k === 'p') { $('#ankAudio')?.click(); return; }
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); advance(-1); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleShakyCurrent(); }
    });
  }
}
