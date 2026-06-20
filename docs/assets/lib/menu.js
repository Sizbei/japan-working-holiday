'use strict';
// Self-contained context-menu widget: an action sheet at a point or anchored to an element, with
// arrow-key nav, on-screen flip, and outside/scroll/resize/route close. Knows nothing about
// long-press or events — callers pass items [{label, run, danger?, sep?}] and options.
// opts: { anchor?: Element, onClose?: fn, label?: string }.

import { esc } from './dom.js';

let menuEl = null, onCloseCb = null, restoreEl = null;

export function closeMenu() {
  if (!menuEl) return;
  menuEl.remove(); menuEl = null;
  document.removeEventListener('pointerdown', onAway, true);
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('resize', closeMenu);
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('jwh:route', closeMenu);
  const cb = onCloseCb; onCloseCb = null;
  const r = restoreEl; restoreEl = null;
  cb?.();
  r?.focus?.();   // restore focus to the trigger (only set for keyboard-open / Escape paths)
}
function onAway(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function onKey(e) {
  if (!menuEl) return;
  if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...menuEl.querySelectorAll('.lp-item')];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement);
  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next]?.focus();
}

export function openMenu(items, x, y, opts = {}) {
  closeMenu();
  onCloseCb = opts.onClose || null;
  restoreEl = opts.anchor || null;   // keyboard-open restores focus to the anchor; pointer-open does not
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch {} }
  menuEl = document.createElement('div');
  menuEl.className = 'lp-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.setAttribute('aria-label', opts.label || 'Actions');
  menuEl.innerHTML = items.map((it, i) => it.sep
    ? '<div class="lp-sep" role="separator"></div>'
    : `<button type="button" class="lp-item${it.danger ? ' lp-item-danger' : ''}" role="menuitem" data-i="${i}">${esc(it.label)}</button>`
  ).join('');
  document.body.appendChild(menuEl);
  // position: at the point, or below the anchor; flip to stay on-screen
  let px = x, py = y;
  if (opts.anchor) { const r = opts.anchor.getBoundingClientRect(); px = r.left; py = r.bottom + 4; }
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  let left = Math.min(px, window.innerWidth - w - 10);
  let top = py + 8; if (top + h > window.innerHeight - 10) top = py - h - 8;
  menuEl.style.left = Math.max(10, left) + 'px';
  menuEl.style.top = Math.max(10, top) + 'px';
  menuEl.addEventListener('click', (e) => {
    const b = e.target.closest('.lp-item'); if (!b) return;
    const it = items[+b.dataset.i];
    restoreEl = null;            // an explicit action shouldn't yank focus back to a possibly-destroyed trigger
    closeMenu();
    it?.run?.();
  });
  setTimeout(() => {
    document.addEventListener('pointerdown', onAway, true);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('jwh:route', closeMenu);
    menuEl.querySelector('.lp-item')?.focus();
  }, 0);
}
