# Budget CAD Conversion — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** budget page only

## 1. Goal
A Canadian planning in yen wants dollar context. Add an optional **CAD per ¥100** (or ¥/CAD) rate to the budget page; when set, show CAD equivalents alongside the yen summary totals. Pure, opt-in, no live FX.

## 2. Design
- A small **rate input** near the summary: "1 CAD = ¥___" (number, default empty/blank = off). Stored in `jwh-budget-v1` as `cadRate` (yen per 1 CAD, e.g. 108). Debounced save + re-render.
- When `cadRate > 0`, the summary band shows CAD under each yen figure: To land `¥234,000 (≈ C$2,167)`, Monthly burn, Net/mo, After-setup. Conversion = `yen / cadRate`, formatted `C$X,XXX` (2-dp or rounded — `Math.round`).
- **Pure logic in `lib/budget.js`:** `fmtCad(yen, rate)` — **the `rate ≤ 0 / non-finite → '' guard lives INSIDE the function** (`if (!(rate > 0)) return ''`), not just at the call site, so a divide-by-zero/`Infinity`/`NaN` can never render. Otherwise `'C$' + Math.round(yen/rate).toLocaleString('en-US')`. Unit-test it (rate=0/blank/NaN/negative → '', a normal rate, rounding).
- The runway/months figures are unitless (no CAD). Only yen-denominated totals get a CAD twin.

## 3. Files
- **Modify:** `assets/lib/budget.js` (`fmtCad`; `state` default-destructure adds `cadRate = 0`), `assets/budget.js` (rate input + render CAD twins), `tests/budget.test.mjs` (`fmtCad` cases), `assets/style.css` (the `.bdg-cad` sub-figure styling), `sw.js` (CACHE bump — no new asset). `data/tips.json` may seed a default `budget.cadRate` (e.g. 108) flagged low-confidence "verify the rate", or leave blank.

## 4. Hardening / testing
- `cadRate` coerced via `+value` with `>0` guard; blank/NaN/≤0 → CAD hidden (no divide-by-zero). No new innerHTML user-text surface (rate is a number; CAD output is a formatted number → safe, still goes through the existing escaped render).
- `store.get(KEYS.budget,{})` already covers the new field via default-destructure.
- Test: `fmtCad(234000, 108)` → `'C$2,167'`; `fmtCad(x, 0)`/`fmtCad(x, NaN)` → `''`. Browser: set a rate → CAD twins appear and update; clear it → they disappear; reload persists; 0 console errors.

## 5. Out of scope
Live FX rates / API, multi-currency beyond CAD, historical rates, per-line CAD.
