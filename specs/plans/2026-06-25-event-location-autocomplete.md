# Event Location Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an autocompleting **Location** field to the calendar event form, backed by a shared OpenStreetMap/Nominatim search util extracted from the map's add-place box.

**Architecture:** A new `lib/nominatim.js` owns the place search: a pure, unit-tested `parseNominatim()` plus a thin `searchJP()` fetch wrapper. Both the map's add-place box and the event form call `searchJP()`; each renders its own suggestion list. The event field writes to the event's existing **`area`** property (not a new `location` field) — the agenda already displays `area` and the map already estimates travel from it, so reuse beats inventing a parallel field. `FormData` in the form's submit handler auto-persists any named input, so adding `<input name="area">` needs no save-path change.

**Tech Stack:** Vanilla ES modules, no build. Tests: `node --test tests/lib.test.mjs`.

## Global Constraints

- Zero-build, dependency-free vanilla ES modules; relative paths; GitHub Pages from `/docs`. Nominatim/unpkg are existing external calls — no NEW CDNs added (the map already calls Nominatim).
- Every dynamic string through `esc()` before `innerHTML`. Nominatim returns **remote** strings → the suggestion HTML MUST `esc()` every `addr`/`name`; inputs use `.value` only. `parseNominatim`/`searchJP` return data (no HTML) — escaping happens in each caller's renderer.
- Calendar data-flow (CLAUDE.md): event create/edit goes through the existing `#evForm` submit → `saveUser()` (single `jwh:data-changed` dispatch). This plan adds a field to that form; it must NOT add a second save path or dispatch.
- Service worker: bump `CACHE` in `docs/sw.js` (`jwh-v112` → `jwh-v113`) and add `'assets/lib/nominatim.js'` to `ASSETS`.
- Run tests from the repo ROOT: `node --test tests/lib.test.mjs`.

## File Structure

- **New:** `docs/assets/lib/nominatim.js` (pure `parseNominatim` + `searchJP` fetch wrapper).
- **Modify:** `docs/assets/map.js` (use `searchJP` in `wireAddPlace`), `docs/assets/calendar.js` (Location field + autocomplete wiring), `docs/assets/style.css` (suggestion dropdown), `docs/sw.js`, `tests/lib.test.mjs`.

---

### Task 1: Shared Nominatim util (`lib/nominatim.js`)

**Files:** Create `docs/assets/lib/nominatim.js`; Test `tests/lib.test.mjs` (append).

**Interfaces:**
- `parseNominatim(rows) → [{name, addr, lat, lng}]` — pure; maps raw jsonv2 rows (`display_name`/`lat`/`lon`), drops entries with no address.
- `searchJP(query, signal) → Promise<[{name,addr,lat,lng}]>` — fetches Japan results; **throws** on HTTP error / abort / offline.

- [ ] **Step 1: Write the failing test** — append to `tests/lib.test.mjs` (note: `parseNominatim` is pure; `searchJP` does network I/O and is not unit-tested here):

```js
import { parseNominatim } from '../docs/assets/lib/nominatim.js';

test('parseNominatim maps display_name/lat/lon and drops empties', () => {
  const out = parseNominatim([
    { display_name: 'Shinjuku Station, Shinjuku, Tokyo, Japan', lat: '35.69', lon: '139.70' },
    { display_name: '', lat: '0', lon: '0' },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: 'Shinjuku Station', addr: 'Shinjuku Station, Shinjuku, Tokyo, Japan', lat: '35.69', lng: '139.70' });
  assert.deepEqual(parseNominatim(null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib.test.mjs`
Expected: FAIL — `Cannot find module '../docs/assets/lib/nominatim.js'`.

- [ ] **Step 3: Create `docs/assets/lib/nominatim.js`:**

```js
'use strict';
// Minimal OpenStreetMap/Nominatim place search for Japan. parseNominatim is pure (unit-tested);
// searchJP is a thin fetch wrapper shared by the map's add-place box and the calendar event form.
// Suggestion-list rendering (and esc()) stays in each caller.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Map raw Nominatim jsonv2 rows → [{ name, addr, lat, lng }]. Pure; drops rows with no address.
export function parseNominatim(rows) {
  return (Array.isArray(rows) ? rows : []).map(d => ({
    name: String(d.display_name || '').split(',')[0].trim(),
    addr: String(d.display_name || ''),
    lat: String(d.lat ?? ''),
    lng: String(d.lon ?? ''),
  })).filter(m => m.addr);
}

// Search Japan addresses. Resolves [{name,addr,lat,lng}]; throws on HTTP error / abort / offline.
export async function searchJP(query, signal) {
  const url = `${ENDPOINT}?format=jsonv2&countrycodes=jp&limit=5&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  return parseNominatim(await r.json());
}
```

- [ ] **Step 4: Run test to verify it passes** — `node --test tests/lib.test.mjs` → PASS (new test green, existing suite green). Also `node --check docs/assets/lib/nominatim.js`.

- [ ] **Step 5: Commit**

```bash
git add docs/assets/lib/nominatim.js tests/lib.test.mjs
git commit -m "feat(nominatim): shared Japan place-search util (pure parse + fetch wrapper)"
```

---

### Task 2: Use `searchJP` in the map's add-place box (no behavior change)

**Files:** Modify `docs/assets/map.js` (`wireAddPlace`, the `run` closure + the import).

**Interfaces:** Consumes `searchJP` (Task 1). The debounce/throttle/`AbortController` scaffolding in `wireAddPlace` stays; only the fetch+parse inside the `try` changes.

- [ ] **Step 1: Add the import.** Near the other `./lib/*` imports at the top of `map.js`, add:
```js
import { searchJP } from './lib/nominatim.js';
```

- [ ] **Step 2: Replace the inline fetch+parse.** In `wireAddPlace`, the `run` closure currently has this `try/catch`:
```js
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=5&q=${encodeURIComponent(q)}`, { signal: controller.signal, headers: { 'Accept-Language': 'en' } });
        if (!r.ok) { geoEl.innerHTML = '<li class="sug-msg">Search unavailable — try again</li>'; return; }
        const data = await r.json();
        const rows = data.length ? data.map(d =>
          `<li><button type="button" data-lat="${esc(String(d.lat))}" data-lng="${esc(String(d.lon))}" data-name="${esc(d.display_name.split(',')[0])}" data-addr="${esc(d.display_name)}">${esc(d.display_name)}</button></li>`).join('')
          : '<li class="sug-msg">No matches</li>';
        geoEl.innerHTML = `<li class="sug-div" aria-hidden="true">🔍 add new</li>` + rows;
      } catch (e) { if (e.name !== 'AbortError') geoEl.innerHTML = '<li class="sug-msg">Search unavailable (offline?)</li>'; }
```
Replace it with (same rendered markup + data-attrs, sourced from `searchJP`):
```js
      try {
        const matches = await searchJP(q, controller.signal);
        const rows = matches.length ? matches.map(m =>
          `<li><button type="button" data-lat="${esc(String(m.lat))}" data-lng="${esc(String(m.lng))}" data-name="${esc(m.name)}" data-addr="${esc(m.addr)}">${esc(m.addr)}</button></li>`).join('')
          : '<li class="sug-msg">No matches</li>';
        geoEl.innerHTML = `<li class="sug-div" aria-hidden="true">🔍 add new</li>` + rows;
      } catch (e) { if (e.name !== 'AbortError') geoEl.innerHTML = '<li class="sug-msg">Search unavailable — try again</li>'; }
```
> The geocode-add click handler reads `data-lat`/`data-lng`/`data-name`/`data-addr` — all preserved, so add-place behavior is unchanged. (The two old error messages collapse into one — `searchJP` throws on `!ok` too — which is a cosmetic consolidation, not a functional change.)

- [ ] **Step 3: Verify (static — DOM module, no browser here).** `node --check docs/assets/map.js`; confirm `searchJP` is imported once and the `data-*` attributes match what the click handler reads (`grep -n "data-lat\]" map.js`). `node --test tests/lib.test.mjs` stays green. Mark the live map autocomplete PENDING MANUAL QA (type 3+ chars in the map's add-place box → suggestions appear → picking one drops a pin).

- [ ] **Step 4: Commit**

```bash
git add docs/assets/map.js
git commit -m "refactor(map): add-place search uses shared lib/nominatim.js"
```

---

### Task 3: Location field + autocomplete on the event form

**Files:** Modify `docs/assets/calendar.js` (`openModal` + a new `wireLocationField` helper + the import); `docs/assets/style.css` (dropdown styles).

**Interfaces:** Consumes `searchJP` (Task 1). The field is `<input name="area">` so the existing `FormData`-based submit persists it as `event.area` (already rendered in the agenda + used by the map estimator). No save-path change.

- [ ] **Step 1: Add the import.** With the other `./lib/*` imports at the top of `calendar.js`:
```js
import { searchJP } from './lib/nominatim.js';
```

- [ ] **Step 2: Add the Location field to the form.** In `openModal`, the form body has a Category `row2` then the Note `<label>`. Insert the Location field between them. Find:
```js
        <label>Category<select name="category">${opts}</select></label>
      </div>
      <label>Note<textarea name="note" rows="3">${esc(e.note || '')}</textarea></label>
```
Replace with:
```js
        <label>Category<select name="category">${opts}</select></label>
      </div>
      <label class="ev-loc-field">Location (optional)
        <input name="area" id="evArea" value="${esc(e.area || '')}" placeholder="Search an address…" autocomplete="off">
        <ul id="evAreaSug" class="ev-loc-sug" role="listbox" aria-label="Address suggestions"></ul>
      </label>
      <label>Note<textarea name="note" rows="3">${esc(e.note || '')}</textarea></label>
```
(`e.area` is `undefined` for a brand-new event → `esc(undefined || '')` = `''`, safe.)

- [ ] **Step 3: Wire the autocomplete.** After `const ov = showModal(body);` in `openModal`, add `wireLocationField(ov);`. Then define the helper (e.g. right after `openModal`):
```js
// Debounced Nominatim autocomplete for the event form's Location (area) field. Mirrors the map's
// add-place throttle (>=1.1s between requests). Picking a suggestion fills the input; FormData then
// persists it as event.area. Every remote string is esc()'d before innerHTML.
function wireLocationField(ov) {
  const input = ov.querySelector('#evArea'), sug = ov.querySelector('#evAreaSug');
  if (!input || !sug) return;
  let timer, controller, lastReq = 0;
  const clear = () => { sug.innerHTML = ''; };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { clear(); return; }
    const run = async () => {
      const now = Date.now();
      const wait = 1100 - (now - lastReq);
      if (wait > 0) { timer = setTimeout(run, wait); return; }   // throttle, don't drop
      lastReq = now;
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const matches = await searchJP(q, controller.signal);
        if (!sug.isConnected) return;                            // modal closed mid-request → bail (no detached write)
        sug.innerHTML = matches.length
          ? matches.map(m => `<li><button type="button" class="ev-loc-opt" data-addr="${esc(m.addr)}">${esc(m.addr)}</button></li>`).join('')
          : '<li class="ev-loc-msg">No matches</li>';
      } catch (e) { if (e.name !== 'AbortError' && sug.isConnected) sug.innerHTML = '<li class="ev-loc-msg">Search unavailable — try again</li>'; }
    };
    timer = setTimeout(run, 450);
  });
  // Select on mousedown (fires BEFORE the input's blur) + preventDefault so focus/selection isn't lost —
  // avoids the blur-vs-click race entirely (no timing-dependent setTimeout).
  sug.addEventListener('mousedown', (e) => {
    const b = e.target.closest('.ev-loc-opt'); if (!b) return;
    e.preventDefault();
    input.value = b.dataset.addr; clear();
  });
  input.addEventListener('blur', clear);   // mousedown already committed any selection, so a plain clear is safe
}
```

- [ ] **Step 4: Dropdown styles.** Append to the END of `docs/assets/style.css`:
```css
/* ---- event-form location autocomplete ---- */
.ev-loc-field{ position:relative; }
.ev-loc-sug{ list-style:none; margin:.2rem 0 0; padding:0; position:absolute; left:0; right:0; z-index:10; background: var(--bg-elevated); border:1px solid var(--line); border-radius: var(--r-sm); box-shadow: var(--shadow-lg); max-height:220px; overflow:auto; }
.ev-loc-sug:empty{ display:none; }
.ev-loc-opt{ display:block; width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:.5rem .6rem; font-size:.82rem; color: var(--ink); border-bottom:1px solid color-mix(in srgb, var(--line) 60%, transparent); }
.ev-loc-opt:hover, .ev-loc-opt:focus-visible{ background: var(--bg-soft); outline:none; }
.ev-loc-msg{ padding:.5rem .6rem; font-size:.8rem; color: var(--ink-faint); }
```

- [ ] **Step 5: Verify (static).** `node --check docs/assets/calendar.js`; `node --test tests/lib.test.mjs` green. Confirm by reading: the field is `name="area"` (so FormData persists it), every `m.addr` in the suggestion HTML is `esc()`'d, and `wireLocationField(ov)` is called once after `showModal`. Mark PENDING MANUAL QA: open `+ Add` on the calendar → type 3+ chars in Location → suggestions appear → pick one fills the field → Save → the event shows that location in the agenda view; editing the event re-opens with the location populated. No console errors.

- [ ] **Step 6: Commit**

```bash
git add docs/assets/calendar.js docs/assets/style.css
git commit -m "feat(calendar): autocompleting Location field on the event form"
```

---

### Task 4: Service-worker bump

- [ ] **Step 1.** `docs/sw.js`: `const CACHE = 'jwh-v112';` → `const CACHE = 'jwh-v113';`. On the `assets/lib/…` line, append `'assets/lib/nominatim.js',`.
- [ ] **Step 2.** `node --check docs/sw.js`; confirm `CACHE` is `'jwh-v113'` and `'assets/lib/nominatim.js'` appears once. `node --test tests/lib.test.mjs` green.
- [ ] **Step 3.** Commit: `git add docs/sw.js && git commit -m "chore(sw): cache lib/nominatim.js, bump to jwh-v113"`.

---

## Self-Review

**Spec coverage (WS7):**
- Minimal `lib/nominatim.js` util (`searchJP` + pure `parseNominatim`), UI rendering kept in callers → Task 1. ✓
- `map.js` add-place switches to the util, no behavior change (same data-attrs) → Task 2. ✓
- Location field on `#evForm` with autocomplete, persisted (as `event.area`, reusing the existing display + map estimator instead of a new `location` field) → Task 3. ✓
- `esc()` on all remote strings; inputs `.value` only → Tasks 2, 3. ✓
- SW bump + new module cached → Task 4. ✓
- *Deferred (correctly out of scope):* showing location in a Notion event side-panel (that's Plan 5 — the agenda already displays `area` now); turning the typed location into a precise map pin via lat/lng (the util returns coords, but persisting/pinning them is a later enhancement).

**Placeholder scan:** none — every code/CSS/command step is concrete.

**Type consistency:** `searchJP(query, signal) → Promise<[{name,addr,lat,lng}]>` and `parseNominatim(rows) → [{name,addr,lat,lng}]` are defined in Task 1 and consumed identically in Tasks 2 (`m.lat/m.lng/m.name/m.addr`) and 3 (`m.addr`). The event field `name="area"` matches the existing agenda renderer (`e.area`) and the submit's `FormData` path. `#evArea`/`#evAreaSug`/`.ev-loc-opt`/`data-addr` selectors match between the form HTML (Step 2), the wiring (Step 3), and the CSS (Step 4).

**Decision flagged for review:** the field writes to `area`, not a new `location` property (the spec said `location`). Rationale: events already carry `area`, the agenda renders it, and the map estimates travel from `area || address` — reusing it gives immediate display + map integration with zero new render code. Adversarial review confirmed both baked and user events read `area` uniformly (agenda, map estimator) — no collision.

**Location is text-only this round:** `searchJP` returns coords, but the event persists only the address text (`area`). Capturing lat/lng to drop a precise event pin is deliberately deferred (a later enhancement, likely with the Plan 5 map/side-panel work).

**Adversarial-review fixes folded in:** `isConnected` guard before the suggestion-list write (no detached-node write if the modal closes mid-request); suggestion selection on `mousedown`+`preventDefault` (removes the blur-vs-click race). **Rejected with reason:** extracting a shared `throttledFetch` util (would force refactoring the working, untouched map loop to dedup ~15 lines with only two callers — rule-of-three; revisit on a third caller); reusing the map's `.sug-*` CSS (would couple the calendar's floating dropdown to the map's inline-list styling); merging `parseNominatim` into `searchJP` (keeping them split is what makes the parse logic unit-testable without mocking `fetch`).
