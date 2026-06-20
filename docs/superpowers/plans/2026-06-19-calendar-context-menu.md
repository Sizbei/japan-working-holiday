# Calendar Right-Click Context Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click / long-press / keyboard-open a context menu on calendar events, with per-type actions, reusing one shared menu widget.

**Architecture:** Extract the existing `gestures.js` long-press menu into a self-contained `lib/menu.js` widget (used by both gestures and calendar). A pure `lib/calevents.js` holds the per-type item spec + the duplicate builder (unit-tested). `calendar.js` lifts its inline modal handlers into shared functions, wires a document-level `contextmenu` + keyboard-open, and exports `getEventMenu(node)`. `gestures.js` resolves an event **before** the day cell.

**Tech Stack:** Vanilla ES modules, no build. Tests: `node --test` (zero deps). Spec: `specs/2026-06-19-calendar-context-menu.md`.

**Branch:** `feat/calendar-context-menu` (already checked out; spec committed there).

---

## File Structure

- **Create** `docs/assets/lib/calevents.js` — pure: `duplicateUserEvent(ev, newId)`, `eventMenuSpec(ev, { isGoing })`.
- **Create** `tests/calevents.test.mjs` — unit tests for the above.
- **Create** `docs/assets/lib/menu.js` — self-contained menu widget (`openMenu`/`closeMenu`).
- **Modify** `docs/assets/gestures.js` — import shared menu; remove inline `openMenu`; `resolveTarget` event branch first.
- **Modify** `docs/assets/calendar.js` — shared handlers, `getEventMenu`/`eventMenuItems`, `contextmenu` + keyboard-open wiring, modal-handler rewire.
- **Modify** `docs/assets/style.css` — `.lp-item-danger`, `.lp-sep`.
- **Modify** `docs/sw.js` — precache the 2 new lib files, bump `CACHE`.

---

## Task 1: Pure `lib/calevents.js` + tests (TDD)

**Files:**
- Create: `docs/assets/lib/calevents.js`
- Create: `tests/calevents.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/calevents.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { duplicateUserEvent, eventMenuSpec } from '../docs/assets/lib/calevents.js';

test('duplicateUserEvent: copies fields with new id + copyOf, no input mutation', () => {
  const ev = { id: 'u1', title: 'Gig', date: '2026-07-01', endDate: '', category: 'music', note: 'n', area: 'Shibuya', source: 'user' };
  const copy = duplicateUserEvent(ev, 'u2');
  assert.equal(copy.id, 'u2');
  assert.equal(copy.copyOf, 'u1');
  assert.equal(copy.title, 'Gig');
  assert.equal(copy.date, '2026-07-01');
  assert.equal(copy.category, 'music');
  assert.equal(copy.area, 'Shibuya');
  assert.equal(ev.id, 'u1');               // input untouched
  assert.ok(!('copyOf' in ev));
});

test('eventMenuSpec: user event → edit/duplicate/plan/gcal/going + sep + delete(danger)', () => {
  const spec = eventMenuSpec({ id: 'u1', source: 'user' }, { isGoing: true });
  assert.deepEqual(spec.filter(i => i.key).map(i => i.key), ['edit', 'duplicate', 'plan', 'gcal', 'going', 'delete']);
  assert.ok(spec.some(i => i.sep));
  assert.equal(spec.find(i => i.key === 'delete').danger, true);
  assert.equal(spec.find(i => i.key === 'going').label, '✓ Going');
});

test('eventMenuSpec: baked event → open/plan/gcal/copy/going, no edit/delete/duplicate', () => {
  const spec = eventMenuSpec({ id: 'b1', source: 'baked' }, { isGoing: false });
  const keys = spec.filter(i => i.key).map(i => i.key);
  assert.deepEqual(keys, ['open', 'plan', 'gcal', 'copy', 'going']);
  assert.equal(spec.find(i => i.key === 'going').label, '＋ Going');
});
```

- [ ] **Step 2: Run it — expect RED**

Run: `node --test tests/calevents.test.mjs`
Expected: FAIL — `Cannot find module '../docs/assets/lib/calevents.js'`.

- [ ] **Step 3: Implement the module**

Create `docs/assets/lib/calevents.js`:

```js
'use strict';
// Pure helpers for the calendar event context menu (testable in Node, no DOM):
//  - duplicateUserEvent: build a copy of a user event with a caller-supplied id.
//  - eventMenuSpec: the ordered menu item list for an event, as plain data (no callbacks).
//    `key` is an action id that calendar.js maps to a handler. Baked events get a read-only set.

export function duplicateUserEvent(ev, newId) {
  return {
    id: newId,
    title: ev.title,
    date: ev.date,
    endDate: ev.endDate || '',
    category: ev.category || 'personal',
    note: ev.note || '',
    area: ev.area || '',
    copyOf: ev.id,
  };
}

export function eventMenuSpec(ev, { isGoing = false } = {}) {
  const going = { key: 'going', label: isGoing ? '✓ Going' : '＋ Going' };
  if (ev.source === 'user') {
    return [
      { key: 'edit', label: 'Edit' },
      { key: 'duplicate', label: 'Duplicate' },
      { key: 'plan', label: '＋ Add to day plan' },
      { key: 'gcal', label: '＋ Google Calendar' },
      going,
      { sep: true },
      { key: 'delete', label: 'Delete', danger: true },
    ];
  }
  return [
    { key: 'open', label: 'Open details' },
    { key: 'plan', label: '＋ Add to day plan' },
    { key: 'gcal', label: '＋ Google Calendar' },
    { key: 'copy', label: 'Copy to my events' },
    going,
  ];
}
```

- [ ] **Step 4: Run it — expect GREEN**

Run: `node --test tests/calevents.test.mjs`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add docs/assets/lib/calevents.js tests/calevents.test.mjs
git commit -m "feat: pure lib/calevents.js (duplicate builder + per-type menu spec) + tests"
```

---

## Task 2: Extract the shared menu widget `lib/menu.js`

**Files:**
- Create: `docs/assets/lib/menu.js`
- Modify: `docs/assets/gestures.js:186-208` (remove inline menu), `:189`/`:141` (call site), `:7-8` (imports)

- [ ] **Step 1: Create `docs/assets/lib/menu.js`**

```js
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
```

- [ ] **Step 2: Point gestures.js at the shared widget**

In `docs/assets/gestures.js`, add to the imports (after line 8):

```js
import { openMenu, closeMenu } from './lib/menu.js';
```

Delete the inline menu block — the `let menuEl = null;` line and the `closeMenu`/`onAway`/`openMenu` functions (currently lines 186-208). Then update the long-press call site (currently line 141) to pass the `onClose` reset:

```js
      openMenu(target.items, e.clientX, e.clientY, { onClose: () => { fired = false; } });
```

- [ ] **Step 3: Parse-check both files**

Run: `node --check docs/assets/lib/menu.js && node --check docs/assets/gestures.js`
Expected: exit 0, no output.

- [ ] **Step 4: Confirm no leftover inline menu**

Run: `grep -n "function openMenu\|function onAway\|let menuEl" docs/assets/gestures.js`
Expected: no output (all moved to lib/menu.js).

- [ ] **Step 5: Commit**

```bash
git add docs/assets/lib/menu.js docs/assets/gestures.js
git commit -m "refactor: extract shared lib/menu.js widget (danger/sep, arrow-nav, anchor, route-close)"
```

---

## Task 3: Shared event handlers + `getEventMenu` in calendar.js

**Files:**
- Modify: `docs/assets/calendar.js` (imports; new shared functions; `eventMenuItems`/`getEventMenu`; rewire modal handlers)

- [ ] **Step 1: Import the pure helpers**

In `docs/assets/calendar.js`, add after line 17 (`import { makeMovable } from './dnd.js';`):

```js
import { duplicateUserEvent, eventMenuSpec } from './lib/calevents.js';
```

- [ ] **Step 2: Add the shared mutation/action functions**

Add these near the other helpers (e.g. just below `openDetail`'s definition). They each cause exactly one `jwh:data-changed` dispatch via the underlying save (`saveUser`/`upsertStop`/`toggleGoing`) — do **not** add a redundant `changed()`:

```js
// ---- shared event actions (used by both the modal handlers and the context menu) ----
function toggleGoingEv(ev) { toggleGoing(ev.id); }                     // toggleGoing dispatches
function addEventToPlan(ev) {
  const c = approxCoord(DATA.areaGeo, ev.area || '', ev.title);
  upsertStop(ev.date.slice(0, 10), newStop({ name: ev.title, area: ev.area || '', lat: c.lat, lng: c.lng, coordKind: 'approx', seed: Math.random() }));   // upsertStop → dispatch
  alertModal(`Added “${ev.title}” to your plan for ${fmtDate(ev.date)}.`);
}
function copyBakedToUser(ev) {
  saveUser([...loadUser(), { id: 'u' + Date.now(), title: ev.title, date: ev.date.slice(0, 10), endDate: (ev.endDate || '').slice(0, 10), category: ev.category || 'personal', note: ev.bookingNotes || ev.why || '', area: ev.area || '', bookBy: ev.bookBy || '', copyOf: ev.id }]);
}
function deleteUserEvent(id) {
  const linked = loadPlaces().find(p => p.eventId === id);     // clear the back-ref on any place that linked this event
  if (linked) patchPlace(linked.id, { eventId: '', date: '', remindDate: '' });
  saveUser(loadUser().filter(x => x.id !== id));               // saveUser dispatches once
}
function focusAdd() { $('#calAdd')?.focus(); }                 // after a mutating menu action, render destroys the trigger

// Map an event object to concrete menu items (label + run). Spec (labels/order/danger) is pure (lib/calevents).
function eventMenuItems(ev) {
  const RUN = {
    open: () => openDetail(ev),
    edit: () => openModal(ev),
    duplicate: () => { saveUser([...loadUser(), duplicateUserEvent(ev, 'u' + Date.now())]); focusAdd(); },
    plan: () => addEventToPlan(ev),
    gcal: () => window.open(gcalUrl(ev), '_blank', 'noopener'),
    going: () => { toggleGoingEv(ev); focusAdd(); },
    copy: () => { copyBakedToUser(ev); focusAdd(); },
    delete: () => { deleteUserEvent(ev.id); focusAdd(); },
  };
  return eventMenuSpec(ev, { isGoing: isGoing(ev.id) }).map(it => it.sep ? { sep: true } : { label: it.label, danger: it.danger, run: RUN[it.key] });
}

// Resolve a DOM node to event menu items, or null if it's not an event trigger. Exported for gestures.js.
export function getEventMenu(node) {
  const trig = node?.closest?.('.cal-chip[data-ev], .agenda-title[data-ev], .agenda-row[data-ev], .pop-open[data-ev], .cp-deadline[data-ev]');
  if (!trig) return null;
  const ev = allEvents().find(x => x.id === trig.dataset.ev);
  return ev ? eventMenuItems(ev) : null;
}
```

- [ ] **Step 3: Rewire the modal handlers to the shared functions (DRY)**

These are surgical swaps — same behavior, less duplication. In `openDetail` (~line 359-369):

```js
  ov.querySelector('#mdGoing')?.addEventListener('click', () => { toggleGoingEv(ev); closeModal(ov, { rerender: true }); });
  ov.querySelector('#mdReset')?.addEventListener('click', () => { const { [ev.id]: _drop, ...o } = loadOverrides(); saveOverrides(o); closeModal(ov, { rerender: true }); });
  ov.querySelector('#mdPlan')?.addEventListener('click', () => { addEventToPlan(ev); closeModal(ov, { rerender: true }); });
  ov.querySelector('#mdCopy')?.addEventListener('click', () => { copyBakedToUser(ev); closeModal(ov, { rerender: true }); });
```

(The `#mdReset` handler is unchanged — Reset isn't in the menu.) In `openModal`, replace the `#mdGoingU` and `#mdDel` handlers (~line 403, 416-421):

```js
  ov.querySelector('#mdGoingU')?.addEventListener('click', () => { toggleGoingEv(ev); closeModal(ov, { rerender: true }); });
```
```js
  ov.querySelector('#mdDel')?.addEventListener('click', () => { deleteUserEvent(ev.id); closeModal(ov, { rerender: true }); });
```

- [ ] **Step 4: Parse-check**

Run: `node --check docs/assets/calendar.js`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs/assets/calendar.js
git commit -m "refactor: extract shared calendar event actions + getEventMenu/eventMenuItems"
```

---

## Task 4: Wire contextmenu + keyboard-open in calendar.js

**Files:**
- Modify: `docs/assets/calendar.js` (import `openMenu`; add listeners in `mountCalendar`)

- [ ] **Step 1: Import the menu widget**

Add after the calevents import (Task 3 Step 1):

```js
import { openMenu } from './lib/menu.js';
```

- [ ] **Step 2: Add the listeners inside `mountCalendar`**

At the end of `mountCalendar(data, today)` (after the existing wiring), add:

```js
  // right-click an event → context menu (delegated on document: the day popover lives on <body>,
  // outside #calView, so a view-scoped listener would miss its .pop-open events).
  document.addEventListener('contextmenu', (e) => {
    const items = getEventMenu(e.target);
    if (!items) return;                       // not an event → native menu
    e.preventDefault();
    openMenu(items, e.clientX, e.clientY, { label: 'Event actions' });
  });
  // keyboard: ContextMenu key / Shift+F10 on a focused event trigger opens the menu anchored to it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
    const items = getEventMenu(document.activeElement);
    if (!items) return;                       // focus isn't on an event trigger (so inputs are naturally excluded)
    e.preventDefault();
    openMenu(items, 0, 0, { anchor: document.activeElement, label: 'Event actions' });
  });
```

- [ ] **Step 3: Parse-check**

Run: `node --check docs/assets/calendar.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/calendar.js
git commit -m "feat: right-click + keyboard-open context menu on calendar events"
```

---

## Task 5: gestures.js — event branch before the day cell

**Files:**
- Modify: `docs/assets/gestures.js` (import `getEventMenu`; `resolveTarget`)

- [ ] **Step 1: Import getEventMenu**

Add to gestures.js imports:

```js
import { getEventMenu } from './calendar.js';
```

- [ ] **Step 2: Insert the event branch FIRST in `resolveTarget`**

At the very top of `resolveTarget(node)` (before the `.cal-cell[data-day]` lookup), add:

```js
  const evItems = getEventMenu(node);        // an event chip/row/popover/deadline → its menu
  if (evItems) return { items: evItems };    // MUST precede the cell check: a chip is inside a day cell
```

This ordering is required: a `.cal-chip` is a descendant of `.cal-cell[data-day]`, so checking the cell first would swallow the event long-press.

- [ ] **Step 3: Parse-check**

Run: `node --check docs/assets/gestures.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/gestures.js
git commit -m "feat: long-press an event opens the event menu (event resolves before day cell)"
```

---

## Task 6: CSS for danger item + separator

**Files:**
- Modify: `docs/assets/style.css` (near the existing `.lp-menu`/`.lp-item` rules)

- [ ] **Step 1: Add the rules**

Find the `.lp-item` rule in `style.css` and add after it:

```css
.lp-sep { height: 1px; margin: 4px 8px; background: var(--line); }
.lp-item-danger { color: var(--red); }
.lp-item-danger:hover, .lp-item-danger:focus-visible { background: color-mix(in srgb, var(--red) 12%, transparent); }
```

(Uses the existing `--line` and `--red` tokens.)

- [ ] **Step 2: Commit**

```bash
git add docs/assets/style.css
git commit -m "style: destructive menu item + separator for the event context menu"
```

---

## Task 7: Service worker

**Files:**
- Modify: `docs/sw.js:5` (CACHE), `:11` (lib list)

- [ ] **Step 1: Bump CACHE and precache the new lib files**

In `docs/sw.js`: change `const CACHE = 'jwh-v64';` to `const CACHE = 'jwh-v65';`. In the `ASSETS` array, add `'assets/lib/menu.js'` and `'assets/lib/calevents.js'` (alongside the other `assets/lib/*.js`).

- [ ] **Step 2: Parse-check**

Run: `node --check docs/sw.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/sw.js
git commit -m "chore: precache lib/menu.js + lib/calevents.js (sw jwh-v65)"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `node --test tests/lib.test.mjs tests/i18n.test.mjs tests/calevents.test.mjs`
Expected: all green.

- [ ] **Step 2: Serve + browser-verify**

```bash
cd docs && python3 -m http.server 8012
```
At `http://localhost:8012/?v=1#/calendar` (set `localStorage['jwh-auth-v1']='ok'`), verify:
- **Right-click a baked event** (a researched chip) → menu shows Open details · Add to day plan · Google Calendar · Copy to my events · Going. No Edit/Delete.
- **Right-click a user event** (add one via + Add) → Edit · Duplicate · Add to day plan · Google Calendar · Going · separator · **Delete** (red). Delete removes it and the grid repaints once (no flicker/double-render).
- **Duplicate** a user event → a copy appears on the grid (no editor pops open); the original remains.
- **Left-click** an event still opens the modal (unchanged).
- **Long-press** an event (DevTools mobile emulation / touch) → same menu. Long-press empty day space → still the "Add event / Plan this day" menu.
- **Keyboard:** Tab to an event chip, press the ContextMenu key (or Shift+F10) → menu opens anchored; ↑/↓ move; Esc closes and returns focus to the chip.
- **Menu closes** on: outside click, Escape, scrolling the page, and navigating to another route (`#/dashboard`).
- **Right-click empty calendar space** → native browser menu (no app menu).
- The existing long-press menus elsewhere (a checklist row, a restaurant card ★) still work.
- 0 console errors throughout.

- [ ] **Step 3: Confirm clean**

Click through calendar interactions in both light/dark; console stays clean.

---

## Self-Review (plan author)

- **Spec coverage:** §3 actions → T1 (spec) + T3 (wiring); §2 triggers → T4 (contextmenu/keyboard) + T5 (long-press); §4 menu widget → T2; §5 shared handlers + single-dispatch → T3; §6 cross-module wiring → T3/T4/T5; §7 files → all; §8 edge cases → T2 (close on scroll/resize/route/Escape) + T4; §9 testing → T1 + T8.
- **Type/name consistency:** `eventMenuSpec`/`duplicateUserEvent` signatures match across T1 (def), T3 (use), T8 (test). `getEventMenu(node)` returns an items array (T3), consumed as `{ items: evItems }` in gestures (T5) and passed straight to `openMenu` in calendar (T4). `openMenu(items, x, y, opts)` signature consistent in T2/T4 and the gestures call site.
- **Single-dispatch:** every mutator routes through `saveUser`/`upsertStop`/`toggleGoing` (one dispatch); no shared function calls `changed()` itself; modal handlers keep `closeModal(ov, {rerender:true})` (focus-only).
- **No placeholders:** every code/markup step shows literal before/after.
