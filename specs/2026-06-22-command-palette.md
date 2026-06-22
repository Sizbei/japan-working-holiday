# Command Palette — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Route:** none (a global overlay)

## 1. Goal
A keyboard-first **command palette**: press **Cmd/Ctrl+K** (or **`/`**) anywhere → a centered search overlay. Type to fuzzy-match **all 12 routes** (jump on Enter) and **content** across the app (catalogue pillars, phrases, checklist tasks, packing items, deadlines) — selecting a content hit navigates to its page. Fixes the keyboard-nav gap (number keys only reach 9 of 12 routes) and adds fast find-anything navigation.

## 2. Trigger & interaction
- Global keydown (added in `gestures.js wireKeyboard`, near the existing shortcuts, BEFORE the modifier-bail for the Cmd+K branch — same structure as the calendar undo Ctrl+Z): **Cmd/Ctrl+K** opens; **`/`** opens only when not typing (`typingTarget` guard) and no modal open; both `preventDefault`.
- Overlay: a focus-trapped `.cmdk` dialog (`role="dialog" aria-modal`), a search `<input>` auto-focused, and a results `<ul role="listbox">`. **Esc** closes + restores focus; **↑/↓** move the active option (`aria-activedescendant`); **Enter** activates; clicking a result activates; clicking the backdrop closes.
- Activating a **route** result → `location.hash = '#/' + route`, close. A **content** result → navigate to its owning route (v1: jump to the page; no deep-scroll), close.

## 3. Pure logic — `lib/palette.js` (unit-tested)
```
buildIndex(data, routeLabels) -> [{ kind:'route'|'content', label, sub, route, key }]
searchIndex(index, query, limit=12) -> ranked subset
```
- **Routes:** one entry per `ROUTES` with its title (label) — always matchable (e.g. "bud" → Budget).
- **Content sources** (kind 'content', each carries its target `route`):
  - pillars → `data.restaurants|music|geek|activities|building|meetups|livemusic|disney` (`name` label, `detail` sub) → route `explore` (or `rooms` for rooms list? keep pillars → explore).
  - `data.phrases` (`en` label, `jp`+`read` sub) → route `phrases`.
  - `data.checklist[].items` (`task` label) → route `checklist`; `data.packing` (`item`) → route `packing`.
  - `data.bookByTimeline`/`data.timeSensitive` (`what`/`item`) → route `deadlines`.
- **Ranking:** case-insensitive; label `startsWith` (3) > label `includes` (2) > sub `includes` (1); routes get a small boost so a route match outranks an incidental content match on the same term; below-threshold dropped; tie → shorter label then alpha; slice to `limit`. No input mutation. Empty query → just the route list (so the palette is also a route switcher with no typing).

## 4. UI — `assets/palette.js`
- `export function mountPalette(data)`: build the index once (`buildIndex(data, routeLabels)` where `routeLabels` is `ROUTES.map` to titles — export a `routeLabel(route)` or a small map from `router.js`, OR reuse `TITLES` by exporting it). Wire the global trigger. Render results on input (debounce optional; the index is in-memory so it's instant).
- Each result row: a `<li role="option">` with an icon/kind badge (�type), the `label`, and the `sub` (dimmed). Every dynamic string through `esc()` (content labels are baked, but esc anyway). The active option is styled + scrolled into view.
- Reuse the app's overlay/animation tokens; respect reduce-motion. No new storage.

## 5. Files
- **Create:** `assets/palette.js`, `assets/lib/palette.js`, `tests/palette.test.mjs`.
- **Modify:** `assets/gestures.js` (the Cmd+K / `/` trigger), `assets/router.js` (export `TITLES` or a `routeLabel()` helper for labels), `assets/main.js` (`mountPalette(data)`), `index.html` (none needed — overlay is created in JS; optionally a `⌘K` hint in the topbar), `assets/style.css` (`.cmdk` overlay), `sw.js` (precache the 2 new files + CACHE bump). Update the `?` keyboard-help overlay text to mention Cmd+K / `/`.

## 6. Hardening / testing
- `tests/palette.test.mjs`: `buildIndex` (routes + content entries, each with a valid `route`), `searchIndex` (route-startsWith beats content-includes, empty query → routes only, limit, no mutation, case-insensitive).
- Trigger guards: don't open while typing in an input (for `/`; Cmd+K may open even from an input — but then it `preventDefault`s; acceptable) or while a modal is open. Esc/backdrop close + focus restore. Only one palette at a time.
- XSS: results come from `ROUTES` + baked `tips.json` content → `esc()` all interpolation; double-quoted attributes.
- Browser: Cmd+K opens, type "budget" → Budget route on top, Enter jumps to `#/budget`; type a restaurant name → content hit → Enter goes to Explore; `/` opens when not typing; Esc closes + focus returns; ↑/↓ navigate; 0 console errors.

## 7. Out of scope
Deep-scroll/highlight the matched item on its page, recent/history, fuzzy typo-tolerance beyond substring, actions (toggle/check) from the palette.
