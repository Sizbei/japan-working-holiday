'use strict';
// The "Going To" page (#/going) — a dedicated, filterable view of the events the user has
// marked ✓ Going (lib/going.js). Reads allEvents() + isGoing; re-renders on jwh:data-changed.
// Filter by category (only categories actually present) + an "upcoming only" toggle.

import { $, $$, esc } from './lib/dom.js';
import { fmtShort, nowISO, daysBetween } from './lib/dates.js';
import { allEvents } from './calendar.js';
import { gcalUrl } from './lib/ics.js';
import { isGoing, toggleGoing, addGoing } from './lib/going.js';
import { dndToast } from './dnd.js';
import { get, set, KEYS } from './lib/store.js';

let TODAY = nowISO();
let fCat = 'all', fUpcoming = true;   // session filter state

// the trip itinerary on the calendar is the 'personal' category (arrival/day plans, stays, flights,
// intercity legs) — as opposed to researched suggestions (festivals, conventions…). Sync marks all
// of them ✓ Going so the list reflects the real trip. Explicit + repeatable (re-run as you add days).
function syncItinerary() {
  const ids = allEvents().filter(e => (e.category || 'personal') === 'personal').map(e => e.id);
  const n = addGoing(ids);   // one write + dispatch → the jwh:data-changed listener re-renders
  dndToast(n ? `Added ${n} itinerary event${n === 1 ? '' : 's'} to Going` : 'Your itinerary is already all in Going');
}

export function mountGoingPage() {
  TODAY = nowISO();
  $('#goingSync')?.addEventListener('click', syncItinerary);
  render();
  // EF3: a ✓ Going toggle anywhere refreshes this list — immediately when visible, else on entry
  let goingDirty = false;
  document.addEventListener('jwh:data-changed', () => {
    if (document.getElementById('view-going')?.classList.contains('is-active')) render();
    else goingDirty = true;
  });
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'going' && goingDirty) { goingDirty = false; render(); } });
}

// CSS.escape for building an attribute selector from user-derived category values (safe fallback for old engines)
const cssEsc = (s) => (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/"/g, '\\"');

function goingEvents() {
  return allEvents().filter(e => isGoing(e.id)).sort((a, b) => a.date.localeCompare(b.date));
}

function render() {
  TODAY = nowISO();   // a tab open across midnight must not filter/label against yesterday (review note)
  const wrap = $('#goingList'); if (!wrap) return;
  const all = goingEvents();
  const cats = [...new Set(all.map(e => e.category || 'personal'))].sort();
  if (!cats.includes(fCat) && fCat !== 'all') fCat = 'all';   // a removed-last-of-category resets the filter

  const bar = $('#goingFilters');
  // capture which filter chip has focus so we can restore it after innerHTML rebuild (chip is destroyed)
  const focused = bar?.contains(document.activeElement) ? document.activeElement : null;
  const focusSel = focused == null ? null
    : (focused.dataset.upcoming !== undefined ? '[data-upcoming]'
      : (focused.dataset.fcat != null ? `[data-fcat="${cssEsc(focused.dataset.fcat)}"]` : null));
  if (bar) bar.innerHTML = [
    `<button type="button" class="chip ${fCat === 'all' ? 'active' : ''}" data-fcat="all" aria-pressed="${fCat === 'all'}">All</button>`,
    ...cats.map(c => `<button type="button" class="chip going-fcat ${fCat === c ? 'active' : ''}" data-fcat="${esc(c)}" aria-pressed="${fCat === c}"><span class="going-fdot cat-${esc(c)}" aria-hidden="true"></span>${esc(c)}</button>`),
    `<button type="button" class="chip going-upcoming ${fUpcoming ? 'active' : ''}" data-upcoming aria-pressed="${fUpcoming}">${fUpcoming ? '☑' : '☐'} Upcoming only</button>`,
  ].join('');

  const list = all.filter(e =>
    (fCat === 'all' || (e.category || 'personal') === fCat) &&
    (!fUpcoming || (e.endDate || e.date).slice(0, 10) >= TODAY));

  wrap.innerHTML = list.length
    ? list.map(rowHTML).join('')
    : (all.length
      ? `<div class="empty empty-state"><div class="empty-emoji" aria-hidden="true">🎏</div><p class="empty-h">Nothing matches this filter.</p><p class="empty-sub">Try “All” or turn off “Upcoming only”.</p></div>`
      : `<div class="empty empty-state"><div class="empty-emoji" aria-hidden="true">🎫</div><p class="empty-h">You're not going to anything yet.</p><p class="empty-sub">Open an event on the <a href="#/calendar">Calendar</a> and tap <b>✓ Going</b> to add it here.</p></div>`);

  const ct = $('#goingCount'); if (ct) ct.textContent = all.length ? `${all.length} event${all.length === 1 ? '' : 's'}` : '';

  bar?.querySelectorAll('[data-fcat]').forEach(b => b.addEventListener('click', () => { fCat = b.dataset.fcat; render(); }));
  bar?.querySelector('[data-upcoming]')?.addEventListener('click', () => { fUpcoming = !fUpcoming; render(); });
  // restore keyboard focus to the same chip after the rebuild (fallback: first chip)
  if (focusSel) (bar?.querySelector(focusSel) || bar?.querySelector('.chip'))?.focus();
  wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => toggleGoing(b.dataset.remove)));   // dispatches → render listener fires
  // ✎ location: swap the area line for an inline input; Enter saves (blank clears), Escape cancels.
  // Saved to KEYS.evArea (works for baked AND user events) — allEvents() merges it app-wide.
  wrap.querySelectorAll('[data-loc]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.loc, host = b.closest('.going-area');
    if (!host || host.querySelector('input')) return;
    const cur = goingEvents().find(e => e.id === id)?.area || '';
    host.innerHTML = `📍 <input class="going-loc-in" type="text" value="${esc(cur)}" placeholder="e.g. Shibuya — Harmonica Yokocho" aria-label="Location">`;
    const input = host.querySelector('input');
    input.focus(); input.select();
    let done = false;   // Enter fires save then blur — don't double-save/render
    const save = () => {
      if (done) return; done = true;
      const v = input.value.trim();
      const m = { ...(get(KEYS.evArea, {}) || {}) };
      if (v) m[id] = v; else delete m[id];
      set(KEYS.evArea, m);
      document.dispatchEvent(new CustomEvent('jwh:data-changed'));   // re-renders this list + calendar/map re-derive
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { e.preventDefault(); done = true; render(); }
    });
    input.addEventListener('blur', save);
  }));
}

function rowHTML(e) {
  const d = e.date.slice(0, 10);
  const dn = daysBetween(TODAY, d);
  const rel = dn === null ? '' : dn > 0 ? `in ${dn}d` : dn === 0 ? 'today' : `${-dn}d ago`;
  const cat = e.category || 'personal';
  return `<div class="going-row" data-id="${esc(e.id)}">
    <div class="going-date cat-${esc(cat)}"><b>${esc(fmtShort(e.date))}</b><span class="going-when">${esc(rel)}</span></div>
    <div class="going-main">
      <div class="going-title">${esc(e.title)}</div>
      <div class="going-area">${e.area ? `📍 ${esc(e.area)} ` : ''}<button type="button" class="going-loc" data-loc="${esc(e.id)}" aria-label="${e.area ? 'Edit' : 'Add'} location for ${esc(e.title)}">${e.area ? '✎' : '📍 add location'}</button></div>
      <span class="going-cat cat-${esc(cat)}">${esc(cat)}</span>
    </div>
    <div class="going-acts">
      <a class="going-ic" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" aria-label="Add ${esc(e.title)} to Google Calendar">+G</a>
      <button type="button" class="going-ic" data-remove="${esc(e.id)}" aria-label="Remove ${esc(e.title)} from Going" title="Not going">✕</button>
    </div>
  </div>`;
}
