# Collapsible Accordion (shared) + Checklist Readability — Design Spec

**Date:** 2026-06-22
**Status:** draft for review → plan
**Scope:** a shared animated-accordion component used by the **checklist** (phases), **budget** (cost groups), and **packing** (categories). Also delivers the "make the checklist easier to read — hide sections" ask.

## 1. Goal

One reusable, accessible, **animated** collapsible-section component. Each section has a clickable header (with a count + a rotating chevron) and a panel that smoothly expands/collapses; collapsed state is remembered per-section across reloads. Respects the user's **Reduce-motion** setting (instant, no animation). First consumer: the yearlong checklist (collapse phases you're done thinking about); also reused by budget and packing.

## 2. Component — `assets/collapse.js` + CSS

### Markup contract (pages render this; the component wires behavior)
```html
<section class="acc" data-acc="<stable-section-id>">
  <button type="button" class="acc-head" aria-expanded="true" aria-controls="acc-panel-<id>">
    <span class="acc-chevron" aria-hidden="true">›</span>
    <span class="acc-title">Health</span>
    <span class="acc-count">3/7</span>
  </button>
  <div class="acc-panel" id="acc-panel-<id>" role="region" aria-label="Health">
    <div class="acc-inner"> … section content … </div>
  </div>
</section>
```

### CSS (animation via the grid-rows trick — no JS height measurement)
```css
.acc-panel { display: grid; grid-template-rows: 1fr; transition: grid-template-rows var(--t-base) ease; }
.acc.is-collapsed .acc-panel { grid-template-rows: 0fr; }
.acc-panel > .acc-inner { overflow: hidden; min-height: 0; }
.acc-chevron { display:inline-block; transition: transform var(--t-base) ease; }
.acc.is-collapsed .acc-chevron { transform: rotate(-90deg); }   /* ›  → points right when collapsed */
html[data-reduce-motion="on"] .acc-panel,
html[data-reduce-motion="on"] .acc-chevron { transition: none; }   /* honor the existing reduce-motion toggle */
```

### JS — `assets/collapse.js`
```
export function mountAccordion(container, { allToggle } = {})
```
- For each `.acc[data-acc]` in `container`: read persisted state (`jwh-collapse-v1`, a `{ "<id>": true }` map of collapsed ids) → set `.is-collapsed` + `aria-expanded` accordingly on load.
- Click on `.acc-head` (or Enter/Space — it's a real `<button>`): toggle `.is-collapsed`, flip `aria-expanded`, persist the id in the map (set true when collapsed, delete when expanded). The grid-rows CSS animates it; reduce-motion users get an instant snap.
- `allToggle` (optional): if the page passes a "collapse all / expand all" button selector, wire it to collapse/expand every section in the container and persist.
- Re-runnable: a page that re-renders its list calls `mountAccordion(container)` again after the rebuild to re-apply state (idempotent — it reads from storage each time).
- Storage helpers live in `collapse.js` (`loadCollapsed()→Set`, `setCollapsed(id, bool)`), using `lib/store.js` `get/set` with `KEYS.collapse`.

`KEYS` add: `collapse: 'jwh-collapse-v1'`.

## 3. Checklist application (`content.js`)

Wrap each phase block in the `.acc` markup:
- The phase `<h3>` becomes the `.acc-head` button content (phase name + window); add an `.acc-count` showing `done/total` for that phase; the phase's `.check-list` (+ its items) goes in `.acc-panel > .acc-inner`.
- After `renderChecklist()` rebuilds `#checkPhases`, call `mountAccordion($('#checkPhases'))` to wire + restore collapse state. (The existing drag-reorder `makeSortable` on each `.check-list` still works — it operates on the list inside the panel.)
- Collapse state keys: `chk-phase-<phaseIndex>` (stable across renders).
- This is purely additive — hide-done, due-soon view, priority flags, progress, celebrate all unchanged. Collapsing a phase just hides its items for readability; collapsed phases still count toward progress.
- **Interaction note:** in the "Due soon" view (flat list, not phased) the accordion isn't applied (no phases) — only the phase view gets accordions.

## 4. Budget & Packing

Budget (cost groups) and Packing (categories) render their groups with the same `.acc` markup and call `mountAccordion(container)`. Details live in their own specs (`2026-06-22-budget-page.md` §5, `2026-06-22-packing-page.md` §5) which reference this component. Packing additionally passes an `allToggle` (collapse-all) per its "super checklist" scope.

## 5. Accessibility / motion

- Headers are real `<button>`s with `aria-expanded` + `aria-controls`; panels are `role="region"` labelled by the title. Keyboard: Tab to header, Enter/Space toggles. Collapsed panels are visually hidden via `0fr` rows + `overflow:hidden` (content is not focusable when collapsed because it has zero height — acceptable; if stricter hiding is needed, set `hidden`/`inert` on collapse, but the grid approach keeps the animation — v1 uses the grid approach and additionally toggles `inert` on the panel when collapsed so its controls aren't tab-reachable).
- Reduce-motion: transitions disabled (instant) via the existing `html[data-reduce-motion="on"]`.

## 6. Testing

- Mostly DOM glue → browser-verified. Optional tiny pure test for the collapsed-map toggle (`setCollapsed`/`loadCollapsed` round-trip) if it lands in a lib; otherwise browser-verify: collapse a checklist phase → it animates closed, the chevron rotates, count shows; reload → it's still collapsed; toggle Reduce-motion → no animation; collapsed phase's items aren't tab-reachable; drag-reorder still works in an expanded phase; 0 console errors.
- Existing suites stay green.

## 7. Files

- **Create:** `assets/collapse.js`, CSS in `assets/style.css` (`.acc*` rules).
- **Modify:** `assets/content.js` (wrap phases + `mountAccordion`), `lib/store.js` (`KEYS.collapse`), `index.html` (no structural change for checklist — phases are JS-rendered; budget/packing add their views per their specs), `sw.js` (precache `assets/collapse.js` + CACHE bump).

## 8. Out of scope

Nested accordions, remembering scroll position, per-device vs synced collapse state (it's device-local like everything else), drag-to-reorder whole sections.
