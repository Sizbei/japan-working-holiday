# Dashboard Teasers: Budget + Packing — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** dashboard only

## 1. Goal
Surface the two new pages on the home dashboard's "More" teaser strip: a **Budget** teaser (runway) and a **Packing** teaser (progress), each a one-liner linking to its page. Closes the budget spec's deferred dashboard hook.

## 2. Design
- `index.html`: add two `.teaser` blocks in the existing `.dash-teasers` section (mirror `#tBookBy`/`#tEvents`/`#tPlan`): `#tBudget` (heading "Budget") and `#tPacking` (heading "Packing"), each with a `.teaser-body`. Headings get `data-i18n="head.teaser.budget"`/`head.teaser.packing` (+ i18n strings, or the drift test fails).
- `dashboard.js`: in `refresh()` (or a small `refreshTeasers()` it calls), compute:
  - **Budget:** `summary(data.budget||fallback, store.get(KEYS.budget,{}))` from `lib/budget.js` → text `Runway: ${runwayMonths===Infinity?'sustainable':runwayMonths+' mo'} · to land ${fmtYen(toLand)}`; link `#/budget`. If no budget data, "Set up your budget".
  - **Packing:** `progress(bakedPacking ++ custom, checkedMap)` from `lib/packing.js` (read `data.packing`, `store.get(KEYS.packCustom,[])`, `store.get(KEYS.packing,{})`) → text `${pct}% packed · ${done}/${total}`; link `#/packing`. If empty, "Start your packing list".
  - Reuse the existing `teaser(sel, text, route)` helper (it `esc()`s text).
- **Update timing (no spurious dispatch):** budget/packing mutations happen on their own routes and re-render locally (they do not dispatch `jwh:data-changed`, by design). So the dashboard recomputes these two teasers **on `jwh:route` when navigating to `#/dashboard`** (add a `jwh:route` listener that calls `refreshTeasers()` when `e.detail.route==='dashboard'`), plus the existing `jwh:data-changed` path. This keeps the teasers fresh without making budget/packing dispatch globally.

## 3. Files
- **Modify:** `assets/dashboard.js` (import `summary`/`fmtYen` from `lib/budget.js`, `progress` from `lib/packing.js`; compute + render the 2 teasers; `jwh:route` listener), `index.html` (2 teaser blocks), `assets/i18n.js` (`head.teaser.budget`/`head.teaser.packing`), `sw.js` (CACHE bump — no new asset).
- **Reuse:** `lib/budget.js`, `lib/packing.js`, the existing `teaser()` helper.

## 4. Hardening / testing
- Defensive reads with fallbacks (`store.get(...,{})`/`[]`); `summary`/`progress` already guard empty/corrupt state. No new user-input surface (text is numbers/labels we control → still passes through `teaser()`'s `esc()`).
- Test: existing suites green; browser — both teasers render with live values, update after editing budget/checking a packing item then returning to dashboard, links navigate, 0 console errors.

## 5. Out of scope
A full budget chart or packing breakdown on the dashboard; alerts/bell entries for budget/packing.
