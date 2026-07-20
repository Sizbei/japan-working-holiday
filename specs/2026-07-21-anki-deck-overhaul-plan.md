# Implementation plan — Anki deck overhaul

Executes `2026-07-21-anki-deck-overhaul.md` (the spec; READ IT FIRST — it carries the verified
root causes, the 10-slot mapping table, and every integration landmine found in 3 review rounds).
Three PRs, each: fresh worktree off fetched `origin/main` → implement → `node --test` green →
headless CDP verification → code-reviewer subagent → fix HIGHs → squash-merge → live check.
SW `CACHE` bumps in every PR (read the current version from `docs/sw.js` at branch time — other
sessions move it).

Execution model: orchestrator (main session) + subagents. Per PR: an implementation subagent per
stage (prompts below say exactly what/where), then the orchestrator integrates, runs the
verification gates, and dispatches a code-reviewer subagent before merge. Subagents work in the
PR's worktree only.

**HARD SEQUENCING RULES (all three PRs edit phrases-anki.js):**
- Create PRn's worktree ONLY AFTER PR(n-1) is squash-merged and `origin/main` re-fetched. Never
  three parallel worktrees.
- Within PR2, stage B completes before stage C starts (same file; C depends on B's card schema).
- All headless behavior gates follow `specs/verification-harness.md` (in-repo): advance /
  no-advance assertions use TRUSTED input (`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`),
  never synthetic `el.dispatchEvent(new MouseEvent(...))` — synthetic clicks lie. `hover:none`
  touch-size checks are done by cascade inspection (flip the media rule via CSSOM), not
  `Emulation.setEmulatedMedia` (doesn't work in this harness).
- The overlap scanner lives in this session's scratchpad at
  `/private/tmp/claude-501/-Users-sizbei-Documents-GitHub-japan-working-holiday/925ff871-3db8-41e1-9b66-898940a6c058/scratchpad/overlap-scan.mjs`;
  if absent, rewrite it: enumerate visible buttons/links/inputs on #/phrases, report pairwise
  bounding-box intersections >4px between non-ancestor elements, at 360/430/517 (the owner’s real window width — discovered via innerWidth probe)/952/1440.

---

## PR1 — `fix/anki-relief` — font flash + help button + save visibility

Touches: `docs/assets/phrases-anki.js`, `docs/assets/style.css`, `docs/sw.js`. No new files.

1. **S7 font fix.** style.css: `.ank-word{font-weight:800}` → `700` (rule near L3949 — verify by grep, numbers drift).
2. **S7 warm-up.** phrases-anki.js: add
   ```js
   const _warmed = new Set();
   function warmFonts() {
     if (!stream || !document.fonts?.load) return;
     for (let k = 0; k <= 3; k++) {
       const c = stream.order[stream.idx + k]; if (!c) continue;
       const t = `${c.w || ''}${c.r || ''}${c.s || ''}`;
       if (!t || _warmed.has(c.id)) continue;
       _warmed.add(c.id);
       document.fonts.load('700 1em "Zen Kaku Gothic New"', t).catch(() => {});
     }
   }
   ```
   Call at the END of `paintCard()`. Clear `_warmed` is unnecessary (Set of ≤2007 ids, fine).
3. **S6 key-leak guard.** First line of the `wireDeckKeys` keydown handler body (after the
   `!stream` guard): `if (document.querySelector('[aria-modal="true"]')) return;`
4. **S6 help button + sheet.** `barHTML()`: append to the last `.ank-grp`:
   `<button type="button" class="ank-mini" id="ankHelp" aria-label="Deck help" title="How this deck works">?</button>`.
   One const `HELP_HTML` (Keys / Touch / Decks sections; Keys list mirrors `wireDeckKeys`
   bindings — Space, ←/→ or ,/., ↓ reveal, S shaky, E edit, P audio, N hiragana, M English;
   Touch: tap card = flip/next, tap zones ‹ ›, swipe, bottom bar; Decks: "Every imported deck is
   saved on this device automatically — manage them under 'Deck library'. 'Back up my data'
   (Checklist page) includes decks; audio/images return when you re-import the .apkg").
   Open with `showModal(title, trustedHTML)` from `lib/modal.js` (purpose-built titled + Close +
   focus-trapped dialog; sets `aria-modal` so the key-leak guard fires) from a click handler wired
   in `wireCommon`. NO `'?'` key binding.
5. **S6 hint retirement.** Delete the `<p class="ank-hint">…</p>` from `renderStream` and the
   equivalent line in `renderSkim`; drop the now-dead `.ank-hint` CSS rule(s).
6. **S5 visibility.** `deckBarHTML()`: label `Your decks` → `Deck library — saved on this device`
   (keep `.ank-decks-lbl`); in the import `#ankSave` success path add
   `dndToast('Deck saved on this device')` (`import { dndToast } from './dnd.js'`).
7. **D6 kbdHelp probe — NON-BLOCKING, best-effort.** Try the owner's browser tab
   (claude-in-chrome) once: list which rule makes `#kbdHelp` computed `display:none`. If the
   browser/tab is unreachable, or nothing conclusive in ~2 attempts → SKIP, ship PR1 without it,
   and put the question in the morning report (the only known rule is already correctly scoped;
   this is likely a dead end and must never stall the pipeline).
8. **CSS.** `#ankHelp` inherits `.ank-mini`; ensure ≥24px touch under `@media(hover:none)` like its
   siblings (check the existing `.ank-mini` touch rule covers it — body-prefix specificity gotcha).
9. **Gates.** `node --test` (no new tests needed); headless: weight 700 computed on `.ank-word`;
   fonts gate: `await document.fonts.ready` (or await the load promise) THEN
   `document.fonts.check('700 1em "Zen Kaku Gothic New"', <next card text>)` — the warm-up is
   fire-and-forget, an immediate check is flaky-false;
   `#ankHelp` opens the sheet, focus trapped, Esc closes, ArrowRight while open does NOT advance
   (idx unchanged); toast fires on a save; deck bar shows the new label; `.ank-hint` gone.
   Overlap scan (reuse scratchpad/overlap-scan.mjs) at 360/430/517 (the owner’s real window width — discovered via innerWidth probe)/952/1440 — no help/deck pairs.

## PR2 — `feat/anki-fields` — full data model, media, preview, card render

Touches: `docs/assets/lib/anki.js`, `docs/assets/lib/ankimedia.js`, `docs/assets/phrases-anki.js`,
`docs/assets/style.css`, `docs/sw.js`, `tests/lib.test.mjs`. New (test tooling only, NOT shipped):
`scratchpad/make-apkg.mjs` (node:sqlite + stored-only zip writer).

Stage A — pure lib (TDD: tests FIRST, then implementation):
1. `tests/lib.test.mjs`: suites per spec Verification — `mapFieldsByName` on Core family A,
   family B, Basic, Kaishi (assert every slot per the spec walkthrough; POS never in meaning;
   Sentence-Kana never in reading; cloze preference); `cleanField` cloze strip
   (`{{c1::text::hint}}`→`text`, `{{c2::text}}`→`text`, nested-free); `buildCards` (see 2) extras
   cap 8/2000; bare-filename image ref.
2. `lib/anki.js`: implement `mapFieldsByName(fieldNames)` exactly per the spec's 10-slot claim
   order (exported, pure). Extend `cleanField` with the cloze strip (BEFORE the html strip).
   Extend `cardsFromRows(rows, mapping, fieldNames?)`: when `fieldNames` given, derive mapping
   from `mapFieldsByName` (explicit `mapping` overrides per-slot), and populate v2 card fields
   `pos`, `sk`, `x` (skip fields claimed by slots; cap 8 entries/2000 chars; values via
   `cleanField`). Keep return `{cards, cols}` where `cols` now includes the new slots.
3. `lib/ankimedia.js`: add `bareMediaRef(field)` — a trimmed field that looks like `name.ext`
   (whitelist ext: jpg/jpeg/png/gif/webp/svg/mp3/ogg/wav/m4a, no spaces/`<`) → the name, else null.

Stage B — importer wiring (phrases-anki.js):
4. `importApkg`: read `mid` via `colIdx(notesTbl.sql,'mid')`; read `col.models` (same pattern as
   `readDeckName` — `colIdx(colTbl.sql,'models')`, `JSON.parse`, best-effort try/catch). Group
   rows by mid → dominant group ONLY becomes `rows` (THE single filtered array: cards, srcIdx,
   media, remap, positional ids all index into it — spec S1 invariant). `fieldNames` =
   `models[String(mid)]?.flds` names in ord order (missing → undefined → charset fallback).
   `DATA` gains `fieldNames`, `skipped` (count of non-dominant notes), `notetype`.
5. `attachMedia(cards, apkg, deckId, map, onProgress)`: slot-map param — word audio from
   `map.wordAudio` field then existing fallbacks; sentence audio from `map.sentenceAudio` then
   `soundRef(fields[map.sentence])`; image from `map.image` (`imgRef` OR `bareMediaRef`) then
   any-field `imgRef`. Unchanged storage/caps/progress.
6. Save path: deck body gains `fields`, `map`, `notetype` — **extend `deckBody()` AND `loadDeck()`**
   (spec S1; the whitelist strips them otherwise).
7. Preview (`showPreview`): headers = `fieldNames` (esc'd) or `col N` fallback; all columns;
   mapped-slot chips on headers; remap selects listing field names; footer counts incl. audio,
   images, skipped notes.

Stage C — render (phrases-anki.js + style.css):
8. `paintCard`: POS pill from `card.pos` (keep `isPOS(card.m)` fallback for name-less decks);
   `sk` line under the sentence (`.ank-sentk`, lang=ja); image thumb (existing `#ankImg` path,
   `alt` = word, click toggles `.is-full` + `stopPropagation`); extras
   `<details class="ank-extras"><summary>⋯ more</summary>…</details>` (esc'd, lang=ja per CJK
   value); TTS affix on `data-tts` buttons (CSS `[data-tts]::after` or a small span).
9. `wireStream` card click handler: extend the exclusion `closest` list with
   `.ank-extras, .ank-img` (and their handlers stopPropagation).
10. style.css: `.ank-sentk` (hidden by `.ank-hira-off` — add to BOTH the hide rule AND the
    `.ank-revealed` reveal list ~L3980); `.ank-extras` styles; `.ank-img` max-height 180px /
    160px mobile + `.is-full`; TTS affix.
11. Search: haystacks live in a module-level `WeakMap` keyed by the CARD OBJECT (never a property
    on the card — cards JSON-stringify wholesale into localStorage; and never keyed by `card.id`,
    which is positional and collides across decks). Lazily build on first search per card:
    w/r/m/s/sm/pos + x values capped 200 chars each, lowercased, joined. WeakMap self-cleans on
    deck switch/reload. `run()` reads the WeakMap; never per-keystroke string building.
12. `editCard`: add `pos` to `EDIT_FIELDS`. (`sk`/extras read-only per spec.)

Stage D — fixture + headless:
13. `scratchpad/make-apkg.mjs`: node:sqlite (schema-11 `col` with models/decks JSON, `notes` with
    mid/flds using `\x1f`) + stored-only zip writer (local headers + central dir + CRC32) +
    `media` manifest + 2 tiny mp3-ish blobs + 1 png. Core-family-A shaped: 12 fields incl.
    `Vocabulary-Pos`, `Vocabulary-English`, `Sentence-Audio`, `Sentence-Clozed` w/ `{{c1::…}}`,
    `Image` bare-filename + one minority-notetype note (skipped-count check).
14. Headless suite: import fixture via the real drop-zone flow → assert preview headers/counts;
    save → card asserts (m=gloss, pos pill, sentence not TTS (`#ankAudio2` without data-tts),
    image visible + tap doesn't advance, extras open without advancing, search finds an x-value);
    reload → deck body has fields/map/notetype (localStorage assert).

## PR3 — `feat/anki-library` — banner, update-in-place, decks help

Touches: `docs/assets/phrases-anki.js`, `docs/assets/style.css`, `docs/sw.js`.

1. **Banner.** `bannerHTML()` when `deck.fields` missing → rendered in `renderStream`,
   `renderSkim`, `renderAllClear` (above strip). Button `#ankUpdate` + hidden
   `<input type="file" id="ankUpdFile" accept=".apkg">` in the banner markup; ALSO a per-deck ↻
   button in `deckBarHTML` (`data-upd-deck`). Wire in `wireCommon`/`wireDeckChips`:
   click → set `_updateId` → file input → `importApkg(file)` (which stores `updateId` on `DATA`).
2. **Update branch in `#ankSave`.** If `DATA.updateId`: old = `get(deckKey(updateId))` (NOT
   `loadDeck()`); progress carry per spec S5 (orderFor-derived old current card; count-equal +
   `(w,r)`-at-index sanity → keep untouched; else `(w,r)` re-key + position restore + clamp
   fallback); carry `shuffle/seed/view/autoplay`; `set(deckKey(id))`; lib row updated IN PLACE
   (`cardCount`, `importedAt`, keep name/position in list); `attachMedia` under the SAME id;
   **only if `set(deckKey(id))` returned true** (quota-false → abort the whole update, keep old
   deck + media, show the storage error — never delete media after a failed body write): diff-clean
   `id/`-prefixed keys not in the new ref set AND (if old body lacked `fields`) delete the old
   cards' bare-keyed `a`/`a2`/`img` refs (spec S5 migrated-media step).
   `dndToast('Deck updated — progress kept')` / quantified variant.
3. **Messaging.** Preview save-button/footer line per spec (count-equal sanity-checked →
   "Progress will be kept", else quantified skip/remap message).
4. **Help sheet.** Append the update-from-apkg line to the Decks section const (from PR1).
5. **Gates.** Unit: progress-carry pure helper (extract as `carryProgress(oldDeck, newCards)` in
   `lib/anki.js` + tests: equal+match, equal+reordered (sanity fail→remap), mismatch homograph,
   shuffle position). Headless: v1-shaped deck (no `fields`) shows banner in stream AND skim;
   update flow with the PR2 fixture keeps position/flags (both branches); bare-key cleanup
   verified — seed a bare blob via `Runtime.evaluate` `{awaitPromise:true}` with a dynamic import
   (`(await import('./assets/lib/ankimedia.js')).mediaPut('file.mp3', new Blob(['x']))`), update,
   assert deleted; non-active-deck ↻ works. Overlap audit re-run.

## Cross-cutting

- Every PR: `git fetch origin -q` before `worktree add`; read current `CACHE` fresh; conflict
  policy = rebase + keep-both tests + CACHE max+1.
- esc() every field name and value at render; no innerHTML from raw zip/sqlite strings anywhere.
- After PR3 merges: verify live site serves the final CACHE; update memory
  (`phrases-anki-refresher` memory file) with the new architecture; write the morning report.
- Owner's device action (morning): banner → Update from .apkg → pick Core file. Until then their
  deck renders exactly as before plus banner.
