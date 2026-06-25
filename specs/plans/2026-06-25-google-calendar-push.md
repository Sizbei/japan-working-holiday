# Google Calendar One-Way Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).
> **⚠️ EXECUTION GATE — needs the owner:** this feature can't be fully built/tested without (a) the owner creating a **public OAuth Client ID** in Google Cloud Console and pasting it into the config constant, and (b) authorizing in a browser on the deployed origin. Build the code, unit-test the pure mapping, and ship behind a "needs setup" state; the live Connect→push→verify loop is a **manual step the owner runs** with real Google credentials. Do NOT mark the feature done on static checks alone.

**Goal:** From the calendar page, let the owner push their app's events (baked + user) **one-way** into a dedicated "Japan WHV" Google calendar, idempotently (re-push updates, never duplicates), with no backend.

**Architecture:** A pure `lib/gcal.js` maps an app event → a Google Calendar API event body (unit-tested). `google-sync.js` owns auth (Google Identity Services *token model* — no client secret), creating the target calendar once, and the push/idempotency/recovery logic. A small "Connect / Sync now / Disconnect" control on the calendar toolbar drives it. The external GIS script loads **lazily on the calendar route only** (like Leaflet on the map), never SW-precached. The access token lives **in memory only**.

**Tech Stack:** Vanilla ES modules, no build. Google Identity Services (`https://accounts.google.com/gsi/client`) + Calendar REST API v3 via `fetch`. Tests: `node --test` (the pure mapper only).

## Global Constraints

- Zero-build, dependency-free vanilla ES modules; GitHub Pages from `/docs`. Loading the Google GIS script is the **one allowed external-CDN exception**, scoped to this feature and justified by the owner's explicit sync request — lazy, calendar-route-only, **not** in the SW precache.
- **No secret in the repo.** OAuth uses a **public Client ID** only (client IDs are not secrets) via the GIS **token model**; the access token is held in memory, **never** localStorage.
- **One-way only.** The app never pulls from / overwrites itself with Google. The "Japan WHV" calendar is a push target; the owner is told their hand-edits there are overwritten on next push.
- **Least-privilege scope:** `https://www.googleapis.com/auth/calendar.app.created` (lets the app create + manage only the calendars it created). **Confirm the exact scope string + that it permits creating a secondary calendar against the live Calendar API docs during implementation;** fallback if unavailable: push to the primary calendar with `calendar.events` + a distinguishing `extendedProperties.private` tag.
- **Idempotent.** Persist `{ calendarId, events: { [localEventId]: googleEventId } }` in `jwh-gcal-map-v1` (`KEYS.gcalMap`). Write the map **per successful API call** so a partial failure self-heals (next sync PATCHes mapped, INSERTs unmapped). On `404` (calendar deleted) / `401`/`403` (revoked/expired) → clear the map, re-prompt, recreate. Disconnect clears token + map.
- **Privacy consent:** a first-connect modal states trip dates/locations are sent to Google under Google's terms, BEFORE any token request.
- **Every dynamic string `esc()`'d** before `innerHTML`. Respect reduce-motion (the control has no essential animation).
- Service worker: bump `CACHE` (`jwh-v114` → `jwh-v115`) and add `assets/google-sync.js` + `assets/lib/gcal.js` to `ASSETS` (NOT the external GIS URL).

## File Structure

- **New:** `docs/assets/lib/gcal.js` (pure event→GCal-body mapper + map helpers), `docs/assets/google-sync.js` (auth + push + UI control wiring).
- **Modify:** `docs/index.html` (a Google control slot in the calendar toolbar), `docs/assets/calendar.js` (mount the control on the calendar route), `docs/assets/lib/store.js` (`KEYS.gcalMap`), `docs/assets/main.js` (mount google-sync), `docs/sw.js`, `tests/lib.test.mjs`.

---

### Task 1: Pure mapper + store key (`lib/gcal.js`)

**Files:** Create `docs/assets/lib/gcal.js`; Modify `docs/assets/lib/store.js` (add `KEYS.gcalMap`); Test `tests/lib.test.mjs` (append).

**Interfaces (pure, unit-tested):**
- `eventToGcal(ev) → { summary, location, description, start:{date}, end:{date} }` — all-day mapping; `end.date` is the **exclusive** next day after `endDate || date` (Google all-day convention, mirrors `ics.js` `toICS`). `location` from `ev.area`, `description` from `ev.note || ev.bookingNotes || ''`.
- `nextDayISO(iso) → 'YYYY-MM-DD'` — exclusive end helper (UTC-safe; reuse the same approach as `ics.js`/`minical.js`).
- Map helpers: `getMapped(map, localId)`, `setMapped(map, localId, googleId)` (immutable), `forgetCalendar(map)` (returns empty `{calendarId:'', events:{}}`).

- [ ] **Step 1: failing test** (append to `tests/lib.test.mjs`):
```js
import { eventToGcal, nextDayISO } from '../docs/assets/lib/gcal.js';

test('eventToGcal maps an all-day single + multi-day event with exclusive end', () => {
  assert.deepEqual(eventToGcal({ title: 'Sumida Hanabi', date: '2026-07-25', area: 'Asakusa', note: 'arrive early' }),
    { summary: 'Sumida Hanabi', location: 'Asakusa', description: 'arrive early', start: { date: '2026-07-25' }, end: { date: '2026-07-26' } });
  // multi-day: end is exclusive (Jul 7 stay → end.date Jul 8)
  assert.equal(eventToGcal({ title: 'x', date: '2026-06-30', endDate: '2026-07-07' }).end.date, '2026-07-08');
  assert.equal(nextDayISO('2026-12-31'), '2027-01-01');   // year roll
});
```
- [ ] **Step 2: run → FAIL** (`node --test tests/lib.test.mjs` → module missing).
- [ ] **Step 3: implement `lib/gcal.js`** — pure; `eventToGcal` builds the body; `nextDayISO` does UTC `Date.UTC(...)+1 day` formatting; the map helpers are immutable (`{...map}` / `{...map, events:{...}}`). Add `gcalMap: 'jwh-gcal-map-v1',` to `KEYS` in `store.js`.
- [ ] **Step 4: run → PASS** + `node --check docs/assets/lib/gcal.js`.
- [ ] **Step 5: commit** `feat(gcal): pure event→Google-Calendar mapper + KEYS.gcalMap`.

---

### Task 2: Auth + push engine (`google-sync.js`)

**Files:** Create `docs/assets/google-sync.js`.

**Interfaces (the module exports a small controller):**
- `mountGoogleSync(getEvents)` — `getEvents` is a thunk returning `allEvents()` (so the module doesn't import calendar.js → no cycle). Wires the toolbar control + lazy-loads GIS on first use.
- Internals: `loadGIS()` (inject the GIS script once, on the calendar route), `connect()` (consent modal → `initTokenClient` → token in memory → ensure the "Japan WHV" calendar), `syncNow()` (push all events, per-event INSERT/PATCH via the map, write map per success, recovery on 401/403/404), `disconnect()` (drop token + clear map).

- [ ] **Step 1: scaffold the config + GIS loader.**
```js
'use strict';
// One-way push of app events → a dedicated "Japan WHV" Google calendar. GIS token model (no secret).
// The owner pastes their public OAuth Client ID below; until then the control shows "needs setup".
import { get, set, KEYS } from './lib/store.js';
import { eventToGcal, getMapped, setMapped, forgetCalendar } from './lib/gcal.js';
import { confirmModal, alertModal } from './lib/modal.js';
import { esc } from './lib/dom.js';

const CLIENT_ID = '';   // ← owner: paste your Google OAuth 2.0 Web Client ID (public). Authorized JS origin = the Pages domain (+ localhost for dev).
const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
let token = null;       // in-memory only
let tokenClient = null;

function loadGIS() { /* inject https://accounts.google.com/gsi/client once; resolve on load; reject offline */ }
function loadMap() { return get(KEYS.gcalMap, { calendarId: '', events: {} }) || { calendarId: '', events: {} }; }
function saveMap(m) { set(KEYS.gcalMap, m); }
```
- [ ] **Step 2: `connect()`** — show the privacy consent `confirmModal` FIRST; on accept, `await loadGIS()`, create `tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback })`, request a token, store it in memory, then `ensureCalendar()` (GET the stored `calendarId`; if missing/404, POST `/calendars` `{ summary: 'Japan WHV' }`, save its id to the map). Handle popup-blocked / scope-denied with a clear `alertModal`.
- [ ] **Step 3: `syncNow()`** — for each event from `getEvents()`: build `body = eventToGcal(ev)`; if `getMapped(map, ev.id)` exists → `PATCH /calendars/{calId}/events/{gid}`, else `POST /calendars/{calId}/events` and `setMapped`. **Write the map after each success.** On `401/403` → token expired/revoked: re-prompt once. On `404` of the calendar → `forgetCalendar` + recreate. Report a summary (`n pushed, m updated`). A locally-deleted event whose id is still in the map → `DELETE` its Google event + unmap.
- [ ] **Step 4: `disconnect()`** — `google.accounts.oauth2.revoke(token)` (best-effort), `token = null`, `saveMap(forgetCalendar(loadMap()))`.
- [ ] **Step 5: build behind a testable seam** — the push/idempotency logic should call an injectable `api(method, path, body)` so it can be unit-tested with a fake (the network call is the only un-testable part). Add focused unit tests for the INSERT-then-PATCH idempotency over the map (with a fake `api`).
- [ ] **Step 6: verify** `node --check docs/assets/google-sync.js`; suite green. **Manual (owner, real creds):** Connect → consent → first push creates the calendar → re-push PATCHes (no dup) → delete a local event removes it in Google → Disconnect clears the map. Commit `feat(gsync): GIS-token one-way push engine`.

---

### Task 3: Toolbar control + mount

**Files:** `docs/index.html` (a slot in `.cal-actions`), `docs/assets/calendar.js` or `main.js` (mount on the calendar route).

- [ ] **Step 1 — control slot.** Add to the calendar toolbar `.cal-actions` (near Import/Export): `<button id="calGoogle" class="cal-btn text">Google</button>` (a single button that opens a small menu/state: Connect / Sync now / Disconnect / "needs setup" when `CLIENT_ID===''`).
- [ ] **Step 2 — mount.** Call `mountGoogleSync(() => allEvents())` from `main.js` (after the calendar mounts), or lazily on first `#/map`-style route entry — but the GIS SCRIPT only injects on `connect()`, so mounting just wires the button. The button reflects state: not-connected → "Connect Google"; connected → "Sync now ⌄" with Disconnect in the menu; `CLIENT_ID===''` → disabled + "Google sync — needs setup" tooltip.
- [ ] **Step 3 — states & errors.** Clear UI for offline, popup-blocked, scope-denied, token-expired (re-prompt) — never a silent failure. esc() any dynamic text. A tiny "last synced" line is fine; no spinner animation required.
- [ ] **Step 4 — verify** (static + owner manual). Commit `feat(calendar): Google sync toolbar control`.

---

### Task 4: Service-worker bump

- [ ] **Step 1.** `docs/sw.js`: `CACHE` `jwh-v114`→`jwh-v115`; append `'assets/google-sync.js'` (top-level assets line) + `'assets/lib/gcal.js'` (lib line). **Do NOT** add the external GIS URL.
- [ ] **Step 2.** `node --check docs/sw.js`; suite green.
- [ ] **Step 3.** Commit `chore(sw): cache google-sync + lib/gcal, bump to jwh-v115`.

---

## Self-Review

**Spec coverage (WS8 — one-way push):** GIS token model + public client ID (no secret) ✓; least-privilege `calendar.app.created` scope (with documented fallback) ✓; dedicated "Japan WHV" calendar ✓; `{calendarId, events}` idempotency map, per-success writes, 401/403/404 recovery ✓; one-way only ✓; consent modal ✓; lazy GIS load, calendar-route-only, not precached ✓; token in memory only ✓; SW bump ✓.

**Placeholder scan:** the one intentional blank is `CLIENT_ID = ''` — a REQUIRED owner config, surfaced as a "needs setup" UI state, not a code placeholder. `loadGIS()`/`connect()` bodies are described precisely; the implementer writes them against the live GIS/Calendar API (confirm exact method names there).

**Risks flagged for review:** (1) **Scope** — confirm `calendar.app.created` actually allows creating a secondary calendar before relying on it; fallback specified. (2) **Not unit-testable end-to-end** — the network/auth path needs real creds on an authorized origin; mitigated by the injectable `api()` seam + a manual PR checklist. (3) **XSS surface** — event titles/locations are pushed to Google (no innerHTML risk there) but any sync status reflected into the UI must be esc()'d. (4) **External CDN** — the GIS script is the sole exception; keep it lazy + out of the precache. (5) **Owner-gated** — execution requires the owner's OAuth Client ID and a real-credentials manual verification; do not mark done on static checks.
