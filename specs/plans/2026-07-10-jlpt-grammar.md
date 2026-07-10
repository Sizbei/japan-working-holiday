# JLPT grammar reference (N5→N1) — brainstorm + 10-phase plan (2026-07-10)

Owner: "add JLPT grammar with examples, N1–N5, hover to look at kanji and grammar, little
animations. 10 phases."

## The honest shape of this project

The UI is maybe 3 phases of work. The DATA is the project: real JLPT coverage is roughly
**N5 ~100 · N4 ~130 · N3 ~200 · N2 ~200 · N1 ~250 ≈ 880 grammar points**, each needing a
pattern, meaning, connection rule, and 2–3 example sentences — **~2,000+ authored sentences**.
Note: post-2010 JLPT publishes NO official grammar list; every site's list is a community
estimate → levels carry `confidence: medium` per repo doctrine.

**Rights (public repo):** grammar point lists are facts — free. Example sentences and prose
from Bunpro / JLPT-sensei / Genki / 新完全マスター are copyrighted — never scrape them. We write
ORIGINAL examples and explanations (patterns themselves are free to describe). Unlike the Anki
deck (commercial → import-your-own), this content is cleanly bakeable.

## Architecture decisions (engineering — decided)

- **Separate `docs/data/grammar.json`** — NOT tips.json (already 545KB, fetched at boot for
  every route). Lazy-fetched when the grammar surface mounts (the Leaflet-on-#/map pattern),
  precached in the SW (train-study works offline, like Anki). Estimated 500–700KB.
- **Pre-segmented examples** — the load-bearing decision. Hover-per-token needs per-token
  reading/gloss at authoring time; runtime tokenizers violate zero-build/no-CDN, and
  Jotoba-per-hover for arbitrary sentence positions is too chatty. Token = `{t:'食べて',
  r:'たべて', g:'eat (te-form)'}`, or a plain string for particles/kana with nothing to say.
- **Schema per point:** `{id, level, pattern, reading, meaning, connection, nuance?,
  confidence, examples:[{ja:[tokens], en}], tags[], related[]}`. Two hover flavors ride this:
  token hover = dictionary popover (baked gloss first → lang.js shared GLOSSARY→Jotoba→Jisho
  fallback); grammar-token hover (distinct underline on the tokens that ARE the pattern) =
  grammar popover (connection rule, breakdown, nuance, level chip). One positioning engine,
  one popover open globally at a time (must coexist with the lang.js dictionary).
- **Touch:** hover is unreliable on mobile (lang.js:66 precedent) — tap-to-inspect, explicit
  dismiss, 44px targets.
- **Animations, through the design-loop lens** (frequency gate, reduce-motion kill, WAAPI
  JS-gated): popover enter ≤120ms scale(.96→1)+fade with NO exit animation (scanning must
  never feel gated); level-tab switch = the existing card stagger (20ms apart, cap ~8);
  card disclosure = the .c-disclosure pattern; per-level progress bar fills once on paint.
  No per-hover shimmer, no persistent motion.
- **Progress (if picked):** `jwh-grammar-v1 {v, done[], shaky[]}` — studied ✓ / shaky ◆ per
  point, per-level "34/103" bar, ◆ filter. Reuses the Anki gold/◆ visual language. Rides
  backup.js automatically. NO SRS — that's Anki's job.
- **Modules:** `docs/assets/grammar.js` (UI) + `docs/assets/lib/grammar.js` (pure, node-tested:
  filter/search/progress ops) + a **node validator script** (schema, token integrity, id
  uniqueness, level counts) that gates every data PR.

## OWNER DECISIONS — all DECIDED 2026-07-10

- **A. Placement: hidden deep-linked `#/grammar` route** (the deadlines/packing/phrases
  pattern), cross-linked prominently from #/phrases. Nav stays at 11.
- **B. Depth: compact** — meaning + connection rule + 2 examples per point; ships all ~880.
- **C. Progress: light ✓/◆ tracking** — done/shaky per point, per-level bars, ◆ filter,
  `jwh-grammar-v1`, Anki visual language, no SRS.
- **D. Examples: trip-flavored originals** — konbini, ward office, share-house, transit,
  Hokkaido; all original prose (no rights issues).

## The 10 phases (each = one PR, verified per specs/verification-harness.md)

1. **Foundation** — grammar.json schema + node validator + lazy loader + `#/grammar` route
   shell (view container, title, SW precache, guide/gestures registration) + lib/grammar.js
   with node tests. Seed: 5 hand-authored N5 points as schema exemplars.
2. **N5 data bake (~100 points)** — full segmented examples; validator green; spot-check
   screenshots. Pure-JSON PR (zero code risk once P1 lands).
3. **Browse UI** — level tabs (N5–N1 + All), grammar cards (pattern 大 + reading + meaning),
   disclosure open for examples/detail, live search (JP + EN), count chips, empty states.
4. **Kanji hover** — token popover from baked r/g, lang.js shared-lookup fallback for
   unbaked tokens, touch tap-to-inspect, keyboard focus path, one-popover-global rule.
5. **Grammar hover** — pattern-token underlines + grammar popover (connection, breakdown,
   nuance, level); popover collision rules with dictionary popover settled.
6. **Motion + progress** — the animation set above (reduce-motion verified) + ✓/◆ toggles,
   level progress bars, ◆ filter, jwh-grammar-v1 (+ backup ride-along test).
7. **N4 bake (~130 points).**
8. **N3 bake (~200 points).**
9. **N2 bake (~200 points).**
10. **N1 bake (~250 points) + full regression** — 14-surface sweep, contrast measured both
    themes, a11y pass (roving focus, aria-expanded, SR announce on filter changes),
    offline check, retro + memory update.

Phases 7–10 are deliberately pure-data PRs: by then the UI is frozen and each bake is
validator-gated JSON review. If N1 proves too big for one PR, split 10 into 10a/10b — the
phase count is a map, not a straitjacket.

## Risks

- **Authored-example naturalness** — I write ~2,000 sentences in batches; some will be
  stiff or wrong. Mitigation: confidence flags, batch review, owner spot-checks (you read
  Japanese daily now — flag anything weird and I fix in the next data PR).
- **JSON size** — terse token keys (t/r/g), no per-token furigana for pure-kana tokens.
- **Popover collisions** — one global open popover; namespace away from lang.js containers.
- **Review fatigue on data PRs** — validator + per-level screenshots keep them honest.

## Parked (not v1)

Export shaky grammar points → Anki TSV (toAnkiTSV exists) · conjugation drills · sentence
audio (no clean source) · JLPT mock-question mode · romaji search.
