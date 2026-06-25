# Trip Dashboard Enhancements — Design

**Date:** 2026-06-24
**Status:** Approved for planning
**Supersedes nothing.** Extends `specs/2026-06-15-trip-dashboard-design.md` (the design contract).

## Context

The owner's situation changed since the original build, and they want new task-management
affordances plus a Notion-Calendar-style visual treatment. This spec covers six cohesive
workstreams against the existing vanilla-ES-module, zero-build, data-driven app.

Confirmed personal facts (2026-06-24):

- **Departing from Seattle / US**, not Canada. The pre-departure framing must be Americanized.
- **Working visa is sorted** — CoE + passport-with-visa in hand.
- **"NCD papers" = Japan Narcotics Control Department import permit** for Vyvanse
  (lisdexamfetamine). Under Japan's 2026 rules lisdexamfetamine is a "Stimulants' Raw Material";
  the NCD advance-import permit carried with the prescription is the correct, sufficient route.
  This is **done**, not a risk.
- **Primary card = Chase Sapphire Preferred** (Visa, no foreign-transaction fee). Note: CSP charges
  a cash-advance fee at ATMs, and Japan is cash-heavy → a separate cash/ATM card is still needed.
- **Initial accommodation = Sakura House (Makoto), arrival → Jul 7 2026.** Long-term housing must be
  locked in before that stay ends.

## Goals

1. **Free-form task labels** — tag any checklist task; filter by tag.
2. **Inline due-date picker when adding a task** — a Notion-style mini-calendar popover (not the OS
   native date box).
3. **Notion-Calendar-style redesign** of the `#/calendar` page — week/month grid, mini-month
   navigator, and a dark event side-panel. The mini-calendar component is shared with #2.
4. **Seattle / US reframe** of pre-departure content.
5. **Personal facts reflected in data**, including a one-time auto-tick of completed items.
6. **More extensive, web-researched 2026 task list**, and a **cleanup** of tasks no longer relevant.
7. **Address autocomplete in the calendar event form** (a "Location" field).

## Non-goals

- No new frameworks, bundler, or CDNs. Everything stays vanilla ES modules with relative paths.
- No real account integrations (no Google/Notion sync). "Notion style" is purely visual.
- Researched 2026 dates remain `confidence`-flagged estimates ("verify closer"), never presented as certain.

---

## Workstream 1 — Free-form task labels

**Data:** new id-keyed store `jwh-tags-v1: { [taskId]: string[] }`. Tags attach to **any** task
(baked or custom) without mutating `tips.json` — identical pattern to `jwh-due-v1` and priority.
Add `KEYS.tags` to `lib/store.js`.

**Pure module:** `lib/tags.js` (unit-tested, import-safe in Node):
- `normalizeTag(s)` → trimmed, lowercased, max ~24 chars, strips `#`.
- `addTag(map, id, tag)` / `removeTag(map, id, tag)` → return **new** map (immutable).
- `tagsFor(map, id)` → `string[]`.
- `allTags(map)` → distinct sorted list (for the datalist + filter bar).
- `tagHue(tag)` → stable 0–359 hash for the chip color.

**UI (`checklist-page.js`):**
- In `checkItemHTML`, render tag chips after the `kind`/`due`/phase tags: each chip is a
  `<button>` `chip-tag` colored via `--h:<hue>` so a click filters. An `✕` on each chip (in the
  tag editor) removes it.
- New per-row 🏷 button (sibling of 📅/⚑) opens a small inline tag editor: a text `<input>` with a
  `<datalist>` of `allTags(...)` for reuse; Enter adds, chips show with remove. Same focus-restore
  discipline as the rest of the list (capture/restore across the `innerHTML` rebuild).
- **Filter:** a single active "tag filter" (string, view-only like `checkSearchQ`). Clicking a chip
  sets it; a small "🏷 tag · ✕" pill appears in the toolbar to clear. Combines with the existing
  search/smart-view filters. Never mutates data or progress math.

Every dynamic tag string goes through `esc()` before `innerHTML`; the input uses `.value` (DOM
property) only.

## Workstream 2 — Mini-calendar date-picker popover

**Shared component** (also used by Workstream 3's sidebar navigator):
- `lib/minical.js` — **pure** month-grid math: `monthGrid(year, month)` → weeks of ISO day cells
  (leading/trailing blanks), `addMonths`, weekday headers, today/selection helpers. Unit-tested.
- `datepicker.js` — the **popover**: renders a `minical` month grid, ‹ ›/Today nav, click a day →
  resolves an ISO date. Focus-trapped + Esc/backdrop dismiss (reuse the `lib/modal.js` openDialog
  pattern, or an anchored popover with the same key handling). Returns a Promise<string|null> so it
  drops straight into the existing `askDate` call sites.
- Replace `askDate` (currently a native `type="date"` modal) so the per-task 📅 and the new add
  composer both open this popover. `lib/modal.js`'s `askDate` becomes a thin wrapper over
  `datepicker.js` (keep the signature → no churn at call sites).

**Add-task composer:** add a "Due" control to **both** toolbar variants (pills + quick-line). It's a
button showing the chosen date (or "Due date") that opens the popover; the resolved ISO flows into
`customItem(task, phase, dueBy)` (already accepts `dueBy`). Clearing is supported (blank → no due).

Respect `prefers-reduced-motion` / `html[data-reduce-motion="on"]` (no popover animation when on).

## Workstream 3 — Notion-Calendar-style redesign (`#/calendar`)

Largest workstream. **Restyle + augment** the existing `calendar.js` (month/week/agenda already
exist) — do **not** rewrite its data flow (the single-path `saveUser → jwh:data-changed → render`
rule in CLAUDE.md stays intact; `render()` must never dispatch `jwh:data-changed`).

**Layout (`index.html` `#view-calendar` + new CSS):**
- **Left sidebar:** a `minical` **mini-month navigator** (reuses `lib/minical.js`); clicking a day
  jumps the main view to that date. Below it, the existing legend/category filter and (month mode)
  the deadline panel are restyled into the sidebar.
- **Main pane:** Notion-style week/month grid — quiet borders, a left time-rail in week view,
  today highlighted, category color as a left accent on event bars. Keep the existing `weekgrid.js`
  lane-packing and `SPAN_CAP` (multi-day >10d render on start day only).
- **Top bar:** `‹ Label ›` · `Today` · `[Month | Week | Agenda]` segmented control · `+ Add` ·
  Import/Export, restyled to the Notion top-right pattern.

**Event side-panel (replaces the current day popover / modal-edit for viewing an event):**
- Clicking an event opens a dark **slide-in side-panel** (right) showing title, time/date range,
  **location**, **tags**, note, category, and `Edit` / `Delete` / `✓ Going`. Edit reuses the
  existing `#evForm`. The panel is a focus-trapped region; Esc/backdrop closes; focus restores to the
  triggering event button. Day-add (click empty day/➕) still opens the add form.
- Accessibility: real `<button>` triggers (already the pattern), `aria` on the panel, keyboard
  focus restored across rebuilds.

**Theming:** the Notion dark look layers on the app's existing theme tokens; it must still respect
the light/dark theme toggle and reduce-motion. New styles live in the existing CSS file(s); no new
CSS framework.

> Consult `~/.claude/design-principles.md`, and the `frontend-design` / `emil-design-eng` skills
> during implementation for spacing, motion timings, and state polish.

## Workstream 4 — Seattle / US reframe (data)

In `tips.json`:
- Rename checklist phase **"Pre-Departure (Canada)" → "Pre-Departure (Seattle / US)"** and
  Americanize its items (banking, taxes, re-entry, phone, mail).
- Rename data key **`canadaNotes` → `homeNotes`**; replace content with US/Seattle equivalents
  (file US taxes while abroad + FBAR if >$10k in foreign accounts; keep a US bank account & address;
  USPS mail forwarding; absentee voting; storage; SIM/eSIM). Update the three code refs:
  `content.js` (`renderCanada` → `renderHome`), `index.html` (`#canadaSection`/heading), and
  `assets/i18n.js` (the translated heading). Surgical — only these refs.

## Workstream 5 — Personal facts reflected in data

**Data edits (`tips.json`):**
- **Visa:** remove visa-application entries from `bookByTimeline` / `timeSensitive`; reframe visa
  tasks to "carry CoE + passport-with-visa."
- **Vyvanse / NCD:** add a researched, sourced task **"ADHD meds — carry NCD import permit +
  prescription"** with a note on the 2026 lisdexamfetamine rule.
- **Chase Sapphire Preferred:** add a money note (primary card = CSP, Visa, no FTF; set a travel
  notice) and a **new** task "Sort a cash/ATM card for Japan" (CSP cash-advance fee + cash-heavy Japan).
- **Sakura House (Makoto):** add a baked `calendar` event **"Sakura House (Makoto) — initial stay,"
  arrival → 2026-07-07** (category housing). Add a task **"Lock in long-term housing"** with
  `dueBy 2026-07-07`. (Geocoded map pin optional — left to the user to drop, since the exact property
  address is unconfirmed.)

**Auto-tick of completed items (confirmed: yes).** Done-state lives in the user's browser
localStorage (`jwh-checklist-v1`), not in `tips.json`, so it can't be set by editing files. Add a
**one-time, idempotent seed** at boot (`main.js`), guarded by a new flag `jwh-seed-v1`:
- On boot, if the flag is unset: **merge** a fixed set of completed item ids into the checklist
  state (only **adds** checks, never removes), then set the flag. Runs exactly once per device.
- Seeded ids: the visa/CoE items, the NCD-permit item, passport-ready, and "book first
  accommodation." Add `KEYS.seed` to `store.js`. The merge is additive so it can't clobber existing
  user progress.

## Workstream 6 — Extensive, web-researched 2026 task list + cleanup

**Research (web, current 2026 rules):** expand `checklist[]` with sourced items — residence-card
pickup at NRT, ward-office move-in (jūminhyō) within 14 days, National Health Insurance, pension,
My Number, Japanese bank account, SIM/eSIM, hanko, re-entry permit, resident tax, plus the US-side
pre-departure items. Each new item carries `confidence` + `sources` per the data rules. This is the
heaviest piece → implemented **last**.

**Cleanup (owner asked to remove irrelevant tasks; show what was removed for veto):** remove
Canada-specific items superseded by Workstream 4, the now-done visa-application steps, and any task
that no longer applies to a US-departing owner. The removal list is surfaced in the implementation
PR/summary so the owner can veto individual drops.

## Workstream 7 — Address autocomplete in the calendar event form

- Add a **"Location"** field to `#evForm` (calendar add/edit) with the same Nominatim autocomplete
  used by the map's add-place box. **Extract** that search logic from `map.js` into a shared
  `lib/addrsearch.js` (debounced fetch, abort, jp `countrycodes`, suggestion list) and have both the
  map and the event form consume it (DRY; no behavior change to the map).
- Persist as `event.location`. Render it in the new event side-panel (Workstream 3). `pushEvent`
  already threads an address arg, so calendar/map event creation stays consistent.

---

## Files touched (summary)

- **New:** `lib/tags.js`, `lib/minical.js`, `datepicker.js`, `lib/addrsearch.js`.
- **Edited:** `checklist-page.js` (tags + composer due), `calendar.js` (Notion redesign + side-panel
  + Location), `map.js` (use `lib/addrsearch.js`), `content.js` (`renderHome`), `main.js` (seed),
  `lib/store.js` (`tags`, `seed` KEYS), `lib/modal.js` (`askDate` → popover wrapper), `index.html`
  (calendar layout, Location field, `homeNotes` heading), `assets/i18n.js` (frame strings),
  `data/tips.json` (Workstreams 4–6), the CSS file(s), `sw.js` (bump `CACHE` v47→v48 + add new
  modules to `ASSETS`).

## Implementation order

1. Pure libs + tests: `lib/tags.js`, `lib/minical.js` (TDD, `node --test`).
2. Date-picker popover (`datepicker.js`) + `askDate` wrapper + composer Due control (WS 2).
3. Task labels UI + filter (WS 1).
4. Data: Seattle reframe + personal facts + auto-tick seed (WS 4, 5).
5. `lib/addrsearch.js` extraction + event Location field (WS 7).
6. Notion calendar redesign + event side-panel (WS 3) — the big visual pass.
7. Web-researched task expansion + cleanup (WS 6), last.

## Testing / verification

- `node --test tests/lib.test.mjs` green, including new `lib/tags.js` + `lib/minical.js` cases.
- `python3 -m json.tool docs/data/tips.json` validates.
- Serve locally (`python3 -m http.server`), auth, and click through every route with **no console
  errors**: add a tagged task with a due date; filter by tag; open the calendar in week/month, use
  the mini-nav, open an event side-panel, add an event with an autocompleted Location; confirm the
  one-time seed ticks the right items exactly once (and not again on reload).
- Bump `sw.js` `CACHE` and verify fresh assets load (network-first).

## Risks / open items

- **Seed correctness:** the seeded done-ids must match real `tips.json` item ids after the WS 4–6
  edits land. The seed is wired **after** the data edits so ids are final; it's additive so a wrong
  id is a no-op, not data loss.
- **Calendar redesign scope:** the dark Notion theme must not regress the existing light theme,
  reduce-motion, or the WCAG-AA contrast fixes from recent commits. Re-verify category text contrast.
- **2026 dates:** stay `confidence`-flagged.
