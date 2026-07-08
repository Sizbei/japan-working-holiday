# Calendars sidebar — implementation plan (2026-07-06, parity Phase 4)

**Goal:** Turn the category filter into a Notion-style **"Calendars" list** in the left sidebar: `My events` / `Researched` **source** toggles on top, then each category — every row a colour swatch + label + eye toggle. Adds source-visibility filtering.

**Reconciliation with the (stale) parity spec:** ✓ Going was already removed from the calendar (condensed-month PR), so it is NOT re-homed. The sidebar already exists (`.cal-sidebar` holds mini-nav + cockpit) and is visible in every mode, so the Phase-5 "Filter button for when the sidebar collapses" is **not needed yet** (no collapse exists). Mobile: the sidebar stacks above the grid and `.cal-mininav` is `display:none` on ≤820px — the Calendars panel must stay **visible on mobile** (it's the only filter). Compact/collapsible mobile treatment is deferred to Phase 5.

## Model (verified)
- Events are tagged `source: 'user'` (incl. imported .ics) or `source: 'baked'` — exhaustive. So `My events` = `source==='user'`, `Researched` = everything else.
- Category filter state `hiddenCats` (Set, persisted `KEYS.calFilters`) and `showTasks` (persisted `KEYS.calShowTasks`) already exist and stay.

## Changes

### index.html
- **Remove** the top `#calLegend` strip (line 148).
- **Add** `<div id="calCalendars" class="cal-cals" role="group" aria-label="Calendars — filter by source and category"></div>` inside `.cal-sidebar`, after `#calMiniNav`.

### store.js
- Add `calSources: 'jwh-cal-sources-v1'`.

### calendar.js
- New state: `let showUser = true, showBaked = true;`. In `mountCalendar`, load: `const src = get(KEYS.calSources, {}) || {}; showUser = src.showUser !== false; showBaked = src.showBaked !== false;` (default both on, guarded).
- `persistSources()` → `set(KEYS.calSources, { showUser, showBaked })`.
- **`visible(e)` extends:**
  ```js
  export function visible(e) {
    if (hiddenCats.has(catOf(e))) return false;
    const isUser = e.source === 'user';
    if (isUser && !showUser) return false;
    if (!isUser && !showBaked) return false;
    return true;
  }
  ```
- Rename `buildLegend` → **`buildCalendars`**, targeting `#calCalendars`. Renders:
  1. A header row: `Calendars` + a `#calAll` "All/None" button (drives `hiddenCats`, as `lgAll` did).
  2. **Source rows** (`.calrow.calrow-src`): `My events` (dot = indigo) and `Researched` (dot = gold/neutral) — each a `<button role="switch" aria-checked>` toggling `showUser`/`showBaked` → `persistSources(); buildCalendars(); render();`.
  3. A thin divider.
  4. **Category rows** (`.calrow.cat-<c>`): swatch (`--chip-cat`) + name + eye. Single-click toggles `hiddenCats`; **double-click isolates** (preserve the existing 200ms timer UX). Off rows get `.off`.
  5. **`☑ Tasks`** row (`showTasks` toggle), same behaviour as today.
- Keep focus restoration across the rebuild (mirror `focusLg` → focus the toggled row after `render()`).
- Update the sole call site (`mountCalendar` currently calls `buildLegend()` → `buildCalendars()`), and any other `buildLegend()` calls inside the handlers.

### style.css
- Remove the `.cal-legend*` / `.lg` / `.lg-all` rules (dead after the strip is gone) — or the subset made dead; keep `.lg-task` only if reused (it won't be — new markup).
- Add `.cal-cals` panel styling (matches `.cal-mininav`/`.cal-panel` card look), `.calrow` (flex row: swatch + label + eye, dim when `.off`), `.cal-cals-head`. Swatch colour via `--chip-cat`; add `.calrow.cat-<c>` to the existing category-colour `:is(...)` groups (like `.cal-opill` was added) OR a dedicated block.

### sw.js
- `CACHE` v233 → v234.

## Verification (success criteria)
- `node --test` 87/87.
- Browser: sidebar shows the Calendars list (sources + categories + Tasks); toggling `Researched` hides all baked events across month/week/day/agenda and persists across reload; toggling a category eye hides that category; double-click isolates; `All/None` works; `☑ Tasks` still toggles task chips; focus returns to the toggled row; **no top legend strip**; 0 console errors; sidebar list visible at ≤820px.
- Screenshot the sidebar. Adversarial review of the diff (focus restoration, source-filter correctness, no dangling `#calLegend` refs).

## Rollback
Single `git revert`; new key is additive (no migration).
