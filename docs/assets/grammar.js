'use strict';
// #/grammar — JLPT grammar reference. P2 = browse UI: level tabs, disclosure cards with the
// FINAL .gtok token DOM (ruby furigana; P3 wires hover/tap/cursor onto it), ふり toggle
// (shared KEYS.furi string-sentinel — 'off'/'', via getRaw/setRaw ONLY), live search
// (pattern kanji / kana / romaji / EN, global scope with background level fetch), chunked
// append for big levels, empty/error states, live-region announcements.
// Plan: specs/plans/2026-07-10-jlpt-grammar.md.
import { $, esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { getRaw, setRaw, KEYS } from './lib/store.js';
import { searchPoints } from './lib/grammar.js';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const FILES = { N5: 'data/grammar-n5.json' };   // grows as levels bake (P7–P10)
const CHUNK = 60;                                // cards appended per IntersectionObserver step

const cache = {};                                // level → points, module-cached after first fetch
const state = { level: 'N5', q: '', shown: CHUNK };
let fetchedAll = false;                          // search is global — remaining levels fetch on first search focus
let io = null;

export function mountGrammar() {
  const root = $('#grammarRoot');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.innerHTML = `
    <div class="g-bar">
      <div class="g-tabs" role="group" aria-label="JLPT level">
        ${LEVELS.map(l => `<button type="button" class="g-tab" data-level="${l}" aria-pressed="${l === state.level}">${l}<span class="g-count" data-count="${l}"></span></button>`).join('')}
      </div>
      <button type="button" class="g-furi" id="gFuri"></button>
      <input type="search" class="g-search" id="gSearch" placeholder="Search 〜てから / maeni / before…" aria-label="Search grammar points (Japanese, romaji or English)">
    </div>
    <div id="gList"></div>
    <div id="gSentinel" aria-hidden="true"></div>`;
  wireBar(root);
  applyFuri();
  io = new IntersectionObserver((es) => {
    if (es.some(x => x.isIntersecting) && state.shown < currentPoints().length) {
      state.shown += CHUNK;
      renderList();
    }
  });
  io.observe($('#gSentinel'));
  load(state.level);
}

// ---- data lifecycle ----
async function load(level, { render = true } = {}) {
  if (!FILES[level] || cache[level]) { if (render) renderList(); return; }
  const view = $('#view-grammar');
  view?.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch(FILES[level]);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const points = await r.json();
    if (!Array.isArray(points)) throw new Error('bad shape');
    cache[level] = points;
    updateCounts();
    if (render) renderList();
  } catch (err) {
    console.error('[grammar] load', level, err);
    if (render) renderLoadError(level);
  } finally {
    view?.removeAttribute('aria-busy');
  }
}

function fetchAllLevels() {          // global search needs the whole corpus (plan: fetch-on-search-focus)
  if (fetchedAll) return;
  fetchedAll = true;
  Promise.all(LEVELS.filter(l => FILES[l] && !cache[l]).map(l => load(l, { render: false })))
    .then(() => { if (state.q) renderList(); });
}

// ---- state / derivations ----
function currentPoints() {
  if (state.q) {
    const all = LEVELS.flatMap(l => cache[l] || []);
    return searchPoints(all, state.q);
  }
  return cache[state.level] || [];
}

// ---- wiring (delegated once; #gList innerHTML rebuilds freely) ----
function wireBar(root) {
  root.querySelector('.g-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.g-tab'); if (!b) return;
    state.level = b.dataset.level;
    state.q = ''; $('#gSearch').value = '';
    state.shown = CHUNK;
    root.querySelectorAll('.g-tab').forEach(t => t.setAttribute('aria-pressed', String(t === b)));
    load(state.level);
  });
  $('#gFuri').addEventListener('click', () => {
    setRaw(KEYS.furi, furiOff() ? '' : 'off');   // shared string sentinel — same key the phrases page toggles
    applyFuri();
  });
  let deb = 0;
  $('#gSearch').addEventListener('focus', fetchAllLevels, { once: true });
  $('#gSearch').addEventListener('input', (e) => {
    clearTimeout(deb);
    deb = setTimeout(() => { state.q = e.target.value.trim(); state.shown = CHUNK; renderList(); }, 150);
  });
  $('#gList').addEventListener('click', (e) => {
    const h = e.target.closest('.g-card-h');
    if (h) {
      const body = document.getElementById(h.getAttribute('aria-controls'));
      const open = h.getAttribute('aria-expanded') === 'true';
      h.setAttribute('aria-expanded', String(!open));
      if (body) body.hidden = open;
      return;
    }
    const rel = e.target.closest('.g-rel-chip');
    if (rel) jumpTo(rel.dataset.target);
  });
}

function jumpTo(id) {
  const pt = LEVELS.flatMap(l => cache[l] || []).find(p => p.id === id);
  if (!pt) return;
  state.level = pt.level; state.q = ''; $('#gSearch').value = ''; state.shown = CHUNK;
  document.querySelectorAll('.g-tab').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.level === pt.level)));
  renderList();
  const card = document.querySelector(`.g-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const h = card.querySelector('.g-card-h');
  h.setAttribute('aria-expanded', 'true');
  card.querySelector('.g-card-b').hidden = false;
  card.classList.add('g-flash');
  setTimeout(() => card.classList.remove('g-flash'), 1200);
  h.focus({ preventScroll: true });
  card.scrollIntoView({ block: 'center' });
}

// ---- furigana (shared site preference) ----
function furiOff() { return getRaw(KEYS.furi, '') === 'off'; }
function applyFuri() {
  const off = furiOff();
  $('#grammar')?.classList.toggle('furi-off', off);
  const btn = $('#gFuri');
  if (btn) { btn.setAttribute('aria-pressed', off ? 'false' : 'true'); btn.textContent = off ? 'ふり Furigana off' : 'ふり Furigana'; }
}

// ---- render ----
function updateCounts() {
  LEVELS.forEach(l => {
    const el = document.querySelector(`.g-count[data-count="${l}"]`);
    if (el) el.textContent = cache[l] ? ` ${cache[l].length}` : '';
  });
}

function renderList() {
  const list = $('#gList'); if (!list) return;
  const pts = currentPoints();
  if (!pts.length) {
    list.innerHTML = state.q
      ? `<p class="g-empty">No matches for “${esc(state.q)}” — try the pattern's kana, its romaji (maeni), or an English word.</p>`
      : (FILES[state.level]
        ? `<p class="g-empty">Nothing here yet.</p>`
        : `<p class="g-empty">${esc(state.level)} isn't baked yet — N5 is live; the other levels land phase by phase.</p>`);
    announce(state.q ? `No matches for ${state.q}` : `${state.level}: no data yet`);
    return;
  }
  const slice = pts.slice(0, state.shown);
  list.innerHTML = slice.map(cardHTML).join('');
  announce(state.q ? `${pts.length} matches` : `${state.level}: ${pts.length} grammar points`);
}

function cardHTML(p) {
  const bid = `gc-${esc(p.id)}`;
  return `
  <article class="g-card" data-id="${esc(p.id)}">
    <button type="button" class="g-card-h" aria-expanded="false" aria-controls="${bid}">
      <span class="g-pat" lang="ja">${esc(p.pattern)}</span>
      <span class="g-mean">${esc(p.meaning)}</span>
      ${state.q ? `<span class="g-lvl">${esc(p.level)}</span>` : ''}
      <span class="g-chev" aria-hidden="true">▾</span>
    </button>
    <div class="g-card-b" id="${bid}" hidden>
      <p class="g-conn"><b>Connection</b> <span lang="ja">${esc(p.connection)}</span></p>
      ${p.nuance ? `<p class="g-nuance">${esc(p.nuance)}</p>` : ''}
      ${(p.examples || []).map(exampleHTML).join('')}
      ${(p.related || []).length ? `<p class="g-rel">See also ${p.related.map(relChip).join(' ')}</p>` : ''}
      <span class="badge ${esc(p.confidence)}">${esc(p.confidence)}</span>
    </div>
  </article>`;
}

function exampleHTML(ex) {
  // FINAL token DOM (plan P2): P3 wires tooltip/strip/cursor onto these exact spans.
  // data-no-swipe: a horizontal drag on a long sentence must scroll, not route-navigate.
  const ja = (ex.ja || []).map(tok => typeof tok === 'string'
    ? esc(tok)
    : `<span class="gtok${tok.p ? ' gtok-p' : ''}" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`).join('');
  return `<div class="g-ex"><p class="g-ja" lang="ja" data-no-swipe>${ja}</p><p class="g-en">${esc(ex.en || '')}</p></div>`;
}

function relChip(id) {
  const pt = LEVELS.flatMap(l => cache[l] || []).find(p => p.id === id);
  return `<button type="button" class="g-rel-chip" data-target="${esc(id)}" lang="ja">${esc(pt ? pt.pattern : id)}</button>`;
}

function renderLoadError(level) {
  const list = $('#gList'); if (!list) return;
  list.innerHTML = `
    <div class="g-error" role="alert">
      <p>Couldn't load the ${esc(level)} grammar data — you may be offline and this level isn't cached yet.</p>
      <button type="button" class="g-retry" id="gRetry">Retry</button>
    </div>`;
  $('#gRetry')?.addEventListener('click', () => load(level));
}

// ---- SR announcements (static #gLive sibling — a live region inside the rebuilt root never announces) ----
let liveTimer = 0;
function announce(msg) {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { const el = document.getElementById('gLive'); if (el) el.textContent = msg; }, 200);
}
