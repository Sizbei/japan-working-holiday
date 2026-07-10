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
import { searchPoints, readingOf } from './lib/grammar.js';
import { lookupWord } from './lang.js';          // shared Jotoba lookup (exported); GLOSSARY is NOT re-exported —
import { GLOSSARY } from './i18n.js';            // it comes straight from i18n.js (plan, round-2 finding)

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const FILES = { N5: 'data/grammar-n5.json' };   // grows as levels bake (P7–P10)
const CHUNK = 60;                                // cards appended per IntersectionObserver step

const cache = {};                                // level → points, module-cached after first fetch
const state = { level: 'N5', q: '', shown: CHUNK };
let fetchedAll = false;                          // search is global — remaining levels fetch on first search focus
let io = null;
let staggerNext = true;                          // card stagger fires on tab switches/boot, NEVER per search keystroke (frequency gate)

export function mountGrammar() {
  const root = $('#grammarRoot');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.innerHTML = `
    <div class="g-bar">
      <div class="g-tabs" role="group" aria-label="JLPT level">
        <span class="g-tab-ind" id="gTabInd" aria-hidden="true"></span>
        ${LEVELS.map(l => `<button type="button" class="g-tab" data-level="${l}" aria-pressed="${l === state.level}">${l}<span class="g-count" data-count="${l}"></span></button>`).join('')}
      </div>
      <button type="button" class="g-furi" id="gFuri"></button>
      <input type="search" class="g-search" id="gSearch" placeholder="Search 〜てから / maeni / before…" aria-label="Search grammar points (Japanese, romaji or English)">
    </div>
    <div id="gList"></div>
    <div id="gSentinel" aria-hidden="true"></div>`;
  wireBar(root);
  applyFuri();
  moveTabInd();
  document.fonts?.ready?.then(moveTabInd);   // web fonts reflow tab widths
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
    staggerNext = true;
    root.querySelectorAll('.g-tab').forEach(t => t.setAttribute('aria-pressed', String(t === b)));
    moveTabInd();
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
    if (rel) { jumpTo(rel.dataset.target); return; }
    const tok = e.target.closest('.gtok');
    if (tok) showStrip(tok);
  });
  wireInspect();
}

function jumpTo(id) {
  const pt = LEVELS.flatMap(l => cache[l] || []).find(p => p.id === id);
  if (!pt) return;
  state.level = pt.level; state.q = ''; $('#gSearch').value = ''; state.shown = CHUNK;
  staggerNext = false;   // no stagger — don't delay the flash/scroll target
  document.querySelectorAll('.g-tab').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.level === pt.level)));
  moveTabInd();
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
  moveTabInd();   // count chips change tab widths
}

// sliding pressed-pill behind the level tabs (spring; reduce-motion global kill covers it).
// First position is set BEFORE .is-ready arms the transition — no fly-in from 0 on boot.
function moveTabInd() {
  const ind = $('#gTabInd');
  const act = document.querySelector('.g-tab[aria-pressed="true"]');
  if (!ind || !act) return;
  ind.style.width = act.offsetWidth + 'px';
  ind.style.height = act.offsetHeight + 'px';
  ind.style.transform = `translateX(${act.offsetLeft}px)`;
  if (!ind.classList.contains('is-ready')) requestAnimationFrame(() => ind.classList.add('is-ready'));
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
  const st = staggerNext; staggerNext = false;
  const slice = pts.slice(0, state.shown);
  list.innerHTML = slice.map((p, i) => cardHTML(p, st ? Math.min(i, 8) * 20 : -1)).join('');
  announce(state.q ? `${pts.length} matches` : `${state.level}: ${pts.length} grammar points`);
}

function cardHTML(p, delay = -1) {
  const bid = `gc-${esc(p.id)}`;
  return `
  <article class="g-card${delay >= 0 ? ' g-in' : ''}" data-id="${esc(p.id)}"${delay >= 0 ? ` style="--gd:${delay}ms"` : ''}>
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
  // FINAL token DOM: P3's tooltip/strip/cursor read the data attrs. data-t is required —
  // textContent of a <ruby> includes the <rt> readings, so it's never a clean word.
  // data-no-swipe: a horizontal drag on a long sentence must scroll, not route-navigate.
  const ja = (ex.ja || []).map(tok => typeof tok === 'string'
    ? esc(tok)
    : `<span class="gtok${tok.p ? ' gtok-p' : ''}" lang="ja" data-t="${esc(tok.t)}" data-r="${esc(readingOf(tok.f))}" data-g="${esc(tok.g || '')}">${rubyHTML(tok.f, tok.t)}</span>`).join('');
  return `<div class="g-ex"><p class="g-ja" lang="ja" data-no-swipe tabindex="0">${ja}</p><p class="g-en">${esc(ex.en || '')}</p></div>`;
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

// ==== P3: token inspect layer ====================================================
// Desktop hover = TOOLTIP (instant — no enter animation: it fires constantly while
// reading, the frequency gate applies; role=tooltip + aria-describedby, the lang.js
// model). Tap / keyboard = GLOSS STRIP pinned below the sentence (toggletip: announced
// via #gLive, focus never moves, NO aria-expanded — per the ARIA pattern). Grammar
// tokens (.gtok-p) get the grammar flavor. One popover across the whole page:
// jwh:popover-open {owner} cross-dismisses with lang.js (self-ignore mandatory).

let tip = null, tipFor = null;

function findPoint(id) { return LEVELS.flatMap(l => cache[l] || []).find(p => p.id === id); }

function tokInfo(el) {
  return { t: el.dataset.t || '', r: el.dataset.r || '', g: el.dataset.g || '', p: el.classList.contains('gtok-p') };
}

function dictHTML(d) {
  return `<span class="g-tip-w" lang="ja">${esc(d.t)}</span>
    <span class="g-tip-r" lang="ja">${esc(d.r)}</span>
    <span class="g-tip-g">${d.g ? esc(d.g) : '—'}</span>
    <a class="g-tip-jisho" href="https://jisho.org/search/${encodeURIComponent(d.t)}" target="_blank" rel="noopener noreferrer">Jisho ↗</a>`;
}

function grammarHTML(point, d) {
  if (!point) return dictHTML(d);
  return `<span class="g-tip-pat" lang="ja">${esc(point.pattern)}</span> <span class="g-lvl">${esc(point.level)}</span>
    ${d.g ? `<span class="g-tip-g">${esc(d.r ? d.r + ' — ' : '')}${esc(d.g)}</span>` : ''}
    <span class="g-tip-conn"><b>Connection</b> <span lang="ja">${esc(point.connection)}</span></span>
    ${point.nuance ? `<span class="g-tip-nuance">${esc(point.nuance)}</span>` : ''}`;
}

// unbaked-gloss fallback: bundled GLOSSARY first (instant, offline), then the shared
// Jotoba lookup (cached, time-boxed inside lang.js) — fails safe to the em dash
async function fillGloss(word, box) {
  const slot = box.querySelector('.g-tip-g');
  if (!slot || !word) return;
  const g = GLOSSARY[word];
  if (g) { slot.textContent = g.m; return; }
  try {
    const r = await lookupWord(word);
    if (r && r.gloss && box.isConnected) slot.textContent = r.gloss;
  } catch { /* offline — leave the em dash */ }
}

function popoverOpened() {
  document.dispatchEvent(new CustomEvent('jwh:popover-open', { detail: { owner: 'grammar' } }));
}

// ---- desktop tooltip ----
function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'g-tip'; tip.id = 'gTip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function showTip(el) {
  const d = tokInfo(el);
  const t = ensureTip();
  t.innerHTML = d.p ? grammarHTML(findPoint(el.closest('.g-card')?.dataset.id), d) : dictHTML(d);
  t.hidden = false;
  const r = el.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(r.left, window.innerWidth - t.offsetWidth - 8)) + 'px';
  const top = r.top - t.offsetHeight - 8;
  t.style.top = (top < 8 ? r.bottom + 8 : top) + 'px';
  if (tipFor && tipFor !== el) tipFor.removeAttribute('aria-describedby');
  tipFor = el; el.setAttribute('aria-describedby', 'gTip');
  popoverOpened();
  if (!d.g && !d.p) fillGloss(d.t, t);
}

function hideTip() {
  if (tip) tip.hidden = true;
  if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor = null; }
}

// ---- tap/keyboard gloss strip ----
function showStrip(tok) {
  const sent = tok.closest('.g-ja'); if (!sent) return;
  hideTip();
  document.querySelectorAll('.g-strip').forEach(x => { if (x.previousElementSibling !== sent) x.remove(); });
  let s = sent.nextElementSibling;
  if (!s || !s.classList.contains('g-strip')) {
    s = document.createElement('div');
    s.className = 'g-strip';
    sent.after(s);
  }
  const d = tokInfo(tok);
  const point = findPoint(tok.closest('.g-card')?.dataset.id);
  s.innerHTML = (d.p ? grammarHTML(point, d) : dictHTML(d))
    + `<button type="button" class="g-strip-x" aria-label="Close">✕</button>`;
  sent.querySelectorAll('.gtok-cur').forEach(x => x.classList.remove('gtok-cur'));
  tok.classList.add('gtok-cur');
  popoverOpened();
  const toks = [...sent.querySelectorAll('.gtok')];
  const pos = `(${toks.indexOf(tok) + 1} of ${toks.length})`;
  announce(d.p && point ? `${point.pattern} — grammar pattern ${pos}` : `${d.r}${d.g ? ' — ' + d.g : ''} ${pos}`);
  if (!d.g && !d.p) fillGloss(d.t, s);
}

function hideStrip() {
  document.querySelectorAll('.g-strip').forEach(x => x.remove());
  document.querySelectorAll('.gtok-cur').forEach(x => x.classList.remove('gtok-cur'));
}

// ---- wiring ----
function wireInspect() {
  const list = $('#gList');
  // tooltip is hover-summoned only — on touch the tap path owns the interaction
  if (window.matchMedia('(hover: hover)').matches) {
    list.addEventListener('mouseover', (e) => { const t = e.target.closest('.gtok'); if (t && t !== tipFor) showTip(t); });
    list.addEventListener('mouseout', (e) => { if (e.target.closest('.gtok')) hideTip(); });
  }
  // keyboard token cursor: the sentence is ONE tab stop; ←/→ rove over object tokens,
  // the strip follows, #gLive announces "reading — gloss (n of N)" on every move
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideStrip(); hideTip(); return; }   // section-scoped; idempotent beside the global Escape listeners
    const sent = e.target.closest && e.target.closest('.g-ja');
    if (!sent || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const toks = [...sent.querySelectorAll('.gtok')];
    if (!toks.length) return;
    e.preventDefault();
    const i = toks.indexOf(sent.querySelector('.gtok-cur'));
    const next = e.key === 'ArrowRight' ? Math.min(i + 1, toks.length - 1) : Math.max(i - 1, 0);
    showStrip(toks[next]);
  });
  // strip close: ✕, click-away, or another popover system opening
  document.addEventListener('click', (e) => {
    if (e.target.closest('.g-strip-x')) { hideStrip(); return; }
    if (document.querySelector('.g-strip') && !e.target.closest('.g-strip, .gtok')) hideStrip();
  });
  document.addEventListener('jwh:popover-open', (e) => {
    if (e.detail?.owner && e.detail.owner !== 'grammar') { hideTip(); hideStrip(); }
  });
}
