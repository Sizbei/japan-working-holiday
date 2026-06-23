'use strict';
// Phrasebook page (#/phrases) — a curated survival-Japanese reference: categorized,
// collapsible (shared accordion), each phrase with the Japanese (.jp, hover-dictionary),
// a reading, an English meaning, and a ★ favorite toggle. Read-only content from
// tips.json.phrases; favorites are the only device-local state (jwh-phrasefav-v1).
// Nothing here dispatches jwh:data-changed (nothing else derives from it).
//
// Reuses lib/packing.js groupByCategory (generic) + collapse.js accordion. After each
// render it calls wireJpAccents() so the JS-rendered .jp phrases get keyboard access.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { slug } from './lib/places.js';
import { mountAccordion } from './collapse.js';
import { groupByCategory } from './lib/packing.js';
import { wireJpAccents } from './lang.js';
import { toAnkiTSV } from './lib/anki.js';
import { isAvailable, invoke } from './lib/ankiconnect.js';
import { alertModal } from './lib/modal.js';

// fixed category render order (unknown cats fall to the end, per groupByCategory)
const CATEGORY_ORDER = ['Daily', 'Konbini', 'Restaurant', 'Transit', 'Ward office', 'Apartment', 'Emergency', 'Work/meetup'];

let DATA = null;

function bakedPhrases() { return DATA && Array.isArray(DATA.phrases) ? DATA.phrases : []; }
function loadFavs() { return get(KEYS.phraseFav, {}) || {}; }
function saveFavs(m) { set(KEYS.phraseFav, m); }
function favOnly() { return getRaw(KEYS.phraseFavView, '') === 'on'; }

export function mountPhrases(data) {
  DATA = data || {};
  const list = $('#phraseList');
  if (!list) return;
  wireControls();
  render();
}

function exportRows(favScope) {
  const favs = loadFavs();
  const src = favScope ? bakedPhrases().filter(p => favs[p.id]) : bakedPhrases();
  const users = get(KEYS.userPhrases, []) || [];
  const all = [...src, ...(favScope ? users.filter(p => favs[p.id]) : users)];
  return all.map(p => ({ front: p.jp, back: [p.read, p.en].filter(Boolean).join(' <br> '), tags: ['whv', p.cat || 'Phrase'] }));
}

async function doExport() {
  const favScope = $('#jtFavScope')?.checked;
  const rows = exportRows(favScope);
  if (!rows.length) { alertModal('No phrases to export.'); return; }
  const deck = getRaw(KEYS.ankiDeck, 'Japan WHV');
  if (await isAvailable()) {
    try {
      await invoke('createDeck', { deck });
      const notes = rows.map(r => ({ deckName: deck, modelName: 'Basic', fields: { Front: r.front, Back: r.back }, tags: r.tags, options: { allowDuplicate: false } }));
      const can = await invoke('canAddNotes', { notes });
      const res = await invoke('addNotes', { notes });
      const added = (res || []).filter(x => x != null).length;
      const skipped = notes.length - (can || []).filter(Boolean).length;
      alertModal(`Added ${added} to “${deck}”${skipped ? ` (${skipped} duplicates skipped)` : ''}.`);
      return;
    } catch (e) { /* fall through to file */ }
  }
  const blob = new Blob([toAnkiTSV(rows)], { type: 'text/tab-separated-values' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'japan-phrases.txt';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  alertModal('Anki not detected — downloaded japan-phrases.txt. In Anki: File → Import.');
}

function wireControls() {
  const fav = $('#phraseFavOnly');
  if (fav && !fav.dataset.wired) {
    fav.dataset.wired = '1';
    fav.addEventListener('click', () => {
      const on = !favOnly();
      setRaw(KEYS.phraseFavView, on ? 'on' : '');
      fav.setAttribute('aria-pressed', on ? 'true' : 'false');
      fav.textContent = on ? '★ Favorites only' : '☆ Favorites only';
      render();
    });
    // reflect persisted state on mount
    const on = favOnly();
    fav.setAttribute('aria-pressed', on ? 'true' : 'false');
    fav.textContent = on ? '★ Favorites only' : '☆ Favorites only';
  }
  $('#jtExport')?.addEventListener('click', doExport);
}

function rowHTML(p, favs) {
  const id = p.id;
  const on = !!favs[id];
  return `
    <li class="phrase-row" data-id="${esc(id)}">
      <div class="phrase-main">
        <span class="jp phrase-jp" lang="ja">${esc(p.jp)}</span>
        <span class="phrase-read">${esc(p.read)}</span>
        <span class="phrase-en">${esc(p.en)}</span>
      </div>
      <button type="button" class="phrase-fav${on ? ' is-on' : ''}" data-fav="${esc(id)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="Favorite: ${esc(p.en)}">${on ? '★' : '☆'}</button>
    </li>`;
}

function render() {
  const wrap = $('#phraseList');
  if (!wrap) return;
  const all = bakedPhrases();
  const favs = loadFavs();
  const filtered = favOnly() ? all.filter(p => favs[p.id]) : all;

  if (!filtered.length) {
    wrap.innerHTML = `<div class="empty">${favOnly() ? 'No favorites yet — tap ☆ on a phrase to pin it.' : 'No phrases yet.'}</div>`;
    return;
  }

  const groups = groupByCategory(filtered, CATEGORY_ORDER);
  wrap.innerHTML = groups.map(g => {
    const accId = `ph-cat-${slug(g.cat)}`;
    const rows = g.items.map(p => rowHTML(p, favs)).join('');
    return `<section class="acc phrase-cat" data-acc="${esc(accId)}">
      <button type="button" class="acc-head" aria-expanded="true" aria-controls="acc-panel-${esc(accId)}" aria-label="${esc(g.cat)}">
        <span class="acc-chevron" aria-hidden="true">›</span>
        <span class="acc-title">${esc(g.cat)}</span>
        <span class="acc-count">${esc(String(g.items.length))}</span>
      </button>
      <div class="acc-panel" id="acc-panel-${esc(accId)}" role="region" aria-label="${esc(g.cat)}">
        <div class="acc-inner">
          <ul class="phrase-list">${rows}</ul>
        </div>
      </div>
    </section>`;
  }).join('');

  wireRows();
  wireJpAccents(wrap);                 // keyboard-enable the JS-rendered .jp phrases
  mountAccordion(wrap, { allToggle: $('#phraseCollapseAll') });
}

function wireRows() {
  $$('#phraseList .phrase-fav').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.fav;
    const m = { ...loadFavs() };
    if (m[id]) delete m[id]; else m[id] = true;
    saveFavs(m);
    render();
  }));
}
