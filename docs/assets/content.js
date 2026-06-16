'use strict';
// Renders the data-driven content sections: deadlines, Canada notes, top moves,
// searchable domains, brew scratchpad, the dependency-aware checklist (with due
// dates), the pillar grids, and sources. Fed entirely by tips.json.

import { $, $$, esc, srcLinks } from './lib/dom.js';
import { KEYS, get, set, getRaw, setRaw } from './lib/store.js';
import { fmtShort, windowStatus, nowISO } from './lib/dates.js';
import { makeSortable, dndToast } from './dnd.js';
import { placeById, upsertPlace, patchPlace, deletePlace, catId } from './lib/places.js';
import { approxCoord } from './lib/geo.js';

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
  const toggle = (card) => { const on = card.classList.toggle('expanded'); card.setAttribute('aria-expanded', String(on)); };
  ex.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;                       // links inside don't toggle
    const card = e.target.closest('.card2.collapsible'); if (card) toggle(card);
  });
  ex.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card2.collapsible'); if (!card || e.target.tagName === 'A') return;
    e.preventDefault(); toggle(card);
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
    Object.entries(SECMAP).forEach(([k, sel]) => { const el = $(sel); if (el) el.style.display = (sec === 'all' || sec === k) ? '' : 'none'; });
    if (q || area !== 'all') {
      $$('#view-explore .grid .card2').forEach(card => {
        const txt = card.textContent.toLowerCase();
        card.style.display = ((!q || txt.includes(q)) && (area === 'all' || txt.includes(area))) ? '' : 'none';
      });
    } else {
      $$('#view-explore .grid .card2').forEach(card => { card.style.display = ''; });   // clear any search/area-hidden
      applyTierFilter();                                                                // re-assert the restaurant tier filter (don't stomp it)
    }
  };
  search?.addEventListener('input', apply);
  $$('#discInterest .chip, #discArea .chip').forEach(c => c.addEventListener('click', () => {
    [...c.parentElement.querySelectorAll('.chip')].forEach(x => x.classList.remove('active'));
    c.classList.add('active'); apply();
  }));
}

// ---- content cards (pillars) ----
function metaPills(item) {
  const out = [];
  if (item.area_or_park) out.push(`<span class="pill area">${esc(item.area_or_park)}</span>`);
  if (item.price_or_cost) out.push(`<span class="pill price">${esc(item.price_or_cost)}</span>`);
  return out.join('');
}
function contentCard(item, withStar) {
  const tier = (item.tier || 'n/a').toLowerCase();
  const hasBody = !!(item.detail || item.how_or_when || (item.sources && item.sources.length));
  const star = withStar
    ? `<button type="button" class="tabetai-star" data-tb="${esc(catId('restaurants', item.name))}" data-name="${esc(item.name)}" data-area="${esc(item.area_or_park || '')}" aria-pressed="false" aria-label="Tabetai — want to eat ${esc(item.name)}" title="Tabetai (want to eat) — saves to your map &amp; list">☆</button>`
    : '';
  return `
    <article class="card2 tier-${esc(tier)} ${hasBody ? 'collapsible' : ''}" data-tier="${esc(tier)}" ${hasBody ? 'tabindex="0" role="button" aria-expanded="false"' : ''}>
      <div class="c-top"><span class="c-name">${esc(item.name)}</span>${star}${hasBody ? '<span class="c-chev" aria-hidden="true">▾</span>' : ''}</div>
      <div class="c-meta">${metaPills(item)}</div>
      ${hasBody ? `<div class="c-body">
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
  grid.querySelectorAll('.tabetai-star').forEach(b => {
    const on = !!placeById(b.dataset.tb);
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
    if (existing) {
      if (existing.date || existing.eventId || existing.locked) patchPlace(id, { fav: false, visited: existing.visited });  // keep a planned/locked visit, just un-pin
      else deletePlace(id);                                  // plain want-to-eat -> remove
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
    `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('');
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
  if (!any) wrap.innerHTML = `<div class="empty">No tips match your search/filter.</div>`;
}
function wireControls() {
  const s = $('#search');
  if (s) s.addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderDomains(); });
  $$('#confFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    $$('#confFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeConf = chip.dataset.conf;
    renderDomains();
  }));
}
function applyTierFilter() {
  const t = $('#tierFilters .chip.active')?.dataset.tier || 'all';
  $$('#restaurantsGrid .card2').forEach(card => { card.style.display = (t === 'all' || card.dataset.tier === t) ? '' : 'none'; });
}
function wireTierFilter() {
  $$('#tierFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    $$('#tierFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
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
    const ideas = loadIdeas();
    ideas.unshift({ id: 'i' + (ideas.length ? +(ideas[0].id.slice(1)) + 1 : 1) + '-' + ideas.length, text: val });
    saveIdeas(ideas);
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
      <button type="button" class="dnd-handle" aria-hidden="true" tabindex="-1">⠿</button>
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
  wrap.innerHTML = phases.map((p, pi) => `
    <div class="phase-block">
      <h3>${esc(p.phase)} <span class="window">${esc(p.window || '')}</span></h3>
      <ul class="check-list" data-phase="${pi}">
        ${orderItems(p.items || [], order[pi]).map(it => checkItemHTML(it, state, due, now)).join('')}
      </ul>
    </div>`).join('');
  const prog = $('#checkProgress');
  if (prog) prog.hidden = false;
  wireChecklist();
  $$('#checkPhases .check-list').forEach(ul => makeSortable(ul, {
    itemSelector: '.check-item', handleSelector: '.dnd-handle', label: 'task',
    idOf: el => el.dataset.id,
    onReorder: (ids) => { const o = loadCheckOrder(); o[ul.dataset.phase] = ids; saveCheckOrder(o); },
  }));
  updateProgress();
}
function checkItemHTML(it, state, due, now) {
  const id = it.id;
  const checked = state[id] ? 'checked' : '';
  const kind = (it.kind || 'experience').toLowerCase();
  const reqs = it.requires || [];
  const locked = reqs.some(r => !state[r]) && !state[id];
  const eff = due[id] || it.dueBy || '';
  const st = eff ? windowStatus(eff, now) : 'none';
  const dueTag = eff ? `<span class="due-tag ${st}">due ${esc(fmtShort(eff))}</span>` : '';
  return `
    <li class="check-item ${locked ? 'locked' : ''}" data-id="${esc(id)}">
      <button type="button" class="dnd-handle" aria-label="Reorder task" tabindex="0">⠿</button>
      <input type="checkbox" id="cb-${esc(id)}" data-cid="${esc(id)}" ${checked} ${locked ? 'disabled' : ''}
             aria-label="${esc(it.task)}">
      <label class="ci-body" for="cb-${esc(id)}">
        <span class="ci-task">${esc(it.task)}<span class="kind-tag kind-${esc(kind)}">${esc(kind)}</span>${dueTag}${locked ? '<span class="lock">🔒 do prerequisite first</span>' : ''}</span>
        ${it.note ? `<span class="ci-note">${esc(it.note)}</span>` : ''}
        ${srcLinks(it.sources, 'ci-src')}
      </label>
      <button type="button" class="ci-due" data-due="${esc(id)}" title="Set a due date" aria-label="Set due date">📅</button>
    </li>`;
}
function wireChecklist() {
  $$('#checkPhases input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const state = loadChecks();
    if (cb.checked) state[cb.dataset.cid] = true; else delete state[cb.dataset.cid];
    saveChecks(state);
    renderChecklist();                 // re-render so dependent locks update
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  }));
  $$('#checkPhases .ci-due').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.due;
    const due = loadDue();
    const current = due[id] || '';
    const v = prompt('Due date (YYYY-MM-DD), or blank to clear:', current);
    if (v === null) return;
    if (v.trim() === '') delete due[id]; else if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) due[id] = v.trim();
    else { alert('Use YYYY-MM-DD format.'); return; }
    saveDue(due);
    renderChecklist();
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  }));
  const reset = $('#checkReset');
  if (reset) reset.addEventListener('click', () => {
    if (!confirm('Reset all checkmarks?')) return;
    saveChecks({});
    renderChecklist();
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  });
}
function updateProgress() {
  const boxes = $$('#checkPhases input[type=checkbox]');
  if (!boxes.length) return;
  const done = boxes.filter(b => b.checked).length;
  const pct = Math.round((done / boxes.length) * 100);
  const bar = $('#checkBar'), pctEl = $('#checkPct');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = `${pct}% · ${done}/${boxes.length}`;
}
