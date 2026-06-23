# Japanese Tooling Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the Japanese integration — Anki round-trip (export/import), a first-class dictionary search box, on-demand translation (a tool + per-card) — keeping zero-build / all-local / offline-first.

**Architecture:** New pure, unit-tested libs (`lib/anki.js`, `lib/translate.js`, `lib/userphrases.js`) + one thin I/O client (`lib/ankiconnect.js`); a small `lookupWord` extracted from `lang.js` so hover + search share one dictionary path. Five features layer on `#/phrases` (a compact "Japanese tools" toolbar) and the content cards, each independently shippable. External APIs are keyless (Jotoba, MyMemory) or localhost (AnkiConnect); every external/imported string renders through `esc()`.

**Tech Stack:** Vanilla ES modules, `node --test` (zero-dep), localStorage, `fetch`. No build, no new script CDNs.

**Spec:** `docs/superpowers/specs/2026-06-23-japanese-tooling-round2-design.md`

**Run/verify:** `node --test tests/*.mjs` from repo root · serve `cd docs && python3 -m http.server 8000` · auth seed `localStorage['jwh-auth-v1']='ok'` (raw) · cache-bust `?v=N`.

---

## File Structure

- **Create:** `docs/assets/lib/translate.js`, `docs/assets/lib/anki.js`, `docs/assets/lib/userphrases.js`, `docs/assets/lib/ankiconnect.js`, `docs/assets/cardtranslate.js` · tests `tests/translate.test.mjs`, `tests/anki.test.mjs`, `tests/userphrases.test.mjs`.
- **Modify:** `docs/assets/lib/store.js` (3 KEYS), `docs/assets/lang.js` (extract `lookupWord`), `docs/assets/phrases.js` (toolbar + export/import/lookup/translate + user-phrase merge), `docs/assets/content.js` (per-card 訳 trigger), `docs/index.html` (`#view-phrases` toolbar markup), `docs/assets/style.css` (toolbar/panels/translate/per-card), `docs/sw.js` (CACHE bump + precache new libs), `docs/assets/guide.js` (one AnkiConnect/CORS note — Phase 1).

---

# PHASE 0 — Shared libraries

### Task 0.1: Add the three new store KEYS

**Files:** Modify `docs/assets/lib/store.js:39-40`

- [ ] **Step 1:** After the `phraseFavView` line, add the keys:

```js
  phraseFav: 'jwh-phrasefav-v1',
  phraseFavView: 'jwh-phrase-favview-v1',
  userPhrases: 'jwh-phrases-user-v1',
  ankiDeck: 'jwh-anki-deck-v1',
  translateCache: 'jwh-translate-cache-v1',
```

- [ ] **Step 2:** Commit.
```bash
git add docs/assets/lib/store.js
git commit -m "feat: add KEYS for user phrases, anki deck, translation cache"
```

---

### Task 0.2: `lib/translate.js` (pure) + tests

**Files:** Create `docs/assets/lib/translate.js`, `tests/translate.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/translate.test.mjs`:

```js
'use strict';
// Unit tests for the pure MyMemory translation helpers. Run: node --test (zero deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateURL, parseTranslation, MAX_LEN } from '../docs/assets/lib/translate.js';

test('translateURL: builds a MyMemory URL with pipe langpair + encoding', () => {
  const u = translateURL('Where is the station?', 'en', 'ja');
  assert.match(u, /^https:\/\/api\.mymemory\.translated\.net\/get\?q=/);
  assert.match(u, /langpair=en\|ja$/);
  assert.match(u, /Where%20is%20the%20station%3F/);
});
test('translateURL: throws on empty, bad pair, same lang, over-length', () => {
  assert.throws(() => translateURL('', 'en', 'ja'));
  assert.throws(() => translateURL('hi', 'en', 'fr'));
  assert.throws(() => translateURL('hi', 'en', 'en'));
  assert.throws(() => translateURL('x'.repeat(MAX_LEN + 1), 'en', 'ja'));
});
test('parseTranslation: ok body → text + match', () => {
  const r = parseTranslation({ responseData: { translatedText: '駅はどこですか。', match: 0.9 }, responseStatus: 200 });
  assert.equal(r.text, '駅はどこですか。');
  assert.equal(r.warning, '');
});
test('parseTranslation: quota / non-200 / malformed → warning, no text', () => {
  assert.equal(parseTranslation({ responseData: { translatedText: 'x', quotaFinished: true }, responseStatus: 200 }).text, '');
  assert.equal(parseTranslation({ responseStatus: 403, responseDetails: 'MYMEMORY WARNING: DAILY LIMIT' }).text, '');
  assert.ok(parseTranslation({}).warning);
  assert.equal(parseTranslation({ responseData: { translatedText: 'ok' }, responseStatus: '200' }).text, 'ok'); // status may be a string
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found).
Run: `node --test tests/translate.test.mjs`

- [ ] **Step 3: Implement.** Create `docs/assets/lib/translate.js`:

```js
'use strict';
// Pure helpers for on-demand machine translation via MyMemory (keyless, CORS-enabled).
// The fetch lives in the feature modules; these are import-safe + unit-tested.
// Verified: GET ?q=&langpair=en|ja → responseData.translatedText + responseStatus 200;
// empty q → 403. MyMemory's anonymous per-request cap is ~500 chars.

const LANGS = new Set(['en', 'ja']);
export const MAX_LEN = 500;

export function translateURL(text, from, to) {
  const t = (text || '').trim();
  if (!t) throw new Error('translateURL: empty text');
  if (!LANGS.has(from) || !LANGS.has(to) || from === to) throw new Error('translateURL: bad language pair');
  if (t.length > MAX_LEN) throw new Error('translateURL: text exceeds ' + MAX_LEN);
  return `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${from}|${to}`;
}

export function parseTranslation(json) {
  const rd = json && json.responseData;
  const status = json && json.responseStatus;
  const details = (json && json.responseDetails) || '';
  if (!rd || Number(status) !== 200 || rd.quotaFinished === true || /quota|limit|exceed/i.test(String(details))) {
    return { text: '', match: 0, warning: String(details || 'translation unavailable') };
  }
  return { text: String(rd.translatedText || ''), match: Number(rd.match) || 0, warning: '' };
}
```

- [ ] **Step 4: Run — expect PASS.** `node --test tests/translate.test.mjs`
- [ ] **Step 5: Commit.**
```bash
git add docs/assets/lib/translate.js tests/translate.test.mjs
git commit -m "feat: lib/translate.js — pure MyMemory URL + response helpers"
```

---

### Task 0.3: `lib/anki.js` (pure) + tests

**Files:** Create `docs/assets/lib/anki.js`, `tests/anki.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/anki.test.mjs`:

```js
'use strict';
// Unit tests for the pure Anki round-trip helpers. Run: node --test (zero deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAnkiTSV, parseAnkiTSV, mapNoteFields, stripHtml } from '../docs/assets/lib/anki.js';

test('toAnkiTSV: front<TAB>back<TAB>tags, newline-joined, tabs/newlines flattened', () => {
  const tsv = toAnkiTSV([{ front: '水', back: 'mizu <br> water', tags: ['whv', 'Daily'] }, { front: 'a\tb', back: 'c\nd', tags: [] }]);
  const lines = tsv.split('\n');
  assert.equal(lines[0], '水\tmizu <br> water\twhv Daily');
  assert.equal(lines[1], 'a b\tc d\t');
});
test('parseAnkiTSV: skips #headers + blanks, needs a Front, reads tags col', () => {
  const rows = parseAnkiTSV('#separator:tab\n#html:true\n\n水\tmizu\twhv Daily\n\tonly-back\nfoo\tbar');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { front: '水', back: 'mizu', tags: ['whv', 'Daily'] });
  assert.deepEqual(rows[1], { front: 'foo', back: 'bar', tags: [] });
});
test('mapNoteFields: detects by name; falls back to positional', () => {
  assert.deepEqual(mapNoteFields([{ name: 'English' }, { name: 'Japanese' }, { name: 'Reading' }]), { jpIdx: 1, enIdx: 0, readIdx: 2 });
  assert.deepEqual(mapNoteFields([{ name: 'Front' }, { name: 'Back' }]), { jpIdx: 0, enIdx: 1, readIdx: 2 });
  assert.deepEqual(mapNoteFields(['v0', 'v1']), { jpIdx: 0, enIdx: 1, readIdx: 2 }); // no names → positional
});
test('stripHtml: removes markup (regex path when no DOMParser)', () => {
  assert.equal(stripHtml('mizu <br> <b>water</b>'), 'mizu water');
  assert.equal(stripHtml('<img src=x onerror=alert(1)>hi'), 'hi');
});
```

- [ ] **Step 2: Run — expect FAIL.** `node --test tests/anki.test.mjs`

- [ ] **Step 3: Implement.** Create `docs/assets/lib/anki.js`:

```js
'use strict';
// Pure helpers for the Anki round-trip (TSV export/import) + note-field mapping.
// stripHtml is the one DOM-touching function — for DISPLAY cleanliness, not security
// (esc() on render is the XSS boundary). Import-safe: stripHtml degrades when DOMParser absent.

function cell(s) { return String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim(); }

// rows: [{ front, back, tags:[] }] → "front<TAB>back<TAB>tag1 tag2" lines
export function toAnkiTSV(rows) {
  return (rows || []).map(r => [cell(r.front), cell(r.back), cell((r.tags || []).join(' '))].join('\t')).join('\n');
}

// tolerant parse of an Anki "Notes in Plain Text (.txt)" export → [{front, back, tags}]
export function parseAnkiTSV(text) {
  return String(text || '').split(/\r?\n/)
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const cols = line.split('\t');
      const tagCol = (cols[2] || '').trim();
      return { front: (cols[0] || '').trim(), back: (cols[1] || '').trim(), tags: tagCol ? tagCol.split(/\s+/) : [] };
    })
    .filter(r => r.front);
}

// which field index is jp / en / reading. fields: [{name?}] (live) or positional array (file).
const RE_JP = /front|expression|japanese|日本語|word|kanji/i;
const RE_EN = /back|meaning|english|英語|translation/i;
const RE_READ = /reading|kana|furigana|読み/i;
export function mapNoteFields(fields) {
  const named = (fields || []).map((f, i) => ({ i, name: (f && f.name) || '' }));
  const find = (re) => { const m = named.find(f => re.test(f.name)); return m ? m.i : -1; };
  let jpIdx = find(RE_JP), enIdx = find(RE_EN), readIdx = find(RE_READ);
  if (jpIdx < 0) jpIdx = 0;
  if (enIdx < 0) enIdx = (jpIdx === 1) ? 0 : 1;
  if (readIdx < 0) readIdx = 2;
  return { jpIdx, enIdx, readIdx };
}

// flatten Anki note HTML (<br>, ruby, cloze) → plain text. DOM-based; regex fallback in Node.
export function stripHtml(s) {
  const str = String(s ?? '');
  if (typeof DOMParser === 'undefined') return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const doc = new DOMParser().parseFromString('<body>' + str, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Run — expect PASS.** `node --test tests/anki.test.mjs`
- [ ] **Step 5: Commit.**
```bash
git add docs/assets/lib/anki.js tests/anki.test.mjs
git commit -m "feat: lib/anki.js — pure TSV export/import, field mapping, stripHtml"
```

---

### Task 0.4: `lib/userphrases.js` (pure) + tests

**Files:** Create `docs/assets/lib/userphrases.js`, `tests/userphrases.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/userphrases.test.mjs`:

```js
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userPhrase, addUserPhrases, removeUserPhrase } from '../docs/assets/lib/userphrases.js';

test('userPhrase: normalizes the shape with a passed-in id', () => {
  const p = userPhrase({ jp: '水', read: 'みず', en: 'water', cat: 'Saved', src: 'jisho' }, 'uph1');
  assert.deepEqual(p, { id: 'uph1', jp: '水', read: 'みず', en: 'water', cat: 'Saved', src: 'jisho', _user: true });
});
test('userPhrase: defaults cat to Imported, missing fields to empty', () => {
  const p = userPhrase({ jp: '駅' }, 'uph2');
  assert.equal(p.cat, 'Imported'); assert.equal(p.en, ''); assert.equal(p._user, true);
});
test('addUserPhrases / removeUserPhrase: immutable', () => {
  const a = [userPhrase({ jp: 'a' }, 'i1')];
  const b = addUserPhrases(a, [userPhrase({ jp: 'b' }, 'i2')]);
  assert.equal(a.length, 1); assert.equal(b.length, 2);
  const c = removeUserPhrase(b, 'i1');
  assert.equal(c.length, 1); assert.equal(c[0].id, 'i2'); assert.equal(b.length, 2);
});
```

- [ ] **Step 2: Run — expect FAIL.** `node --test tests/userphrases.test.mjs`

- [ ] **Step 3: Implement.** Create `docs/assets/lib/userphrases.js`:

```js
'use strict';
// Pure CRUD for user-imported / saved phrases (jwh-phrases-user-v1). Mirrors lib/places.js:
// the feature module assigns ids (no Date.now() in the pure lib).
//   A user phrase: { id, jp, read, en, cat, src, _user:true }

export function userPhrase({ jp = '', read = '', en = '', cat = 'Imported', src = '' } = {}, id) {
  return { id, jp: String(jp), read: String(read), en: String(en), cat: String(cat || 'Imported'), src: String(src), _user: true };
}
export function addUserPhrases(list, incoming) { return [...(list || []), ...(incoming || [])]; }
export function removeUserPhrase(list, id) { return (list || []).filter(p => p.id !== id); }
```

- [ ] **Step 4: Run — expect PASS.** `node --test tests/userphrases.test.mjs`
- [ ] **Step 5: Commit.**
```bash
git add docs/assets/lib/userphrases.js tests/userphrases.test.mjs
git commit -m "feat: lib/userphrases.js — pure CRUD for imported/saved phrases"
```

---

### Task 0.5: `lib/ankiconnect.js` (thin I/O client, no unit test)

**Files:** Create `docs/assets/lib/ankiconnect.js`

- [ ] **Step 1: Implement.** Create `docs/assets/lib/ankiconnect.js`:

```js
'use strict';
// Thin AnkiConnect client (localhost:8765). I/O only — exercised in-browser, not unit-tested.
// Works when the dashboard is served over http://localhost with Anki + the AnkiConnect add-on
// (this origin in its webCorsOriginList). Blocked on the HTTPS site (mixed content) — callers
// detect via isAvailable() and fall back to the TSV file path. READ/ADD actions only.

const ENDPOINT = 'http://127.0.0.1:8765';

export async function invoke(action, params = {}, { timeoutMs = 1500 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params }), signal: ctrl.signal,
    });
    const data = await r.json();
    if (data && data.error) throw new Error(data.error);
    return data ? data.result : null;
  } finally { clearTimeout(to); }
}

let _avail = null;
export async function isAvailable(force = false) {
  if (_avail !== null && !force) return _avail;
  try { await invoke('version'); _avail = true; } catch { _avail = false; }
  return _avail;
}
```

- [ ] **Step 2: Commit.**
```bash
git add docs/assets/lib/ankiconnect.js
git commit -m "feat: lib/ankiconnect.js — thin localhost AnkiConnect client (read/add only)"
```

---

### Task 0.6: Extract `lookupWord` from `lang.js`

**Files:** Modify `docs/assets/lang.js` (the `lookup` fn at ~112-132)

- [ ] **Step 1: Add the exported helper** above the existing `async function lookup`:

```js
// Shared dictionary lookup (the hover popover here + the Phrases search box both use this).
// Returns { reading, gloss } on a hit, null on no match; throws on network/abort — callers handle.
export async function lookupWord(word, { signal } = {}) {
  const r = await fetch('https://jotoba.de/api/search/words', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: word, language: 'English', no_english: false }), signal,
  });
  const data = r.ok ? await r.json() : null;
  const w = data && data.words && data.words[0];
  if (!w) return null;
  const reading = w.reading ? [w.reading.kana, w.reading.kanji].filter(Boolean).join(' · ') : '';
  const gloss = w.senses?.[0]?.glosses?.join(', ') || '';
  return (reading || gloss) ? { reading, gloss } : null;
}
```

- [ ] **Step 2: Refactor `lookup` to call it** (behavior-preserving). Replace the body of `async function lookup(word, p, el)` with:

```js
async function lookup(word, p, el) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    let res = null;
    try { res = await lookupWord(word, { signal: ctrl.signal }); } finally { clearTimeout(to); }
    if (lastWord !== word) return;
    if (res) { p.innerHTML = render(word, res.reading, res.gloss, false); position(p, el); }
    else { p.innerHTML = render(word, '', 'no dictionary match — open Jisho for details', false); }
  } catch {
    if (lastWord === word) p.innerHTML = render(word, '', 'lookup unavailable — open Jisho ↗', false);
  }
}
```

- [ ] **Step 3: Verify** the existing `lib.test.mjs` lang-parity test still passes (it reads i18n.js, not this) and the suite is green:
Run: `node --test tests/*.mjs` → Expected: all pass (no test count change yet beyond the 3 new files).

- [ ] **Step 4: Commit.**
```bash
git add docs/assets/lang.js
git commit -m "refactor: extract lookupWord from lang.js for reuse by the search box"
```

---

### Task 0.7: Precache new libs + SW bump

**Files:** Modify `docs/sw.js:5` and the `ASSETS` array

- [ ] **Step 1:** Bump `const CACHE = 'jwh-v84';` → `'jwh-v85'`.
- [ ] **Step 2:** Append to the `assets/lib/...` line of `ASSETS`:
```js
  'assets/lib/anki.js', 'assets/lib/ankiconnect.js', 'assets/lib/translate.js', 'assets/lib/userphrases.js',
```
- [ ] **Step 3: Commit.**
```bash
git add docs/sw.js
git commit -m "chore: sw v85 — precache anki/translate/userphrases libs"
```

**Phase 0 done when:** `node --test tests/*.mjs` green (3 new files, ~13 new tests).

---

# PHASE 1 — Anki export (phrases)

**Files:** Modify `docs/index.html` (`#view-phrases`), `docs/assets/phrases.js`, `docs/assets/style.css`, `docs/sw.js`, `docs/assets/guide.js`

### Task 1.1: Toolbar markup + "Japanese tools" row

- [ ] **Step 1:** In `docs/index.html`, inside `#view-phrases`, immediately above `#phraseList`, insert the tools toolbar (the Look-up/Translate panels are filled in later phases — Phase 1 only wires Anki):

```html
<div class="jtools" role="group" aria-label="Japanese tools">
  <button type="button" class="jt-btn" id="jtLookupBtn" aria-expanded="false" aria-controls="jtLookupPanel">🔍 Look up</button>
  <button type="button" class="jt-btn" id="jtTranslateBtn" aria-expanded="false" aria-controls="jtTranslatePanel">あ→A Translate</button>
  <div class="jt-anki">
    <button type="button" class="jt-btn" id="jtExport">⬇ Export to Anki</button>
    <button type="button" class="jt-btn" id="jtImport">⬆ Import from Anki</button>
    <label class="jt-scope"><input type="checkbox" id="jtFavScope"> ★ only</label>
  </div>
</div>
<div class="jt-panel" id="jtLookupPanel" hidden></div>
<div class="jt-panel" id="jtTranslatePanel" hidden></div>
```

- [ ] **Step 2:** Add minimal CSS to `docs/assets/style.css`:

```css
.jtools{ display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin:.6rem 0 .9rem; }
.jt-btn{ font:inherit; padding:.4rem .7rem; border:1px solid var(--line); border-radius:999px; background:var(--bg-soft); color:var(--ink); cursor:pointer; }
.jt-btn:hover{ border-color:var(--indigo); }
.jt-anki{ display:flex; gap:.5rem; align-items:center; margin-inline-start:auto; }
.jt-scope{ display:inline-flex; gap:.3rem; align-items:center; font-size:.85rem; color:var(--ink-soft); }
.jt-panel{ margin:0 0 .9rem; padding:.7rem; border:1px solid var(--line); border-radius:.6rem; background:var(--bg-soft); }
```

- [ ] **Step 3: Commit.** `git add docs/index.html docs/assets/style.css && git commit -m "feat: phrases page Japanese-tools toolbar shell"`

### Task 1.2: Export logic (AnkiConnect → TSV fallback)

- [ ] **Step 1:** In `docs/assets/phrases.js`, add imports at the top:

```js
import { toAnkiTSV } from './lib/anki.js';
import { isAvailable, invoke } from './lib/ankiconnect.js';
import { alertModal, confirmModal, showModal } from './lib/modal.js';
```
(Result notices use `alertModal`. `celebrate(msg)` from `celebrate.js` is the confetti/toast — overkill here; `alertModal` is correct.)

- [ ] **Step 2:** Add the export builder + handler:

```js
function exportRows(favScope) {
  const favs = loadFavs();
  const src = favScope ? bakedPhrases().filter(p => favs[p.id]) : bakedPhrases();
  // also include user phrases (imported/saved) so a round-trip keeps them
  const users = get(KEYS.userPhrases, []) || [];
  const all = [...src, ...(favScope ? users.filter(p => favs[p.id]) : users)];
  return all.map(p => ({ front: p.jp, back: [p.read, p.en].filter(Boolean).join(' <br> '), tags: ['whv', p.cat || 'Phrase'] }));
}

async function doExport() {
  const favScope = $('#jtFavScope')?.checked;
  const rows = exportRows(favScope);
  if (!rows.length) { alertModal('No phrases to export.'); return; }
  const deck = getRaw(KEYS.ankiDeck, 'Japan WHV');
  if (await isAvailable()) {
    try {
      await invoke('createDeck', { deck });
      const notes = rows.map(r => ({ deckName: deck, modelName: 'Basic', fields: { Front: r.front, Back: r.back }, tags: r.tags, options: { allowDuplicate: false } }));
      const can = await invoke('canAddNotes', { notes });
      const res = await invoke('addNotes', { notes });
      const added = (res || []).filter(x => x != null).length;
      const skipped = notes.length - (can || []).filter(Boolean).length;
      alertModal(`Added ${added} to “${deck}”${skipped ? ` (${skipped} duplicates skipped)` : ''}.`);
      return;
    } catch (e) { /* fall through to file */ }
  }
  // fallback: download a TSV
  const blob = new Blob([toAnkiTSV(rows)], { type: 'text/tab-separated-values' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'japan-phrases.txt';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  alertModal('Anki not detected — downloaded japan-phrases.txt. In Anki: File → Import.');
}
```

- [ ] **Step 3:** Import `alertModal` + `getRaw` if not already: ensure `import { alertModal } from './lib/modal.js';` and that `getRaw` is in the store import.

- [ ] **Step 4:** Wire the button in `wireControls()`:

```js
  $('#jtExport')?.addEventListener('click', doExport);
```

- [ ] **Step 5: Browser-verify.** Serve, seed auth, `#/phrases`, click Export (no Anki) → downloads `japan-phrases.txt`; open it → tab-separated, JP<TAB>reading <br> EN<TAB>tags. 0 console errors.
- [ ] **Step 6:** Bump `sw.js` CACHE → `jwh-v86`. Commit.
```bash
git add docs/assets/phrases.js docs/sw.js
git commit -m "feat: export phrases to Anki (AnkiConnect addNotes, TSV download fallback)"
```

### Task 1.3: Guide note (AnkiConnect setup + CORS caveat)

- [ ] **Step 1:** In `docs/assets/guide.js`, add one short line to the tutorial/help content: *"Anki sync: works when you run this dashboard locally (http://localhost) with Anki + the AnkiConnect add-on open, and add that origin to AnkiConnect's webCorsOriginList. That list is per-origin (all-or-nothing) — only add origins you trust. On the live site, Export/Import fall back to a file."*
- [ ] **Step 2:** Bump SW if guide.js precached (it is loaded; check ASSETS — guide.js not in precache list, so no bump needed unless added). Commit.
```bash
git add docs/assets/guide.js
git commit -m "docs: guide note for AnkiConnect setup + CORS caveat"
```

---

# PHASE 2 — Anki import → user phrases

**Files:** Modify `docs/assets/phrases.js`, `docs/assets/style.css`, `docs/sw.js`

### Task 2.1: Render baked + user phrases (merge)

- [ ] **Step 1:** In `phrases.js`, add imports: `import { userPhrase, addUserPhrases, removeUserPhrase } from './lib/userphrases.js';` and `import { stripHtml, parseAnkiTSV, mapNoteFields } from './lib/anki.js';`
- [ ] **Step 2:** Add loaders:
```js
function loadUser() { return get(KEYS.userPhrases, []) || []; }
function saveUser(list) { set(KEYS.userPhrases, list); }
```
- [ ] **Step 3:** Change `render()` to merge user phrases into the list it groups. Where it currently does `const all = bakedPhrases();`, make it:
```js
  const all = [...bakedPhrases(), ...loadUser()];
```
- [ ] **Step 4:** In `rowHTML(p, favs)`, add a delete affordance for user rows only (after the fav button), and a "mine" marker:
```js
  const mine = p._user
    ? `<button type="button" class="phrase-del" data-del="${esc(p.id)}" aria-label="Remove ${esc(p.en || p.jp)}">✕</button>`
    : '';
```
Insert `${mine}` after the `phrase-fav` button, and add `<span class="phrase-mine" aria-label="your phrase" title="yours">★</span>` inside `.phrase-main` when `p._user` (esc-safe, static marker).

- [ ] **Step 5:** In `wireRows()`, wire delete:
```js
  $$('#phraseList .phrase-del').forEach(b => b.addEventListener('click', () => {
    saveUser(removeUserPhrase(loadUser(), b.dataset.del)); render();
  }));
```
- [ ] **Step 6:** CSS for `.phrase-del`/`.phrase-mine` (mirror `.check-del`). Commit.
```bash
git add docs/assets/phrases.js docs/assets/style.css
git commit -m "feat: phrasebook renders user phrases (mine badge + delete) alongside baked"
```

### Task 2.2: Import (AnkiConnect deck picker → file fallback) with field mapping + swap

- [ ] **Step 1:** Add a hidden file input to `#view-phrases` markup (index.html), after the toolbar:
```html
<input type="file" id="jtImportFile" accept=".txt,.tsv,.csv" hidden>
```
- [ ] **Step 2:** Add import handlers to `phrases.js`:
```js
const MAX_IMPORT = 1000;

function commitImport(rows, srcLabel) {           // rows: [{jp, en, read}]
  if (!rows.length) { alertModal('Nothing to import.'); return; }
  let r = rows;
  if (r.length > MAX_IMPORT) { r = r.slice(0, MAX_IMPORT); alertModal(`Imported ${MAX_IMPORT} of ${rows.length} — the rest were skipped.`); }
  const base = Date.now();
  const list = r.map((x, i) => userPhrase({ jp: stripHtml(x.jp), read: stripHtml(x.read || ''), en: stripHtml(x.en), cat: 'Imported', src: srcLabel }, 'uph' + (base + i)));
  saveUser(addUserPhrases(loadUser(), list)); render();
}

// confirm jp/en orientation before committing. confirmModal resolves true(ok)/false(cancel|dismiss)
// and esc()s its own message — pass RAW text, don't pre-esc. Frame so DISMISS is safe: dismiss==false
// keeps the auto-detected orientation (never a silent swap); only an explicit "Swap" inverts.
async function importWithPreview(rows, srcLabel) {        // rows already mapped to {jp,en,read}
  const sample = rows.find(x => x.jp || x.en) || rows[0] || { jp: '', en: '' };
  const swap = await confirmModal(
    `Import ${rows.length} phrase(s). Detected Front → Japanese 「${sample.jp}」, Back → English 「${sample.en}」. Swap front/back?`,
    { ok: 'Swap', cancel: 'Looks right' });
  const final = swap ? rows.map(x => ({ jp: x.en, en: x.jp, read: x.read })) : rows;
  commitImport(final, srcLabel);
}
```
> Import always proceeds (the user explicitly chose a file/deck); the modal only chooses orientation. A wrong guess is one-click deletable (user rows have ✕). This avoids the dismiss-ambiguity of a 3-way prompt.

- [ ] **Step 3:** File path:
```js
function doImportFile() {
  const inp = $('#jtImportFile'); if (!inp) return;
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const parsed = parseAnkiTSV(String(rd.result || ''));   // [{front, back, tags}]
      const m = mapNoteFields(parsed[0] ? [{}, {}, {}] : []);  // file = no names → positional 0/1/2
      const rows = parsed.map(p => ({ jp: [p.front, p.back][m.jpIdx] ?? p.front, en: [p.front, p.back][m.enIdx] ?? p.back, read: '' }));
      importWithPreview(rows, 'anki-file');
      inp.value = '';
    };
    rd.readAsText(f);
  };
  inp.click();
}
```
- [ ] **Step 4:** Live path:
```js
// deck picker built on showModal: render a button per deck; resolve the chosen name. showModal
// shows trustedHTML (deck names are AnkiConnect-provided; esc() each anyway) + a Close.
function pickFromList(items) {
  return new Promise(resolve => {
    const list = (items || []).map(d => `<button type="button" class="am-btn jt-deck" data-deck="${esc(d)}">${esc(d)}</button>`).join('');
    showModal('Pick a deck to import', `<div class="jt-decks">${list || 'No decks.'}</div>`, { closeLabel: 'Cancel' });
    // wire after mount: the .jt-deck buttons resolve + close the modal
    setTimeout(() => document.querySelectorAll('.jt-deck').forEach(b => b.addEventListener('click', () => {
      resolve(b.dataset.deck); document.querySelector('.app-modal-overlay .am-btn[data-close], .modal-close')?.click();
    })), 0);
  });
}
// NOTE: confirm showModal's actual close-control selector + whether it returns a promise during impl;
// if it manages its own lifecycle differently, adapt the resolve/close wiring (this is the
// localhost-only live path — lower stakes than the file path).

async function doImportLive() {
  const decks = await invoke('deckNames');
  const deck = await pickFromList(decks);     // small modal picker on showModal
  if (!deck) return;
  const ids = await invoke('findNotes', { query: `deck:"${deck}"` });
  const infos = await invoke('notesInfo', { notes: (ids || []).slice(0, MAX_IMPORT) });
  if (!infos || !infos.length) { alertModal('That deck has no notes.'); return; }
  const fieldOrder = Object.entries(infos[0].fields).sort((a, b) => a[1].order - b[1].order).map(([name]) => ({ name }));
  const m = mapNoteFields(fieldOrder);
  const valsOf = (note) => Object.entries(note.fields).sort((a, b) => a[1].order - b[1].order).map(([, v]) => v.value);
  const rows = infos.map(n => { const v = valsOf(n); return { jp: v[m.jpIdx] || '', en: v[m.enIdx] || '', read: v[m.readIdx] || '' }; });
  importWithPreview(rows, 'anki:' + deck);
}

async function doImport() { (await isAvailable()) ? doImportLive() : doImportFile(); }
```
- [ ] **Step 5:** Wire `$('#jtImport')?.addEventListener('click', doImport);` in `wireControls()`. Implement `pickFromList(items)` as a small modal (or reuse an existing list-picker in modal.js).
- [ ] **Step 6: Browser-verify.** Create a small `.txt` (`水<TAB>water`), Import (no Anki) → preview modal → confirm → row appears with ★ mine + ✕, survives reload, deletes. Swap path reverses jp/en. 0 console errors.
- [ ] **Step 7:** SW bump → `jwh-v87`. Commit.
```bash
git add docs/index.html docs/assets/phrases.js docs/sw.js
git commit -m "feat: import from Anki (deck picker / .txt) → user phrases, field-map + swap preview"
```

---

# PHASE 3 — Dictionary search box

**Files:** Modify `docs/assets/phrases.js`, `docs/assets/style.css`, `docs/sw.js`

### Task 3.1: Look-up panel

- [ ] **Step 1:** Import `import { lookupWord } from './lang.js';`
- [ ] **Step 2:** Add the panel toggle + search:
```js
let lookCtrl = null, lookTimer = null;
function wireLookup() {
  const btn = $('#jtLookupBtn'), panel = $('#jtLookupPanel');
  if (!btn || !panel || btn.dataset.wired) return; btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { panel.innerHTML = `<label class="jt-lk"><span class="sr-only">Look up a word</span><input type="search" id="jtLookInput" placeholder="Look up a word (日本語, or try English)"></label><div id="jtLookOut" class="jt-out" aria-live="polite"></div>`; $('#jtLookInput')?.focus(); wireLookInput(); }
  });
}
function wireLookInput() {
  const inp = $('#jtLookInput'); if (!inp) return;
  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    clearTimeout(lookTimer);
    if (q.length < 1) { $('#jtLookOut').innerHTML = ''; return; }
    lookTimer = setTimeout(() => runLookup(q), 250);
  });
}
async function runLookup(q) {
  const out = $('#jtLookOut'); if (!out) return;
  if (lookCtrl) lookCtrl.abort(); lookCtrl = new AbortController();
  out.innerHTML = '<span class="jt-load">looking up…</span>';
  const jisho = `https://jisho.org/search/${encodeURIComponent(q)}`;
  try {
    const res = await lookupWord(q, { signal: lookCtrl.signal });
    if (res) {
      out.innerHTML = `<div class="jt-res"><div class="jt-read">${esc(res.reading)}</div><div class="jt-mean">${esc(res.gloss)}</div>`
        + `<div class="jt-act"><button type="button" class="jt-save" data-jp="${esc(q)}" data-read="${esc(res.reading)}" data-en="${esc(res.gloss)}">★ Save to my phrases</button> <a href="${esc(jisho)}" target="_blank" rel="noopener noreferrer">Jisho ↗</a></div></div>`;
      wireSave();
    } else {
      out.innerHTML = `<div class="jt-res">No dictionary match. <a href="${esc(jisho)}" target="_blank" rel="noopener noreferrer">Open Jisho ↗</a></div>`;
    }
  } catch { out.innerHTML = `<div class="jt-res">Lookup unavailable. <a href="${esc(jisho)}" target="_blank" rel="noopener noreferrer">Open Jisho ↗</a></div>`; }
}
function wireSave() {
  $('#jtLookOut .jt-save')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    const p = userPhrase({ jp: b.dataset.jp, read: b.dataset.read, en: b.dataset.en, cat: 'Saved', src: 'jisho' }, 'uph' + Date.now());
    saveUser(addUserPhrases(loadUser(), [p])); render();
    b.textContent = '★ Saved'; b.disabled = true;
  });
}
```
- [ ] **Step 3:** Call `wireLookup();` from `mountPhrases()` (after `wireControls()`).
- [ ] **Step 4:** CSS for `.jt-lk input`/`.jt-out`/`.jt-res` (reuse paper styles). Every API field already `esc()`'d above.
- [ ] **Step 5: Browser-verify.** Open Look up, type 水 → reading + meaning + Save + Jisho; type "asdfqwer" → graceful Jisho fallback; Save → row appears under "Saved". 0 console errors.
- [ ] **Step 6:** SW bump → `jwh-v88`. Commit.
```bash
git add docs/assets/phrases.js docs/assets/style.css docs/sw.js
git commit -m "feat: dictionary search box on Phrases (Jotoba lookup, Jisho fallback, save)"
```

---

# PHASE 4 — Translate-any-text tool

**Files:** Modify `docs/assets/phrases.js`, `docs/assets/style.css`, `docs/sw.js`

### Task 4.1: Translate panel + cache

- [ ] **Step 1:** Imports: `import { translateURL, parseTranslation, MAX_LEN } from './lib/translate.js';`
- [ ] **Step 2:** Cache helpers (shared key, used by Phase 5 too):
```js
function tCacheGet(k) { const c = get(KEYS.translateCache, {}) || {}; return c[k]; }
function tCachePut(k, v) {
  const c = get(KEYS.translateCache, {}) || {};
  c[k] = v; const keys = Object.keys(c);
  if (keys.length > 20) delete c[keys[0]];   // simple FIFO/LRU trim to 20
  set(KEYS.translateCache, c);
}
export async function translate(text, from, to) {   // shared by cardtranslate.js (Phase 5)
  const key = `${from}|${to}|${text}`;
  const hit = tCacheGet(key); if (hit) return hit;
  const ctrl = new AbortController(); const to2 = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(translateURL(text, from, to), { signal: ctrl.signal });
    const out = parseTranslation(await r.json());
    if (out.text) tCachePut(key, out);
    return out;
  } finally { clearTimeout(to2); }
}
```
> If sharing across modules is awkward, put `translate`/cache in a tiny `lib/translatecache.js` instead and import from both `phrases.js` and `cardtranslate.js`. Decide during impl; keep one copy (DRY).

- [ ] **Step 3:** The panel:
```js
function wireTranslate() {
  const btn = $('#jtTranslateBtn'), panel = $('#jtTranslatePanel');
  if (!btn || !panel || btn.dataset.wired) return; btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    const open = panel.hidden; panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !panel.dataset.built) {
      panel.dataset.built = '1';
      panel.innerHTML = `<textarea id="jtTaIn" maxlength="${MAX_LEN}" rows="2" placeholder="Type English or Japanese…"></textarea>
        <div class="jt-trow"><button type="button" id="jtDir" class="jt-btn" data-dir="en-ja">EN → 日本語 ⇄</button>
        <button type="button" id="jtGo" class="jt-btn">Translate</button><span id="jtCount" class="jt-count">0/${MAX_LEN}</span></div>
        <div id="jtTaOut" class="jt-out" aria-live="polite"></div>
        <p class="jt-note">Translations are sent to MyMemory (a free service) — see their terms.</p>`;
      wireTranslateInner();
    }
  });
}
function wireTranslateInner() {
  const inp = $('#jtTaIn'), dir = $('#jtDir');
  inp?.addEventListener('input', () => { $('#jtCount').textContent = `${inp.value.length}/${MAX_LEN}`; });
  dir?.addEventListener('click', () => { const ej = dir.dataset.dir === 'en-ja'; dir.dataset.dir = ej ? 'ja-en' : 'en-ja'; dir.textContent = ej ? '日本語 → EN ⇄' : 'EN → 日本語 ⇄'; });
  $('#jtGo')?.addEventListener('click', async () => {
    const text = (inp.value || '').trim(); if (!text) return;
    const [from, to] = ($('#jtDir').dataset.dir === 'en-ja') ? ['en', 'ja'] : ['ja', 'en'];
    const out = $('#jtTaOut'); out.innerHTML = '<span class="jt-load">translating…</span>';
    try {
      const res = await translate(text, from, to);
      out.innerHTML = res.text
        ? `<div class="jt-res"><div class="jt-mean">${esc(res.text)}</div><div class="jt-act"><button type="button" id="jtCopy">Copy</button> <a href="https://jisho.org/search/${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Dictionary ↗</a></div></div>`
        : `<div class="jt-res">${esc(res.warning || 'translation unavailable')}</div>`;
      $('#jtCopy')?.addEventListener('click', () => navigator.clipboard?.writeText(res.text));
    } catch { out.innerHTML = `<div class="jt-res">Translation unavailable.</div>`; }
  });
}
```
- [ ] **Step 4:** Call `wireTranslate();` from `mountPhrases()`.
- [ ] **Step 5:** CSS for textarea/`.jt-trow`/`.jt-note`/`.jt-count`.
- [ ] **Step 6: Browser-verify.** Type "Where is the station?", Translate → 駅…; flip direction; char counter caps at 500; Copy works; the MyMemory note shows. 0 console errors.
- [ ] **Step 7:** SW bump → `jwh-v89`. Commit.
```bash
git add docs/assets/phrases.js docs/assets/style.css docs/sw.js
git commit -m "feat: translate-any-text tool (MyMemory, EN⇄JP, cache, 500-cap, disclosure)"
```

---

# PHASE 5 — On-demand per-card translation

**Files:** Create `docs/assets/cardtranslate.js`; Modify `docs/assets/content.js`, `docs/assets/style.css`, `docs/sw.js`

### Task 5.1: `cardtranslate.js`

- [ ] **Step 1:** Create `docs/assets/cardtranslate.js`:
```js
'use strict';
// On-demand per-card translation (訳). Explicit tap only — never bulk/auto, so a page of cards
// never fires N requests and the user's content leaves the device only when they ask.
// Splits name/detail into separate <=500-char MyMemory requests; truncates visibly past 500.
import { esc } from './lib/dom.js';
import { prefersReducedMotion } from './motion.js';
import { translate } from './phrases.js';   // shared cache+fetch (or lib/translatecache.js)
import { MAX_LEN } from './lib/translate.js';

async function tField(text) {
  const t = (text || '').trim(); if (!t) return '';
  const slice = t.slice(0, MAX_LEN);
  const res = await translate(slice, 'en', 'ja');
  return res.text ? esc(res.text) + (t.length > MAX_LEN ? ' <span class="ct-trunc">… (truncated)</span>' : '') : '';
}

export function attachCardTranslate(triggerEl, fields, mountEl) {
  if (!triggerEl || triggerEl.dataset.ctWired) return; triggerEl.dataset.ctWired = '1';
  triggerEl.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (mountEl.dataset.open === '1') { mountEl.hidden = true; mountEl.dataset.open = '0'; return; }
    mountEl.hidden = false; mountEl.dataset.open = '1';
    if (!mountEl.dataset.done) {
      mountEl.innerHTML = '<span class="ct-load">訳しています…</span>';
      try {
        const parts = await Promise.all((fields || []).filter(Boolean).map(tField));
        const html = parts.filter(Boolean).join('<br>');
        mountEl.innerHTML = (html || 'translation unavailable') + '<div class="ct-tag">machine translation · MyMemory</div>';
        mountEl.dataset.done = '1';
        if (!prefersReducedMotion()) mountEl.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      } catch { mountEl.innerHTML = 'translation unavailable'; }
    }
  });
}
```
> If importing `translate` from `phrases.js` creates a cycle (content.js ↔ phrases.js), move `translate`+cache into `lib/translatecache.js` (Phase 4 note) and import from there in both. Verify no cycle during impl.

- [ ] **Step 2:** In `content.js`, where a pillar/content card renders its body, add a trigger + mount once. Find the content-card template (the `.card2`/disclosure render) and append inside it:
```js
`<button type="button" class="ct-btn" aria-label="Translate to Japanese">訳</button><div class="ct-out" hidden></div>`
```
then after render, for each card wire it:
```js
import { attachCardTranslate } from './cardtranslate.js';
// after the cards innerHTML is set:
$$('#<cardsContainer> .card2').forEach(card => {
  const name = card.querySelector('.card2-title')?.textContent || '';
  const detail = card.querySelector('.card2-detail')?.textContent || '';
  const btn = card.querySelector('.ct-btn'), out = card.querySelector('.ct-out');
  if (btn && out) attachCardTranslate(btn, [name, detail], out);
});
```
> Use the ACTUAL container id + title/detail selectors present in content.js (inspect during impl). Start with ONE card grid (e.g. the music/geek pillar) to keep the change surgical; the helper is reusable for more later.

- [ ] **Step 3:** CSS for `.ct-btn`/`.ct-out`/`.ct-tag`/`.ct-trunc` (small, muted; honors reduce-motion via the global rule).
- [ ] **Step 4:** Add `cardtranslate.js` (+ `lib/translatecache.js` if created) to `sw.js` ASSETS; bump CACHE → `jwh-v90`.
- [ ] **Step 5: Browser-verify.** On a pillar card, tap 訳 → JP appears with the MyMemory tag; tap again → collapses; reopen → instant (cached); offline reopen still shows it. A very long detail shows "(truncated)". 0 console errors.
- [ ] **Step 6:** Commit.
```bash
git add docs/assets/cardtranslate.js docs/assets/content.js docs/assets/style.css docs/sw.js
git commit -m "feat: on-demand per-card translation (訳) — split requests, cached, disclosed"
```

---

## Final verification (after all phases)
- [ ] `node --test tests/*.mjs` → all green (3 new lib test files).
- [ ] Serve, hard-reload, walk all five features; 0 console errors.
- [ ] `python3 -m json.tool docs/data/tips.json > /dev/null` (unchanged, but confirm).
- [ ] Final code review (subagent) over the whole branch; then `superpowers:finishing-a-development-branch`.

## Self-review notes (author)
- Every spec §3.1–3.5 maps to a phase; §2 libs → Phase 0; §4/§4a (AnkiConnect detect→fallback, esc, privacy, caps) are baked into each handler above.
- Open impl decisions flagged inline (modal helper names, the `translate`/cache home to avoid a content↔phrases cycle, the exact content.js card selectors) — resolve by reading the real file, not guessing.
