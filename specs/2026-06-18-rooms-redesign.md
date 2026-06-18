# Rooms Redesign — A Search-and-Shortlist Tool

**Date:** 2026-06-18
**Status:** Design contract — approved direction, pending implementation plan
**Route:** `#/rooms`
**Goal:** turn the passive 44-card directory into a tool for *actually securing* a Tokyo share-house — filter/sort by what gates a working-holiday renter, see real cost, shortlist + track outreach, and compare finalists — while cutting the page's render cost.

## 1. Problem

Today `#/rooms` renders all 44 curated providers at boot (regardless of route) and filters by re-scanning every card's `textContent` on each keystroke. It's information-rich but **passive**: rent is free-text (no sort, no budget ceiling), there's no way to shortlist or track who you've contacted, no cost total, no comparison, and transit info is buried. Priorities (user-ranked): **filters + sort → compare → cost clarity → transit closeness**, plus a light **Saved/Contacted** state.

## 2. Architecture

Keep the curated `tips.json.rooms` array (44 entries) as the source of truth — **no data edits**. Add a new pure module `docs/assets/lib/rooms.js` that derives the structured fields the UI needs from the existing free-text strings, unit-tested in Node. `rooms.js` (the page module) holds an in-memory enriched array and re-renders the filtered+sorted matches; per-provider status/notes persist to a new localStorage key. The page renders **lazily** on first visit to `#/rooms`.

```
tips.json.rooms[] ──enrich()──> ROOMS[] (parsed price/cost/lines/flags + search blob)
                                   │
   filters + sort + search ───────┤──> render only matching cards
   status store (jwh-rooms-v1) ───┘     (★ Saved / ✓ Contacted / note per card)
   compare selection (≤4) ─────────────> compare table
```

## 3. Derived data — `lib/rooms.js` (pure, unit-tested)

These parse the existing strings. Every function is total (returns a safe default on unparseable input) and never throws.

- `parseRent(rentStr) -> { monthlyMin, monthlyMax, unit }` — extract ¥ amounts (regex on `¥` + digits with commas). `unit` is `'mo'` or `'night'`; for `'night'`, `monthlyMin/Max` = nightly × 30 (flagged as estimate by the caller). Returns `{ monthlyMin: null, monthlyMax: null, unit: 'mo' }` when no amount is found (such cards pass any budget ceiling and sort last on price).
- `parseYen(str) -> number|null` — first ¥ amount in a string (for `oneTime`, `fees`).
- `moveInEstimate(room) -> { total: number|null, isEstimate: true }` — `monthlyMin` (first month) + `parseYen(oneTime)` + deposit, where deposit = `parseYen(deposit)` if it has a ¥ amount, else `~N month` → N × `monthlyMin`, else 0. `null` if `monthlyMin` is unknown. Always `isEstimate: true`.
- `monthlyAllIn(room) -> number|null` — `monthlyMin` + `parseYen(fees)` (utilities), or `monthlyMin` alone when fees are "included"/unparseable.
- `lineTokens(room) -> string[]` — match a fixed dictionary of Tokyo lines/areas (Yamanote, Chuo, Nakano, Koenji, Setagaya, Shibuya, Ikebukuro, Shinjuku, Shimokitazawa, Asakusa, …) against `station` + `area`. Used to build the area/line filter chips (union across all rooms) and to filter.
- `bookFromAbroad(room) -> boolean` — true if `moveIn` or `requirements` mention "abroad"/"before arrival"/"from abroad".
- `noGuarantor(room) -> boolean` — true if `requirements` mention "no guarantor".
- `womenOnly(room) -> boolean` — `gender === 'women'` or name/area contains "women".
- `searchBlob(room) -> string` — lowercased `name + provider + area + station + note + requirements`, computed once.

`enrich(rooms)` maps each room to `{ ...room, _price, _moveIn, _allIn, _lines, _bookAbroad, _noGuarantor, _women, _blob }`, run **once** on first render.

## 4. UI

### 4a. Controls (top of page, replacing the current filter row)
- **Budget ceiling** — a single `<input type="range">` max-rent slider (¥30,000 → ¥200,000, step ¥5,000, + an "Any" end) with a live label ("≤ ¥70,000/mo"). A room passes if `_price.monthlyMin <= ceiling` (null price always passes). Accessible: real range input, `aria-label`, value announced.
- **Area / line chips** — generated from `lineTokens` union; multi-select (OR within the group). An "All areas" reset chip.
- **Quick toggles** (chips): Private / Dorm (room type), No key money, No guarantor, Book from abroad, Women-only.
- **Sort** `<select>`: Newcomer-friendly (default — curated order), Rent (low→high, by `_price.monthlyMin`), Move-in cost (low→high, by `_moveIn.total`), Move-in soonest (rolling/flexible first).
- **Search** box — debounced 150ms, matches `_blob`.
- **Saved (n)** toggle — show only ★-saved providers.
- A one-line **summary**: "`N` of 44 · `S` saved · `C` contacted" (`#roomCount` repurposed).

### 4b. Card (reworked)
Keep name/provider/area/note/links. Add/raise:
- **Cost line (prominent):** `~¥X/mo all-in` and `~¥Y move-in (est)` from §3, each with a subtle "est" tag. Tier color-bar stays.
- **Transit line:** `🚉 station/line` from the data (or "Citywide — many houses" when `station` is "Various"). Never fabricated.
- **Flags row:** NO KEY MONEY / NO GUARANTOR / BOOK FROM ABROAD / WOMEN-ONLY badges where true.
- **Actions:** `★ Save` toggle, `✓ Contacted` toggle, a **note** field (expandable `<textarea>`, autosaves), `＋ Compare` checkbox (disabled once 4 are selected), plus the existing **Browse listings ↗** / **Provider ↗** links.

### 4c. Compare (≤4)
Selecting `＋ Compare` adds a provider to a **compare drawer** pinned at the bottom (shows chips of the selected, a "Compare →" button, and "clear"). "Compare →" opens a focus-trapped panel (reuse `lib/modal.js`) with a **table**: columns = selected providers; rows = Rent (all-in), Move-in total (est), Fees, Deposit, Room type, Requirements, Transit, Move-in, Links. Empty when <2 selected ("pick at least two to compare").

### 4d. Status persistence
New key `KEYS.rooms = 'jwh-rooms-v1'` → `{ [roomId]: { saved?: true, contacted?: true, note?: string } }`. Toggling re-renders the affected card + the summary; writes dispatch the existing `jwh:data-changed` (so the dashboard/other listeners stay consistent — though no widget consumes rooms today, this keeps the single-path convention). The store `get()` type-guard already protects a corrupted value.

## 5. Latency / load

- **Lazy first render:** `mountRooms(data)` stores data + wires controls but does **not** build cards at boot. On the first `jwh:route` with `route === 'rooms'` (and immediately if the page loads already on `#/rooms`), run `enrich()` + initial render once; subsequent visits don't re-enrich. Mirrors the map's `onMapShown` deferral.
- **Parse once:** all regex parsing happens in `enrich()` at first render, not per keystroke.
- **Filter/sort on data, not DOM:** compute the matching, sorted subset from `ROOMS[]` and re-render `#roomsGrid` from it (≤44 cards → cheap). Replaces "show/hide all 44 + re-read every `textContent`."
- **Debounced search** (150ms). No new network, no images, no CDN.

## 6. Accessibility & constraints

- Real `<button>`/`<input>`/`<select>`/`<textarea>`; the slider is a native range input with a label + visible value; compare panel is focus-trapped via `lib/modal.js` (Esc closes, focus restored). Toggles carry `aria-pressed`; saved/contacted state reflected in the accessible name.
- Every dynamic string through `esc()` before `innerHTML`. External links keep `rel="noopener noreferrer"`.
- Zero-build, ES modules, GitHub Pages, relative paths; no new dependency/CDN. State browser-local. Bump `sw.js` `CACHE` and add `assets/lib/rooms.js` to the precache.
- Reduced-motion + dark mode inherited (no new animation beyond the existing card/transition styles).

## 7. Out of scope

- Live availability / scraping providers (no public APIs — links remain the source of live listings).
- Per-listing precise walk-minutes or map pins for rooms (data is provider-level; the Map page already plots saved *places*).
- Editing the 44 curated entries or adding new providers.
- A full 4-stage pipeline (Applied/Passed) — only Saved + Contacted this round.

## 8. Success criteria / verification

- New `node --test` cases for `parseRent` (range, single, /night, commas, junk→null), `parseYen`, `moveInEstimate` (deposit-in-months vs yen, unknown→null), `lineTokens`, `bookFromAbroad`/`noGuarantor` — all green; total suite stays green.
- Served: `#/rooms` renders only on first visit (verify cards aren't in the DOM before navigating there); the budget slider, area/line chips, toggles, sort, and search all narrow/reorder the list correctly; the summary count updates; **no console errors**.
- Each card shows an all-in monthly figure and an est. move-in total (or a clean "—" when unparseable), plus transit text from the data only.
- ★ Save / ✓ Contacted / note persist across reload (localStorage `jwh-rooms-v1`); "Saved (n)" filters to the shortlist.
- Compare: select 2–4 → table shows them side by side; Esc/close restores focus.
- Other 8 routes unaffected; reduced-motion + dark mode intact.
