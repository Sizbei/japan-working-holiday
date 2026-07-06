# Calendar month view — condensed simplification (2026-07-06)

**Goal:** Replace the Notion-style spanning **connected bars** in the month grid with a **condensed chip** layout, remove the **✓ Going filter** from the calendar, and **dim past days**.

**Why:** The connected multi-day bars read as elongated and overlap badly. The pre-bars condensed design was cleaner. The ✓ Going *filter pill* doesn't earn its place on a calendar. Past-day dimming is a standard affordance that's missing.

> **Revision note:** hardened after an adversarial review (3 blind critics vs. the real code). The `goingOnly` removal was verified clean; the multi-day logic (§2) had a blocker cluster that is now redesigned; §4 now names exactly what to remove vs. keep. See "Verified facts" and "Cleanup" at the end.

**Relationship to the parity spec** (`2026-07-06-calendar-notion-parity-design.md`): this **supersedes that spec's month-bar direction**. The other parity phases still stand and compose: Day view, Calendars sidebar, layout chrome, and the single-day timed **dot-chip** styling.

## Global constraints (from CLAUDE.md)

- Zero-build, dependency-free; `esc()` before `innerHTML`; single-path data flow (`saveUser()` → `jwh:data-changed` → `render()`); never `render()` at a mutation site; `render()` never dispatches `jwh:data-changed`.
- Bump `CACHE` in `docs/sw.js` (currently `jwh-v228`) on any asset change.
- Restore keyboard focus across `innerHTML` rebuilds; real `<button>` controls.
- Clean up orphans this change creates (dead CSS/JS) — do not leave dangling selectors.
- `SPAN_CAP = 10`: season-long events don't flood the grid.

## Design

### 1. Rebuild `monthHTML()` as a flat condensed grid (NOT a byte-for-byte revert)

The layout returns to the pre-`68a21ab` **structure** — a flat `.cal-grid` of 42 `.cal-cell`s (6×7), chips only, no bar overlay. **But the multi-day handling is new (§2), not the old `eventsOn(date, true)` pass-through** — see §2 for why a literal revert is wrong.

- **JS:** remove from `monthHTML()` the `.cal-bars` overlay, `packLanes(multi, days)` (month path only — week view keeps its `packLanes` call, so the import stays), the per-week `--lanes`/`laneN` computation, `.cal-barspace`, and the `.cal-weeks`/`.cal-week`/`.cal-cells` week-row structure. Return `<div class="cal-dowrow">…</div><div class="cal-grid">…</div>`.
- **Wiring:** `wireMonthSelect()` (calendar.js:844) and `alignRail()` (calendar.js:392) query `.cal-weeks`; repoint both to `.cal-grid`. Verified: neither depends on `.cal-week` rows or `--lanes` (alignRail reads only `offsetHeight`/`getBoundingClientRect().bottom`; wireMonthSelect attaches to the container then queries `.cal-cell[data-day]`). `wireCells()` day/chip/`+N more` wiring works on `.cal-cell`/`.cal-chip` (both persist) — **but delete its now-dead `.cal-bar[data-ev]` loop** (calendar.js:832-834; empty NodeList after bars go).
- **CSS / row height:** the flat `.cal-grid` already resolves to condensed ~88px rows via the existing `.cal-grid{ grid-auto-rows: minmax(88px,1fr) }` (style.css:2617) + the `minmax(66px,1fr)` mobile rule (style.css:825). The bars-era `.cal-week .cal-cell{ min-height: calc(122px + var(--lanes)*var(--laneH)) }` override becomes inert (no `.cal-week` emitted) — remove it along with the other dead rules (see Cleanup). No new `min-height` on `.cal-cell` is needed; the auto-rows govern.

### 2. Multi-day events → ONE anchored chip (start day, or first in-month day)

**Do NOT source multi-day events from `eventsOn`.** With `capLong=true`, `eventsOn` returns a multi-day event on *every* covered day (except `>SPAN_CAP`, which it returns start-day-only) — a faithful revert would reintroduce short stays repeated across cells, which is exactly what we're removing (review Finding 1.3). Instead, split the per-cell content:

- **Single-day events for cell `iso`:** `allEvents().filter(e => visible(e) && !isMultiDay(e) && e.date.slice(0,10) === iso)`.
- **Multi-day non-evergreen events:** collect once (`allEvents().filter(e => visible(e) && isMultiDay(e) && !isEvergreen(e))`) and compute each one's **anchor cell** = the first day of the *view month* it covers:
  ```js
  const s = e.date.slice(0,10);
  const en = (e.endDate || e.date).slice(0,10);
  const monthFirst = `${viewY}-${pad(viewM+1)}-01`;
  const anchor = s >= monthFirst ? s : monthFirst;         // start day, or clamp to the 1st
  const showThisMonth = anchor <= en && anchor.slice(0,7) === monthFirst.slice(0,7);
  const contFromBefore = s < monthFirst;                   // started in a prior month → '‹'
  // if showThisMonth: place the chip on the cell whose iso === anchor
  ```
  This anchors on an **in-month** day (July 1–31), sidestepping the out-of-month first grid cell entirely (review blocker 1.1 — `gridLo` is June 28 for July 2026). `anchor <= en` is the overlap guard so a stay that *ended* before this month never shows (review 1.2). An event starting in a later month (`s.slice(0,7) !== month`) is excluded.
- **Chip markup:** `● {esc(title)} <span class="cc-range">→ {esc(fmtShort(en))}</span>`, with a leading `‹ ` (in `.cc-range`) when `contFromBefore`. Multi-day anchored chips join that cell's item list alongside single-day chips + task chips, then the existing cap-at-3 + `+N more` applies.
- **Ordering within a cell:** single-day timed first (ascending by time — bucket, don't literal-sort on `e.time`), then single-day all-day, then multi-day anchors, then tasks.

Worked examples (July 2026 view): a stay Jul 10–15 → one chip on Jul 10 `→ Jul 15`; a stay Jun 20–Jul 5 → one `‹ … → Jul 5` chip on **Jul 1**; a stay Jun 20–Jun 25 → not shown (ended before July); an Aug event → not shown.

### 3. Season-long (evergreen) events stay in the Ongoing strip

Events with span `> SPAN_CAP` (`isEvergreen`) remain in the **"Ongoing this season" pill strip** above the grid (already built, PR #50) and are **excluded from day cells** (`!isEvergreen` in §2's multi-day filter) — otherwise ~8 of them would pile onto the anchor day. Keep the `ongoing`/`strip` block and its `gridLo/gridHi` window computation in `monthHTML`. *(Open decision: if the owner prefers no strip, evergreen events would instead become a single `‹ … ›` anchored chip and the strip is deleted. Default = keep the strip.)*

### 4. Remove the ✓ Going FILTER from the calendar (keep the Going controls)

**Remove exactly these:**
- The filter pill `#lgGoing` (calendar.js:222) + its click handler (calendar.js:250-252).
- The `goingOnly` state: declaration (33), the clause in `visible()` (111 → `return !hiddenCats.has(catOf(e))`), and the boot load (128). Verified: `goingOnly` is read at exactly those sites and nowhere else — every view funnels through the shared `visible()`, so all views update correctly.
- The green read-only marker `cp-going` in the up-next cockpit (calendar.js:738: `${isGoing(e.id) ? '<span class="cp-going">✓ going</span>' : ''}` → drop the ternary).
- Dead CSS: `.cal-legend .lg-going` / `::before` / `.active` (style.css:2801-2803) and `.cp-going` (style.css:914).

**KEEP (do NOT touch) — these are how a user marks Going and feed the Going page/dashboard:**
- `#spGoing` side-panel button (calendar.js:1034) + handler (1084).
- `#mdGoingU` event-editor button (calendar.js:1233) + handler (1241).
- The context-menu Going item via `eventMenuSpec` (calendar.js:1190).
- `isGoing()` / `toggleGoing()` and all going data.

There is **no** `isGoing` marker in `agendaHTML` — the earlier "any equivalent in agenda rows" was a phantom; ignore it. `KEYS.calGoingOnly` may be left defined but unread (no migration).

### 5. Dim past days

Add `.cal-cell.past` for **in-month** days strictly before `TODAY` (`c.inMonth && date < TODAY`; both are `YYYY-MM-DD`, a sound lexicographic compare — verified):
- Subtle dim: slightly sunk background + `.cal-date` number in `--ink-faint`.
- **Do not** dim today (`=== TODAY`, keeps its pill) or future days.
- **Specificity:** `.cal-cell.past` and `.cal-cell.out` are equal specificity (0,0,2,0), so an appended `.past` rule would override `.out` by source order. To make the spec's "out wins" hold, scope the new rule as **`.cal-cell.past:not(.out)`** (review 2.2). Past days stay fully interactive; dimming is visual only.

## Data model / keys

- **No new keys.** `KEYS.calGoingOnly` becomes unused (left in place). No event-shape change. No new pure helpers (reuses `isMultiDay`, `daysBetween`, `fmtShort`, `isEvergreen`, `pad`).

## Cleanup (orphans this change creates — remove them, per CLAUDE.md)

- JS: the `.cal-bar[data-ev]` loop in `wireCells()` (calendar.js:832-834).
- CSS: `.cal-bars`, `.cal-bar*`, `.cal-barspace`, `.cal-weeks`, `.cal-week`, `.cal-week .cal-cell{overflow…}`, `.cal-cells`, `.cal-week{--laneH}` + the `min-height: calc(122px…)` override; drop `.cal-bar` from the `:is(.cal-chip,.cal-bar,.cal-opill)` category groups (keeps `.cal-chip`/`.cal-opill`; opill dots stay colored — verified). Dead going CSS per §4.
- New CSS deliverables: `.cc-range` (mono/dim inline hint) and `.cal-cell.past:not(.out)`.
- Pre-existing dead code **not** in scope: `.cal-cell.season-start`/`--stripe` (style.css:887) was orphaned by the bars PR, not by this change — leave it unless doing a separate sweep.

## Testing

- `node --test tests/lib.test.mjs` stays green — verified: it imports only pure libs; nothing tests `packLanes`/`monthHTML`/`visible`/`isGoing`/bars.
- Manual/CDP on July 2026 (today = Jul 6): no spanning bars; a 5-day stay shows one `→ Jul 15` chip on its start day, nothing on in-between days; a June→July stay shows `‹ … → Jul 5` on **Jul 1** only; a stay that ended in June does not appear; the Ongoing strip still lists season-long events; **no ✓ Going pill** in the toolbar and no green `✓ going` marker, but `＋/✓ Going` still works in the side panel, editor, and right-click menu; Jul 1–5 dimmed, Jul 6+ not; SW bumped; no console errors.

## Verified facts (established by the review — build on these)

- `goingOnly` has a single reader chokepoint (`visible()`); removing it correctly affects all views. No dangling references anywhere (gestures/dashboard/agenda clean).
- `eventsOn(iso, true)` returns multi-day events on every covered day except `>SPAN_CAP` — so §2 must bypass it.
- Dropping `.cal-bar` from the `:is()` groups keeps `.cal-opill` dot coloring (custom-property inheritance).
- Tests stay green; `.cal-grid`/`.cal-cell` CSS survives on `main`.

## Rejected / non-issues

- "Any equivalent Going marker in agenda rows" — **rejected**, `agendaHTML` renders none.
- "Revert min-height to 92px" — **dropped**, the flat `.cal-grid` auto-rows (88px) already govern; no `.cal-cell` min-height needed.

## Out of scope

- The other parity phases (Day view, Calendars sidebar, chrome).
- Removing `isGoing`/going data or the Going page.
- Week/Agenda multi-day rendering (they show full spans and read fine).
