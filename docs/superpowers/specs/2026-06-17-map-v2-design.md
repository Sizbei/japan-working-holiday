# Map v2 — Design Spec

**Date:** 2026-06-17
**Status:** Approved (owner + 2-agent sign-off: architecture + product/UX, both APPROVE-WITH-CHANGES, changes folded in)
**Scope:** Enhance the existing `#/map` route from a strong *planning* surface into a *day-of navigation* surface, in three independently shippable phases.

## Goal

Make the map answer the questions a working-holiday resident actually asks in Tokyo: **"how do I get there?"**, **"is it worth the trek from home after work?"**, and **"where have I been?"** — while keeping the zero-build / static / offline-tolerant contract intact.

## Constraints (unchanged project rules)

- Zero build, static GitHub Pages from `/docs`, vanilla ES modules.
- **No new CDN / third-party API / backend.** Directions are delivered by *handing off* to the native Maps app via a keyless URL (same family as the existing `gmaps()` link), never by computing routing in-app.
- All state in `localStorage` (`jwh-places-v1`); quota-conscious (no image blobs).
- Every dynamic string through `esc()` before `innerHTML`.
- Single data-flow path: a mutation calls a **silent** `patchPlace`/writer, then exactly one `change()` → `jwh:data-changed` → renderers re-draw. Never zero (stale UI), never two (double-render bug).

## Load-bearing fact

Most pins are `coordKind:'approx'` — a neighbourhood centroid plus deterministic `jitter(name)` (see `map.js placesModel()`), **not** a real location. Only user drop-a-pin / search / set-exact pins are `'exact'`. **No feature may treat an approx pin's lat/lng as a precise location.** This kills naive "sort by nearest" and shapes the Directions origin logic below.

## Data model

All additive on the existing `jwh-places-v1` records (no key bump; `store.get` type-guard only enforces array-ness on the list). Add to `lib/places.js` `normalize()` defaults:

| Field | Type | Meaning | Notes |
|---|---|---|---|
| `emoji` | string `''` | custom pin glyph | NEW default; falls back to category glyph when empty |
| `note` | string `''` | free-text note | already defaulted; Phase 2 adds an *editor* |
| `visited` | bool `false` | been there | already written by `saveCatalogue`; Phase 2 adds a *toggle* + rendering |
| `home` | bool `false` | the home base | NEW; **single-home invariant** — setting one clears any other |

No new `KEYS` entry is required (home base is a flag on the place record). The home-base lookup is `loadPlaces().find(p => p.home)`.

---

## Phase 1 — Navigate Tokyo (ships first; carries the release)

### 1a. Home base
- A **"🏠 Set as home base"** action in the user-pin popup (`userPopup`). Setting it: `patchPlace(id,{home:true})` **and** clear `home` on any other place (enforce the single-home invariant in one writer), then one `change()`.
- The home-base pin renders with a distinct **torii ⛩️ glyph** in `divIcon()`/`glyphFor()` and the sidebar, ranked above the ★ fav / 🔒 lock styling it already has.
- Only user (`kind:'user'`) places can be a home base (you set it from a real saved place — typically your share-house from `#/rooms` or a dropped pin).

### 1b. Directions handoff — `lib/directions.js` (new, pure, unit-tested)
- `directionsUrl({ from, to, mode='transit', platform })` → builds a keyless Maps URL.
  - **Google (default, universal):** `https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&travelmode=transit` (origin omitted when not provided).
  - **Apple (iOS):** `https://maps.apple.com/?saddr=LAT,LNG&daddr=LAT,LNG&dirflg=r`.
  - `to` may be `LAT,LNG` or a place-name string (falls back to a text destination for approx pins where a name is more useful than jittered coords).
  - `waypointsUrl(stops)` → Google `dir/` form with ordered waypoints for a whole day; **cap at the practical waypoint limit and drop coordless stops** (mirrors `drawRoute`'s coord filter).
- **Origin logic (gated on arrival date `2026-06-30`):**
  - **Before arrival** (`today < arrival`): origin = the home-base pin's coords (planning from Canada — device location is wrong).
  - **On/after arrival:** omit origin → the Maps app uses live device location ("take me there from here").
  - If no home base is set and before arrival: omit origin but show a one-line hint ("set a 🏠 home base for accurate directions while planning").
- **UI surfaces:**
  - Pin popup: a **"🧭 Directions"** link (`esc`'d href, `rel="noopener noreferrer"`, opens in a new tab / the native app).
  - Plan-a-Day: a per-leg **"Directions"** link in the existing leg connector (`plan.js stopRow`), **gated on both adjacent stops having numeric lat/lng**; plus a **"Directions for the day"** waypoints link in the plan actions.

### 1c. Distance-from-home
- When a home base exists, each pin popup (and optionally the sidebar row) shows **"≈N min from home (est.)"** using the existing area-level `estimateMinutes`/`legLabel` from `transit.js`. This is an honest neighbourhood-level estimate (not false precision) and reuses already-tested code.

**Phase 1 testing:** `lib/directions.js` URL builders (origin present/omitted, transit mode, waypoint cap, coordless drop, escaping) via `node --test`. UI (Directions href correctness, home-base set/clear single-invariant, before/after-arrival origin) via Playwright.

---

## Phase 2 — Make it yours

### 2a. Visited
- A **"✓ Visited"** toggle in the pin popup → `patchPlace(id,{visited})` + one `change()`.
- Visited pins render **muted** *and* carry a **hanko stamp overlay** (a small red circular "済" / check stamp) — a Japan-specific delight beat, not just a checkbox.

### 2b. Note editor
- A **"✎ Note"** action → `askText` prefilled with `place.note`, prompt copy nudges useful day-of info ("hours, closed days, cash-only?"). Saves via `patchPlace` + one `change()`. No hours *schema* — free text only (respects bake-don't-scrape).

### 2c. Emoji chips
- A small **curated, tappable chip set** in the pin editor (NOT a free-form picker, NOT keyboard kaomoji entry): ~8–14 retro-Japan glyphs spanning emoji (🍜🎵🕹️🏯⛩️🎏🐱☕🍣🗼), Japanese symbols (♨ 〒), and a few **tappable** kaomoji ((・∀・) ╰(°▽°)╯), plus a **"category default"** reset.
- Selection → `patchPlace(id,{emoji})`; rendered as the pin glyph (`glyphFor` returns `pt.emoji || <category default>`) and the sidebar icon.
- **CSS fix required:** `.jwh-pin-dot::after` is currently `color:#fff; font-size:9px; font-family:mono` in a 16px circle — a color emoji clips. Widen the dot / special-case emoji sizing; a multi-char kaomoji renders as a **label beside the pin**, not inside the dot.

### 2d. Visited stats + milestones
- A compact stats line in the **map header** (a dashboard widget is a possible later extension, not in this spec): **"You've been to 23 of 60 saved places · 7 of 11 neighbourhoods."** Areas via `areaOf`/`AREA_ORDER`.
- Crossing a milestone (all neighbourhoods, 10 Tabetai eaten) fires a small confetti/torii flourish — **reuses the existing celebration infra and honors the Celebrations setting** (`jwh-celebrations`).

**Phase 2 testing:** visited toggle + stamp render, note round-trip, emoji chip → glyph render + sidebar, stats counts, milestone fire. Pure stat counter (`placesVisitedStats`) unit-tested.

---

## Phase 3 — Polish

- **Dark tiles (tuning, not new):** the OSM tile filter already ships (`style.css` `[data-theme="dark"] .leaflet-tile`). Re-tune toward **warm amber "Tokyo at night"** rather than cold grey; verify pin/popup legibility (markers are in sibling panes, unaffected).
- **Filter-text (not a new search box):** a small text input placed **inside the existing filter-chip row** (`renderFilters`) that narrows already-loaded pins by name/area locally (no network), distinct from the network-backed add-place box. Reuse the Plan picker's client-side filter pattern.
- **Explicitly dropped:** lat/lng "sort by nearest" (broken by approx+jitter — if itinerary grouping is wanted later, do an honest "group by area"), a parallel "layers" UI (the category chips already are layers), and a separate search-on-map box.

**Phase 3 testing:** dark-tile legibility (visual), filter-text narrows + restores, no regression to the add-place search.

---

## Module / file plan

- **New:** `docs/assets/lib/directions.js` — pure URL builders, unit-tested, import-safe in Node.
- **New (likely):** a `placesVisitedStats(places, areaGeo)` pure helper (in `lib/places.js` or a small stats module), unit-tested.
- **Extend:** `map.js` (popup actions, home-base glyph, emoji chips, filter-text, stats line), `plan.js` (per-leg + whole-day Directions), `lib/places.js` (`emoji` default + single-home writer), `style.css` (pin-dot emoji sizing, hanko stamp, dark-tile tuning).
- **Watch-point:** `map.js` is ~571 lines. If Phase 2/3 push it past ~800, extract the popup/editor/controls UI into `map-controls.js`. Not a pre-emptive refactor.
- **Service worker:** bump `CACHE` and add `lib/directions.js` (+ any new module) to the `ASSETS` precache.

## Out of scope (YAGNI)

Offline map-tile caching, in-app transit computation, real photo storage, custom pin colors, heatmaps, an opening-hours schema, structured layers.

## Success criteria

- One-tap "🧭 Directions" opens the native Maps app with correct transit directions, correct origin before/after arrival.
- A home base can be set (single-invariant) and drives directions origin + "≈min from home."
- Pins can be decorated (emoji), annotated (note), and marked visited (hanko); a stats line tracks coverage.
- Dark map reads as warm Tokyo-night; pins filterable by text within the existing chips.
- `node --test` green (new pure helpers covered); all routes render with 0 console errors; SW bumped.
