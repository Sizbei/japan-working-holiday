'use strict';
// Gestures & quality-of-life input: (1) swipe left/right between adjacent routes on touch,
// (2) keyboard shortcuts (number keys jump to a page, [ ] prev/next, ? help), and (3) a
// generic long-press → quick-action menu wired to calendar days, explore cards, and
// checklist rows. All framework-free, pointer-events based, reduced-motion aware.

import { ROUTES } from './router.js';
import { prefersReducedMotion } from './motion.js';
import { openMenu } from './lib/menu.js';
import { getEventMenu, undoLastDelete } from './calendar.js';
import { openPalette } from './palette.js';
import { ensureRoute } from './lazyroutes.js';

const PAGE_LABEL = {
  dashboard: 'Home', calendar: 'Calendar', going: 'Going To', people: 'People', deadlines: 'Deadlines', checklist: 'Checklist',
  packing: 'Packing', budget: 'Budget', phrases: 'Phrases', explore: 'Explore', rooms: 'Rooms', map: 'Map', plan: 'Plan a day', emergency: 'Emergency',
};

function currentRoute() {
  const h = String(location.hash || '').replace(/^#\/?/, '');
  return ROUTES.includes(h) ? h : 'dashboard';
}
// the VISIBLE nav order (user-customizable via ⚙ Settings) drives swipe + number shortcuts, so they
// match what's on screen. Falls back to the canonical ROUTES when the nav isn't rendered yet.
function visibleRoutes() {
  const nav = document.getElementById('routeNav');
  const rs = nav ? [...nav.querySelectorAll('a[data-route]')].map(a => a.dataset.route).filter(Boolean) : [];
  return rs.length ? rs : ROUTES;
}
function go(route) { if (route) location.hash = '#/' + route; }
function neighbour(dir) {
  const vr = visibleRoutes();
  const i = vr.indexOf(currentRoute());
  if (i < 0) return null;   // current page is hidden from the nav (deep-linked) — no swipe neighbour
  const j = i + dir;
  return (j >= 0 && j < vr.length) ? vr[j] : null;
}

export function mountGestures() {
  wireSwipe();
  wireKeyboard();
  wireLongPress();
  wireNavDrawer();
  document.getElementById('kbdHelp')?.addEventListener('click', () => toggleHelp());   // discoverable trigger for the ? overlay
}

/* ------------------------------------------------------------- mobile hamburger nav drawer */
function wireNavDrawer() {
  const btn = document.getElementById('navToggle');
  const nav = document.getElementById('routeNav');
  const backdrop = document.getElementById('navBackdrop');
  if (!btn || !nav || !backdrop) return;
  let lockY = 0;
  const set = (open) => {
    nav.classList.toggle('open', open);
    backdrop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('nav-open', open);   // lock body scroll while open
    // iOS Safari ignores overflow:hidden on html for touch scrolling — pin the body instead
    if (open) { lockY = window.scrollY; document.body.style.position = 'fixed'; document.body.style.top = `-${lockY}px`; document.body.style.left = '0'; document.body.style.right = '0'; }
    else { document.body.style.position = ''; document.body.style.top = ''; document.body.style.left = ''; document.body.style.right = ''; window.scrollTo({ top: lockY, behavior: 'auto' }); }
    if (open) nav.querySelector('a[aria-current="page"], a')?.focus();
    else btn.focus();
  };
  btn.addEventListener('click', () => set(!nav.classList.contains('open')));
  document.getElementById('navClose')?.addEventListener('click', () => set(false));
  backdrop.addEventListener('click', () => set(false));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });   // pick a route → close
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) set(false); });
  document.addEventListener('jwh:route', () => { if (nav.classList.contains('open')) set(false); });
  // Crossing to desktop (rotate / resize / split-view) with the drawer OPEN would strand the body
  // pin + backdrop once compact's relocateNav teleports the nav into the topbar — force-close on
  // the transition so all four state bits (class, nav-open, body pin, backdrop) reset together.
  window.matchMedia('(min-width: 821px)').addEventListener('change', (e) => { if (e.matches && nav.classList.contains('open')) set(false); });
  // trap Tab inside the open drawer — otherwise focus escapes behind the scrim while the
  // page is scroll-locked (no-op on desktop, where .open is never set)
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !nav.classList.contains('open')) return;
    const f = [...nav.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ----------------------------------------------------------------- swipe between pages */
// Horizontal swipe on the main content moves to the adjacent route. Ignores gestures that
// begin inside something that scrolls/pans horizontally (map, agenda, chip rails, inputs).
// don't hijack horizontal drags that belong to the calendar grid, drag handles, rails, the
// map, or form fields — only the page background swipes between routes.
const NO_SWIPE = '.ank-cardwrap, .leaflet-container, .cal-agenda, .cal-cell, .cal-chip, .wk2-scroll, .wk2-inner, .wk2-col, .wk2-band, .wk2-head, .plan-days, .stop-list, .map-side, .map-slist, .dnd-handle, .dnd-movable, input, textarea, select, .modal-overlay, [data-no-swipe]';

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
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {  // command palette (Ctrl/Cmd+K)
      if (e.isComposing) return;                                // don't fight an IME
      if (document.querySelector('.cmdk-overlay')) return;      // single instance
      if (document.querySelector('[aria-modal="true"]')) return;   // an open dialog owns the keyboard
      e.preventDefault(); openPalette(); return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {  // undo (Ctrl/Cmd+Z)
      if (e.isComposing) return;                                // don't fight an IME
      if (typingTarget(document.activeElement)) return;         // native undo in a text field
      if (document.querySelector('[aria-modal="true"]')) return;   // a dialog owns the keyboard (editor, confirm, datepicker, palette)
      if (undoLastDelete()) e.preventDefault();                 // only swallow the key if we actually undid
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typingTarget(document.activeElement)) return;
    if (e.key === 'Escape') { closeHelp(); return; }
    // ? still toggles the help over itself; every OTHER open dialog blocks all shortcuts
    // (was '.modal-overlay' only — confirm dialogs/datepickers/palette let 1-9 navigate underneath)
    const modal = document.querySelector('[aria-modal="true"]');
    if (e.key === '?' && (!modal || modal.classList.contains('kbd-help'))) { e.preventDefault(); toggleHelp(); return; }
    if (modal) return;
    if (e.key === '/' && !document.querySelector('.cmdk-overlay')) { e.preventDefault(); openPalette(); return; }
    if (e.key >= '1' && e.key <= '9') { const vr = visibleRoutes(); const idx = +e.key - 1; if (idx < vr.length) { e.preventDefault(); go(vr[idx]); } return; }
    if (e.key === '[') { e.preventDefault(); go(neighbour(-1)); return; }
    if (e.key === ']') { e.preventDefault(); go(neighbour(1)); return; }
    // common utility shortcuts — keys unused by the calendar (m/w/d/a/n/t) + checklist (j/k/d/p/e) layers
    if (e.key === '0') { e.preventDefault(); go('emergency'); return; }        // 0 = Emergency, always (11 routes; 1-9 cover the first nine)
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); document.getElementById('notifBell')?.click(); return; }   // notifications
    if (e.key === '\\') { e.preventDefault(); document.getElementById('themeToggle')?.click(); return; }                 // light/dark
    if (e.key === ',') { e.preventDefault(); document.getElementById('guideBtn')?.click(); return; }                     // guide & settings (⌘, convention)
  });
}
let helpEl = null, helpReturnFocus = null;
function toggleHelp() { helpEl ? closeHelp() : openHelp(); }
function openHelp() {
  helpReturnFocus = document.activeElement;   // restore focus to the ?-trigger on close
  helpEl = document.createElement('div');
  helpEl.className = 'kbd-help';
  helpEl.setAttribute('role', 'dialog'); helpEl.setAttribute('aria-modal', 'true'); helpEl.setAttribute('aria-label', 'Keyboard shortcuts');
  const rows = visibleRoutes().slice(0, 9).map((r, i) => `<div class="kh-row"><kbd>${i + 1}</kbd><span>${PAGE_LABEL[r] || r}</span></div>`).join('');   // 1–9 follow the VISIBLE nav order (same as the shortcut); the rest are reachable via ⌘K (below)
  helpEl.innerHTML = `<div class="kh-panel">
    <h2 class="kh-title">Keyboard shortcuts</h2>
    <div class="kh-grid">${rows}</div>
    <div class="kh-row"><kbd>[</kbd> <kbd>]</kbd><span>Previous / next page</span></div>
    <div class="kh-row"><kbd>0</kbd><span>Emergency page</span></div>
    <div class="kh-row"><kbd>b</kbd><span>Notifications</span></div>
    <div class="kh-row"><kbd>\\</kbd><span>Light / dark theme</span></div>
    <div class="kh-row"><kbd>,</kbd><span>Guide &amp; settings</span></div>
    <div class="kh-row"><kbd>⌘K</kbd> <kbd>/</kbd><span>Jump anywhere + search everything (command palette)</span></div>
    <div class="kh-row"><kbd>⌘Z</kbd> <kbd>Ctrl+Z</kbd><span>Undo the last calendar delete</span></div>
    <p class="kh-sub">On the calendar</p>
    <div class="kh-row"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd><span>Move between days (month view)</span></div>
    <div class="kh-row"><kbd>⇧←</kbd> <kbd>⇧→</kbd><span>Previous / next month (or week)</span></div>
    <div class="kh-row"><kbd>m</kbd> <kbd>w</kbd> <kbd>d</kbd> <kbd>a</kbd><span>Switch to Month / Week / Day / Agenda</span></div>
    <div class="kh-row"><kbd>n</kbd><span>New event on the focused day</span></div>
    <div class="kh-row"><kbd>−</kbd> <kbd>Del</kbd><span>Remove the focused / open event</span></div>
    <div class="kh-row"><kbd>t</kbd><span>Jump to today</span></div>
    <div class="kh-row"><span class="kh-tip">Quick-add box: type <em>"Ramen with Kenji Fri 7pm"</em> → an event</span></div>
    <p class="kh-sub">On the checklist</p>
    <div class="kh-row"><kbd>↑</kbd><kbd>↓</kbd> <kbd>j</kbd><kbd>k</kbd><span>Move between tasks</span></div>
    <div class="kh-row"><kbd>Space</kbd><span>Tick / untick the focused task</span></div>
    <div class="kh-row"><kbd>d</kbd><span>Set a due date</span></div>
    <div class="kh-row"><kbd>p</kbd><span>Cycle priority (P1→P4)</span></div>
    <div class="kh-row"><kbd>e</kbd> <kbd>−</kbd><span>Edit / remove your own task</span></div>
    <div class="kh-row"><kbd>?</kbd><span>Toggle this help</span></div>
    <p class="kh-hint">Tap 🔍 on the Checklist & Packing pages to filter those lists. Long-press a calendar event, checklist or packing item for quick actions. Swipe left/right to change pages on a phone.</p>
    <button type="button" class="kh-close">Close</button>
  </div>`;
  document.body.appendChild(helpEl);
  helpEl.addEventListener('click', (e) => { if (e.target === helpEl || e.target.closest('.kh-close')) closeHelp(); });
  // aria-modal promises an inert background — keep Tab inside (Close is the only focusable)
  helpEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); helpEl.querySelector('.kh-close')?.focus(); }
  });
  helpEl.querySelector('.kh-close')?.focus();
}
function closeHelp() {
  if (!helpEl) return;
  helpEl.remove(); helpEl = null;
  if (helpReturnFocus?.isConnected) helpReturnFocus.focus();   // don't drop keyboard focus to <body>
  helpReturnFocus = null;
}

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
  const evItems = getEventMenu(node);        // an event chip/row/popover/deadline → its menu
  if (evItems) return { items: evItems };    // MUST precede the cell check: a chip is inside a day cell
  const cell = node.closest?.('.cal-cell[data-day]');
  if (cell) {
    const date = cell.dataset.day;
    return { items: [
      { label: '➕ Add event', run: () => document.dispatchEvent(new CustomEvent('jwh:cal-quickadd', { detail: { date } })) },
      // EF6: #/plan is lazy — navigate first, then await its mount before dispatching, or plan's
      // jwh:plan-goto listener isn't attached yet (and the old order dispatched BEFORE the hash change).
      { label: '🗺 Plan this day', run: () => { location.hash = '#/plan'; ensureRoute('plan').then(() => document.dispatchEvent(new CustomEvent('jwh:plan-goto', { detail: { date } }))); } },
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
  const pi = node.closest?.('.pack-item[data-id]');
  if (pi) {
    const cb = pi.querySelector('input[type=checkbox]'), del = pi.querySelector('.pack-del');
    const items = [];
    if (cb) items.push({ label: cb.checked ? '☐ Mark unpacked' : '☑ Mark packed', run: () => cb.click() });
    if (del) items.push({ label: '✕ Remove', run: () => del.click() });
    if (items.length) return { items };
  }
  return null;
}
