# Packing Page — Design Spec

**Date:** 2026-06-22
**Status:** draft for AI review → user review → plan
**Route:** new `#/packing`

## 1. Goal

A categorized **packing checklist** for the Canada→Tokyo move: a curated, researched default list (documents, money, electronics, clothing, health, etc.) you can check off, plus the ability to add/remove your own items. Progress bar; everything device-local. Modeled on the existing yearlong checklist UI, but simpler — **no prerequisite locking, no due dates** (packing is a flat, categorized list).

**Assumption (figure-it-out):** a checklist (check/add/remove + progress), not a luggage-weight calculator or per-bag allocator. Quantity and carry-on/checked tagging are deferred (§8).

## 2. Where it lives

New route `packing`, same new-page pattern as Budget:
- `router.js`: add `'packing'` to `ROUTES` **and** `packing: 'Packing'` to `TITLES` (the two MUST stay in sync — a route without a `TITLES` entry yields an undefined `document.title`).
- `index.html`: nav link (`data-i18n="nav.packing"`) + `<div class="view" id="view-packing"><section id="packing">` with `.pillar-head` (jp accent `荷造り`, `<h2 data-i18n="head.packing">`), a `.lede`, a progress bar (`#packBar`/`#packPct` mirroring `#checkBar`/`#checkPct`), and a list container `#packList`.
- `main.js`: `mountPacking(data)` near the other mounts.
- `lib/store.js` `KEYS`: `packing: 'jwh-packing-v1'` (checked map), `packCustom: 'jwh-pack-custom-v1'` (custom items), `packOrder: 'jwh-pack-order-v1'` (per-category reorder), `packHideDone: 'jwh-pack-hidedone-v1'`. (Collapse state uses the shared `KEYS.collapse` from the accordion spec.)
- `sw.js`: precache `assets/packing.js` (+ `assets/lib/packing.js` if a pure helper lands), bump `CACHE`.
- `i18n.js`: `nav.packing` (荷造り), `head.packing`, `lede.packing`.

## 3. Data model

### Baked default list — `tips.json.packing` (curated content)
A flat array of items, each tagged with a category. Categories render as grouped sections in a fixed order.
```json
"packing": [
  { "id": "pk-passport",   "cat": "Documents", "item": "Passport (6+ mo validity) + WHV visa page", "note": "…", "confidence": "high" },
  { "id": "pk-coe",        "cat": "Documents", "item": "Certificate of Eligibility / visa docs (printed)", "confidence": "high" },
  { "id": "pk-insurance",  "cat": "Documents", "item": "Travel medical insurance proof (until NHI kicks in)", "confidence": "high" },
  { "id": "pk-cards",      "cat": "Money", "item": "2+ cards (Visa/Mastercard; a no-FX-fee card)", "confidence": "high" },
  { "id": "pk-cash",       "cat": "Money", "item": "Starter ¥ cash (¥30–50k) for day one", "confidence": "medium" },
  { "id": "pk-adapter",    "cat": "Electronics", "item": "Power: Japan is Type A, 100V (Canada plugs fit; check voltage)", "confidence": "high" },
  { "id": "pk-meds",       "cat": "Health", "item": "Prescription meds + a Yakkan Shoumei if over the limit", "note": "Some OTC meds (certain decongestants) are restricted — verify before bringing.", "confidence": "high" },
  { "id": "pk-deodorant",  "cat": "Health", "item": "Deodorant / specific toiletries (harder to find / different)", "confidence": "low" }
  // … a researched ~25–40 item starter list across: Documents, Money, Electronics, Clothing, Health, Day-one bag, Misc
]
```
Item fields: `id` (stable), `cat`, `item`, optional `note`, optional `confidence`. (The full curated list is produced at implementation time; the spec fixes the shape + the category set + a representative sample incl. the genuinely Japan-specific gotchas — meds/Yakkan Shoumei, 100V power, day-one cash.)

### User state (localStorage)
- `jwh-packing-v1` — checked map: `{ "<itemId>": true }` (same shape as the yearlong checklist's `KEYS.checklist`).
- `jwh-pack-custom-v1` — user-added items: `[ { id: "pku<ts>", cat, item } ]`. Custom items are checkable (their id flows into the same checked map) and removable; baked items can be checked but not removed (can be "skipped" → a `hidden` set in the checked store? No — keep simple: baked items aren't removable; user just leaves them unchecked).

## 4. Logic

The render is DOM glue (like `content.js` checklist). The genuinely pure, testable logic lives in `lib/packing.js`:
- `groupByCategory(items, ORDER)` → `[{ cat, items[] }]` in fixed order (unknown cats last).
- `progress(items, checked)` → `{ done, total, pct }`. **`items` = baked packing items ++ user custom items** — progress counts **only** packing items, **never** `DATA.checklist` (the yearlong checklist is a separate store/feature; they must not cross-count). `total` includes custom items; `done` = items whose id is truthy in the `checked` map.

CATEGORY_ORDER = `['Documents','Money','Electronics','Clothing','Health','Day-one bag','Misc']`.

## 5. UI (`packing.js`) — "super checklist" (Rich)

A genuinely full-featured checklist. Controls at top: **collapse-all/expand-all**, **hide-done** toggle (mirrors the yearlong checklist's), and a **progress bar** `${pct}% · ${done}/${total}` (reuse `#checkBar`/`#checkPct` markup/CSS as `#packBar`/`#packPct`).

- **Collapsible category sections (animated accordion):** each category is an `.acc` section (see `2026-06-22-collapsible-accordion.md`) — header = category name + an `.acc-count` `done/total` for that category + chevron; panel = the item rows. After render, call `mountAccordion($('#packList'), { allToggle: '#packCollapseAll' })`. Collapse ids: `pack-cat-<slug>`.
- **Item rows:** a real `<label><input type=checkbox>…</label>` (checkbox is the focusable control — real controls, not `role=button`), preceded by a `.dnd-handle` for reordering. A baked item's `note` renders as a second-line sub-text (like a checklist note); a `confidence:"low"` item renders a `.badge.low` "verify" badge (same class as `content.js` domain findings). Custom items show a remove (×). Baked ids `pk-<slug>`, custom ids `pku<ts>`.
- **Drag-reorder within a category:** `makeSortable` per category list (handle `.dnd-handle`, `idOf: el=>el.dataset.id`), persisting order to `jwh-pack-order-v1` keyed by category — exactly the checklist's reorder pattern. Reorder only within a category (items don't move between categories).
- **Hide-done:** a toggle (`jwh-pack-hidedone-v1`, `'on'`/`''`) that filters checked items out of the rows (and drag is disabled while hiding-done, matching the checklist). Per-category `.acc-count` and the overall progress still reflect the true totals.
- **Add item:** input + category `<select>` + Add (like the brew "idea cards" add); appends to `jwh-pack-custom-v1` (`pku<ts>`), into the chosen category.
- Adding a **custom category** is out of scope (v1 uses the fixed CATEGORY_ORDER); custom items pick from existing categories.
- **Add item:** an input + category select + Add (like the brew "idea cards" add). Appends to `jwh-pack-custom-v1` with a fresh `pku<ts>` id.
- **Remove a custom item:** delete it from `jwh-pack-custom-v1` **and** delete its id from the `jwh-packing-v1` checked map (no orphaned checked entries). Baked items are not removable (just left unchecked).
- Checking/adding/removing saves to localStorage and **re-renders the packing view directly** (+ updates progress). It does **NOT** dispatch `jwh:data-changed` — nothing else derives from packing (per the single-path convention; same reasoning as Budget).
- **100% celebration (DRY fix):** `celebrate()` is currently **private** in `content.js` and not importable. Extract it into a small shared module **`assets/celebrate.js`** — `export function celebrate(message)` (the `blip('1up')` + `dndToast(message)` + confetti DOM + celebrations-setting gate, moved verbatim from content.js); `content.js` imports it (its checklist 100% message unchanged), and `packing.js` calls `celebrate('Packed and ready ✈️')` on the 0→100% crossing. (Do **not** duplicate the confetti.)
- Every dynamic string through `esc()`. Keyboard focus is restored across the `innerHTML` rebuild using the **checklist's selector-capture pattern** (`captureCheckFocus()` in `content.js` — capture a CSS selector for the focused control before rebuild, refocus after); replicate it as `capturePackFocus()`.
- **Long-press / right-click parity (optional, cheap):** `gestures.js` `resolveTarget` could map a packing row to a quick menu — **custom** rows get ☑/☐ + ✕ Remove; **baked** rows get only ☑/☐ (baked items aren't removable). Nice-to-have; not required for v1 (flag, don't block).

## 6. Testing

- `tests/packing.test.mjs`: `groupByCategory` (order, unknown-cat handling, empty), `progress` (0/partial/100, custom items included). Existing suites stay green.
- Browser: check items → progress moves; add a custom item (it persists + counts); remove a custom item; reach 100% → celebration; reload persists; nav/title/JP toggle; 0 console errors.

## 7. Files

- **Create:** `assets/packing.js`, `assets/lib/packing.js`, `assets/celebrate.js` (extracted shared celebration), `tests/packing.test.mjs`.
- **Reuse:** `assets/collapse.js` (`mountAccordion`), `assets/dnd.js` (`makeSortable`), `assets/celebrate.js`.
- **Modify:** `index.html` (nav + view + controls: progress bar, collapse-all, hide-done), `router.js` (ROUTES+TITLES), `main.js` (mount), `lib/store.js` (KEYS ×4 + shared `collapse`), `data/tips.json` (`packing[]`), `assets/content.js` (import `celebrate` from the new module; remove its private copy), `assets/style.css` (packing rows/badges if not covered by checklist CSS), `assets/i18n.js` (nav/head/lede.packing), `sw.js` (precache `assets/packing.js` + `assets/lib/packing.js` + `assets/celebrate.js` + `assets/collapse.js`, CACHE bump). Optionally `gestures.js` (long-press parity — deferred).

## 8. Out of scope

Quantities, carry-on vs checked allocation, luggage weight/airline limits, per-trip multiple lists, sharing/export of the packing list (the global backup already captures the localStorage keys). These are deferred; the spec keeps a flat categorized check/add/remove list.
