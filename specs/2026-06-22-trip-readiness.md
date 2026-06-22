# Trip-Readiness Score — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** dashboard

## 1. Goal
A single motivating **"Trip readiness"** number on the dashboard that aggregates the planning surfaces — checklist progress, packing progress, budget runway, and days-to-arrival — into one score with a small breakdown, so you see at a glance how ready you are for **NRT 2026-06-30**.

## 2. Pure logic — `lib/readiness.js` (unit-tested)
```
readiness({ checklistPct, packingPct, budgetReady, daysToArrival }) -> {
  score,            // 0–100 integer
  parts: [          // for the breakdown UI
    { key:'checklist', label:'Checklist', pct },
    { key:'packing',   label:'Packing',   pct },
    { key:'budget',    label:'Budget',    status },     // 'ready' | 'tight' | 'unset'
  ],
  daysToArrival,
  tone,             // 'good' | 'ok' | 'low'  (for color)
}
```
- **Score** = weighted average: `checklist 45% + packing 30% + budget 25%`, where budget contributes `budgetReady ? 100 : (tight ? 50 : 0)`. (Weights chosen so the checklist — the heart of the plan — dominates.) All inputs coerced to 0–100; missing → 0.
- `budgetReady` derived by the caller from `summary()`: runway `Infinity`/sustainable or ≥ a comfortable threshold → ready; some runway → tight; nothing set → unset (contributes 0, but the part shows "unset" not a misleading 0%).
- `tone`: score ≥ 75 → good, ≥ 40 → ok, else low. Pure, no DOM. Inputs guarded (NaN/negative → 0; clamp 0–100).

## 3. UI (`dashboard.js`)
- A **"Trip readiness" widget** in the dashboard (a new card in the `.needs-me` band or its own slim hero strip): a big `${score}%` (toned color), a one-line `N days to Tokyo`, and a compact breakdown — three mini-bars/labels (Checklist X% · Packing Y% · Budget ready/tight/unset). Each part links to its page (#/checklist, #/packing, #/budget).
- Computed in `dashboard.js` `refresh()`/`refreshTeasers()` (it already runs on `jwh:data-changed` + on `jwh:route` to dashboard). Reads:
  - **checklistPct:** `checklistItems(data)` (exported from content.js) + the `jwh-checklist-v1` checked map → done/total.
  - **packingPct:** `progress([...(data.packing||[]), ...packCustom], packChecked)` from `lib/packing.js`.
  - **budget:** `summary(data.budget||fallback, get(KEYS.budget,{}))` from `lib/budget.js` → derive `budgetReady`/tight/unset.
  - **daysToArrival:** the `lib/dates.js` countdown helper (arrival 2026-06-30).
- Every dynamic value is numeric/label (app-controlled) → still through `esc()`/the existing widget helper. No new storage. No `jwh:data-changed` dispatch (read-only widget).
- The heading (if `data-i18n`) needs an i18n string or the drift test fails — add `head.readiness` (e.g. 旅の準備).

## 4. Files
- **Create:** `assets/lib/readiness.js`, `tests/readiness.test.mjs`.
- **Modify:** `assets/dashboard.js` (compute + render the widget), `index.html` (the widget markup + `data-i18n` heading), `assets/lib/store.js` (none — no new key), `assets/i18n.js` (`head.readiness`), `assets/style.css` (widget styles — reuse `.widget`/`.w-bar`/`.w-prog` where possible), `sw.js` (precache `assets/lib/readiness.js` + CACHE bump).
- **Reuse:** `lib/budget.js`, `lib/packing.js`, `lib/dates.js`, `content.js checklistItems`.

## 5. Hardening / testing
- Defensive: all reads guarded (`||{}`/`||[]`); `readiness()` clamps + handles missing inputs (empty plan → score 0, parts show 0%/unset, tone low) without throwing.
- `tests/readiness.test.mjs`: the weighted score (a few combos incl. all-zero, all-100, mixed, budget ready/tight/unset), the tone thresholds, clamping (NaN/negative/over-100), parts shape.
- Browser: dashboard shows the readiness widget with a sensible score; check some checklist/packing items → score rises on return to dashboard; an unset budget shows "unset" (not a wrong %); the part links navigate; 0 console errors.

## 6. Out of scope
A historical readiness trend, configurable weights, a readiness goal/deadline alert, including map/places in the score.
