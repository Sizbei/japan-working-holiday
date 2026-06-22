# Budget Page — Design Spec

**Date:** 2026-06-22
**Status:** draft for AI review → user review → plan
**Route:** new `#/budget`

## 1. Goal

A **budget planner** for the working-holiday year: estimate the one-time setup costs and the monthly running costs, set starting savings (and optional monthly income), and see the bottom line — total to land, monthly burn, monthly net, and **runway** (how many months the savings last). It is a planner (editable estimates), **not** an expense tracker (no daily logging).

**Assumption (figure-it-out):** planner over tracker. If you wanted actual-spend logging, that's a different, heavier feature — flagged in §9.

## 2. Where it lives

A new route `budget`, following the established new-page pattern:
- `router.js`: add `'budget'` to `ROUTES` and `budget: 'Budget'` to `TITLES`.
- `index.html`: a nav link `<a href="#/budget" data-route="budget" data-i18n="nav.budget">Budget</a>` and a `<div class="view" id="view-budget"><section id="budget">…</section></div>` with a `.pillar-head` (jp accent `予算`, `<h2 data-i18n="head.budget">`).
- `main.js`: `mountBudget(data)` after `mountDashboard` / before `initRouter`.
- `lib/store.js` `KEYS`: add `budget: 'jwh-budget-v1'`.
- `sw.js`: precache `assets/budget.js` + `assets/lib/budget.js`, bump `CACHE`.
- `lang.js`/`i18n.js`: `nav.budget` (予算), `head.budget`, `lede.budget` strings.

## 3. Data model

### Baked defaults — `tips.json.budget` (curated, researched, editable content)
```json
"budget": {
  "currency": "JPY",
  "oneTime": [
    { "id": "flight", "label": "Flight (YVR→NRT, one-way)", "amount": 90000, "note": "…", "confidence": "medium" },
    { "id": "visa",   "label": "WHV application", "amount": 0, "note": "free for Canadians", "confidence": "high" },
    { "id": "deposit","label": "Move-in (deposit + first month, foreigner-friendly)", "amount": 120000, "confidence": "medium" },
    { "id": "sim",    "label": "SIM / eSIM setup", "amount": 4000, "confidence": "medium" },
    { "id": "furnish","label": "Bedding / starter kit", "amount": 20000, "confidence": "low" }
  ],
  "monthly": [
    { "id": "rent",    "label": "Rent (share house)", "amount": 60000, "confidence": "medium" },
    { "id": "utils",   "label": "Utilities / internet", "amount": 12000, "confidence": "medium" },
    { "id": "transit", "label": "Transit (Suica)", "amount": 10000, "confidence": "medium" },
    { "id": "food",    "label": "Food & groceries", "amount": 45000, "confidence": "low" },
    { "id": "phone",   "label": "Phone plan", "amount": 3000, "confidence": "medium" },
    { "id": "health",  "label": "NHI + pension", "amount": 20000, "note": "National Health Insurance + National Pension, first year", "confidence": "medium" },
    { "id": "fun",     "label": "Fun / travel", "amount": 40000, "confidence": "low" }
  ]
}
```
Amounts are integers in yen. (Defaults are seeded from existing researched data — rooms rent ranges, the `timeSensitive` NHI/pension figures, restaurant costs — and carry `confidence`, per the project's confidence convention.)

### User state — `jwh-budget-v1` (localStorage)
```js
{
  savings: 8000000,            // starting savings (¥), user-entered
  monthlyIncome: 0,            // expected monthly income while in Japan (¥), 0 if not working/unknown
  overrides: { "<lineId>": <amount> },   // edited amounts for baked lines (sparse)
  hidden: ["<lineId>"],        // baked lines the user removed from their plan
  custom: { oneTime: [ { id, label, amount } ], monthly: [ { id, label, amount } ] }  // user-added lines
}
```
The effective line list = baked lines (amount = override ?? default, minus hidden) ++ custom lines. Editing a baked line writes an override; a custom line is fully user-owned. Reset clears overrides/hidden/custom (back to baked defaults).

## 4. Pure logic — `lib/budget.js` (unit-tested)

```
effectiveLines(baked, state, group) -> [{ id, label, amount, baked: bool }]   // merges defaults+overrides+custom−hidden
sum(lines) -> number
summary(baked, state) -> {
  oneTimeTotal, monthlyTotal, monthlyNet (= monthlyIncome - monthlyTotal),
  toLand (= oneTimeTotal),                       // cash needed before arrival
  runwayMonths (= monthlyNet < 0 ? floor(savings / -monthlyNet) : Infinity),
  afterLanding (= savings - oneTimeTotal)        // savings left right after setup
}
fmtYen(n) -> "¥1,234,567"   // OWNED HERE — define in lib/budget.js as `'¥' + Math.round(n).toLocaleString('en-US')`.
                            // (lib/rooms.js only PARSES yen; the display `yen()` in rooms.js is a private const, not importable.)
```
All pure, no DOM, importable in Node. Guards: non-numeric/negative inputs coerced to 0; `runwayMonths` is `Infinity` when `monthlyNet ≥ 0` — **kept in JS memory only, never persisted** (JSON can't hold Infinity); the UI renders it as "∞ / sustainable".

## 5. UI (`budget.js`)

- **Summary band** (top, sticky-ish): big numbers — *To land: ¥X · Monthly burn: ¥Y · Net/mo: ±¥Z · Runway: N months* (or "sustainable"). Color the net/runway (green sustainable, amber tight <6 mo, red <3 mo).
- **Inputs:** Savings and Monthly income as number inputs (¥), debounced-save.
- **Two collapsible groups (animated accordion):** One-time costs and Monthly costs are each an `.acc` section (see `2026-06-22-collapsible-accordion.md`) — header = group name + an `.acc-count` group subtotal (e.g. `¥234,000`) + chevron; panel = the line items. After render, call `mountAccordion($('#budgetGroups'))`. Collapse ids: `budget-onetime`, `budget-monthly`. Each line: label + an editable amount (number input) + a remove (×); a `＋ Add line` per group (label + amount). Editing/removing/adding writes to `jwh-budget-v1` and re-renders (summary + group subtotals).
- **Reset to defaults** button (confirm via existing `confirmModal`).
- Every dynamic string through `esc()`. Number inputs validated (≥0, integer yen).
- Mutations save to localStorage and **re-render the budget view directly** (call the local `render()` after a save). They do **NOT** dispatch `jwh:data-changed` — nothing else derives from the budget yet, and dispatching would trigger needless no-op re-renders in the dashboard/calendar/map/plan listeners. (Per the single-path convention: dispatch only when another module consumes the change.)

## 6. Dashboard touch (optional, minimal)

None required for v1. (A future dashboard "runway" widget is out of scope; when it lands, *that* work adds the `jwh:data-changed` dispatch + a dashboard listener together.)

## 7. Testing

- `tests/budget.test.mjs` (node --test): `effectiveLines` merge (override beats default, hidden removed, custom appended), `sum`, `summary` (toLand, monthlyNet, runwayMonths incl. the `Infinity` and negative-net cases, afterLanding), `fmtYen` formatting incl. 0 and large numbers. Input guards (negative/NaN → 0).
- Existing suites stay green. Browser-verify: edit amounts → summary updates; add/remove lines; reset; reload persists; nav + title + JP toggle work; 0 console errors.

## 8. Files

- **Create:** `assets/budget.js`, `assets/lib/budget.js`, `tests/budget.test.mjs`.
- **Reuse:** `assets/collapse.js` (`mountAccordion`).
- **Modify:** `index.html` (nav + view + `#budgetGroups`), `router.js` (ROUTES+TITLES), `main.js` (mount), `lib/store.js` (KEYS `budget` + shared `collapse`), `data/tips.json` (`budget` block), `assets/i18n.js` (nav/head/lede.budget), `sw.js` (precache `assets/budget.js` + `assets/lib/budget.js` + `assets/collapse.js`, CACHE bump).

## 9. Out of scope

Actual-expense logging / receipts, multi-currency / live FX, charts, bank integration, per-month timeline projection. The Ctrl-free planner is intentionally a static estimate. (FX note: amounts are yen-only; a CAD conversion line is a possible small add but deferred.)
