'use strict';
// Themed, accessible, Promise-based dialogs replacing native prompt/confirm/alert — which
// iOS PWA/standalone suppresses (map CRUD would fail silently), block the main thread, and
// can't be themed. Focus-trapped, Esc/backdrop-cancels, restores focus to the prior element,
// aria-modal + aria-labelledby. Every dynamic string is esc()'d.

import { esc } from './dom.js';
import { openDatePicker } from '../datepicker.js';
import { normalizeTag } from './tags.js';

export function openDialog(innerHTML, { onMount, initialFocus } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'app-modal';
    ov.innerHTML = `<div class="app-modal-card" role="dialog" aria-modal="true" aria-labelledby="amTitle">${innerHTML}</div>`;
    document.body.appendChild(ov);
    const card = ov.querySelector('.app-modal-card');
    let settled = false;
    const done = (val) => { if (settled) return; settled = true; ov.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(val); };
    const focusables = () => [...card.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });   // backdrop cancels
    if (onMount) onMount(card, done);
    setTimeout(() => { ((initialFocus && card.querySelector(initialFocus)) || focusables()[0])?.focus(); }, 20);
  });
}

export function confirmModal(message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">${esc(message)}</h2>
    <div class="app-modal-acts">
      <button type="button" class="am-btn" data-cancel>${esc(cancel)}</button>
      <button type="button" class="am-btn am-primary${danger ? ' am-danger' : ''}" data-ok>${esc(ok)}</button>
    </div>`, {
    onMount: (card, done) => {
      card.querySelector('[data-ok]').addEventListener('click', () => done(true));
      card.querySelector('[data-cancel]').addEventListener('click', () => done(false));
    }, initialFocus: '[data-ok]',
  }).then(v => v === true);
}

export function alertModal(message, { ok = 'OK' } = {}) {
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">${esc(message)}</h2>
    <div class="app-modal-acts"><button type="button" class="am-btn am-primary" data-ok>${esc(ok)}</button></div>`, {
    onMount: (card, done) => card.querySelector('[data-ok]').addEventListener('click', () => done(true)),
    initialFocus: '[data-ok]',
  }).then(() => undefined);
}

// resolves to the entered string ('' if left empty), or null if cancelled
export function askText(label, { value = '', placeholder = '', ok = 'Save', type = 'text', min = '', max = '' } = {}) {
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">${esc(label)}</h2>
    <input class="app-modal-input" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${min ? ` min="${esc(min)}"` : ''}${max ? ` max="${esc(max)}"` : ''} aria-label="${esc(label)}">
    <div class="app-modal-acts">
      <button type="button" class="am-btn" data-cancel>Cancel</button>
      <button type="button" class="am-btn am-primary" data-ok>${esc(ok)}</button>
    </div>`, {
    onMount: (card, done) => {
      const input = card.querySelector('.app-modal-input');
      const submit = () => done(input.value.trim());
      card.querySelector('[data-ok]').addEventListener('click', submit);
      card.querySelector('[data-cancel]').addEventListener('click', () => done(null));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    }, initialFocus: '.app-modal-input',
  });
}
// Coarse-pointer / small screens get the native date input (better mobile UX); pointer/desktop
// gets the themed mini-calendar popover. Same (label, opts) → Promise<string|null> contract.
const coarsePointer = () => !!(window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 700px)').matches));
export function askDate(label, { value = '', min = '2026-01-01', max = '2027-12-31' } = {}) {
  if (coarsePointer()) return askText(label, { type: 'date', ok: 'Set', min, max, value });
  return openDatePicker({ value, min, max });
}

// Tag editor: chips for current tags (each removable) + a datalist-backed input. Resolves the new
// tag array on Done (commits any half-typed input), or null on cancel. Every tag string is esc()'d.
export function askTags(taskLabel, current = [], all = []) {
  const chip = (t) => `<span class="tagedit-chip"><span class="tagedit-t">${esc(t)}</span><button type="button" class="tagedit-x" data-rm="${esc(t)}" aria-label="Remove tag ${esc(t)}">✕</button></span>`;
  const options = (all || []).map(t => `<option value="${esc(t)}"></option>`).join('');
  const titleSuffix = taskLabel ? ` — ${esc(taskLabel)}` : '';
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">Tags${titleSuffix}</h2>
    <div class="tagedit-chips" id="tageditChips"></div>
    <input class="app-modal-input tagedit-input" id="tageditInput" list="tageditList" placeholder="Add a tag — press Enter" aria-label="Add a tag" autocomplete="off">
    <datalist id="tageditList">${options}</datalist>
    <div class="app-modal-acts">
      <button type="button" class="am-btn" data-cancel>Cancel</button>
      <button type="button" class="am-btn am-primary" data-done>Done</button>
    </div>`, {
    onMount: (card, done) => {
      let tags = (current || []).slice();
      const chipsEl = card.querySelector('#tageditChips');
      const input = card.querySelector('#tageditInput');
      const redraw = () => { chipsEl.innerHTML = tags.length ? tags.map(chip).join('') : '<span class="tagedit-empty">No tags yet</span>'; };
      const add = () => {
        const t = normalizeTag(input.value);
        input.value = '';
        if (t && !tags.includes(t)) { tags.push(t); redraw(); }
      };
      redraw();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } });
      chipsEl.addEventListener('click', (e) => {
        const x = e.target.closest('[data-rm]'); if (!x) return;
        tags = tags.filter(t => t !== x.dataset.rm); redraw();
      });
      card.querySelector('[data-done]').addEventListener('click', () => { add(); done(tags); });
      card.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    }, initialFocus: '.tagedit-input',
  });
}

// Generic content dialog: titled, focus-trapped, with a single Close button. `trustedHTML` is
// injected RAW — the caller MUST pre-esc()' every dynamic value in it (the param name flags this
// hazard). Resolves (undefined) when dismissed. Used by the rooms compare table.
export function showModal(titleText, trustedHTML, { closeLabel = 'Close', wide = false } = {}) {
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">${esc(titleText)}</h2>
    <div class="app-modal-body">${trustedHTML}</div>
    <div class="app-modal-acts"><button type="button" class="am-btn am-primary" data-ok>${esc(closeLabel)}</button></div>`, {
    onMount: (card, done) => {
      if (wide) card.classList.add('app-modal-wide');
      card.querySelector('[data-ok]').addEventListener('click', () => done(true));
    },
    initialFocus: '[data-ok]',
  }).then(() => undefined);
}

// Create / edit a custom calendar: name input + colour-swatch picker (+ Delete when editing).
// Resolves { name, color } on save, { remove: true } on delete, or null on cancel. `colors` is a
// palette of hex strings; `cal` (optional) pre-fills the fields for edit mode.
export function askCalendar(colors, cal = null) {
  const editing = !!cal;
  const cur = (cal && colors.includes(cal.color)) ? cal.color : colors[0];
  const swatches = colors.map(c => `<button type="button" class="cal-swatch${c === cur ? ' sel' : ''}" role="radio" aria-checked="${c === cur}" data-color="${esc(c)}" style="--sw:${esc(c)}" aria-label="Colour ${esc(c)}"></button>`).join('');
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">${editing ? 'Edit calendar' : 'New calendar'}</h2>
    <input class="app-modal-input" id="calNameIn" type="text" value="${esc(cal?.name || '')}" placeholder="Calendar name — e.g. Work, Anniversaries" aria-label="Calendar name" maxlength="40" autocomplete="off">
    <div class="cal-swatches" role="radiogroup" aria-label="Calendar colour">${swatches}</div>
    <div class="app-modal-acts">
      ${editing ? '<button type="button" class="am-btn am-danger" data-remove>Delete</button>' : ''}
      <button type="button" class="am-btn" data-cancel>Cancel</button>
      <button type="button" class="am-btn am-primary" data-ok>${editing ? 'Save' : 'Create'}</button>
    </div>`, {
    onMount: (card, done) => {
      let color = cur;
      const nameEl = card.querySelector('#calNameIn');
      card.querySelectorAll('.cal-swatch').forEach(b => b.addEventListener('click', () => {
        color = b.dataset.color;
        card.querySelectorAll('.cal-swatch').forEach(x => { const on = x === b; x.classList.toggle('sel', on); x.setAttribute('aria-checked', String(on)); });
      }));
      const save = () => { const n = nameEl.value.trim(); if (!n) { nameEl.focus(); return; } done({ name: n, color }); };
      card.querySelector('[data-ok]').addEventListener('click', save);
      card.querySelector('[data-cancel]').addEventListener('click', () => done(null));
      card.querySelector('[data-remove]')?.addEventListener('click', () => done({ remove: true }));
      nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    }, initialFocus: '#calNameIn',
  });
}
