'use strict';
// 縁 People — a small trip PRM (#/people). Everyone met this year + what's worth remembering.
// PUBLIC repo: all data is device-local (localStorage `jwh-people-v1`); never committed, never
// leaves the browser. Every dynamic string is user-typed → esc()'d before innerHTML.
//
// Single-path data flow: mutate → set(KEYS.people, next) → dispatch jwh:data-changed → render().
// The page re-renders on jwh:data-changed only when its view is active (EF3 dirty-flag).

import { $, $$, esc } from './lib/dom.js';
import { get, set, getRaw, setRaw, KEYS } from './lib/store.js';
import { nowISO, fmtShort } from './lib/dates.js';
import { confirmModal } from './lib/modal.js';
import { prefersReducedMotion } from './motion.js';
import { newPerson, searchPeople, sortPeople, tagSet, initialsOf, hueOf, flagOf, leavesLabel, isBirthdayMonth, driftingPeople, driftLabel, toVCard } from './lib/people.js';

const VIEW_KEY = 'jwh-people-view-v1';
let TODAY = nowISO();
let DATA = null;   // tips.json (read-only): baked calendar events feed the "met at…" picker — people.js must NOT import calendar.js
let query = '', sortMode = 'met', filter = 'all', view = 'cards';   // filter: 'all' | 'star' | tag

// ---------- store ----------
const load = () => get(KEYS.people, []);
const save = (list) => { set(KEYS.people, list); document.dispatchEvent(new CustomEvent('jwh:data-changed')); };
const byId = (id) => load().find(p => p.id === id);

// ---------- mount ----------
export function mountPeople(data) {
  TODAY = nowISO();
  DATA = data || null;
  view = (getRaw(VIEW_KEY, 'cards') === 'list') ? 'list' : 'cards';
  render();
  let dirty = false;
  document.addEventListener('jwh:data-changed', () => {
    if (isActive()) render(); else dirty = true;
  });
  document.addEventListener('jwh:route', (e) => {
    if (e.detail?.route === 'people') { TODAY = nowISO(); if (dirty) { dirty = false; } render(); }
  });
  // the calendar event panel's "縁 met here" names land here (cross-module via event, no import)
  document.addEventListener('jwh:people-open', (e) => {
    const id = e.detail?.id;
    if (id && byId(id)) openDrawer(id);
  });
}
const isActive = () => document.getElementById('view-people')?.classList.contains('is-active');
const cssEsc = (s) => (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/"/g, '\\"');

// ---------- render ----------
function render() {
  const host = $('#pplList'); if (!host) return;
  TODAY = nowISO();
  const all = load();

  renderBar();
  renderFilters(all);
  renderDrift(all);

  // derive the visible set through search → filter → sort
  let list = searchPeople(all, query);
  if (filter === 'star') list = list.filter(p => p.star);
  else if (filter !== 'all') list = list.filter(p => (p.tags || []).includes(filter));
  list = sortPeople(list, sortMode);

  // preserve keyboard focus across the innerHTML rebuild (keyed by person id when possible)
  const focusedId = document.activeElement?.closest?.('[data-pid]')?.dataset.pid || null;

  if (!all.length) { host.innerHTML = emptyHTML(); wireEmpty(host); return; }
  if (!list.length) { host.innerHTML = noResultsHTML(); return; }

  host.innerHTML = view === 'list' ? listHTML(list) : gridHTML(list);
  wireCards(host);

  if (focusedId) $(`[data-pid="${cssEsc(focusedId)}"] .ppl-open`, host)?.focus();

  // entrance stagger (gated on reduce-motion)
  if (!prefersReducedMotion()) {
    const items = $$(view === 'list' ? '.ppl-row' : '.ppl-card', host);
    items.forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 220, delay: Math.min(i, 12) * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  }
}

function renderBar() {
  const bar = $('#pplBar'); if (!bar) return;
  bar.innerHTML = `
    <label class="ppl-search"><span aria-hidden="true">🔍</span>
      <input type="search" id="pplSearch" placeholder="search names, places, plans, notes…" aria-label="Search people" value="${esc(query)}">
    </label>
    <div class="ppl-seg" role="group" aria-label="View">
      <button type="button" class="ppl-segbtn ${view === 'cards' ? 'on' : ''}" data-view="cards" aria-pressed="${view === 'cards'}">⊞ Cards</button>
      <button type="button" class="ppl-segbtn ${view === 'list' ? 'on' : ''}" data-view="list" aria-pressed="${view === 'list'}">☰ List</button>
    </div>
    <label class="ppl-sortwrap">Sort
      <select id="pplSort" class="ppl-sort" aria-label="Sort people">
        <option value="met" ${sortMode === 'met' ? 'selected' : ''}>recently met</option>
        <option value="name" ${sortMode === 'name' ? 'selected' : ''}>name</option>
        <option value="seen" ${sortMode === 'seen' ? 'selected' : ''}>recently seen</option>
      </select>
    </label>
    <button type="button" class="ppl-vcf" id="pplVcf" title="Export everyone as a vCard (.vcf) — import into your phone contacts">⤓ vCard</button>
    <button type="button" class="ppl-add" id="pplAdd">＋ Add person</button>`;

  const search = $('#pplSearch', bar);
  search.addEventListener('input', () => { query = search.value; renderList(); });
  $$('[data-view]', bar).forEach(b => b.addEventListener('click', () => {
    view = b.dataset.view; setRaw(VIEW_KEY, view); render();
  }));
  $('#pplSort', bar).addEventListener('change', (e) => { sortMode = e.target.value; renderList(); });
  $('#pplAdd', bar).addEventListener('click', () => openEditor(null));
  $('#pplVcf', bar).addEventListener('click', downloadVCard);
}

// re-render just the list (keeps the search input focused while typing)
function renderList() {
  const host = $('#pplList'); if (!host) return;
  const all = load();
  renderFilters(all);
  let list = searchPeople(all, query);
  if (filter === 'star') list = list.filter(p => p.star);
  else if (filter !== 'all') list = list.filter(p => (p.tags || []).includes(filter));
  list = sortPeople(list, sortMode);
  if (!all.length) { host.innerHTML = emptyHTML(); wireEmpty(host); return; }
  host.innerHTML = list.length ? (view === 'list' ? listHTML(list) : gridHTML(list)) : noResultsHTML();
  wireCards(host);
}

// ---------- drifting strip (page-level, deliberately NEVER the notifications bell) ----------
function renderDrift(all) {
  const host = $('#pplDrift'); if (!host) return;
  const drifting = driftingPeople(all, TODAY);
  if (!drifting.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="ppl-drift-strip" role="group" aria-label="People you haven't seen in a while">
    <span class="ppl-drift-k" aria-hidden="true">☾ Drifting:</span>
    ${drifting.slice(0, 8).map(d => `<button type="button" class="ppl-driftp" data-drift="${esc(d.id)}">${esc(d.name)} <small>(${esc(driftLabel(d.days))})</small></button>`).join(' ')}
    ${drifting.length > 8 ? `<span class="ppl-drift-more">+${drifting.length - 8} more</span>` : ''}
  </div>`;
  $$('[data-drift]', host).forEach(b => b.addEventListener('click', () => openDrawer(b.dataset.drift, b)));
}

function renderFilters(all) {
  const bar = $('#pplFilters'); if (!bar) return;
  const tags = tagSet(all);
  if (filter !== 'all' && filter !== 'star' && !tags.includes(filter)) filter = 'all';
  const focused = bar.contains(document.activeElement) ? document.activeElement?.dataset?.filter : null;
  bar.innerHTML = [
    `<button type="button" class="chip ${filter === 'all' ? 'active' : ''}" data-filter="all" aria-pressed="${filter === 'all'}">All</button>`,
    `<button type="button" class="chip ppl-starchip ${filter === 'star' ? 'active' : ''}" data-filter="star" aria-pressed="${filter === 'star'}">★ starred</button>`,
    ...tags.map(t => `<button type="button" class="chip ${filter === t ? 'active' : ''}" data-filter="${esc(t)}" aria-pressed="${filter === t}">${esc(t)}</button>`),
  ].join('');
  $$('[data-filter]', bar).forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; renderList(); }));
  if (focused) (bar.querySelector(`[data-filter="${cssEsc(focused)}"]`) || bar.querySelector('.chip'))?.focus();
}

// ---------- card / list HTML ----------
function subline(p) {
  const flag = flagOf(p.nationality);
  const place = [p.from, p.neighborhood].filter(Boolean).map(esc);
  const loc = place.length === 2 ? `${place[0]} → ${place[1]}` : (place[0] || '');
  const parts = [];
  if (loc) parts.push(loc);
  if (p.speaks) parts.push(esc(p.speaks));
  return `${flag ? flag + ' ' : ''}${parts.join(' · ')}`;
}

// footer seen line: green dot ≤7 days, amber "☾ N days" when drifting, — when never seen
function seenBits(p) {
  const n = p.seenCount || 0;
  if (!p.lastSeen) return { cls: '', html: n ? `×${n}` : 'not seen yet' };
  const d = daysAgo(p.lastSeen);
  if (d != null && d > 7) return { cls: 'ppl-drift', html: `☾ ${d} days · ×${n}` };
  return { cls: '', html: `<span class="ppl-dot" aria-hidden="true"></span>seen ${esc(fmtShort(p.lastSeen))} · ×${n}` };
}
function daysAgo(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(TODAY);
  if (!m || !t) return null;
  return Math.round((Date.UTC(+t[1], +t[2] - 1, +t[3]) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
}
// linkify: ONLY https?:// URLs become links; @handles / free text stay plain (esc'd).
function linkifyContact(text) {
  const s = String(text || '');
  if (!s) return '';
  return esc(s).replace(/https?:\/\/[^\s]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u} ↗</a>`);
}
const metLine = (p) => {
  const date = p.metDate ? `<b>${esc(fmtShort(p.metDate))}${p.metPlace ? ' · ' + esc(p.metPlace) : ''}</b>` : '';
  const ctx = p.metContext ? ` — ${esc(p.metContext)}` : '';
  return date ? `Met ${date}${ctx}` : (p.metContext ? esc(p.metContext) : '');
};
const chipsHTML = (p) => (p.tags || []).length
  ? `<div class="ppl-tags">${p.tags.map(t => `<span class="ppl-tag">${esc(t)}</span>`).join('')}</div>` : '';

function gridHTML(list) {
  return `<div class="ppl-grid">${list.map(cardHTML).join('')}</div>`;
}
function cardHTML(p) {
  const lv = leavesLabel(p.leaves, TODAY);
  // slot priority: leaves > next-plan pill > notes preview (keeps card heights even)
  let slot = '';
  if (lv) slot = `<div class="ppl-leaves">${esc(lv)}</div>`;
  else if (p.nextPlan) slot = `<div class="ppl-plan">▸ ${esc(p.nextPlan)}</div>`;
  else if (p.notes) slot = `<div class="ppl-note">${esc(p.notes)}</div>`;
  const seen = seenBits(p);
  return `<div class="ppl-card ${p.star ? 'starred' : ''}" data-pid="${esc(p.id)}">
    <button type="button" class="ppl-star ${p.star ? '' : 'off'}" data-star="${esc(p.id)}" aria-pressed="${!!p.star}" aria-label="${p.star ? 'Unstar' : 'Star'} ${esc(p.name)}">${p.star ? '★' : '☆'}</button>
    <div class="ppl-hd">
      <div class="ppl-av" style="background:var(--c-${hueOf(p.id)})" aria-hidden="true">${esc(initialsOf(p.name))}</div>
      <div class="ppl-id"><div class="ppl-nm"><button type="button" class="ppl-open" aria-label="Open ${esc(p.name)}">${esc(p.name)}${p.reading ? ` <span class="ppl-rd">${esc(p.reading)}</span>` : ''}${isBirthdayMonth(p.birthday, TODAY) ? ' <span title="birthday this month">🎂</span>' : ''}</button></div>
        <div class="ppl-sub">${subline(p)}</div></div>
    </div>
    ${metLine(p) ? `<div class="ppl-met">${metLine(p)}</div>` : ''}
    ${slot}
    ${chipsHTML(p)}
    <div class="ppl-ft"><span class="ppl-seen ${seen.cls}">${seen.html}</span>${p.contact ? `<span class="ppl-contact">${linkifyContact(p.contact)}</span>` : ''}</div>
  </div>`;
}

function listHTML(list) {
  const rows = list.map(rowHTML).join('');
  return `<div class="ppl-list">
    <div class="ppl-row ppl-rowhd" aria-hidden="true"><span></span><span>name</span><span>met</span><span>next plan / leaves</span><span>seen</span><span class="ppl-thtags">tags</span></div>
    ${rows}</div>`;
}
function rowHTML(p) {
  const lv = leavesLabel(p.leaves, TODAY);
  const next = lv ? `<span class="ppl-lnext lv">${esc(lv)}</span>`
    : p.nextPlan ? `<span class="ppl-lnext">▸ ${esc(p.nextPlan)}</span>`
      : `<span class="ppl-lnext none">—</span>`;
  const seen = seenBits(p);
  const firstTag = (p.tags || [])[0];
  return `<div class="ppl-row" data-pid="${esc(p.id)}">
    <div class="ppl-lav" style="background:var(--c-${hueOf(p.id)})" aria-hidden="true">${esc(initialsOf(p.name))}</div>
    <div class="ppl-lnm"><button type="button" class="ppl-lstar ${p.star ? '' : 'off'}" data-star="${esc(p.id)}" aria-pressed="${!!p.star}" aria-label="${p.star ? 'Unstar' : 'Star'} ${esc(p.name)}">${p.star ? '★' : '☆'}</button><button type="button" class="ppl-open" aria-label="Open ${esc(p.name)}">${esc(p.name)}${p.reading ? ` <span class="ppl-rd">${esc(p.reading)}</span>` : ''}</button><small>${subline(p)}</small></div>
    <div class="ppl-lctx">${metLine(p)}</div>
    <div>${next}</div>
    <div class="ppl-lseen ${seen.cls}">${seen.html}</div>
    <div class="ppl-ltags">${firstTag ? `<span class="ppl-tag">${esc(firstTag)}</span>` : ''}</div>
  </div>`;
}

function emptyHTML() {
  return `<div class="ppl-empty">
    <div class="ppl-empty-art" aria-hidden="true">⛩️ 👋</div>
    <h3>The people make the year.</h3>
    <p>Every name you'll wish you remembered — the guesthouse friend, the barber, the guy from the festival. Add them while the details are fresh. Everything stays on this device.</p>
    <button type="button" class="ppl-add" id="pplEmptyAdd">＋ Add your first person</button>
  </div>`;
}
function noResultsHTML() {
  return `<div class="ppl-empty ppl-noresults">
    <div class="ppl-empty-art" aria-hidden="true">🔍</div>
    <h3>No one matches that.</h3>
    <p>Try a different search, or clear the filter chips above.</p>
  </div>`;
}
function wireEmpty(host) { $('#pplEmptyAdd', host)?.addEventListener('click', () => openEditor(null)); }

// ---------- wiring: card/row click + inline star ----------
function wireCards(host) {
  $$('[data-star]', host).forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStar(b.dataset.star);
  }));
  $$('[data-pid]', host).forEach(el => {
    const open = (e) => {
      if (e.target.closest('[data-star]') || e.target.closest('a')) return;   // star + contact links are their own actions
      openDrawer(el.dataset.pid, el);
    };
    el.addEventListener('click', open);   // the .ppl-open name button is the keyboard trigger; its click bubbles here
  });
}

// ---------- vCard export (download helper pattern from calendar-editor) ----------
function downloadVCard() {
  const list = load();
  if (!list.length) return;
  const blob = new Blob([toVCard(list)], { type: 'text/vcard' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'people.vcf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- "met at…" event pool (baked tips.json + user events; NO calendar.js import) ----------
// The picker is title+date only, so skipping the calendar's date-override merge is fine —
// an override moves an event, it doesn't rename it.
function eventPool() {
  const norm = (e) => ({ id: String(e?.id || ''), title: String(e?.title || ''), date: String(e?.date || '').slice(0, 10) });
  const user = (get(KEYS.events, []) || []).map(norm);
  const baked = (DATA?.calendar || []).map(norm);
  return [...user, ...baked].filter(e => e.id && e.title);
}

// ---------- mutations ----------
function toggleStar(id) {
  const list = load().map(p => p.id === id ? { ...p, star: !p.star } : p);
  save(list);
}
function seenToday(id) {
  const list = load().map(p => p.id === id ? { ...p, lastSeen: nowISO(), seenCount: (p.seenCount || 0) + 1 } : p);
  save(list);
}
function addNote(id, text) {
  const t = String(text || '').trim(); if (!t) return;
  const today = nowISO();
  const list = load().map(p => p.id === id
    ? { ...p, notes: (p.notes ? p.notes + '\n' : '') + `[${today}] ${t}`, notesUpdated: today }
    : p);
  save(list);
}
async function deletePerson(id, opener) {
  const p = byId(id);
  if (!await confirmModal(`Delete ${p ? p.name : 'this person'}? This can't be undone.`, { ok: 'Delete', danger: true })) return;
  save(load().filter(x => x.id !== id));
  ($('#pplAdd') || opener)?.focus?.();
}

// ---------- detail drawer ----------
let drawerEl = null, drawerOpener = null, drawerPid = null;
function openDrawer(id, opener) {
  const p = byId(id); if (!p) return;
  closeDrawer(true);
  drawerOpener = opener || document.activeElement;
  drawerPid = id;   // focus-return survives re-renders: re-find the row by pid if the opener node was replaced
  const reduce = prefersReducedMotion();

  const wrap = document.createElement('div');
  wrap.className = 'ppl-drawer-wrap';
  wrap.innerHTML = `<div class="ppl-scrim"></div>
    <div class="ppl-drawer" role="dialog" aria-modal="true" aria-label="${esc(p.name)}" tabindex="-1">
      <button type="button" class="ppl-x" aria-label="Close">✕</button>
      ${drawerBody(p)}
    </div>`;
  document.body.appendChild(wrap);
  drawerEl = wrap;
  const drawer = $('.ppl-drawer', wrap);
  const scrim = $('.ppl-scrim', wrap);

  if (!reduce) {
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    drawer.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' });
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(drawer); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  wrap._onKey = onKey;

  $('.ppl-x', wrap).addEventListener('click', () => closeDrawer());
  scrim.addEventListener('click', () => closeDrawer());

  $('[data-act="seen"]', wrap)?.addEventListener('click', () => { seenToday(id); reopen(id); });
  $('[data-act="star"]', wrap)?.addEventListener('click', () => { toggleStar(id); reopen(id); });
  $('[data-act="edit"]', wrap)?.addEventListener('click', () => { closeDrawer(); openEditor(byId(id)); });
  $('[data-act="note"]', wrap)?.addEventListener('click', () => openNote(id));
  $('[data-act="event"]', wrap)?.addEventListener('click', () => gotoMetEvent(id));
  $('[data-act="delete"]', wrap)?.addEventListener('click', () => { const o = drawerOpener; closeDrawer(); deletePerson(id, o); });

  setTimeout(() => (drawer.querySelector('[data-act="seen"]') || drawer).focus(), 20);
}
// re-render the drawer in place after a mutation (star/seen), keeping it open
function reopen(id) {
  const opener = drawerOpener;
  const p = byId(id); if (!p || !drawerEl) return;
  const drawer = $('.ppl-drawer', drawerEl);
  drawer.innerHTML = `<button type="button" class="ppl-x" aria-label="Close">✕</button>${drawerBody(p)}`;
  $('.ppl-x', drawer.parentElement).addEventListener('click', () => closeDrawer());
  $('[data-act="seen"]', drawer)?.addEventListener('click', () => { seenToday(id); reopen(id); });
  $('[data-act="star"]', drawer)?.addEventListener('click', () => { toggleStar(id); reopen(id); });
  $('[data-act="edit"]', drawer)?.addEventListener('click', () => { closeDrawer(); openEditor(byId(id)); });
  $('[data-act="note"]', drawer)?.addEventListener('click', () => openNote(id));
  $('[data-act="event"]', drawer)?.addEventListener('click', () => gotoMetEvent(id));
  $('[data-act="delete"]', drawer)?.addEventListener('click', () => { const o = opener; closeDrawer(); deletePerson(id, o); });
  drawerOpener = opener;
  (drawer.querySelector('[data-act="seen"]') || drawer).focus();
}
function closeDrawer(silent) {
  if (!drawerEl) return;
  const wrap = drawerEl, opener = drawerOpener, pid = drawerPid;
  drawerEl = null; drawerOpener = null; drawerPid = null;
  document.removeEventListener('keydown', wrap._onKey, true);
  const finish = () => {
    wrap.remove();
    if (silent) return;
    // a data mutation re-render may have replaced the opener node — re-find it by pid (same fix as the calendar popover)
    const target = (opener?.isConnected && opener) || (pid && document.querySelector(`[data-pid="${cssEsc(pid)}"] .ppl-open`)) || null;
    target?.focus?.();
  };
  if (!silent && !prefersReducedMotion()) {
    const drawer = $('.ppl-drawer', wrap);
    const a = drawer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 180, easing: 'ease-in' });
    $('.ppl-scrim', wrap)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' });
    a.finished.then(finish).catch(finish);
  } else finish();
}
const focusables = (root) => [...root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);

function fRow(label, valueHTML) {
  return valueHTML ? `<span class="ppl-fl">${esc(label)}</span><span class="ppl-fv">${valueHTML}</span>` : '';
}
function drawerBody(p) {
  const lv = leavesLabel(p.leaves, TODAY);
  const flag = flagOf(p.nationality);
  const seenVal = p.lastSeen
    ? `×${p.seenCount || 0} · last ${esc(fmtShort(p.lastSeen))}${p.lastSeenWhere ? ', ' + esc(p.lastSeenWhere) : ''}`
    : ((p.seenCount || 0) ? `×${p.seenCount}` : 'not seen yet');
  const evBtn = p.metEventId ? ` <button type="button" class="ppl-evgo" data-act="event">📅 event</button>` : '';
  const rows = [
    fRow('met', p.metDate ? `${esc(fmtShort(p.metDate))}${p.metPlace ? ' · ' + esc(p.metPlace) : ''}${p.metContext ? ` <small>— ${esc(p.metContext)}</small>` : ''}${evBtn}` : (p.metEventId ? evBtn.trim() : '')),
    fRow('nationality', p.nationality ? `${flag ? flag + ' ' : ''}${esc(p.nationality)}${p.from ? ` <small>· from ${esc(p.from)}</small>` : ''}` : (p.from ? `<small>from ${esc(p.from)}</small>` : '')),
    fRow('lives', p.neighborhood ? esc(p.neighborhood) : ''),
    fRow('address as', p.addressAs ? esc(p.addressAs) : ''),
    fRow('next plan', p.nextPlan ? esc(p.nextPlan) : ''),
    fRow('leaves', lv ? esc(lv) : ''),
    fRow('met through', p.metThrough ? esc(p.metThrough) : ''),
    fRow('food', p.food ? esc(p.food) : ''),
    fRow('speaks', p.speaks ? esc(p.speaks) : ''),
    fRow('birthday', p.birthday ? esc(p.birthday) : ''),
    fRow('seen', seenVal),
    fRow('contact', p.contact ? linkifyContact(p.contact) : ''),
  ].filter(Boolean).join('');
  const notesBlock = p.notes
    ? `<div class="ppl-nlog">${esc(p.notes).replace(/\n/g, '<br>')}${p.notesUpdated ? `<span class="ppl-nd">updated ${esc(fmtShort(p.notesUpdated))}</span>` : ''}</div>`
    : '';
  return `
    <div class="ppl-phd">
      <div class="ppl-av" style="background:var(--c-${hueOf(p.id)})" aria-hidden="true">${esc(initialsOf(p.name))}</div>
      <div><div class="ppl-pnm">${esc(p.name)}${p.reading ? ` <span class="ppl-rd">${esc(p.reading)}</span>` : ''}</div>
        <div class="ppl-sub">${p.star ? '★ ' : ''}${(p.tags || []).map(esc).join(' · ')}</div></div>
    </div>
    <div class="ppl-frow">${rows}</div>
    ${notesBlock}
    <div class="ppl-pacts">
      <button type="button" class="ppl-btn primary" data-act="seen">✓ Seen today</button>
      <button type="button" class="ppl-btn" data-act="star">${p.star ? '★ Starred' : '☆ Star'}</button>
      <button type="button" class="ppl-btn" data-act="edit">✎ Edit</button>
      <button type="button" class="ppl-btn" data-act="note">＋ Note</button>
      <button type="button" class="ppl-btn danger" data-act="delete">Delete</button>
    </div>`;
}

// drawer "📅 event" → jump to the calendar and open that event's side panel (event bus, no import)
function gotoMetEvent(id) {
  const evId = byId(id)?.metEventId;
  if (!evId) return;
  closeDrawer(true);
  if (location.hash !== '#/calendar') location.hash = '#/calendar';
  requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('jwh:cal-showevent', { detail: { id: evId } })));
}

// ---------- ＋ Note (small modal) ----------
function openNote(id) {
  const ov = modalShell(`
    <h3 class="modal-title">Add a note</h3>
    <form id="pplNoteForm" class="modal-form">
      <label>Note<textarea name="note" rows="3" placeholder="A detail worth remembering…" required></textarea></label>
      <div class="modal-actions"><button type="submit" class="btn primary">Add</button></div>
    </form>`);
  $('#pplNoteForm', ov).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get('note');
    addNote(id, v);
    closeShell(ov);
    if (drawerEl) reopen(id);
  });
}

// ---------- Add / Edit modal (grouped: Who / How we met / Staying in touch) ----------
function openEditor(person) {
  const p = person || {};
  const editing = !!person;
  const v = (k) => esc(p[k] || '');
  const body = `
    <h3 class="modal-title">${editing ? 'Edit person' : 'Add person'}</h3>
    <form id="pplForm" class="modal-form ppl-form">
      <fieldset class="ppl-fs"><legend>Who</legend>
        <label>Name<input name="name" value="${v('name')}" required autocomplete="off"></label>
        <div class="row2">
          <label>Reading / nickname<input name="reading" value="${v('reading')}" autocomplete="off"></label>
          <label class="ppl-starfield"><input type="checkbox" name="star" ${p.star ? 'checked' : ''}> ★ starred</label>
        </div>
        <div class="row2">
          <label>Nationality<input name="nationality" value="${v('nationality')}" placeholder="e.g. JP" autocomplete="off"></label>
          <label>From (hometown)<input name="from" value="${v('from')}" autocomplete="off"></label>
        </div>
        <div class="row2">
          <label>Lives (neighborhood)<input name="neighborhood" value="${v('neighborhood')}" autocomplete="off"></label>
          <label>Address as<input name="addressAs" value="${v('addressAs')}" placeholder="san / kun / casual" autocomplete="off"></label>
        </div>
      </fieldset>
      <fieldset class="ppl-fs"><legend>How we met</legend>
        <div class="row2">
          <label>Met date<input name="metDate" type="date" value="${esc(String(p.metDate || TODAY).slice(0, 10))}"></label>
          <label>Place<input name="metPlace" value="${v('metPlace')}" autocomplete="off"></label>
        </div>
        <label>Context (the hook)<input name="metContext" value="${v('metContext')}" placeholder="camped in the next tent…" autocomplete="off"></label>
        <label>Met through<input name="metThrough" value="${v('metThrough')}" autocomplete="off"></label>
        <label>Met at event <small>(links to the calendar)</small><input name="metEventQ" id="pplEvQ" value="${esc(linkedEventTitle(p.metEventId))}" placeholder="search calendar events…" autocomplete="off"></label>
        <input type="hidden" name="metEventId" value="${v('metEventId')}">
        <div id="pplEvSug" class="ppl-evsug" hidden></div>
      </fieldset>
      <fieldset class="ppl-fs"><legend>Staying in touch</legend>
        <label>Contact<input name="contact" value="${v('contact')}" placeholder="LINE @handle · https://…" autocomplete="off"></label>
        <div class="row2">
          <label>Speaks<input name="speaks" value="${v('speaks')}" placeholder="JP, EN" autocomplete="off"></label>
          <label>Birthday<input name="birthday" value="${v('birthday')}" placeholder="MM-DD" autocomplete="off"></label>
        </div>
        <div class="row2">
          <label>Leaves Tokyo<input name="leaves" type="date" value="${esc(String(p.leaves || '').slice(0, 10))}"></label>
          <label>Next plan<input name="nextPlan" value="${v('nextPlan')}" autocomplete="off"></label>
        </div>
        <label>Food / spots<input name="food" value="${v('food')}" autocomplete="off"></label>
        <label>Tags (comma-separated)<input name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="music, share house" autocomplete="off"></label>
        <label>Notes<textarea name="notes" rows="3">${esc(p.notes || '')}</textarea></label>
      </fieldset>
      <div class="modal-actions"><button type="submit" class="btn primary">${editing ? 'Save' : 'Add'}</button></div>
    </form>`;
  const ov = modalShell(body);
  wireEventPicker(ov);
  $('#pplForm', ov).addEventListener('submit', (e) => {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(e.target).entries());
    if (!String(o.name || '').trim()) return;
    const tags = String(o.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const fields = {
      name: o.name, reading: o.reading, star: !!o.star,
      metDate: o.metDate, metPlace: o.metPlace, metContext: o.metContext, metThrough: o.metThrough,
      metEventId: String(o.metEventQ || '').trim() ? o.metEventId : '',   // clearing the text clears the link
      nationality: o.nationality, from: o.from, neighborhood: o.neighborhood, addressAs: o.addressAs,
      contact: o.contact, speaks: o.speaks, birthday: o.birthday, leaves: o.leaves,
      nextPlan: o.nextPlan, food: o.food, tags, notes: o.notes,
    };
    let list;
    if (editing) {
      list = load().map(x => x.id === p.id ? { ...x, ...newPerson({ ...x, ...fields }, TODAY, x.id) } : x);
    } else {
      list = [...load(), newPerson(fields, TODAY, 'p' + Date.now())];
    }
    save(list);
    closeShell(ov, true);
  });
}

// title shown in the picker input for an existing link (pool lookup; deleted event → note)
function linkedEventTitle(id) {
  if (!id) return '';
  return eventPool().find(e => e.id === id)?.title || '(linked event no longer exists)';
}
// lite typeahead over eventPool() — top 6 title matches; picking one fills the hidden metEventId
function wireEventPicker(ov) {
  const q = $('#pplEvQ', ov), sug = $('#pplEvSug', ov), idField = ov.querySelector('input[name="metEventId"]');
  if (!q || !sug || !idField) return;
  const pool = eventPool();
  q.addEventListener('input', () => {
    idField.value = '';   // typing invalidates the previous pick until a new one is chosen
    const needle = q.value.trim().toLowerCase();
    if (!needle) { sug.hidden = true; sug.innerHTML = ''; return; }
    const hits = pool.filter(e => e.title.toLowerCase().includes(needle)).slice(0, 6);
    sug.innerHTML = hits.length
      ? hits.map(e => `<button type="button" class="ppl-evopt" data-eid="${esc(e.id)}" data-title="${esc(e.title)}">${esc(e.title)} <small>${esc(fmtShort(e.date) || e.date)}</small></button>`).join('')
      : '<span class="ppl-evnone">no matching events</span>';
    sug.hidden = false;
    $$('.ppl-evopt', sug).forEach(b => b.addEventListener('click', () => {
      idField.value = b.dataset.eid;
      q.value = b.dataset.title;
      sug.hidden = true; sug.innerHTML = '';
      q.focus();
    }));
  });
}

// ---------- modal shell (module-local, copied from calendar-editor.js pattern) ----------
function modalShell(html) {
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal ppl-modal" role="dialog" aria-modal="true" aria-labelledby="pplModalTitle" tabindex="-1"><button type="button" class="modal-x" aria-label="Close">✕</button>${html}</div>`;
  document.body.appendChild(ov);
  const h = ov.querySelector('.modal-title'); if (h && !h.id) h.id = 'pplModalTitle';
  const focus = () => [...ov.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  const restore = () => { if (prev && prev.focus) prev.focus(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) { closeShell(ov); } });
  ov.querySelector('.modal-x').addEventListener('click', () => closeShell(ov));
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeShell(ov); return; }
    if (e.key !== 'Tab') return;
    const f = focus(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  setTimeout(() => (ov.querySelector('.modal input,.modal textarea') || focus()[0])?.focus(), 30);
  ov._restore = restore;
  return ov;
}
// rerender:true → the opener may be destroyed by render(); send focus to the stable +Add button
function closeShell(ov, rerender) {
  ov.classList.add('out'); setTimeout(() => ov.remove(), 180);
  if (rerender) $('#pplAdd')?.focus();
  else ov._restore?.();
}
