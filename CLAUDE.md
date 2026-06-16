# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A personal, password-gated **trip-planning dashboard** for a working-holiday year in Tokyo: an editable calendar, booking-deadline notifications, a dependency-aware checklist, and a researched dataset. Vanilla HTML/CSS/JS as **ES modules** — no build step, no frameworks, no new CDNs. Served by GitHub Pages from `/docs`. All interactive state is browser-local (localStorage). Arrival anchor: **land NRT 2026-06-30**. Live at https://sizbei.github.io/japan-working-holiday/.

`specs/2026-06-15-trip-dashboard-design.md` is the design contract; `PLAN.md` has older directional notes.

## Run / verify

The page is ES modules + `fetch`es `data/tips.json`, so it MUST be served over HTTP (`file://` fails):

```bash
cd docs && python3 -m http.server 8000   # then http://localhost:8000  (password: lkjjapan)
node --test                              # unit tests for the pure lib/ modules (zero deps)
python3 -m json.tool docs/data/tips.json > /dev/null   # validate the data
```

There is no bundler/linter. "Verify" = `node --test` green + serve locally + page renders with no console errors.

**Service worker gotcha:** `docs/sw.js` caches the app. It's network-first (fresh when online), but if a change doesn't show, hard-clear: in DevTools Application → unregister SW + clear cache, or bump `CACHE` in `sw.js`.

## Architecture

Still **data-driven from one file**: `docs/data/tips.json` is the single source of truth — adding content = editing JSON, never code. The JS reads it and renders. Modules under `docs/assets/`:

- `main.js` — boot: `gate → fetch tips.json → mount calendar, tracker, content, dashboard → build TOC → register SW`.
- `lib/` — **pure, unit-tested** logic (import-safe in Node): `dates.js` (countdown/window math), `notify.js` (`computeAlerts` severity bucketing), `ics.js` (`.ics` generate/parse + Google Calendar URLs), plus `dom.js` (`$/$$/esc`) and `store.js` (versioned localStorage `KEYS`).
- `gate.js` — password overlay (`lkjjapan`). **Obfuscation, not security** — the password is in the JS and the repo is public; it only stops a shoulder-surfer. Remembered via `jwh-auth-v1`.
- `dashboard.js` — top bar (theme, live countdown, **top-right notifications bell + panel**) and home widgets. `buildItems()` assembles ONE alert stream from `timeSensitive` deadlines + `bookByTimeline` + future calendar events + **user-set** checklist due dates, then `computeAlerts` ranks them.
- `calendar.js` — editable month/agenda calendar. Merges **baked** events (`tips.json.calendar`, read-only) with **user** events (`jwh-events-v1`, full CRUD via modal). Tag-filtered `.ics` export + per-event Google Calendar links; `.ics` import.
- `tracker.js` — lottery / timed-release drops (Ghibli 10:00 JST, Disney 60-day, sumo) + dated booking windows mined from `bookByTimeline`.
- `content.js` — domains (searchable + confidence filter), pillar grids, brew scratchpad, and the **dependency-aware checklist** (items lock until their `requires[]` prereqs are checked; per-item due dates feed the bell).

A `jwh:data-changed` CustomEvent is dispatched on any user mutation (checklist, due date, calendar) so the dashboard re-derives alerts/widgets.

### Data model (`tips.json`)
Built by `/tmp/bake.py`-style transform from the research workflow output. Key arrays: `calendar[]` (baked events, color by `category`), `bookByTimeline[]` ("act by X"), `timeSensitive[]` (hard deadlines w/ `dueBy`), `checklist[]` (phased; items carry `id`, optional `requires[]`, `dueBy`), the pillar arrays (`music/geek/building/meetups/restaurants/disney/activities` as content cards with `tier`), `top10[]`, `domains[]` (the searchable findings, with `confidence`), `sources[]`.

**Two card schemas:** searchable "findings" (`domains[].findings[]`: `tip/why/how/impact/confidence`) vs pillar "content cards" (`name/detail/how_or_when/tier/...`). Don't mix them.

## Conventions / constraints

- **Identity-free.** No personal name/employer in content or git authorship (commits use "WHV Guide"). Personalization = which topics appear, in first-person voice.
- **Zero-build, dependency-free.** No bundler/frameworks/new CDNs (Google Fonts only). Must work on plain GitHub Pages with relative paths and `<script type="module">`.
- **Every dynamic string through `esc()`** before `innerHTML`.
- **Calendar events spanning >10 days** render only on their start day in the month grid (see `SPAN_CAP` in `calendar.js`) — otherwise season-long events flood every cell.
- **Notifications fire only on curated deadlines/book-by + due dates the user sets** — not every baked checklist `dueBy` (those would double-count and flood the bell).
- **localStorage keys** (all `-v1`, in `lib/store.js`): `jwh-auth-v1`, `jwh-events-v1`, `jwh-calfilters-v1`, `jwh-due-v1`, `jwh-notif-dismissed-v1`, `jwh-checklist-v1`, `jwh-theme`, `jwh-brew-notes-v1`, `jwh-brew-ideas-v1`. Bump the `-v1` suffix if a stored shape changes.
- **Calendar data flow is single-path:** user mutations call `saveUser()` → dispatches `jwh:data-changed` → `calendar.render()` + `dashboard.refresh()` both listen. Do NOT also call `render()` at the mutation site (causes a double render). `render()` must never dispatch `jwh:data-changed` (infinite loop). The calendar has a sticky legend-as-filter, a side deadline panel (month mode only), and a day-click popover whose listeners are cleaned up in `dismissPopover()`.
- **Data confidence:** every researched item carries `confidence` (high/medium/low). 2026–2027 dates are estimates flagged medium/low with "verify closer" — don't present them as certain.
