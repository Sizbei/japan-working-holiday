# Japanese Tooling, Round 2 — Design Spec

**Date:** 2026-06-23 · **Status:** draft → AI review → user review → plan
**Touches:** `#/phrases` (most), content cards (`content.js`), `lang.js` (small extract), new `lib/*`
**Theme:** Deepen the Japanese integration the hover-dictionary started — round-trip with Anki, a first-class dictionary, on-demand translation — while honoring the app's zero-build / all-local / offline-first constraints.

## 0. Constraints recap (non-negotiable)
- **Zero-build, dependency-free, no new script CDNs.** Runtime `fetch` to keyless, CORS-enabled APIs is allowed — precedent: `lang.js` already calls the Jotoba dictionary API.
- **Public repo → no secret API keys.** Every external API used here is **keyless** (Jotoba, MyMemory) or **localhost** (AnkiConnect). No key is ever stored in the JS.
- **All state browser-local.** New data (imported phrases, translation cache, deck preference) lives in `localStorage` under `jwh-*` keys → auto-covered by `backup.js` (prefix-scan, verified).
- **Every dynamic string through `esc()`** before `innerHTML`; double-quoted attributes.
- **SW network-first;** bump `CACHE` + precache every new `assets/lib/*.js`.

## 1. The five features (independently shippable, ship in this order)

1. **Anki export** of phrases (live AnkiConnect, TSV fallback)
2. **Anki import** into a local "my phrases" store, rendered in the phrasebook
3. **Dictionary search box** on the Phrases page (reuses the Jotoba lookup)
4. **Translate-any-text** tool (MyMemory, on-demand)
5. **On-demand per-card translation** of researched content cards (MyMemory, cached)

Each is its own implementation phase with its own two-stage review + browser verify + commit. The umbrella stays one spec because the five share the small libs in §2 and a single page surface.

## 2. Shared libraries (pure + unit-tested unless noted)

- **`lib/anki.js`** (pure):
  - `toAnkiTSV(rows, opts)` → a TSV string. Each row → `Front<TAB>Back<TAB>Tags`. `opts.dir` (`'jp-en'` default | `'en-jp'`) chooses which side is Front. Back combines reading + meaning with ` <br> ` (Anki renders `<br>`). Tags space-joined. **No header line by default** (Anki imports cleanest without one); newline-`\n` separated. Escapes nothing HTML-wise but strips embedded tabs/newlines from fields (replace with space) so the TSV grid can't break.
  - `parseAnkiTSV(text)` → `[{ front, back, tags }]`. Tolerant: skips blank lines and Anki's `#`-prefixed header/comment lines (e.g. `#separator:tab`, `#html:true`); splits on TAB; trims; ignores rows with an empty Front. `tags` from a 3rd column if present (space-split), else `[]`.
  - `mapNoteFields(orderedFields)` → `{ jpIdx, enIdx, readIdx }` (pure): given an ordered list of `{name, value}` (live) or positional `[v0,v1,v2]` (file, names absent), return which index is Japanese / English / reading. Detect by name first (`/front|expression|japanese|日本語|word|kanji/i` → jp; `/back|meaning|english|英語|translation/i` → en; `/reading|kana|furigana|読み/i` → read); fall back to positional `0/1/2`. The caller renders the preview + swap from this.
  - `stripHtml(s)` → plain text via the DOM (`new DOMParser().parseFromString('<body>'+s, 'text/html').body.textContent`), NOT a regex. Used to flatten Anki note markup (`<br>`, ruby, cloze, styling) for clean storage. **Note:** this is for *display cleanliness*, not the security boundary — the security boundary is `esc()` on every render (verified: `esc` escapes `& < > "`, so even an un-stripped `<img onerror>` renders inert). `stripHtml` is the one DOM-touching function here, so it lives behind a tiny guard for the Node test (skip when `DOMParser` is undefined) and is exercised in the browser.
- **`lib/ankiconnect.js`** (thin, impure, NOT unit-tested — it is I/O):
  - `invoke(action, params, { timeoutMs = 1500 } = {})` → POSTs `{ action, version: 6, params }` to `http://127.0.0.1:8765`, `AbortController` timeout, returns `result` or throws on `error`/network/timeout.
  - `isAvailable()` → `invoke('version')` resolves truthy → `true`; any throw → `false`. Cached for the page session after first probe (re-probed on explicit user action, not memoized forever).
- **`lib/translate.js`** (pure):
  - `translateURL(text, from, to)` → MyMemory GET URL: `https://api.mymemory.translated.net/get?q=<enc>&langpair=<from>|<to>` (`from`/`to` ∈ `{en, ja}`). Throws on empty text, unsupported pair, or `text.length > 500` (MyMemory's anonymous per-request cap is ~500 chars — **verified** the happy path returns `responseData.translatedText` + `responseStatus:200`; empty `q` → `responseStatus:403`). Callers MUST keep each request ≤500 chars (see §3.5 splitting).
  - `parseTranslation(json)` → `{ text, match, warning }`. Reads `responseData.translatedText` (+ `.match`); sets `warning` (and `text:''`) when `responseStatus !== 200`, when `responseData.quotaFinished === true`, or when `responseDetails` mentions a quota/limit. No throw on a well-formed error body.
- **`lib/userphrases.js`** (pure CRUD over an array, mirrors `lib/places.js`):
  - `addUserPhrases(list, incoming)`, `removeUserPhrase(list, id)`, `userPhrase({jp, read, en, cat, src})` → normalized `{ id:'uph_'+..., jp, read, en, cat, src, _user:true }`. Pure (id passed in or derived from a provided counter/text — **no `Date.now()` inside the pure lib**; the caller supplies the id, like existing custom-item helpers).
- **`lang.js` extract:** pull the Jotoba fetch out of `lookup()` into an exported `lookupWord(word, { signal })` → `{ reading, gloss }|null`. `lang.js`'s hover and the new search box both call it. Behavior-preserving (same endpoint, same shape). The hover keeps its own popover/render; only the network call is shared.

## 3. Feature designs

### 3.0 Phrases-page layout (avoid the junk-drawer)
Four of the five surfaces land on `#/phrases`, so it gets a deliberate structure rather than a stack of loose controls: a single compact **"Japanese tools" toolbar row** (Look-up · Translate · Anki ▾) under the lede, where Look-up (§3.3) and Translate (§3.4) **open as collapsible `collapse.js` panels** (collapsed by default) and **Anki ▾** is a small menu holding Export / Import (§3.1–3.2). The existing Favorites/Collapse-all controls and the phrase list stay primary and immediately visible. The per-card translate (§3.5) is the only piece that lives off this page (on the content cards). This keeps the page list-first; the tools are present but quiet. (We keep all five features — the user asked for them — and ship them sequentially so each is independently reviewable.)

### 3.1 Anki export (phrases)
- **UI:** on `#/phrases`, a small control group near the existing "Favorites only" toggle: **`Export to Anki`** + a scope segmented control (`All` / `★ Favorites`). Honors the existing `favOnly()`.
- **Behavior:** build `rows` from the in-scope phrases (`{front: jp, back: read+' <br> '+en, tags:['whv', cat]}` via `toAnkiTSV` for the file path; the same row objects feed the live path).
  - **Live (AnkiConnect available):** `createDeck('Japan WHV')` (idempotent), then `addNotes` with `modelName:'Basic'`, `fields:{Front, Back}`, `tags`, `options:{allowDuplicate:false}`. Pre-check `canAddNotes` to count/report skips. Success toast: `Added N (M duplicates skipped)`.
  - **Fallback (unavailable):** download `japan-phrases.txt` (TSV from `toAnkiTSV`) via a Blob `<a download>` — exactly the `.ics`/backup pattern. A one-line hint: "Anki not detected — downloaded a file you can File → Import."
- **Deck name** persisted in `jwh-anki-deck-v1` (default `Japan WHV`), editable inline.

### 3.2 Anki import → "my phrases"
- **UI:** `Import from Anki` button on `#/phrases`.
  - **Live:** `deckNames` → a small picker modal (reuse `lib/modal.js`); on pick → `findNotes('deck:"<name>"')` → `notesInfo` → take the note's fields **in model field-order**.
  - **Fallback:** a file `<input type=file accept=".txt,.tsv,.csv">`; read text → `parseAnkiTSV` → `{front, back, tags}` rows.
  - **Field mapping (REQUIRED — fixes silent jp/en swap):** Anki field/column order is user-defined and NOT guaranteed Japanese-first, so we never blindly assume `field[0]=jp`. We (a) **auto-detect by field name** when present — map a field named like `Front|Expression|Japanese|日本語|Word|Kanji` → `jp`, `Back|Meaning|English|英語|Translation` → `en`, `Reading|Kana|Furigana|読み` → `read`; (b) when names are absent/ambiguous (the `.txt` path has no names), default `field[0]→jp, field[1]→en, field[2]→read` but show a **one-line preview with a "Swap front/back" toggle** ("Front → Japanese 「水」, Back → English 「water」 — looks right? ⇄ Swap") before committing. All field text run through `stripHtml` then stored.
  - Both paths → `addUserPhrases` (caller assigns ids) → save to **`jwh-phrases-user-v1`** → re-render.
- **Render merge:** `phrases.js` renders **baked** (`tips.json.phrases`, read-only) **+ user** (`jwh-phrases-user-v1`, deletable, `_user` badge "mine"), grouped by category (user-imported land under their own "Imported" category by default; favorites work on both via the existing `phraseFav` map keyed by id). Mirrors calendar baked+user and checklist baked+custom.
- **Safety:** imported note fields can contain Anki HTML (`<br>`, cloze, styling) → flatten via `stripHtml` (DOM `textContent`, §2) before store, so the phrasebook stores plain text and `esc()`-renders it (the real XSS boundary). **Hard cap MUST be enforced:** import at most **1000** notes; if the source exceeds it, import the first 1000 and surface a visible "imported 1000 of N — rest skipped" notice (no silent truncation). All `localStorage.setItem` writes here (and everywhere new in this spec) are wrapped in try/catch so a `QuotaExceededError` logs + shows a friendly message instead of bricking the page.

### 3.3 Dictionary search box
- **UI:** the **Look-up** panel of the §3.0 tools row: a labeled input "Look up a word (日本語, or try English)". A results area below it.
- **Behavior:** debounced (~250 ms), `AbortController`-cancel of the prior request, calls the shared `lookupWord(query)`. **Japanese-first**; English queries are **best-effort** — Jotoba does accept keyword queries, but we could not verify its English behavior live, so we never depend on it: if a query returns no words, we show the **Jisho ↗** deep-link (which reliably handles JP *and* EN) as the answer rather than a dead end. Renders reading + meaning(s) — **every field through `esc()`** (Jotoba output is third-party/untrusted, e.g. a poisoned gloss) — plus the Jisho link + a **`★ Save to my phrases`** action (→ `userPhrase` → `jwh-phrases-user-v1`, `cat:'Saved'`). Empty/too-short query clears results. Network fail → "lookup unavailable — open Jisho ↗" (same graceful copy as the hover).

### 3.4 Translate-any-text tool
- **UI:** the **Translate** panel of the §3.0 tools row (`collapse.js` accordion): a `<textarea>`, an **EN ⇄ JP** direction toggle, a **Translate** button, a result box with **Copy** + a **dictionary** deep-link for the result. A small persistent line discloses the third party: **"Translations are sent to MyMemory (a free service) — see their terms."**
- **Behavior:** on submit, `fetch(translateURL(text, from, to))` → `parseTranslation`. Show **`esc(result.text)`** (MyMemory echoes the query, so its output is untrusted → always `esc()`) or the `esc(warning)` (e.g. quota). `AbortController` + ~4 s timeout. Trims; ignores empty. **Hard input cap of 500 chars MUST be enforced** (matches MyMemory's anon per-request limit; `translateURL` throws above it) with a visible char counter. No auto-translate-on-type (explicit button → predictable, disclosed quota use).
- **Cache (small):** last ~20 translations in `jwh-translate-cache-v1` (`{ '<from>|<to>|<text>': result }`) so repeats are instant/offline. LRU-trim to a hard 20.

### 3.5 On-demand per-card translation
- **UI:** a small **`訳`** (translate) control on researched content cards (start with the pillar/content cards in `content.js`; a shared helper makes it reusable). Tap → translates that card's English (name + detail) and shows the JP inline beneath, with a tiny "machine translation" label + a re-collapse toggle.
- **Behavior:** a reusable `attachCardTranslate(triggerEl, text, mountEl)` (in a new small `cardtranslate.js`): on first tap, translate the card's English and inject **`esc()`'d** JP into `mountEl`; cache by a stable key (`'en|ja|'+field`) in the shared `jwh-translate-cache-v1` so repeat opens are instant and offline. A tiny **"machine translation · MyMemory"** label discloses the third party + the quality caveat. Reduce-motion aware (no reveal animation when `data-reduce-motion="on"`). Failure → inline "translation unavailable" (non-blocking; the English card is untouched).
- **Length handling (fixes the >500-char card):** name and detail are translated as **separate ≤500-char requests** (and the cache keys them separately). If a single field still exceeds 500, translate the first 500 and append a visible **"… (truncated)"** marker — never a silent failure.
- **Scope guard:** only translates on explicit tap (never bulk/auto), so a page of cards never fires N requests unprompted, and the user's content only leaves the device when they ask. This is the deliberate alternative to site-wide auto-MT.

## 4. AnkiConnect feasibility (designed-for, not hand-waved)
- **Works** when the dashboard is served over `http://localhost` (the documented local dev/run path) with Anki + AnkiConnect open, after the user adds the origin to the add-on's `webCorsOriginList` (a one-time settings note we surface in the Guide).
- **Blocked** on the live HTTPS site (mixed-content / Private-Network-Access). Handled by **`isAvailable()` detection → TSV file fallback** on every Anki action, so the feature degrades, never dead-ends. The buttons are always present and always do *something* useful.
- We do **not** attempt to defeat browser security (no proxy, no key). The fallback is the answer, and it is first-class.
- **We only ever call read/add actions** — `version`, `deckNames`, `findNotes`, `notesInfo`, `canAddNotes`, `createDeck`, `addNotes`. **Never** any delete/replace/overwrite action; `addNotes` uses `allowDuplicate:false`. So the integration cannot destroy a user's Anki data.
- **CORS caveat surfaced to the user (in the Guide note):** AnkiConnect's `webCorsOriginList` is per-*origin*, all-or-nothing — allow-listing this dashboard's origin lets *any* page on that origin reach the local Anki. We tell the user to scope it to the exact origin they use and that this is theirs to enable.

## 4a. Security & privacy (consolidated)
- **XSS boundary = `esc()` on every render**, verified: `lib/dom.js esc` escapes `& < > "`, so any third-party/imported string (Jotoba glosses, MyMemory translations, Anki note fields) renders inert even un-stripped. `stripHtml` is for display cleanliness, not security. Every new injection site in §3.2–3.5 names `esc()` explicitly. (Double-quoted attributes only — `esc` does not escape `'`.)
- **Third-party disclosure:** the translate tool (§3.4) and per-card translate (§3.5) each carry a visible "sent to MyMemory" note; translation is **on-demand only** (no auto path), so content leaves the device only on an explicit tap. Dictionary (Jotoba) and the existing hover already round-trip the looked-up word — unchanged.
- **Storage discipline:** hard caps (import ≤1000, translate input ≤500, cache ≤20) are enforced in code, not "e.g."; all new `setItem` calls are try/catch-wrapped against `QuotaExceededError`.

## 5. Data model / new keys (added to `lib/store.js` `KEYS`)
- `jwh-phrases-user-v1` — array of `{ id, jp, read, en, cat, src, _user }` (imported + saved phrases).
- `jwh-anki-deck-v1` — string deck name (default `Japan WHV`).
- `jwh-translate-cache-v1` — object map, LRU-trimmed (shared by 3.4 + 3.5).
All `jwh-*` → auto-backed-up; bump no existing key's `-v1` (all new). `store.get` type-guards each.

## 6. Testing
- **Unit (`node --test`, new files):** `lib/anki.test.mjs` (toAnkiTSV dir/tags/field-sanitize; parseAnkiTSV header-skip/blank/empty-front/tags; field-name→{jp,en,read} detection + the swap-default; `stripHtml` guarded/skipped when `DOMParser` absent), `lib/translate.test.mjs` (translateURL enc + pair validation + throw-on-empty + throw-over-500; parseTranslation ok/quota/`quotaFinished`/malformed), `lib/userphrases.test.mjs` (add/remove/normalize/no-mutation). `lib/ankiconnect.js` is I/O → not unit-tested (covered by browser verify + a mock).
- **Browser verify per feature:** export downloads a valid TSV + (with a mocked/avail AnkiConnect) adds notes; import file → phrases appear + are deletable + survive reload; dictionary box looks up JP & EN; translate tool round-trips EN⇄JP + shows quota copy on a forced error; per-card 訳 injects JP + caches (second tap instant, offline). 0 console errors each.
- **Adversarial + security review** on the two network surfaces (AnkiConnect localhost POST, MyMemory GET): no key leakage (none exist), all injected strings `esc()`'d, imported Anki HTML stripped, no `jwh:data-changed` loops, graceful timeouts everywhere.

## 7. Out of scope
- Site-wide auto-translation on the JP toggle (deliberately rejected — quality/offline/rate-limit).
- Syncing Anki **review state / scheduling** back into the app (we export/import *content*, not SRS state).
- A `.apkg` builder (needs SQLite+zip → violates zero-build); TSV import/export covers the round-trip.
- Translating non-card surfaces in bulk; offline MT; fuzzy dictionary matching.

## 8. Process
Write spec → AI (adversarial) review → user review → `writing-plans` (one plan, 5 phases + a shared-lib phase 0) → subagent-driven build, shipping/reviewing each feature in turn.
