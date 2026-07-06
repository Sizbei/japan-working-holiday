# Calendar editor extraction — implementation plan (2026-07-06)

**Goal:** Extract the add/edit **modal + import/export dialog** subsystem from `calendar.js` (886 lines) into `calendar-editor.js`, landing `calendar.js` under the 800-line cap. Behavior-preserving.

**Why a separate, "more careful" pass:** unlike the Phase-2 view modules, this subsystem is called from ~7 sites and shares mutation helpers — so the coupling was mapped before any edit.

## Coupling analysis (verified against the real code)

- **No shared-state reassignment.** The editor block (lines 720–886) does NOT reassign `viewY/viewM/mode/weekAnchor/showTasks` (grep-confirmed). It mutates only via `saveUser` → `jwh:data-changed` → `render()` (single path). **⇒ no setter needed** (unlike `wirePanel`/`goAgenda` in Phase 2).
- **`srcline` (714–717) STAYS.** It is used by `openSidePanel` (l.574), which remains in the coordinator. It is NOT an editor function — do not move it. (Editor block = 720–886 only.)
- **`openModal` is re-exported.** `calendar-week.js` and `calendar-month.js` `import { openModal } from './calendar.js'`. Moving it would break them unless `calendar.js` re-exports. `openModal` is also called internally by `calendar.js` at 7 sites (toolbar, quick-add, keyboard, day-popover, side-panel edit, menu). So `calendar.js` both imports it (for its own use) and re-exports it (for the view modules).
- **`showModal`/`closeModal`/`download`/`wireLocationField` are editor-private.** No other file references calendar's versions (other files' `showModal` = `lib/modal.js`; other `download`s are local). ⇒ keep them module-local (not exported), no collision.
- **Shared mutation helpers stay in coordinator, get exported:** `toggleGoingEv` (used by side-panel l.600, menu l.700, editor l.755), `syncPlaceDate` (reschedule l.412 + editor l.767), `deleteUserEvent` (removeEventByKey l.268, side-panel l.610, menu l.702, editor l.770). `CATS` (const l.43; used by `safeCat` l.404 + editor l.723).

## Moves

`calendar-editor.js` ← `openModal` (720–771), `wireLocationField` (776–810), `openExport` (813–835), `download` (836–842), `onImport` (843–855), `showModal` (858–880), `closeModal` (882–886). Byte-identical bodies.

## Contract

**`calendar-editor.js` header:**
```js
'use strict';
import { $, $$, esc } from './lib/dom.js';
import { gcalUrl, toICS, parseICS } from './lib/ics.js';
import { isGoing } from './lib/going.js';
import { alertModal, confirmModal } from './lib/modal.js';
import { searchJP } from './lib/nominatim.js';
import { TODAY, CATS, allEvents, catOf, loadUser, saveUser, toggleGoingEv, syncPlaceDate, deleteUserEvent } from './calendar.js';
```
Exports: `openModal`, `openExport`, `onImport` (keep `wireLocationField`, `download`, `showModal`, `closeModal` module-local).

**`calendar.js` changes:**
- Add `export` to `CATS` (43), `syncPlaceDate` (420), `toggleGoingEv` (646), `deleteUserEvent` (667).
- Delete the moved functions (720–886). **Keep `srcline` (714–717).**
- Add near the top:
  ```js
  import { openModal, openExport, onImport } from './calendar-editor.js';
  export { openModal };   // re-export so calendar-week/month.js keep importing it from here
  ```
- `docs/sw.js`: `CACHE` v231→v232; add `'assets/calendar-editor.js'` to `ASSETS`.

Circular-import safety: `calendar-editor.js` uses its `calendar.js` imports only inside function bodies (runtime), never at module top-level — same guarantee as Phase 2.

## Verification (success criteria)
- `node --test` 87/87; `node --check` on `calendar.js` + `calendar-editor.js`.
- No moved function defined twice; `srcline` still in `calendar.js`; `openModal` re-exported (week/month modules still resolve it).
- **Browser render:** all 4 views load with 0 console errors, PLUS exercise the editor specifically — open **+Add** (openModal create), open an existing event → **Edit** (openModal edit), the **Export** dialog (openExport), and confirm submit/close paths. A missed export throws `ReferenceError` only when the dialog opens — tests can't catch it.
- Adversarial review of the diff (byte-identity of `openModal`) before merge.

## Rollback
Single `git revert`; no data/schema change.
