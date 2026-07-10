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
3. **Skim list + shaky pile + polish** — the skim toggle (dense list, tap-to-flag), stream-the-
   flags mode, shuffle, resume; mobile pass (44px targets); 0-console-errors + trusted-input
   verification; PR.

Estimated: 2–3 loop-tick-sized chunks. The design loop's remaining stages (23, 19, 20, 2b)
continue independently.
