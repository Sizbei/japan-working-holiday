# Calendar month view — condensed simplification (2026-07-06)

**Goal:** Revert the month grid from the Notion-style spanning **connected bars** back to the earlier **condensed chip** layout, remove the **✓ Going** control from the calendar, and **dim past days**.

**Why:** The connected multi-day bars read as elongated and overlap badly (season-long beer gardens span every week, short stays stack lanes). The pre-bars condensed design was cleaner. The ✓ Going *filter* doesn't earn its place on a calendar. Past-day dimming is a standard calendar affordance that's currently missing.

**Relationship to the parity spec** (`2026-07-06-calendar-notion-parity-design.md`): this **supersedes that spec's month-bar direction** (Phase 1's "all-day/multi-day → filled bar" and any lane/bar machinery). The other parity phases still stand and compose cleanly: Day view, Calendars sidebar, layout chrome, and the timed **dot-chip** styling for single-day timed events (dot + time prefix) — a dot-chip is condensed and fits this direction.

## Global constraints (from CLAUDE.md — bind this work)

- Zero-build, dependency-free; `esc()` before `innerHTML`; single-path data flow (`saveUser()` → `jwh:data-changed` → `render()`); never `render()` at a mutation site; `render()` never dispatches `jwh:data-changed`.
- Bump `CACHE` in `docs/sw.js` on any asset change.
- Restore keyboard focus across `innerHTML` rebuilds; real `<button>` controls.
- `SPAN_CAP = 10` convention: season-long events don't flood the grid.

## Design

### 1. Remove the connected-bar machinery

Delete from `monthHTML()` and CSS the entire spanning-bar layer introduced in PR #49:
- **JS:** the `.cal-bars` overlay, `packLanes(multi, days)` usage in the month path, the per-week `--lanes`/`laneN` computation, `.cal-barspace`, and the `.cal-weeks` / `.cal-week` / `.cal-cells` bar-row structure. Revert `monthHTML()` to a **flat condensed grid**: one `.cal-grid` of `.cal-cell`s (7-col), chips only — the structure that existed before `68a21ab`.
- **Wiring:** `wireMonthSelect()` and `alignRail()` currently query `.cal-weeks`; point them back at the flat `.cal-grid` container. `wireCells()` chip/`+N more`/day-click wiring is unchanged (it queries `.cal-cell`/`.cal-chip`).
- **CSS:** remove `.cal-bars`, `.cal-bar*`, `.cal-barspace`, and the `.cal-week{--laneH}` / `.cal-week .cal-cell{min-height: calc(122px + …)}` rules. Drop `.cal-bar` from the `:is(.cal-chip,.cal-bar,.cal-opill)` category-colour groups. Revert `.cal-cell` `min-height` to the condensed pre-bars value (smaller cells) — pin the exact px in the plan against `68a21ab~1`.

### 2. Multi-day events → start-day-only chip + range hint

A multi-day event renders **one** chip, not a bar, and only once:
- On its **start day** when the start is within the visible grid → `● {title} → {fmtShort(endDate)}` (e.g. `Little Japan hostel → Jul 15`).
- When the event **started before** the visible grid (spilled in from a prior month) → render on the **first visible grid day** with a leading `‹` continuation marker: `‹ {title} → {fmtShort(endDate)}`.
- **Nothing on the in-between days.** Full span stays visible on click (popover) and in Agenda/Week views.

Implementation: reuse `isMultiDay(e)`, `daysBetween`, `fmtShort`. In the per-cell single-day collection, include a multi-day event `e` for cell `iso` iff `startISO(e) === iso` OR (`startISO(e) < gridLo && iso === gridLo`). This replaces the old behavior where only `> SPAN_CAP` events were start-day-only and short multi-day events repeated on every day — now **all** non-evergreen multi-day are start-day-only.

Chip markup gains a `.cc-range` span for the `→ …` / `‹` hint (escaped). Sorting within a cell: timed single-day first (ascending), then all-day/multi-day (matches the parity spec's bucket-don't-literal-sort rule).

### 3. Season-long (evergreen) events stay in the Ongoing strip

Events with span `> SPAN_CAP` (`isEvergreen`, e.g. the summer beer gardens, teamLab) remain in the **"Ongoing this season" pill strip** above the grid (already built, PR #50) and are **excluded from day cells** — otherwise ~8 of them would pile onto the first visible day. This is the one multi-day treatment that is NOT a start-day chip, by design. `monthHTML` keeps the `ongoing`/`strip` block; only the short-multi-day bar path is removed.

*(Open decision recorded: if the owner prefers zero strip, evergreen events would instead become a single `‹ … ›` chip on the first visible day and the strip is deleted. Default = keep the strip.)*

### 4. Remove ✓ Going from the calendar

- **Filter pill:** delete `#lgGoing` (calendar.js:222) + its handler (calendar.js:250-252) and the `goingOnly` state read/persist in the calendar. `visible(e)` drops its `goingOnly` clause → `return !hiddenCats.has(catOf(e))` (plus the source checks if the Calendars-sidebar phase has landed).
- **Markers:** remove the green `✓ going` tag rendered on cockpit/up-next rows (`isGoing(e.id) ? '<span class="cp-going">✓ going</span>'`, panelHTML) and any equivalent in agenda rows.
- **Keep** `isGoing()` and the underlying going data — it's still used by the Going page and dashboard. Only the calendar's *filter pill* and *inline markers* are removed. `KEYS.calGoingOnly` may be left defined but unused (no migration).

### 5. Dim past days

Add a `.cal-cell.past` class for **in-month** days strictly before `TODAY` (`c.inMonth && date < TODAY`):
- Subtle dim: a slightly sunk background (lighter than `.out`) and the `.cal-date` number in `--ink-faint`.
- **Do not** dim today (keeps its pill) or future days. Out-of-month `.out` dimming is unchanged; a cell can be both `out` and `past` (out styling wins visually).
- Past days remain fully interactive (you can still click to add/inspect) — dimming is visual only.

## Data model / keys

- **No new keys.** `KEYS.calGoingOnly` becomes unused (left in place). No event-shape change.
- **No new pure helpers** (reuses `isMultiDay`, `daysBetween`, `fmtShort`, `isEvergreen`).

## Testing

- `node --test tests/lib.test.mjs` stays green (pure lib unchanged; if any bar-only helper usage is removed, no lib export is deleted).
- Manual/CDP on July 2026: no spanning bars anywhere; a 5-day stay shows one `→ Jul 15` chip on its start day and nothing on in-between days; an event spilling from June shows `‹ … → …` on the first visible cell; the Ongoing strip still lists the season-long events; no ✓ Going pill in the toolbar and no green going markers; past days (Jul 1–5, today = Jul 6) are visibly dimmed while Jul 6+ are not; SW bumped; no console errors.

## Out of scope

- The other parity phases (Day view, Calendars sidebar, chrome) — tracked in the parity spec.
- Removing `isGoing`/going data or the Going page.
- Any change to Week/Agenda multi-day rendering (they already show full spans and read fine).
