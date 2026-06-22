# Map Place Search — Design Spec

**Date:** 2026-06-22
**Status:** draft for AI review → user review → plan
**Page:** the existing `#/map` (no new route)

## 1. Goal

Turn the map's place input from a pure **address geocoder** into a **unified place search**: one box that searches (a) the places already in the app — your saved pins **and** the researched catalogue (restaurants, music shops, venues…) — instantly and offline, and (b) live geocodes anything else via Nominatim. Results appear in one list, labelled by source; clicking focuses an existing pin or adds+focuses a geocoded one.

**Why this scope (figure-it-out):** the map *already* geocodes addresses via Nominatim (`#placeSearch` → `#placeSug`). The missing capability is **discovery** — finding the hundreds of places already in the app on the map, and not re-adding duplicates. Unifying local + geocoded search is the high-value, **zero-new-dependency** upgrade. POI-category discovery (e.g. "ramen near here" via the OSM **Overpass** API) is explicitly **out of scope** because it adds a new external service/CSP entry — see §7.

## 2. Current state (reuse, don't rebuild)

`map.js wireAddPlace()` already: debounces (450ms), rate-limits Nominatim to 1 req/s, fetches `nominatim…/search?format=jsonv2&countrycodes=jp&limit=5&q=…`, renders results as `<button data-lat data-lng data-name data-addr>` in `#placeSug`, and on click builds a place via `upsertPlace({ source:'searched', coordKind:'exact', … })` with optional date→event linking. **All of that stays.** This spec wraps it.

The app already has a **local point model** — `placesModel()` in `map.js` (the shared list used by the map and the plan picker), which unifies saved places + catalogue (+ event) points, each with `{ name, area, lat, lng, … , kind/source }`.

## 3. Design

### 3.1 Local search first, geocode as fallback
On input (≥2 chars, debounced), the box runs **two phases into one results list**:
1. **Local (instant, offline):** fuzzy-match the query against `placesModel()` — match on `name` (and `area`). Rank: name-prefix > name-substring > area-substring. Show up to ~6, each labelled by source: **★ saved**, **◆ catalogue** (and skip event points or label them). These render immediately, no network.
2. **Geocode (network, only if useful):** keep the existing Nominatim search, but render its results **below** a divider, labelled **🔍 add new**, and only fetch when the query is ≥3 chars (unchanged rate-limit/debounce/abort). If the top local match is an exact name hit, the geocode section can still show (to add a *different* nearby place), but the UI makes clear which results are "already in your map" vs "add new".

### 3.2 Click behavior by result type
- **Local result (saved/catalogue):** do **not** create a new place. Focus/open it on the map — reuse `focusPlace(id)` for saved; for a catalogue point that isn't yet a saved place, either focus its marker or offer "save to my pins" (reuse the existing catalogue→save path). No duplicate place is created.
- **Geocode result:** the existing `upsertPlace({source:'searched'})` + optional date→event flow, unchanged.

### 3.3 Markup
Relabel the input from "ADD A PLACE // …" to a search placeholder (e.g. "SEARCH PLACES // ramen, Shibuya, a saved pin…"), keep the optional `#placeDate`. The `#placeSug` list gains a small source badge per row and an optional `<li class="sug-div">` divider between the local and geocode groups. `aria-live="polite"` stays.

## 4. Pure logic — `lib/placesearch.js` (unit-tested)

Extract the matching/ranking so it's testable without the DOM or network:
```
searchLocal(points, query, limit=6) -> [{ ...point, score, why }]   // pure rank over name/area
```
- Case-insensitive; trims; empty query → `[]`.
- Scoring: name startsWith (3) > name includes (2) > area includes (1); ties broken by shorter name then alpha; below-threshold dropped.
- Deduplicate by a stable key (e.g. saved `id`, else `name|lat|lng`) so a catalogue place that's also saved appears once (prefer the saved one).
- No mutation of inputs.

`map.js` calls `searchLocal(placesModel(), q)` for the local phase and keeps the Nominatim fetch for the geocode phase.

## 5. Edge cases / constraints

- **Offline:** local phase works fully; the geocode phase shows the existing "Search unavailable (offline?)" message — the box is still useful (it was network-only before).
- **No new CDN / external service:** only the already-used Nominatim + OSM. Overpass/Google Places are **not** added.
- **Rate-limit + abort:** unchanged (Nominatim 1 req/s, debounce, AbortController).
- **Dedup:** a place that is both saved and in the catalogue shows once (saved wins).
- **Escaping:** every dynamic string (names, addresses, areas) through `esc()` before `innerHTML` (the current code already does for geocode rows; apply the same to local rows).
- **Keyboard/a11y:** results are real `<button>`s; the list is `aria-live`; arrow/enter navigation is a nice-to-have (the current list relies on Tab) — keep parity with today, don't regress.

## 6. Testing

- `tests/placesearch.test.mjs`: `searchLocal` — prefix>substring>area ranking, case-insensitivity, empty query, limit, dedup (saved beats catalogue), no input mutation.
- Existing suites stay green. Browser: type a saved pin's name → it appears as ★ saved → click focuses it (no duplicate created); type a catalogue place → ◆ catalogue → focus/save; type a brand-new address → 🔍 add new (Nominatim) → adds a pin (+ optional date→event); offline → local still works, geocode shows the unavailable message; 0 console errors.

## 7. Files

- **Create:** `assets/lib/placesearch.js`, `tests/placesearch.test.mjs`.
- **Modify:** `assets/map.js` (wrap `wireAddPlace`: local phase + relabel + source badges + click routing), `index.html` (input placeholder/label + optional divider styling hook), `assets/style.css` (source badge + divider), `assets/i18n.js` (update the map search placeholder/label strings), `sw.js` (precache `assets/lib/placesearch.js` + CACHE bump).

## 8. Out of scope

POI/category discovery via Overpass ("find izakayas near here") — adds a new external API/CSP entry; deferred. Google Places / any keyed API (no backend). Map-bounds-aware "search this area". Reverse geocoding on long-press. These are future options; v1 is unified local+Nominatim search.
