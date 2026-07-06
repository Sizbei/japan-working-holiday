# Calendar — Notion-parity design (2026-07-06)

**Goal:** Bring the calendar to feature/interaction parity with Notion Calendar on the axes that make sense for a **local, zero-build, identity-free** app — not account sync — while splitting the oversized `calendar.js` so each feature lands as a small diff.

**Architecture:** Keep the hash-router SPA + single-data-file model. `calendar.js` becomes a thin coordinator that imports focused view modules. New view (Day) reuses the existing week time-grid engine. The "calendars" concept reuses the existing category-filter state (`hiddenCats`) plus one new source-visibility toggle.

**Tech stack:** Vanilla ES modules, no build, no new CDNs. Pure logic stays in `lib/` (unit-tested via `node --test`).

## Global constraints (from CLAUDE.md — bind every phase)

- Zero-build, dependency-free; relative paths; `<script type="module">`; works on plain GitHub Pages.
- Identity-free: no personal name/employer in content or commits (author "WHV Guide").
- Every dynamic string through `esc()` before `innerHTML`.
- Single-path calendar data flow: user mutations call `saveUser()` → dispatch `jwh:data-changed` → `render()` + `dashboard.refresh()` listen. Never call `render()` at a mutation site; `render()` must never dispatch `jwh:data-changed`.
- Bump `CACHE` in `docs/sw.js` on any asset change; add new `assets/*.js` to its `ASSETS` precache list.
- Prefer real focusable controls (`<button>`) over `role="button"`; restore keyboard focus across `innerHTML` rebuilds.
- Files target 200–400 lines, 800 max.

## Current state vs. target (gap)

**Already at parity:** Month / Week (time-grid) / Agenda, mini-month nav, connected multi-day bars, "+N more", category color-coding, legend-as-filter, search, natural-language quick-add, `.ics` import/export + GCal links, notifications, drag-to-select/resize, "Ongoing this season" strip.

**This spec adds:** Day view · Notion-style timed events in Month · a Calendars sidebar (elevated categories + source toggles) · collapsible layout chrome.

**Explicitly out of scope (constraint conflicts):** multi-account Google sync, live Notion-database sync, account avatars. These require servers/secrets/identity and break the local + identity-free contract.

**Deliberate deviation from Notion:** no separate persistent right-side detail panel. The app already has (a) the document-anchored event popover and (b) the right-rail cockpit (Up next / Book by / Tasks). A third detail panel would duplicate the popover; the popover stays the detail surface.

## File structure (the split — Phase 0, then features land here)

`calendar.js` is 1372 lines today (over the 800 cap). Split into a coordinator + focused modules. This is a **pure move**: no behavior change, all existing exports/imports preserved.

- `calendar.js` — coordinator: boot (`mountCalendar`), state (`mode`, `viewY/M`, `weekAnchor`, filters), `render()` dispatcher, keyboard handler, `allEvents()`/`visible()`/`catOf()`, the shared caches, event mutation (`saveUser`, `openModal`, `removeEventByKey`). Imports the view builders below.
- `calendar-month.js` — `monthHTML()`, `panelHTML()`/`wirePanel()`, `wireCells()`, `wireMonthSelect()`, `wireReschedule()`, the Ongoing strip, `isEvergreen()`.
- `calendar-timegrid.js` — `weekHTML()`, `weekListHTML()`, `dayHTML()` (new), `timedOf()`, block layout/drag/resize, `WK_HH`, now-line. Day and Week share this file.
- `calendar-sidebar.js` — mini-nav (`renderMiniNav`) + the new Calendars list (Phase 3) + collapse chrome (Phase 4).
- `calendar-agenda.js` — `agendaHTML()`/`wireAgenda()`.
- `lib/weekgrid.js` — add pure `fmt12(hm)` (see Phase 1). Already holds `packLanes`, `parseHM`, `layoutDay`, `isMultiDay`.

Modules share state via explicit function params / a small exported accessor set from `calendar.js` (e.g. `getState()`), NOT via re-reading globals across files. Verify after the split: `node --test` green, page renders on all routes with no console errors, SW list updated.

---

## Phase 1 — Notion-style timed events in Month

**Problem:** Month cells render every single-day event as an identical filled chip; Notion leads *timed* events with their time and a colored dot, reserving filled bars for all-day/multi-day.

**Design:** In `monthHTML()`'s per-cell single-day rendering, branch on whether the event is timed (`timedOf(e)` non-null, i.e. it has a valid `e.time`):
- **All-day / multi-day** → filled bar/chip (unchanged).
- **Single-day timed** → a `.cal-chip.timed` "dot-chip": a small color dot (`--chip-cat`) + a time prefix (`fmt12(e.time)`, e.g. `3:10 PM`) + title, transparent background, left-aligned. Colored by category.
- Sort a day's singles: **timed events ascending by `e.time`, then all-day**, so the column reads top-down chronologically like Notion.

**New pure helper** (`lib/weekgrid.js`, unit-tested):
```js
// "13:10" -> "1:10 PM"; "09:00" -> "9 AM"; whole hours drop ":00". Returns '' for bad input.
export function fmt12(hm) { /* parse HH:MM, 12h clock, omit :00 minutes */ }
```
Tests: `fmt12('13:10')==='1:10 PM'`, `fmt12('09:00')==='9 AM'`, `fmt12('00:00')==='12 AM'`, `fmt12('12:00')==='12 PM'`, `fmt12('x')===''`.

CSS: `.cal-chip.timed` — transparent bg, `.cc-time` (mono, dim) before `.cc-t`, dot via existing `::before` in `--chip-cat`. No change to the all-day chip.

Scope: `MONTH_SINGLES` overflow counting unchanged (a dot-chip still counts as one item). No data-model change — `e.time` already exists.

---

## Phase 2 — Day view

**Design:** Add `mode='day'` alongside `month`/`week`/`agenda`.
- **Toolbar:** insert a **Day** button (`#calModeDay`) between Week and Agenda; wire in `mountCalendar` (`mode='day'; render()`). Segmented switcher order: Month · Week · Day · Agenda.
- **Keyboard:** `d`/`D` → day mode (mirror the existing `m`/`w`/`a` handlers). `n` add-day already resolves the focused day.
- **Nav:** in day mode, prev/next (`shift(±1)`) steps **one day**; `#calPrev/#calNext` aria-label = "Previous/Next day"; the period label shows the full date.
- **`dayHTML(dayISO)`** in `calendar-timegrid.js`: the week grid with a single column — all-day band (`#wkAllday` equivalent) + 24h scrollable grid + now-line + per-hour drag-to-create + timed blocks via `layoutDay`. Implement by parameterizing the week builder to accept a `days` array of length 1 (reuse `timedOf`, `WK_HH`, block/drag wiring). A wider single column (full content width) is the only layout difference.
- `render()` day branch: `view.innerHTML = dayHTML(weekAnchor)`; hide the cockpit panel (like week); `wireWeek()` equivalent wiring works unchanged since it queries `.wk2-*`.

Verify: switch to Day shows the anchored day's hours; now-line on today; drag creates a timed event on that day; keyboard `d` works; prev/next steps by a day.

---

## Phase 3 — Calendars sidebar (elevated categories + source toggles)

**Design:** A "Calendars" list in the left sidebar (`calendar-sidebar.js`), replacing the top pill-legend as the single filter surface.
- **Source rows (top):** `◉ My events` and `◉ Researched`, each a color-neutral row with an eye-toggle. New state `showUser`/`showBaked` (default both on).
- **Category rows:** each present category (`[...new Set(allEvents().map(catOf))].sort()`) as `swatch + name + eye`, reusing `hiddenCats` (persisted in `KEYS.calFilters` already). Double-click a category = "show only this" (preserve the existing behavior). Keep the `✓ Going` toggle and a "Show all / None" control.
- **`visible(e)` extends** to also honor source visibility:
  ```js
  function visible(e){
    if (hiddenCats.has(catOf(e))) return false;
    if (goingOnly && !isGoing(e.id)) return false;
    const isUser = e.source === 'user';
    if (isUser && !showUser) return false;
    if (!isUser && !showBaked) return false;
    return true;
  }
  ```
- **New localStorage key** `KEYS.calSources = 'jwh-calsources-v1'` (`{showUser:bool, showBaked:bool}`), `store.get`-guarded like the others. Bump note: new key, no migration.
- The top `.lg` pill row is removed from the grid header; its toggle logic moves into the sidebar rows (same `hiddenCats` mutation + persist + `render()`).

Verify: toggling a category eye hides/shows those events across month/week/day/agenda; toggling `My events`/`Researched` hides that source; state persists across reload; dashboard/map unaffected (they read `allEvents()` not `visible()`).

---

## Phase 4 — Layout chrome

**Design:** The Notion frame, within existing structure.
- **Collapsible left sidebar** holding mini-nav + Calendars list. A collapse button toggles a `.cal-sidebar.collapsed` class; state persisted (`jwh-calsidebar-v1`, `'collapsed'|''`). Collapsed = icon-rail width; expanded = current.
- **Segmented view switcher** gains the Day button (Phase 2); style as the current segmented control (buttons, accessible) — no dropdown (keeps keyboard/focus semantics simpler than a menu).
- **Chevron prev/next** restyle of `#calPrev/#calNext` (up/down or ‹/›) + keep `Today`. Purely visual.
- Respects `html[data-reduce-motion="on"]` (no animated collapse when reduce-motion is on).

Verify: sidebar collapses/expands and persists; layout holds at desktop and the mobile breakpoint; no horizontal overflow; reduce-motion honored.

---

## Data-model & key summary

- **No event-shape change.** `e.time`/`e.endTime`/`e.source`/`e.category` already exist.
- **New keys:** `jwh-calsources-v1` (source toggles), `jwh-calsidebar-v1` (collapse state). Both `store.get`-guarded; both additive (no migration).
- **New pure helper:** `fmt12(hm)` in `lib/weekgrid.js`.

## Testing

- Unit (`node --test tests/lib.test.mjs`): `fmt12` cases; existing `packLanes`/`layoutDay`/`parseHM`/`isMultiDay` stay green through the split.
- Manual/CDP: each phase — render all four views with no console errors; filter/source toggles persist; Day-view drag creates an event; SW bumped and `ASSETS` updated with the new module files.

## Phasing / sequencing

0 (split) → 1 (timed month) → 2 (day) → 3 (calendars) → 4 (chrome). Each phase is independently shippable via its own PR (feature branch → squash-merge), tests green, SW bumped.
