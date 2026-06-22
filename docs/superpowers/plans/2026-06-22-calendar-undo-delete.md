# Calendar Undo-Delete + Ctrl/Cmd+Z — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make calendar event deletion recoverable — an Undo toast + Ctrl/Cmd+Z restore the event (and its linked map place).

**Architecture:** Reuse the existing `dndToast(msg, undoFn)`. Undo state (`pendingUndo`) lives in `calendar.js`; `deleteUserEvent` snapshots + registers it + shows the toast; `undoLastDelete()` (exported) restores. Ctrl/Cmd+Z is handled in `gestures.js` `wireKeyboard` (where global shortcuts already live, with `typingTarget`/modal guards).

**Tech Stack:** Vanilla ES modules, no build. Spec: `specs/2026-06-22-calendar-undo-delete.md`.

**Branch:** `feat/calendar-undo-delete` (spec already committed there).

---

## Task 1: Undo state + `deleteUserEvent` + `undoLastDelete` in calendar.js

**Files:**
- Modify: `docs/assets/calendar.js` (import on line 17; the `deleteUserEvent` region ~line 393)

- [ ] **Step 1: Import `dndToast`**

Change line 17:
```js
import { makeMovable } from './dnd.js';
```
to:
```js
import { makeMovable, dndToast } from './dnd.js';
```

- [ ] **Step 2: Replace `deleteUserEvent` with the undo-aware version + add the register and `undoLastDelete`**

Replace the current function:
```js
function deleteUserEvent(id) {
  const linked = loadPlaces().find(p => p.eventId === id);     // clear the back-ref on any place that linked this event
  if (linked) patchPlace(linked.id, { eventId: '', date: '', remindDate: '' });
  saveUser(loadUser().filter(x => x.id !== id));               // saveUser dispatches once
}
```
with:
```js
let pendingUndo = null, undoTimer = null;
function clearPending() { pendingUndo = null; if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; } }

function deleteUserEvent(id) {
  const event = loadUser().find(x => x.id === id);
  if (!event) return;                                          // already gone — nothing to delete/undo
  const lp = loadPlaces().find(p => p.eventId === id);         // the place (if any) linked to this event
  const place = lp ? { id: lp.id, eventId: lp.eventId, date: lp.date, remindDate: lp.remindDate } : null;   // snapshot BEFORE teardown
  if (lp) patchPlace(lp.id, { eventId: '', date: '', remindDate: '' });   // clear the back-ref (silent — patchPlace doesn't dispatch)
  saveUser(loadUser().filter(x => x.id !== id));               // saveUser dispatches once → render
  clearPending();                                              // supersede any prior undoable delete (it becomes permanent)
  pendingUndo = { event, place };
  undoTimer = setTimeout(clearPending, 4200);                  // window matches dndToast's auto-dismiss
  dndToast(`Deleted “${event.title}”`, undoLastDelete);        // dndToast uses textContent → title is injection-safe
}

// Restore the most-recently-deleted event (Undo button or Ctrl/Cmd+Z). Returns true if it undid something.
export function undoLastDelete() {
  if (!pendingUndo) return false;
  const { event, place } = pendingUndo;                        // atomic consume: capture, then clear BEFORE mutating
  clearPending();
  if (place) patchPlace(place.id, { eventId: place.eventId, date: place.date, remindDate: place.remindDate });   // re-link first (silent) …
  saveUser([...loadUser(), event]);                            // … then save: one dispatch renders both. Original id → Going + place links reconnect.
  return true;
}
```

(`undoLastDelete` is a hoisted function declaration, so `deleteUserEvent` referencing it as the `dndToast` callback works regardless of source order.)

- [ ] **Step 3: Parse-check + existing tests stay green**

Run: `node --check docs/assets/calendar.js`
Expected: exit 0.

Run: `node --test tests/lib.test.mjs tests/i18n.test.mjs tests/calevents.test.mjs`
Expected: all green (no behavior these tests cover changed).

- [ ] **Step 4: Commit**

```bash
git add docs/assets/calendar.js
git commit -m "feat: undo-delete for calendar events (snapshot + dndToast + undoLastDelete)"
```

---

## Task 2: Ctrl/Cmd+Z in gestures.js

**Files:**
- Modify: `docs/assets/gestures.js:10` (import), `wireKeyboard`

- [ ] **Step 1: Import `undoLastDelete`**

Change line 10:
```js
import { getEventMenu } from './calendar.js';
```
to:
```js
import { getEventMenu, undoLastDelete } from './calendar.js';
```

- [ ] **Step 2: Add the Ctrl/Cmd+Z branch at the TOP of the `wireKeyboard` keydown handler**

The handler currently opens with `if (e.metaKey || e.ctrlKey || e.altKey) return;`. Insert the undo branch *before* that line so it isn't swallowed:

```js
function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {  // undo (Ctrl/Cmd+Z)
      if (e.isComposing) return;                                // don't fight an IME
      if (typingTarget(document.activeElement)) return;         // native undo in a text field
      if (document.querySelector('.modal-overlay')) return;     // a modal owns the keyboard
      if (undoLastDelete()) e.preventDefault();                 // only swallow the key if we actually undid
      return;
    }
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
```

(Only the new `if (... 'z' ...)` block is added; the rest of `wireKeyboard` is unchanged.)

- [ ] **Step 3: Parse-check**

Run: `node --check docs/assets/gestures.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/gestures.js
git commit -m "feat: Ctrl/Cmd+Z undoes the last calendar delete (guarded for text fields + modals)"
```

---

## Task 3: Service worker cache bump

**Files:**
- Modify: `docs/sw.js:5`

- [ ] **Step 1: Bump CACHE**

Change `const CACHE = 'jwh-v65';` to `const CACHE = 'jwh-v66';`. (No new asset — `dnd.js`, `calendar.js`, `gestures.js` are already in `ASSETS`.)

- [ ] **Step 2: Parse-check + commit**

Run: `node --check docs/sw.js`
Expected: exit 0.

```bash
git add docs/sw.js
git commit -m "chore: bump sw cache to jwh-v66 (undo-delete)"
```

---

## Task 4: Verification

**Files:** none.

- [ ] **Step 1: Unit tests**

Run: `node --test tests/lib.test.mjs tests/i18n.test.mjs tests/calevents.test.mjs`
Expected: all green.

- [ ] **Step 2: Serve + browser-verify**

```bash
cd docs && python3 -m http.server 8015
```
At `http://localhost:8015/?v=1#/calendar` (`localStorage['jwh-auth-v1']='ok'`), verify:
- Add a user event → **right-click → Delete** → toast `Deleted "…"` appears → click **Undo** → event returns on the grid.
- Add another → delete → press **Cmd/Ctrl+Z** → event returns.
- Delete a user event **via the editor modal's Delete** → toast → Undo restores it.
- Add a user event, mark it **✓ Going**, delete, undo → it's back **and** still Going.
- (If feasible) link a map place to an event with a date, delete the event, undo → the place is re-linked with its date restored.
- Open the **editor modal**, type in the **Title** field, press **Cmd+Z** → the *text* undoes (native), the event is NOT restored.
- Delete event A then event B within ~4s → only B is restorable (A permanent).
- Wait >5s after a delete, press Cmd/Ctrl+Z → nothing happens (no error).
- Press Cmd/Ctrl+Z with no pending delete → no error, no interference.
- 0 console errors throughout.

- [ ] **Step 3: Confirm clean**

Click through routes; console stays clean in light + dark.

---

## Self-Review (plan author)

- **Spec coverage:** §3 undo state + `deleteUserEvent` + `undoLastDelete` → T1; §3 Ctrl+Z → T2; §7 SW → T3; §6 verification → T4. §4 (no new test) honored — no test task, existing suites just stay green.
- **Type/name consistency:** `undoLastDelete` defined+exported in T1, imported+called in T2. `pendingUndo`/`undoTimer`/`clearPending` all defined in T1. `dndToast` import added in T1.
- **Single-dispatch:** `deleteUserEvent` and `undoLastDelete` each end in one `saveUser` (one dispatch); `patchPlace` is silent and runs before `saveUser`. No `render()` at the mutation site.
- **No placeholders:** every step shows literal before/after.
