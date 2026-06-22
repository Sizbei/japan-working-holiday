# Dashboard Teasers: Budget + Packing — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** dashboard only

## 1. Goal
Surface the two new pages on the home dashboard's "More" teaser strip: a **Budget** teaser (runway) and a **Packing** teaser (progress), each a one-liner linking to its page. Closes the budget spec's deferred dashboard hook.

## 2. Design
- `index.html`: add two `.teaser` blocks in the existing `.dash-teasers` section (mirror `#tBookBy`/`#tEvents`/`#tPlan`): `#tBudget` (heading "Budget") and `#tPacking` (heading "Packing"), each with a `.teaser-body`. Headings get `data-i18n="head.teaser.budget"`/`head.teaser.packing` (+ i18n strings, or the drift test fails).
- `dashboard.js`: in `refresh()` (or a small `refreshTeasers()` it calls), compute:
  - **Budget:** `const s = summary(data.budget||{currency:'JPY',oneTime:[],monthly:[]}, store.get(KEYS.budget,{}))`. **Empty-state check (required):** if the user hasn't set anything up (`s.oneTimeTotal===0 && s.monthlyTotal===0 && (savings from state)===0`) → text `"Set up your budget"`; otherwise → `Runway: ${s.runwayMonths===Infinity?'sustainable':s.runwayMonths+' mo'} · to land ${fmtYen(s.toLand)}`. Link `#/budget`.
  - **Packing:** `const p = progress([...(data.packing||[]), ...store.get(KEYS.packCustom,[])], store.get(KEYS.packing,{}))`. If `p.total===0` → `"Start your packing list"`; else → `${p.pct}% packed · ${p.done}/${p.total}`. Link `#/packing`.
  - Reuse the existing `teaser(sel, text, route)` helper (it `esc()`s text).
- **Update timing (no spurious dispatch):** budget/packing mutations happen on their own routes and re-render locally (they do not dispatch `jwh:data-changed`, by design — keep it that way to avoid no-op re-renders across the other listeners). The dashboard recomputes **only these two teasers** via a small separate `refreshTeasers()` called: (a) at the end of the existing `refresh()` (so the `jwh:data-changed` path covers them), and (b) on a NEW `jwh:route` listener when `e.detail.route==='dashboard'`. Since you can only change budget/packing on their own routes, landing back on the dashboard is the natural refresh trigger; `refreshTeasers()` reads localStorage fresh each call (no staleness). `refreshTeasers()` is cheap (two `teaser()` calls) so the dual trigger isn't a meaningful double-render. **Document in dashboard.js the constraint** that budget/packing intentionally do not dispatch — so a future change doesn't "fix" it into a global dispatch.

## 3. Files
- **Modify:** `assets/dashboard.js` (import `summary`/`fmtYen` from `lib/budget.js`, `progress` from `lib/packing.js`; compute + render the 2 teasers; `jwh:route` listener), `index.html` (2 teaser blocks), `assets/i18n.js` (`head.teaser.budget`/`head.teaser.packing`), `sw.js` (CACHE bump — no new asset).
- **Reuse:** `lib/budget.js`, `lib/packing.js`, the existing `teaser()` helper.

## 4. Hardening / testing
- Defensive reads with fallbacks (`store.get(...,{})`/`[]`); `summary`/`progress` already guard empty/corrupt state. No new user-input surface (text is numbers/labels we control → still passes through `teaser()`'s `esc()`).
- Test: existing suites green; browser — both teasers render with live values, update after editing budget/checking a packing item then returning to dashboard, links navigate, 0 console errors.

## 5. Out of scope
A full budget chart or packing breakdown on the dashboard; alerts/bell entries for budget/packing.
