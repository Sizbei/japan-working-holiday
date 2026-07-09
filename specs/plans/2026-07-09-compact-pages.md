# Compact pages + Notion viewport-fit calendar — plan (2026-07-09)

**Owner asks:** (1) a toggle to hide the big title card (kanji + serif title + lede — ~140px/page); (2) with it hidden, the calendar fits **one viewport like Notion Calendar** — no document scroll.
**Decisions (owner-picked):** global setting (⚙ Guide → "Compact pages") · full app-shell viewport fit on the calendar (desktop).

**Key tension managed:** PR #48 deliberately made `#/calendar` scroll as one document (`body[data-route="calendar"] main { height:auto; overflow:visible }` + static topbar/nav, style.css:3110-3112). Compact mode OVERRIDES that trio under `html[data-compact="on"]` only — both behaviors coexist; default stays exactly as today.

## S1 — Global toggle + title hiding
- `lib/store.js`: `compact: 'jwh-compact-v1'` (raw `'on'|''`).
- `guide.js`: settings row **"Compact pages — hide the big page titles"** (same `row()` switch pattern); `applyCompact()` sets `document.documentElement.dataset.compact`; export + call **early in main.js boot** (the `applyHomeLayout` pattern — no flash).
- CSS under `html[data-compact="on"]`:
  - `.pillar-head` → **sr-only treatment** (absolute clip), NOT `display:none` — the router focuses the view's `h1,h2,h3` on navigation (router.js:59-60) and AT must still announce it.
  - `.lede` → `display:none`. Reduce `main` top padding.
  - `#routeH1` (topbar, currently `sr-only`, text set per-route by router.js:53-54) → **becomes visible**: small serif page name in the topbar so orientation survives. Stays hidden on dashboard (router already sets `rh.hidden`).
- Verify: toggle flips live + persists across reload; every route still moves focus to its heading; no boot flash; dashboard unaffected.

## S2 — Calendar viewport fit (compact + >820px only)
Under `html[data-compact="on"] body[data-route="calendar"]`:
- Re-assert sticky topbar/nav; `main` → `height: calc(100dvh - var(--header-h) - var(--nav-h))`, `overflow:hidden`, internal flex column; the calendar section's toolbar rows keep natural height; `.cal-layout` gets `flex:1; min-height:0`.
- **Month:** `.cal-grid` fills the remaining height (`grid-auto-rows: minmax(64px, 1fr)`, `overflow-y:auto` as the short-window fallback so cells never collapse below usable). "+N more" counts already cap cell content.
- **Week/Day:** `.wk2-scroll` already scrolls internally — cap `.wk2` to the available height (its 132px band + flex column), no change to behavior.
- **Agenda:** internal `overflow-y:auto`.
- **Sidebar:** `.cal-sidebar` → `overflow-y:auto; max-height:100%`. Guard `alignRail()` (calendar.js:388) to no-op in compact (its document-geometry math assumes page scroll).
- **Toolbar densify:** quick-add + search row merges into the toolbar row (CSS order/flex only — exact selectors pinned at build) to buy ~50px.
- ≤820px: viewport-fit does NOT apply (cells would be microscopic) — titles still hide, page still scrolls.
- Verify headless (1300×900 AND 1300×700): `document.scrollingElement.scrollHeight === clientHeight` (no page scroll) in month/week/day/agenda; month grid fully visible at 900; internal grid scroll engages at 700; **non-compact + mobile behavior byte-identical to today** (regression gate for PR #48 behavior).

## S3 — Review + ship
- Opus critic over the diff: focus/AT on sr-only pillar-heads across all 13 routes; sticky-offset rules that assumed the old header stack; `alignRail` guard; the PR #48 coexistence matrix (compact×route×width); popover/drawer positioning on a now-height-locked page (calendar popover is document-anchored — verify it still lands right when `main` is the scroller).
- SW bump; live smoke.

**Out of scope:** mobile viewport-fit; per-page collapse memory; hiding the toolbar rows themselves.
