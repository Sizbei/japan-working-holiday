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
  // NOTE: MONTHS is ALREADY imported from './lib/dates.js' in calendar.js — do NOT re-import it
  // (duplicate binding = SyntaxError). Import only these three from minical:
  import { monthGrid, addMonths, WEEKDAYS_SHORT } from './lib/minical.js';
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
  Call `renderMiniNav()` once per `render()`. **Listener safety:** `renderMiniNav` sets `host.innerHTML = …` (which discards the old nodes *and* their listeners) then re-wires the fresh nodes, so calling it each render does NOT stack listeners. Call it AFTER the `#calView` rebuild. `renderMiniNav` is view-only — it never dispatches `jwh:data-changed`.

- [ ] **Step 3 — CSS: the new 3-column layout + mini-nav (REQUIRED — the HTML restructure breaks the current grid).** The current `.cal-layout` is `grid-template-columns: minmax(0,1fr) 300px` assuming `#calPanel` is a direct child (2nd column). After Step 1, `#calPanel` is nested in `.cal-sidebar` and there's a new `#calSidePanel` — so update the grid:
  ```css
  .cal-layout{ display:grid; grid-template-columns: 240px minmax(0,1fr); gap: var(--s4); align-items:start; }
  .cal-sidebar{ display:flex; flex-direction:column; gap: var(--s3); }
  /* #calSidePanel is a fixed-position overlay (Task 3), NOT a grid column — so the grid stays 2-col */
  ```
  (Keeping the side-panel fixed-position avoids a 3-column reflow when it opens/closes.) Then the mini-cal: tight 7-col table, `--ink-faint` weekday heads, `--bg-soft` hover, `.mn-today` ringed with `--indigo`, `.mn-out` faded. On mobile (<860px) the sidebar collapses above the grid (reuse the existing single-column `.cal-layout` breakpoint — confirm it still targets the restructured layout).

- [ ] **Step 4 — Verify (served).** `node --check docs/assets/calendar.js`; suite green. **Live:** the mini-nav shows the current month, ‹ › steps months (main view follows), clicking a day jumps the main grid; focus restores; no console errors; mobile collapses cleanly. WCAG-AA spot-check the mini-nav text. Get owner sign-off on the navigator look.

- [ ] **Step 5 — Commit:** `feat(calendar): mini-month navigator sidebar (reuses lib/minical)`.

---

### Task 2: Notion restyle — toolbar, month grid, legend

**Goal:** The core visual pass — quiet borders, generous spacing, a segmented mode control, a calm month grid with today highlighted and category color as a subtle **left accent** on event chips (not a loud fill).

**Files:** `docs/assets/style.css` (bulk), minor `calendar.js`/`index.html` class tweaks if needed for the segmented control.

- [ ] **Step 1 — Toolbar.** Restyle `.cal-toolbar`/`.cal-nav`/`.cal-actions` to a single clean bar: `‹ Label ›` left, `Today` + segmented `[Month | Week | Agenda]` (style `.cal-modes` as a true segmented control — one rounded container, active segment filled with `--bg-elevated`+shadow, others transparent) + `+ Add`/Import/Export as quiet ghost buttons on the right. Use `--line` hairlines, `--r-md` radii.

- [ ] **Step 2 — Month grid.** Restyle `.cal-grid`/`.cal-cell`/`.cal-date`/`.cal-chip`: quiet 1px `--line` cell borders (or a single grid hairline), `--bg-elevated` cells, `.today` marked with an `--indigo` date pill (not a heavy border), date number top-left in `--ink-soft`.
  **Event chips (the contrast-critical change — do it explicitly):** the chip MUST set its OWN background + text so it WINS over the existing `.cat-<cat>{ background: var(--c-<cat>) }` rule (otherwise the category fill leaks through and the contrast pre-computation below is void). Use: `background: var(--bg-soft); color: var(--ink); border-left: 3px solid var(--c-<cat>);` plus a small category **dot** (`var(--c-<cat>)`) before the title — so category identity is conveyed by **bar + dot + label text**, not color alone (WCAG 1.4.1, deuteranopia-safe). Ensure the new `.cal-chip` rule's specificity/order overrides `.cat-<cat>` (append after it, or scope as `.cal-chip.cat-<cat>`). Keep the density meter + ticket glyph but quieter; preserve the 3-chip + "+N" overflow.
  **Pre-computed contrast (so Task 4 isn't a surprise):** `--ink` on `--bg-soft` — light `#1a1a22`/`#fffdf8` ≈ 16:1 ✓; dark `#ece9e2`/`#1d1d26` ≈ 13:1 ✓. Because the chip background is now `--bg-soft` (NOT the category color), the old failure mode (light ink on a mid-value `--c-imported` fill ≈ 1.2:1) is eliminated. The `--ink-soft` date numbers on `--bg-elevated` must also clear 4.5:1 — verify (light `#595550`/`#ffffff` ≈ 7:1 ✓; dark `#b3aea4`/`#262631` ≈ 7:1 ✓).
  **Density trade-off (acknowledge for the owner):** moving from loud category fills to quiet bg-soft + accent trades at-a-glance color density for calm legibility. The bar+dot+label keeps category identity; but if the served preview reads as "too empty / I see fewer events," the fallback is a slightly bolder accent (full left third tinted with `color-mix(--c-<cat> 14%, --bg-soft)`) — surface this choice at the Task 2 preview gate.

- [ ] **Step 3 — Legend.** Restyle `.cal-legend`/`.lg` as small pill toggles with a category dot + label (not full category-fill buttons); `.off` = muted. Keep it the filter (toggles `hiddenCats`).

- [ ] **Step 4 — Verify (served + contrast).** Re-verify WCAG-AA on chip text in BOTH themes (now `--ink` on `--bg-soft` — should pass with margin; confirm). Click through month mode, legend filtering, today highlight, overflow. Owner sign-off on the month aesthetic.

- [ ] **Step 5 — Commit:** `feat(calendar): Notion-style toolbar + month grid + legend`.

---

### Task 3: Event side-panel (slide-in detail)

**Goal:** Clicking an event opens a calm slide-in panel on the right (`#calSidePanel`) showing title, date/time range, **location** (the `area` field from Plan 4), category, note, and actions (Edit → existing `openModal`, Delete, ✓ Going, + Google). It **replaces `openDetail()`** as the event-detail surface.

**Surface model (resolve the sprawl — 4 surfaces, each one job):**
- **Mini-nav** (Task 1) = month navigation only.
- **Day-popover** (unchanged) = "what's on THIS day" when you click a day *cell* + the `+ Add` affordance. Its event links (`.pop-open`) now **dismiss the popover, then open the side-panel** (not `openDetail`).
- **Side-panel** (new) = the single event-DETAIL surface (read for baked, with Edit→modal for user events). Replaces `openDetail` everywhere it's called (agenda titles, week chips/bars, popover links, AND the right-click context-menu `open` action — calendar.js calls `openDetail` at ~6 sites; reroute all of them).
- **Modal** (`openModal`, unchanged) = event CREATE + EDIT form only (opened from `+ Add`, empty-cell/`+` day-add, and the side-panel's Edit button).
No surface mutates data except the modal and the side-panel's Delete/Going, which go through the existing handlers (single data path).

**Files:** `docs/assets/calendar.js` (new `openSidePanel(ev)` + close/focus-trap; reroute the event-click handlers that currently call `openDetail`/`openModal` for viewing), `docs/assets/style.css`.

- [ ] **Step 1 — `openSidePanel(ev)`.** Render `#calSidePanel` (esc all) with the event detail + an actions row. Focus-trapped region: Esc + backdrop/✕ closes. Edit reuses `openModal(ev)`; Delete reuses `deleteUserEvent`; Going reuses the toggle. Baked events show read-only fields + Copy/Reset-date (as `openDetail` does today). Reuse `lib/calevents.js` `eventMenuSpec` where possible.
  - **Focus restore:** capture the triggering element; on close, restore focus to it IF still in the DOM (`document.contains(trigger)`), else fall back to `#calAdd` (the trigger may be a `#calView` event button destroyed by a re-render).
  - **Delete / single-path:** the Delete action calls the existing `deleteUserEvent` → `saveUser` → `jwh:data-changed` → `render` (do NOT call `render()` here — single path). The side-panel listens for `jwh:data-changed`: if the open event's id is no longer in `allEvents()`, it auto-closes (+ restores focus). Edit→modal→save likewise re-renders via the single path; the panel refreshes its content from the updated event (or closes if gone).
- [ ] **Step 2 — Reroute view clicks (ALL `openDetail` call sites).** Grep `openDetail(` in `calendar.js` (~6 sites: month/week/agenda event handlers, the popover `.pop-open` link, AND the right-click context-menu `open` action). Reroute every one to `openSidePanel(ev)`. The popover `.pop-open` handler must **dismiss the popover first** (`dismissPopover()`), then `openSidePanel(ev)`. Day-add (empty cell / `+` / `jwh:cal-quickadd`) STILL opens `openModal(null, date)` for creation — do not touch the create paths or the gesture/long-press hooks.
- [ ] **Step 3 — CSS (pinned values).** `.cal-sidepanel`: `position:fixed`, right-anchored, `top` below the header, width `min(360px, 92vw)`, `--bg-elevated`, `--shadow-lg`, `--line` left border, `z-index` above the grid (below the modal's z). **Motion:** slide in via `transform: translateX(100%)→0` with `transition: transform var(--dur-2) var(--ease-out)` (180ms, entrance); exit ~150ms ease-in. A subtle backdrop (`color-mix(#000 28%, transparent)`) fades with it. **Reduce-motion:** when `html[data-reduce-motion="on"]` OR `prefers-reduced-motion`, drop the transform transition (panel appears instantly; opacity-only is fine). **Mobile (<700px, reuse the existing week-mode breakpoint):** becomes a **bottom sheet** — `position:fixed; left:0; right:0; bottom:0; width:100%; max-height:80vh; overflow:auto;` sliding up via `translateY`; same backdrop; same reduce-motion rule. Quiet typographic detail rows (icon + label).
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
