# Compact pages + Notion viewport-fit calendar — plan v2 (2026-07-09)

**Owner asks:** (1) toggle the big title card off (kanji + serif title + lede ≈ 140px/page); (2) with it off, the calendar fits **one viewport like Notion** — no document scroll.
**Decisions (owner):** global ⚙ setting · full viewport fit on desktop.

> **v2 after adversarial review (2 Opus critics, both DO NOT SIGN OFF on v1).** v1's two central mechanisms were wrong: the "reveal `#routeH1` in the topbar" premise was false (`#routeH1` lives inside `<main>`, index.html:70-71 — not in the topbar), and the height-lock's flex chain omitted two `display:block` ancestors so nothing would have compressed. v1's sr-only treatment also created invisible kanji tab stops (lang.js:82-89 promotes every `.jp` to a focusable button — WCAG 2.4.7). All resolved by design changes below, not patches.

## Design (v2)

**Compact ≠ title-less. Compact = mini-title.** Under `html[data-compact="on"]`, every `.pillar-head` collapses to a **single small visible line** (the `h2` at ~0.95rem, margins collapsed); the kanji `.jp` span and the `.lede` go `display:none`. Wins vs v1:
- Focus/orientation uniform on all 13 routes (the router's `h1,h2,h3` focus target stays *visible* — no explore/deadlines divergence, no wrong-heading capture).
- `display:none` removes the kanji from tab order — kills the invisible-tab-stop WCAG violation outright (`wireJpAccents` can't focus a `display:none` node).
- `#routeH1` untouched (stays sr-only). No topbar surgery.
- Reclaims ~115 of the ~140px.
**Known accepted loss:** `#goingCount` / `#roomCount` live inside their ledes → hidden in compact (write-only nodes, nothing breaks; the info exists on the pages themselves).

**Viewport fit = a complete var-independent flex column** (not `calc(100dvh − --header-h − --nav-h)`, whose vars under-subtract when the 11-link nav wraps at 821–1080px → hard clip under `overflow:hidden`):
```
html[data-compact="on"] body[data-route="calendar"] (>820px only):
  body            height:100dvh; display:flex; flex-direction:column   ← self-corrects on nav wrap
  main            flex:1; min-height:0; overflow:hidden
  #view-calendar.is-active, #calendarSection, #calView
                  display:flex; flex-direction:column; min-height:0    ← the two block ancestors v1 omitted
  .cal-layout     flex:1; min-height:0                                  (stays grid: sidebar | calView)
  .cal-grid       flex:1; min-height:0; overflow-y:auto; grid-auto-rows:minmax(56px,1fr)
  .cal-sidebar    overflow-y:auto; max-height:100%
  .wk2            flex:1; min-height:0;  .wk2-scroll  flex:1; min-height:0  (replaces the 62vh cap in compact)
  agenda host     overflow-y:auto
```
**Busy-month reality (critic #5):** `1fr` rows can't shrink below cell min-content (~99px with 3 chips + "+N more"), so row-sizing alone cannot fit July. Pair with **content compression in JS**: `MONTH_SINGLES` becomes compact-aware (`dataset.compact==='on' ? 2 : 3`) so the "+N more" count stays accurate. (Rejected: CSS `nth-of-type` hiding — it desyncs the +N count; the mobile rule at style.css:828 has that flaw as precedent, don't copy it.)

**Side panel on internal scroll (critic #3):** `positionSidePanel` anchors via `window.scrollY` (calendar.js:583) and has **no scroll listener** — in compact the grid scrolls internally and the panel would visibly detach. Fix: mirror the day-popover's existing pattern (calendar.js:530-533 listens on `window` AND `#main`) — dismiss the side panel on `#main`/grid scroll in compact.

**alignRail:** no-op in compact (its document-geometry math assumes page scroll); `.cal-panel`'s CSS fallback (`max-height:min(calc(100vh−4rem),700px); overflow:auto`, style.css:850) takes over — internal scroll, harmless.

## Stages

### S1 — Toggle + mini-title (all routes)
- `lib/store.js`: `compact: 'jwh-compact-v1'` (raw `'on'|''`).
- `guide.js`: settings row "Compact pages — small titles, more content"; `applyCompact()` → `html[data-compact]`; export; call early in main.js boot (applyHomeLayout pattern, no flash).
- CSS: compact `.pillar-head` → single-line small h2; `.pillar-head .jp`, `.lede` → `display:none`; reduce `main` top padding.
- **Parity test** (critic nit): mirror the home-layout guard (lib.test.mjs:337-357) — assert the settings control + KEYS entry exist together.
- Verify: toggle live + persists; focus lands on the (visible) mini-title on every route; a Tab pass shows NO invisible stops; dashboard hero unaffected.

### S2 — Calendar viewport fit (compact ∧ >820px)
- The flex column above, exactly as specified (every ancestor threaded).
- `MONTH_SINGLES` compact-aware (JS, keeps +N honest).
- Side-panel scroll-dismiss on `#main`/grid scroll (compact only).
- alignRail compact guard.
- Toolbar densify: quick-add + search share the toolbar row (selectors pinned at build).
- Verify headless at **1300×900 and 1300×700**: `scrollingElement.scrollHeight === clientHeight` on month/week/day/agenda; July (busy) fits at 900 with 2-chip cells; at 700 the grid scrolls *internally* (never clips); side panel dismisses on internal scroll; **non-compact and ≤820px byte-identical to today** (PR #48 regression gate); the nav-wrap width (~1000px) doesn't clip (the flex approach self-corrects — verify explicitly).

### S3 — Review + ship
Opus critic over the diff (focus matrix across routes; compact×route×width matrix; the flex chain in computed reality; popover + People-drawer behavior in the locked layout); SW bump; live smoke.

**Out of scope:** mobile viewport-fit; per-page collapse memory; topbar page-name (dropped with v1's false premise — the mini-title IS the orientation).
