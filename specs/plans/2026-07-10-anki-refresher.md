# Anki Core-2000 rapid refresher (#/phrases) — brainstorm + plan (2026-07-10)

Owner: "quickly go through my anki core 2000 deck… a mode that just has the answer on it —
I'm just trying to get a quick refresher." Deck: AnkiWeb shared 2141233552 (Core 2000).

## The one decision that shapes everything: where the cards come from

**A. Import-your-own (RECOMMENDED).** Anki Desktop → Export → "Notes in Plain Text (.txt)"
→ drop the file on the page → parsed client-side → localStorage (`jwh-anki-v1`, ~400KB for
2000 cards — well under the 5MB cap). Why: the Core 2000 deck's sentences/audio derive from a
commercial course (iKnow) — bundling them in this PUBLIC repo is a rights problem; your own
export stays on your device (matches the site's device-local doctrine). No .apkg parsing
(zip+sqlite in-browser = new dependencies, violates zero-build); TSV is 20 lines of parsing.
Column auto-detect (expression / reading / meaning by charset heuristics) + a manual remap row
if the guess is wrong.

**B. Bake a clean 2k list.** JMdict-glossed frequency list baked into tips.json (legally clean,
zero setup). Rejected for v1: heavy bake work, loses YOUR deck's exact cards/order, and the
sentences (the useful context) can't come along.

## DECIDED (owner, 2026-07-10): Hybrid — option 3
Stream is the default; a "skim" toggle flattens the current chunk into a dense list
(word · reading · meaning, ~50 rows/screen) for a fast pre-pass; tapping any list row flags it
shaky; then you stream just the flags. One-keystroke `S` flags in stream mode too. Both views
share the same chunk/position/shaky state.

## The UI — "refresher scan" mode (the ask)

One giant card, **everything visible at once** — no flip, no friction:

```
   ┌──────────────────────────────────────┐
   │             食べ物                     │   word (2.6rem)
   │            たべもの                    │   reading (1rem, ink-soft)
   │             food                      │   meaning (1.2rem)
   │  ──────────────────────────────      │
   │  この食べ物はとてもおいしいです。          │   sentence, if the export has one
   │                                      │
   │  312 / 2000  ▓▓▓▓░░░░░░  [chunk 4]   │   progress + chunk
   └──────────────────────────────────────┘
      space/→ next · ← back · S shaky
```

- **Advance**: space/→/tap anywhere (mobile swipe). NO per-card animation — this is a
  100+×/session surface; the design principles' frequency gate says instant.
- **Chunks**: 1–100, 101–200… picker (the strip pattern from Plan-a-Day, with the edge fades);
  resume position persists per chunk.
- **Shuffle** toggle (persisted) — order or random within chunk.
- **S = shaky**: one keystroke/corner-tap flags a card into the shaky pile; a "shaky only"
  re-run mode replays just those. This is the whole "refresher" theory: blast through fast,
  flag hesitations, re-run the flags.
- **Optional later** (not v1): classic flip mode, auto-advance timer (2s/card ≈ 2000 cards in
  ~70 min), hover-dictionary tie-in (the site already has the Jotoba/Jisho hover glossary).

## Placement & plumbing

- New tab inside #/phrases (it lazy-loads its modules already — this rides that path);
  `docs/assets/phrases-anki.js` + a pure `lib/anki.js` (TSV parse, column detect, chunking,
  shaky-pile ops — Node-tested, ~8 tests).
- Keys: `jwh-anki-v1` {v:1, cards[], pos:{chunk→idx}, shaky[], shuffle} — rides the backup
  export/import automatically (it walks jwh-* keys).
- esc() on every imported field (user file = untrusted input); file parsed locally, never
  uploaded anywhere.
- SW: add the new asset to ASSETS + CACHE bump; works offline after first load (train-ride
  refreshing is the actual use case).

## Build stages (each verified per the harness)

1. **lib/anki.js + tests** — TSV/semicolon/comma sniffing, column auto-detect (kanji/kana/latin
   charset heuristics), chunk math, shaky ops.
2. **Import flow + stream UI** — drop zone / file picker → preview 3 rows + remap → save; the
   scan card + keyboard/tap/swipe + progress + chunk strip.
3. **Skim list + shaky pile + polish** — ✅ SHIPPED as #120 (2026-07-10). Matrix green:
   skim rows aria-pressed + roving ↑↓ (trusted keys), view persists, pile snapshot with
   stable n/N + non-destructive S, all-clear, chip disabled when empty, shuffle keeps
   chunk, #ankLive announces first card + flag toggles, tick contrast 4.53:1 light /
   8.27:1 dark (canvas composite, 700ms theme settle — body's .4s background transition
   poisons instant probes), 120/120 node tests, 0 exceptions. Detail below as designed
   (stage 2 shipped as #113/#117):

   **3a. View seg + skim list.** A [▶ Stream | ☰ Skim] seg control in the ank header (the
   people-page Cards/List seg pattern; persisted in jwh-anki-v1 as `view`). Skim renders the
   CURRENT CHUNK as a dense list: one row = `word · reading · meaning` (NO sentence column —
   density is the point; the sentence lives in stream). Rows are real <button>s (keyboard
   focusable, Enter/S toggles). ~50 rows/screen at .9rem; row hover = the shared
   interactive-row affordance; 44px min-height under (hover:none). Flagged rows show ◆ + gold
   left tick. Chunk strip + progress shared with stream (same state).

   **3b. Tap-to-flag.** Tapping/Enter on a skim row toggles that card in shaky[] immediately
   (immutable toggleShaky, saved on each toggle). No mode arming — the whole skim view IS the
   flagging surface (that's its job per the owner's option-3 pick).

   **3c. Shaky pile runner — REVISED after two-critic review (non-destructive).**
   - Pile = the flagged cards in DECK ORDER (frequency pedagogy preserved), SNAPSHOTTED when the
     run starts (pure `pileOrder(cards, shaky)` in lib/anki.js, tested). Membership does NOT
     mutate mid-run: **S is the same non-destructive toggle everywhere** — it un-flags/re-flags
     the current card (◆ updates, announce fires) but the card stays in this run. Progress is a
     stable "n / N shaky" over the snapshot. This kills the destructive-no-undo mis-key risk,
     the ambiguous shrinking count, and all drop-index edge math the critics flagged.
   - `stream.mode: 'chunk' | 'pile'` (NOT a fake chunk index): branches in orderFor/paintCard
     (pile progress label) / persistPos (pile does NOT persist position) / switchChunk.
   - "◆ Shaky (N)" chip at the strip end, N live from shaky[]; empty pile at entry → all-clear
     state + back-to-chunks button. "Clear all flags" stays behind the Replace disclosure.
   - Pile overview for free: the skim view in pile mode lists ALL flagged cards (tap to unflag
     in bulk) — the orthogonal view×source design gives the 300-flag overview the review demanded.

   **3d. Mechanics the review pinned (all folded in):**
   - Static `<span id="ankLive" class="sr-only" aria-live="polite">` in index.html as a SIBLING
     of #ankiDeck (a live region inside the innerHTML-rebuilt root can never announce). Trailing
     ~200ms coalesce on every paint (first card speaks too — it's paint-triggered, not
     advance-triggered); skim flag toggles announce "word — flagged/unflagged". (#calLive is
     600ms, corrected from the earlier 400ms drift.)
   - `view` threaded through BOTH loadDeck (type-guarded) and saveDeck (they allow-list keys —
     it would be silently dropped otherwise).
   - Section keydown early-returns on BUTTON targets (else S/Space on a focused skim row
     double-fires the row handler AND the stream handler).
   - Skim rows: real buttons with **aria-pressed** + ROVING TABINDEX (one tab stop; ↑↓ move,
     Enter/Space/S toggle) — 50 sequential tab stops was a keyboard-cost major.
   - Extract stripHTML()/progress into shared helpers (both views render them; today they're
     inlined in renderStream). Skim taps imperatively repaint: row state + chip count + save.
   - Shuffle fix mechanism: capture stream.chunk BEFORE the stream=null re-derive.
   - Drop mountAnki's dead `data` param (verified orphaned).

   **3e. Verify — relabeled honestly:**
   - node tests (real harness): pileOrder (order/dedupe/empty), view round-trip through
     load/saveDeck guards, coalescer if extracted pure.
   - CDP rig (manual-serve automation): seg persists across reload · skim rows toggle with
     aria-pressed + roving ↑↓ (trusted keys) · shaky chip count live-updates from both views ·
     pile streams the snapshot with stable n/N, S toggles non-destructively, re-entering pile
     re-derives · all-clear state · shuffle keeps chunk · #ankLive text updates once per settle
     INCLUDING the first card · gold tick/◆ contrast MEASURED both themes (canvas composite) ·
     44px rows under hover:none · 0 exceptions.

   **v1.1 candidates (parked, not stage 3):** classic flip mode · auto-advance timer (2s/card)
   · hover-dictionary tie-in on the stream word · export the shaky pile back to Anki as TSV
   (the June lib's toAnkiTSV is sitting right there) · per-chunk "last visited" heat strip.

Estimated: one focused build session. The design loop completed 2026-07-10 (see
2026-07-10-twenty-stages.md verdicts).
