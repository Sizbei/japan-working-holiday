# Command Palette: Index Your Own Content — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** palette only

## 1. Goal
The ⌘K palette currently indexes the fixed routes + baked `tips.json` content, built **once at mount** (`palette.js:13` `INDEX = buildIndex(data, routeLabels)`). So your own stuff — custom checklist tasks, custom packing items, saved map places, your calendar events — isn't searchable. Fix: also index user content, **rebuilt fresh every time the palette opens** (so it's always current).

## 2. Design
- **Lazy rebuild on open:** in `palette.js`, move the index build into `openPalette()` (or a small `buildFullIndex()` it calls): `INDEX = [...buildIndex(data, routeLabels), ...buildUserEntries(readUserStores())]`. The baked half (`buildIndex`) is static — compute once at mount and cache it; the user half is rebuilt each open from current localStorage (cheap: a few hundred items max). This keeps results fresh after you add/edit/delete, with no `jwh:data-changed` listener needed.
- **User sources** (each a `kind:'content'` entry with its target `route`, read fresh):
  - `jwh-events-v1` user events → `label = title`, `sub = date`, route `calendar`.
  - `jwh-places-v1` saved places → `label = name`, `sub = area || address`, route `map`.
  - `jwh-checklist-custom-v1` → `label = task`, `sub = phase`, route `checklist`.
  - `jwh-pack-custom-v1` → `label = item`, `sub = cat`, route `packing`.
- Selecting a user result navigates to its route (v1: jump to the page; no deep-scroll), same as baked content. Optional small "★ yours" badge to distinguish from baked content — nice-to-have.

## 3. Pure logic — `lib/palette.js`
- `buildUserEntries({ events, places, checklistCustom, packCustom })` → `[{ kind:'content', label, sub, route, key, mine:true }]`. Pure, guards each array with `|| []`, skips entries with an empty `label`, no input mutation. `searchIndex` already ranks these (they're `content` kind, same as baked). Unit-tested.
- `palette.js` reads the four stores via `lib/store.js get(KEYS.x, [])` and passes them in.

## 4. Hardening / testing
- XSS: user labels/subs already render through `esc()` in `palette.js` (the result-row render is unchanged) — confirm. ids/keys are generated (`u`/`p`/`cku`/`pku`+ts) — safe; the entry `key` for user items can be the id.
- Dedup: a user event and a baked calendar event won't collide (different stores); within a store ids are unique. No special dedup needed beyond `buildUserEntries` skipping empties.
- Defensive reads: `get(KEYS.events, [])` etc. (array fallback fires the type-guard).
- `tests/palette.test.mjs`: add `buildUserEntries` cases (each source → entries with the right route; empty/missing arrays → []; empty label skipped; no mutation). Existing palette + suite green.
- Browser: add a custom checklist task "Foo widget", open ⌘K, type "Foo widget" → it appears (badge "yours"), Enter → goes to #/checklist; saved place name searchable → #/map; a user event title → #/calendar; deleting a custom item then reopening the palette → it's gone (freshness). 0 console errors.

## 5. Out of scope
Deep-scroll/highlight the matched item on its page; indexing brew ideas / budget lines (lower value); fuzzy matching.
