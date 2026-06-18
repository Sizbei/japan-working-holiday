# Rooms Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the passive 44-card Rooms directory (`#/rooms`) into a search-and-shortlist tool — budget/area/flag filters, sort, parsed cost figures, Save/Contacted/notes, and a compare table — while rendering lazily and parsing once.

**Architecture:** A new pure, unit-tested `docs/assets/lib/rooms.js` derives structured fields (price/move-in/all-in/lines/flags/search blob) from the existing free-text `tips.json.rooms` strings — no data edits. The page module `docs/assets/rooms.js` enriches once on first visit, filters/sorts the in-memory array, re-renders only matching cards, and persists per-room Save/Contacted/note to a new `jwh-rooms-v1` localStorage key. Compare reuses a focus-trapped dialog added to `lib/modal.js`.

**Tech Stack:** Vanilla ES modules, no build, `node --test` for unit tests, localStorage for state, existing design tokens/CSS.

**Spec:** `specs/2026-06-18-rooms-redesign.md`

**Conventions to honour (from CLAUDE.md):** every dynamic string through `esc()` before `innerHTML`; user mutations dispatch `jwh:data-changed` on a single path (don't also call `render()` at the mutation site; `render()` must never dispatch `jwh:data-changed`); real focusable controls; bump `sw.js` `CACHE` + add new assets to its precache list; `-v1` suffix on the new store key.

**Verify (run from repo ROOT):**
```bash
node --test tests/lib.test.mjs          # unit tests, zero deps
cd docs && python3 -m http.server 8000  # serve; password lkjjapan; visit #/rooms
```
Browser auth for testing: `localStorage['jwh-auth-v1'] = 'ok'`. The app is a hash router — to pick up changes in an open tab, hard-reload or use a cache-bust query (`index.html?v=N#/rooms`).

---

## File Structure

- **Create** `docs/assets/lib/rooms.js` — pure parsers + `enrich()`. No DOM, no storage. Unit-tested.
- **Modify** `docs/assets/lib/store.js` — add `KEYS.rooms = 'jwh-rooms-v1'`.
- **Modify** `tests/lib.test.mjs` — add a `lib/rooms.js` test block.
- **Modify** `docs/index.html` — rework `#roomFilters` (budget slider, sort `<select>`, room-type chips, dynamic area/line chip container, toggle chips) + add a compare drawer container.
- **Modify** `docs/assets/rooms.js` — full rewrite: lazy first render, enrich once, filter/sort/search on the data array, reworked card, status persistence, compare.
- **Modify** `docs/assets/lib/modal.js` — add a generic `showModal(title, bodyHTML, opts)` export (focus-trapped) for the compare table.
- **Modify** `docs/assets/style.css` — controls, card, and compare CSS using existing tokens.
- **Modify** `docs/sw.js` — bump `CACHE` `jwh-v60` → `jwh-v61`; add `assets/lib/rooms.js` to the precache list.

---

## Task 1: `lib/rooms.js` — pure derived-data module + tests

**Files:**
- Create: `docs/assets/lib/rooms.js`
- Modify: `docs/assets/lib/store.js:4-30` (add one key)
- Test: `tests/lib.test.mjs` (append a block near the end, before EOF)

This task builds and unit-tests all the parsing logic in Node. It touches no DOM and no storage, so it is fully testable on its own.

- [ ] **Step 1: Add the new store key**

In `docs/assets/lib/store.js`, inside the `KEYS` object, add the `rooms` key (place it after `brewIdeas`):

```js
  brewIdeas: 'jwh-brew-ideas-v1',
  rooms: 'jwh-rooms-v1',
};
```

- [ ] **Step 2: Write the failing tests**

Append this block to the end of `tests/lib.test.mjs`:

```js
import {
  yenAmounts, parseYen, parseRent, depositYen, moveInEstimate, monthlyAllIn,
  lineTokens, bookFromAbroad, noGuarantor, womenOnly, searchBlob, enrich, LINE_LABELS,
} from '../docs/assets/lib/rooms.js';

test('parseRent: ranges, compound dorm/private, /night ×30, ¥k shorthand, junk→null', () => {
  assert.deepEqual(parseRent('¥45,000–95,000 / mo'), { monthlyMin: 45000, monthlyMax: 95000, unit: 'mo' });
  assert.deepEqual(parseRent('Dorm ¥40,000–60,000 · private ¥60,000–95,000 / mo'),
    { monthlyMin: 40000, monthlyMax: 95000, unit: 'mo' });
  assert.deepEqual(parseRent('¥3,000–6,000 / night'), { monthlyMin: 90000, monthlyMax: 180000, unit: 'night' });
  assert.deepEqual(parseRent('Share ¥50k+ · 1K apt ¥70,000–120,000 / mo'),
    { monthlyMin: 50000, monthlyMax: 120000, unit: 'mo' });
  assert.deepEqual(parseRent('From ¥40,000 / mo'), { monthlyMin: 40000, monthlyMax: 40000, unit: 'mo' });
  assert.deepEqual(parseRent('Per house'), { monthlyMin: null, monthlyMax: null, unit: 'mo' });
});

test('parseYen / yenAmounts: first amount, ¥0, none→null, k-shorthand', () => {
  assert.equal(parseYen('~¥30,000 contract'), 30000);
  assert.equal(parseYen('¥0'), 0);
  assert.equal(parseYen('Included'), null);
  assert.deepEqual(yenAmounts('¥10,000–22,000 utilities/mo'), [10000, 22000]);
  assert.deepEqual(yenAmounts('avg ~¥54k'), [54000]);
});

test('moveInEstimate: first month + oneTime + deposit; months×rent; unknown→null', () => {
  assert.deepEqual(
    moveInEstimate({ rent: '¥45,000–95,000 / mo', oneTime: '~¥30,000 contract', deposit: 'Low' }),
    { total: 75000, isEstimate: true });           // 45000 + 30000 + 0
  assert.deepEqual(
    moveInEstimate({ rent: '¥60,000–80,000 / mo', oneTime: '~¥30,000', deposit: '~1 month' }),
    { total: 150000, isEstimate: true });          // 60000 + 30000 + 60000
  assert.deepEqual(
    moveInEstimate({ rent: '¥50,000–90,000 / mo', oneTime: 'No key money', deposit: '¥20,000 (¥10,000 non-refundable)' }),
    { total: 70000, isEstimate: true });           // 50000 + 0 + 20000
  assert.deepEqual(moveInEstimate({ rent: 'Per house', oneTime: 'Low', deposit: 'Low' }),
    { total: null, isEstimate: true });
});

test('monthlyAllIn: rent floor + first fee amount; fees included → rent alone; junk→null', () => {
  assert.equal(monthlyAllIn({ rent: '¥45,000–95,000 / mo', fees: '¥10,000–22,000 utilities/mo' }), 55000);
  assert.equal(monthlyAllIn({ rent: '¥55,000–80,000 / mo', fees: 'Utilities included' }), 55000);
  assert.equal(monthlyAllIn({ rent: 'Per house', fees: '~¥15,000' }), null);
});

test('lineTokens: dictionary match over station + area', () => {
  assert.deepEqual(lineTokens({ station: 'Various', area: 'Nakano, Koenji, Oji, Kuramae' }).sort(),
    ['Asakusa/Kuramae', 'Koenji', 'Nakano'].sort());
  assert.ok(lineTokens({ station: 'Koenji (JR Chuo/Sobu)', area: 'Koenji / Suginami (Chuo line)' }).includes('Chuo line'));
  assert.deepEqual(lineTokens({ station: 'Filter', area: 'All Tokyo' }), []);
  assert.ok(Array.isArray(LINE_LABELS) && LINE_LABELS.length > 0);
});

test('flag derivations: bookFromAbroad / noGuarantor / womenOnly', () => {
  assert.equal(bookFromAbroad({ moveIn: 'Rolling — book from abroad', requirements: [] }), true);
  assert.equal(bookFromAbroad({ moveIn: 'Viewings encouraged', requirements: ['Visa'] }), false);
  assert.equal(noGuarantor({ requirements: ['No guarantor needed'] }), true);
  assert.equal(noGuarantor({ requirements: ['Guarantor company (they arrange)'] }), false);
  assert.equal(womenOnly({ gender: 'women-only' }), true);
  assert.equal(womenOnly({ gender: 'mixed (some women-only rooms)' }), false);
});

test('enrich: adds derived fields, leaves the source object untouched (immutable)', () => {
  const src = [{ id: 'x', name: 'X House', provider: 'P', area: 'Nakano', station: 'Various',
    rent: '¥45,000–95,000 / mo', fees: '~¥10,000', oneTime: '~¥30,000', deposit: 'Low',
    roomType: 'private', gender: 'mixed', noKeyMoney: true, moveIn: 'Rolling — apply online from abroad',
    requirements: ['No guarantor'], note: 'nice' }];
  const out = enrich(src);
  assert.equal(out[0]._allIn, 55000);
  assert.equal(out[0]._moveIn.total, 75000);
  assert.deepEqual(out[0]._price, { monthlyMin: 45000, monthlyMax: 95000, unit: 'mo' });
  assert.ok(out[0]._lines.includes('Nakano'));
  assert.equal(out[0]._bookAbroad, true);
  assert.equal(out[0]._noGuarantor, true);
  assert.equal(out[0]._women, false);
  assert.equal(out[0]._blob.includes('nakano'), true);
  assert.equal(src[0]._allIn, undefined);   // source not mutated
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/lib.test.mjs`
Expected: FAIL — `Cannot find module '../docs/assets/lib/rooms.js'` (the module doesn't exist yet).

- [ ] **Step 4: Create the module**

Create `docs/assets/lib/rooms.js`:

```js
'use strict';
// Pure helpers that derive structured fields from the free-text room records in tips.json
// (rent/fees/deposit/station strings). Import-safe in Node — no DOM, no storage. Every
// function is total: unparseable input yields a safe default and never throws. The figures
// are estimates (the source is human-written ranges), surfaced in the UI with an "est" tag.

// Fixed dictionary: Tokyo areas/lines that actually recur across the 44 records. Each entry is
// [label, regex]; matched against `station + area`. Drives the area/line filter chips.
const LINE_DICT = [
  ['Nakano', /nakano/i],
  ['Koenji', /koenji/i],
  ['Suginami', /suginami/i],
  ['Setagaya', /setagaya|sangenjaya|shimokita|gotokuji|kyodo|todoroki|oyamadai/i],
  ['Shibuya', /shibuya/i],
  ['Shinjuku', /shinjuku/i],
  ['Ikebukuro', /ikebukuro/i],
  ['Itabashi', /itabashi|oyama/i],
  ['Toshima/Bunkyo', /toshima|bunkyo|otsuka|gokokuji|sugamo|komagome|kagurazaka|shiinamachi/i],
  ['Minato', /minato|roppongi|azabu|hiroo|aoyama/i],
  ['Asakusa/Kuramae', /asakusa|kuramae/i],
  ['Yamanote line', /yamanote/i],
  ['Chuo line', /chuo|sobu/i],
];

export const LINE_LABELS = LINE_DICT.map(([label]) => label);

// All ¥ amounts in a string, supporting the "¥54k" shorthand. Returns number[] (may be empty).
export function yenAmounts(str) {
  const out = [];
  const re = /¥\s*([\d,]+)\s*(k)?/gi;
  let m;
  while ((m = re.exec(String(str || '')))) {
    let n = parseInt(m[1].replace(/,/g, ''), 10);
    if (!Number.isFinite(n)) continue;
    if (m[2]) n *= 1000;            // "¥54k" → 54000
    out.push(n);
  }
  return out;
}

// First ¥ amount in a string, or null.
export function parseYen(str) {
  const a = yenAmounts(str);
  return a.length ? a[0] : null;
}

// Monthly rent range from the free-text rent string. Nightly rates are ×30 (flagged unit:'night').
export function parseRent(rentStr) {
  const s = String(rentStr || '');
  const amts = yenAmounts(s);
  const unit = /night|nightly/i.test(s) ? 'night' : 'mo';
  if (!amts.length) return { monthlyMin: null, monthlyMax: null, unit };
  let lo = Math.min(...amts), hi = Math.max(...amts);
  if (unit === 'night') { lo *= 30; hi *= 30; }
  return { monthlyMin: lo, monthlyMax: hi, unit };
}

// Deposit in yen (estimate): a ¥ amount if present, else "N month(s)" → N × monthlyMin, else 0.
export function depositYen(room, monthlyMin) {
  const s = String(room.deposit || '');
  const yen = parseYen(s);
  if (yen != null) return yen;                                 // "¥20,000", "¥0"
  const mo = s.match(/(\d+)\s*(?:[–-]\s*\d+\s*)?month/i);      // "1 month", "~2–3 months", "0–1 month"
  if (mo && monthlyMin != null) return parseInt(mo[1], 10) * monthlyMin;
  return 0;                                                    // "Low", "None", "Varies", ""
}

// Estimated up-front cash to move in: first month + one-time + deposit. null if rent unknown.
export function moveInEstimate(room) {
  const { monthlyMin } = parseRent(room.rent);
  if (monthlyMin == null) return { total: null, isEstimate: true };
  const oneTime = parseYen(room.oneTime) || 0;
  const deposit = depositYen(room, monthlyMin);
  return { total: monthlyMin + oneTime + deposit, isEstimate: true };
}

// Monthly all-in: rent floor + first fee amount, or rent alone when fees are included/unparseable.
export function monthlyAllIn(room) {
  const { monthlyMin } = parseRent(room.rent);
  if (monthlyMin == null) return null;
  const fees = parseYen(room.fees);
  return fees != null ? monthlyMin + fees : monthlyMin;
}

// Area/line tokens matched from the fixed dictionary against station + area.
export function lineTokens(room) {
  const hay = `${room.station || ''} ${room.area || ''}`;
  return LINE_DICT.filter(([, re]) => re.test(hay)).map(([label]) => label);
}

export function bookFromAbroad(room) {
  const hay = `${room.moveIn || ''} ${(room.requirements || []).join(' ')}`;
  return /abroad|before arrival|apply online/i.test(hay);
}

export function noGuarantor(room) {
  const hay = `${(room.requirements || []).join(' ')} ${room.oneTime || ''}`;
  return /no guarantor/i.test(hay);
}

export function womenOnly(room) {
  return /^women-only/i.test(String(room.gender || ''))
    || /women-only/i.test(`${room.name || ''} ${room.area || ''}`);
}

export function searchBlob(room) {
  return [room.name, room.provider, room.area, room.station, room.note,
    (room.requirements || []).join(' ')].join(' ').toLowerCase();
}

// Map each room to a copy with derived fields. Run once, on first render. Does not mutate input.
export function enrich(rooms) {
  return (rooms || []).map(r => ({
    ...r,
    _price: parseRent(r.rent),
    _moveIn: moveInEstimate(r),
    _allIn: monthlyAllIn(r),
    _lines: lineTokens(r),
    _bookAbroad: bookFromAbroad(r),
    _noGuarantor: noGuarantor(r),
    _women: womenOnly(r),
    _blob: searchBlob(r),
  }));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/lib.test.mjs`
Expected: PASS — all new tests green, and the pre-existing suite (~38 tests) still green.

- [ ] **Step 6: Commit**

```bash
git add docs/assets/lib/rooms.js docs/assets/lib/store.js tests/lib.test.mjs
git commit -m "feat(rooms): pure derived-data lib (parsers + enrich) with unit tests"
```

---

## Task 2: Rework the `#view-rooms` controls markup + control CSS

**Files:**
- Modify: `docs/index.html:317-332` (the `#roomFilters` block + grid)
- Modify: `docs/assets/style.css` (append controls CSS after the existing `.room-*` rules, ~line 1008)

This task only changes static markup + CSS. After it, the page shows the new controls; the grid stays empty until Task 3 wires the JS.

- [ ] **Step 1: Replace the filter block**

In `docs/index.html`, replace the current `#roomFilters` div and the grid line (lines 317–332, from `<div id="roomFilters">` through `<div class="grid" id="roomsGrid"></div>`) with:

```html
    <div id="roomFilters">
      <input type="search" id="roomSearch" placeholder="FILTER ROOMS // nakano · women · ¥50k · dorm…" aria-label="Filter rooms">
      <label class="room-budget" for="roomBudget">Budget <output id="roomBudgetVal">Any</output>
        <input type="range" id="roomBudget" min="30000" max="200000" step="5000" value="200000" aria-label="Maximum monthly rent">
      </label>
      <label class="room-sort" for="roomSort">Sort
        <select id="roomSort" aria-label="Sort rooms">
          <option value="newcomer">Newcomer-friendly</option>
          <option value="rent">Rent (low→high)</option>
          <option value="movein">Move-in cost (low→high)</option>
          <option value="soonest">Move-in soonest</option>
        </select>
      </label>
      <div class="filters" id="roomTypeF" role="group" aria-label="Room type">
        <button class="chip active" data-room="all" type="button" aria-pressed="true">Any room</button>
        <button class="chip" data-room="private" type="button" aria-pressed="false">Private</button>
        <button class="chip" data-room="dorm" type="button" aria-pressed="false">Dorm</button>
      </div>
      <div class="filters" id="roomLines" role="group" aria-label="Area / line"></div>
      <div class="filters" id="roomToggles" role="group" aria-label="Filters">
        <button class="chip toggle" id="roomNoKey" type="button" aria-pressed="false">No key money</button>
        <button class="chip toggle" id="roomNoGuar" type="button" aria-pressed="false">No guarantor</button>
        <button class="chip toggle" id="roomAbroad" type="button" aria-pressed="false">Book from abroad</button>
        <button class="chip toggle" id="roomWomen" type="button" aria-pressed="false">Women-only</button>
        <button class="chip toggle" id="roomSavedOnly" type="button" aria-pressed="false">★ Saved</button>
      </div>
    </div>
    <div class="grid" id="roomsGrid"></div>
    <div id="roomCompareBar" class="room-compare-bar" hidden role="region" aria-label="Compare selection"></div>
```

(The `#roomCount` span in the `.lede` above stays as-is — the JS repurposes it for the "N of 44 · S saved · C contacted" summary.)

- [ ] **Step 2: Add the controls CSS**

In `docs/assets/style.css`, immediately after the `.room-links .btn` rule (~line 1008), insert:

```css
/* Rooms redesign — controls */
.room-budget, .room-sort{ display:flex; align-items:center; gap:.4rem; font-family: var(--mono); font-size:.72rem; color: var(--ink-soft); }
.room-budget output{ min-width:5.5rem; color: var(--indigo-ink); font-weight:700; }
#roomBudget{ accent-color: var(--indigo); }
.room-sort select{ font:inherit; padding:.25rem .4rem; border:1px solid var(--line); border-radius: var(--r-sm); background: var(--bg); color: var(--ink); }
#roomLines{ gap:.3rem; }
```

- [ ] **Step 3: Verify it renders**

Serve and load the page (auth in console first):
```bash
cd docs && python3 -m http.server 8000
```
Open `http://localhost:8000/index.html?v=1#/rooms`, set `localStorage['jwh-auth-v1']='ok'` then reload. Expected: budget slider, sort dropdown, room-type chips, an (empty) area/line chip row, and the five toggle chips all render with no console errors. The grid is empty (JS not wired yet) — that's expected.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/assets/style.css
git commit -m "feat(rooms): budget slider + sort + area/line + flag-toggle controls markup"
```

---

## Task 3: `rooms.js` page core — lazy render, filter/sort/search, reworked card, status persistence

**Files:**
- Modify: `docs/assets/rooms.js` (full rewrite)
- Modify: `docs/assets/style.css` (append card CSS after the Task 2 controls CSS)

After this task the page is fully functional except the compare table (Task 4). The card carries no compare checkbox yet.

- [ ] **Step 1: Rewrite the page module**

Replace the entire contents of `docs/assets/rooms.js` with:

```js
'use strict';
// Share-room finder (#/rooms). Curated foreigner-friendly providers/houses, enriched once from
// free text (lib/rooms.js) into a filterable/sortable list with parsed cost, transit, and flags.
// Save/Contacted/note state is device-local (jwh-rooms-v1). No provider has a public listings
// API, so live availability lives on the links. Renders lazily on first visit to #/rooms.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { enrich, LINE_LABELS } from './lib/rooms.js';

let DATA = null;
let ROOMS = [];
let rendered = false;

const yen = (n) => '¥' + Number(n).toLocaleString('en-US');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const isOn = (sel) => !!$(sel)?.classList.contains('active');

// ---- status store (saved / contacted / note per room id) ----
function allStatus() { return get(KEYS.rooms, {}); }
function statusOf(id) { return allStatus()[id] || {}; }
function writeStatus(mutator) { const all = { ...allStatus() }; mutator(all); set(KEYS.rooms, all); }
function tidy(all, id, cur) { if (Object.keys(cur).length) all[id] = cur; else delete all[id]; }

function toggleStatus(id, key) {
  writeStatus(all => { const cur = { ...(all[id] || {}) }; if (cur[key]) delete cur[key]; else cur[key] = true; tidy(all, id, cur); });
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));   // single path → render() re-derives
}
function saveNote(id, val) {
  // No dispatch / re-render: the note is already in the DOM; re-rendering would nuke the focused textarea.
  writeStatus(all => { const cur = { ...(all[id] || {}) }; const v = val.trim(); if (v) cur.note = v; else delete cur.note; tidy(all, id, cur); });
}

export function mountRooms(data) {
  DATA = data;
  document.addEventListener('jwh:route', (e) => { if (e.detail?.route === 'rooms') ensureRendered(); });
  document.addEventListener('jwh:data-changed', () => { if (rendered) render(); });
}

function ensureRendered() {
  if (rendered) { render(); return; }            // revisit: cheap re-render picks up any external change
  ROOMS = enrich(DATA.rooms || []);
  buildLineChips();
  wireControls();
  rendered = true;
  render();
}

// ---- area/line chips (union across rooms, in dictionary order) ----
function buildLineChips() {
  const cont = $('#roomLines'); if (!cont) return;
  const present = new Set();
  ROOMS.forEach(r => r._lines.forEach(l => present.add(l)));
  const ordered = LINE_LABELS.filter(l => present.has(l));
  cont.innerHTML = ordered.map(l =>
    `<button class="chip" type="button" data-line="${esc(l)}" aria-pressed="false">${esc(l)}</button>`).join('');
  $$('#roomLines .chip').forEach(ch => ch.addEventListener('click', () => {
    const on = ch.classList.toggle('active'); ch.setAttribute('aria-pressed', on ? 'true' : 'false'); render();
  }));
}

// ---- filtering / sorting ----
function readFilters() {
  const budget = +($('#roomBudget')?.value || 200000);
  return {
    q: ($('#roomSearch')?.value || '').trim().toLowerCase(),
    ceiling: budget >= 200000 ? Infinity : budget,
    room: $('#roomTypeF .chip.active')?.dataset.room || 'all',
    lines: $$('#roomLines .chip.active').map(c => c.dataset.line),
    sort: $('#roomSort')?.value || 'newcomer',
    noKey: isOn('#roomNoKey'), noGuar: isOn('#roomNoGuar'),
    abroad: isOn('#roomAbroad'), women: isOn('#roomWomen'), savedOnly: isOn('#roomSavedOnly'),
  };
}

function matches(r, f) {
  if (f.q && !r._blob.includes(f.q)) return false;
  if (f.ceiling !== Infinity && r._price.monthlyMin != null && r._price.monthlyMin > f.ceiling) return false;
  if (f.room === 'private' && !(r.roomType === 'private' || r.roomType === 'private-apartment' || r.roomType === 'both')) return false;
  if (f.room === 'dorm' && !(r.roomType === 'dorm' || r.roomType === 'both')) return false;
  if (f.lines.length && !f.lines.some(l => r._lines.includes(l))) return false;
  if (f.noKey && !r.noKeyMoney) return false;
  if (f.noGuar && !r._noGuarantor) return false;
  if (f.abroad && !r._bookAbroad) return false;
  if (f.women && !r._women) return false;
  if (f.savedOnly && !statusOf(r.id).saved) return false;
  return true;
}

const soon = (r) => /rolling|flexible/i.test(r.moveIn || '') ? 1 : 0;
function sortRooms(arr, sort) {
  const a = [...arr];
  const nl = (v) => v == null ? Infinity : v;
  if (sort === 'rent') a.sort((x, y) => nl(x._price.monthlyMin) - nl(y._price.monthlyMin));
  else if (sort === 'movein') a.sort((x, y) => nl(x._moveIn.total) - nl(y._moveIn.total));
  else if (sort === 'soonest') a.sort((x, y) => soon(y) - soon(x));
  return a;                                        // 'newcomer' → keep enrich/original order
}

// ---- card ----
function transitText(r) {
  const st = (r.station || '').trim();
  if (!st || /^various\b|^filter\b/i.test(st)) return 'Citywide — many houses';
  return st;
}
function flagBadges(r) {
  const out = [];
  if (r.noKeyMoney) out.push('NO KEY MONEY');
  if (r._noGuarantor) out.push('NO GUARANTOR');
  if (r._bookAbroad) out.push('BOOK FROM ABROAD');
  if (r._women) out.push('WOMEN-ONLY');
  return out.map(x => `<span class="room-flag">${esc(x)}</span>`).join('');
}
function card(r) {
  const s = statusOf(r.id);
  const allIn = r._allIn != null ? `~${yen(r._allIn)}/mo all-in` : 'Rent varies';
  const moveIn = r._moveIn.total != null ? `~${yen(r._moveIn.total)} move-in` : 'Move-in varies';
  const badges = flagBadges(r);
  return `<article class="room-card tier-${esc(r.tier)}" data-id="${esc(r.id)}">
    <div class="room-head"><h3 class="room-name">${esc(r.name)}</h3></div>
    <div class="room-provider">${esc(r.provider)} · <span class="room-area">📍 ${esc(r.area)}</span></div>
    <div class="room-cost-line"><b>${esc(allIn)}</b> <span class="room-est">${esc(moveIn)} · est</span></div>
    <div class="room-transit">🚉 ${esc(transitText(r))}</div>
    ${badges ? `<div class="room-flags">${badges}</div>` : ''}
    <p class="room-note">${esc(r.note)}</p>
    <div class="room-actions">
      <button type="button" class="room-act${s.saved ? ' on' : ''}" data-act="save" aria-pressed="${s.saved ? 'true' : 'false'}">${s.saved ? '★ Saved' : '☆ Save'}</button>
      <button type="button" class="room-act${s.contacted ? ' on' : ''}" data-act="contacted" aria-pressed="${s.contacted ? 'true' : 'false'}">${s.contacted ? '✓ Contacted' : 'Contacted?'}</button>
    </div>
    <details class="room-note-wrap"${s.note ? ' open' : ''}>
      <summary>Note</summary>
      <textarea class="room-note-edit" rows="2" aria-label="Private note for ${esc(r.name)}" placeholder="When you applied, who you emailed, the rent they quoted…">${esc(s.note || '')}</textarea>
    </details>
    <div class="room-links">
      <a class="btn primary" href="${esc(r.listingUrl)}" target="_blank" rel="noopener noreferrer">Browse listings ↗</a>
      <a class="btn ghost" href="${esc(r.providerUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.provider)} ↗</a>
    </div>
  </article>`;
}

// ---- render ----
function render() {
  const grid = $('#roomsGrid'); if (!grid) return;
  const f = readFilters();
  const subset = sortRooms(ROOMS.filter(r => matches(r, f)), f.sort);
  grid.innerHTML = subset.map(card).join('');
  if (!subset.length) {
    const p = document.createElement('p');
    p.className = 'room-empty'; p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite');
    p.textContent = 'No rooms match these filters — clear a filter or raise the budget.';
    grid.appendChild(p);
  }
  updateSummary(subset.length);
}
function updateSummary(n) {
  const all = allStatus();
  const ids = Object.keys(all);
  const saved = ids.filter(k => all[k].saved).length;
  const contacted = ids.filter(k => all[k].contacted).length;
  const el = $('#roomCount');
  if (el) el.textContent = `${n} of ${ROOMS.length} · ${saved} saved · ${contacted} contacted`;
}

function updateBudgetLabel() {
  const v = +($('#roomBudget')?.value || 200000);
  const out = $('#roomBudgetVal'); if (out) out.textContent = v >= 200000 ? 'Any' : `≤ ${yen(v)}/mo`;
}

// ---- wiring (bound once; the grid is rebuilt each render so card actions use delegation) ----
function wireControls() {
  $('#roomSearch')?.addEventListener('input', debounce(render, 150));
  $('#roomBudget')?.addEventListener('input', () => { updateBudgetLabel(); render(); });
  $('#roomSort')?.addEventListener('change', render);
  $$('#roomTypeF .chip').forEach(ch => ch.addEventListener('click', () => {
    $$('#roomTypeF .chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    ch.classList.add('active'); ch.setAttribute('aria-pressed', 'true'); render();
  }));
  ['#roomNoKey', '#roomNoGuar', '#roomAbroad', '#roomWomen', '#roomSavedOnly'].forEach(sel => {
    $(sel)?.addEventListener('click', () => { const on = $(sel).classList.toggle('active'); $(sel).setAttribute('aria-pressed', on ? 'true' : 'false'); render(); });
  });
  updateBudgetLabel();

  const grid = $('#roomsGrid');
  grid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.room-act'); if (!btn) return;
    const id = btn.closest('.room-card')?.dataset.id; if (!id) return;
    toggleStatus(id, btn.dataset.act === 'save' ? 'saved' : 'contacted');
  });
  const noteTimers = new Map();
  grid?.addEventListener('input', (e) => {
    const ta = e.target.closest('.room-note-edit'); if (!ta) return;
    const id = ta.closest('.room-card')?.dataset.id; if (!id) return;
    clearTimeout(noteTimers.get(id));
    noteTimers.set(id, setTimeout(() => saveNote(id, ta.value), 300));
  });
}
```

- [ ] **Step 2: Add the card CSS**

In `docs/assets/style.css`, immediately after the `#roomLines{ gap:.3rem; }` rule added in Task 2, insert:

```css
/* Rooms redesign — card */
.room-cost-line{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.5rem; font-family: var(--mono); }
.room-cost-line b{ color: var(--indigo-ink); font-size:.95rem; }
.room-est{ font-size:.68rem; color: var(--ink-soft); }
.room-transit{ font-size:.78rem; color: var(--ink-soft); }
.room-flags{ display:flex; flex-wrap:wrap; gap:.3rem; }
.room-actions{ display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; margin-top:.3rem; }
.room-act{ font-family: var(--mono); font-size:.72rem; padding:.3rem .6rem; border:1px solid var(--line); border-radius: var(--r-pill); background: var(--bg); color: var(--ink-soft); cursor:pointer; }
.room-act.on{ border-color: var(--indigo); color: var(--indigo-ink); background: color-mix(in srgb, var(--indigo) 10%, transparent); font-weight:700; }
.room-note-wrap > summary{ font-family: var(--mono); font-size:.68rem; color: var(--ink-soft); cursor:pointer; list-style:none; margin-top:.2rem; }
.room-note-wrap > summary::-webkit-details-marker{ display:none; }
.room-note-edit{ width:100%; margin-top:.3rem; font:inherit; font-size:.8rem; padding:.4rem; border:1px solid var(--line); border-radius: var(--r-sm); background: var(--bg); color: var(--ink); resize:vertical; }
```

- [ ] **Step 3: Verify in the browser**

Serve, auth, and hard-reload `http://localhost:8000/index.html?v=2#/rooms`. Verify:
- Cards render with a cost line (`~¥X/mo all-in`), an `est` move-in figure, a 🚉 transit line, and flag badges.
- Budget slider narrows the list and its label updates (`≤ ¥70,000/mo` / `Any` at max).
- Area/line chips appear (Nakano, Koenji, Setagaya, …) and OR-filter; room-type chips and the four flag toggles filter; sort reorders.
- Search narrows after a brief pause; the empty-state message shows when nothing matches.
- ★ Save / ✓ Contacted toggle and persist across reload; the note textarea autosaves and persists; the summary reads `N of 44 · S saved · C contacted`.
- No console errors.

- [ ] **Step 4: Verify lazy render**

Hard-reload on a different route first: `http://localhost:8000/index.html?v=3#/dashboard`. In the console run `document.querySelectorAll('#roomsGrid .room-card').length` → expect `0` (rooms not rendered yet). Then navigate to `#/rooms` and re-run → expect `44`. Confirms first-render is deferred.

- [ ] **Step 5: Run unit tests (still green)**

Run: `node --test tests/lib.test.mjs`
Expected: PASS (this task changed no lib signatures).

- [ ] **Step 6: Commit**

```bash
git add docs/assets/rooms.js docs/assets/style.css
git commit -m "feat(rooms): lazy enrich + filter/sort/search, reworked card, save/contacted/notes"
```

---

## Task 4: Compare drawer + focus-trapped compare table

**Files:**
- Modify: `docs/assets/lib/modal.js` (add a `showModal` export)
- Modify: `docs/assets/rooms.js` (add compare checkbox to the card, compare state, drawer, table)
- Modify: `docs/assets/style.css` (append compare + wide-modal CSS)

- [ ] **Step 1: Add a generic content modal to `modal.js`**

In `docs/assets/lib/modal.js`, add this export at the end of the file (it reuses the private `openDialog` focus-trap already in the file). The caller must pass `bodyHTML` that is already `esc()`'d:

```js
// Generic content dialog: titled, focus-trapped, with a single Close button. `bodyHTML` MUST be
// pre-esc()'d by the caller. Resolves (undefined) when dismissed. Used by the rooms compare table.
export function showModal(titleText, bodyHTML, { closeLabel = 'Close', wide = false } = {}) {
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">${esc(titleText)}</h2>
    <div class="app-modal-body">${bodyHTML}</div>
    <div class="app-modal-acts"><button type="button" class="am-btn am-primary" data-ok>${esc(closeLabel)}</button></div>`, {
    onMount: (card, done) => {
      if (wide) card.classList.add('app-modal-wide');
      card.querySelector('[data-ok]').addEventListener('click', () => done(true));
    },
    initialFocus: '[data-ok]',
  }).then(() => undefined);
}
```

- [ ] **Step 2: Import `showModal` and add compare state to `rooms.js`**

In `docs/assets/rooms.js`, change the modal-less import line:

```js
import { enrich, LINE_LABELS } from './lib/rooms.js';
```

to add the modal import directly below it:

```js
import { enrich, LINE_LABELS } from './lib/rooms.js';
import { showModal } from './lib/modal.js';
```

Then add the compare selection set next to the other module state (after `let rendered = false;`):

```js
const compareSet = new Set();        // room ids selected for compare (max 4); UI-only, not persisted
```

- [ ] **Step 3: Add the compare checkbox to the card actions**

In `card(r)`, replace the `.room-actions` block:

```js
    <div class="room-actions">
      <button type="button" class="room-act${s.saved ? ' on' : ''}" data-act="save" aria-pressed="${s.saved ? 'true' : 'false'}">${s.saved ? '★ Saved' : '☆ Save'}</button>
      <button type="button" class="room-act${s.contacted ? ' on' : ''}" data-act="contacted" aria-pressed="${s.contacted ? 'true' : 'false'}">${s.contacted ? '✓ Contacted' : 'Contacted?'}</button>
    </div>
```

with (adds the compare checkbox; `checked` when selected, `disabled` when the cap of 4 is reached and this card isn't already selected):

```js
    <div class="room-actions">
      <button type="button" class="room-act${s.saved ? ' on' : ''}" data-act="save" aria-pressed="${s.saved ? 'true' : 'false'}">${s.saved ? '★ Saved' : '☆ Save'}</button>
      <button type="button" class="room-act${s.contacted ? ' on' : ''}" data-act="contacted" aria-pressed="${s.contacted ? 'true' : 'false'}">${s.contacted ? '✓ Contacted' : 'Contacted?'}</button>
      <label class="room-compare"><input type="checkbox" data-act="compare"${compareSet.has(r.id) ? ' checked' : ''}${!compareSet.has(r.id) && compareSet.size >= 4 ? ' disabled' : ''}> Compare</label>
    </div>
```

- [ ] **Step 4: Render the drawer after each grid render**

In `render()`, add a `renderDrawer()` call as the last line (after `updateSummary(subset.length);`):

```js
  updateSummary(subset.length);
  renderDrawer();
}
```

- [ ] **Step 5: Add the drawer + table functions**

Add these functions to `docs/assets/rooms.js` (e.g. after `updateSummary`):

```js
// ---- compare ----
function renderDrawer() {
  const bar = $('#roomCompareBar'); if (!bar) return;
  if (compareSet.size === 0) { bar.hidden = true; bar.innerHTML = ''; return; }
  const chips = [...compareSet].map(id => {
    const r = ROOMS.find(x => x.id === id); const nm = r ? r.name : id;
    return `<span class="rc-chip">${esc(nm)} <button type="button" class="rc-x" data-rm="${esc(id)}" aria-label="Remove ${esc(nm)}">×</button></span>`;
  }).join('');
  bar.hidden = false;
  bar.innerHTML = `<div class="rc-chips">${chips}</div>
    <div class="rc-acts">
      <button type="button" class="btn primary" id="rcCompare"${compareSet.size < 2 ? ' disabled' : ''}>Compare (${compareSet.size}) →</button>
      <button type="button" class="btn ghost" id="rcClear">Clear</button>
    </div>`;
  $('#rcCompare')?.addEventListener('click', openCompare);
  $('#rcClear')?.addEventListener('click', () => { compareSet.clear(); render(); });
  bar.querySelectorAll('.rc-x').forEach(b => b.addEventListener('click', () => { compareSet.delete(b.dataset.rm); render(); }));
}

function openCompare() {
  const rows = [...compareSet].map(id => ROOMS.find(r => r.id === id)).filter(Boolean);
  if (rows.length < 2) return;
  const head = `<tr><th></th>${rows.map(r => `<th>${esc(r.name)}</th>`).join('')}</tr>`;
  const line = (label, fn) => `<tr><th>${esc(label)}</th>${rows.map(r => `<td>${esc(fn(r))}</td>`).join('')}</tr>`;
  const body = [
    line('Rent (all-in)', r => r._allIn != null ? `~${yen(r._allIn)}/mo` : r.rent),
    line('Move-in (est)', r => r._moveIn.total != null ? `~${yen(r._moveIn.total)}` : '—'),
    line('Fees', r => r.fees),
    line('Deposit', r => r.deposit),
    line('Room type', r => r.roomType + (r.gender ? ` · ${r.gender}` : '')),
    line('Requirements', r => (r.requirements || []).join(' · ')),
    line('Transit', r => transitText(r)),
    line('Move-in', r => r.moveIn),
  ].join('');
  const links = `<tr><th>Links</th>${rows.map(r => `<td><a href="${esc(r.listingUrl)}" target="_blank" rel="noopener noreferrer">listings ↗</a></td>`).join('')}</tr>`;
  const table = `<div class="rc-table-wrap"><table class="rc-table"><thead>${head}</thead><tbody>${body}${links}</tbody></table></div>`;
  showModal('Compare rooms', table, { wide: true });
}
```

- [ ] **Step 6: Wire the compare checkbox (delegated change handler)**

In `wireControls()`, add a delegated `change` listener on the grid (next to the existing `click`/`input` delegation):

```js
  grid?.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-act="compare"]'); if (!cb) return;
    const id = cb.closest('.room-card')?.dataset.id; if (!id) return;
    if (cb.checked) { if (compareSet.size < 4) compareSet.add(id); } else compareSet.delete(id);
    render();        // rebuilds cards → reflects checked + disables the rest at the cap; refreshes drawer
  });
```

- [ ] **Step 7: Add compare CSS**

In `docs/assets/style.css`, after the `.room-note-edit` rule from Task 3, insert:

```css
/* Rooms redesign — compare */
.room-compare{ font-family: var(--mono); font-size:.7rem; color: var(--ink-soft); display:inline-flex; align-items:center; gap:.25rem; cursor:pointer; }
.room-compare input:disabled{ cursor:not-allowed; }
.room-compare-bar{ position:sticky; bottom:0; z-index:5; display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; justify-content:space-between; margin-top: var(--s4); padding: var(--s3) var(--s4); background: var(--bg-soft); border:1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow); }
.rc-chips{ display:flex; flex-wrap:wrap; gap:.4rem; }
.rc-chip{ font-family: var(--mono); font-size:.7rem; background: var(--bg); border:1px solid var(--line); border-radius: var(--r-pill); padding:.2rem .5rem; display:inline-flex; align-items:center; gap:.3rem; }
.rc-x{ border:none; background:none; color: var(--ink-soft); cursor:pointer; font-size:.95rem; line-height:1; padding:0; }
.rc-acts{ display:flex; gap:.5rem; }
.app-modal-wide{ max-width: min(680px, 94vw); }
.app-modal-body{ margin-bottom: var(--s4); }
.rc-table-wrap{ overflow-x:auto; }
.rc-table{ border-collapse:collapse; width:100%; font-size:.8rem; }
.rc-table th, .rc-table td{ border:1px solid var(--line); padding:.4rem .55rem; text-align:left; vertical-align:top; }
.rc-table thead th{ font-family: var(--mono); font-size:.72rem; color: var(--indigo-ink); }
.rc-table tbody th{ font-family: var(--mono); font-size:.66rem; text-transform:uppercase; letter-spacing:.03em; color: var(--ink-soft); white-space:nowrap; }
```

- [ ] **Step 8: Verify in the browser**

Hard-reload `http://localhost:8000/index.html?v=4#/rooms`. Verify:
- Ticking Compare on a card adds a chip to the bottom drawer; the drawer's "Compare (n) →" enables at 2.
- At 4 selected, remaining checkboxes disable; un-ticking re-enables them.
- "Compare (n) →" opens a focus-trapped dialog with a side-by-side table (rent all-in, move-in est, fees, deposit, room type, requirements, transit, move-in, links); Esc closes it and restores focus to the trigger.
- The drawer's per-chip × and "Clear" remove/clear selections.
- No console errors.

- [ ] **Step 9: Run unit tests (still green)**

Run: `node --test tests/lib.test.mjs`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add docs/assets/lib/modal.js docs/assets/rooms.js docs/assets/style.css
git commit -m "feat(rooms): compare drawer + focus-trapped compare table (≤4)"
```

---

## Task 5: Service-worker cache bump + final verification

**Files:**
- Modify: `docs/sw.js:5` (CACHE constant) and `docs/sw.js:10` (ASSETS lib list)

- [ ] **Step 1: Bump the cache version**

In `docs/sw.js`, change line 5:

```js
const CACHE = 'jwh-v60';
```

to:

```js
const CACHE = 'jwh-v61';
```

- [ ] **Step 2: Add the new lib asset to the precache list**

In `docs/sw.js` line 10, the lib list begins `'assets/lib/dom.js', 'assets/lib/store.js', …`. Add `'assets/lib/rooms.js'` to it, e.g. right after `'assets/lib/store.js',`:

```js
  'assets/lib/dom.js', 'assets/lib/store.js', 'assets/lib/rooms.js', 'assets/lib/dates.js', 'assets/lib/homelayout.js',
```

- [ ] **Step 3: Full verification pass**

```bash
node --test tests/lib.test.mjs        # from repo ROOT — expect all green
python3 -m json.tool docs/data/tips.json > /dev/null   # data still valid JSON
```
Then serve (`cd docs && python3 -m http.server 8000`), and in DevTools → Application, unregister the SW + clear cache, hard-reload. Walk every route via the nav — `#/dashboard … #/rooms … #/map … #/plan` — and confirm:
- All 8 non-rooms routes render unchanged with no console errors.
- `#/rooms`: lazy render still works (cards absent until first visit), filters/sort/search/compare/persistence all work, no console errors.

- [ ] **Step 4: Commit**

```bash
git add docs/sw.js
git commit -m "chore(sw): cache jwh-v61 + precache assets/lib/rooms.js"
```

---

## Self-Review (completed during planning)

**Spec coverage** (`specs/2026-06-18-rooms-redesign.md`):
- §2 Architecture (keep data, new pure lib, lazy render) → Tasks 1 + 3.
- §3 all pure functions (`parseRent`, `parseYen`, `moveInEstimate`, `monthlyAllIn`, `lineTokens`, `bookFromAbroad`, `noGuarantor`, `womenOnly`, `searchBlob`, `enrich`) → Task 1, each unit-tested. (`yenAmounts` is an added internal helper underpinning `parseYen`/`parseRent`; `LINE_LABELS` exported to order the chips.)
- §4a controls (budget slider, area/line chips, quick toggles, sort, debounced search, Saved toggle, summary) → Tasks 2 + 3.
- §4b card (prominent cost, transit, flags, actions, expandable note, links) → Task 3.
- §4c compare drawer + focus-trapped table (≤4) → Task 4.
- §4d status persistence (`KEYS.rooms='jwh-rooms-v1'`, dispatch `jwh:data-changed`) → Tasks 1 + 3.
- §5 latency (lazy first render, parse once, filter/sort on data, debounced search) → Task 3.
- §6 a11y/constraints (real controls, focus-trap via `modal.js`, `aria-pressed`, `esc()`, `rel=noopener`, SW bump + precache) → Tasks 2–5.
- §7 out of scope respected (no scraping, no per-listing pins, no data edits, only Saved+Contacted).

**Known estimate imperfections (acceptable; figures are UI-tagged "est"):** `parseRent` takes global min/max of all ¥ amounts in the string, so a stray discount/average figure (e.g. "avg ~¥54k", "discount up to ¥7,000/mo off") can pull the floor down on a few records. This is the documented trade-off for handling the common compound "Dorm … · private …" form correctly, and the spec already flags all cost figures as estimates.

**Type consistency:** `enrich` writes `_price/_moveIn/_allIn/_lines/_bookAbroad/_noGuarantor/_women/_blob`; `rooms.js` reads exactly those. `KEYS.rooms` defined in Task 1, consumed in Task 3. `showModal(title, bodyHTML, {wide})` defined in Task 4 Step 1, called in Step 5. Status shape `{saved?, contacted?, note?}` written by `toggleStatus`/`saveNote` and read by `statusOf`/`updateSummary` consistently.
