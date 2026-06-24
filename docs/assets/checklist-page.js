'use strict';
// The dependency-aware checklist (extracted from content.js to keep both files focused).
// Pure data fns (checklistItems/orderItems) are exported for dashboard.js + readiness; all
// mutation handlers dispatch jwh:data-changed at the mutation site (never in render()).

import { $, $$, esc, srcLinks } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { fmtShort, windowStatus, nowISO, daysBetween } from './lib/dates.js';
import { makeSortable } from './dnd.js';
import { mountAccordion } from './collapse.js';
import { celebrate } from './celebrate.js';
import { customItem, partitionCustom, loadChecklistCustom, saveChecklistCustom, renameById } from './lib/checklist.js';
import { listCtl, LISTCTL } from './lib/listctl.js';
import { askDate, alertModal, confirmModal } from './lib/modal.js';

let DATA = null;

export function mountChecklist(data, today) {
  DATA = data;
  renderCheckTools();
  renderCheckToolbar();
  renderChecklist(today);
  wireCheckSettingsListener();
}

// ---- dependency-aware checklist with due dates ----
function loadChecks() { return get(KEYS.checklist, {}) || {}; }
function saveChecks(s) { set(KEYS.checklist, s); }
function loadDue() { return get(KEYS.due, {}) || {}; }
// checklist focus controls (reduce the 74-item yearlong list to what's actionable now)
function checkView() { return getRaw(KEYS.checkView, 'phase'); }     // 'phase' | 'soon'
function hideDone() { return getRaw(KEYS.checkHideDone, '') === 'on'; }
function loadPriority() { const a = get(KEYS.checkPriority, []); return new Set(Array.isArray(a) ? a : []); }
function savePriority(ids) { set(KEYS.checkPriority, [...ids]); }
function renderCheckTools() {
  const el = $('#checkTools'); if (!el) return;
  const view = checkView(), hd = hideDone();
  el.innerHTML = `
    <div class="ct-views" role="group" aria-label="Checklist view">
      <button type="button" class="ct-chip ${view === 'phase' ? 'on' : ''}" data-view="phase" aria-pressed="${view === 'phase'}">All phases</button>
      <button type="button" class="ct-chip ${view === 'soon' ? 'on' : ''}" data-view="soon" aria-pressed="${view === 'soon'}">Due soon · 30 days</button>
    </div>
    <button type="button" class="ct-toggle ${hd ? 'on' : ''}" data-hidedone aria-pressed="${hd}">${hd ? '☑' : '☐'} Hide done</button>`;
  el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { setRaw(KEYS.checkView, b.dataset.view); renderCheckTools(); renderChecklist(); }));
  el.querySelector('[data-hidedone]')?.addEventListener('click', () => { setRaw(KEYS.checkHideDone, hideDone() ? '' : 'on'); renderCheckTools(); renderChecklist(); });
}
function saveDue(s) { set(KEYS.due, s); }

// flat list of every checklist item (used by the dashboard for alerts)
export function checklistItems(data) {
  const due = loadDue();
  const out = [];
  (data.checklist || []).forEach(p => (p.items || []).forEach(it => {
    if (!it.id) return;
    out.push({ ...it, phase: p.phase, effectiveDue: due[it.id] || it.dueBy || '' });
  }));
  // user-added custom items — so progress / due-soon / knownIds account for them too
  loadChecklistCustom().forEach(c => {
    if (!c.id) return;
    out.push({ ...c, phase: c.phase, effectiveDue: due[c.id] || c.dueBy || '', _custom: true });
  });
  return out;
}

// reconcile a phase's items against a saved id order (unknown/new ids append). Pure.
export function orderItems(items, savedOrder) {
  if (!savedOrder || !savedOrder.length) return items;
  const map = new Map(items.map(it => [it.id, it]));
  const out = [];
  savedOrder.forEach(id => { if (map.has(id)) { out.push(map.get(id)); map.delete(id); } });
  items.forEach(it => { if (map.has(it.id)) out.push(it); });
  return out;
}
function loadCheckOrder() { return get(KEYS.checkOrder, {}) || {}; }
function saveCheckOrder(o) { set(KEYS.checkOrder, o); }

let checkSearchQ = '';   // live search/filter query (view-only; never mutates data, doesn't affect progress)

// ---- toolbar (#checkQuickline) — variant A (quick-line) or B (two pills) ----
// Both variants expose #checkSearch (the live filter input) and #checkAddPhase (the target-group
// select) so the shared filter (checkSearchQ→renderChecklist) and add path (addCheckFromQuickline)
// work identically. The toolbar lives OUTSIDE #checkPhases, so renderChecklist()'s rebuild doesn't
// touch it — it's re-rendered only on mount + settings change.
function checkPhaseOptions() {
  const labels = [...(DATA.checklist || []).map(p => p.phase), 'My tasks'];
  return labels.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
}
function renderCheckToolbar() {
  const host = $('#checkQuickline');
  if (!host) return;
  const opts = checkPhaseOptions();
  if (listCtl() === LISTCTL.PILLS) {
    host.innerHTML = `
      <div class="lc-pills">
        <button type="button" class="lc-pill" id="checkSearchPill" aria-expanded="false" aria-controls="checkSearchWrap"><span class="lc-gx" aria-hidden="true">🔍</span> Search</button>
        <button type="button" class="lc-pill" id="checkAddPill" aria-expanded="false" aria-controls="checkAddWrap"><span class="lc-gx" aria-hidden="true">＋</span> Add</button>
      </div>
      <div class="lc-search-wrap" id="checkSearchWrap">
        <div class="ql-field">
          <span class="ql-icon" aria-hidden="true">🔍</span>
          <input type="search" id="checkSearch" class="ql-input" placeholder="Filter tasks…" aria-label="Filter checklist tasks" autocomplete="off">
          <button type="button" class="lc-miniclose" id="checkSearchClose" aria-label="Close search">✕</button>
        </div>
      </div>
      <div class="ql-reveal lc-add-wrap" id="checkAddWrap"><div>
        <div class="lc-composer">
          <input type="text" id="checkAddText" class="ql-input lc-add-input" placeholder="New task…" aria-label="New task" autocomplete="off">
          <select id="checkAddPhase" class="ql-sel" aria-label="Phase">${opts}</select>
          <button type="button" class="ql-addsuggest lc-add-go" id="checkAddGo">＋ Add</button>
          <button type="button" class="lc-miniclose" id="checkAddClose" aria-label="Cancel">✕</button>
        </div>
      </div></div>`;
  } else {
    host.innerHTML = `
      <div class="ql-field">
        <span class="ql-icon" aria-hidden="true">🔍</span>
        <input type="search" id="checkSearch" class="ql-input" placeholder="Search or add a task…" aria-label="Search or add a checklist task" autocomplete="off">
        <span class="ql-hint" id="checkQlHint" aria-hidden="true">enter ↵ filtering</span>
      </div>
      <div class="ql-reveal" id="checkAddRow"><div>
        <div class="ql-quickadd">
          <span class="ql-lab">add to</span>
          <select id="checkAddPhase" class="ql-sel" aria-label="Phase">${opts}</select>
          <button type="button" class="ql-addsuggest" id="checkAddBtn">＋ Add “<span class="ql-q" id="checkAddQ"></span>”</button>
        </div>
      </div></div>`;
  }
  $('#checkAddPhase').value = 'My tasks';
  wireCheckSearch();
}

// Wire the active toolbar variant. Re-run on each toolbar render (fresh nodes each time).
function wireCheckSearch() {
  const search = $('#checkSearch');
  if (!search) return;
  // shared filter sync — updates the live query + re-renders the list
  const filterSync = () => {
    checkSearchQ = (search.value || '').trim().toLowerCase();
    renderChecklist();
  };

  if (listCtl() === LISTCTL.PILLS) {
    const searchPill = $('#checkSearchPill'), searchWrap = $('#checkSearchWrap');
    const addPill = $('#checkAddPill'), addWrap = $('#checkAddWrap'), addText = $('#checkAddText');
    const reduce = document.documentElement.dataset.reduceMotion === 'on';
    const openSearch = (open) => {
      searchPill.classList.toggle('is-on', open);
      searchPill.setAttribute('aria-expanded', String(open));
      searchWrap.classList.toggle('is-open', open);
      if (open) { setTimeout(() => search.focus(), reduce ? 0 : 120); }
      else { search.value = ''; checkSearchQ = ''; renderChecklist(); searchPill.focus(); }
    };
    const openAdd = (open) => {
      addPill.classList.toggle('is-on', open);
      addPill.setAttribute('aria-expanded', String(open));
      addWrap.classList.toggle('is-open', open);
      if (open) { setTimeout(() => addText.focus(), reduce ? 0 : 120); }
      else { addText.value = ''; addPill.focus(); }
    };
    searchPill.addEventListener('click', () => openSearch(searchPill.getAttribute('aria-expanded') !== 'true'));
    $('#checkSearchClose')?.addEventListener('click', () => openSearch(false));
    search.addEventListener('input', filterSync);
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); openSearch(false); } });
    addPill.addEventListener('click', () => openAdd(addPill.getAttribute('aria-expanded') !== 'true'));
    $('#checkAddClose')?.addEventListener('click', () => openAdd(false));
    $('#checkAddGo')?.addEventListener('click', () => { if (addText.value.trim()) { addCheckFromComposer(); openAdd(false); } });
    addText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (addText.value.trim()) { addCheckFromComposer(); openAdd(false); } }
      else if (e.key === 'Escape') { e.preventDefault(); openAdd(false); }
    });
    // the no-match empty state's ＋ Add opens the composer pre-filled with the current query
    checkPillsOpenAdd = (prefill) => { addText.value = prefill || ''; openAdd(true); };
  } else {
    checkPillsOpenAdd = null;
    const addRow = $('#checkAddRow'), hint = $('#checkQlHint'), qEcho = $('#checkAddQ');
    const sync = () => {
      const raw = search.value;
      checkSearchQ = raw.trim().toLowerCase();
      const has = raw.trim().length > 0;
      if (qEcho) qEcho.textContent = raw.trim();
      addRow?.classList.toggle('is-open', has);
      renderChecklist();
      // hint reflects what Enter does: filter at rest, add (always commits) once there's a query
      if (hint) hint.textContent = has ? 'enter ↵ = add' : 'enter ↵ filtering';
    };
    search.addEventListener('input', sync);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (search.value.trim()) addCheckFromQuickline(); }
      else if (e.key === 'Escape') { e.preventDefault(); search.value = ''; sync(); }
    });
    $('#checkAddBtn')?.addEventListener('click', () => { if (search.value.trim()) addCheckFromQuickline(); });
  }
}
// In the pills variant, the no-match empty state opens the Add composer pre-filled. Set by wireCheckSearch.
let checkPillsOpenAdd = null;
// Re-render the toolbar (and reset the live filter) when the List-controls setting flips. Wire once.
let checkSettingsWired = false;
function wireCheckSettingsListener() {
  if (checkSettingsWired) return;
  checkSettingsWired = true;
  document.addEventListener('jwh:settings-changed', () => {
    if (!$('#checkQuickline')) return;
    checkSearchQ = '';
    renderCheckToolbar();
    renderChecklist();
  });
}
// Shared add path: persist a custom task in the selected phase, then re-render + notify. Pure of
// which variant called it. `focusEl` (optional) gets focus after the rebuild.
function commitCheckTask(task, focusEl) {
  task = (task || '').trim();
  if (!task) return;
  const phase = $('#checkAddPhase')?.value || 'My tasks';
  saveChecklistCustom([...loadChecklistCustom(), customItem(task, phase, '', 'cku' + Date.now())]);
  renderChecklist();                                              // re-render the list (no jwh:data-changed→renderChecklist listener)
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));    // refresh the dashboard teaser/bell
  focusEl?.focus();
}
// Variant A: commit the quick-line query, then clear it (restores the full list + hides the add row).
function addCheckFromQuickline() {
  const search = $('#checkSearch');
  const task = (search?.value || '').trim();
  if (!task) return;
  if (search) search.value = '';
  checkSearchQ = '';
  $('#checkAddRow')?.classList.remove('is-open');
  const hint = $('#checkQlHint'); if (hint) hint.textContent = 'enter ↵ filtering';
  commitCheckTask(task, search);
}
// Variant B: commit the composer text, then clear it.
function addCheckFromComposer() {
  const text = $('#checkAddText');
  const task = (text?.value || '').trim();
  if (!task) return;
  if (text) text.value = '';
  commitCheckTask(task, text);
}

function renderChecklist(today) {
  const phases = DATA.checklist || [];
  const wrap = $('#checkPhases');
  if (!wrap) return;
  if (!phases.length) { wrap.innerHTML = `<div class="empty">Building the yearlong plan…</div>`; return; }
  const state = loadChecks();
  const due = loadDue();
  const order = loadCheckOrder();
  const now = today || nowISO();
  const prio = loadPriority();
  const hd = hideDone();
  const searching = !!checkSearchQ;
  // a search query forces the phase view (don't drop into the flat Due-soon view while searching)
  const view = searching ? 'phase' : checkView();
  const match = it => !searching || (it.task || '').toLowerCase().includes(checkSearchQ);
  const focusSel = captureCheckFocus();   // preserve keyboard focus across the innerHTML rebuild
  const knownIds = new Set(phases.flatMap(p => (p.items || []).map(it => it.id)));

  if (view === 'soon') {
    // a flat list of what's actually pressing: undone items due within 30 days (or overdue),
    // plus anything you've flagged ⚑ — sorted flag-first, then soonest due.
    const items = checklistItems(DATA).filter(it => {
      if (state[it.id]) return false;                       // done → not pressing
      if (prio.has(it.id)) return true;                     // flagged → always
      const eff = it.effectiveDue; if (!eff) return false;  // undated → not "due soon"
      const d = daysBetween(now, eff); return d !== null && d <= 30;   // overdue or within 30d
    }).sort((a, b) => {
      const pa = prio.has(a.id) ? 0 : 1, pb = prio.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.effectiveDue || '9999').localeCompare(b.effectiveDue || '9999');
    });
    wrap.innerHTML = items.length
      ? `<ul class="check-list check-soon">${items.map(it => checkItemHTML(it, state, due, now, knownIds, { prio, showPhase: true })).join('')}</ul>`
      : `<div class="empty empty-state"><div class="empty-emoji" aria-hidden="true">🎏</div><p class="empty-h">Nothing due in the next 30 days.</p><p class="empty-sub">You're clear — switch to “All phases” to plan further ahead, or flag ⚑ items to pin them here.</p></div>`;
  } else {
    // merge user-added custom items: grouped under their baked phase, or the synthetic "My tasks" group
    const { byPhase, mine } = partitionCustom(
      loadChecklistCustom().map(c => ({ ...c, _custom: true })),
      phases.map(p => p.phase));
    const drag = !hd && !searching;   // drag is meaningless over a hidden/searched view
    let html = phases.map((p, pi) => {
      const all = [...(p.items || []), ...(byPhase.get(p.phase) || [])];
      const its = orderItems(all, order[pi]).filter(it => !(hd && state[it.id])).filter(match);
      if (!its.length) return '';                           // skip a phase fully done/hidden, or with no search match
      // count over the FULL phase (not the hide-done/search-filtered list) so progress math is stable
      const total = all.filter(it => it.id).length;
      const done = all.filter(it => it.id && state[it.id]).length;
      const accId = `chk-phase-${pi}`;
      const phaseName = `${p.phase}${p.window ? ' · ' + p.window : ''}`;
      return `<section class="acc phase-block" data-acc="${esc(accId)}">
        <button type="button" class="acc-head" aria-expanded="true" aria-controls="acc-panel-${esc(accId)}" aria-label="${esc(phaseName)}">
          <span class="acc-chevron" aria-hidden="true">›</span>
          <span class="acc-title">${esc(p.phase)} <span class="window">${esc(p.window || '')}</span></span>
          <span class="acc-count">${esc(String(done))}/${esc(String(total))}</span>
        </button>
        <div class="acc-panel" id="acc-panel-${esc(accId)}" role="region" aria-label="${esc(phaseName)}">
          <div class="acc-inner">
            <ul class="check-list" data-phase="${pi}">${its.map(it => checkItemHTML(it, state, due, now, knownIds, { prio, drag })).join('')}</ul>
          </div>
        </div>
      </section>`;
    }).join('');
    // synthetic "My tasks" group — custom items with phase "My tasks" or an orphan label.
    // Reorder key is the string "mine" (distinct from numeric baked phase indices).
    if (mine.length) {
      const all = orderItems(mine, order['mine']);
      const its = all.filter(it => !(hd && state[it.id])).filter(match);
      if (its.length) {
        const total = mine.length;
        const done = mine.filter(it => state[it.id]).length;
        html += `<section class="acc phase-block" data-acc="chk-phase-mine">
        <button type="button" class="acc-head" aria-expanded="true" aria-controls="acc-panel-chk-phase-mine" aria-label="My tasks">
          <span class="acc-chevron" aria-hidden="true">›</span>
          <span class="acc-title">My tasks <span class="window"></span></span>
          <span class="acc-count">${esc(String(done))}/${esc(String(total))}</span>
        </button>
        <div class="acc-panel" id="acc-panel-chk-phase-mine" role="region" aria-label="My tasks">
          <div class="acc-inner">
            <ul class="check-list" data-phase="mine">${its.map(it => checkItemHTML(it, state, due, now, knownIds, { prio, drag })).join('')}</ul>
          </div>
        </div>
      </section>`;
      }
    }
    wrap.innerHTML = (searching && !html)
      ? `<div class="empty list-empty">No matches for “${esc(checkSearchQ)}”.<br>
          <button type="button" class="list-empty-add" id="checkEmptyAdd">＋ Add “<span class="lea-q">${esc(checkSearchQ)}</span>”</button>
        </div>`
      : html;
  }
  const prog = $('#checkProgress');
  if (prog) prog.hidden = false;
  wireCheckEmptyAdd();
  wireChecklist();
  if (view === 'phase' && !hd && !searching) {   // dnd reorder only in the full grouped, unsearched view (reordering a filtered list is meaningless)
    $$('#checkPhases .check-list').forEach(ul => makeSortable(ul, {
      itemSelector: '.check-item', handleSelector: '.dnd-handle', label: 'task',
      idOf: el => el.dataset.id,
      onReorder: (ids) => { const o = loadCheckOrder(); o[ul.dataset.phase] = ids; saveCheckOrder(o); },
    }));
  }
  // wire/restore collapse AFTER makeSortable (phase view only); force-expand while searching so matches show
  if (view === 'phase') mountAccordion($('#checkPhases'), { forceExpanded: searching });
  if (focusSel) wrap.querySelector(focusSel)?.focus();
  updateProgress();
}
// identify the focused checklist control so renderChecklist() can restore it after the rebuild
function captureCheckFocus() {
  const a = document.activeElement, wrap = $('#checkPhases');
  if (!a || !wrap || !wrap.contains(a)) return null;
  const esc2 = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
  if (a.classList.contains('acc-head')) {
    const acc = a.closest('.acc');
    if (acc?.dataset.acc) return `.acc[data-acc="${esc2(acc.dataset.acc)}"] .acc-head`;
  }
  if (a.dataset.cid) return `input[data-cid="${esc2(a.dataset.cid)}"]`;
  if (a.dataset.due) return `.ci-due[data-due="${esc2(a.dataset.due)}"]`;
  if (a.dataset.flag) return `.ci-flag[data-flag="${esc2(a.dataset.flag)}"]`;
  const li = a.closest?.('.check-item');
  if (li && a.classList.contains('dnd-handle')) return `.check-item[data-id="${esc2(li.dataset.id)}"] .dnd-handle`;
  return null;
}
function checkItemHTML(it, state, due, now, knownIds, opts = {}) {
  const id = it.id;
  const checked = state[id] ? 'checked' : '';
  const kind = (it.kind || 'experience').toLowerCase();
  const reqs = it.requires || [];
  // ignore prereqs that don't exist in the checklist (typo / removed item) — else the item locks forever
  const locked = reqs.some(r => (!knownIds || knownIds.has(r)) && !state[r]) && !state[id];
  const eff = due[id] || it.dueBy || '';
  const st = eff ? windowStatus(eff, now) : 'none';
  const dueTag = eff ? `<span class="due-tag ${st}">due ${esc(fmtShort(eff))}</span>` : '';
  const flagged = !!(opts.prio && opts.prio.has(id));
  const phaseTag = opts.showPhase && it.phase ? `<span class="ci-phase">${esc(it.phase)}</span>` : '';
  const del = it._custom
    ? `<button type="button" class="check-edit" data-edit="${esc(id)}" aria-label="Edit ${esc(it.task)}">✎</button>`
      + `<button type="button" class="check-del" data-del="${esc(id)}" aria-label="Remove ${esc(it.task)}">✕</button>`
    : '';
  return `
    <li class="check-item ${locked ? 'locked' : ''}${flagged ? ' flagged' : ''}" data-id="${esc(id)}">
      ${opts.drag ? '<button type="button" class="dnd-handle" aria-label="Reorder task" tabindex="0">⠿</button>' : ''}
      <input type="checkbox" id="cb-${esc(id)}" data-cid="${esc(id)}" ${checked} ${locked ? 'disabled' : ''}
             aria-label="${esc(it.task)}">
      <label class="ci-body" for="cb-${esc(id)}">
        <span class="ci-task">${esc(it.task)}<span class="kind-tag kind-${esc(kind)}">${esc(kind)}</span>${phaseTag}${dueTag}${locked ? '<span class="lock">🔒 do prerequisite first</span>' : ''}</span>
        ${it.note ? `<span class="ci-note">${esc(it.note)}</span>` : ''}
        ${srcLinks(it.sources, 'ci-src')}
      </label>
      <button type="button" class="ci-flag${flagged ? ' on' : ''}" data-flag="${esc(id)}" aria-pressed="${flagged ? 'true' : 'false'}" aria-label="${flagged ? 'Remove priority' : 'Mark as priority'}" title="Priority">⚑</button>
      <button type="button" class="ci-due" data-due="${esc(id)}" title="Set a due date" aria-label="Set due date">📅</button>
      ${del}
    </li>`;
}
function wireChecklist() {
  $$('#checkPhases input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const state = { ...loadChecks() };
    if (cb.checked) state[cb.dataset.cid] = true; else delete state[cb.dataset.cid];
    saveChecks(state);
    renderChecklist();                 // re-render so dependent locks update
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  }));
  $$('#checkPhases .ci-flag').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.flag, p = loadPriority();
    p.has(id) ? p.delete(id) : p.add(id); savePriority(p);
    renderChecklist();   // re-render: flag state + (in Due-soon) the item's position/inclusion
  }));
  $$('#checkPhases .check-del').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del;
    saveChecklistCustom(loadChecklistCustom().filter(x => x.id !== id));   // drop from custom store
    const m = { ...loadChecks() }; delete m[id]; saveChecks(m);            // clear its checked entry
    const o = loadCheckOrder();                                           // lazy-clean order maps (skip orphaned id)
    Object.keys(o).forEach(k => { o[k] = (o[k] || []).filter(x => x !== id); });
    saveCheckOrder(o);
    renderChecklist();                                                   // re-render the list (no jwh:data-changed→renderChecklist listener)
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));          // refresh the dashboard teaser/bell
  }));
  $$('#checkPhases .check-edit').forEach(b => b.addEventListener('click', () => {
    openCheckEditor(b.dataset.edit);
  }));
  $$('#checkPhases .ci-due').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.due;
    const due = { ...loadDue() };
    const v = await askDate('Due date (blank to clear):', { value: due[id] || '' });
    if (v === null) return;                                  // cancelled
    if (v.trim() === '') delete due[id];
    else if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) due[id] = v.trim();
    else { alertModal('Use a valid date (YYYY-MM-DD).'); return; }
    saveDue(due);
    renderChecklist();                 // direct render refreshes dependency locks now; the dispatch only refreshes the dashboard/bell (no jwh:data-changed→renderChecklist listener exists, so no double-render)
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  }));
  wireReset();
}
// Inline-edit a custom checklist task. Swaps the .ci-task text for a focused <input>; Enter/blur
// saves (renameById → save → re-render), Esc cancels. A re-render rebuilds innerHTML, so only one
// editor can ever be open at once. Blank/whitespace save is a no-op (lib renameById ignores it).
function openCheckEditor(id) {
  const li = $(`#checkPhases .check-item[data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (!li) return;
  const task = li.querySelector('.ci-task');
  if (!task || li.querySelector('.ci-edit-input')) return;
  const it = loadChecklistCustom().find(x => x.id === id);
  if (!it) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ci-edit-input';
  input.setAttribute('aria-label', 'Edit task');
  input.value = it.task || '';              // .value (DOM property) — safe, no innerHTML of user text
  task.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = (save, refocus) => {
    if (done) return; done = true;
    if (save) {
      const val = input.value;
      saveChecklistCustom(renameById(loadChecklistCustom(), id, 'task', val));
      renderChecklist();                                            // save → close → re-render (matches add/remove)
      document.dispatchEvent(new CustomEvent('jwh:data-changed'));  // refresh dashboard teaser/bell
    } else {
      renderChecklist();                    // cancel → re-render restores the original row (closes the editor)
    }
    if (refocus) {                          // keyboard commit (Enter/Esc): return focus to the row; NOT on blur (would hijack a click)
      const cssId = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
      ($(`#checkPhases .check-edit[data-edit="${cssId}"]`) || $(`#checkPhases input[data-cid="${cssId}"]`))?.focus();
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true, true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false, true); }
  });
  input.addEventListener('blur', () => commit(true, false));
}
// #checkReset lives OUTSIDE #checkPhases, so renderChecklist() doesn't replace it — wire it ONCE
let resetWired = false;
function wireReset() {
  const reset = $('#checkReset');
  if (!reset || resetWired) return;
  resetWired = true;
  reset.addEventListener('click', async () => {
    if (!await confirmModal('Reset all checkmarks?', { ok: 'Reset', danger: true })) return;
    saveChecks({});
    renderChecklist();
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  });
}
// Search → Add shortcut: the inline ＋ Add “<q>” button in the no-match empty state.
// Re-rendered with the list, so (re)bind each render. In A it commits the query straight
// from #checkSearch; in B it opens the Add composer pre-filled (the search input stays the filter).
function wireCheckEmptyAdd() {
  const btn = $('#checkEmptyAdd');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (listCtl() === LISTCTL.PILLS && checkPillsOpenAdd) checkPillsOpenAdd(checkSearchQ);
    else addCheckFromQuickline();
  });
}
let lastPct = null;
function updateProgress() {
  // count ALL checklist items (not just the ones the current view renders — Due-soon/Hide-done filter)
  const all = checklistItems(DATA);
  if (!all.length) return;
  const checks = loadChecks();
  const done = all.filter(it => checks[it.id]).length;
  const pct = Math.round((done / all.length) * 100);
  const bar = $('#checkBar'), pctEl = $('#checkPct');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = `${pct}% · ${done}/${all.length}`;
  // peak-end moment: celebrate the transition to 100% (not on first load if already complete)
  if (pct === 100 && lastPct !== null && lastPct < 100) celebrate('🎉 Checklist complete — you’re ready for Japan!');
  lastPct = pct;
}
