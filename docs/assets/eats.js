'use strict';
// Eats (#/eats) — a dead-simple food-rating log. Each entry is a Place with source:'eat'
// (rating 1–5, the one-liner in `note`, an optional Google Maps `link`, visited:true), so it
// reuses the places store AND can pin on the Map when it has coords. Renders lazily on first visit.

import { $, esc } from './lib/dom.js';
import { loadPlaces, upsertPlace, patchPlace, deletePlace } from './lib/places.js';
import { nowISO } from './lib/dates.js';
import { confirmModal } from './lib/modal.js';

let wired = false;

const isEat = (p) => p && p.source === 'eat';
// newest first (by date added, then id which encodes the timestamp)
function loadEats() {
  return loadPlaces().filter(isEat).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
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
  if (rowStar) { patchPlace(rowStar.dataset.id, { rating: +rowStar.dataset.n }); return; }   // patch → dispatch → render
  const del = e.target.closest('.eat-del');
  if (del) { confirmModal('Remove this eat?').then(ok => { if (ok) deletePlace(del.dataset.id); }); return; }   // deletePlace dispatches → re-render
  const noteBtn = e.target.closest('.eat-note');
  if (noteBtn) { editNote(noteBtn); return; }
}

// click-to-edit the one-liner: swap the text for an input, save on Enter/blur
function editNote(btn) {
  const id = btn.dataset.id, cur = btn.dataset.note || '';
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'eat-note-edit'; input.value = cur;
  input.setAttribute('aria-label', 'One-line note');
  btn.replaceWith(input); input.focus(); input.select();
  const commit = () => { patchPlace(id, { note: input.value.trim() }); };   // dispatch → full re-render restores the row
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') render(); });
  input.addEventListener('blur', commit);
}

function paintAddStars() {
  const r = +($('#eatAdd')?.dataset.rating || 0);
  $('#eatAdd')?.querySelectorAll('.eat-star').forEach((b, i) => {
    const on = i < r; b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function rowHTML(e) {
  const link = mapLink(e);
  const note = e.note
    ? `<button type="button" class="eat-note" data-id="${esc(e.id)}" data-note="${esc(e.note)}">${esc(e.note)}</button>`
    : `<button type="button" class="eat-note eat-note-empty" data-id="${esc(e.id)}" data-note="">add a note</button>`;
  return `<li class="eat-row">
    <div class="eat-stars" role="group" aria-label="Rating for ${esc(e.name)}">${starsHTML(e.rating, e.id)}</div>
    <div class="eat-main"><span class="eat-name">${esc(e.name)}</span>${note}</div>
    <a class="eat-map" href="${esc(link)}" target="_blank" rel="noopener noreferrer" title="Open in Google Maps" aria-label="Open ${esc(e.name)} in Google Maps">📍</a>
    <button type="button" class="eat-del" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.name)}">×</button>
  </li>`;
}

function render() {
  const list = $('#eatsList');
  if (!list) return;
  const eats = loadEats();
  list.innerHTML = eats.length
    ? `<ul class="eat-ul">${eats.map(rowHTML).join('')}</ul>`
    : `<p class="eat-empty">No eats yet — add the first one above. ⭐</p>`;
  const count = $('#eatsCount');
  if (count) count.textContent = eats.length ? `${eats.length} logged` : '';
  paintAddStars();
}
