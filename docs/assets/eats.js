'use strict';
// Eats (#/eats) — a dead-simple food-rating log. Each entry is a Place with source:'eat'
// (rating 1–5, the one-liner in `note`, an optional Google Maps `link`, visited:true), so it
// reuses the places store AND can pin on the Map when it has coords. Renders lazily on first visit.

import { $, esc } from './lib/dom.js';
import { loadPlaces, upsertPlace, patchPlace, deletePlace, dispatchChanged } from './lib/places.js';
import { nowISO, fmtShort } from './lib/dates.js';
import { confirmModal } from './lib/modal.js';

let wired = false;
let sortMode = 'new';   // 'new' (date added) | 'best' (rating, then date) — view state only, not persisted

const isEat = (p) => p && p.source === 'eat';
// newest first (by date added, then id which encodes the timestamp)
function loadEats() {
  const eats = loadPlaces().filter(isEat).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
  return sortMode === 'best' ? [...eats].sort((a, b) => (b.rating || 0) - (a.rating || 0)) : eats;
}
// a Maps link for a row: use the user's if given, else a Maps search for the name
function mapLink(e) {
  const l = (e.link || '').trim();
  if (/^https?:\/\//i.test(l)) return l;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.name || '');
}
// 5 stars; `interactive` renders buttons that set the rating, else static glyphs
function starsHTML(rating, id) {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
  let out = '';
  for (let n = 1; n <= 5; n++) {
    const on = n <= r;
    out += id
      ? `<button type="button" class="eat-star${on ? ' on' : ''}" data-id="${esc(id)}" data-n="${n}" aria-label="${n} star${n === 1 ? '' : 's'}" aria-pressed="${on ? 'true' : 'false'}">${on ? '★' : '☆'}</button>`
      : `<span class="eat-star${on ? ' on' : ''}" aria-hidden="true">${on ? '★' : '☆'}</span>`;
  }
  return out;
}

export function mountEats() {
  const view = $('#view-eats');
  if (!view) return;
  render();
  if (!wired) {
    wired = true;
    // add a new eat
    $('#eatsAdd')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#eatName')?.value.trim();
      if (!name) { $('#eatName')?.focus(); return; }
      const rating = +($('#eatAdd')?.dataset.rating || 0);
      upsertPlace({
        id: 'eat' + Date.now(), name, source: 'eat', category: 'food', visited: true,
        rating, note: ($('#eatNote')?.value || '').trim(), link: ($('#eatLink')?.value || '').trim(),
        coordKind: 'approx', lat: null, lng: null, date: nowISO(),
      });   // upsertPlace dispatches jwh:data-changed → the list re-renders
      $('#eatsAdd').reset();
      if ($('#eatAdd')) $('#eatAdd').dataset.rating = '0';
      paintAddStars();
      $('#eatName')?.focus();
    });
    // interactions inside the page (add-form stars + row stars, delete, note edit)
    view.addEventListener('click', onClick);
    // re-render when places change anywhere (map, backup restore)
    document.addEventListener('jwh:data-changed', () => { if (view.classList.contains('is-active')) render(); });
  }
}

function onClick(e) {
  const addStar = e.target.closest('#eatAdd .eat-star');
  if (addStar) { $('#eatAdd').dataset.rating = addStar.dataset.n; paintAddStars(); return; }
  const rowStar = e.target.closest('#eatsList .eat-star');
  // patchPlace is deliberately silent (calendar batches it before a dispatching saveUser) — dispatch here
  if (rowStar) { patchPlace(rowStar.dataset.id, { rating: +rowStar.dataset.n }); dispatchChanged(); return; }
  const del = e.target.closest('.eat-del');
  if (del) { confirmModal('Remove this eat?').then(ok => { if (ok) deletePlace(del.dataset.id); }); return; }   // deletePlace dispatches → re-render
  const noteBtn = e.target.closest('.eat-note');
  if (noteBtn) { editNote(noteBtn); return; }
  const sortBtn = e.target.closest('#eatsSort .es-btn');
  if (sortBtn) { sortMode = sortBtn.dataset.sort === 'best' ? 'best' : 'new'; render(); return; }
  if (e.target.closest('#eatsFirstBtn')) { $('#eatName')?.focus(); return; }   // empty state → the form is the action
}

// click-to-edit the one-liner: swap the text for an input, save on Enter/blur
function editNote(btn) {
  const id = btn.dataset.id, cur = btn.dataset.note || '';
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'eat-note-edit'; input.value = cur;
  input.setAttribute('aria-label', 'One-line note');
  btn.replaceWith(input); input.focus(); input.select();
  // commit once: Enter (or blur) saves + dispatches; the render tears the input out, firing a
  // second blur → the flag stops a double dispatch. Escape sets the flag FIRST so it truly cancels.
  let done = false;
  const commit = () => { if (done) return; done = true; patchPlace(id, { note: input.value.trim() }); dispatchChanged(); };   // patchPlace itself is silent
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') { done = true; render(); } });
  input.addEventListener('blur', commit);
}

function paintAddStars() {
  const r = +($('#eatAdd')?.dataset.rating || 0);
  $('#eatAdd')?.querySelectorAll('.eat-star').forEach((b, i) => {
    const on = i < r; b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function cardHTML(e) {
  const link = mapLink(e);
  const note = e.note
    ? `<button type="button" class="eat-note" data-id="${esc(e.id)}" data-note="${esc(e.note)}">${esc(e.note)}</button>`
    : `<button type="button" class="eat-note eat-note-empty" data-id="${esc(e.id)}" data-note="">add a note</button>`;
  const when = e.date ? `<span class="eat-date">${esc(fmtShort(e.date).toLowerCase())}</span><span aria-hidden="true">·</span>` : '';
  return `<li class="eat-card alm-card">
    <button type="button" class="eat-del" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.name)}">✕</button>
    <span class="eat-name">${esc(e.name)}</span>
    <div class="eat-stars" role="group" aria-label="Rating for ${esc(e.name)}">${starsHTML(e.rating, e.id)}</div>
    ${note}
    <p class="eat-meta">${when}<a class="eat-map" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(e.name)} in Google Maps">map ↗</a></p>
  </li>`;
}

function render() {
  const list = $('#eatsList');
  if (!list) return;
  const eats = loadEats();
  list.innerHTML = eats.length
    ? `<ul class="eat-grid">${eats.map(cardHTML).join('')}</ul>`
    : `<div class="alm-card eats-empty">
        <span class="ee-bowl" aria-hidden="true">🍜</span>
        <p class="ee-line">The year of eating well starts with one bowl.</p>
        <p class="ee-sub">Rate places as you go — a star, a one-liner, and a pin that lands on your map.</p>
        <button type="button" class="btn primary" id="eatsFirstBtn">Log your first eat</button>
      </div>`;
  // stats strip: count · average of rated entries · how many carry a real pin/link
  const stats = $('#eatsStats');
  if (stats) {
    if (!eats.length) { stats.textContent = ''; }
    else {
      const rated = eats.filter(x => (x.rating || 0) > 0);
      const avg = rated.length ? (rated.reduce((s, x) => s + x.rating, 0) / rated.length).toFixed(1) : null;
      const pinned = eats.filter(x => /^https?:\/\//i.test((x.link || '').trim()) || (Number.isFinite(x.lat) && Number.isFinite(x.lng))).length;
      stats.textContent = `${eats.length} logged${avg ? ` · ★ ${avg} avg` : ''}${pinned ? ` · ${pinned} with pins` : ''}`;
    }
  }
  const sort = $('#eatsSort');
  if (sort) {
    sort.hidden = eats.length < 2;
    sort.querySelectorAll('.es-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === sortMode)));
  }
  paintAddStars();
}
