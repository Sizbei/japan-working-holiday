'use strict';
// Themed, accessible, Promise-based dialogs replacing native prompt/confirm/alert — which
// iOS PWA/standalone suppresses (map CRUD would fail silently), block the main thread, and
// can't be themed. Focus-trapped, Esc/backdrop-cancels, restores focus to the prior element,
// aria-modal + aria-labelledby. Every dynamic string is esc()'d.

import { esc } from './dom.js';
import { openDatePicker } from '../datepicker.js';

function openDialog(innerHTML, { onMount, initialFocus } = {}) {
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
