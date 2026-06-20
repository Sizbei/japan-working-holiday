# Calendar Right-Click Context Menu — Design Spec

**Date:** 2026-06-19
**Status:** design contract (awaiting user review → implementation plan)
**Research:** Notion Calendar right-click behavior (source-backed) informed the action split by event type.

## 1. Goal

Right-clicking an event on the calendar (`#/calendar`) opens a compact context menu of quick actions, so common actions no longer require opening the full event modal. Actions are split by event type — **baked** (researched, read-only) vs **user** (`jwh-events-v1`, full CRUD). Touch and keyboard get parity.

## 2. Interaction model

- **Desktop:** a `contextmenu` (right-click / two-finger trackpad) on any event opens the menu at the cursor and calls `preventDefault()` to suppress the native menu. Left-click/tap is **unchanged** (still opens the existing modal).
- **Touch:** long-press on an event opens the same menu. An event takes precedence over the day cell, so long-pressing empty day space keeps today's "add event / plan this day" menu (`gestures.js`).
- **Keyboard:** with an event trigger focused, the **ContextMenu key** or **Shift+F10** opens the menu anchored to the event; **Delete/Backspace** on a focused *user* event deletes it. Both are guarded by the existing `typingTarget()` check so they never fire while typing in an input/textarea/select or an open modal.
- **Right-click on empty calendar space:** falls through to the native browser menu (out of scope).

### Surfaces covered
A delegated listener on the calendar view resolves the event via `closest('[data-ev]')`, which automatically covers all four existing event triggers: month chips (`.cal-chip`), agenda rows/titles (`.agenda-row`/`.agenda-title`), the day popover (`.pop-open`), and the deadline panel (`.cp-deadline`).

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
| Duplicate | `duplicateUserEvent(ev)` → creates the copy, then opens the editor on it |
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

`items` shape stays `{ label, run }`, extended with optional `{ danger: true }` and `{ sep: true }` separators.

## 5. Shared handlers (DRY refactor)

The calendar's event actions currently live as inline listeners inside `openDetail`/`openModal`. Extract them into named functions in `calendar.js` so the menu and the modal call the same code:

- `toggleGoingEv(ev)` — `toggleGoing(ev.id)` + dispatch.
- `addEventToPlan(ev)` — the existing `mdPlan` logic (`upsertStop`/`newStop` with `approxCoord`) + the "Added … to your plan" toast.
- `copyBakedToUser(ev)` — the existing `mdCopy` logic (push a user event with `copyOf: ev.id`).
- `deleteUserEvent(id)` — the existing `mdDel` logic: clear the linked place back-ref (`loadPlaces`/`patchPlace`), `saveUser(filter)`. **Must preserve the place-cleanup.**
- `duplicateUserEvent(ev)` — **new**: build a new user event `{ id:'u'+Date.now(), title, date, endDate, category, note, area, copyOf: ev.id }`, `saveUser([...loadUser(), copy])`, then `openModal(copy)` so the user can tweak it.

**Single-path render (critical):** each mutator dispatches `jwh:data-changed` exactly once (via the existing `changed()` helper); the calendar's `jwh:data-changed → render()` listener repaints. Callers (menu or modal) then just close themselves — they must **not** also force a re-render (avoid the double-render the CLAUDE.md conventions warn about). The modal handlers are rewired to call these shared functions then `closeModal(ov)` without `{ rerender: true }`.

**Purity split (so the logic is unit-testable):** `lib/calevents.js` holds the pure pieces — `duplicateUserEvent(ev)` (the clone builder) and `eventMenuSpec(ev, { isGoing })`, which returns the ordered item list as plain data `[{ key, label, danger?, sep? }]` with **no callbacks** (`key` is an action id like `'edit'`/`'delete'`/`'going'`). `calendar.js` then maps each `key` to its actual handler to produce the `{ label, run, danger }` items `openMenu` consumes. The impure handler wiring stays in `calendar.js`; the per-type label/flag logic is pure and tested.

## 6. Cross-module wiring

- `calendar.js` owns the event-menu logic and exports `eventMenuItems(ev)` and `getEventMenu(node)` (resolves a DOM node → items or `null` if it's not an event trigger).
- `calendar.js` wires the desktop `contextmenu` listener and the keydown (Delete + ContextMenu/Shift+F10) on the calendar view.
- `gestures.js` imports the shared `lib/menu.js` (replacing its inline primitive) and, in `resolveTarget`, checks `getEventMenu(node)` **first** — if it returns items, long-press opens the event menu; otherwise it falls back to the existing day/card/checklist targets.

## 7. Files

- **Create:** `docs/assets/lib/menu.js` (extracted menu primitive), `docs/assets/lib/calevents.js` (pure `duplicateUserEvent(ev)` + `eventMenuSpec(ev, { isGoing })` returning the `[{key,label,danger?,sep?}]` list per type), `tests/calevents.test.mjs`.
- **Modify:** `docs/assets/calendar.js` (extract shared handlers, `contextmenu` + keydown listeners, `getEventMenu`/`eventMenuItems` usage, rewire modal handlers to shared fns), `docs/assets/gestures.js` (import shared menu; `resolveTarget` event branch), `docs/assets/style.css` (`.lp-item-danger`, `.lp-sep`), `docs/sw.js` (precache `assets/lib/menu.js` + `assets/lib/calevents.js`, bump `CACHE`).

## 8. Error handling / edge cases

- Menu closes on: an action running, Escape, outside click, scroll, resize, `jwh:route`.
- The event lookup by id guards against a missing event (filtered out / deleted) → no menu / no-op.
- Delete is immediate with no undo (matches the modal). Destructive item is visually distinct and bottom-placed; the Delete-key path requires an event trigger to be focused and is `typingTarget`-guarded.
- Long-press must not double-fire (open menu **and** open the modal) — the existing `gestures.js` suppress-click-after-longpress logic covers this; verify it also suppresses the event's own click.
- Baked events: menu must never offer mutation of the source record.

## 9. Testing / verification

- **Unit (`node --test tests/calevents.test.mjs`):**
  - `duplicateUserEvent(ev)` → returns a new event with a fresh `id`, `source` user-shaped, all copied fields, `copyOf === ev.id`, and does not mutate the input.
  - `eventMenuSpec(ev, { isGoing })` → baked event yields keys WITHOUT `edit`/`delete`/`duplicate` and WITH `copy`; user event yields `edit`/`duplicate`/`delete` (delete flagged `danger`, preceded by a `sep`), and the `going` label reflects the `isGoing` argument.
- **Existing suite stays green:** `node --test tests/lib.test.mjs`.
- **Browser:** right-click a baked event → correct read-only set; right-click a user event → editable set with red Delete; Delete removes it and the grid repaints (single render); Duplicate creates a copy and opens its editor; long-press parity on mobile-emulation; ContextMenu-key + Delete-key on a focused event; menu closes on Escape / outside / scroll / route change; 0 console errors.

## 10. Out of scope

Multi-select (shift-click) bulk actions, a color/category submenu, "Copy link" deep-links (events aren't routable), right-click-empty-grid creation, and undo. Notion has these; they're deferred.
