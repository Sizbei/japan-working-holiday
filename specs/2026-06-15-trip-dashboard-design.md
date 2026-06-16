# Spec — "My Year in Japan" Trip Dashboard

**Date:** 2026-06-15 · **Branch:** `feat/trip-dashboard` · **Arrival anchor:** land NRT **2026-06-30** (depart Canada 6/29). Today = 2026-06-15 → **15 days out**.

Turns the static guide into an interactive, password-gated trip-planning **dashboard**: an editable calendar, a top-right notifications bar, due dates, and a fully researched + adversarially-reviewed dataset of dated events, booking windows, and logistics deadlines.

## Constraints (inherited, non-negotiable)
- **Zero build step, no frameworks, no new CDNs.** Vanilla HTML/CSS/JS as ES modules (`<script type="module">`), served by GitHub Pages from `/docs`. Google Fonts is the only external dep.
- **Identity-free.** No personal name/employer anywhere.
- All interactive state in `localStorage` (nothing leaves the device, except the *opt-in* Google Calendar push).
- Every dynamic string through `esc()`. Surgical changes; the page must always load.

## Security note (honest)
The `lkjjapan` gate is **obfuscation, not security** — the password is in the JS and the repo is public. It stops a shoulder-surfer; it is not real access control. Remembered after first entry via `localStorage`.

## Architecture — modular, zero-build

```
docs/assets/
  main.js          boot: gate → fetch data → mount dashboard, calendar, content
  lib/dates.js     PURE: parseISO, daysBetween, countdown, windowStatus  ← unit-tested
  lib/notify.js    PURE: computeAlerts(datedItems, today)                 ← unit-tested
  lib/ics.js       PURE: toICS(events, tags), parseICS(text)             ← unit-tested
  lib/store.js     localStorage helpers (versioned keys, try/catch)
  gate.js          password overlay
  dashboard.js     top bar (countdown), home widgets, notifications bell (top-right)
  calendar.js      month + agenda views, add/edit/delete events, import/export
  tracker.js       lottery / timed-release (JST) drops view
  content.js       existing renderers (domains, pillars, checklist, brew) — moved here
  gcal.js          opt-in Google Calendar push via MCP-backed flow (graceful no-op if unavailable)
docs/assets/style.css   extended (dashboard, calendar grid, bell, modal, gate)
docs/sw.js              service worker (PWA offline)
docs/manifest.webmanifest
docs/data/tips.json     rebuilt from research (see Data model)
tests/                  node --test unit tests for lib/*
```

`content.js` keeps the existing domain/pillar/checklist/brew renderers (now fed by the enriched data). Files stay <400 lines; split further if needed.

## Data model (`tips.json`, rebuilt from research)
- `meta` — unchanged + `today`, `arrival_date: 2026-06-30`.
- `calendar[]` — **baked events** (52 seasonal + 12 conventions, deduped): `{id,title,date,endDate,category,area,cost,bookBy,bookingNotes,why,sources[],confidence}`. Read-only; merged with user events at runtime.
- `bookByTimeline[]` — 18 "act by X" booking actions `{id,when,what,action,leadTime,confidence}` → feeds notifications + tracker.
- `timeSensitive[]` — hard deadlines `{item,timing,action,dueBy,confidence}` (enriched, +fixes).
- `checklist[]` — phased tasks from 43 logistics items, each `{task,window,dueBy,kind,note,sources[],confidence,requires[]}` (`requires` = prereq ids for dependency-locking).
- `pillars` — `music/geek/building/meetups` (56 items) + `restaurants/disney/activities` as content cards `{name,detail,how_or_when,area_or_park,price_or_cost,tier,sources[],confidence}`.
- `top10[]`, `arrivalSequence[]` (day-by-day Jun30–Jul6), `domains[]` (kept), `sources[]`.

### Sign-off fixes applied to the data (mandatory)
1. **Re-entry permit** rule (single-entry WHV — leaving without it voids status) → new high-priority checklist + top-move + a standing calendar note.
2. **Exit/offboarding** checklist phase (~May–Jun 2027): appoint tax agent (納税管理人) before leaving, lump-sum withdrawal, year-2 residence tax, move-out notice, NHI/pension de-reg.
3. **Sumida fireworks** booking corrected: official paid-seat window likely **open now (June)** — action = "apply now," not "hunt resale."
4. **Tokyo Disney NYE** booking corrected: hotel/Vacation-Package window opens ~**2026-09-01** (4–6 mo ahead); NYE countdown = separate earlier lottery.
5. **Tax-free shopping** rewritten for the **Nov 2026 refund-on-departure** change + resident-status caveat.
6. Pension: cap 60→96 mo (Apr 2026); soften exemption to "very likely (income-tested)."
7. Yucho international-remittance <6 mo caveat → Wise early. Typhoon-postponement note on hanabi/matsuri. Comiket paid wristband step. Mid-year move re-registration. As-of-date reconciliation on overdue flags.

## Components

**Gate** — full-screen overlay; on `lkjjapan` sets `jwh-auth-v1`, never re-prompts on that device.

**Dashboard top bar** — title · live **countdown ribbon** ("15 days to NRT" → after arrival, "Day N of 365") · **🔔 notifications bell top-right** (badge = open-alert count; dropdown of overdue/due-soon/book-by/today, dismissible via `jwh-notif-dismissed-v1`) · theme toggle.

**Home widgets** — Next Deadlines · Upcoming Events · Book-By Alerts · Checklist progress.

**Editable calendar** — month grid + agenda toggle, anchored to 6/30/2026. Merges baked (read-only, colored by category) + user events (`jwh-events-v1`: add/edit/delete via modal — title, date, time, category, note, dueBy). Click a day to add.
- **Export (tag-filtered):** pick categories/tags → download `.ics` of *just those* (`lib/ics.toICS`), or push them to Google Calendar (opt-in).
- **Import:** load an `.ics` file → parsed (`lib/ics.parseICS`) into user events; plus JSON data restore for device portability.

**Notifications (`lib/notify.js`, pure)** — `computeAlerts(items, today)` over deadlines + due dates + book-by + today's events → `{severity: overdue|due-soon|upcoming, ...}`.

**Lottery/timed-release tracker (`tracker.js`)** — the lose-by-minutes drops (Ghibli Museum 10th @10:00 JST, Ghibli Park 10th @14:00, Disney 60-day @14:00, sumo on-sale) as a focused list with exact JST times + one-click add-to-calendar.

**Dependency-locked checklist** — items grey/locked until `requires[]` prereqs are checked (address → pension/NHI → My Number → bank → PayPay → MVNO). Due dates editable (`jwh-due-v1`), feed the bell.

**PWA offline** — `sw.js` caches the shell + `tips.json`; `manifest.webmanifest` for installability. Whole spine works at Narita/ward office with no data.

**Google Calendar push (`gcal.js`)** — opt-in; uses available MCP Calendar tooling to create events for selected tags. Graceful no-op + "export .ics instead" fallback when unavailable.

## localStorage keys (all `-v1`)
`jwh-auth-v1` · `jwh-events-v1` · `jwh-due-v1` · `jwh-notif-dismissed-v1` · `jwh-checklist-v1` (existing) · `jwh-theme`/`jwh-brew-*` (existing).

## Testing
- **Unit (`node --test`, zero deps):** `lib/dates.js` (countdown/window math, esp. the as-of-date overdue logic), `lib/notify.js` (severity bucketing), `lib/ics.js` (round-trip toICS→parseICS).
- **E2E smoke (Playwright MCP):** gate accepts `lkjjapan`; calendar adds an event; bell badge count correct; tag-filtered `.ics` export downloads; data renders.
- **Data sign-off:** already done by the workflow's two adversarial critics (both `go-with-fixes`); all fixes folded into the bake above.

## Build stages (each independently verifiable)
0. **Data bake** — research → `tips.json` + all sign-off fixes. Verify: valid JSON, counts match.
1. **Modular refactor + gate** — split into ES modules; password overlay. Verify: page still renders gated.
2. **Dashboard shell + notifications bell** (top-right). Verify: countdown + alert count correct.
3. **Editable calendar** (month/agenda, CRUD, baked+user merge). Verify: add/edit/delete persists.
4. **Due dates + dependency-locked checklist.** Verify: locks/unlocks; due dates feed bell.
5. **Export(tag-filtered)/Import (ICS + JSON) + Google Calendar push.** Verify: ICS round-trips.
6. **Lottery/timed-release tracker.** Verify: JST drops listed, add-to-calendar works.
7. **PWA offline.** Verify: loads offline after first visit.
8. **Tests + Playwright smoke + final verify.** Verify: `node --test` green; smoke passes; no name leaked; relative paths.

## Out of scope (later)
Live runtime scraping (needs a Cloudflare Worker backend) · multi-device sync server · budget ledger (candidate for a later pass).
