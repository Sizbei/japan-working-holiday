# Printable One-Page Summary — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** a print view + print CSS

## 1. Goal
A **"🖨 Print / Save PDF"** action that produces a clean one-page summary for offline/paper reference: arrival countdown, checklist progress + the next open items, packing progress, budget summary (to-land + runway), and upcoming deadlines/book-by. Everything renders from current device-local state.

## 2. Design
- **Dedicated print container** `#printView` (in `index.html`, normally `hidden` and visually hidden on screen). A `buildPrintSummary(data)` populates its `innerHTML` on demand, then `window.print()` is called.
- **Trigger:** a `🖨 Print / Save PDF` button — placed in the **⚙ Guide & Settings overlay** (it already hosts utilities) and/or the footer near the existing backup buttons. On click: `renderPrintSummary(); window.print();`.
- **`@media print` stylesheet** (new — there is none today): hide everything (`.topbar, .route-nav, #main, .grain, …`), show only `#printView`; black-on-white, compact, page-break-friendly. On screen `#printView` stays `hidden`.
- **Content of the summary** (read from existing libs/state, no new logic):
  - Header: "My Year in Japan — trip summary", generated date, **days to NRT** (from `lib/dates.js`, arrival 2026-06-30).
  - **Checklist:** `X% · done/total` + a short list of the next ~8 open (unchecked, soonest-due) items (`lib/notify`/the checklist data).
  - **Packing:** `X% · done/total` (`lib/packing.js progress`) + count of unpacked essentials.
  - **Budget:** to-land ¥, monthly burn, runway (`lib/budget.js summary`) (+ CAD if a rate is set).
  - **Upcoming deadlines:** the next ~6 book-by / time-sensitive items (from `data.bookByTimeline`/`data.timeSensitive`, soonest first).
- Every dynamic string through `esc()`. Numbers/labels are app-controlled; user-entered custom budget/packing/event text gets `esc()`'d (it flows into `#printView` innerHTML).

## 3. Files
- **Create:** `assets/print.js` (`renderPrintSummary(data)` + the trigger wiring), and a small pure `lib/print.js` only if there's genuinely reusable summarizing logic — otherwise compute inline from the existing libs (avoid ceremony).
- **Modify:** `index.html` (`#printView` container + the 🖨 button in the guide/footer), `assets/style.css` (the `@media print` block + minimal `#printView` typographic styles), `assets/guide.js` and/or `main.js` (wire the button), `sw.js` (precache `assets/print.js` + CACHE bump).
- **Reuse:** `lib/budget.js summary/fmtYen`, `lib/packing.js progress`, the checklist/deadline data already in `data`.

## 4. Hardening / testing
- The button must work from any route (the print view is independent of the active route). `window.print()` is user-initiated (not auto). Reduce-motion irrelevant (print).
- XSS: custom budget line labels, custom packing items, and user event titles can appear in the summary → `esc()` them (consistent with their pages).
- Test: minimal — if a pure summarizer lands, unit-test it; otherwise browser-verify: click 🖨 → the print preview (or a forced `#printView` visible toggle for testing) shows the summary with live numbers; screen view is unaffected; 0 console errors. (Playwright can assert `#printView` got populated + the `@media print` hides chrome via a print-emulation.)

## 4b. Hardening (from adversarial + security review)
- **Button placement = the FOOTER** (next to the existing backup buttons), **NOT the guide overlay** — the guide rebuilds its DOM (`ov.innerHTML=…`) on every open, so a button added there wouldn't persist. Wire `#printBtn` in `main.js`/`print.js`.
- **`@media print` hide-list:** `body{background:#fff;color:#000} .topbar,.route-nav,#main,.grain,.lp-menu,.toast,.cmdk-overlay{display:none!important} #printView{display:block!important;position:static;margin:0;padding:2rem;max-width:8.5in}`. `#printView` carries the `hidden` attribute on screen; the print rule overrides it.
- **Checklist "next open items":** transform the checklist data directly — `(data.checklist||[]).flatMap(p=>p.items||[]).filter(it => !checkedMap[it.id]).sort(by dueBy soonest).slice(0,8)` — do **not** route through `lib/notify.js` (its alert shape differs).
- **XSS (HIGH):** custom budget line **labels**, custom packing **items**, and user event **titles** are user free-text echoed into `#printView` innerHTML → each MUST pass through `esc()`. **Double-quoted attributes only** at every `esc()` site (the single-quote gap). Read from the parsed localStorage objects and `esc()` at interpolation (don't shortcut).
- **Data shapes (verified):** `lib/dates.js` countdown helper, `summary()`→{toLand,monthlyTotal,runwayMonths,…}, `progress()`→{done,total,pct}, `bookByTimeline[].what/when`, `timeSensitive[].item/dueBy`. Guard each with `|| []`/`||{}`.

## 5. Out of scope
Multi-page detailed export, custom section selection, direct PDF generation (rely on the browser's Save-as-PDF), styling per-printer.
