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
3. **Skim list + shaky pile + polish** — DETAILED (2026-07-10, stage 2 shipped as #113/#117):

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

   **3c. Shaky pile runner.** A "◆ Shaky (N)" chip pinned at the END of the chunk strip, both
   views. DECIDED DEFAULTS (owner may veto):
   - Pile is GLOBAL across the whole deck, not per-chunk (you skim chunk-by-chunk but re-run
     hesitations in one pass).
   - Streaming the pile: S UN-flags and drops the card from the run at the next advance — the
     pile shrinks as recognition returns; progress reads "n / N shaky". Empty pile → small
     "all clear ✓" state with a button back to chunk 1.
   - "Clear all flags" lives behind the Replace-deck disclosure (destructive-ish, keep it out
     of the fast path).

   **3d. Folded-in fixes from the stage-20 log:** shuffle toggle keeps the current chunk
   (today it snaps to 0); drop mountAnki's dead `data` param; SR announce — a visually-hidden
   debounced (≈400ms, the #calLive pattern) live region that speaks "word, reading, meaning"
   after advancing settles, so rapid-fire doesn't queue 2000 announcements.

   **3e. Verify (harness):** seg toggle persists · skim rows flag/unflag (trusted taps) + gold
   tick renders · shaky chip count live-updates from BOTH views · pile run streams only flags,
   S drops a card, count decrements, empty state renders · shuffle keeps chunk · SR region
   announces once per settle (probe the debounce) · 44px rows under hover:none (cascade check)
   · pos/resume still green from stage 2 · 0 exceptions · tests green (new pure helpers, if
   any, land in lib/anki.js with tests). PR + squash.

   **v1.1 candidates (parked, not stage 3):** classic flip mode · auto-advance timer (2s/card)
   · hover-dictionary tie-in on the stream word · export the shaky pile back to Anki as TSV
   (the June lib's toAnkiTSV is sitting right there) · per-chunk "last visited" heat strip.

Estimated: one focused build session. The design loop completed 2026-07-10 (see
2026-07-10-twenty-stages.md verdicts).
