'use strict';
// Renders the data-driven content sections: deadlines, Canada notes, top moves,
// searchable domains, brew scratchpad, the dependency-aware checklist (with due
// dates), the pillar grids, and sources. Fed entirely by tips.json.

import { $, $$, esc, srcLinks } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { fmtShort, windowStatus, nowISO, daysBetween } from './lib/dates.js';
import { makeSortable } from './dnd.js';
import { mountAccordion } from './collapse.js';
import { celebrate } from './celebrate.js';
import { placeById, loadPlaces, upsertPlace, patchPlace, deletePlace, catId, dispatchChanged } from './lib/places.js';
import { approxCoord } from './lib/geo.js';
import { askDate, alertModal, confirmModal } from './lib/modal.js';

let DATA = null;
let activeConf = 'all';
let query = '';

export function renderContent(data, today) {
  DATA = data;
  renderTimeSensitive();
  renderCanada();
  renderTop(today);
  renderSources();
  renderDomains();
  initBrew();
  renderCheckTools();
  renderChecklist(today);
  renderPillar('activities', '#activitiesGrid', 'Researching the seasonal calendar…');
  renderPillar('restaurants', '#restaurantsGrid', 'Hunting down the best eats…');
  renderPillar('disney', '#disneyGrid', 'Mapping Disneyland &amp; DisneySea…');
  renderPillar('building', '#buildingGrid', 'Scouting coworking spots &amp; work cafés…');
  renderPillar('music', '#musicGrid', 'Digging through the music scene…');
  renderPillar('geek', '#geekGrid', 'Mapping arcades, anime spots &amp; tech…');
  renderPillar('meetups', '#meetupsGrid', 'Finding meetups &amp; conventions…');
  renderPillar('livemusic', '#livemusicGrid', 'Digging up Tokyo nightlife &amp; gigs…');
  wireControls();
  wireTierFilter();
  wireDiscoverFilter();
  wireCollapsibleCards();
}

// Explore cards: compact by default, click/Enter to expand the full description
function wireCollapsibleCards() {
  const ex = $('#view-explore');
  if (!ex) return;
  const toggle = (card) => {
    const on = card.classList.toggle('expanded');
    card.querySelector('.c-disclosure')?.setAttribute('aria-expanded', String(on));   // state lives on the button
  };
  ex.addEventListener('click', (e) => {
    const disc = e.target.closest('.c-disclosure');                          // the real disclosure button (keyboard handles Enter/Space natively)
    if (disc) { const card = disc.closest('.card2.collapsible'); if (card) toggle(card); return; }
    if (e.target.closest('button, a')) return;                               // other controls (★ Tabetai, links) don't toggle
    const card = e.target.closest('.card2.collapsible'); if (card) toggle(card);   // click anywhere else on the card still expands (mouse convenience)
  });
}

// Discover/Explore filter: by interest (which pillar) + free-text across all pillar cards
function wireDiscoverFilter() {
  const bar = $('#discInterest');
  if (!bar) return;
  const SECMAP = { activities: '#activities', food: '#restaurants', disney: '#disney', building: '#building', gear: '#music', games: '#geek', meetups: '#meetups', nightlife: '#livemusic' };
  const search = $('#discSearch');
  const apply = () => {
    const q = (search?.value || '').trim().toLowerCase();
    const sec = $('#discInterest .chip.active')?.dataset.sec || 'all';
    const area = $('#discArea .chip.active')?.dataset.area || 'all';
    const tier = $('#tierFilters .chip.active')?.dataset.tier || 'all';
    Object.entries(SECMAP).forEach(([k, sel]) => { const el = $(sel); if (el) el.style.display = (sec === 'all' || sec === k) ? '' : 'none'; });
    if (q || area !== 'all') {
      $$('#view-explore .grid .card2').forEach(card => {
        const txt = card.textContent.toLowerCase();
        let show = (!q || txt.includes(q)) && (area === 'all' || txt.includes(area));
        if (show && card.closest('#restaurantsGrid')) show = (tier === 'all' || card.dataset.tier === tier);   // don't override the active tier chips
        card.style.display = show ? '' : 'none';
      });
    } else {
      $$('#view-explore .grid .card2').forEach(card => { card.style.display = ''; });   // clear any search/area-hidden
      applyTierFilter();                                                                // re-assert the restaurant tier filter (don't stomp it)
    }
    // empty-state when an active filter hides everything (ignore cards in interest-hidden sections)
    const filtering = q || area !== 'all' || sec !== 'all';
    const anyVisible = $$('#view-explore .grid .card2').some(c => c.style.display !== 'none' && c.closest('section')?.style.display !== 'none');
    let note = $('#discoverEmpty');
    if (filtering && !anyVisible) {
      if (!note) { note = document.createElement('p'); note.id = 'discoverEmpty'; note.className = 'discover-empty'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite'); bar.insertAdjacentElement('afterend', note); }
      note.textContent = `No matches${q ? ` for “${search.value.trim()}”` : ''}${area !== 'all' ? ` in ${area}` : ''} — try All areas or clear the search.`;
      note.hidden = false;
    } else if (note) { note.hidden = true; }
  };
  search?.addEventListener('input', apply);
  $$('#discInterest .chip, #discArea .chip').forEach(c => c.setAttribute('aria-pressed', c.classList.contains('active') ? 'true' : 'false'));
  $$('#discInterest .chip, #discArea .chip').forEach(c => c.addEventListener('click', () => {
    [...c.parentElement.querySelectorAll('.chip')].forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    c.classList.add('active'); c.setAttribute('aria-pressed', 'true'); apply();
  }));
}

// ---- content cards (pillars) ----
function metaPills(item) {
  const out = [];
  if (item.area_or_park) out.push(`<span class="pill area">${esc(item.area_or_park)}</span>`);
  if (item.price_or_cost) out.push(`<span class="pill price">${esc(item.price_or_cost)}</span>`);
  return out.join('');
}
let cardSeq = 0;
function contentCard(item, withStar) {
  const tier = (item.tier || 'n/a').toLowerCase();
  const hasBody = !!(item.detail || item.how_or_when || (item.sources && item.sources.length));
  const star = withStar
    ? `<button type="button" class="tabetai-star" data-tb="${esc(catId('restaurants', item.name))}" data-name="${esc(item.name)}" data-area="${esc(item.area_or_park || '')}" aria-pressed="false" aria-label="Tabetai — want to eat ${esc(item.name)}" title="Tabetai (want to eat) — saves to your map &amp; list">☆</button>`
    : '';
  // disclosure pattern: a real <button> owns the expand (valid ARIA) instead of role=button on the
  // container wrapping the star/links as descendants. The star is a SIBLING of the button.
  const bodyId = hasBody ? 'cbody-' + (++cardSeq) : '';
  const head = hasBody
    ? `<button type="button" class="c-name c-disclosure" aria-expanded="false" aria-controls="${bodyId}">${esc(item.name)}<span class="c-chev" aria-hidden="true">▾</span></button>`
    : `<span class="c-name">${esc(item.name)}</span>`;
  return `
    <article class="card2 tier-${esc(tier)} ${hasBody ? 'collapsible' : ''}" data-tier="${esc(tier)}">
      <div class="c-top">${head}${star}</div>
      <div class="c-meta">${metaPills(item)}</div>
      ${hasBody ? `<div class="c-body" id="${bodyId}">
        ${item.detail ? `<div class="c-detail">${esc(item.detail)}</div>` : ''}
        ${item.how_or_when ? `<div class="c-detail"><b>↳</b> ${esc(item.how_or_when)}</div>` : ''}
        ${srcLinks(item.sources)}
      </div>` : ''}
    </article>`;
}
function renderPillar(key, sel, placeholder) {
  const grid = $(sel);
  if (!grid) return;
  const list = DATA[key] || [];
  const withStar = key === 'restaurants';                    // ★ Tabetai only on restaurants
  grid.innerHTML = list.length
    ? list.map(i => contentCard(i, withStar)).join('')
    : `<div class="empty">${placeholder} this fills in as research lands.</div>`;
  if (withStar) wireTabetai(grid);
}

// ---- Tabetai (want-to-eat): ★ a restaurant -> a source:'tabetai' place (map pin + saved list) ----
function syncStars(grid) {
  const favs = new Map(loadPlaces().map(p => [p.id, !!p.fav]));   // one read+parse per sync (was one per star)
  grid.querySelectorAll('.tabetai-star').forEach(b => {
    const on = favs.get(b.dataset.tb) === true;                  // ★ reflects the FAV flag, not mere existence (a planned visit is a place but not a star)
    b.textContent = on ? '★' : '☆';
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function wireTabetai(grid) {
  syncStars(grid);
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.tabetai-star');
    if (!b) return;
    e.stopPropagation();                                     // don't toggle the card's expand
    const id = b.dataset.tb, existing = placeById(id);
    if (existing && existing.fav) {                          // currently starred → unstar
      if (existing.date || existing.eventId || existing.locked) { patchPlace(id, { fav: false }); dispatchChanged(); }  // keep a planned/locked visit, just un-pin (patchPlace is silent → dispatch)
      else deletePlace(id);                                  // plain want-to-eat -> remove (dispatches)
    } else if (existing) {                                   // exists but unstarred (e.g. a planned visit) → re-star (toggles both ways)
      patchPlace(id, { fav: true }); dispatchChanged();
    } else {
      const c = approxCoord(DATA.areaGeo, b.dataset.area, b.dataset.name);
      upsertPlace({ id, name: b.dataset.name, address: b.dataset.area, lat: c.lat, lng: c.lng, category: 'food', source: 'tabetai', fav: true, coordKind: 'approx', visited: false });
    }
  });
  document.addEventListener('jwh:data-changed', () => syncStars(grid));
}

// ---- deadlines table ----
function renderTimeSensitive() {
  const tb = $('#timeTable tbody');
  const rows = DATA.timeSensitive || [];
  if (!rows.length) { const s = $('#timeSensitiveSection'); if (s) s.style.display = 'none'; return; }
  tb.innerHTML = rows.map(r => {
    const st = r.dueBy ? windowStatus(r.dueBy, nowISO()) : 'none';
    const due = r.dueBy ? `<span class="due-tag ${st}">${esc(fmtShort(r.dueBy))}</span>` : '';
    return `<tr>
      <td>${esc(r.item)} ${due}</td>
      <td>${esc(r.timing)}</td>
      <td>${esc(r.action)}</td>
    </tr>`;
  }).join('');
}

function renderCanada() {
  const list = DATA.canadaNotes || [];
  const sec = $('#canadaSection');
  if (!list.length) { if (sec) sec.style.display = 'none'; return; }
  $('#canadaList').innerHTML = list.map(n => `<li>${esc(n)}</li>`).join('');
}

function renderTop() {
  const list = DATA.top10 || [];
  const sec = $('#topSection');
  if (!list.length) { if (sec) sec.style.display = 'none'; return; }
  $('#topGrid').innerHTML = list.map(t => `
    <div class="top-card">
      <div class="t-tip">${esc(t.tip)}</div>
      <div class="t-reason">${esc(t.reason)}</div>
      <div class="t-domain">${esc(t.domain || '')}</div>
    </div>`).join('');
}

function renderSources() {
  const list = DATA.sources || [];
  const sec = $('#sourcesSection');
  if (!list.length) { if (sec) sec.style.display = 'none'; return; }
  $('#sourcesList').innerHTML = list.map(u =>
    `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a></li>`).join('');
}

// ---- searchable domains ----
function matches(f) {
  if (activeConf !== 'all' && (f.confidence || '').toLowerCase() !== activeConf) return false;
  if (!query) return true;
  return `${f.tip} ${f.why} ${f.how} ${f.impact}`.toLowerCase().includes(query);
}
function findingHTML(f) {
  const conf = (f.confidence || 'medium').toLowerCase();
  return `
    <div class="finding">
      <div class="finding-top">
        <p class="f-tip">${esc(f.tip)}</p>
        <span class="badge ${conf}">${esc(conf)}</span>
      </div>
      ${f.why ? `<p class="f-why">${esc(f.why)}</p>` : ''}
      ${f.how ? `<p class="f-how"><b>How:</b> ${esc(f.how)}</p>` : ''}
      ${f.impact ? `<p class="f-impact"><b>Impact:</b> ${esc(f.impact)}</p>` : ''}
      ${srcLinks(f.sources, 'f-sources')}
    </div>`;
}
function renderDomains() {
  const wrap = $('#domains');
  if (!wrap) return;
  const domains = DATA.domains || [];
  let any = false;
  wrap.innerHTML = domains.map(d => {
    const found = (d.findings || []).filter(matches);
    if (!found.length) return '';
    any = true;
    return `<section class="domain" id="d-${esc(d.key)}">
      <h3 class="domain-head"><span class="d-icon">${esc(d.icon || '•')}</span>${esc(d.title)}</h3>
      ${found.map(findingHTML).join('')}
    </section>`;
  }).join('');
  wrap.setAttribute('aria-busy', 'false');
  if (!any) {
    const filtered = !!query || activeConf !== 'all';
    wrap.innerHTML = `<div class="empty empty-state">
      <div class="empty-emoji" aria-hidden="true">🔍</div>
      <p class="empty-h">${filtered ? 'No tips match your filters.' : 'No tips here yet.'}</p>
      ${filtered ? '<button type="button" class="empty-action" id="domainsClear">Clear filters</button>' : ''}
    </div>`;
    $('#domainsClear')?.addEventListener('click', () => {
      query = ''; activeConf = 'all';
      const s = $('#search'); if (s) s.value = '';
      $$('#confFilters .chip').forEach(c => { const on = c.dataset.conf === 'all'; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); });
      renderDomains();
    });
  }
}
function wireControls() {
  const s = $('#search');
  if (s) s.addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderDomains(); });
  $$('#confFilters .chip').forEach(c => c.setAttribute('aria-pressed', c.classList.contains('active') ? 'true' : 'false'));
  $$('#confFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    $$('#confFilters .chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
    chip.classList.add('active'); chip.setAttribute('aria-pressed', 'true');
    activeConf = chip.dataset.conf;
    renderDomains();
  }));
}
function applyTierFilter() {
  const t = $('#tierFilters .chip.active')?.dataset.tier || 'all';
  const q = ($('#discSearch')?.value || '').trim().toLowerCase();   // also honour an active search so a tier click doesn't un-hide searched-out cards
  const area = $('#discArea .chip.active')?.dataset.area || 'all';
  $$('#restaurantsGrid .card2').forEach(card => {
    const tierOk = t === 'all' || card.dataset.tier === t;
    const txt = (q || area !== 'all') ? card.textContent.toLowerCase() : '';
    const searchOk = (!q || txt.includes(q)) && (area === 'all' || txt.includes(area));
    card.style.display = (tierOk && searchOk) ? '' : 'none';
  });
}
function wireTierFilter() {
  $$('#tierFilters .chip').forEach(c => c.setAttribute('aria-pressed', c.classList.contains('active') ? 'true' : 'false'));
  $$('#tierFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    $$('#tierFilters .chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
    chip.classList.add('active'); chip.setAttribute('aria-pressed', 'true');
    applyTierFilter();
  }));
}

// ---- Brainstorm & Brew ----
function loadIdeas() { return get(KEYS.brewIdeas, []) || []; }
function saveIdeas(arr) { set(KEYS.brewIdeas, arr); }
function initBrew() {
  const pad = $('#brewNotes'), saved = $('#brewSaved');
  if (pad) {
    pad.value = getRaw(KEYS.brewNotes, '');
    let t;
    pad.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        setRaw(KEYS.brewNotes, pad.value);
        if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1200); }
      }, 350);
    });
  }
  const form = $('#brewForm'), input = $('#brewInput');
  if (form && input) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    // collision-proof id (the old id.slice(1)+ideas.length scheme produced NaN/duplicate keys
    // since ids contain a hyphen → wrong-card deletes + lost reorders)
    saveIdeas([{ id: 'i' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), text: val }, ...loadIdeas()]);
    input.value = '';
    renderIdeas();
  });
  renderIdeas();
}
function renderIdeas() {
  const list = $('#brewList');
  if (!list) return;
  const ideas = loadIdeas();
  if (!ideas.length) { list.innerHTML = `<li class="brew-empty">No idea cards yet — add one above.</li>`; return; }
  list.innerHTML = ideas.map(i => `
    <li class="brew-card" data-id="${esc(i.id)}">
      <button type="button" class="dnd-handle">⠿</button>
      <span>${esc(i.text)}</span>
      <button type="button" data-del="${esc(i.id)}" aria-label="Delete idea">✕</button>
    </li>`).join('');
  list.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    saveIdeas(loadIdeas().filter(x => x.id !== b.dataset.del));
    renderIdeas();
  }));
  makeSortable(list, {
    itemSelector: '.brew-card', handleSelector: '.dnd-handle', label: 'idea',
    idOf: el => el.dataset.id,
    onReorder: (ids) => { const by = loadIdeas(); saveIdeas(ids.map(id => by.find(x => x.id === id)).filter(Boolean)); renderIdeas(); },
  });
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
  const view = checkView(), hd = hideDone();
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
    wrap.innerHTML = phases.map((p, pi) => {
      const all = p.items || [];
      const its = orderItems(all, order[pi]).filter(it => !(hd && state[it.id]));
      if (!its.length) return '';                           // skip a phase that's fully done/hidden
      // count over the FULL phase (not the hide-done-filtered list) so progress math is stable
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
            <ul class="check-list" data-phase="${pi}">${its.map(it => checkItemHTML(it, state, due, now, knownIds, { prio, drag: !hd })).join('')}</ul>
          </div>
        </div>
      </section>`;
    }).join('');
  }
  const prog = $('#checkProgress');
  if (prog) prog.hidden = false;
  wireChecklist();
  if (view === 'phase' && !hd) {   // dnd reorder only in the full grouped view (reordering a filtered/flat list is meaningless)
    $$('#checkPhases .check-list').forEach(ul => makeSortable(ul, {
      itemSelector: '.check-item', handleSelector: '.dnd-handle', label: 'task',
      idOf: el => el.dataset.id,
      onReorder: (ids) => { const o = loadCheckOrder(); o[ul.dataset.phase] = ids; saveCheckOrder(o); },
    }));
  }
  if (view === 'phase') mountAccordion($('#checkPhases'));   // wire/restore collapse AFTER makeSortable (phase view only)
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
