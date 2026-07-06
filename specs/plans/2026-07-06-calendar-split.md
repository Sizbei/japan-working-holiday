# Calendar.js split — implementation plan (2026-07-06)

**Goal:** Split `docs/assets/calendar.js` (1367 lines, over the 800 cap) into a coordinator + 3 focused view modules, **behavior-preserving**. No logic changes — only move code verbatim and adjust `import`/`export`.

**Mechanism:** ES-module **live bindings**. `calendar.js` owns the mutable state; the view modules `import` state + helpers from it and only READ them (verified: no moved function reassigns `viewY/viewM/mode/weekAnchor/hiddenCats/showTasks`). Circular imports (`calendar.js` ↔ modules) are safe because every cross-reference is used inside a function body (evaluated at render time), never at module top-level.

## Preconditions verified before planning
- Ranges 400–886 contain **zero** shared-state reassignment (grep-confirmed) → live bindings are safe.
- The ONE exception: `wirePanel`'s `cp-more` handler does `mode = 'agenda'; render()`. An importer can't reassign `mode`, so this needs a setter (see `goAgenda` below).
- `safeCat` (l.508) is used by week (barHTML/chipHTML/weekHTML), month (panelHTML), AND coordinator (openSidePanel l.1037) → it STAYS in `calendar.js`, exported.
- `eventsOn` (l.112) is used only by `dayPopover` (coordinator) → stays; not exported.
- `iso(y,m,d)` (l.647) is **dead** (only its definition matches `iso(`) → drop it.
- `dayPopover`, `taskChipHTML`, `gotoTask`, `rescheduleEvent`, `openModal`, `openSidePanel` stay in the coordinator (they touch popover/editor/mutation state) and are exported for the modules to call.

## File structure (after)

| File | Responsibility | Moved-in functions |
|---|---|---|
| `calendar.js` (coordinator) | state, data helpers, boot, render dispatch, keyboard, legend, side-panel, editor, menu, day-popover, reschedule | *(keeps everything not listed below; `safeCat` stays)* |
| `calendar-agenda.js` | agenda list view | `agendaHTML`, `wireAgenda` |
| `calendar-week.js` | week/day time-grid + list | `DOW`, `weekLabel`, `isNarrowWeek`, `weekListHTML`, `WK_HH`, `timedOf`, `weekHTML`, `barHTML`, `chipHTML`, `wireWeek`, `_wkResizeSuppressClick`, `wireWeekResize`, `wireWeekDragCreate` |
| `calendar-month.js` | month grid + cockpit panel | `pad`, `MONTH_SINGLES`, `monthHTML`, `sevOf`, `isEvergreen`, `panelHTML`, `wirePanel`, `wireCells`, `_calDragSelected`, `wireMonthSelect`, `wireReschedule` |

## The shared contract (calendar.js exports)

Add `export` to these existing declarations (they stay put):
- **State (live `let`):** `viewY`, `viewM`, `weekAnchor`, `TODAY`, `hiddenCats`
- **Data/helpers:** `allEvents` (already), `allTasks`, `tasksOn`, `taskChipHTML`, `catOf`, `visible`, `safeCat`, `SPAN_CAP`
- **Callbacks:** `openModal`, `openSidePanel`, `dayPopover`, `gotoTask`, `rescheduleEvent`, `saveUser`, `loadUser`

New setter (for the `mode` reassignment `wirePanel` can no longer do):
```js
export function goAgenda() { mode = 'agenda'; render(); }
```

`calendar.js` adds three builder imports near the top and calls them unchanged in `render()`:
```js
import { agendaHTML, wireAgenda } from './calendar-agenda.js';
import { weekHTML, wireWeek, weekLabel } from './calendar-week.js';
import { monthHTML, panelHTML, wirePanel, wireCells, wireMonthSelect, wireReschedule } from './calendar-month.js';
```

## Per-module import lists (from calendar.js unless noted)

**calendar-agenda.js** — `allEvents, visible, allTasks, catOf, gotoTask, openSidePanel, TODAY, hiddenCats`; libs: `$$, esc` (dom), `MONTHS, fmtShort` (dates), `gcalUrl` (ics). Exports: `agendaHTML, wireAgenda`.

**calendar-week.js** — `weekAnchor, TODAY, allEvents, visible, safeCat, openModal, openSidePanel, rescheduleEvent, saveUser, loadUser`; libs: `$, $$, esc` (dom), `parseISO, MONTHS, fmtShort` (dates), `weekDays, isMultiDay, packLanes, parseHM, layoutDay` (weekgrid), `makeMovable` (dnd). Exports: `weekHTML, wireWeek, weekLabel`.

**calendar-month.js** — `viewY, viewM, TODAY, allEvents, visible, catOf, safeCat, tasksOn, taskChipHTML, allTasks, SPAN_CAP, openModal, openSidePanel, dayPopover, gotoTask, rescheduleEvent, goAgenda`; libs: `$, $$, esc` (dom), `daysBetween, fmtShort` (dates), `isMultiDay, fmt12` (weekgrid), `monthGrid` (minical), `makeMovable` (dnd). Exports: `monthHTML, panelHTML, wirePanel, wireCells, wireMonthSelect, wireReschedule`. In-file change: `wirePanel` calls `goAgenda()` instead of `mode='agenda'; render()`.

## Steps
1. Add `export` to the shared declarations; add `goAgenda`.
2. Create the 3 module files (functions moved verbatim + headers above).
3. Delete the moved functions from `calendar.js`; keep `safeCat` (l.506–508); drop dead `iso`.
4. Add the 3 builder imports to `calendar.js`.
5. `docs/sw.js`: `CACHE` v230→v231; add the 3 files to `ASSETS`.

## Verification (the plan's success criteria)
- `node --test tests/lib.test.mjs` → 87/87 (pure libs unaffected).
- Each moved function has exactly ONE definition, in its new module (grep for duplicates/leftovers).
- **Browser render (the check `node --test` can't do):** boot `#/calendar`; switch Month → Week → Agenda → back; confirm **zero console errors** (a missing export → `ReferenceError` at render). Exercise: open an event popover, drag-select a range (month), the cockpit "+N more" (goAgenda), a per-day add (week).
- Adversarial review of the diff for behavior preservation before merge.

## Risk / rollback
- Primary risk: a missed export → `ReferenceError` when that view/handler runs. Caught by the browser render pass (all views + interactions), not by `node --test`.
- Circular-import init order: safe only while no new file uses an import at top-level — reviewer must confirm.
- Rollback is a single `git revert` of the squash commit; no data/schema/localStorage change.
