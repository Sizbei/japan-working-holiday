# Anki deck overhaul — full fields, built-in media, save/library UX, help button, bold flash

Owner complaints (2026-07-21, verbatim intent):
1. "#/phrases … overlaps with help. change the button for help."
2. "on mobile it's so slow I can see it change from regular font to bold" + "I actually see the bold flash for flashcards on computer too."
3. "how do we save this deck … where's the way to save a deck for later. i can't seem to do that."
4. "there's no way this is showing everything from the deck. look at the other fields available. look at the anki api. i prefer the built-in stuff, not just the TTS. make sure we can do pictures too. there's lowkey a lot of fields."

## Diagnosed root causes (verified on the owner's live device)

- **D1 — fields dropped.** The .apkg importer charset-detects 5 columns and discards the rest. Owner's Core-2000 deck (2007 cards): "meaning" captured the **POS column** (1715/2007 are "Noun"/"Verb"/…) so the **English gloss is missing everywhere**; sentence audio never read (0/2007 `a2` → sentence 🔊 = TTS); other fields discarded. The fix reads Anki's own data model: `notes.mid` → `col.models` (schema-11 JSON) → real field names.
  - "Look at the Anki API": the repo ships an AnkiConnect client (`lib/ankiconnect.js`, CSP-allowed `http://127.0.0.1:8765`) used by `phrases.js` live phrase import (it reads real field names from `notesInfo`). Unusable for the deck feature on the deployed HTTPS site (mixed content) and on the phone → the deck path parses the .apkg offline, with name mapping in the same spirit as `mapNoteFields`.
- **D2 — audio.** Word audio works; sentence audio broken by D1; recorded-vs-TTS invisible.
- **D3 — images.** Dedicated image fields never attach (bare-filename values unsupported; only first `<img>` scan); no mobile sizing.
- **D4 — bold flash.** `.ank-word{font-weight:800}` (style.css ~3924) — 800 isn't loaded (Google Fonts: 400/500/700/900) → browser substitutes 900; JP faces are ~120 unicode-range subsets per weight → cards hitting unloaded 900-subsets paint light then swap.
- **D5 — save/library.** Decks auto-save (and "Back up my data" includes them; media excluded) but nothing says so; no way to re-import an updated .apkg without losing progress; owner's deck predates the current importer.
- **D6 — help.** Deck help = one cramped desktop-only `.ank-hint` line; nothing on touch. Owner's "overlaps with help" repro unconfirmed (diagnostic overlap audit at 360/390/430/952px clean; the only `#kbdHelp` hiding rule is already correctly scoped, yet the owner's live browser computes `display:none` at 952px/hover → probe in-situ during implementation; fix if real, drop if not reproducible).

## Spec

### S1 — Parse the real Anki data model (pure lib + tested)
- `importApkg`: read `notes` as `(mid, flds)` via the existing `colIdx`; read `col.models` JSON (overflow pages verified supported). `models[String(mid)] = { name, flds: [names in ord order] }` (lookups by `String(mid)`; a missing `mid` key → that group falls back to charset `detectColumns`).
- **Group notes by `mid`; keep the dominant notetype's rows in ONE filtered array that becomes the single source of truth** for `cardsFromRows`, `attachMedia` (`srcIdx` indexes into it), the remap re-parse (`DATA.apkg.rows` = the filtered array), and positional card ids. Preview notes "N cards of other note types skipped" when nonzero.
- `mapFieldsByName(fieldNames)` in `lib/anki.js`. Fixed claim order, most-specific first; each claimed field excluded from later slots; within a slot, first unclaimed match in ord order wins:
  1. `image` /image|picture|^img\b/i
  2. `sentenceAudio` /sentence|example/i AND /audio|sound/i
  3. `wordAudio` /audio|sound/i
  4. `sentenceMeaning` /sentence|example/i AND /english|meaning|translation/i
  5. `sentenceKana` /sentence|example/i AND /kana|reading|furigana/i
  6. `sentence` /sentence|example/i, **preferring a field NOT matching /cloze/i; a clozed field is claimed only when no plain sibling remains**
  7. `pos` /\bpos\b|part.?of.?speech/i
  8. `meaning` /english|meaning|gloss|translation|\bback\b/i (never a pos-matching field)
  9. `reading` /kana|reading|furigana/i (not matching /sentence|example/)
  10. `expression` /kanji|expression|vocab|\bword\b|front/i
  - Unmatched slots → charset `detectColumns` fallback; name mapping wins where both fire.
  - **`cleanField` learns cloze**: `{{c1::text::hint}}` → `text` (strip the wrapper, keep the answer) so a clozed sentence field renders as a plain sentence.
  - Unit tests cover BOTH real Core families separately — family A (`Vocabulary-Kanji/-Kana/-Furigana/-English/-Pos/-Audio`, `Sentence-Kana/-English/-Audio/-Clozed`, `Image`) and family B (`Expression`/`Reading`/`Meaning` style) — plus Basic (`Front`/`Back`) and a Kaishi-style set. Regressions: POS never in `meaning`; `Sentence-Kana` never in `reading`; cloze wrapper stripped.
- Card schema v2 (cards persist wholesale — additive-safe): `{ id, w, r, m, s, sm, pos?, sk?, a?, a2?, img?, x?: [{n, v}] }`; `x` = remaining non-empty fields (cleaned, cap 8 entries / 2000 chars per card). `isPOS` heuristic stays only for name-less decks.
- Deck body v2: `fields`, `map`, `notetype`. **Extend BOTH `deckBody()` (persist whitelist) and `loadDeck()` (read reconstruction)** — body-level keys do not ride along like cards do.
- `attachMedia` signature changes from `cols` to the new slot map (`wordAudio`/`sentenceAudio`/`image` indices) — update both call paths.

### S2 — Media completeness (built-in first)
- Word audio: mapped `wordAudio` field, then current fallback chain. Sentence audio: mapped `sentenceAudio` field, then `[sound:]` in the sentence field. Images: mapped `image` field (`<img src>` OR bare `name.ext` present in the manifest), then first `<img>` in any field.
- Audio buttons: recorded preferred; synthesized ones get a tiny "TTS" affix + title/aria (via the existing `data-tts` flag).
- Images: bounded thumb (`max-height` 180px desktop / 160px mobile, `object-fit: contain`, `alt` = word); tap toggles a `.is-full` class (transient — a repaint resets it, acceptable). **The img must join the card-click exclusion list in `wireStream` and stop propagation** — today any unlisted click advances the card.

### S3 — Import preview shows everything
- Headers = real field names; first 3 cards; ALL fields (horizontal scroll); mapped slots marked ("→ word"); remap selects list field names. Footer: "2007 cards · 12 fields · 2007 audio · 0 images" (+ "N other-notetype cards skipped" when nonzero).

### S4 — Card render: show everything, stay fast
- Adds: POS pill, real meaning `m`, `sk` under the sentence, image thumb.
- `sk` toggle/reveal: add to the `.ank-hira-off` hide rule AND the `.ank-revealed` reveal selector list — both sides.
- Extras `x`: a native `<details class="ank-extras">` at the card foot ("⋯ more"); **in the card-click exclusion list + summary stops propagation** (else the advance repaint instantly re-collapses it); open state is transient per card. Values esc'd, `lang="ja"` where CJK; never part of reveal state.
- `editCard` gains `pos`; extras read-only.
- Search: matches `x` values + `pos` via a **lazily-built lowercased haystack per card (built once per deck load, x capped at ~200 chars/field in the haystack)** — never rebuild strings per keystroke; keep the 12-hit early exit.

### S5 — Deck library: save visibly, update-in-place, banner for stale decks
- **v1 banner (owner's morning path):** deck body lacking `fields` → slim banner in ALL deck views (stream above the card, skim above the list, all-clear too): "This deck was imported before full-field support — update it from your .apkg to get meanings, sentence audio & pictures" + **Update from .apkg** button. Primary UI, wired in `wireCommon` with its own hidden file input (deck views have none today).
- **Update-in-place plumbing (this is four call sites, not one line):** the banner/↻ button records `updateId` on `DATA`; `importApkg` carries it through preview (the remap re-render spreads `DATA`, so it survives); `#ankSave` branches: update → keep deck id + name, carry progress (below) **and `shuffle`/`seed`/`view`/`autoplay`**, write via `set(deckKey(id))`, update the existing lib row in place (`cardCount`, `importedAt` — no unshift), then diff-clean media: after a successful save, delete IndexedDB keys under `id/` whose filename is NOT in the new ref set (write-then-clean order — a failed extraction leaves old blobs, never a media-less deck). **Migrated-deck media:** a v1 deck's blobs live under BARE keys (the pre-#205 importer wrote `mediaPut(name)` unprefixed; the library migration never re-keyed them — `fillMedia`'s bare-name fallback exists for exactly this). On the update branch, when the OLD body lacked `fields`, additionally delete the bare keys named by the old cards' `a`/`a2`/`img` refs after the successful save — otherwise the owner's ~2003 old blobs are orphaned forever and the deck's media footprint doubles.
- **Progress carry:** read the OLD deck via `get(deckKey(updateId))` (NOT `loadDeck()`, which reads the active deck — ↻ can target a non-active one). Old current card = `orderFor(oldDeck, oldChunk, 'chunk')[oldPos]` (correct under shuffle — orderFor is seed-deterministic). Count-equal AND the old current card's `(w, r)` matches the new card at the same global index → keep `pos`/`chunk`/`shaky` untouched (the index sanity check guards a same-count reorder). Otherwise → re-key `shaky` by `(w, r)` (drop unmatched) and restore position to the old current card's `(w, r)` in the new deck (fallback: clamp old global index).
- **Honest preview messaging:** count-equal (sanity-checked) → "Progress will be kept." Otherwise → quantified: "N cards (M skipped — other note types) · flags & position remapped by word; flags on skipped cards can't carry."
- Naming note for the implementer: card-level `pos` (part of speech) is distinct from `deck.pos` (the per-chunk position map) — different scopes, same word; keep them apart. `sk` is display-only (not in `EDIT_FIELDS`) — deliberate.
- Deck row label → "Deck library — saved on this device"; per-deck ✎ / ↻ / ✕ (no menu). After save/update: `dndToast` (from `dnd.js`) "Deck saved on this device" / "Deck updated — progress kept/remapped".
- CUT: per-deck `.jwhdeck.json` export/restore (site backup already covers cards+progress).

### S6 — Help button + hint retirement
- "?" button (`#ankHelp`, `.ank-mini`, ≥24px) at the end of the deck bar, all widths → focus-trapped sheet (existing modal lib): "Keys", "Touch", "Decks" (auto-save + backup story) from one const. Button only — no `'?'` key binding.
- Delete `.ank-hint` (content → sheet).
- **`wireDeckKeys` early-out when `document.querySelector('[aria-modal="true"]')`** — closes the existing arrows-into-dialog leak the new sheet would expose.
- `#kbdHelp` at 952px: probe in the owner's browser; fix if a real rule emerges, drop otherwise.
- Post-build overlap audit at 360/390/430/952/1440 on #/phrases: zero pairs involving help/deck controls.

### S7 — Kill the bold flash
- `.ank-word` 800 → **700**.
- Warm-up: on deck load + each `paintCard`, `document.fonts.load('700 1em "Zen Kaku Gothic New"', text)` for current + next 3 cards' `w + r + s` (fire-and-forget, deduped Set). No CSP change. Only `.ank-*` weights change.

## Constraints
- Zero-build, no new CDNs; every dynamic string (field names AND values) through `esc()`; SW `CACHE` bump; new `lib/*.js` → `ASSETS`.
- Pure logic in `lib/` with Node-import-safe unit tests. **Fixture tooling:** the synthetic .apkg generator (scripts/, not shipped) may use `node:sqlite` (v24 present locally) and needs a minimal STORED-only zip writer (the repo's zip.js is read-only) — both are new test tooling, kept OUT of the pure unit suites.
- Backwards compatible: v1 decks render as today PLUS the banner; body keys carried via the S1 plumbing.
- localStorage keys unchanged.

## Delivery order (3 PRs)
1. **Quick relief (owner-visible on wake):** S7 font fix · S6 "?" button + Keys/Touch sheet + `.ank-hint` retirement + key-leak guard + `#kbdHelp` probe/fix · S5 library label + save toast. (The sheet's "Decks" section ships here with the auto-save/backup story; the update-from-apkg line is added in PR3.)
2. **The overhaul:** S1–S4 (parser, media, preview, card render, search haystack) + unit tests + synthetic .apkg fixture + headless import test.
3. **Library UX:** S5 banner + update-in-place + honest messaging + overlap audit.

## Verification
- `node --test` green: model parse; both Core families + Basic + Kaishi mapping; POS/Sentence-Kana regressions; cloze strip; sentence-audio pickup; image ref (`<img>` + bare filename); progress carry (count-equal untouched; mismatch `(w,r)` re-key incl. homograph + shuffle case); extras cap; haystack build.
- Headless: synthetic .apkg → real UI import → preview shows named columns + counts; saved card has `m`(gloss)/`pos`/`a`/`a2`/`img`/`x`; card shows gloss + POS pill + image; sentence 🔊 not TTS; image tap doesn't advance; extras open without advancing; update-from-.apkg keeps progress (both branches); v1 deck shows banner in stream AND skim.
- Bold flash: computed weight 700; `document.fonts.check` true for next-card text after paint.
- Overlap audit per S6. Morning report: banner → Update → meanings + sentence audio + progress story.
