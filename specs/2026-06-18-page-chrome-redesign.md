# Page Chrome Redesign — Nav-First Inner Pages + Drop My Tokyo

**Date:** 2026-06-18
**Status:** Design contract — approved direction, pending implementation plan
**Affects:** the shared masthead/nav (all routes) + the dashboard My Tokyo band
**Mock:** `docs/mockups/header-mockups.html` — **Variant B (Editorial)**
**Builds on:** `specs/2026-06-17-front-page-design.md` (the dashboard already hides the masthead and leads with its own hero)

## 1. Goal

On the 8 non-dashboard routes, the global masthead ("My Year in Japan" + the full subtitle + "Arrival") eats ~470px at the top of every page, repeating what the **topbar already shows** (brand + countdown) and what each page's **own heading** repeats again — burying the nav. Make the inner pages feel like the (liked) dashboard: **nav directly under the topbar, each page leading with its own heading.** Desktop-focused.

Two cohesive changes under one "nav-first, content-first" theme:
- **A. Remove the masthead site-wide; promote the nav to an editorial top bar; give each page its own `h1`.**
- **B. Drop the dashboard "My Tokyo" interests band** (decorative, dashboard-only; the interests live on Explore).

## 2. Chosen direction — Variant B (Editorial)

From the three mocked treatments (Clean / Editorial / Tab bar), **Editorial** wins: it matches the vermilion ink-underline already shipped in the chrome pass, its asymmetry suits the Newsreader serif, and the existing `.pillar-head` page headings (JP kicker + serif title + `.lede`) already are the editorial section-opener it calls for.

**Inner-page top, after:**
```
topbar  (brand · countdown · あ 🔔 ⌨ 🌙 ⚙)        ← unchanged
────────────────────────────────────────────────
nav     Dashboard  Calendar  Going  …             ← left-aligned, ink-underline active
────────────────────────────────────────────────
カレンダー                                          ← page heading leads (now <h1>)
My Calendar
Researched events are baked in… (lede)
─────────────  (hairline)
〈 June 2026 〉  Today              Month  Agenda   ← content
```

## 3. Scope A — masthead removal + editorial nav

### 3a. Remove the masthead
- Delete the `<header class="hero">…</header>` block from `index.html` (the sun mark, `私の一年` kicker, `#heroTitle`, `#heroSub`, `#metaArrival`).
- Remove the now-orphaned `setText('#heroSub', …)` and `setText('#metaArrival', …)` calls in `main.js` (leave `#footGen`).
- Remove the now-dead `.hero*` CSS: `.hero`, `.hero-mark`, `.hero-kicker`, `.hero h1`, `.hero-sub`, `.hero-status`, `.hero-meta`, the `.hero` padding/`view-transition-name` rules, the responsive `.hero` rules, and the obsolete `html:has(#view-dashboard.is-active) header.hero{display:none}` rule. **Do not** touch the shared `.hero-mark .sun, .tb-sun, .gate-mark` rule's `.tb-sun`/`.gate-mark` parts (those style the topbar sun + gate) — only drop the `.hero-mark .sun` portion.

Site identity is carried by the **topbar brand** ("MY YEAR IN JAPAN") + the **countdown**, which appear on every route.

### 3b. Editorial nav (global — applies on all routes incl. dashboard, for consistency)
The `.route-nav` is shared chrome. Change it to the Editorial treatment:
- **Left-align** the nav (align it to the content gutter / `--maxw` container), instead of centered.
- **Replace the red-pill active state** (`.route-nav a[aria-current="page"]{ background: var(--red) }`) with the **ink underline**: the active link shows the vermilion `::after` underline persistently + `color: var(--ink)` + `font-weight: 600`. (The hover underline already exists from the chrome pass — active = the same underline, shown.)
- Drop the `:hover{ background: var(--bg-soft) }` pill; hover = `color: var(--ink)` + the sliding underline.
- A hairline `border-bottom` under the nav separates it from content.
- **Mobile nav unchanged** (the `@media` nav rules stay; this redesign is desktop-scoped — mobile already collapses the nav to a compact bar with red-text active).

### 3c. One `h1` per page (accessibility) — centralized via the router
The masthead `#heroTitle` was the only `<h1>` on inner pages; removing it leaves them with no `h1`. Per-view promotion was considered and rejected: **Explore** leads with a search bar + dynamically-rendered domains (no static page-title heading), and **Deadlines** leads with a *section* ("Lottery & Timed-Release Drops"), so promoting "the lead heading" would force an awkward, inconsistent `h1` onto a section on those two pages.

Instead, drive a single page `h1` from the **router** (which already sets a per-route `document.title` from its `TITLES` map):
- Add one element to `index.html`: `<h1 id="routeH1" class="sr-only"></h1>` at the top of `<main>` (the `.sr-only` utility already exists). It's visually hidden but is the page's programmatic `h1`.
- In `router.js` `activate(route)`, set `routeH1.textContent = TITLES[route]` (e.g. "Calendar", "Explore", "Deadlines"). For the **dashboard**, set `routeH1.hidden = true` (the dash-hero already provides a visible `<h1>`); for every other route set `routeH1.hidden = false`.

Result: exactly one `h1` per route — the dashboard's visible dash-hero `h1`, or the sr-only route-name `h1` elsewhere. The visible `.pillar-head` headings stay `<h2>` and remain the *visual* lead (which is the point of the redesign); no per-view markup churn, and Explore/Deadlines are handled cleanly. The router still moves focus to the active view's first `h1, h2, h3` on navigation — the visible heading — unchanged.

## 4. Scope B — remove the dashboard My Tokyo band

- Delete the `#myTokyo` `<section>` from `#view-dashboard` in `index.html`.
- Remove the `mountMyTokyo` import + call in `main.js`; **delete** `docs/assets/dashboard-mytokyo.js` (fully orphaned) and drop it from the `sw.js` ASSETS list.
- Remove the now-dead My Tokyo CSS: `#myTokyo`, `#myTokyoH`, `.mt-head`, `.mt-grid`, `.mt-card`, `.mt-eyebrow` (and remove `.mt-eyebrow` from the shared "mono chrome" selector list — keep the other selectors there).
- **Update the layout themes** (`html[data-home]`) that place My Tokyo:
  - **Engawa:** drop the `tokyo` row — `grid-template-areas: "hero needs" "teasers teasers"` (desktop) and `"hero" "needs" "teasers"` (mobile); remove the `> #myTokyo` reset rule.
  - **Bento:** remove the `#myTokyo .mt-head{ justify-content:center }` rule.
- The dashboard becomes **countdown hero → needs-me → teasers** in all three layouts.

No data, route, or localStorage changes. The `home-layout` parity test still holds (it asserts CSS rules exist per layout; the tokyo area is internal to those rules).

## 5. Components & constraints

- Pure markup + CSS, plus small `main.js` edits (remove two `setText` calls + the My Tokyo mount) and a `sw.js` cache bump + asset-list edit. No new modules, routes, data, or dependencies.
- Zero-build, ES modules, GitHub Pages, relative paths. Every dynamic string already through `esc()` (no new dynamic strings here).
- `view-transition-name: jwh-hero` is removed with the masthead — verify the route transition still runs (the nav + views keep their own transition names).
- Reduced-motion + dark mode: inherited (the nav underline already respects both; no new animation introduced).

## 6. Out of scope

- The dashboard's own hero/needs-me/teasers (unchanged except dropping My Tokyo).
- Mobile-specific nav redesign (desktop-focused; mobile nav stays functional).
- Recoloring or restructuring any page's body content below its heading.
- The topbar (brand/countdown/icons) — unchanged.

## 7. Success criteria / verification

- `node --test tests/lib.test.mjs` stays green (37 tests; routes-parity, lang-parity, home-layout parity unaffected).
- Each of the 8 inner routes: masthead gone, nav sits directly under the topbar (left-aligned, active link ink-underlined), page leads with its visible heading + lede; **exactly one `h1`** per page (the sr-only route-name `h1`); no console errors.
- Dashboard: unchanged except the My Tokyo band is gone; Scroll/Split/Bento all render countdown → needs-me → teasers with no empty grid area or layout gap.
- No dead references: `mountMyTokyo`, `dashboard-mytokyo.js`, `#heroSub`/`#metaArrival` setters, and `.hero`/`.mt-*` CSS are removed together (no orphans).
- Desktop content now begins ~150px from the top (was ~600px); reduced-motion + dark mode intact.
