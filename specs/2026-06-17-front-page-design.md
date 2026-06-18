# Front Page Redesign — Sumi-e Ink "Save File" Home

**Date:** 2026-06-17
**Status:** Design contract — approved direction, pending implementation plan
**Route affected:** `#/dashboard` (the home view) + shared top-of-site chrome (topbar / hero / nav)
**Mock:** `docs/mockups/front-mockups.html` — variant **A (Kakemono)** + the "Needs me" strip from variant **B (Engawa)**

## 1. Goal

Turn the front page from a flat stack of competing sections (hero → intro → MY TOKYO → six widgets) into a **personal "save file" home** with one clear focal point: the **countdown to landing at NRT**. The page should feel like opening a companion you're excited to check, while still surfacing the few things that genuinely need attention. Readability and hierarchy over density.

**Primary job:** personal save-file home (joy-first; paperwork supports it).
**Sacred element:** the live countdown to `meta.arrival_date` (2026-06-30) — it is promoted to the hero, never removed.
**Aesthetic:** push the Sumi-e ink vibe already established on the Map page onto the home.

## 2. Chosen composition — A+B hybrid

Single-column **hanging-scroll (Kakemono)** layout, top to bottom:

1. **Scroll-rail + hero** (two columns on desktop: a narrow vertical `私の一年` *tategaki* rail on the left, the hero on the right; collapses to one column on mobile).
   - Kicker: `My save file · Tokyo` (vermilion).
   - `h1` "My Year in Japan" in Shippori Mincho display weight.
   - One-line italic subtitle (the existing first-person voice, trimmed).
   - **The countdown as the hero numeral** — `clamp(4.4rem, 15vw, 8.6rem)`, tabular mono, with "days until I land" + "NRT · 2026-06-30" beneath. Ink-wash sun bleeds from the top-right behind it.
2. **"Needs me" strip** (lifted from variant B) — a compact horizontal band of up to three ink cards directly under the hero so the essentials are reachable without a full scroll on desktop: **Next deadlines**, **Going to**, **Checklist progress**. On mobile these stack.
3. **My Tokyo** — the interests band, re-skinned as ink "pills" under a brushed chapter heading (`私の東京 · My Tokyo`).
4. **Teasers row** — one-line links into the routes that are *not* promoted: **Book-by**, **Upcoming events**, **Day plan**. Each shows a single next item + a "→ open" link to its route. Keeps the home calm.

### Responsive
- **≥860px:** scroll-rail visible (vertical text); hero + "Needs me" strip as 3-up.
- **<860px:** rail becomes a horizontal kicker with a bottom rule; hero full-width; "Needs me" cards stack 1-up; teasers stack.
- Touch: no hover-only affordances; all interactive elements ≥44px; hover animations gated behind `@media (hover:hover) and (pointer:fine)`.

## 3. Consolidation — what's promoted vs. demoted

The home **triages to essentials**. The full data still lives on its own route; the home shows a curated slice.

| Today's widget | New home treatment | Full view lives at |
|---|---|---|
| Countdown (topbar) | **Promoted** → giant hero numeral | hero (canonical); topbar keeps a small persistent copy for other routes |
| Deadlines (`wDeadlines`) | **Promoted** → "Needs me" card (next 3) | `#/deadlines` |
| Going (`wGoing`) | **Promoted** → "Needs me" card (next 2) | `#/going` |
| Checklist (`wProgress`) | **Promoted** → "Needs me" card (% + count + "n due in 30d") | `#/checklist` |
| MY TOKYO band | **Kept**, re-skinned as ink pills | — (home only) |
| Book-by (`wBookBy`) | **Demoted** → one-line teaser | `#/deadlines` (book-by section) |
| Upcoming events (`wEvents`) | **Demoted** → one-line teaser (next event) | `#/calendar` |
| Day plan (`wPlan`) | **Demoted** → one-line teaser (today's plan or "plan a day →") | `#/plan` |
| First-person intro paragraph | **Folded** into the hero subtitle (one trimmed line); the long paragraph is removed | — |

**Rationale:** the notifications **bell** (top-right) already aggregates every time-sensitive alert, so the home doesn't need six full widgets to avoid "missing" things. Promote the three that define daily intent (deadlines, what I'm going to, how far along I am); make the rest a glanceable teaser + one click.

## 4. Aesthetic tokens

Extend the existing token set; **do not** introduce a parallel palette that fights the rest of the site. New ink tokens are added to `:root` and used by the dashboard + chrome:

- `--kinari` (unbleached paper) — already approximated by `--bg`; tune the dashboard background warmer.
- `--shu` (#b6391f vermilion seal) + `--shu-deep` — **new**, for the hanko seal, kicker, and the row date accent.
- `--aizome` — maps to the existing `--indigo`; used for the secondary accent / JP glosses.
- Fonts: **already loaded** — Shippori Mincho (`--serif-jp`) for display + JP, Newsreader (`--serif`) for italic body, Space Mono (`--mono`) for the countdown numerals, Zen Kaku Gothic (`--sans`) for pills. **No new font request.**
- Ink primitives: the ink-wash sun (radial-gradient disc), paper grain (existing `.grain`), a vermilion **hanko** seal (CSS, irregular SVG mask), brushed chapter rules.

Scope discipline (per the Map precedent): the heavy ink treatment is **scoped to `#view-dashboard`** plus a *light* consistency pass on the shared topbar/nav (ink underline nav, seal in brand). The other 8 routes must remain visually intact and functional.

## 5. Components & data flow

No new data model. Reuse the existing single-path flow: mutations dispatch `jwh:data-changed`; `dashboard.js` listens and re-derives. The redesign is **markup + CSS + a refactor of `dashboard.js`'s render functions**, not new state.

- `index.html` — restructure `#view-dashboard`: new hero block (`.dash-hero` with `.scroll-rail`, `.hero-count`), the `.needs-me` strip (3 cards), the re-skinned `#myTokyo`, and a `.dash-teasers` row. Remove the long `.intro` paragraph.
- `dashboard.js` —
  - `renderCountdown()` now targets the **hero** numeral (big) and keeps the small topbar copy in sync.
  - Keep `renderGoingWidget` / deadlines / progress renderers but point them at the new "Needs me" card containers; trim each to its curated count.
  - **New** `renderTeasers()` — book-by next, next upcoming event, today's day-plan, each a single line + route link. Pure derivation from `DATA` + stores; re-runs on `jwh:data-changed`.
  - Widget drag-reorder (`jwh-widgetorder-v1`) is **dropped** for the home (the new layout is fixed); note this is a deliberate removal, not an oversight.
- `style.css` — new `:root` ink tokens; a `#view-dashboard`-scoped block for hero / scroll-rail / hero-count / needs-me / ink pills / teasers / hanko / sun-ink; light chrome pass (`.route-nav` ink underline, `.topbar-brand` seal). Respect `html[data-reduce-motion="on"]`.

## 6. Motion

From the design checklist — purposeful, not scattered:

- **Page load:** one orchestrated entrance. Hero rises (`translateY(16px)→0`, 600ms, `cubic-bezier(.23,1,.32,1)`); sun + numeral do an "ink-in" (blur 8px→0, 900ms). "Needs me" cards and teasers **stagger 50ms per item**.
- **Hover (desktop only):** ink cards lift `translateY(-3px)` ≤260ms; pills invert to indigo; nav underline slides in (`cubic-bezier(.77,0,.175,1)`).
- **Countdown:** numeral updates silently each minute (no animation — a flashing hero number reads as a bug).
- **Reduced motion:** all of the above disabled via the existing toggle + `prefers-reduced-motion`.

## 7. Accessibility

- Countdown keeps `role="status" aria-live="polite"` so the day count is announced; the hero numeral is the live region (topbar copy is `aria-hidden` to avoid double announcement).
- Real `<button>`/`<a>` for every interactive element (teaser links, pills if interactive); no `role="button"` containers.
- Focus order: skip-link → hero → "Needs me" → My Tokyo → teasers. Heading levels: hero `h1`, section headings `h2`, card headings `h3`.
- Color: vermilion-on-kinari and ink-on-kinari must meet WCAG AA for text; the seal/sun are decorative (`aria-hidden`).
- The vertical *tategaki* rail is decorative (`aria-hidden`) — its content (私の一年) is already in the hero/brand.

## 8. Constraints

- Zero-build, dependency-free; ES modules; relative paths; GitHub Pages from `/docs`. No new CDN (fonts already loaded).
- Every dynamic string through `esc()` before `innerHTML`.
- All state browser-local; no change to localStorage `KEYS` shapes (widget-order key becomes unused — leave the key defined, stop writing it).
- Bump `sw.js` `CACHE` and keep the asset list correct on any asset change.
- Identity-free; first-person voice retained in the trimmed subtitle.

## 9. Out of scope

- Recoloring the other 8 routes to the ink palette (only a light chrome pass here).
- New data, new routes, or new MCP/CDN dependencies.
- Changing the notifications bell logic, the gate, or the service-worker strategy.
- Drag-reorderable home widgets (deliberately removed for a fixed, designed layout).

## 10. Success criteria / verification

- `node --test tests/lib.test.mjs` stays green (routes-parity + lang-parity unaffected; dashboard is not unit-logic but verify no import breaks).
- Served locally: `#/dashboard` renders the hero countdown (correct live day count to 2026-06-30), the three "Needs me" cards with real data, MY TOKYO pills, and three teasers — **no console errors**.
- The other 8 routes still render and navigate correctly (no regression from the chrome pass).
- Mobile (<560px) and desktop (≥860px) both read cleanly; reduced-motion kills animation.
- Lighthouse/visual: clear single focal point (the countdown), AA-contrast text, no layout shift on load.
