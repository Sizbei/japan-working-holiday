# Packing Page — Design Spec

**Date:** 2026-06-22
**Status:** draft for AI review → user review → plan
**Route:** new `#/packing`

## 1. Goal

A categorized **packing checklist** for the Canada→Tokyo move: a curated, researched default list (documents, money, electronics, clothing, health, etc.) you can check off, plus the ability to add/remove your own items. Progress bar; everything device-local. Modeled on the existing yearlong checklist UI, but simpler — **no prerequisite locking, no due dates** (packing is a flat, categorized list).

**Assumption (figure-it-out):** a checklist (check/add/remove + progress), not a luggage-weight calculator or per-bag allocator. Quantity and carry-on/checked tagging are deferred (§8).

## 2. Where it lives

New route `packing`, same new-page pattern as Budget:
- `router.js`: `'packing'` in `ROUTES`, `packing: 'Packing'` in `TITLES`.
- `index.html`: nav link (`data-i18n="nav.packing"`) + `<div class="view" id="view-packing"><section id="packing">` with `.pillar-head` (jp accent `荷造り`, `<h2 data-i18n="head.packing">`), a `.lede`, a progress bar (`#packBar`/`#packPct` mirroring `#checkBar`/`#checkPct`), and a list container `#packList`.
- `main.js`: `mountPacking(data)` near the other mounts.
- `lib/store.js` `KEYS`: `packing: 'jwh-packing-v1'`, `packCustom: 'jwh-pack-custom-v1'`.
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

The render is DOM glue (like `content.js` checklist). The one genuinely pure, testable piece:
- `lib/packing.js`: `groupByCategory(items, ORDER)` → `[{ cat, items[] }]` in fixed order (unknown cats last), and `progress(items, checked)` → `{ done, total, pct }`. Pure, unit-tested. (If this proves too thin, fold into `packing.js` and test progress via a tiny exported pure fn — but prefer the lib.)

CATEGORY_ORDER = `['Documents','Money','Electronics','Clothing','Health','Day-one bag','Misc']`.

## 5. UI (`packing.js`)

- **Progress bar** at top: `${pct}% · ${done}/${total}` (reuse the checklist's bar markup/CSS).
- **Grouped sections** by category (fixed order); each item is a real `<label><input type=checkbox>…</label>` row (checkbox is the focusable control, matching the project's a11y rule — real controls, not `role=button`). A baked item with a `note` shows it as a sub-line; `confidence:"low"` items get the same "verify" affordance the rest of the app uses. Custom items show a remove (×).
- **Add item:** an input + category select + Add (like the brew "idea cards" add). Appends to `jwh-pack-custom-v1` with a fresh `pku<ts>` id.
- Checking/adding/removing saves to localStorage, re-renders, updates progress, and dispatches `jwh:data-changed`. **100% fires the existing celebrate path** (`dndToast` "Packed and ready ✈️" + confetti, gated by the celebrations setting) — reuse, don't reinvent.
- Every dynamic string through `esc()`. Keyboard focus restored across the `innerHTML` rebuild (same technique as calendar/checklist).
- **Long-press / right-click parity (optional, cheap):** `gestures.js` `resolveTarget` could map a packing row to ☑/☐ + remove, mirroring the checklist rows. Nice-to-have; not required for v1 (flag, don't block).

## 6. Testing

- `tests/packing.test.mjs`: `groupByCategory` (order, unknown-cat handling, empty), `progress` (0/partial/100, custom items included). Existing suites stay green.
- Browser: check items → progress moves; add a custom item (it persists + counts); remove a custom item; reach 100% → celebration; reload persists; nav/title/JP toggle; 0 console errors.

## 7. Files

- **Create:** `assets/packing.js`, `assets/lib/packing.js`, `tests/packing.test.mjs`.
- **Modify:** `index.html`, `router.js`, `main.js`, `lib/store.js`, `data/tips.json` (`packing[]`), `assets/i18n.js`, `sw.js`. Optionally `gestures.js` (long-press parity — deferred).

## 8. Out of scope

Quantities, carry-on vs checked allocation, luggage weight/airline limits, per-trip multiple lists, sharing/export of the packing list (the global backup already captures the localStorage keys). These are deferred; the spec keeps a flat categorized check/add/remove list.
