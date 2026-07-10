'use strict';
// #/grammar — JLPT grammar reference. P1 = route shell + data lifecycle only: lazy fetch of
// the active level file, aria-busy while loading, offline/error state with retry, and a
// minimal proof-of-fetch listing. Browse UI (tabs/cards/furigana/hover) lands in P2.
// Plan: specs/plans/2026-07-10-jlpt-grammar.md.
import { $, esc } from './lib/dom.js';

const FILES = { N5: 'data/grammar-n5.json' };   // grows as levels bake (P7–P10)
const cache = {};                                // level → points, module-cached after first fetch

export function mountGrammar() {
  if (!$('#grammarRoot')) return;
  load('N5');
}

async function load(level) {
  const root = $('#grammarRoot'); if (!root) return;
  const view = $('#view-grammar');
  if (cache[level]) return render(cache[level], level);
  view?.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch(FILES[level]);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const points = await r.json();
    if (!Array.isArray(points)) throw new Error('bad shape');
    cache[level] = points;
    render(points, level);
  } catch (err) {
    console.error('[grammar] load', err);
    renderError(level);
  } finally {
    view?.removeAttribute('aria-busy');
  }
}

function render(points, level) {
  const root = $('#grammarRoot'); if (!root) return;
  root.innerHTML = `
    <p class="g-seed-note">${esc(String(points.length))} ${esc(level)} points seeded — level tabs, cards, furigana and hover land next.</p>
    <ul class="g-seed-list">
      ${points.map(p => `<li><span class="g-seed-pattern" lang="ja">${esc(p.pattern || '')}</span><span class="g-seed-meaning">${esc(p.meaning || '')}</span></li>`).join('')}
    </ul>`;
}

function renderError(level) {
  const root = $('#grammarRoot'); if (!root) return;
  root.innerHTML = `
    <div class="g-error" role="alert">
      <p>Couldn't load the ${esc(level)} grammar data — you may be offline and this level isn't cached yet.</p>
      <button type="button" class="g-retry" id="gRetry">Retry</button>
    </div>`;
  $('#gRetry')?.addEventListener('click', () => load(level));
}
