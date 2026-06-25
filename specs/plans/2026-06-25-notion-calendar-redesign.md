# Notion-Calendar-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> **⚠️ EXECUTION GATE:** This is a high-visual-stakes redesign. The owner has a high UI-taste bar (past low-taste UI was rejected). **Do NOT merge or treat as done on static checks alone** — each visual task must be checked against a **served live preview** and given the owner's sign-off before the branch is considered finished. Build against `cd docs && python3 -m http.server`, `localStorage['jwh-auth-v1']='ok'`, `#/calendar`. Consult `~/.claude/design-principles.md` + the `frontend-design`/`emil-design-eng` skills for spacing, motion, and state polish.

**Goal:** Restyle the `#/calendar` page to a clean Notion-Calendar aesthetic and add a left **mini-month navigator** and a **slide-in event side-panel**, without changing the calendar's data model, modes, or single-path data flow.

**Architecture:** Pure restyle + two additive components. Reuse `lib/minical.js` (already shipped) for the navigator. The existing month/week/agenda modes, the legend-as-filter, `SPAN_CAP`, `weekgrid.js` lane-packing, and the `saveUser → jwh:data-changed → render` single path all stay intact — `render()` must never dispatch. The event side-panel reuses the existing `openModal`/event data; it replaces the day-popover's "open detail" path with a slide-in panel.

**Tech Stack:** Vanilla ES modules, no build. CSS via existing theme tokens (`--bg`, `--bg-elevated`, `--ink`, `--line`, `--indigo`, `--c-<cat>`/`--c-<cat>-ink`, `--r-*`, `--shadow-*`, `--dur-*`). Tests: `node --test tests/lib.test.mjs` (logic unchanged; mostly a visual change).

## Global Constraints

- Zero-build, dependency-free vanilla ES modules; GitHub Pages from `/docs`.
- **Preserve behavior:** month/week/agenda modes, the legend category filter (`hiddenCats`), `SPAN_CAP` (>10-day events render on start day only), `weekgrid.js` packing, `.ics` import/export, per-event GCal links, the `jwh:cal-quickadd`/long-press hooks, event search.
- **Single-path data flow (CLAUDE.md):** mutations go through `saveUser`/`saveOverrides` → `jwh:data-changed` → `render()`. `render()` must NEVER dispatch `jwh:data-changed`. The mini-nav + side-panel are view/navigation only (no data mutation except via the existing edit/delete paths).
- **Every dynamic string through `esc()`** before `innerHTML`.
- **Accessibility:** real `<button>` controls; restore focus across `innerHTML` rebuilds; the side-panel is a focus-trapped region (Esc/backdrop closes, focus returns to the triggering event). Honor `html[data-reduce-motion="on"]` AND `prefers-reduced-motion` (no slide animation when set).
- **WCAG AA (CRITICAL — past regressions here):** every event chip/bar/agenda-row category text must stay ≥4.5:1 in BOTH themes. The current dark-mode rule renders category color as TEXT on a dark bg (≥10:1); if the redesign lightens any event-bar background, re-tune category-on-light to ≥4.5:1. Re-verify after every visual task.
- Service worker: bump `CACHE` in `docs/sw.js` (`jwh-v113` → `jwh-v114`).
- Run tests from the repo ROOT.

## File Structure

- **Modify:** `docs/index.html` (calendar layout → sidebar + main), `docs/assets/calendar.js` (mini-nav render + wiring; event side-panel; segmented mode control), `docs/assets/style.css` (the Notion restyle — the bulk), `docs/sw.js`.
- **Reuse (no change):** `docs/assets/lib/minical.js`, `docs/assets/lib/weekgrid.js`.
- No new modules expected (keep it in `calendar.js` unless a file grows unwieldy, in which case extract `calendar-sidepanel.js` and note it).

---

### Task 1: Layout restructure + mini-month navigator

**Goal:** Wrap the calendar in a two-column shell (left sidebar, right main pane) and render a `minical`-powered month navigator in the sidebar; clicking a day jumps the main view to that date/month.

**Files:** `docs/index.html` (`.cal-layout`), `docs/assets/calendar.js` (new `renderMiniNav()` + wiring + a `jumpToDate(iso)` helper), `docs/assets/style.css`.

- [ ] **Step 1 — index.html: restructure `.cal-layout`.** Currently `.cal-layout` holds `#calView` + `#calPanel`. Restructure to:
  ```html
  <div class="cal-layout">
    <aside class="cal-sidebar" aria-label="Calendar navigation">
      <div id="calMiniNav" class="cal-mininav"></div>
      <aside id="calPanel" class="cal-panel" aria-label="This month's deadlines"></aside>
    </aside>
    <div id="calView"></div>
    <div id="calSidePanel" class="cal-sidepanel" hidden aria-label="Event details"></div>
  </div>
  ```
  (The deadline `#calPanel` moves into the left sidebar under the mini-nav; `#calSidePanel` is the new right slide-in, added in Task 3.)

- [ ] **Step 2 — calendar.js: `renderMiniNav()`.** Add a function that renders a compact month grid for the *currently-viewed* month using `monthGrid(viewY, viewM)` from `lib/minical.js`, with ‹ › month-step controls and a `Today` affordance. Mark the cell for `TODAY` and (in month mode) the focused day. Markup pattern (esc all):
  ```js
  import { monthGrid, addMonths, MONTHS, WEEKDAYS_SHORT } from './lib/minical.js';
  function renderMiniNav() {
    const host = $('#calMiniNav'); if (!host) return;
    const weeks = monthGrid(viewY, viewM);
    const rows = weeks.map(w => `<tr>${w.map(c =>
      `<td><button type="button" class="mn-day${c.inMonth ? '' : ' mn-out'}${c.iso === TODAY ? ' mn-today' : ''}" data-iso="${c.iso}" aria-label="${c.iso}">${c.day}</button></td>`
    ).join('')}</tr>`).join('');
    host.innerHTML = `
      <div class="mn-head">
        <button type="button" class="mn-arrow" data-mn="-1" aria-label="Previous month">‹</button>
        <span class="mn-title">${MONTHS[viewM]} ${viewY}</span>
        <button type="button" class="mn-arrow" data-mn="1" aria-label="Next month">›</button>
      </div>
      <table class="mn-grid"><thead><tr>${WEEKDAYS_SHORT.map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    host.querySelectorAll('[data-mn]').forEach(b => b.addEventListener('click', () => { ({ year: viewY, month: viewM } = addMonths(viewY, viewM, +b.dataset.mn)); render(); }));
    host.querySelectorAll('.mn-day[data-iso]').forEach(b => b.addEventListener('click', () => jumpToDate(b.dataset.iso)));
  }
  // jump the main view to a date (month mode shows that month; week mode anchors that week)
  function jumpToDate(iso) {
    const t = parseISO(iso); if (!t) return;
    viewY = t.getUTCFullYear(); viewM = t.getUTCMonth();
    if (mode === 'week') weekAnchor = iso;
    render();
  }
  ```
  Call `renderMiniNav()` from `render()` (it's outside `#calView`, so it survives `#calView` rebuilds but must be re-rendered when the month changes — call it each `render()`).

- [ ] **Step 3 — CSS: sidebar + mini-nav.** Append a Notion-clean mini-cal: tight 7-col table, `--ink-faint` weekday heads, `--bg-soft` hover, `.mn-today` ringed with `--indigo`, `.mn-out` faded. The sidebar is a fixed-ish ~240px column; the main pane flexes. On mobile (<860px) the sidebar collapses above the grid (reuse the existing single-column `.cal-layout` breakpoint).

- [ ] **Step 4 — Verify (served).** `node --check docs/assets/calendar.js`; suite green. **Live:** the mini-nav shows the current month, ‹ › steps months (main view follows), clicking a day jumps the main grid; focus restores; no console errors; mobile collapses cleanly. WCAG-AA spot-check the mini-nav text. Get owner sign-off on the navigator look.

- [ ] **Step 5 — Commit:** `feat(calendar): mini-month navigator sidebar (reuses lib/minical)`.

---

### Task 2: Notion restyle — toolbar, month grid, legend

**Goal:** The core visual pass — quiet borders, generous spacing, a segmented mode control, a calm month grid with today highlighted and category color as a subtle **left accent** on event chips (not a loud fill).

**Files:** `docs/assets/style.css` (bulk), minor `calendar.js`/`index.html` class tweaks if needed for the segmented control.

- [ ] **Step 1 — Toolbar.** Restyle `.cal-toolbar`/`.cal-nav`/`.cal-actions` to a single clean bar: `‹ Label ›` left, `Today` + segmented `[Month | Week | Agenda]` (style `.cal-modes` as a true segmented control — one rounded container, active segment filled with `--bg-elevated`+shadow, others transparent) + `+ Add`/Import/Export as quiet ghost buttons on the right. Use `--line` hairlines, `--r-md` radii.

- [ ] **Step 2 — Month grid.** Restyle `.cal-grid`/`.cal-cell`/`.cal-date`/`.cal-chip`: quiet 1px `--line` cell borders (or a single grid hairline), `--bg-elevated` cells, `.today` marked with an `--indigo` date pill (not a heavy border), date number top-left in `--ink-soft`. **Event chips:** calm `--bg-soft` background + a 3px left accent in `--c-<cat>` + `--ink` text (this fixes the contrast risk — text is `--ink` on `--bg-soft`, not category-on-category). Keep the density meter + ticket glyph but quieter. Preserve the 3-chip + "+N" overflow.

- [ ] **Step 3 — Legend.** Restyle `.cal-legend`/`.lg` as small pill toggles with a category dot + label (not full category-fill buttons); `.off` = muted. Keep it the filter (toggles `hiddenCats`).

- [ ] **Step 4 — Verify (served + contrast).** Re-verify WCAG-AA on chip text in BOTH themes (now `--ink` on `--bg-soft` — should pass with margin; confirm). Click through month mode, legend filtering, today highlight, overflow. Owner sign-off on the month aesthetic.

- [ ] **Step 5 — Commit:** `feat(calendar): Notion-style toolbar + month grid + legend`.

---

### Task 3: Event side-panel (slide-in detail)

**Goal:** Clicking an event opens a dark, calm slide-in panel on the right (`#calSidePanel`) showing title, date/time range, **location** (the `area` field from Plan 4), category, note, and actions (Edit → existing `openModal`, Delete, ✓ Going, + Google). Replaces the read-only `openDetail()` popup path; the day-popover's event links open this panel.

**Files:** `docs/assets/calendar.js` (new `openSidePanel(ev)` + close/focus-trap; reroute the event-click handlers that currently call `openDetail`/`openModal` for viewing), `docs/assets/style.css`.

- [ ] **Step 1 — `openSidePanel(ev)`.** Render `#calSidePanel` (esc all) with the event detail + an actions row. Focus-trapped region: Esc + backdrop/✕ closes and restores focus to the triggering event button; slide-in respects reduce-motion (no transform animation when set). Edit reuses `openModal(ev)`; Delete reuses `deleteUserEvent`; Going reuses the toggle. Baked events show read-only fields + Copy/Reset-date (as `openDetail` does today).
  - Reuse the existing event menu logic where possible (`lib/calevents.js` `eventMenuSpec`).
- [ ] **Step 2 — Reroute view clicks.** The agenda title buttons, week chips/bars, and day-popover `pop-open` currently call `openDetail`/`openModal`. Point the *view* (read) action at `openSidePanel(ev)`. Day-add (empty cell / `+`) still opens `openModal(null, date)` for creation.
- [ ] **Step 3 — CSS.** `.cal-sidepanel`: right-anchored, `--bg-elevated`, `--shadow-lg`, `--line` left border, slides in from the right (`transform: translateX` gated on reduce-motion). On mobile it becomes a bottom sheet (full-width). Quiet typographic detail rows (icon + label).
- [ ] **Step 4 — Verify (served).** Click an event in month/week/agenda → panel slides in with correct detail incl. location; Edit/Delete/Going work and re-render via the single data path; Esc/backdrop closes + focus restores; reduce-motion disables the slide; mobile bottom-sheet works. Owner sign-off.
- [ ] **Step 5 — Commit:** `feat(calendar): slide-in event side-panel`.

---

### Task 4: Dark Notion theme + WCAG-AA re-verification

**Goal:** Ensure the whole redesign reads as a coherent calm surface in BOTH themes, and **re-verify all category-text contrast** (the historical regression point).

**Files:** `docs/assets/style.css` (`[data-theme="dark"]` calendar overrides).

- [ ] **Step 1 — Dark pass.** Tune the new surfaces (mini-nav, segmented control, month cells, side-panel) for dark: `--bg-elevated`/`--bg-sunk` layering, `--line` hairlines visible but quiet, the `--indigo` today/active accents legible.
- [ ] **Step 2 — Contrast audit.** For EVERY event-text surface (`.cal-chip`, `.wk-bar`, `.wk-chip`, `.wkl-ev`, `.agenda-*`, mini-nav, side-panel) compute/verify ≥4.5:1 in both themes. Since Task 2 moved chip text to `--ink` on `--bg-soft`, the chip case is theme-token-driven (passes). Confirm the week-bar/agenda category text didn't regress. Document the worst-case hue checked.
- [ ] **Step 3 — Reduce-motion audit.** Confirm no calendar animation (mini-nav, side-panel slide, view swaps) plays when `html[data-reduce-motion="on"]` OR `prefers-reduced-motion`.
- [ ] **Step 4 — Verify (served, both themes + reduce-motion) + owner sign-off.**
- [ ] **Step 5 — Commit:** `style(calendar): dark Notion theme + AA contrast re-verify`.

---

### Task 5: Service-worker bump

- [ ] **Step 1.** `docs/sw.js`: `const CACHE = 'jwh-v113';` → `'jwh-v114';` (+ add `assets/calendar-sidepanel.js` to `ASSETS` IF Task 3 extracted it; otherwise no ASSETS change).
- [ ] **Step 2.** `node --check docs/sw.js`; `node --test tests/lib.test.mjs` green.
- [ ] **Step 3.** Commit: `chore(sw): bump to jwh-v114 for the calendar redesign`.

---

## Self-Review

**Spec coverage (WS3 — Notion calendar redesign):**
- Left mini-month navigator (reuses `minical`) → Task 1. ✓
- Notion-style toolbar (segmented control) + month grid + legend → Task 2. ✓
- Slide-in event side-panel with location/edit/delete/going → Task 3. ✓
- Dark Notion theme + AA contrast re-verify + reduce-motion → Task 4. ✓
- SW bump → Task 5. ✓
- Preserved: modes, legend filter, SPAN_CAP, weekgrid packing, ics, single data path, quickadd hooks. ✓

**Placeholder scan:** representative markup/CSS direction is given for each task; this is a *visual* plan, so exact pixel values are intentionally tuned against the live preview (the execution gate) rather than frozen here — that is the correct altitude for a redesign, not a placeholder.

**Risks flagged for review:** (1) **WCAG-AA** category-text contrast — the single biggest regression risk; Task 2's move to `--ink`-on-`--bg-soft` chips de-risks it, and Task 4 re-audits every surface. (2) **Side-panel vs popover** — must not break the long-press/quickadd hooks or the single data path; reuse existing edit/delete/going handlers, don't fork them. (3) **`render()` must not dispatch** — the mini-nav/side-panel are view-only. (4) **Scope:** this is the largest plan; each task is independently shippable + preview-gated. (5) **Taste:** execution is explicitly gated on the owner's served-preview sign-off per their UI-taste history — do not mark done on static checks.
