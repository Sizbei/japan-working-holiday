# Spend log (Budget v2) + People v1.1 pack — plan (2026-07-09)

**Owner-picked (A + C from brainstorm):** (A) a real expense log turning the budget *planner* into an actuals tracker — quick-add spends, monthly actual vs plan, honest runway on the dashboard; (C) the People v1.1 warmth pack — drifting hints, person↔event links, vCard export. Two workstreams, **separate PRs**; A first.

**Shared constraints:** device-local (`jwh-*` keys ride backup), identity-free, `esc()` everywhere, pure math in `lib/` with tests, single-path where others derive (note: budget.js today deliberately does NOT dispatch `jwh:data-changed` — that changes in A because the dashboard teaser will now derive from spends).

---

## A — Spend log (`fix: the budget page is a planner, not a tracker` — audit finding)

### Data — `jwh-spend-v1`
```js
{ v:1, items: [ { id:'s<ts>', date:'2026-07-09', amount:1200, note:'ramen', cat:'food' } ] }
```
Amounts in yen (integers). `cat` optional free tag (suggested chips from prior use). Bounded: keep ~18 months; prune oldest beyond (pure helper).

### Pure lib — `lib/spend.js` (+~8 tests)
- `parseSpend(text, todayIso)` — natural-language quick-add, calendar-quick-add precedent: `"1200 ramen"`, `"¥3,400 drinks with Kenji"`, `"1.2k combini"`, optional trailing date word (`yesterday`, weekday — reuse nlevent date bits if cleanly importable, else a slim local parser). Returns `{amount, note, date}` or null.
- `monthTotal(items, ym)`, `monthByCat(items, ym)`, `spendSummary(items, plannedMonthly, savings, income, todayIso)` → `{ actualThisMonth, dailyRate, projectedMonth, vsPlan, actualRunwayMonths }` (runway from *actual* trailing 30-day burn, not plan).
- `pruneSpend(items, todayIso)`.

### UI
- **Budget page:** new "Spent this month" card ABOVE the planner groups: quick-add input (`＋ ¥ amount note…`), month total vs planned burn (bar: actual|plan), last ~8 entries with delete, per-cat chips. Month nav (‹ July ›) for history. Keep the planner groups untouched below.
- **Dashboard teaser** (`#tBudget`): post-arrival line becomes `spent ¥84k of ¥190k · runway N mo` (actuals when ≥1 spend exists this month; falls back to today's plan-burn copy when the log is empty).
- **Data flow change:** spend mutations `set(KEYS.spend)` + dispatch `jwh:data-changed` (the teaser derives now); budget PLANNER mutations keep their direct-render pattern (unchanged, documented).
- Calendar quick-add stays event-only (no mode confusion); the spend input lives on Budget + optionally a `฿`-style palette action later (out of scope).

### Verify
Tests green; headless: quick-add `"1200 ramen"` → entry today + teaser flips to actuals; `"¥3,400 drinks yesterday"` dated correctly; month nav shows history; delete works; empty log → plan-copy fallback; 0 errors. Adversarial critic (Opus) before merge — parser edge cases (comma/k-suffix/garbage), teaser fallback matrix, prune bounds.

---

## C — People v1.1 pack (separate PR)

1. **Drifting hints — page-level, never the bell.** On `#/people`, a slim strip above the grid: `☾ Drifting: Tomo-san (3 wks) · Mia (12 d)` — people with `lastSeen` (or `metDate`) > 14 days ago, excluding `leaves`-passed. Pure `driftingPeople(list, todayIso)` + test. Click → opens that person's drawer.
2. **Person ↔ event link.** `metEventId` optional field; the person editor gains a "Met at… (link an event)" picker (search over `allEvents()` titles — reuse the eventsearch pattern, lite). Person drawer's met-row becomes a link → opens the calendar event panel; the calendar event side-panel gains a `縁 met N people here` line when any person links to it (reads `KEYS.people`; calendar already imports nothing from people — add a small read-only helper import; no circular risk: people.js must NOT import calendar).
3. **vCard export.** Button in the People toolbar → downloads `people.vcf` (N/TEL/NOTE/BDAY from fields; pure `toVCard(list)` + test; the download helper pattern exists in calendar-editor).

### Verify
Tests; headless: drifting strip lists the right people + opens drawer; link picker attaches an event and both directions render; vCard downloads with N entries; 0 errors. Critic on the cross-module seam (calendar panel reading people data — esc discipline + no import cycle).

---

## Order & gates
A (S1 lib+tests → S2 UI+teaser → critic → PR) then C (S1 lib → S2 UI → critic → PR). SW bump each. Usage tracker will tell us in a month whether the spend log earns its slot.
