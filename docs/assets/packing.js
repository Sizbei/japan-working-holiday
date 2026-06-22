'use strict';
// Packing page (#/packing) — a "super checklist": categorized, collapsible (shared
// accordion), drag-reorderable, with a check/add/remove + progress bar. All state is
// device-local; nothing here dispatches jwh:data-changed (nothing else derives from it).
//
// Pure grouping/progress math lives in lib/packing.js; this file is DOM glue.

import { $, $$, esc, wireExpandableSearch, wireExpandableAdd } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { slug } from './lib/places.js';
import { makeSortable } from './dnd.js';
import { mountAccordion } from './collapse.js';
import { celebrate } from './celebrate.js';
import { groupByCategory, progress, CATEGORY_ORDER } from './lib/packing.js';

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
  // seed the add-item category select once
  const sel = $('#packAddCat');
  if (sel && !sel.options.length) {
    sel.innerHTML = CATEGORY_ORDER.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  wireControls();
  render();
}

function wireControls() {
  // add-item form
  const form = $('#packAddForm'), input = $('#packAddInput'), sel = $('#packAddCat');
  if (form && input && sel && !form.dataset.wired) {
    form.dataset.wired = '1';
    wireExpandableAdd($('#packAddToggle'), form, input);      // expandable ＋ Add toggle
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = input.value.trim();
      if (!item) return;
      const cat = CATEGORY_ORDER.includes(sel.value) ? sel.value : 'Misc';
      saveCustom([...loadCustom(), { id: 'pku' + Date.now(), cat, item }]);
      input.value = '';
      form.dispatchEvent(new CustomEvent('jwh:add-done'));     // collapse the add panel
      render();
    });
  }
  // live search/filter
  const search = $('#packSearch');
  if (search && !search.dataset.wired) {
    search.dataset.wired = '1';
    search.addEventListener('input', () => { searchQ = search.value.trim().toLowerCase(); render(); });
    wireExpandableSearch(search, () => { searchQ = ''; render(); });
  }
  // hide-done toggle
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
    ? `<button type="button" class="pack-del" data-del="${esc(id)}" aria-label="Remove ${esc(it.item)}">✕</button>`
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
// Re-rendered with the list, so (re)bind each render. Opens the ＋ Add composer pre-filled
// with the query, focuses the category select, and clears the search.
function wirePackEmptyAdd() {
  const btn = $('#packEmptyAdd');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const search = $('#packSearch'), input = $('#packAddInput'), toggle = $('#packAddToggle'), sel = $('#packAddCat');
    const q = (search?.value || searchQ).trim();
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();   // expand the composer
    if (input) input.value = q;                                                       // pre-fill the query
    if (search) {                                                                     // clear + collapse the search pill
      search.value = '';
      const stoggle = search.closest('.list-search-x')?.querySelector('[data-search-toggle]');
      if (search.closest('.list-search-x')?.classList.contains('is-open')) stoggle?.click();
    }
    searchQ = '';
    render();                                                                         // drop the empty state, restore the list
    sel?.focus();                                                                     // land on the category picker
  });
}

function wireRows() {
  $$('#packList input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const m = { ...loadChecks() };
    if (cb.checked) m[cb.dataset.pid] = true; else delete m[cb.dataset.pid];
    saveChecks(m);
    render();
  }));
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

function updateProgress(items) {
  const { done, total, pct } = progress(items, loadChecks());
  const bar = $('#packBar'), pctEl = $('#packPct');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = `${pct}% · ${done}/${total}`;
  // celebrate the 0→100 crossing (not on first load if already complete)
  if (pct === 100 && lastPct !== null && lastPct < 100) celebrate('Packed and ready ✈️');
  lastPct = pct;
}
