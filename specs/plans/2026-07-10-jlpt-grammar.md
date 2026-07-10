# JLPT grammar reference (N5→N1) — brainstorm + 10-phase plan (2026-07-10)

Owner: "add JLPT grammar with examples, N1–N5, hover to look at kanji and grammar, little
animations. 10 phases." REVISED twice under adversarial review (round 1: 3 critics, round 2:
2 critics — log at bottom).

> **RESOLVED (owner, 2026-07-10, re-asked explicitly):** keep **✓/◆ two flags** as originally
> decided. ✓ = studied (feeds per-level "34/103" progress bars), ◆ = shaky (feeds the ◆ filter
> and the eventual Anki-TSV export, v1.1). The review's "✓ has no consumer" point is accepted
> as a known trade-off — ✓ is bookkeeping the owner wants.

**Owner expectation, stated plainly:** the reference becomes actually usable at **phase 5**
(N5 fully baked). Phases 1–4 are engineering against ~12 seed points; phases 6–10 are one
bookmark feature + four level bakes. It's 4 phases of plumbing, then usable, then a content
pipeline — not 10 equal increments of value.

## The honest shape of this project

The UI is ~4 phases. The DATA is the project: **N5 ~100 · N4 ~130 · N3 ~200 · N2 ~200 ·
N1 ~250 ≈ 880 points ≈ 2,000+ authored sentences**, each hand-segmented into glossed,
furigana-split tokens. Post-2010 JLPT publishes NO official list; levels are synthesized from
**≥2 community lists** (never one source wholesale); dispute → LOWER level + `confidence: low`.

**Rights (public repo):** patterns are facts — free to describe. Example sentences/prose from
Bunpro / JLPT-sensei / Genki / 新完全マスター are copyrighted — never scrape. All examples are
ORIGINAL and trip-flavored (konbini, ward office, share-house, transit, Hokkaido).

**Size, honestly:** ~1.9KB/point → **~1.6–1.9MB total uncompressed on disk, ~500–600KB
gzipped over the wire** (tips.json's measured gz ratio ~3.4×). Ships as **five per-level
files** `docs/data/grammar-n5.json` … `grammar-n1.json` (~190KB N5 … ~480KB N1 uncompressed):
browsing costs one level; search pulls the rest on demand (below).

## Data schema (frozen in P1 — round-2 blocker fixed here)

```
point: {id, level:'N5'..'N1', pattern:'〜てから', meaning, connection:'V-て + から',
        nuance?, confidence, examples:[{ja:[tokens], en}], tags[], related[ids]}
token: string                                          — inert (punctuation, names)
     | {t:'食べて', f:[['食','た'],['べて','']], g:'eat (te-form)', p?:1}
```

- **`f` is per-segment furigana `[base, reading][]`** — the repo's EXISTING convention
  (`lib/furigana.js rubyHTML()`, live shape in tips.json e.g. `[["お",""],["願","ねが"],
  ["いします",""]]`). A whole-token reading cannot place ruby correctly on mixed kanji+kana
  tokens (たべて would float over the て) — round-2 blocker. The kana reading for
  search/announce is DERIVED: `readingOf(f) = f.map(s => s[1] || s[0]).join('')` (pure, in
  lib/grammar.js, tested).
- **`p:1` marks pattern-bearing tokens** — per-token flags express NON-CONTIGUOUS patterns
  (も〜ば〜も) naturally.
- Union rule: hover/furigana-bearing text is an object token; objects require non-empty `t`
  and `f` (segments concat === t; readings kana-only). **`g` is optional on `p` tokens and
  RENDERED when present** (a contentful anchor like 場合 wants both its gloss and the pattern
  role — "g required unless p" was wrong; rule is: g required on non-p, optional on p).
- Every example contains ≥1 `p` token.
- **"Kanji hover", honestly:** inspect shows the token's reading + gloss (勉強 → べんきょう —
  the in-context need); per-kanji decomposition stays a Jisho deep-link in the popover footer.

**Validator (P1, node script, gates every data PR):** JSON parse · id uniqueness/format ·
level enum · token union shape · f-segments concat === t · readings kana-only · g-presence
rule · ≥1 p per example · `related[]` referential integrity · per-level counts ·
duplicate-pattern warning. The validator checks SHAPE, not truth — wrong-but-well-formed
readings are the owned risk (see Risks). Validation ≠ escaping: **every rendered field passes
`esc()` at render** per CLAUDE.md.

## Architecture decisions (engineering — decided)

- **Lazy data, correct precedent:** the phrases lazy `import()` (main.js:78–88 — `jwh:route`
  listener + `/^#\/?grammar$/` direct-load check). Fetch the active level on tab entry ·
  `aria-busy` on `#view-grammar` while loading · module-cached after first fetch · visible
  offline/error state with retry.
- **SW:** generalize the tips.json stale-while-revalidate branch predicate to
  `/\/data\/(tips|grammar-n[1-5])\.json$/` and — round-2 fix — the cold-cache fallback must be
  **`caches.match(e.request)`**, not the literal `'data/tips.json'` the current branch
  hardcodes. Precache all five (offline train-study). Owned consequence: **every data phase
  bumps CACHE — data PRs are "JSON + mechanical SW bump", never "zero code risk".**
- **Hover vs lang.js (selector-level separation):** lang.js wires GLOBAL document delegation
  on `.jp, [data-jp]` (lang.js:60–72) — grammar tokens NEVER carry those; own selector
  (`.gtok`), own wiring. Reuse via imports: `lookupWord` from lang.js (exported) and
  `GLOSSARY` from i18n.js directly (lang.js does not re-export it). **Cross-dismiss with
  ownership (round-2 fix):** `jwh:popover-open` CustomEvent carries `detail.owner`
  ('lang'|'grammar'); each system ignores its OWN events and hides on the other's. Ping-pong
  is structurally impossible (disjoint trigger selectors on disjoint elements — an element
  can't summon both), but the self-ignore guard is mandatory because lang.js's `showFor`
  re-fires on every mouseover. lang.js gains the dispatch + a listener → `hideNow()`.
- **Touch/swipe integration (round-2 fix):** grammar example sentences join gestures.js
  `NO_SWIPE` — long sentences overflow and a horizontal drag on tokens must scroll, not
  route-navigate. Escape is a shared global (gestures closeHelp + lang hideNow both listen);
  the grammar strip's Escape handling is section-scoped and idempotent alongside them.
- **Route shell:** `'grammar'` → `HIDDEN` in router.js + `TITLES.grammar` (feeds
  routeLabel/palette) + `<div class="view" id="view-grammar" data-route="grammar">`. No
  gestures/guide "registration" exists for hidden routes; accepted quirk: swipe on `#/grammar`
  navigates from dashboard's neighbours (same as deadlines/packing/phrases). One guide `<li>`.
  Cross-linked prominently from #/phrases.
- **Storage:** `jwh-grammar-v1` registered in store.js KEYS (keeps the corruption
  type-guard). backup.js walks the `jwh-` prefix (verified) — ride-along free, still tested.
  **Furigana toggle state reuses the EXISTING `KEYS.furi` (`jwh-furi-v1`) + `.furi-off`
  convention from the phrases page — one furigana preference across the whole site, not a
  second system** (round-2 blocker companion fix). Contract detail (round-3): the stored
  value is a STRING SENTINEL via `getRaw`/`setRaw` — `'off'` means off, `''` means on
  (phrases.js:39/266) — do NOT read/write it with `get`/`set` booleans or the shared
  preference desyncs. Grammar progress state, by contrast, goes through `set()` (JSON) —
  which is also what keeps the backup `typeof === 'string'` filter satisfied.
- **Scale (~200-card tabs, round-2 fix):** cards render collapsed with token wiring DEFERRED
  until a card's disclosure opens; levels render in chunks of ~60 appended via
  IntersectionObserver sentinel; `content-visibility:auto` on cards. No framework
  virtualization — chunked append is the zero-dependency version.

## Interaction design

- **Discoverability (round-2 fix — the feature must announce itself):** the grammar toolbar
  (with the level tabs) houses the **ふり furigana toggle** (labeled, `aria-pressed`, reuses
  KEYS.furi). Object tokens carry a **dotted underline** — the same affordance the phrases
  page already taught this user for hoverable Japanese; `p` tokens carry a **solid accent
  underline**. The view lede states the contract in one line: "Tap or hover any underlined
  word for its reading — the colored underline is the grammar pattern itself."
- **Furigana first, hover second.** ふり renders `<ruby>` from per-segment `f` via the
  existing `rubyHTML()` — the ZERO-interaction way to "look at kanji", mobile-primary.
- **Keyboard — no per-token tab stops** (the phrases-anki roving lesson): a visible example
  sentence is ONE tab stop; **←/→ move a token cursor over OBJECT tokens only** (inert
  strings are not stops); the inspect surface follows; Escape dismisses. **SR contract
  (round-2 blocker fixed):** a static sr-only live region SIBLING of the grammar root (the
  #ankLive lesson — a live region inside an innerHTML-rebuilt root never announces), ~200ms
  coalesce, announces on every cursor move: reading — gloss — "n of N" (N = object-token
  count), and on strip open/close and ◆ toggles. P2 keys off it; it is NOT a phase-10 audit
  item.
- **Touch — no floating popovers on tokens:** tap a token → **gloss strip pinned below that
  sentence** (the same live region announces it); tap a neighbour moves the strip (mis-taps
  self-correct); tap elsewhere / ✕ dismisses. Tokens get ~2.2 line-height + padding. **Card
  disclosure triggers on the header `<button>` ONLY.**
- **ARIA semantics pinned (round-2 fix):** the card disclosure header button is the ONLY
  `aria-expanded` in the feature. The hover popover = tooltip (`role="tooltip"` +
  `aria-describedby`, hides on mouseleave/Escape — the lang.js model). The tap/keyboard strip
  = toggletip: NO `aria-expanded` (per the ARIA pattern), announced via the live region,
  focus never moves (so no focus-return problem). Grammar flavor (on `p` tokens): connection
  rule, breakdown, nuance, level chip, the token's own `g` when present, link to the card.
- **Search (fields explicit, round-2 fix):** matches **`pattern` (kanji substring — the
  field the user SEES and will type)**, derived kana reading, **romaji** via the pure
  kana→Hepburn transliterator in lib/grammar.js (node-tested), and `meaning` (EN). **Scope:
  GLOBAL** — focusing the search box lazily fetches the remaining level files in the
  background (~500KB gz worst case, once, SW-cached); results group by level with level
  chips. Browsing stays one-level-lazy; search is corpus-wide or it silently lies.
- **Progress — ✓/◆ two flags (owner reconfirmed):** ✓ studied + ◆ shaky per point;
  per-level "34/103" progress bar; ◆ filter chip in the toolbar with the active level's count
  ("◆ 12"); `jwh-grammar-v1 {v, done[], shaky[]}`. No SRS. ◆'s eventual consumer: export
  ◆ → Anki TSV (v1.1, toAnkiTSV exists); ✓ is owner-wanted bookkeeping (known trade-off).
- **Motion — positive spec (round-2 fix: "little animations" is an ask to DELIVER, not only
  to defend against).** Frequency-gated where it fires constantly, present where it's
  occasional: hover tooltip enters INSTANTLY (fires hundreds of times while reading);
  tap/keyboard strip 120ms scale(.96→1)+fade; **level-tab underline slides** (spring, the
  design-principles tab rule); **ふり toggle cross-fades the ruby in** (~160ms opacity);
  **◆ press pop** (scale 1→1.12→1, ~200ms); card stagger on tab switch (20ms, cap ~8);
  disclosure = .c-disclosure pattern. NO exit animation on the tooltip/strip (dismiss is
  instant); modals/overlays keep their normal exits. All reduce-motion-killed, WAAPI JS-gated.

## The 10 phases (each = one PR, verified per specs/verification-harness.md)

Phasing principle: the headline feature ships against seed data BEFORE any bulk bake — the
segmented schema is proven by phases 2–4 on ~12 points, so 2,000 sentences are never authored
against an unproven consumer. The count is a map, not a straitjacket: N1 may split → 10a/10b.

1. ✅ #121 (2026-07-10) **Foundation** — schema + validator + lib/grammar.js (readingOf, transliterator, filter/
   search — node-tested) + route shell (HIDDEN, TITLES, view container, phrases cross-link,
   guide `<li>`) + lazy fetch lifecycle + SW (generalized SWR predicate + `caches.match(e.request)`
   fallback + precache + bump). Seed: **grammar-n5.json, ~12 exemplar points incl. ≥1
   non-contiguous pattern (も〜ば〜も) and ≥1 contentful-kanji `p` anchor (場合)** as schema
   acid tests.
2. ✅ #122 (2026-07-10) **Browse UI + furigana** — level tabs, cards (header-button disclosure, chunked append,
   content-visibility), **final `.gtok` token DOM emitted HERE** (round-2: the ruby render
   and the P3 cursor share one DOM — no P2→P3 re-emit), ふり toggle (KEYS.furi reuse), live
   search (pattern/kana/romaji/EN, global scope w/ background fetch), counts, empty/error
   states, the lede contract line, static live region sibling.
3. **Token inspect layer** — desktop tooltip + touch gloss strip + keyboard token cursor
   (object-token stops, SR announcements through the live region) + NO_SWIPE entry +
   `jwh:popover-open` w/ owner field (lang.js dispatch + listener) + lookupWord/GLOSSARY
   fallback.
4. **Grammar inspect layer + motion** — `p`-token solid underlines + grammar flavor popover +
   the full positive motion set + reduce-motion verify.
5. **N5 bake (~100 points)** — against the proven consumer. ≤50-point commits, a dedicated
   reading-accuracy pass per batch (rendaku, on/kun — the validator can't catch
   wrong-but-well-formed readings).
6. **✓/◆ tracking** — both toggles (✓ studied, ◆ shaky) + press pop, per-level progress bar,
   ◆ filter chip + count, KEYS.grammar registration, backup ride-along test.
7. **N4 bake (~130).**
8. **N3 bake (~200, 2 batches).**
9. **N2 bake (~200, 2 batches).**
10. **N1 bake (~250, 2–3 batches; split to 10a/10b if fatigue says so) + full regression** —
    14-surface sweep, contrast both themes, a11y pass (cursor announcements, disclosure
    aria-expanded, SR on filter changes), offline check, retro + memory update.

## Risks

- **Reading accuracy at scale** — ~2,000 sentences of authored `f` segments; validator checks
  shape, not truth. Mitigation: ≤50-point commits, reading-only review pass per batch,
  confidence flags, owner flags anything stiff.
- **Data PR fatigue** — five bake phases. Validator + per-level screenshots + SW-bump
  checklist; batches keep them reviewable.
- **Two popover systems** — the owner-field contract is tiny but load-bearing; P3 tests both
  systems live on one page (hover nav accents while a grammar popover is open).

## Parked (not v1)

Export ◆ → Anki TSV · conjugation drills · sentence audio · JLPT mock-question mode ·
per-kanji decomposition popover.

## Review log

- **Round 1** (3 blind critics: data-reality / architecture / UX-a11y — all DO-NOT-SIGN-OFF):
  size est. ~3× low & gz-vs-disk confused → per-level files + honest numbers; flat token array
  couldn't express non-contiguous patterns → `p` flags; lang.js collision is selector-level
  (global `.jp` delegation), GLOSSARY not exported → own selectors + cross-dismiss + correct
  imports; wrong lazy precedent → phrases lazy-import + full lifecycle; SW strategy unpicked,
  "pure-data PR" contradicted CACHE bump → SWR + owned bump; per-token tabindex contradicted
  the phrases-anki roving lesson → sentence-level cursor; no touch model → furigana toggle +
  pinned gloss strip + header-only disclosure; tooltip/toggletip conflated → named; romaji
  search un-parked; ✓/◆ questioned; hover-enter animation vs frequency gate → instant on
  hover; motion/progress unbundled; KEYS + esc() explicit; UI-before-bulk-bake reorder.
- **Round 2** (2 fresh critics: technical / UX-product — both DO-NOT-SIGN-OFF; all round-1
  fixes verified as settled): **whole-token `r` can't place okurigana ruby & ignored the
  repo's existing furigana stack** → per-segment `f` + rubyHTML/KEYS.furi/.furi-off reuse +
  derived reading; SR contract for the keyboard cursor was missing → static live-region
  sibling + announce-on-move; **✓→◆ silently overrode an owner decision** → loud OPEN
  QUESTION gate; discoverability blank → toolbar toggle + underline affordances + lede
  contract line; aria-expanded pinned to disclosure only; search fields made explicit incl.
  `pattern`, scope made global-with-background-fetch; chunked rendering for 200-card tabs;
  "usable at phase 5" expectation set; positive motion spec restored (tab underline, ふり
  fade, ◆ pop); popover ping-pong → owner field + self-ignore; SW cold-cache fallback →
  `caches.match(e.request)`; NO_SWIPE entry; `g` allowed+rendered on `p` tokens; P2 emits
  final token DOM.
- **Round 3** (1 convergence critic, combined lens): **SIGN OFF — zero blockers/majors.**
  Every round-2 load-bearing claim spot-verified against real code (rubyHTML segment shape,
  sw.js:44 hardcoded fallback, NO_SWIPE `[data-no-swipe]` support, showFor re-fire making the
  self-ignore guard necessary-and-sufficient, P2/P3 seam, readingOf derivation, backup
  ride-along via set()-serialization). Three minors folded in: KEYS.furi string-sentinel
  contract stated; progress state must use set() (JSON) for backup; line-ref nit. Owner
  re-confirmed ✓/◆ two flags explicitly.
