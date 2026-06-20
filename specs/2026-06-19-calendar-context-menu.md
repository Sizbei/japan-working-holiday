# Calendar Right-Click Context Menu — Design Spec

**Date:** 2026-06-19
**Status:** design contract (awaiting user review → implementation plan)
**Research:** Notion Calendar right-click behavior (source-backed) informed the action split by event type.

## 1. Goal

Right-clicking an event on the calendar (`#/calendar`) opens a compact context menu of quick actions, so common actions no longer require opening the full event modal. Actions are split by event type — **baked** (researched, read-only) vs **user** (`jwh-events-v1`, full CRUD). Touch and keyboard get parity.

## 2. Interaction model

- **Desktop:** a `contextmenu` (right-click / two-finger trackpad) on any event opens the menu at the cursor and calls `preventDefault()` to suppress the native menu. Left-click/tap is **unchanged** (still opens the existing modal).
- **Touch:** long-press on an event opens the same menu. An event takes precedence over the day cell, so long-pressing empty day space keeps today's "add event / plan this day" menu (`gestures.js`).
- **Keyboard:** with an event trigger focused, the **ContextMenu key** or **Shift+F10** opens the menu anchored to the event (a non-destructive path to the same actions, guarded by `typingTarget()`). **No bare Delete/Backspace-deletes binding** — in an app with no undo a stray keypress deleting an event is a foot-gun, and it's beyond the requested scope. Delete stays a deliberate red menu item.
- **Right-click on empty calendar space:** falls through to the native browser menu (out of scope).

### Surfaces covered
The day popover is appended to `document.body` (outside the calendar view), so the `contextmenu` listener is delegated on **`document`** and filtered to the event-trigger selectors — `.cal-chip`, `.agenda-title`, `.pop-open`, `.cp-deadline`, each carrying `data-ev`. That covers all four triggers including the body-level popover. The same node→event resolution (`getEventMenu(node)`) is reused for long-press and keyboard-open.

## 3. Action sets ("fast mirror" of the existing modal)

Labels match the existing modal wording. Each item calls a shared handler (see §5) — the menu adds no behavior the modal doesn't already have, except **Duplicate** and the **Delete-key** binding.

**Baked event (read-only):**
| Item | Action |
|---|---|
| Open details | `openDetail(ev)` (the read-only detail modal) |
| ＋ Add to day plan | `addEventToPlan(ev)` |
| ＋ Google Calendar | open `gcalUrl(ev)` in a new tab |
| Copy to my events | `copyBakedToUser(ev)` (duplicate-as-editable — already exists) |
| ✓/＋ Going | `toggleGoingEv(ev)` (label reflects current state) |

**User event (editable):**
| Item | Action |
|---|---|
| Edit | `openModal(ev)` (the editor) |
| Duplicate | `duplicateUserEvent(ev)` → saves a copy onto the grid (no auto-opened editor — avoids leaving an unsaved "ghost" event; the user can click the copy to edit) |
| ＋ Add to day plan | `addEventToPlan(ev)` |
| ＋ Google Calendar | open `gcalUrl(ev)` |
| ✓/＋ Going | `toggleGoingEv(ev)` |
| — divider — | |
| Delete | `deleteUserEvent(ev.id)` (destructive styling; **immediate**, mirrors the modal) |

Baked events never expose Edit / Delete / Duplicate-as-self (they can't be mutated); "Copy to my events" is their duplicate-as-editable path.

## 4. The menu component — reuse, don't reinvent

The existing long-press menu primitive in `gestures.js` (`openMenu(items, x, y)` / `closeMenu()`) already renders `role="menu"` with `role="menuitem"` buttons, positions at the cursor with on-screen flip, and closes on outside pointerdown. **Extract it into `docs/assets/lib/menu.js`** (no behavior change) so both `gestures.js` and `calendar.js` use one implementation.

Enhancements to the shared primitive (small, benefit both callers):
- **Escape** closes the menu and restores focus to the trigger element.
- On **keyboard-open**, focus the first item; **↑/↓** move between items; **Enter/Space** activate (native `<button>`).
- Close on **scroll**, **resize**, and **`jwh:route`** (navigating away).
- A destructive item renders with class `lp-item-danger` and sits below a divider (`lp-sep`).
- `openMenu` accepts an optional anchor element (for keyboard-open) instead of x/y.
- The menu element gets `aria-label="Event actions"`; items already use `role="menuitem"`.

`items` shape stays `{ label, run }`, extended with optional `{ danger: true }` and `{ sep: true }` separators.

**Extraction boundary (keep the click-suppression where it is):** the current `openMenu` is coupled to a `fired` flag in `gestures.js` that suppresses the click synthesized after a long-press. `lib/menu.js` must be a *self-contained widget* (open/position/flip/outside-close/keyboard/danger/sep/anchor) that knows nothing about long-press. It exposes an `onClose` callback option so `gestures.js` can reset its own `fired` flag when the menu closes. The `fired`/click-suppression logic stays entirely in `gestures.js`.

## 5. Shared handlers (DRY refactor)

The calendar's event actions currently live as inline listeners inside `openDetail`/`openModal`. Extract them into named functions in `calendar.js` so the menu and the modal call the same code:

- `toggleGoingEv(ev)` — `toggleGoing(ev.id)` + dispatch.
- `addEventToPlan(ev)` — the existing `mdPlan` logic (`upsertStop`/`newStop` with `approxCoord`) + the "Added … to your plan" toast.
- `copyBakedToUser(ev)` — the existing `mdCopy` logic (push a user event with `copyOf: ev.id`).
- `deleteUserEvent(id)` — the existing `mdDel` logic: clear the linked place back-ref (`loadPlaces`/`patchPlace` — `patchPlace` does **not** dispatch), then `saveUser(filter)`. **Must preserve the place-cleanup.**
- `duplicateUserEvent(ev, newId)` — **new, pure builder**: returns a new user event `{ id: newId, title, date, endDate, category, note, area, copyOf: ev.id }` without mutating `ev`. The caller does `saveUser([...loadUser(), duplicateUserEvent(ev, 'u'+Date.now())])`. (Pure + `newId` param so the unit test is deterministic.) The copy lands on the grid; no editor is auto-opened.

**Single-path render (verified against the real code):** the one `jwh:data-changed` dispatch comes from the underlying save itself — `saveUser` / `saveOverrides` call `changed()` (`calendar.js:30,34`), `toggleGoing` dispatches (going.js), and `upsertStop`→`savePlans`→`dispatchChanged` dispatches once (dayplan.js). The shared functions therefore **must not** add a redundant `changed()`. The calendar's `jwh:data-changed → render()` listener (`calendar.js:85`) repaints, which destroys the trigger element.
- **`closeModal({rerender:true})` is focus-only, not a render trigger** (`calendar.js:494-497` — it just sends focus to the stable `#calAdd` because `render()` already destroyed the trigger). So the **modal handlers keep `closeModal(ov, {rerender:true})`** unchanged — only their inline body is swapped for a call to the shared function. There is no double-render.
- **Menu handlers** call the shared function, then `closeMenu()`; after a mutating action (which re-renders and destroys the event trigger) they move focus to `#calAdd`, mirroring the modal's focus handling.

**Purity split (so the logic is unit-testable):** `lib/calevents.js` holds the pure pieces — `duplicateUserEvent(ev)` (the clone builder) and `eventMenuSpec(ev, { isGoing })`, which returns the ordered item list as plain data `[{ key, label, danger?, sep? }]` with **no callbacks** (`key` is an action id like `'edit'`/`'delete'`/`'going'`). `calendar.js` then maps each `key` to its actual handler to produce the `{ label, run, danger }` items `openMenu` consumes. The impure handler wiring stays in `calendar.js`; the per-type label/flag logic is pure and tested.

## 6. Cross-module wiring

- `calendar.js` owns the event-menu logic and exports `eventMenuItems(ev)` and `getEventMenu(node)` (resolves a DOM node → items or `null` if it's not an event trigger).
- `calendar.js` wires the desktop `contextmenu` listener and the keydown (Delete + ContextMenu/Shift+F10) on the calendar view.
- `gestures.js` imports the shared `lib/menu.js` (replacing its inline primitive) and, in `resolveTarget`, calls `getEventMenu(node)` **before the existing `.cal-cell[data-day]` branch** (currently `gestures.js:158`). This ordering matters: an event chip is a descendant of a day cell, so `node.closest('.cal-cell[data-day]')` would also match — the event branch must run first so long-pressing a chip opens the event menu, not the day menu. Empty day space (no `[data-ev]` ancestor) falls through to the day menu unchanged.

## 7. Files

- **Create:** `docs/assets/lib/menu.js` (extracted menu primitive), `docs/assets/lib/calevents.js` (pure `duplicateUserEvent(ev)` + `eventMenuSpec(ev, { isGoing })` returning the `[{key,label,danger?,sep?}]` list per type), `tests/calevents.test.mjs`.
- **Modify:** `docs/assets/calendar.js` (extract shared handlers, `contextmenu` + keydown listeners, `getEventMenu`/`eventMenuItems` usage, rewire modal handlers to shared fns), `docs/assets/gestures.js` (import shared menu; `resolveTarget` event branch), `docs/assets/style.css` (`.lp-item-danger`, `.lp-sep`), `docs/sw.js` (precache `assets/lib/menu.js` + `assets/lib/calevents.js`, bump `CACHE`).

## 8. Error handling / edge cases

- Menu closes on: an action running, Escape, outside click, scroll, resize, `jwh:route`.
- The event lookup by id guards against a missing event (filtered out / deleted) → no menu / no-op.
- Delete is immediate with no undo (matches the existing modal Delete). The destructive item is visually distinct (`lp-item-danger`) and bottom-placed below a separator, so it's a deliberate action. There is no keyboard delete binding (see §2).
- Long-press must not double-fire (open menu **and** open the modal) — the existing `gestures.js` suppress-click-after-longpress logic covers this; verify it also suppresses the event's own click.
- Baked events: menu must never offer mutation of the source record.

## 9. Testing / verification

- **Unit (`node --test tests/calevents.test.mjs`):**
  - `duplicateUserEvent(ev, newId)` → returns a new event with `id === newId`, all copied fields (title/date/endDate/category/note/area), `copyOf === ev.id`, and does **not** mutate the input `ev` (assert `ev` unchanged). Deterministic via the `newId` param.
  - `eventMenuSpec(ev, { isGoing })` → baked event yields keys WITHOUT `edit`/`delete`/`duplicate` and WITH `copy`; user event yields `edit`/`duplicate`/`delete` (delete flagged `danger`, preceded by a `sep`), and the `going` label reflects the `isGoing` argument.
- **Existing suite stays green:** `node --test tests/lib.test.mjs`.
- **Browser:** right-click a baked event → correct read-only set; right-click a user event → editable set with red Delete; Delete removes it and the grid repaints (single render); Duplicate creates a copy and opens its editor; long-press parity on mobile-emulation; ContextMenu-key + Delete-key on a focused event; menu closes on Escape / outside / scroll / route change; 0 console errors.

## 10. Out of scope

Multi-select (shift-click) bulk actions, a color/category submenu, "Copy link" deep-links (events aren't routable), right-click-empty-grid creation, and undo. Notion has these; they're deferred.
