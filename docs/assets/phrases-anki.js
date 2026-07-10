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
  parseAnkiExport, chunkCount, chunkSlice, chunkLabel, toggleShaky, shuffled,
} from './lib/anki.js';

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
  };
}
function saveDeck(d) { set(KEYS.anki, { v: 1, cards: d.cards, pos: d.pos, shaky: d.shaky, shuffle: d.shuffle, seed: d.seed }); }

export function mountAnki(data) {
  DATA = null;
  root = $('#ankiDeck');
  if (!root) return;
  render();
}

function render() {
  if (!root) return;
  const deck = loadDeck();
  if (deck) renderStream(deck);
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
      <span class="ank-drop-t">Export from Anki: <b>Notes in Plain Text (.txt)</b> → drop it here</span>
      <span class="ank-drop-or">or</span>
      <button type="button" class="ank-btn" id="ankPick">Choose a file</button>
      <input type="file" id="ankFile" accept=".txt,.tsv,.csv" hidden>
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
  const rd = new FileReader();
  rd.onerror = () => showErr('Could not read that file — try exporting again.');
  rd.onload = () => parseText(String(rd.result || ''));
  rd.readAsText(f);
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
  const nCols = res.delim ? maxCols(res.raw, res.delim) : 0;
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

  $('#ankSave')?.addEventListener('click', () => {
    saveDeck({ cards: res.cards, pos: {}, shaky: [], shuffle: false, seed: 1 });
    DATA = null;
    render();
    $('#ankCard')?.focus({ preventScroll: true });   // hand focus to the card so Space/→/S work immediately (keys are section-scoped by design)
  });
  $('#ankCancel')?.addEventListener('click', () => { DATA = null; renderImport(); });
  box.querySelectorAll('select[data-field]').forEach(sel => sel.addEventListener('change', () => {
    const mapping = {};
    box.querySelectorAll('select[data-field]').forEach(s => { mapping[s.dataset.field] = parseInt(s.value, 10); });
    parseText(res.raw, mapping);   // re-parse with the override; keeps the details panel open on the next render? no — reset is fine
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

// ───────────────────────────── stream mode ─────────────────────────────

let stream = null;   // { deck, chunk, idx, order } — the live view state

function orderFor(deck, chunk) {
  const slice = chunkSlice(deck.cards, chunk, CHUNK);
  return deck.shuffle ? shuffled(slice, deck.seed + chunk) : slice;
}

function renderStream(deck) {
  const nChunks = chunkCount(deck.cards.length, CHUNK);
  // resume: keep the current chunk if we already have one, else chunk 0
  const chunk = stream && stream.deck === deck && stream.chunk < nChunks ? stream.chunk : 0;
  const order = orderFor(deck, chunk);
  const pos = Math.min(Math.max(0, deck.pos[chunk] | 0), Math.max(0, order.length - 1));
  stream = { deck, chunk, idx: pos, order };

  const strip = Array.from({ length: nChunks }, (_, i) => `
    <button type="button" class="ank-chip${i === chunk ? ' active' : ''}" data-chunk="${i}" aria-pressed="${i === chunk ? 'true' : 'false'}">
      ${esc(chunkLabel(i, deck.cards.length, CHUNK))}</button>`).join('');

  root.innerHTML = `
    <div class="ank-bar">
      <h3 class="ank-h ank-h-sm">Core deck</h3>
      <div class="ank-bar-acts">
        <button type="button" class="ank-mini${deck.shuffle ? ' is-on' : ''}" id="ankShuffle" aria-pressed="${deck.shuffle ? 'true' : 'false'}">⇄ Shuffle</button>
        <button type="button" class="ank-mini" id="ankReplace">Replace deck</button>
      </div>
    </div>
    <div class="ank-strip" id="ankStrip">${strip}</div>
    <div class="ank-card" id="ankCard" tabindex="0" role="group" aria-label="Card — tap or press space for next"></div>
    <div class="ank-prog" id="ankProg" aria-live="polite"></div>
    <p class="ank-hint">space / → next · ← back · <b>S</b> flag shaky · tap the card = next</p>`;

  paintCard();
  wireStream();
}

function paintCard() {
  const { deck, order, idx, chunk } = stream;
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
    ${hair}${sent}${sentM}`;

  const total = deck.cards.length;
  const globalN = chunk * CHUNK + idx + 1;
  const prog = $('#ankProg');
  if (prog) {
    const pct = Math.round((idx + 1) / order.length * 100);
    prog.innerHTML = `
      <span class="ank-prog-n">${esc(String(globalN))} / ${esc(String(total))}</span>
      <span class="ank-prog-dot" aria-hidden="true">·</span>
      <span class="ank-prog-lbl">chunk ${esc(chunkLabel(chunk, total, CHUNK))}</span>
      <span class="ank-prog-mini">${esc(String(idx + 1))}/${esc(String(order.length))}</span>
      <span class="ank-prog-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
  }
}

function persistPos() {
  const { deck, chunk, idx } = stream;
  deck.pos[chunk] = idx;
  saveDeck(deck);
}

function advance(delta) {
  const { order, idx } = stream;
  const next = idx + delta;
  if (next < 0 || next >= order.length) return;   // clamp at chunk edges (chunk switch is via the strip)
  stream.idx = next;
  paintCard();
  persistPos();
}

function toggleShakyCurrent() {
  const { deck, order, idx } = stream;
  const card = order[idx];
  if (!card) return;
  deck.shaky = toggleShaky(deck.shaky, card.id);
  saveDeck(deck);
  paintCard();
}

function switchChunk(chunk) {
  const { deck } = stream;
  const order = orderFor(deck, chunk);
  const pos = Math.min(Math.max(0, deck.pos[chunk] | 0), Math.max(0, order.length - 1));
  stream = { deck, chunk, idx: pos, order };
  root.querySelectorAll('.ank-chip').forEach(b => {
    const on = parseInt(b.dataset.chunk, 10) === chunk;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const active = root.querySelector('.ank-chip.active');
  active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  paintCard();
}

function wireStream() {
  const card = $('#ankCard');
  card?.addEventListener('click', () => advance(1));
  $('#ankStrip')?.querySelectorAll('.ank-chip').forEach(b => b.addEventListener('click', () => switchChunk(parseInt(b.dataset.chunk, 10))));

  $('#ankShuffle')?.addEventListener('click', () => {
    const deck = stream.deck;
    deck.shuffle = !deck.shuffle;
    saveDeck(deck);
    stream = null;   // force a full re-derive of order
    renderStream(deck);
  });
  $('#ankReplace')?.addEventListener('click', () => {
    // does NOT clear the saved deck — only re-opens the importer; a new file must parse OK to replace.
    DATA = null; stream = null;
    renderImport();
    root.insertAdjacentHTML('afterbegin', `<button type="button" class="ank-mini ank-back" id="ankBack">← Back to deck</button>`);
    $('#ankBack')?.addEventListener('click', () => { render(); });
  });

  // keyboard: only when the Core-deck card/section holds focus (don't hijack the whole page)
  if (!root.dataset.kbd) {
    root.dataset.kbd = '1';
    root.addEventListener('keydown', (e) => {
      if (!stream) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); advance(-1); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleShakyCurrent(); }
    });
  }
}
