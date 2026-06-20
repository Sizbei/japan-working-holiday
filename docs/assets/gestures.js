'use strict';
// Gestures & quality-of-life input: (1) swipe left/right between adjacent routes on touch,
// (2) keyboard shortcuts (number keys jump to a page, [ ] prev/next, ? help), and (3) a
// generic long-press → quick-action menu wired to calendar days, explore cards, and
// checklist rows. All framework-free, pointer-events based, reduced-motion aware.

import { ROUTES } from './router.js';
import { prefersReducedMotion } from './motion.js';
import { openMenu, closeMenu } from './lib/menu.js';

const PAGE_LABEL = {
  dashboard: 'Home', calendar: 'Calendar', deadlines: 'Deadlines', checklist: 'Checklist',
  explore: 'Explore', rooms: 'Rooms', map: 'Map', plan: 'Plan a day',
};

function currentRoute() {
  const h = String(location.hash || '').replace(/^#\/?/, '');
  return ROUTES.includes(h) ? h : 'dashboard';
}
function go(route) { if (route) location.hash = '#/' + route; }
function neighbour(dir) {
  const i = ROUTES.indexOf(currentRoute());
  const j = i + dir;
  return (j >= 0 && j < ROUTES.length) ? ROUTES[j] : null;
}

export function mountGestures() {
  wireSwipe();
  wireKeyboard();
  wireLongPress();
  document.getElementById('kbdHelp')?.addEventListener('click', () => toggleHelp());   // discoverable trigger for the ? overlay
}

/* ----------------------------------------------------------------- swipe between pages */
// Horizontal swipe on the main content moves to the adjacent route. Ignores gestures that
// begin inside something that scrolls/pans horizontally (map, agenda, chip rails, inputs).
// don't hijack horizontal drags that belong to the calendar grid, drag handles, rails, the
// map, or form fields — only the page background swipes between routes.
const NO_SWIPE = '.leaflet-container, .cal-agenda, .cal-cell, .cal-chip, .plan-days, .stop-list, .map-side, .map-slist, .dnd-handle, .dnd-movable, input, textarea, select, .modal-overlay, [data-no-swipe]';

function wireSwipe() {
  const main = document.getElementById('main');
  if (!main) return;
  let sx = 0, sy = 0, t0 = 0, tracking = false, decided = false, horizontal = false;

  const reset = () => { tracking = false; decided = false; horizontal = false; clearPeek(); };

  main.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;            // touch/pen only — mouse uses the nav/keyboard
    if (e.target.closest(NO_SWIPE)) return;
    sx = e.clientX; sy = e.clientY; t0 = e.timeStamp; tracking = true; decided = false; horizontal = false;
  });
  main.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;   // wait for intent
      decided = true;
      horizontal = Math.abs(dx) > Math.abs(dy) * 1.3;       // clearly sideways
      if (horizontal) { const a = active(); if (a) a.classList.add('swipe-peek'); }
    }
    if (!horizontal) return;
    // can we actually move that way? (no page beyond the ends) → add resistance at the edges
    const canGo = neighbour(dx < 0 ? 1 : -1) != null;
    const eased = canGo ? dx : dx * 0.25;
    peek(eased);
  });
  const finish = (e) => {
    if (!tracking) { reset(); return; }
    if (horizontal) {
      const dx = e.clientX - sx;
      const dt = Math.max(1, e.timeStamp - t0);
      const vel = Math.abs(dx) / dt;                          // px/ms
      if ((Math.abs(dx) > 70 || vel > 0.4)) {
        const target = neighbour(dx < 0 ? 1 : -1);
        if (target) { go(target); reset(); return; }
      }
    }
    reset();
  };
  main.addEventListener('pointerup', finish);
  main.addEventListener('pointercancel', () => reset());

  function active() { return document.querySelector('.view.is-active'); }
  function peek(dx) { const a = active(); if (a && !prefersReducedMotion()) a.style.transform = `translateX(${dx * 0.35}px)`; }
  function clearPeek() { const a = active(); if (a) { a.style.transform = ''; a.classList.remove('swipe-peek'); } }
}

/* --------------------------------------------------------------------- keyboard shortcuts */
function typingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typingTarget(document.activeElement)) return;
    if (document.querySelector('.modal-overlay')) return;     // let modals own the keyboard
    if (e.key >= '1' && e.key <= String(Math.min(9, ROUTES.length))) { e.preventDefault(); go(ROUTES[+e.key - 1]); return; }
    if (e.key === '[') { e.preventDefault(); go(neighbour(-1)); return; }
    if (e.key === ']') { e.preventDefault(); go(neighbour(1)); return; }
    if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
    if (e.key === 'Escape') closeHelp();
  });
}
let helpEl = null;
function toggleHelp() { helpEl ? closeHelp() : openHelp(); }
function openHelp() {
  helpEl = document.createElement('div');
  helpEl.className = 'kbd-help';
  helpEl.setAttribute('role', 'dialog'); helpEl.setAttribute('aria-modal', 'true'); helpEl.setAttribute('aria-label', 'Keyboard shortcuts');
  const rows = ROUTES.map((r, i) => `<div class="kh-row"><kbd>${i + 1}</kbd><span>${PAGE_LABEL[r] || r}</span></div>`).join('');
  helpEl.innerHTML = `<div class="kh-panel">
    <h2 class="kh-title">Keyboard shortcuts</h2>
    <div class="kh-grid">${rows}</div>
    <div class="kh-row"><kbd>[</kbd> <kbd>]</kbd><span>Previous / next page</span></div>
    <div class="kh-row"><kbd>?</kbd><span>Toggle this help</span></div>
    <p class="kh-hint">Tip: swipe left/right to change pages on a phone.</p>
    <button type="button" class="kh-close">Close</button>
  </div>`;
  document.body.appendChild(helpEl);
  helpEl.addEventListener('click', (e) => { if (e.target === helpEl || e.target.closest('.kh-close')) closeHelp(); });
  helpEl.querySelector('.kh-close')?.focus();
}
function closeHelp() { if (helpEl) { helpEl.remove(); helpEl = null; } }

/* --------------------------------------------------------------- long-press quick actions */
// Fires ~480ms after press if the finger hasn't moved far and no drag started. Opens a small
// action sheet anchored near the press. Actions either synthesize a click on an existing
// control or dispatch a CustomEvent that the owning module handles.
function wireLongPress() {
  let timer = null, startX = 0, startY = 0, fired = false;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = resolveTarget(e.target);
    if (!target) return;
    fired = false; startX = e.clientX; startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      fired = true;
      openMenu(target.items, e.clientX, e.clientY, { onClose: () => { fired = false; } });
    }, 480);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();   // a drag, not a press
  }, true);
  document.addEventListener('pointerup', () => cancel(), true);
  document.addEventListener('pointercancel', () => cancel(), true);
  // swallow the ghost click on the pressed element (so it doesn't also toggle/expand),
  // but let clicks INSIDE the menu through so its actions still run.
  document.addEventListener('click', (e) => {
    if (fired && !e.target.closest('.lp-menu')) { e.preventDefault(); e.stopPropagation(); fired = false; }
  }, true);
}

// Map a pressed element to its quick-action target + items.
function resolveTarget(node) {
  const cell = node.closest?.('.cal-cell[data-day]');
  if (cell) {
    const date = cell.dataset.day;
    return { items: [
      { label: '➕ Add event', run: () => document.dispatchEvent(new CustomEvent('jwh:cal-quickadd', { detail: { date } })) },
      { label: '🗺 Plan this day', run: () => { document.dispatchEvent(new CustomEvent('jwh:plan-goto', { detail: { date } })); location.hash = '#/plan'; } },
    ] };
  }
  const star = node.closest?.('#restaurantsGrid .card2, .card2:has(.tabetai-star)');
  if (star && star.querySelector('.tabetai-star')) {
    const btn = star.querySelector('.tabetai-star');
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    return { items: [
      { label: pressed ? '☆ Remove from Tabetai' : '★ Want to eat (Tabetai)', run: () => btn.click() },
      { label: 'ℹ️ Open details', run: () => star.classList.contains('collapsible') && star.click() },
    ] };
  }
  const ci = node.closest?.('.check-item[data-id]');
  if (ci) {
    const cb = ci.querySelector('input[type=checkbox]'), due = ci.querySelector('.ci-due');
    const items = [];
    if (cb && !cb.disabled) items.push({ label: cb.checked ? '☐ Mark not done' : '☑ Mark done', run: () => cb.click() });
    if (due) items.push({ label: '📅 Set due date', run: () => due.click() });
    if (items.length) return { items };
  }
  return null;
}
