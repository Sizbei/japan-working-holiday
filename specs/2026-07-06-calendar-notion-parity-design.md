# Calendar — Notion-parity design (2026-07-06)

> **STATUS: IMPLEMENTED (2026-07-08).** All phases shipped — Phase 1 timed dot-chips (PR #54), Phase 2 module split (PRs #55/#56), Phase 3 Day view (PR #57), Phase 4 Calendars sidebar (PR #58), Phase 5 chrome (PRs #59/#60). Two deviations from this document, both deliberate: (1) the month **spanning-bars** direction was superseded by the condensed-chip layout (`2026-07-06-calendar-month-condensed-design.md`, PR #53) and ✓ Going was removed from the calendar there, so Phase 4 shipped without re-homing it; (2) Phase 5's icon-rail + floating Filter popover was scoped down to a toolbar collapse toggle — the toggle itself keeps the filter reachable in every state, making the popover redundant risk. This file is kept as the design record.

**Goal:** Bring the calendar to feature/interaction parity with Notion Calendar on the axes that make sense for a **local, zero-build, identity-free** app — not account sync — while splitting the oversized `calendar.js` so each feature lands as a small diff.

**Architecture:** Keep the hash-router SPA + single-data-file model. `calendar.js` becomes a thin coordinator that imports focused view modules. The new Day view reuses (and genuinely parameterizes) the week time-grid engine. The "calendars" concept reuses the existing category-filter state (`hiddenCats`) plus one new source-visibility toggle.

**Tech stack:** Vanilla ES modules, no build, no new CDNs. Pure logic stays in `lib/` (unit-tested via `node --test`).

> **Revision note:** hardened after an adversarial review (3 blind critics vs. the real code). Findings folded in throughout; the "Verified facts" and "Rejected findings" sections at the end record what the review established and what it (correctly) waved through.

## Global constraints (from CLAUDE.md — bind every phase)

- Zero-build, dependency-free; relative paths; `<script type="module">`; works on plain GitHub Pages.
- Identity-free: no personal name/employer in content or commits (author "WHV Guide").
- Every dynamic string through `esc()` before `innerHTML`.
- Single-path calendar data flow: user mutations call `saveUser()` → dispatch `jwh:data-changed` → `render()` + `dashboard.refresh()` listen. Never call `render()` at a mutation site; `render()` must never dispatch `jwh:data-changed`.
- Bump `CACHE` in `docs/sw.js` on any asset change; add every new `assets/*.js` to its `ASSETS` precache list.
- Prefer real focusable controls (`<button>`) over `role="button"`; **restore keyboard focus across `innerHTML` rebuilds** (today's legend does this via `focusLg`, calendar.js:227 — every rebuilt control surface below must do the same).
- Files target 200–400 lines, 800 max.

## Current state vs. target (gap)

**Already at parity:** Month / Week (time-grid) / Agenda, mini-month nav, connected multi-day bars, "+N more", category color-coding, legend-as-filter, search, natural-language quick-add, `.ics` import/export + GCal links, notifications, drag-to-select/resize, "Ongoing this season" strip.

**This spec adds:** Notion-style timed events in Month · Day view · a Calendars sidebar (elevated categories + source toggles) · collapsible layout chrome — plus the `calendar.js` split that makes the last three tractable.

**Explicitly out of scope (constraint conflicts):** multi-account Google sync, live Notion-database sync, account avatars. These require servers/secrets/identity and break the local + identity-free contract.

**Deliberate deviation from Notion:** no separate persistent right-side detail panel. The app already has (a) the document-anchored event popover and (b) the right-rail cockpit (Up next / Book by / Tasks). A third detail panel would duplicate the popover; the popover stays the detail surface.

## Sequencing (reordered after review)

Ship the small, independent win first; do the risky split second (once it's motivated and before the heavier additions):

1. **Phase 1 — Notion-style timed events in Month.** Small, self-contained, **no dependency on the split** — ships first.
2. **Phase 2 — Split `calendar.js`.** Now motivated; done before Day/Calendars/Chrome so each of those is a small diff.
3. **Phase 3 — Day view.**
4. **Phase 4 — Calendars sidebar.**
5. **Phase 5 — Layout chrome.**

Each phase is its own PR (feature branch → squash-merge), tests green, SW bumped. "Independently shippable" holds for Phase 1 and, after Phase 2, for 3–5.

---

## Phase 1 — Notion-style timed events in Month

**Problem:** Month cells render every single-day event as an identical filled chip; Notion leads *timed* events with their time and a colored dot, reserving filled bars for all-day/multi-day.

**Design:** In `monthHTML()`'s per-cell single-day rendering (calendar.js ~690), branch on `timedOf(e)`:
- **All-day / multi-day** → filled bar/chip (unchanged).
- **Single-day timed** (`timedOf(e)` non-null) → a `.cal-chip.timed` "dot-chip": color dot (`--chip-cat`) + time prefix (`fmt12(e.time)`, e.g. `3:10 PM`) + title, transparent background, left-aligned, colored by category.
- **Single-day all-day** (`timedOf(e)` null) → filled chip (unchanged).

**Sort — bucket, don't literal-sort** (review Finding C): all-day events have `e.time === ''`, which lexically sorts *before* timed values. Do NOT sort on `e.time` directly. Partition: timed events (`timedOf(e)` non-null) ascending by `startMin`, **then** all-day events (original order). `e.time` is guaranteed zero-padded `HH:MM` (editor `<input type=time>` calendar.js:1221; quick-add pads minutes, nlevent.js) so ascending-by-`startMin` is safe.

**New pure helper** (`lib/weekgrid.js`, unit-tested):
```js
// "13:10" -> "1:10 PM"; "09:00" -> "9 AM"; "00:00" -> "12 AM"; "12:00" -> "12 PM"; bad input -> "".
export function fmt12(hm) { /* parse HH:MM, 12h clock, drop ":00" minutes */ }
```
Tests: `fmt12('13:10')==='1:10 PM'`, `fmt12('09:00')==='9 AM'`, `fmt12('00:00')==='12 AM'`, `fmt12('12:00')==='12 PM'`, `fmt12('x')===''` (all verified correct by review).

CSS: `.cal-chip.timed` — transparent bg, `.cc-time` (mono, dim) before `.cc-t`, dot via the existing `::before` in `--chip-cat`. No change to the all-day chip. `MONTH_SINGLES` overflow counting unchanged (a dot-chip is still one item). No data-model change.

---

## Phase 2 — Split `calendar.js` (honest scope)

`calendar.js` is 1372 lines (over the 800 cap). This is **not a risk-free "pure move"** — it is a mechanical-but-wide refactor because the current code shares module-level mutable globals across what will become file boundaries (review F1). Do it carefully, behavior-preserving, tests green throughout.

**Target files:**
- `calendar.js` — coordinator: boot (`mountCalendar`), the mutable state (`mode`, `viewY/M`, `weekAnchor`, `hiddenCats`, `goingOnly`, `showTasks`, caches), `render()` dispatcher, keyboard handler, `allEvents()`/`visible()`/`catOf()`/`safeCat()`, mutation (`saveUser`, `loadUser`, `openModal`, `removeEventByKey`, `rescheduleEvent`), popover (`openSidePanel`).
- `calendar-month.js` — `monthHTML()`, `panelHTML()`/`wirePanel()`, `wireCells()`, `wireMonthSelect()`, `wireReschedule()`, Ongoing strip, `isEvergreen()`.
- `calendar-timegrid.js` — `weekHTML()`, `weekListHTML()`, `dayHTML()` (Phase 3), `timedOf()`, block layout / drag-create / resize, `WK_HH`, now-line. Week **and** Day share this file, so the intra-module write-flags it relies on (`_wkResizeSuppressClick`, calendar.js:566/599/559) move here together and stay module-private — that's fine.
- `calendar-sidebar.js` — mini-nav (`renderMiniNav`) + Calendars list (Phase 4) + collapse chrome (Phase 5).
- `calendar-agenda.js` — `agendaHTML()`/`wireAgenda()`.

**State-sharing mechanism — pick ONE (review F1, Scope#7):** the coordinator exports **live getter functions** — `getMode()`, `getWeekAnchor()`, `getToday()`, `getViewYM()` — plus the mutation/helper set the view modules call (`openModal`, `openSidePanel`, `rescheduleEvent`, `saveUser`, `loadUser`, `visible`, `allEvents`, `catOf`, `safeCat`). **Invariant to preserve:** handlers must call the getter *live* at event time, never snapshot. The week resize/drag handlers read `weekDays(getWeekAnchor())` **inside each handler** — capturing it once goes stale after week navigation (the existing guard comment at calendar.js:569-570). Do not regress this. (ES-module live bindings on exported `let`s are an alternative, but the split touches circular-import-prone code — getters are the single chosen approach; do not mix.)

**SW:** bump `CACHE`; add `calendar-month.js`, `calendar-timegrid.js`, `calendar-sidebar.js`, `calendar-agenda.js` to `ASSETS` (sw.js:9). **index.html needs no new `<script>`** — it loads only `main.js` as the single module (index.html:541); the new files are `import`ed by `calendar.js` (review Finding E / Scope#8).

Verify: `node --test` green; all four views render with no console errors; week navigation + resize/drag still map to the correct (live) week.

---

## Phase 3 — Day view

**Design:** Add `mode='day'` alongside `month`/`week`/`agenda`.
- **Toolbar:** insert a **Day** button (`#calModeDay`) between Week and Agenda; wire in `mountCalendar` (`mode='day'; render()`). Order: Month · Week · Day · Agenda.
- **Keyboard:** `d`/`D` → day mode (mirror `m`/`w`/`a`; already guarded to `#/calendar` at calendar.js:288 — no conflict with checklist's `d`). **Also update** the keyboard-help overlay text (`gestures.js:187`, currently "m w a — …") to include Day, and the stale calendar-keys comment (`gestures.js:159`).
- **Nav:** in day mode, `shift(±1)` steps **one day**; `#calPrev/#calNext` aria-label "Previous/Next day"; label shows the full date.

**Parameterize the week builder (review F3/F5 — it is NOT parameterized today):**
- `weekHTML()` derives `const days = weekDays(weekAnchor)` (calendar.js:454, always 7) and then hardcodes 7: `Array.from({ length: 7 }, …)` for `bandCols`/`timedCols` (calendar.js:468-469). Refactor into `gridHTML(days)` where `days` is the array; replace both `{ length: 7 }` with `days.length`. `weekHTML()` calls `gridHTML(weekDays(weekAnchor))`; `dayHTML()` calls `gridHTML([dayISO])`.
- The two `colOf` closures divide by 7 and clamp `0..6` (`wireWeekResize` calendar.js:573; `wireWeekDragCreate` :622) and `finish` indexes `days[lo..hi]` (:647). Replace the `/7` and `0..6` with `/days.length` and `0..(days.length-1)`, reading `days` live via the getter — so a length-1 day view maps band drag-create/resize to the right (only) day instead of an `undefined` date.

**CSS modifier (review F4 — blocker):** `.wk2-head` and `.wk2-inner` hardcode `grid-template-columns: var(--wk-gutter) repeat(7, minmax(0,1fr))` (style.css:3182, 3202). Add a `.wk2.is-day` modifier that overrides both to `var(--wk-gutter) repeat(1, minmax(0,1fr))`, so the single day fills the content width instead of sitting in a 1/7 track with six blank columns. `dayHTML` emits the grid with the `is-day` class.

**Mobile:** the `.wk2.is-day` single-column grid already fits any width; the day view is the natural mobile-friendly form (one column). Keep the existing `isNarrowWeek()` list only for the 7-day week; Day view uses the grid at all widths.

**Swipe conflict (review Scope#3):** `NO_SWIPE` (gestures.js:78) lists `.cal-cell, .cal-chip` but not the time grid. Add the time-grid selectors (`.wk2-scroll`, `.wk2-col`, `.wk2-inner`) so a horizontal drag on the full-width Day (or Week) grid doesn't trigger a route change.

Verify: Day shows the anchored day full-width; now-line on today; per-hour drag creates a timed event on that day; all-day-band drag + resize map to that day (not undefined); keyboard `d` works and help overlay lists it; prev/next steps one day; horizontal drag on the grid does not navigate routes.

---

## Phase 4 — Calendars sidebar (elevated categories + source toggles)

**Design:** a "Calendars" list in the left sidebar (`calendar-sidebar.js`) that becomes the filter surface, re-homing **all three** existing legend controls (review Finding B — the ☑ Tasks toggle must not be dropped):
- **Source rows (top):** `◉ My events` / `◉ Researched`, each with an eye-toggle. New state `showUser`/`showBaked` (default both on). (Verified: baked events carry `source:'baked'`, user + imported `.ics` events carry `source:'user'`, so the two buckets are exhaustive — imported events live under "My events".)
- **Category rows:** each present category (`[...new Set(allEvents().map(catOf))].sort()`) as `swatch + name + eye`, reusing `hiddenCats` (persisted in `KEYS.calFilters`). Double-click = "show only this" (preserve existing behavior).
- **Re-home the existing controls:** `✓ Going` (`#lgGoing` → `goingOnly`), **`☑ Tasks` (`#lgTasks` → `showTasks`, persisted `KEYS.calShowTasks`, handler calendar.js:250-257)**, and `Show all / None` (`#lgAll`). All three move into the Calendars list; none is dropped.
- **`visible(e)` extends** (verified correct by review):
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
- **New key** `KEYS.calSources = 'jwh-calsources-v1'` (`{showUser, showBaked}`), `store.get`-guarded, additive (no migration). `calShowTasks` is reused as-is.
- **Focus restoration:** the sidebar list rebuilds on toggle; mirror the existing `focusLg` pattern so keyboard focus lands back on the toggled row after `render()` (CLAUDE.md requirement).
- **Cleanup:** the old sticky `.cal-legend` strip (style.css:867) and the now-empty `#calLegend` container (index.html:147) are removed/repurposed — no external consumer references `#lgGoing`/`#lgTasks`/`.lg[data-cat]` (verified: only `buildLegend()` touches them; `gestures.js`/`eventsearch.js`/map/packing use unrelated scoped `data-cat`).

**Reachability guarantee (resolves the Phase 4↔5 contradiction, review Scope#1):** the Calendars list must stay reachable even when the sidebar is collapsed or stacked on mobile. Provide an **always-visible "Filter" button in the grid toolbar** that opens the Calendars list — inline when the sidebar is expanded, as a popover when the sidebar is collapsed or on the ≤820px single-column layout. Filtering is therefore never hidden.

Verify: toggling a category/source/tasks eye updates all four views + persists across reload; `☑ Tasks` still hides/shows checklist chips; focus returns to the toggled row; dashboard/map unaffected (they read `allEvents()`, not `visible()`); filtering reachable with the sidebar collapsed and at 820px.

---

## Phase 5 — Layout chrome

**Design:** the Notion frame, within the existing `.cal-layout` (which is a side-rail + grid at desktop and a single stacked column at ≤820px, style.css:943).
- **Collapsible left sidebar** (mini-nav + Calendars list). A collapse button toggles `.cal-sidebar.collapsed`; state persisted (`jwh-calsidebar-v1`, `'collapsed'|''`). Collapsed = icon rail; expanded = current width. The toolbar "Filter" button (Phase 4) keeps filtering reachable while collapsed.
- **Mobile (≤820px, review Scope#2):** the sidebar stacks above the grid, so "icon-rail width" is meaningless there. Instead, on this breakpoint the collapse toggle **hides the stacked sidebar block entirely** (mini-nav + list), leaving the grid + toolbar (view switcher + Filter button) at the top. Default collapsed on mobile so the grid is reachable without scrolling past the sidebar.
- **View switcher** gains the Day button (Phase 3); keep it a segmented button group (accessible; no menu).
- **Chevron prev/next:** restyle `#calPrev/#calNext`; keep `Today`. Purely visual.
- **Accessibility (review Scope#5):** the collapse button carries `aria-expanded` + `aria-controls` (the sidebar id); on collapse, if focus is inside the sidebar being hidden, move focus to the collapse toggle (don't strand it). Honor `html[data-reduce-motion="on"]` (no animated collapse).

Verify: sidebar collapses/expands and persists (desktop icon-rail; mobile hide); filtering still reachable via the toolbar Filter button in every state; `aria-expanded` reflects state; focus never stranded in a hidden sidebar; no horizontal overflow at desktop or 820px; reduce-motion honored.

---

## Data-model & key summary

- **No event-shape change.** `e.time`/`e.endTime`/`e.source`/`e.category` already exist; `source` is always `'baked'` or `'user'` (never undefined).
- **New keys:** `jwh-calsources-v1` (source toggles), `jwh-calsidebar-v1` (collapse state). Both `store.get`-guarded, additive. `jwh-cal-showtasks-v1` (`calShowTasks`) is **reused**, not replaced.
- **New pure helper:** `fmt12(hm)` in `lib/weekgrid.js`.

## Testing

- Unit (`node --test tests/lib.test.mjs`): `fmt12` cases; existing `packLanes`/`layoutDay`/`parseHM`/`isMultiDay` stay green through the split.
- Manual/CDP per phase: render all four views, no console errors; category/source/tasks toggles persist and stay reachable (collapsed + 820px); Day-view drag (per-hour + all-day band) + resize map to the right day; horizontal grid drag doesn't navigate; SW bumped and `ASSETS` lists the four modules.

## Verified facts (established by the review — build on these, don't re-litigate)

- `e.source` is exhaustive: baked=`'baked'`, user & imported=`'user'`; `!isUser ⇒ baked` is reliable. The Phase 4 calendars model is correct.
- `fmt12` test assertions are all correct.
- Removing the legend pill row is DOM-safe: no external consumer references its nodes.
- `timedOf(e)` exists and returns non-null only for valid single-day timed events; `e.time` is zero-padded `HH:MM`.

## Rejected / non-issues

- "`e.source==='user'` misclassifies baked events" — **rejected**, both buckets are explicitly tagged.
- "index.html needs new `<script>` tags per module" — **rejected**, single `main.js` module entry; only SW `ASSETS` changes.
