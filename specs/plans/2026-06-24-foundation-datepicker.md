# Foundation + Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared pure mini-calendar (`lib/minical.js`) and a themed date-picker popover (`datepicker.js`), then use them so a user can set a due date *while adding a new task* via a Notion-style calendar.

**Architecture:** `lib/minical.js` is pure month-grid math (no DOM, unit-tested in Node). `datepicker.js` renders that grid as a focus-trapped, body-mounted popover returning `Promise<string|null>`. `lib/modal.js`'s `askDate` becomes a thin wrapper that picks the popover on desktop and the native `<input type="date">` on touch — so the existing per-task 📅 button is upgraded with zero call-site churn. The checklist add-composer gains a "Due" button that feeds the chosen ISO into `customItem(task, phase, dueBy)`.

**Tech Stack:** Vanilla ES modules, no build step. Tests: `node --test` (zero deps). CSS custom properties already in `docs/assets/style.css`.

## Global Constraints

- Zero-build, dependency-free: no bundler/frameworks/new CDNs; `<script type="module">`, relative paths, GitHub Pages from `/docs`. (verbatim from spec)
- Every dynamic string through `esc()` before `innerHTML`. (Here: minical produces only ISO strings + integers, and datepicker injects only its own trusted markup — no user strings — so `esc()` is not needed in this plan, but never `innerHTML` a user/remote string without it.)
- Service worker: bump `CACHE` in `docs/sw.js` (`jwh-v108` → `jwh-v109`) on any asset change, and add new `assets/*.js` to its `ASSETS` precache list. Network-first.
- localStorage shape changes bump the `-v1` suffix. (No new keys in this plan.)
- Reduce-motion: respect `html[data-reduce-motion="on"]` AND `prefers-reduced-motion` (this plan ships no popover animation, so it is compliant by construction).
- Run tests from the repo ROOT: `node --test tests/lib.test.mjs`.

---

### Task 1: Pure mini-calendar math (`lib/minical.js`)

**Files:**
- Create: `docs/assets/lib/minical.js`
- Test: `tests/lib.test.mjs` (append)

**Interfaces:**
- Produces:
  - `monthGrid(year:number, month:0-11) → Week[6]` where `Week = Cell[7]`, `Cell = { iso:'YYYY-MM-DD', day:1-31, inMonth:boolean }`. Weeks start Sunday; always a full 6×7 rectangle (adjacent-month days filled with `inMonth:false`).
  - `addMonths(year, month, delta) → { year, month }` (year-normalised).
  - `isoToYM('YYYY-MM-DD') → { year, month:0-11, day } | null`.
  - `MONTHS: string[12]` (full names), `WEEKDAYS_SHORT: string[7]` (`['Su',…,'Sa']`).

- [ ] **Step 1: Write the failing tests** — append to `tests/lib.test.mjs`:

```js
import { monthGrid, addMonths, isoToYM, MONTHS, WEEKDAYS_SHORT } from '../docs/assets/lib/minical.js';

test('monthGrid: full 6x7 rectangle, right in-month count + weekday alignment', () => {
  const g = monthGrid(2026, 6);                 // July 2026 (month is 0-indexed)
  assert.equal(g.length, 6);
  assert.ok(g.every(w => w.length === 7));
  const flat = g.flat();
  assert.equal(flat.length, 42);
  assert.equal(flat.filter(c => c.inMonth).length, 31);   // July has 31 days
  // July 1 2026 is a Wednesday → row 0, column 3
  assert.equal(g[0][3].iso, '2026-07-01');
  assert.equal(g[0][3].inMonth, true);
  assert.equal(g[0][0].iso, '2026-06-28');                // leading Sunday from June
  assert.equal(g[0][0].inMonth, false);
});

test('addMonths wraps year boundaries', () => {
  assert.deepEqual(addMonths(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(addMonths(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths(2026, 5, 0), { year: 2026, month: 5 });
});

test('isoToYM parses and rejects', () => {
  assert.deepEqual(isoToYM('2026-07-01'), { year: 2026, month: 6, day: 1 });
  assert.equal(isoToYM('nope'), null);
  assert.equal(MONTHS[6], 'July');
  assert.equal(WEEKDAYS_SHORT[0], 'Su');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib.test.mjs`
Expected: FAIL — `Cannot find module '../docs/assets/lib/minical.js'`.

- [ ] **Step 3: Write the implementation** — create `docs/assets/lib/minical.js`:

```js
'use strict';
// Pure month-grid math for the mini-calendar — shared by the date-picker popover
// (datepicker.js) and the calendar sidebar navigator. No DOM; import-safe in Node.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;   // m is 0-11

// 6-week (42-cell) grid, weeks starting Sunday. Each cell:
// { iso:'YYYY-MM-DD', day:1..31, inMonth:bool }. Built with UTC to stay tz-stable.
export function monthGrid(year, month) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();   // 0=Sun
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(Date.UTC(year, month, 1 - firstDow + w * 7 + d));
      const y = cur.getUTCFullYear(), m = cur.getUTCMonth(), day = cur.getUTCDate();
      row.push({ iso: isoOf(y, m, day), day, inMonth: m === month && y === year });
    }
    weeks.push(row);
  }
  return weeks;
}

// Step the (year, month) pair by delta months, normalising the year. Pure.
export function addMonths(year, month, delta) {
  const t = month + delta;
  return { year: year + Math.floor(t / 12), month: ((t % 12) + 12) % 12 };
}

// Parse 'YYYY-MM-DD' → { year, month(0-11), day }. null on junk.
export function isoToYM(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? { year: +m[1], month: +m[2] - 1, day: +m[3] } : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib.test.mjs`
Expected: PASS — all three new tests green, existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add docs/assets/lib/minical.js tests/lib.test.mjs
git commit -m "feat(minical): pure month-grid math for the shared mini-calendar"
```

---

### Task 2: Date-picker popover (`datepicker.js`) + styles

**Files:**
- Create: `docs/assets/datepicker.js`
- Modify: `docs/assets/style.css` (append a styles block)

**Interfaces:**
- Consumes: `monthGrid`, `addMonths`, `isoToYM`, `MONTHS`, `WEEKDAYS_SHORT` (Task 1); `nowISO` from `lib/dates.js`.
- Produces: `openDatePicker({ value?:string, min?:string, max?:string }) → Promise<string|null>` — resolves an ISO date, `''` (cleared), or `null` (cancelled). Mounted on `<body>`; dismisses on `jwh:data-changed`; focus-trapped; Esc/backdrop cancel; restores focus to the previously-focused element.

- [ ] **Step 1: Create the popover module** — `docs/assets/datepicker.js`:

```js
'use strict';
// Themed mini-calendar date-picker popover. Resolves an ISO date, '' (cleared), or null
// (cancelled). Mounted on <body> and self-dismissing on jwh:data-changed so a concurrent
// checklist/calendar rebuild can't orphan it. Focus-trapped; Esc/backdrop cancel; restores focus.
import { monthGrid, addMonths, isoToYM, MONTHS, WEEKDAYS_SHORT } from './lib/minical.js';
import { nowISO } from './lib/dates.js';

export function openDatePicker({ value = '', min = '2026-01-01', max = '2027-12-31' } = {}) {
  return new Promise((resolve) => {
    const today = nowISO();
    const sel = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    const startYM = isoToYM(sel) || isoToYM(today) || { year: 2026, month: 5 };
    let year = startYM.year, month = startYM.month;
    const prev = document.activeElement;

    const ov = document.createElement('div');
    ov.className = 'dp-overlay';
    ov.innerHTML = `<div class="dp-card" role="dialog" aria-modal="true" aria-label="Choose a date"></div>`;
    document.body.appendChild(ov);
    const card = ov.querySelector('.dp-card');

    let settled = false;
    const focusables = () => [...card.querySelectorAll('button:not([disabled])')];
    const done = (val) => {
      if (settled) return; settled = true;
      ov.remove();
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('jwh:data-changed', onChanged);
      if (prev && prev.focus) prev.focus();
      resolve(val);
    };
    const onChanged = () => done(null);                 // concurrent list rebuild → dismiss
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    const render = () => {
      const body = monthGrid(year, month).map(w => `<tr>${w.map(c => {
        const dis = c.iso < min || c.iso > max;
        const cls = ['dp-day', c.inMonth ? '' : 'dp-out', c.iso === today ? 'dp-today' : '', c.iso === sel ? 'dp-sel' : ''].filter(Boolean).join(' ');
        return `<td><button type="button" class="${cls}" data-iso="${c.iso}"${dis ? ' disabled' : ''} aria-label="${c.iso}"${c.iso === sel ? ' aria-pressed="true"' : ''}>${c.day}</button></td>`;
      }).join('')}</tr>`).join('');
      card.innerHTML = `
        <div class="dp-nav">
          <button type="button" class="dp-arrow dp-prev" aria-label="Previous month">‹</button>
          <span class="dp-title" role="status" aria-live="polite">${MONTHS[month]} ${year}</span>
          <button type="button" class="dp-arrow dp-next" aria-label="Next month">›</button>
        </div>
        <table class="dp-grid"><thead><tr>${WEEKDAYS_SHORT.map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
        <div class="dp-acts">
          <button type="button" class="dp-clear">Clear</button>
          <button type="button" class="dp-set-today">Today</button>
        </div>`;
      card.querySelector('.dp-prev').onclick = () => { ({ year, month } = addMonths(year, month, -1)); render(); };
      card.querySelector('.dp-next').onclick = () => { ({ year, month } = addMonths(year, month, 1)); render(); };
      card.querySelector('.dp-clear').onclick = () => done('');
      card.querySelector('.dp-set-today').onclick = () => { if (today >= min && today <= max) done(today); };
      card.querySelectorAll('.dp-day[data-iso]:not([disabled])').forEach(b => { b.onclick = () => done(b.dataset.iso); });
    };

    render();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('jwh:data-changed', onChanged);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
    setTimeout(() => (card.querySelector('.dp-sel') || card.querySelector('.dp-today') || focusables()[0])?.focus(), 20);
  });
}
```

- [ ] **Step 2: Append the styles** to the END of `docs/assets/style.css`:

```css
/* ---- mini-calendar date picker (datepicker.js) ---- */
.dp-overlay{ position:fixed; inset:0; z-index:1100; background: color-mix(in srgb, #000 50%, transparent); display:grid; place-items:center; padding: var(--s4); }
.dp-card{ width:100%; max-width:320px; background: var(--bg-elevated); border:1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-lg); padding: var(--s4); }
.dp-nav{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.6rem; }
.dp-title{ font-weight:700; font-size:.95rem; color: var(--ink); }
.dp-arrow{ border:1px solid var(--line); background: var(--bg-soft); color: var(--ink); border-radius: var(--r-sm); width:34px; height:34px; cursor:pointer; font-size:1rem; }
.dp-arrow:hover{ border-color: var(--indigo); }
.dp-grid{ width:100%; border-collapse:collapse; table-layout:fixed; }
.dp-grid th{ font-size:.7rem; font-weight:600; color: var(--ink-faint); padding:.25rem 0; }
.dp-grid td{ padding:1px; text-align:center; }
.dp-day{ width:100%; aspect-ratio:1; min-height:34px; border:1px solid transparent; background:transparent; color: var(--ink); border-radius: var(--r-sm); cursor:pointer; font-size:.85rem; font-variant-numeric: tabular-nums; }
.dp-day:hover{ background: var(--bg-soft); border-color: var(--line); }
.dp-day:focus-visible{ outline:none; box-shadow: var(--ring); }
.dp-out{ color: var(--ink-faint); opacity:.55; }
.dp-today{ font-weight:700; box-shadow: inset 0 0 0 1px var(--line-strong); }
.dp-sel{ background: var(--indigo); color: var(--on-accent); border-color: var(--indigo); font-weight:700; }
.dp-day[disabled]{ opacity:.3; cursor:not-allowed; }
.dp-acts{ display:flex; justify-content:space-between; gap:.5rem; margin-top:.6rem; }
.dp-clear, .dp-set-today{ font-family: var(--mono); font-weight:700; font-size:.78rem; border:1px solid var(--line); background: var(--bg-soft); color: var(--ink); border-radius: var(--r-sm); padding:.4rem .8rem; cursor:pointer; min-height:38px; }
.dp-set-today{ background: var(--indigo); color: var(--on-accent); border-color: var(--indigo); }
/* composer "Due" button (checklist add-task) */
.ql-due{ font-family: var(--mono); font-weight:700; font-size:.78rem; border:1px solid var(--line); background: var(--bg-soft); color: var(--ink); border-radius: var(--r-sm); padding:.4rem .7rem; cursor:pointer; white-space:nowrap; }
.ql-due:hover{ border-color: var(--indigo); }
```

- [ ] **Step 3: Smoke-test in the browser** (no unit test — DOM module)

Run: `cd docs && python3 -m http.server 8000`
In the browser console at `http://localhost:8000` (after `localStorage['jwh-auth-v1']='ok'` + reload), run:
```js
const { openDatePicker } = await import('/assets/datepicker.js');
console.log(await openDatePicker({ value: '2026-07-08' }));   // pick a day → logs its ISO; Clear → ''; Esc → null
```
Expected: a themed mini-calendar opens centered, July 2026 shown with the 8th highlighted; ‹ › change months; clicking a day / Clear / Esc resolves the promise; focus returns to the page. No console errors.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/datepicker.js docs/assets/style.css
git commit -m "feat(datepicker): themed mini-calendar popover"
```

---

### Task 3: Route `askDate` through the popover (native fallback on touch)

**Files:**
- Modify: `docs/assets/lib/modal.js:76` (the `askDate` export)

**Interfaces:**
- Consumes: `openDatePicker` (Task 2).
- Produces: unchanged public contract — `askDate(label, { value?, min?, max? }) → Promise<string|null>`. The per-task 📅 handler in `checklist-page.js` keeps working untouched.

- [ ] **Step 1: Replace the `askDate` one-liner.** In `docs/assets/lib/modal.js`, find:

```js
export const askDate = (label, opts = {}) => askText(label, { type: 'date', ok: 'Set', min: '2026-01-01', max: '2027-12-31', ...opts });
```

Replace with:

```js
import { openDatePicker } from '../datepicker.js';
// Coarse-pointer / small screens get the native date input (better mobile UX); pointer/desktop
// gets the themed mini-calendar popover. Same (label, opts) → Promise<string|null> contract.
const coarsePointer = () => !!(window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 700px)').matches));
export function askDate(label, { value = '', min = '2026-01-01', max = '2027-12-31' } = {}) {
  if (coarsePointer()) return askText(label, { type: 'date', ok: 'Set', min, max, value });
  return openDatePicker({ value, min, max });
}
```

> Move the `import { openDatePicker } …` line up to sit with the other imports at the top of `modal.js` (after `import { esc } from './dom.js';`). No import cycle: `datepicker.js` imports only `lib/minical.js` + `lib/dates.js`, neither of which imports `modal.js`.

- [ ] **Step 2: Verify the existing 📅 button uses it** — serve, open `#/checklist`, click a task's 📅.
Expected (desktop): the mini-calendar popover opens; choosing a day sets the due tag; Clear removes it; the date validates (no `alertModal` about bad format because the picker only emits valid ISO or `''`). No console errors.

- [ ] **Step 3: Commit**

```bash
git add docs/assets/lib/modal.js
git commit -m "feat(modal): askDate uses the mini-calendar popover (native input on touch)"
```

---

### Task 4: "Due" control in the add-task composer

**Files:**
- Modify: `docs/assets/checklist-page.js` — `renderCheckToolbar` (both variants), `commitCheckTask`, plus two small new helpers.

**Interfaces:**
- Consumes: `askDate` (Task 3), `customItem(task, phase, dueBy, id)` (existing, `lib/checklist.js`), `fmtShort` (existing import).
- Produces: a module-local `composerDue` ISO string fed into new custom items; reset after each add.

- [ ] **Step 1: Add the module state + helpers.** Near the top of `checklist-page.js` (after `let DATA = null;`), add:

```js
let composerDue = '';   // ISO due date chosen in the add-composer; reset after each add
function setComposerDueLabel() {
  const b = $('#checkAddDue');
  if (b) b.textContent = composerDue ? `📅 ${fmtShort(composerDue)}` : '📅 Due';
}
function wireComposerDue() {
  setComposerDueLabel();
  $('#checkAddDue')?.addEventListener('click', async () => {
    const v = await askDate('Due date for the new task (blank to clear):', { value: composerDue });
    if (v === null) return;            // cancelled
    composerDue = v.trim();            // '' clears
    setComposerDueLabel();
  });
}
```

- [ ] **Step 2: Add the button to the PILLS composer.** In `renderCheckToolbar`, inside the `LISTCTL.PILLS` branch's `.lc-composer`, insert the Due button between the phase `<select>` and the `lc-add-go` button:

```html
        <select id="checkAddPhase" class="ql-sel" aria-label="Phase">${opts}</select>
        <button type="button" class="ql-due" id="checkAddDue" aria-label="Set due date for new task">📅 Due</button>
        <button type="button" class="ql-addsuggest lc-add-go" id="checkAddGo">＋ Add</button>
```

- [ ] **Step 3: Add the button to the quick-line composer.** In the `else` branch's `.ql-quickadd`, insert it between the phase `<select>` and the `checkAddBtn`:

```html
        <select id="checkAddPhase" class="ql-sel" aria-label="Phase">${opts}</select>
        <button type="button" class="ql-due" id="checkAddDue" aria-label="Set due date for new task">📅 Due</button>
        <button type="button" class="ql-addsuggest" id="checkAddBtn">＋ Add “<span class="ql-q" id="checkAddQ"></span>”</button>
```

- [ ] **Step 4: Wire the Due button after the toolbar renders.** In `renderCheckToolbar`, the last two lines are `$('#checkAddPhase').value = 'My tasks';` then `wireCheckSearch();`. Add a third line:

```js
  $('#checkAddPhase').value = 'My tasks';
  wireCheckSearch();
  wireComposerDue();
```

- [ ] **Step 5: Feed `composerDue` into the new item + reset.** Replace the body of `commitCheckTask`:

```js
function commitCheckTask(task, focusEl) {
  task = (task || '').trim();
  if (!task) return;
  const phase = $('#checkAddPhase')?.value || 'My tasks';
  saveChecklistCustom([...loadChecklistCustom(), customItem(task, phase, composerDue, 'cku' + Date.now())]);
  composerDue = '';                  // clear the picked due date after adding
  setComposerDueLabel();
  renderChecklist();                                              // re-render the list
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));    // refresh dashboard teaser/bell
  focusEl?.focus();
}
```

- [ ] **Step 6: Verify end-to-end** — serve, `#/checklist`:
  1. Open the Add composer, type "Test task", click **📅 Due**, pick a date → the button shows that date.
  2. Click **＋ Add** → the new task appears under "My tasks" with a `due …` tag matching the picked date.
  3. The composer's Due button resets to "📅 Due".
  4. The new task's own 📅 still opens the popover and edits the date.
  Expected: all four hold; `node --test tests/lib.test.mjs` still green; no console errors.

- [ ] **Step 7: Commit**

```bash
git add docs/assets/checklist-page.js
git commit -m "feat(checklist): pick a due date while adding a new task"
```

---

### Task 5: Service-worker bump (ship the new assets)

**Files:**
- Modify: `docs/sw.js` — `CACHE` constant + `ASSETS` array.

- [ ] **Step 1: Bump the cache version.** In `docs/sw.js`, change:

```js
const CACHE = 'jwh-v108';
```
to:
```js
const CACHE = 'jwh-v109';
```

- [ ] **Step 2: Add the two new modules to `ASSETS`.**
  - On the line that begins `'assets/style.css', 'assets/main.js', …` (the top-level assets line), append `'assets/datepicker.js',`.
  - On the `assets/lib/…` line that ends with `'assets/lib/weekgrid.js',`, append `'assets/lib/minical.js',`.

- [ ] **Step 3: Verify a clean reload.** Hard-reload `http://localhost:8000` (DevTools → Application → unregister SW + clear cache, or bump already forces it). Confirm the date picker still works offline-after-first-load and there are no 404s for `datepicker.js` / `lib/minical.js` in the Network tab.

- [ ] **Step 4: Commit**

```bash
git add docs/sw.js
git commit -m "chore(sw): cache datepicker.js + lib/minical.js, bump to jwh-v109"
```

---

## Self-Review

**Spec coverage (this plan = WS2 foundation + impl-order steps 1–2):**
- `lib/minical.js` pure + tested → Task 1. ✓
- `datepicker.js` popover, body-mounted, dismisses on `jwh:data-changed`, focus-trap, native touch fallback → Tasks 2–3. ✓
- `askDate` thin wrapper, signature preserved → Task 3. ✓
- Composer "Due" control feeding `customItem(…, dueBy)` → Task 4. ✓
- SW `CACHE` v108→v109 + new modules in `ASSETS` → Task 5. ✓
- Reduce-motion: no animation shipped (compliant). Min/max bounds (2026-01-01…2027-12-31) preserved. ✓
- *Deferred to later plans (correctly out of scope here):* the calendar sidebar navigator that also consumes `minical` (Plan 5), and tag chips (Plan 2).

**Placeholder scan:** none — every code/CSS/command step is concrete.

**Type consistency:** `monthGrid`/`addMonths`/`isoToYM`/`MONTHS`/`WEEKDAYS_SHORT` names + shapes match across Task 1 (definition), Task 2 (consumption), and the tests. `openDatePicker({value,min,max})→Promise<string|null>` is identical in Tasks 2, 3. `composerDue` + `setComposerDueLabel` consistent across Task 4 steps. `askDate(label,{value,min,max})` matches the existing call site in `checklist-page.js` (`askDate('Due date (blank to clear):', { value: due[id] || '' })`).
