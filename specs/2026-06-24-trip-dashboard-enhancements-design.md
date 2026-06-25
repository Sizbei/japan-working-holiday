# Trip Dashboard Enhancements — Design

**Date:** 2026-06-24
**Status:** Hardened via adversarial review. Decisions locked: Google sync = one-way push; stay vanilla.
**Extends** `specs/2026-06-15-trip-dashboard-design.md` (the design contract).

## Context

The owner's situation changed and they want new task-management affordances, a Notion-Calendar-style
visual treatment, and — newly — **Google Calendar sync** (and have relaxed the no-framework rule).

Confirmed personal facts (2026-06-24):

- **Departing from Seattle / US**, not Canada. Pre-departure framing must be Americanized.
  (Note: Washington has **no state income tax** — don't imply a state filing obligation.)
- **Working visa sorted** — CoE + passport-with-visa in hand.
- **"NCD papers" = Japan Narcotics Control Department import permit** for Vyvanse (lisdexamfetamine).
  The permit (carried with the prescription) is the correct route for **import/possession on entry**.
  **Caveat (verified):** Japan approves lisdexamfetamine only for patients **under 18** — adult
  *domestic* prescription/refills are not supported. So the import permit ≠ a domestic supply. Owner is
  carrying a **3-month supply** (the NCD permit covers a specific quantity). Track the permit as done,
  but flag `confidence: medium` and note "3-month supply carried; adult refills unavailable in Japan —
  plan coverage for the rest of the year (resupply route / prescriber)."
- **Primary card = Chase Sapphire Preferred** (Visa, **no foreign-transaction fee** — verified). It
  charges a cash-advance fee at ATMs, and Japan is cash-heavy → a separate cash/ATM card is still needed.
- **Initial accommodation = "Sakura House (Makoto)," 2026-06-30 → 2026-07-07** (name as owner gave it;
  not independently verifiable, so **no fabricated geocoded pin** — owner can drop it). Long-term
  housing must be locked before checkout.

## Goals

1. **Free-form task labels** — tag any checklist task; filter by tag.
2. **Inline due-date picker when adding a task** — a Notion-style mini-calendar popover (native date
   input on touch as fallback).
3. **Notion-Calendar-style redesign** of `#/calendar` — week/month grid, mini-month navigator, dark
   event side-panel. The mini-calendar component is shared with #2.
4. **Seattle / US reframe** of pre-departure content.
5. **Personal facts reflected in data**, including a one-time additive auto-tick of completed items.
6. **More extensive, web-researched 2026 task list** + a cleanup of now-irrelevant tasks (ships as an
   independent final PR with its own veto pass).
7. **Address autocomplete** (a "Location" field) in the calendar event form.
8. **Google Calendar sync** — one-way push (app → Google), in-browser, no backend.

## Non-goals

- Researched 2026 dates stay `confidence`-flagged ("verify closer"), never presented as certain.
- No OAuth **client secret** in the repo (it's public). Sync uses the browser-side token model only.

## Constraint change (2026-06-24)

The owner permitted a framework but **chose to stay vanilla ES modules** — the entire app is zero-build
GitHub Pages with relative paths, and a build/framework would force a toolchain on every other module for
one screen's benefit. The calendar redesign and Google sync are both built in vanilla.

---

## Workstream 1 — Free-form task labels

**Data:** new id-keyed store `jwh-tags-v1: { [taskId]: string[] }` (same pattern as `jwh-due-v1`).
Add `KEYS.tags` to `lib/store.js` (verified: KEYS is a flat versioned-`-v1` object with a type-guarded
`get()`).

**Pure module `lib/tags.js`** (unit-tested): `normalizeTag`, `addTag`/`removeTag` (return **new** maps),
`tagsFor`, `allTags`, `tagHue(tag)` → stable 0–359 hue. Color is a single `--h:<hue>` CSS var on the
chip — ~5 lines, kept (it's the core label affordance).

**UI (`checklist-page.js`):** tag chips render after the kind/due/phase tags in `checkItemHTML`; a new
per-row 🏷 button (sibling of 📅/⚑) opens an inline editor (text input + optional `<datalist>` of
`allTags`); chips carry an `✕` to remove. Same focus capture/restore across the `innerHTML` rebuild as
the existing controls. Every tag string `esc()`'d; input uses `.value` only.

**Filter:** one active tag filter (view-only string, like `checkSearchQ`; never mutates data/progress).
Clicking a chip sets it; a "🏷 <tag> ✕" pill in the toolbar clears it. **Semantics: AND within the
current smart view** — i.e. it narrows Today/Upcoming/Overdue/All to items carrying that tag (it does
not switch views the way search forces `all`).

## Workstream 2 — Mini-calendar date-picker popover

- `lib/minical.js` — **pure** month-grid math (`monthGrid(y,m)`, `addMonths`, weekday headers,
  today/selection helpers). Unit-tested. **Shared with WS3's sidebar navigator** (this is what justifies
  building it rather than relying on the native input).
- `datepicker.js` — popover rendering a `minical` grid + ‹ ›/Today nav; click a day → resolves an ISO
  date. **Mounted on `<body>`** (not inside `#checkPhases`) and **dismisses on `jwh:data-changed`** so a
  concurrent checklist rebuild can't orphan it. Focus-trapped, Esc/backdrop cancels, restores focus.
  Returns `Promise<string|null>`.
- **Touch fallback:** on coarse-pointer / small viewports, use the native `<input type="date">` (better
  mobile UX) instead of the popover.
- **Reduce-motion:** suppress the open animation when **either** `html[data-reduce-motion="on"]` **or**
  `window.matchMedia('(prefers-reduced-motion: reduce)')` is set (the app's flag alone doesn't read the
  OS pref at boot — check both).
- `lib/modal.js`'s `askDate` becomes a thin wrapper over `datepicker.js`, **preserving its
  `(label, opts) → Promise<string|null>` signature** (verified preservable) so the per-task 📅 call site
  (`checklist-page.js`) needs no change.
- **Add-task composer:** a "Due" button in both toolbar variants opens the picker; the ISO flows into
  `customItem(task, phase, dueBy)` (verified: 3rd param already accepted). Clearing → no due.

## Workstream 3 — Notion-Calendar-style redesign (`#/calendar`)

Largest workstream. **Restyle + augment** `calendar.js` (month/week/agenda already exist); do **not**
rewrite its data flow. Verified-intact rule: `saveUser → changed()→ jwh:data-changed → render`, and
`render()` never dispatches `jwh:data-changed`. Keep `weekgrid.js` lane-packing and the `SPAN_CAP`
>10-day rule (a 7-day Sakura House event renders fine).

- **Left sidebar:** a `minical` mini-month navigator (shared component); click a day → jump the main
  view. Restyle the existing legend/category filter + (month mode) deadline panel into the sidebar.
- **Main pane:** Notion-style week/month grid — quiet borders, week-view time rail, today highlight,
  category color as a left accent.
- **Top bar:** `‹ Label ›` · Today · `[Month|Week|Agenda]` segmented · `+ Add` · Import/Export.
- **Event side-panel:** clicking an event opens a dark slide-in panel (title, time/date range,
  **location**, **tags**, note, category, Edit/Delete/✓ Going). Edit reuses `#evForm`. Focus-trapped;
  Esc/backdrop closes; focus restores to the trigger. Day-add still opens the add form.
- **Contrast (verified risk):** `style.css` currently sets dark-mode category color as **text** color on
  `.wk-bar/.wk-chip/.wkl-ev` (tuned ≥10:1 on dark bg). If the Notion restyle lightens those backgrounds,
  category-on-light must be re-tuned to **≥4.5:1**. Re-verify WCAG-AA after styling, both themes.
- Respect the light/dark theme toggle and reduce-motion throughout.

> Consult `~/.claude/design-principles.md` + `frontend-design`/`emil-design-eng` during implementation.

## Workstream 4 — Seattle / US reframe (data)

- Rename checklist phase **"Pre-Departure (Canada)" → "Pre-Departure (Seattle / US)"**; Americanize its
  items (banking, taxes, re-entry, phone, mail).
- Rename data key **`canadaNotes` → `homeNotes`**; replace with US/Seattle content: file US taxes while
  abroad; **FBAR if aggregate foreign accounts exceed $10,000 at any point in the calendar year**; keep
  a US bank account + address; USPS mail forwarding; absentee voting; storage; SIM/eSIM. **WA has no
  state income tax — don't add a state-filing task.**
- **Update ALL refs (verified four):** `content.js` (`renderCanada`→`renderHome`, the `DATA.canadaNotes`
  read, `#canadaSection`/`#canadaList`), `index.html` (`#canadaSection`, the `head.canada` heading + 🇨🇦
  emoji), `assets/i18n.js` (`head.canada` key), and **`assets/router.js:18`** (`canadaSection:'explore'`
  in the legacy anchor map). Pick one new id (e.g. `homeSection`) and apply it across all four.

## Workstream 5 — Personal facts reflected in data

**Data edits (`tips.json`):**
- **Visa:** drop visa-application entries from `bookByTimeline`/`timeSensitive`; reframe visa tasks to
  "carry CoE + passport-with-visa."
- **Vyvanse / NCD:** add task "ADHD meds — carry NCD import permit + 3-month supply" (done) with
  `confidence: medium`, sources, and the adult-refill caveat above. Add a follow-on task "Plan ADHD-med
  resupply for months 4–12 (no adult refills in Japan)" — undone, no hard date.
- **Chase Sapphire Preferred:** money note (CSP = Visa, no FTF; set travel notice) + new task "Sort a
  cash/ATM card for Japan."
- **Sakura House:** baked `calendar` event using the real schema —
  `{ date:"2026-06-30", endDate:"2026-07-07", category:"housing", confidence:"high" }`. **`housing` needs
  a legend color** — add a color mapping or reuse an existing category. Add task "Lock in long-term
  housing" `dueBy 2026-07-07`.

**Auto-tick seed (confirmed yes).** Done-state lives in browser `jwh-checklist-v1`, not `tips.json`, so
it can't be set by editing files. Add a one-time additive seed:
- **Placement:** in `main.js`, **after** `renderContent()` (which mounts the checklist) returns, so the
  initial render already happened; the seed then merges + dispatches `jwh:data-changed` to refresh.
  Guarded by `KEYS.seed` (`jwh-seed-v1`) so it runs **exactly once per device**; merge **only adds**
  checks (never removes) → cannot clobber user progress.
- **Seeded set = the completed items PLUS the transitive closure of their `requires[]`** (so no
  checked-but-locked inconsistency). The set is small (≪ the 74-item list) so it can't flip the list to
  100% → the existing `updateProgress` guard (`lastPct < 100`) means no false confetti.
- **Test:** assert every seeded id (and its prereqs) exists in `tips.json` after WS4–6 land; fail loudly
  otherwise. Seeded ids must **never** be reused/alias-renamed in later cleanup (orphans are safe no-ops
  but lose the check).

## Workstream 6 — Researched 2026 task list + cleanup *(independent final PR)*

Web-research current 2026 obligations and expand `checklist[]`, each item with `confidence` + `sources`:
residence-card pickup at NRT (verified), ward-office move-in / jūminhyō **within 14 days** (verified,
penalty-backed), National Health Insurance, pension, My Number, Japanese bank account, SIM/eSIM, hanko,
re-entry permit, resident tax — plus the US-side pre-departure items. **Cleanup:** remove Canada-specific
items superseded by WS4, the done visa-application steps, and anything not applicable to a US-departing
owner — **surface the full removal list in the PR for per-item veto**; nothing vanishes silently. Ships
**after** WS1–5,7–8 so the seed ids are final and the UI is stable.

## Workstream 7 — Address autocomplete in the event form

- Extract a **minimal** util `lib/nominatim.js`: `searchJP(query, signal) → Promise<[{lat,lng,name,addr}]>`
  (debounced fetch + abort + `countrycodes=jp`). **Suggestion-list rendering stays in each caller**
  (map.js keeps its dual local+geo UI; the event form renders its own small list) — don't lift map UI.
- `map.js`'s existing `wireAddPlace` fetch path switches to the util (no behavior change).
- Add a **"Location"** field to `#evForm` using the util; persist as `event.location`; show it in the
  WS3 side-panel. `pushEvent` already threads an address arg.

## Workstream 8 — Google Calendar sync (one-way push)

Runs on the static, public GitHub Pages site **without a backend** via the **Google Identity Services
(GIS) token model**:

- **Auth:** a **public OAuth client ID** (client IDs are not secrets; no client secret in the repo),
  authorized JS origin = the Pages domain. "Connect Google" triggers
  `google.accounts.oauth2.initTokenClient`; the app holds the **short-lived access token in memory
  only** (never localStorage).
- **Scope (corrected — `calendar.events` alone cannot CREATE a calendar):** use the least-privilege
  app-calendar scope **`https://www.googleapis.com/auth/calendar.app.created`**, which lets the app
  create and manage **only the secondary calendars it created** — not the user's other calendars.
  *(Confirm the exact scope string + behavior against Google's Calendar API auth-scopes doc during
  implementation; fallback if unavailable: push to the primary calendar with `calendar.events` and a
  distinguishing event property.)*
- **Push:** app events (baked + user) → a dedicated **"Japan WHV" Google calendar** (created on first
  connect). **Persist `{ calendarId, events:{ localId → googleEventId } }` in `jwh-gcal-map-v1`** (add
  `KEYS.gcalMap`). The map is written **per successful event call** (not per batch) so a partial failure
  is self-healing: the next sync PATCHes already-mapped events and INSERTs unmapped ones. A deleted
  local event deletes its Google counterpart.
- **Recovery (was a blocker):** before each sync, GET the stored `calendarId`; on **404** (user deleted
  the calendar) or **401/403** (revoked/expired) → clear the map, re-prompt, recreate. "Disconnect"
  clears the token + map. No path leaves silent orphans/duplicates.
- **One-way only:** the app never pulls/overwrites from Google. The "Japan WHV" calendar is a push
  target; the user is told their hand-edits there are overwritten on next push.
- **Privacy consent:** a first-connect modal stating trip dates/locations will be sent to Google under
  Google's terms, before any token request.
- **UX + failure states:** a "Connect / Sync now / Disconnect" control on the calendar route; clear
  states for offline, popup-blocked, scope-denied, token-expired (re-prompt) — never a silent failure.
  The GIS script (`https://accounts.google.com/gsi/client`) and `gapi` load **lazily on the calendar
  route only** (like Leaflet on the map) — **not precached** by the SW (verified: `sw.js` ignores
  cross-origin requests, so Google scripts/tokens are never cached).
- **Token-theft surface:** the in-memory access token is exploitable for ~1h **only** via XSS. Mitigate
  by holding the strict-`esc()` discipline everywhere user/remote strings hit `innerHTML` — **including
  the WS7 Nominatim `Location` suggestions** (escape every `display_name` before render).
- New module `google-sync.js`. Loading an external Google script is the one allowed exception to the
  "no new CDNs" rule, scoped to this feature and justified by the owner's explicit sync request.

## Files touched (summary)

- **New:** `lib/tags.js`, `lib/minical.js`, `datepicker.js`, `lib/nominatim.js`, `google-sync.js`.
- **Edited:** `checklist-page.js`, `calendar.js`, `map.js`, `content.js`, `main.js`, `lib/store.js`
  (`tags`,`seed`,`gcalMap` KEYS), `lib/modal.js`, `index.html`, `assets/i18n.js`, `assets/router.js`,
  `data/tips.json`, the CSS file(s), and `sw.js` — **bump `CACHE` `jwh-v108` → `jwh-v109`** and add
  `'assets/lib/tags.js','assets/lib/minical.js','assets/datepicker.js','assets/lib/nominatim.js',
  'assets/google-sync.js'` to its `ASSETS` list.

## Implementation order

1. Pure libs + tests: `lib/tags.js`, `lib/minical.js` (TDD, `node --test`).
2. Date-picker popover + `askDate` wrapper + composer Due control (WS2).
3. Task labels UI + filter (WS1).
4. Data: Seattle reframe + personal facts + additive seed (WS4, WS5) + seed id-existence test.
5. `lib/nominatim.js` extraction + event Location field (WS7).
6. Notion calendar redesign + event side-panel (WS3).
7. Google Calendar one-way push (WS8).
8. Web-researched task expansion + cleanup (WS6), last, as its own veto'd PR.

## Verification

- `node --test tests/lib.test.mjs` green incl. new `lib/tags.js`, `lib/minical.js`, and the seed
  id-existence test.
- `python3 -m json.tool docs/data/tips.json` validates.
- Serve locally, auth, click every route, **no console errors**: tag a task + due-date it; filter by
  tag within a smart view; calendar week/month + mini-nav + event side-panel + autocompleted Location;
  seed ticks the right items once and not again on reload. Re-verify WCAG-AA category-text contrast in
  both themes. Bump `sw.js` `CACHE`; confirm fresh assets load (network-first).
- **WS8 (Google) is not unit-testable offline** — it needs a real OAuth client ID with the Pages domain
  (and `localhost` for dev) as authorized origins. Build `google-sync.js` behind a small injectable
  API seam so the push/idempotency logic can be unit-tested with a mocked client, and keep a **manual
  PR checklist**: Connect → first push creates the calendar → re-push PATCHes (no duplicates) → delete a
  local event removes it in Google → Disconnect clears the map.

## Risks / open items

- **Seed/cleanup id coupling** — mitigated by the id-existence test + additive-only merge + WS6-last.
- **Calendar dark restyle** must not regress light theme, reduce-motion, or AA contrast.
- **Google OAuth on a public origin** — client ID public (fine); minimize scope; token in memory only.
- **2026 dates stay `confidence`-flagged.**
