# Task Labels (Free-form Tags) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user attach free-form, color-coded tags to any checklist task (baked or custom) and filter the list by a tag — without mutating `tips.json`.

**Architecture:** Tags are stored device-local in a new id-keyed map `jwh-tags-v1: { [taskId]: string[] }` (same pattern as `jwh-due-v1`). A pure `lib/tags.js` owns all tag logic (unit-tested in Node). The checklist renders each task's tags as clickable color chips (in a sibling element, NOT inside the checkbox's `<label>` — a `<button>` there is invalid HTML), adds a 🏷 button that opens a focus-trapped tag-editor modal (`askTags`), and supports one active tag filter that narrows the current view (AND with the smart-view/search/hide-done filters).

**Tech Stack:** Vanilla ES modules, no build step. Tests: `node --test tests/lib.test.mjs`. Theme via existing CSS custom properties.

## Global Constraints

- Zero-build, dependency-free: no bundler/frameworks/new CDNs; vanilla ES modules; relative paths; GitHub Pages from `/docs`. (verbatim from spec)
- Every dynamic string through `esc()` before `innerHTML`. Tag text is **user input** — it MUST be `esc()`'d everywhere it reaches `innerHTML`, and editor inputs use the `.value` DOM property only.
- localStorage keys live in `lib/store.js` `KEYS`; new shapes bump the `-v1` suffix. New key: `tags: 'jwh-tags-v1'`.
- Service worker: bump `CACHE` in `docs/sw.js` (`jwh-v109` → `jwh-v110`) on any asset change, and add new `assets/*.js` to its `ASSETS` precache list. Network-first.
- Checklist data-flow (CLAUDE.md): user mutations dispatch `jwh:data-changed` at the mutation site; `render()` must never dispatch it. The tag *filter* is view-only (like `checkSearchQ`) — it must NOT mutate data, NOT affect progress math, and NOT dispatch `jwh:data-changed`. Editing tags (add/remove) IS a mutation → save + dispatch.
- Accessibility: prefer real `<button>` controls; restore keyboard focus across the `innerHTML` rebuild (the checklist already does this in `captureCheckFocus`). Tag chips must meet WCAG AA contrast in BOTH themes.
- Reduce-motion: respect `html[data-reduce-motion="on"]` AND `prefers-reduced-motion` (this plan ships no animation, so compliant by construction).
- Run tests from the repo ROOT: `node --test tests/lib.test.mjs`.

## File Structure

- **New:** `docs/assets/lib/tags.js` — pure tag logic (normalize/add/remove/list/hue/setTags).
- **Modify:** `docs/assets/lib/store.js` (add `KEYS.tags`), `docs/assets/lib/modal.js` (add `askTags`), `docs/assets/checklist-page.js` (chips, 🏷 button, editor wiring, filter, toolbar pill, focus restore), `docs/assets/style.css` (chip/editor/pill styles), `docs/sw.js` (cache bump + asset), `tests/lib.test.mjs` (append).

---

### Task 1: Pure tag logic (`lib/tags.js`) + store key

**Files:**
- Create: `docs/assets/lib/tags.js`
- Modify: `docs/assets/lib/store.js` (add one KEYS entry)
- Test: `tests/lib.test.mjs` (append)

**Interfaces:**
- Produces:
  - `normalizeTag(s) → string` — trim, strip leading `#`, collapse inner whitespace, lowercase, cap 24 chars. `''` for junk/empty.
  - `addTag(map, id, tag) → newMap` — adds a normalized tag to `map[id]` (no dupes, no mutation; no-op on empty id/tag).
  - `removeTag(map, id, tag) → newMap` — removes it; deletes the `id` entry entirely when its array becomes empty.
  - `setTags(map, id, arr) → newMap` — replaces `map[id]` with a normalized, de-duplicated array; deletes the entry if the result is empty.
  - `tagsFor(map, id) → string[]` — the id's tags (always an array).
  - `allTags(map) → string[]` — distinct tags across all ids, sorted ascending.
  - `tagHue(tag) → number` — stable hash in `[0,359]` for the chip color.

- [ ] **Step 1: Write the failing tests** — append to `tests/lib.test.mjs`:

```js
import { normalizeTag, addTag, removeTag, setTags, tagsFor, allTags, tagHue } from '../docs/assets/lib/tags.js';

test('normalizeTag: trims, strips #, collapses ws, lowercases, caps length', () => {
  assert.equal(normalizeTag('  #Visa '), 'visa');
  assert.equal(normalizeTag('Ward  Office'), 'ward office');
  assert.equal(normalizeTag('##HOUSING'), 'housing');
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag(null), '');
  assert.equal(normalizeTag('a'.repeat(40)).length, 24);
});

test('addTag: normalizes, dedupes, never mutates', () => {
  const m0 = {};
  const m1 = addTag(m0, 'cku1', '#Visa');
  assert.deepEqual(m1, { cku1: ['visa'] });
  assert.deepEqual(m0, {});                         // original untouched
  const m2 = addTag(m1, 'cku1', 'visa');            // dup → unchanged map content
  assert.deepEqual(m2, { cku1: ['visa'] });
  assert.equal(addTag(m1, '', 'x'), m1);            // empty id → same ref
  assert.equal(addTag(m1, 'cku1', '   '), m1);      // empty tag → same ref
});

test('removeTag: removes and deletes empty id entry', () => {
  const m = { a: ['visa', 'money'] };
  assert.deepEqual(removeTag(m, 'a', 'money'), { a: ['visa'] });
  assert.deepEqual(removeTag({ a: ['visa'] }, 'a', 'visa'), {});   // last tag → id removed
  assert.deepEqual(m, { a: ['visa', 'money'] });                  // original untouched
});

test('setTags: normalizes+dedupes a whole list, deletes when empty', () => {
  assert.deepEqual(setTags({}, 'a', ['#Visa', 'visa', 'Money']), { a: ['visa', 'money'] });
  assert.deepEqual(setTags({ a: ['x'] }, 'a', []), {});
  assert.deepEqual(setTags({ a: ['x'] }, 'a', ['  ']), {});       // all-empty → deleted
});

test('tagsFor / allTags', () => {
  const m = { a: ['money', 'visa'], b: ['visa', 'health'] };
  assert.deepEqual(tagsFor(m, 'a'), ['money', 'visa']);
  assert.deepEqual(tagsFor(m, 'missing'), []);
  assert.deepEqual(allTags(m), ['health', 'money', 'visa']);     // distinct + sorted
  assert.deepEqual(allTags({}), []);
});

test('tagHue: deterministic, in range, stable across calls', () => {
  const h = tagHue('visa');
  assert.equal(h, tagHue('visa'));
  assert.ok(Number.isInteger(h) && h >= 0 && h < 360);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib.test.mjs`
Expected: FAIL — `Cannot find module '../docs/assets/lib/tags.js'`.

- [ ] **Step 3: Create `docs/assets/lib/tags.js`:**

```js
'use strict';
// Pure helpers for free-form task labels (tags). Stored device-local as
// { [taskId]: string[] } under KEYS.tags (jwh-tags-v1). Pure + import-safe in Node;
// the load/save store wrappers live in checklist-page.js (next to the other check stores).

const MAX_LEN = 24;

// trim, strip leading '#', collapse inner whitespace, lowercase, cap length. '' for junk.
export function normalizeTag(s) {
  return String(s == null ? '' : s)
    .trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_LEN).trim();
}

// add a normalized tag to an id's list → NEW map (no mutation, no dupes; no-op on empty id/tag).
export function addTag(map, id, tag) {
  const t = normalizeTag(tag);
  if (!id || !t) return map;
  const cur = Array.isArray(map[id]) ? map[id] : [];
  if (cur.includes(t)) return map;
  return { ...map, [id]: [...cur, t] };
}

// remove a tag from an id's list → NEW map; deletes the id entry when its array empties.
export function removeTag(map, id, tag) {
  const t = normalizeTag(tag);
  const cur = Array.isArray(map[id]) ? map[id] : [];
  if (!cur.includes(t)) return map;
  const next = cur.filter(x => x !== t);
  const out = { ...map };
  if (next.length) out[id] = next; else delete out[id];
  return out;
}

// replace an id's whole list with a normalized, de-duplicated array → NEW map; deletes when empty.
export function setTags(map, id, arr) {
  const norm = [];
  (Array.isArray(arr) ? arr : []).forEach(t => { const n = normalizeTag(t); if (n && !norm.includes(n)) norm.push(n); });
  const out = { ...map };
  if (norm.length) out[id] = norm; else delete out[id];
  return out;
}

export function tagsFor(map, id) {
  const cur = map && map[id];
  return Array.isArray(cur) ? cur : [];
}

// distinct tags across all ids, sorted ascending.
export function allTags(map) {
  const set = new Set();
  Object.values(map || {}).forEach(arr => { if (Array.isArray(arr)) arr.forEach(t => set.add(t)); });
  return [...set].sort();
}

// stable hue 0-359 from the tag text — deterministic, pure (for the chip colour).
export function tagHue(tag) {
  const s = String(tag || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
```

- [ ] **Step 4: Add the store key.** In `docs/assets/lib/store.js`, inside the `KEYS` object, add after the `translateCache` line (before the closing `};`):

```js
  tags: 'jwh-tags-v1',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/lib.test.mjs`
Expected: PASS — all six new tests green, existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add docs/assets/lib/tags.js docs/assets/lib/store.js tests/lib.test.mjs
git commit -m "feat(tags): pure tag logic + KEYS.tags store key"
```

---

### Task 2: Tag-editor modal (`askTags`) + styles

**Files:**
- Modify: `docs/assets/lib/modal.js` (add `askTags` export + one import)
- Modify: `docs/assets/style.css` (append tag-editor styles)

**Interfaces:**
- Consumes: `normalizeTag` (Task 1); existing `openDialog`, `esc` in `modal.js`.
- Produces: `askTags(taskLabel:string, current:string[], all:string[]) → Promise<string[]|null>` — resolves the new tag array (possibly `[]` when all cleared) on **Done**, or `null` on Cancel/Esc/backdrop. A half-typed tag in the input at Done is committed.

- [ ] **Step 1: Add the import.** At the top of `docs/assets/lib/modal.js`, the existing imports are `import { esc } from './dom.js';` and (from Plan 1) `import { openDatePicker } from '../datepicker.js';`. Add below them:

```js
import { normalizeTag } from './tags.js';
```

(No cycle: `tags.js` imports nothing.)

- [ ] **Step 2: Add the `askTags` export.** Append this function to `docs/assets/lib/modal.js` (e.g. just before the final `showModal` export, or at end of file):

```js
// Tag editor: chips for current tags (each removable) + a datalist-backed input. Resolves the new
// tag array on Done (commits any half-typed input), or null on cancel. Every tag string is esc()'d.
export function askTags(taskLabel, current = [], all = []) {
  const chip = (t) => `<span class="tagedit-chip"><span class="tagedit-t">${esc(t)}</span><button type="button" class="tagedit-x" data-rm="${esc(t)}" aria-label="Remove tag ${esc(t)}">✕</button></span>`;
  const options = (all || []).map(t => `<option value="${esc(t)}"></option>`).join('');
  const titleSuffix = taskLabel ? ` — ${esc(taskLabel)}` : '';
  return openDialog(`
    <h2 id="amTitle" class="app-modal-title">Tags${titleSuffix}</h2>
    <div class="tagedit-chips" id="tageditChips"></div>
    <input class="app-modal-input tagedit-input" id="tageditInput" list="tageditList" placeholder="Add a tag — press Enter" aria-label="Add a tag" autocomplete="off">
    <datalist id="tageditList">${options}</datalist>
    <div class="app-modal-acts">
      <button type="button" class="am-btn" data-cancel>Cancel</button>
      <button type="button" class="am-btn am-primary" data-done>Done</button>
    </div>`, {
    onMount: (card, done) => {
      let tags = (current || []).slice();
      const chipsEl = card.querySelector('#tageditChips');
      const input = card.querySelector('#tageditInput');
      const redraw = () => { chipsEl.innerHTML = tags.length ? tags.map(chip).join('') : '<span class="tagedit-empty">No tags yet</span>'; };
      const add = () => {
        const t = normalizeTag(input.value);
        input.value = '';
        if (t && !tags.includes(t)) { tags.push(t); redraw(); }
      };
      redraw();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } });
      chipsEl.addEventListener('click', (e) => {
        const x = e.target.closest('[data-rm]'); if (!x) return;
        tags = tags.filter(t => t !== x.dataset.rm); redraw();
      });
      card.querySelector('[data-done]').addEventListener('click', () => { add(); done(tags); });
      card.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    }, initialFocus: '.tagedit-input',
  });
}
```

- [ ] **Step 3: Append the editor styles** to the END of `docs/assets/style.css`:

```css
/* ---- tag editor modal (askTags) ---- */
.tagedit-chips{ display:flex; flex-wrap:wrap; gap:.35rem; min-height:1.8rem; margin-bottom: var(--s4); }
.tagedit-empty{ font-size:.8rem; color: var(--ink-faint); }
.tagedit-chip{ display:inline-flex; align-items:center; gap:.2rem; font-family:var(--mono); font-size:.72rem; font-weight:700; padding:.18rem .2rem .18rem .5rem; border-radius:999px; background: var(--bg-soft); border:1px solid var(--line); color: var(--ink); }
.tagedit-x{ border:none; background:none; cursor:pointer; color: var(--ink-soft); font-size:.72rem; line-height:1; padding:.1rem .25rem; border-radius:999px; }
.tagedit-x:hover{ color: var(--ink); background: var(--bg-sunk); }
```

- [ ] **Step 4: Static checks** (DOM module — no browser here)

Run: `node --check docs/assets/lib/modal.js`  → must parse.
Run: `node --test tests/lib.test.mjs`  → suite stays green.
Confirm `normalizeTag` is a real export of `lib/tags.js` (it is, from Task 1).
Mark the interactive behavior PENDING MANUAL QA (open the editor: chips render, ✕ removes, Enter/`,` adds, Done returns the list, Cancel/Esc returns null).

- [ ] **Step 5: Commit**

```bash
git add docs/assets/lib/modal.js docs/assets/style.css
git commit -m "feat(modal): askTags tag-editor dialog"
```

---

### Task 3: Checklist integration — chips, editor, filter, toolbar pill

**Files:**
- Modify: `docs/assets/checklist-page.js` (imports, store wrappers, `checkItemHTML`, `wireChecklist`, `renderChecklist`, `renderCheckTools`, `captureCheckFocus`)
- Modify: `docs/assets/style.css` (append chip / ci-tag / toolbar-pill styles)

**Interfaces:**
- Consumes: `tagsFor`, `allTags`, `setTags`, `tagHue` (Task 1); `askTags` (Task 2); `KEYS.tags`, `get`, `set` (store); existing `$`, `$$`, `esc`.
- Produces: the rendered tag chips (`.chip-tag[data-tagfilter]`), the editor button (`.ci-tag[data-tagbtn]`), the active-tag toolbar pill (`[data-cleartag]`), and the module-local `tagFilter` view state.

- [ ] **Step 1: Add imports.** At the top of `docs/assets/checklist-page.js`:
  - On the modal import line, add `askTags`:
    ```js
    import { askDate, askTags, alertModal, confirmModal } from './lib/modal.js';
    ```
  - Add a new import line (next to the other `./lib/*` imports):
    ```js
    import { tagsFor, allTags, setTags, tagHue } from './lib/tags.js';
    ```

- [ ] **Step 2: Add store wrappers + filter state.** Near the other check store wrappers (e.g. just after `function loadDue() { return get(KEYS.due, {}) || {}; }`), add:

```js
function loadTags() { return get(KEYS.tags, {}) || {}; }
function saveTags(m) { set(KEYS.tags, m); }
let tagFilter = '';   // one active tag filter (view-only; never mutates data or progress, AND with smart view/search)
```

- [ ] **Step 3: Render chips + the 🏷 button in `checkItemHTML`.** Inside `checkItemHTML`, add — just before the final `return \``:

```js
  const tagBtns = (opts.tags ? tagsFor(opts.tags, id) : [])
    .map(t => `<button type="button" class="chip-tag" data-tagfilter="${esc(t)}" style="--h:${tagHue(t)}" title="Filter by ${esc(t)}">${esc(t)}</button>`)
    .join('');
  const tagsBlock = tagBtns ? `<span class="ci-tags">${tagBtns}</span>` : '';
```

Then change the markup so the chips render as a SIBLING of the `<label>` (NOT inside it — a `<button>` inside a `<label for>` is invalid HTML), and add the editor button after `.ci-due`. Find:

```js
      </label>
      <button type="button" class="ci-flag${lvl ? ' on p' + lvl : ''}" data-flag="${esc(id)}" aria-label="${lvl ? 'Priority P' + lvl + ' — press to set ' + nextLbl : 'Set priority — press to set P1'}" title="Priority — P1 (urgent) → P4, press to cycle">⚑<sub class="ci-flvl" aria-hidden="true">${lvl || ''}</sub></button>
      <button type="button" class="ci-due" data-due="${esc(id)}" title="Set a due date" aria-label="Set due date">📅</button>
      ${del}
    </li>`;
```

Replace with:

```js
      </label>
      ${tagsBlock}
      <button type="button" class="ci-flag${lvl ? ' on p' + lvl : ''}" data-flag="${esc(id)}" aria-label="${lvl ? 'Priority P' + lvl + ' — press to set ' + nextLbl : 'Set priority — press to set P1'}" title="Priority — P1 (urgent) → P4, press to cycle">⚑<sub class="ci-flvl" aria-hidden="true">${lvl || ''}</sub></button>
      <button type="button" class="ci-due" data-due="${esc(id)}" title="Set a due date" aria-label="Set due date">📅</button>
      <button type="button" class="ci-tag" data-tagbtn="${esc(id)}" title="Edit tags" aria-label="Edit tags for ${esc(it.task)}">🏷</button>
      ${del}
    </li>`;
```

- [ ] **Step 4: Pass the tags map into every `checkItemHTML` call.** In `renderChecklist`, add `const tags = loadTags();` right after `const hd = hideDone();`. Then add `tags` to the three `opts` objects:
  - The smart-view `renderRow`:
    ```js
    const renderRow = it => checkItemHTML(it, state, due, now, knownIds, { prio, showPhase: true, tags });
    ```
  - The grouped-phase map (inside the `phases.map`): change `{ prio, drag }` → `{ prio, drag, tags }`.
  - The "My tasks" map: change `{ prio, drag }` → `{ prio, drag, tags }`.

- [ ] **Step 5: Apply the tag filter in `renderChecklist`.** Still in `renderChecklist`, after `const match = it => ...` add:

```js
  const tagActive = !!tagFilter;
  const matchTag = it => !tagActive || tagsFor(tags, it.id).includes(tagFilter);
```

Then narrow each item pipeline:
  - **Smart view** — change:
    ```js
    const undone = checklistItems(DATA).filter(it => !state[it.id] && !(it.requires || []).some(r => knownIds.has(r) && !state[r]));
    ```
    to:
    ```js
    const undone = checklistItems(DATA).filter(it => !state[it.id] && !(it.requires || []).some(r => knownIds.has(r) && !state[r])).filter(matchTag);
    ```
  - **Grouped phase view** — change `.filter(it => !(hd && state[it.id])).filter(match);` to `.filter(it => !(hd && state[it.id])).filter(match).filter(matchTag);`
  - **"My tasks"** — change `.filter(it => !(hd && state[it.id])).filter(match);` to `.filter(it => !(hd && state[it.id])).filter(match).filter(matchTag);`

  Then disable drag/dnd while filtering by tag (reordering a filtered list is meaningless):
  - Change `const drag = !hd && !searching;` → `const drag = !hd && !searching && !tagActive;`
  - Change the dnd guard `if (view === 'all' && !hd && !searching) {` → `if (view === 'all' && !hd && !searching && !tagActive) {`

- [ ] **Step 6: Tag-aware empty states.** In the grouped (`else`/`view==='all'`) branch, replace the final `wrap.innerHTML = (searching && !html) ? ... : html;` block with:

```js
    wrap.innerHTML = (!html && (searching || tagActive))
      ? `<div class="empty list-empty">No ${searching
            ? `matches for “${esc(checkSearchQ)}”`
            : `tasks tagged “${esc(tagFilter)}”`}.${searching
            ? `<br><button type="button" class="list-empty-add" id="checkEmptyAdd">＋ Add “<span class="lea-q">${esc(checkSearchQ)}</span>”</button>`
            : ''}</div>`
      : html;
```

  And in the smart-view empty branch, make the subline tag-aware. Change:
```js
      wrap.innerHTML = `<div class="empty empty-state"><div class="empty-emoji" aria-hidden="true">${e[0]}</div><p class="empty-h">${esc(e[1])}</p><p class="empty-sub">${esc(e[2])}</p></div>`;
```
  to:
```js
      const sub = tagActive ? `No “${esc(tagFilter)}” tasks in this view.` : esc(e[2]);
      wrap.innerHTML = `<div class="empty empty-state"><div class="empty-emoji" aria-hidden="true">${e[0]}</div><p class="empty-h">${esc(e[1])}</p><p class="empty-sub">${sub}</p></div>`;
```

- [ ] **Step 7: Wire chip-filter + editor in `wireChecklist`.** In `wireChecklist`, just before the final `wireReset();` call, add:

```js
  $$('#checkPhases .chip-tag').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();                                   // chips are not in a label, but be safe
    const t = btn.dataset.tagfilter || '';
    tagFilter = (tagFilter === t) ? '' : t;               // click the active tag again to clear
    renderCheckTools();                                   // refresh the active-tag pill
    renderChecklist();                                    // view-only re-render (no jwh:data-changed)
  }));
  $$('#checkPhases .ci-tag').forEach(btn => btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const id = btn.dataset.tagbtn;
    const label = btn.closest('.check-item')?.querySelector('input[type=checkbox]')?.getAttribute('aria-label') || '';
    const map = loadTags();
    const res = await askTags(label, tagsFor(map, id), allTags(map));
    if (res === null) return;                             // cancelled
    saveTags(setTags(map, id, res));                      // mutation → save + dispatch
    renderChecklist();
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  }));
```

- [ ] **Step 8: Restore focus to the 🏷 button across rebuilds.** In `captureCheckFocus`, after the `if (a.dataset.due) ...` line, add:

```js
  if (a.dataset.tagbtn) return `.ci-tag[data-tagbtn="${esc2(a.dataset.tagbtn)}"]`;
```

- [ ] **Step 9: Add the active-tag pill to the toolbar.** In `renderCheckTools`, change the `el.innerHTML = \`...\`;` template so it appends a tag pill after the Hide-done button. Replace:

```js
    <button type="button" class="ct-toggle ${hd ? 'on' : ''}" data-hidedone aria-pressed="${hd}">${hd ? '☑' : '☐'} Hide done</button>`;
```
with:
```js
    <button type="button" class="ct-toggle ${hd ? 'on' : ''}" data-hidedone aria-pressed="${hd}">${hd ? '☑' : '☐'} Hide done</button>
    ${tagFilter ? `<button type="button" class="ct-tagpill" data-cleartag style="--h:${tagHue(tagFilter)}" aria-label="Clear tag filter ${esc(tagFilter)}" title="Clear tag filter">🏷 ${esc(tagFilter)} <span aria-hidden="true">✕</span></button>` : ''}`;
```

  Then wire its click — after the existing `el.querySelector('[data-hidedone]')?.addEventListener(...)` line, add:
```js
  el.querySelector('[data-cleartag]')?.addEventListener('click', () => { tagFilter = ''; renderCheckTools(); renderChecklist(); });
```

- [ ] **Step 10: Append chip / button / pill styles** to the END of `docs/assets/style.css`:

```css
/* ---- task tags: row chips, editor button, active-filter pill ---- */
.ci-tags{ display:inline-flex; flex-wrap:wrap; gap:.25rem; align-items:center; align-self:center; margin-right:.15rem; }
.chip-tag{ font-family:var(--mono); font-size:.64rem; font-weight:700; line-height:1; padding:.2rem .45rem; border-radius:999px; cursor:pointer; white-space:nowrap;
  color: hsl(var(--h,210) 65% 28%); background: hsl(var(--h,210) 70% 93%); border:1px solid hsl(var(--h,210) 50% 70%); }
.chip-tag::before{ content:"#"; opacity:.55; }
.chip-tag:hover{ filter:brightness(.97); }
.chip-tag:focus-visible{ outline:2px solid var(--indigo); outline-offset:1px; }
[data-theme="dark"] .chip-tag{ color: hsl(var(--h,210) 85% 82%); background: hsl(var(--h,210) 35% 24%); border-color: hsl(var(--h,210) 35% 42%); }
.ci-tag{ background:none; border:none; cursor:pointer; font-size:.82rem; opacity:.5; padding:.1rem .3rem; }
.ci-tag:hover{ opacity:1; }
.ci-tag:focus-visible{ outline:2px solid var(--indigo); outline-offset:2px; border-radius:var(--r-xs); }
.ct-tagpill{ font-family:var(--mono); font-size:.72rem; font-weight:700; cursor:pointer; padding:.25rem .6rem; border-radius:999px; white-space:nowrap;
  color: hsl(var(--h,210) 65% 28%); background: hsl(var(--h,210) 70% 93%); border:1px solid hsl(var(--h,210) 50% 65%); }
.ct-tagpill:hover{ filter:brightness(.97); }
[data-theme="dark"] .ct-tagpill{ color: hsl(var(--h,210) 85% 82%); background: hsl(var(--h,210) 35% 24%); border-color: hsl(var(--h,210) 35% 42%); }
```

- [ ] **Step 11: Static checks**

Run: `node --check docs/assets/checklist-page.js`  → must parse.
Run: `node --test tests/lib.test.mjs`  → suite stays green.
Confirm by reading the diff: the 🏷 button (`data-tagbtn`) and chips (`data-tagfilter`) are OUTSIDE the `<label class="ci-body">` (chips in the sibling `.ci-tags`); `tagFilter` mutations call only `renderCheckTools()`+`renderChecklist()` (NO `jwh:data-changed`); the tag-editor path DOES `saveTags(...)` + dispatch.
Mark interactive behavior PENDING MANUAL QA: tag a task via 🏷, see a colored chip; click the chip → list filters to that tag + a pill appears in the toolbar; click the pill ✕ or the chip again → filter clears; combine a tag filter with a smart view (Today) and Hide-done; keyboard focus returns to 🏷 after editing. No console errors.

- [ ] **Step 12: Commit**

```bash
git add docs/assets/checklist-page.js docs/assets/style.css
git commit -m "feat(checklist): free-form tag chips, editor, and tag filter"
```

---

### Task 4: Service-worker bump

**Files:**
- Modify: `docs/sw.js`

- [ ] **Step 1: Bump the cache version.** In `docs/sw.js`, change `const CACHE = 'jwh-v109';` → `const CACHE = 'jwh-v110';`

- [ ] **Step 2: Add the new module to `ASSETS`.** On the `assets/lib/…` line (the one that now ends with `'assets/lib/minical.js',` after Plan 1), append `'assets/lib/tags.js',`.

- [ ] **Step 3: Verify.** Run `node --check docs/sw.js` → parses. Re-read `docs/sw.js`: `CACHE` is `'jwh-v110'`; `'assets/lib/tags.js'` appears exactly once; no other lines changed. Run `node --test tests/lib.test.mjs` → green. Mark browser clean-reload PENDING MANUAL QA (no 404 for `assets/lib/tags.js`).

- [ ] **Step 4: Commit**

```bash
git add docs/sw.js
git commit -m "chore(sw): cache lib/tags.js, bump to jwh-v110"
```

---

## Self-Review

**Spec coverage (Plan 2 = WS1 "Free-form task labels"):**
- `jwh-tags-v1: { [taskId]: string[] }` store, `KEYS.tags` → Task 1. ✓
- Pure `lib/tags.js` (`normalizeTag`/`addTag`/`removeTag`/`setTags`/`tagsFor`/`allTags`/`tagHue`), unit-tested → Task 1. ✓
- Chips after kind/due/phase tags, colored by stable hue → Task 3 (chips render in `.ci-tags`, `--h` from `tagHue`). ✓
- 🏷 per-row button (sibling of 📅/⚑) opening an editor with a `datalist` of `allTags`, chips removable → Tasks 2 + 3. ✓
- One active tag filter, AND within the current smart view; toolbar "🏷 tag ✕" pill to clear → Task 3. ✓
- Tags attach to baked AND custom items (the store is id-keyed; `checkItemHTML` renders for every item) → Task 3. ✓
- `esc()` on every tag string; inputs use `.value` only → Tasks 2, 3. ✓
- Filter never mutates data/progress/dispatch; editing does save + dispatch → Task 3 Step 11 verifies. ✓
- SW `CACHE` v109→v110 + `lib/tags.js` precached → Task 4. ✓
- *Deferred (correctly out of scope):* tag chips on the dashboard/other surfaces (not requested); tag rename/merge management (YAGNI).

**Placeholder scan:** none — every code/CSS/command step is concrete.

**Type consistency:** `tagsFor(map,id)→string[]`, `allTags(map)→string[]`, `setTags(map,id,arr)→map`, `tagHue(tag)→number`, `normalizeTag(s)→string` are defined in Task 1 and consumed identically in Tasks 2–3. `askTags(taskLabel,current,all)→Promise<string[]|null>` defined in Task 2, called with `(label, tagsFor(map,id), allTags(map))` and the `null` (cancel) vs array (commit) contract honored in Task 3 Step 7. `tagFilter` (module-local string) is read in `renderChecklist`/`renderCheckTools`/`checkItemHTML`-callers and written only in the two `wireChecklist` handlers + the `data-cleartag` handler. `data-tagbtn`/`data-tagfilter`/`data-cleartag`/`--h` selectors match between the markup (Task 3 Steps 3, 9) and the wiring (Steps 7, 9) and CSS (Step 10).

**Known risk flagged for review:** chip color contrast. The light-theme chip uses `hsl(h 65% 28%)` text on `hsl(h 70% 93%)` background and dark uses `hsl(h 85% 82%)` on `hsl(h 35% 24%)` — chosen for a wide AA margin across all hues, but the reviewer/manual-QA should spot-check a few hues (e.g. yellow ~55, cyan ~190) in both themes against WCAG AA 4.5:1.
