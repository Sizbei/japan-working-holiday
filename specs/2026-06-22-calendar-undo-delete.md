# Calendar Undo-Delete + Ctrl/Cmd+Z — Design Spec

**Date:** 2026-06-22
**Status:** design contract (AI-reviewed by 3 personas; hardened; proceeding to plan)
**Follows on from:** `specs/2026-06-19-calendar-context-menu.md` (the immediate delete this makes recoverable).

## 1. Goal

Deleting a calendar event (via the right-click menu **or** the editor modal) shows an **"Undo"** toast for ~4s; clicking Undo — or pressing **Ctrl/Cmd+Z** — fully restores the event, including re-linking any saved map place that referenced it. This is the safety net for the immediate, no-confirm delete.

## 2. Interaction

- After a user event is deleted, a toast `Deleted "<title>"` with an **Undo** button appears (the existing `dndToast`, 4.2s auto-dismiss, `role=status`/`aria-live=polite`).
- **Undo button** or **Ctrl+Z / Cmd+Z** restores it.
- Ctrl+Z does nothing (and does not intercept) when: focus is in a text field, a modal is open, it's a redo combo (Shift), or there is no pending undo — see §5.
- Only the most-recent delete is undoable; a second delete within the window supersedes the first (the first becomes permanent).

## 3. Architecture

**No new files. `dnd.js` is untouched** — its `dndToast(msg, undoFn)` already renders an Undo button wired to `undoFn`; that parameter (currently unused by all callers) is what we use.

### Undo state — owned by `calendar.js`
A module-level register:
```js
let pendingUndo = null;     // { event, place } | null  (see snapshot below)
let undoTimer = null;
```

### `deleteUserEvent(id)` — extended (the single delete path for menu + modal)
1. **Snapshot before teardown:**
   ```js
   const event = loadUser().find(x => x.id === id);
   const lp = loadPlaces().find(p => p.eventId === id);
   const place = lp ? { id: lp.id, eventId: lp.eventId, date: lp.date, remindDate: lp.remindDate } : null;
   ```
2. **Delete (unchanged):** if `lp`, `patchPlace(lp.id, { eventId:'', date:'', remindDate:'' })`; then `saveUser(loadUser().filter(x => x.id !== id))` (one dispatch → render).
3. **Register + toast:** clear any prior pending (supersede), set `pendingUndo = { event, place }`, start `undoTimer = setTimeout(clearPending, 4200)`, and `dndToast('Deleted "' + event.title + '"', undoLastDelete)`. (`dndToast` uses `textContent`, so the title is injection-safe.)

If `event` is missing (already gone), do nothing.

### `undoLastDelete()` — exported
```js
export function undoLastDelete() {
  if (!pendingUndo) return false;           // nothing to undo → caller won't preventDefault
  const { event, place } = pendingUndo;     // atomic consume: capture then null BEFORE mutating
  clearPending();
  if (place) patchPlace(place.id, { eventId: place.eventId, date: place.date, remindDate: place.remindDate });   // re-link FIRST (silent), …
  saveUser([...loadUser(), event]);         // … then save (single dispatch renders both)
  return true;
}
function clearPending() { pendingUndo = null; if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; } }
```
Re-adding with the **original id** means: a linked place's `eventId` reconnects, and **Going state survives** automatically (it's keyed by event id in separate storage). The place re-patch precedes `saveUser` because `patchPlace` does **not** dispatch (`places.js`) — so the one `saveUser` dispatch renders the place change too (no second render, mirroring the existing delete order).

### Ctrl/Cmd+Z — in `gestures.js` `wireKeyboard` (where global shortcuts live)
The existing handler bails on any modifier as its **first** line (`if (e.metaKey || e.ctrlKey || e.altKey) return;`), so the Ctrl+Z branch must go at the **top of the handler, before that early-return**, carrying its own guards (which mirror the ones just below it):
```js
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {  // undo
    if (e.isComposing) return;                                  // don't fight an IME
    if (typingTarget(document.activeElement)) return;           // native undo in a text field
    if (document.querySelector('.modal-overlay')) return;       // a modal owns the keyboard
    if (undoLastDelete()) e.preventDefault();                   // only swallow the key if we actually undid
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;               // (existing) ignore other modified keys
  // … existing typingTarget / modal / number / bracket / ? / Escape handling unchanged …
});
```
`typingTarget` is already module-private in `gestures.js`. `gestures.js` already imports from `calendar.js` (`getEventMenu`) — add `undoLastDelete` to that import (one-way; calendar does not import gestures).

## 4. Why no new pure helper / unit test

The undo logic is storage-and-DOM glue (re-add event, re-patch place, dispatch). There is no meaningful pure transform to extract — a snapshot/restore helper would be ceremony whose test (“did you save and restore?”) catches no real bug. The load-bearing behavior (place re-link, Going reconnect, single render) is verified in the browser (§6). Existing `node --test` suites must stay green.

## 5. Edge cases

- **Atomic consume:** `undoLastDelete` captures then nulls `pendingUndo` before mutating, so the Undo button and Ctrl+Z cannot double-undo (the second sees `null`).
- **Supersede:** a second delete clears the prior pending + timer; the first delete is permanent (consistent with the single-toast model).
- **Expiry:** after 4200ms `clearPending` nulls the register, so a later Ctrl+Z is a no-op.
- **No pending undo:** Ctrl+Z returns without `preventDefault`, leaving native browser undo / other handlers unaffected.
- **Text field / modal open:** handled by the pre-existing `gestures.js` guards.
- **Known limitation:** if the user edits the linked place's date within the ~4s window and *then* undoes, the place is restored to its pre-delete date (the snapshot), overwriting that edit. Narrow race, accepted.

## 6. Testing / verification

- Existing suites stay green: `node --test tests/lib.test.mjs tests/i18n.test.mjs tests/calevents.test.mjs`.
- Browser: delete a user event **via the right-click menu** → toast appears → click **Undo** → event returns. Repeat and undo via **Cmd/Ctrl+Z**. Delete **via the editor modal** → same. Delete an event that has a **linked map place with a date** → undo → confirm the place is re-linked and its date restored. Mark an event **Going**, delete, undo → still Going. **Type in the editor's Title field and press Cmd+Z** → native text undo (not event-restore). **Second delete within 4s** supersedes (first not restorable). Toast auto-dismisses ~4.2s; Ctrl+Z after that is a no-op. 0 console errors.

## 7. Files

- **Modify:** `calendar.js` (import `dndToast`; `pendingUndo`/`undoTimer`/`clearPending`; extend `deleteUserEvent`; export `undoLastDelete`), `gestures.js` (import `undoLastDelete`; Ctrl/Cmd+Z branch in `wireKeyboard`), `sw.js` (CACHE bump — no new asset).
- **Unchanged:** `dnd.js`, `lib/*`, tests.

## 8. Out of scope

App-wide / generic undo stack, undo for other destructive actions (map place delete, checklist), redo (Shift+Cmd+Z), and a color/multi-select menu. The Ctrl+Z handler is deliberately scoped to the calendar delete only.
