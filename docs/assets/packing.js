'use strict';
// Packing page (#/packing) — a "super checklist": categorized, collapsible (shared
// accordion), drag-reorderable, with a check/add/remove + progress bar. All state is
// device-local; nothing here dispatches jwh:data-changed (nothing else derives from it).
//
// Pure grouping/progress math lives in lib/packing.js; this file is DOM glue.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { slug } from './lib/places.js';
import { makeSortable } from './dnd.js';
import { mountAccordion } from './collapse.js';
import { celebrate } from './celebrate.js';
import { groupByCategory, progress, CATEGORY_ORDER } from './lib/packing.js';
import { renameById } from './lib/checklist.js';   // generic pure rename helper (shared with the checklist)
import { listCtl, LISTCTL } from './lib/listctl.js';

let DATA = null;
let lastPct = null;
let searchQ = '';   // live search/filter query (view-only; never mutates data)

// ---- state (defensive reads — type-guarded fallbacks) ----
function bakedItems() { return DATA && Array.isArray(DATA.packing) ? DATA.packing : []; }
function loadCustom() { return get(KEYS.packCustom, []) || []; }
function saveCustom(arr) { set(KEYS.packCustom, arr); }
function loadChecks() { return get(KEYS.packing, {}) || {}; }
function saveChecks(m) { set(KEYS.packing, m); }
function loadOrder() { return get(KEYS.packOrder, {}) || {}; }
function saveOrder(o) { set(KEYS.packOrder, o); }
function hideDone() { return getRaw(KEYS.packHideDone, '') === 'on'; }

// full item list (baked ++ custom). custom items carry an `_custom:true` marker for the row UI.
function allItems() {
  return [...bakedItems(), ...loadCustom().map(c => ({ ...c, _custom: true }))];
}

// reconcile a category's items against a saved id order (unknown/new ids append). Pure,
// lazy — orphaned ids in the saved order are simply skipped. (mirrors content.js orderItems)
function orderItems(items, savedOrder) {
  if (!savedOrder || !savedOrder.length) return items;
  const map = new Map(items.map(it => [it.id, it]));
  const out = [];
  savedOrder.forEach(id => { if (map.has(id)) { out.push(map.get(id)); map.delete(id); } });
  items.forEach(it => { if (map.has(it.id)) out.push(it); });
  return out;
}

export function mountPacking(data) {
  DATA = data || {};
  const list = $('#packList');
  if (!list) return;
  renderPackToolbar();
  wireControls();
  wirePackSettingsListener();
  render();
}

// ---- toolbar (#packQuickline) — variant A (quick-line) or B (two pills) ----
// Both variants expose #packSearch (the live filter input) and #packAddCat (the target-category
// select) so the shared filter (searchQ→render) and add path work identically. The toolbar lives
// OUTSIDE #packList, so render()'s rebuild doesn't touch it — re-rendered on mount + settings change.
function packCatOptions() {
  return CATEGORY_ORDER.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}
function renderPackToolbar() {
  const host = $('#packQuickline');
  if (!host) return;
  const opts = packCatOptions();
  if (listCtl() === LISTCTL.PILLS) {
    host.innerHTML = `
      <div class="lc-pills">
        <button type="button" class="lc-pill" id="packSearchPill" aria-expanded="false" aria-controls="packSearchWrap"><span class="lc-gx" aria-hidden="true">🔍</span> Search</button>
        <button type="button" class="lc-pill" id="packAddPill" aria-expanded="false" aria-controls="packAddWrap"><span class="lc-gx" aria-hidden="true">＋</span> Add</button>
      </div>
      <div class="lc-search-wrap" id="packSearchWrap">
        <div class="ql-field">
          <span class="ql-icon" aria-hidden="true">🔍</span>
          <input type="search" id="packSearch" class="ql-input" placeholder="Filter items…" aria-label="Filter packing items" autocomplete="off">
          <button type="button" class="lc-miniclose" id="packSearchClose" aria-label="Close search">✕</button>
        </div>
      </div>
      <div class="ql-reveal lc-add-wrap" id="packAddWrap"><div>
        <div class="lc-composer">
          <input type="text" id="packAddText" class="ql-input lc-add-input" placeholder="New item…" aria-label="New item" autocomplete="off">
          <select id="packAddCat" class="ql-sel" aria-label="Category">${opts}</select>
          <button type="button" class="ql-addsuggest lc-add-go" id="packAddGo">＋ Add</button>
          <button type="button" class="lc-miniclose" id="packAddClose" aria-label="Cancel">✕</button>
        </div>
      </div></div>`;
  } else {
    host.innerHTML = `
      <div class="ql-field">
        <span class="ql-icon" aria-hidden="true">🔍</span>
        <input type="search" id="packSearch" class="ql-input" placeholder="Search or add an item…" aria-label="Search or add a packing item" autocomplete="off">
        <span class="ql-hint" id="packQlHint" aria-hidden="true">enter ↵ filtering</span>
      </div>
      <div class="ql-reveal" id="packAddRow"><div>
        <div class="ql-quickadd">
          <span class="ql-lab">add to</span>
          <select id="packAddCat" class="ql-sel" aria-label="Category">${opts}</select>
          <button type="button" class="ql-addsuggest" id="packAddBtn">＋ Add “<span class="ql-q" id="packAddQ"></span>”</button>
        </div>
      </div></div>`;
  }
  wireToolbar();
}

// In the pills variant, the no-match empty state opens the Add composer pre-filled. Set by wireToolbar.
let packPillsOpenAdd = null;
// Wire the active toolbar variant (fresh nodes each render).
function wireToolbar() {
  const search = $('#packSearch');
  if (!search) return;
  if (listCtl() === LISTCTL.PILLS) {
    const searchPill = $('#packSearchPill'), searchWrap = $('#packSearchWrap');
    const addPill = $('#packAddPill'), addWrap = $('#packAddWrap'), addText = $('#packAddText');
    const reduce = document.documentElement.dataset.reduceMotion === 'on';
    const openSearch = (open) => {
      searchPill.classList.toggle('is-on', open);
      searchPill.setAttribute('aria-expanded', String(open));
      searchWrap.classList.toggle('is-open', open);
      if (open) { setTimeout(() => search.focus(), reduce ? 0 : 120); }
      else { search.value = ''; searchQ = ''; render(); searchPill.focus(); }
    };
    const openAdd = (open) => {
      addPill.classList.toggle('is-on', open);
      addPill.setAttribute('aria-expanded', String(open));
      addWrap.classList.toggle('is-open', open);
      if (open) { setTimeout(() => addText.focus(), reduce ? 0 : 120); }
      else { addText.value = ''; addPill.focus(); }
    };
    searchPill.addEventListener('click', () => openSearch(searchPill.getAttribute('aria-expanded') !== 'true'));
    $('#packSearchClose')?.addEventListener('click', () => openSearch(false));
    search.addEventListener('input', () => { searchQ = (search.value || '').trim().toLowerCase(); render(); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); openSearch(false); } });
    addPill.addEventListener('click', () => openAdd(addPill.getAttribute('aria-expanded') !== 'true'));
    $('#packAddClose')?.addEventListener('click', () => openAdd(false));
    $('#packAddGo')?.addEventListener('click', () => { if (addText.value.trim()) { addPackFromComposer(); openAdd(false); } });
    addText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (addText.value.trim()) { addPackFromComposer(); openAdd(false); } }
      else if (e.key === 'Escape') { e.preventDefault(); openAdd(false); }
    });
    packPillsOpenAdd = (prefill) => { addText.value = prefill || ''; openAdd(true); };
  } else {
    packPillsOpenAdd = null;
    const addRow = $('#packAddRow'), hint = $('#packQlHint'), qEcho = $('#packAddQ');
    const sync = () => {
      const raw = search.value;
      searchQ = raw.trim().toLowerCase();
      const has = raw.trim().length > 0;
      if (qEcho) qEcho.textContent = raw.trim();
      addRow?.classList.toggle('is-open', has);
      render();
      if (hint) hint.textContent = has ? 'enter ↵ = add' : 'enter ↵ filtering';
    };
    search.addEventListener('input', sync);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (search.value.trim()) addPackFromQuickline(); }
      else if (e.key === 'Escape') { e.preventDefault(); search.value = ''; sync(); }
    });
    $('#packAddBtn')?.addEventListener('click', () => { if (search.value.trim()) addPackFromQuickline(); });
  }
}

function wireControls() {
  // hide-done toggle (lives in .pack-tools, outside the variant toolbar — wire once)
  const hd = $('#packHideDone');
  if (hd && !hd.dataset.wired) {
    hd.dataset.wired = '1';
    hd.addEventListener('click', () => {
      setRaw(KEYS.packHideDone, hideDone() ? '' : 'on');
      render();
    });
  }
  // collapse-all is wired by mountAccordion (passed the element); nothing here.
}

// Re-render the toolbar (and reset the live filter) when the List-controls setting flips. Wire once.
let packSettingsWired = false;
function wirePackSettingsListener() {
  if (packSettingsWired) return;
  packSettingsWired = true;
  document.addEventListener('jwh:settings-changed', () => {
    if (!$('#packQuickline')) return;
    searchQ = '';
    renderPackToolbar();
    render();
  });
}

// Shared add path: persist a custom item in the selected category, then re-render. `focusEl` (optional)
// gets focus after the rebuild.
function commitPackItem(item, focusEl) {
  item = (item || '').trim();
  if (!item) return;
  const sel = $('#packAddCat');
  const cat = CATEGORY_ORDER.includes(sel?.value) ? sel.value : 'Misc';
  saveCustom([...loadCustom(), { id: 'pku' + Date.now(), cat, item }]);
  render();
  focusEl?.focus();
}
// Variant A: commit the quick-line query, then clear it (restores the full list + hides the add row).
function addPackFromQuickline() {
  const search = $('#packSearch');
  const item = (search?.value || '').trim();
  if (!item) return;
  if (search) search.value = '';
  searchQ = '';
  $('#packAddRow')?.classList.remove('is-open');
  const hint = $('#packQlHint'); if (hint) hint.textContent = 'enter ↵ filtering';
  commitPackItem(item, search);
}
// Variant B: commit the composer text, then clear it.
function addPackFromComposer() {
  const text = $('#packAddText');
  const item = (text?.value || '').trim();
  if (!item) return;
  if (text) text.value = '';
  commitPackItem(item, text);
}

// identify the focused control so render() can restore it after the innerHTML rebuild
function capturePackFocus() {
  const a = document.activeElement, wrap = $('#packList');
  if (!a || !wrap || !wrap.contains(a)) return null;
  const escSel = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
  if (a.classList.contains('acc-head')) {
    const acc = a.closest('.acc');
    if (acc?.dataset.acc) return `.acc[data-acc="${escSel(acc.dataset.acc)}"] .acc-head`;
  }
  if (a.dataset.pid) return `input[data-pid="${escSel(a.dataset.pid)}"]`;
  if (a.dataset.del) return `button[data-del="${escSel(a.dataset.del)}"]`;
  const li = a.closest?.('.pack-item');
  if (li && a.classList.contains('dnd-handle')) return `.pack-item[data-id="${escSel(li.dataset.id)}"] .dnd-handle`;
  return null;
}

function itemRowHTML(it, checked, drag) {
  const id = it.id;
  const on = !!checked[id];
  const conf = (it.confidence || '').toLowerCase();
  const lowBadge = conf === 'low' ? `<span class="badge low">verify</span>` : '';
  const note = it.note ? `<span class="pack-note">${esc(it.note)}</span>` : '';
  const remove = it._custom
    ? `<button type="button" class="pack-edit" data-edit="${esc(id)}" aria-label="Edit ${esc(it.item)}">✎</button>`
      + `<button type="button" class="pack-del" data-del="${esc(id)}" aria-label="Remove ${esc(it.item)}">✕</button>`
    : '';
  return `
    <li class="pack-item" data-id="${esc(id)}">
      ${drag ? '<button type="button" class="dnd-handle" aria-label="Reorder item" tabindex="0">⠿</button>' : ''}
      <label class="pack-row">
        <input type="checkbox" data-pid="${esc(id)}" ${on ? 'checked' : ''} aria-label="${esc(it.item)}">
        <span class="pack-body">
          <span class="pack-name">${esc(it.item)} ${lowBadge}</span>
          ${note}
        </span>
      </label>
      ${remove}
    </li>`;
}

function render() {
  const wrap = $('#packList');
  if (!wrap) return;
  const items = allItems();
  if (!items.length) { wrap.innerHTML = `<div class="empty">No packing items yet.</div>`; updateProgress(items); return; }

  const checked = loadChecks();
  const order = loadOrder();
  const hd = hideDone();
  const searching = !!searchQ;
  const match = it => !searching || (it.item || '').toLowerCase().includes(searchQ);
  const focusSel = capturePackFocus();
  const groups = groupByCategory(items, CATEGORY_ORDER);

  // drag is meaningless over a filtered list (hide-done) or a search-narrowed view
  const drag = !hd && !searching;

  const sections = groups.map(g => {
    const all = g.items.filter(match);
    if (searching && !all.length) return '';   // drop categories with no matches
    const ordered = orderItems(all, order[g.cat]).filter(it => !(hd && checked[it.id]));
    // counts are over the FULL category (not the search/hide-done-filtered rows)
    const total = g.items.length;
    const done = g.items.filter(it => checked[it.id]).length;
    const accId = `pack-cat-${slug(g.cat)}`;
    const rows = ordered.length
      ? ordered.map(it => itemRowHTML(it, checked, drag)).join('')
      : `<li class="pack-empty">All packed in this category.</li>`;
    return `<section class="acc pack-cat" data-acc="${esc(accId)}">
      <button type="button" class="acc-head" aria-expanded="true" aria-controls="acc-panel-${esc(accId)}" aria-label="${esc(g.cat)}">
        <span class="acc-chevron" aria-hidden="true">›</span>
        <span class="acc-title">${esc(g.cat)}</span>
        <span class="acc-count">${esc(String(done))}/${esc(String(total))}</span>
      </button>
      <div class="acc-panel" id="acc-panel-${esc(accId)}" role="region" aria-label="${esc(g.cat)}">
        <div class="acc-inner">
          <ul class="pack-list" data-cat="${esc(g.cat)}">${rows}</ul>
        </div>
      </div>
    </section>`;
  }).join('');

  wrap.innerHTML = sections || `<div class="empty list-empty">No matches for “${esc(searchQ)}”.<br>
      <button type="button" class="list-empty-add" id="packEmptyAdd">＋ Add “<span class="lea-q">${esc(searchQ)}</span>”</button>
    </div>`;

  wireRows();
  wirePackEmptyAdd();
  // drag-reorder per category — only when fully unfiltered (no drag over a hidden/searched view)
  if (drag) {
    $$('#packList .pack-list').forEach(ul => makeSortable(ul, {
      itemSelector: '.pack-item', handleSelector: '.dnd-handle', label: 'item',
      idOf: el => el.dataset.id,
      onReorder: (ids) => { const o = loadOrder(); o[ul.dataset.cat] = ids; saveOrder(o); },
    }));
  }
  // wire/restore collapse state AFTER makeSortable. Pass the element (it lives outside #packList).
  // While searching, force every category open so matches aren't hidden in a collapsed panel.
  mountAccordion(wrap, { allToggle: $('#packCollapseAll'), forceExpanded: searching });
  if (focusSel) wrap.querySelector(focusSel)?.focus();
  updateProgress(items);
}

// Search → Add shortcut: the inline ＋ Add “<q>” button in the no-match empty state.
// Re-rendered with the list, so (re)bind each render. In A it commits the query straight from
// #packSearch; in B it opens the Add composer pre-filled (the search input stays the filter).
function wirePackEmptyAdd() {
  const btn = $('#packEmptyAdd');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (listCtl() === LISTCTL.PILLS && packPillsOpenAdd) packPillsOpenAdd(searchQ);
    else addPackFromQuickline();
  });
}

function wireRows() {
  $$('#packList input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const m = { ...loadChecks() };
    if (cb.checked) m[cb.dataset.pid] = true; else delete m[cb.dataset.pid];
    saveChecks(m);
    render();
  }));
  $$('#packList .pack-edit').forEach(b => b.addEventListener('click', () => openPackEditor(b.dataset.edit)));
  $$('#packList .pack-del').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del;
    saveCustom(loadCustom().filter(x => x.id !== id));   // drop from custom
    const m = { ...loadChecks() }; delete m[id]; saveChecks(m);   // clear its checked entry
    const o = loadOrder();   // lazy-clean order maps (skip orphaned id)
    Object.keys(o).forEach(cat => { o[cat] = (o[cat] || []).filter(x => x !== id); });
    saveOrder(o);
    render();
  }));
}

// Inline-edit a custom packing item. Swaps the .pack-name text for a focused <input>; Enter/blur
// saves (renameById → save → re-render), Esc cancels. A re-render rebuilds innerHTML, so only one
// editor can ever be open at once. Blank/whitespace save is a no-op (renameById ignores it).
function openPackEditor(id) {
  const li = $(`#packList .pack-item[data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (!li) return;
  const name = li.querySelector('.pack-name');
  if (!name || li.querySelector('.pack-edit-input')) return;
  const it = loadCustom().find(x => x.id === id);
  if (!it) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pack-edit-input';
  input.setAttribute('aria-label', 'Edit item');
  input.value = it.item || '';              // .value (DOM property) — safe
  name.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = (save, refocus) => {
    if (done) return; done = true;
    if (save) saveCustom(renameById(loadCustom(), id, 'item', input.value));
    render();                               // save → close → re-render (cancel just re-renders the original)
    if (refocus) {                          // keyboard commit (Enter/Esc): return focus to the row; NOT on blur (would hijack a click)
      const cssId = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
      ($(`#packList .pack-edit[data-edit="${cssId}"]`) || $(`#packList input[data-pid="${cssId}"]`))?.focus();
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true, true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false, true); }
  });
  input.addEventListener('blur', () => commit(true, false));
}

function updateProgress(items) {
  const { done, total, pct } = progress(items, loadChecks());
  const bar = $('#packBar'), pctEl = $('#packPct');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = `${pct}% · ${done}/${total}`;
  // celebrate the 0→100 crossing (not on first load if already complete)
  if (pct === 100 && lastPct !== null && lastPct < 100) celebrate('Packed and ready ✈️');
  lastPct = pct;
}
