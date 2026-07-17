# Grammar Mastery Program — 15 rounds to JLPT-master (2026-07-17)

Owner: "come up with a 15 round program that takes the best course teaching components and
create a program for learning all the grammar … i want to be a jlpt master by the end of this.
also let's add anime reference if possible, it'll make it easier for me to learn. … i want
this stuff to go in the phrases section in the plan or maybe it's own section. decide what's
best." REVISED twice under adversarial review (round 1: 4 critics; round 2: 3 critics — log
at bottom).

Research base (5 Opus researchers, 2026-07-17): course-pedagogy survey (Bunpro / WaniKani /
Genki-Tobira / Cure Dolly / Game Gengo / Marugoto / Satori / 新完全マスター), learning-science
evidence review (20 design rules), JLPT exam-mechanics report (formats, scoring, 2026-27
logistics), full codebase audit, anime×grammar report (52-line catchphrase map + yakuwarigo
register system + copyright doctrine).

## What "JLPT master" means here, honestly

- The corpus is the app's **353 baked points** (N5 82 · N4 86 · N3 72 · N2 66 · N1 47 —
  verified against data; CLAUDE.md's "352" is stale and gets fixed in R1's PR) — a curated
  synthesis, not the ~840-pattern union of every community list. Mastering all 353 plus
  exam-format fluency is genuine N1-grammar-section readiness; the doc says "353", never
  "all grammar that exists".
- **Mastered** = the point passed its **gate**. Once a point reaches Deep, its next
  scheduled reviews run in **gate mode** — timed (~20 s), hint-free — and 3 consecutive
  gate-mode passes on **distinct example sentences** complete the gate. Gate checks ride
  the normal review schedule (Deep intervals are weeks apart, so "≥3 sessions" is
  automatic and the gate consumes zero extra queue budget). Machine-scored — self-rating
  is never the gate signal. **Gate mode is per-point, keyed on register, not just level**:
  typed production for standard points; **recognition** (timed MCQ/scramble) for N1 points
  AND any point carrying the `written-formal` flag (における-type patterns are
  reading-recognition grammar at any level — production-gating them would be fake rigor;
  the JLPT itself is 100% multiple-choice).
  *Satisfiability, verified:* today every point has exactly 2 examples (706/353 — round-2
  critic finding), so **R5's enrichment sweep authors a third example per point**; the gate
  is only live from R10 &gt; R5, so the 3-distinct-examples requirement is guaranteed by
  data before the gate can ever run.
- Hours honesty: at ~20–30 min/day the schedule below reaches *all 353 seeded* between
  mid-Oct and mid-Nov 2026 (test-out-rate dependent, assumptions stated in the overlay).
  Gates complete ~6–10 weeks after each point reaches Deep, so *all gates passed* lands
  around **Jun 2027** (tail into early Jul possible — the R15 pacing tab tracks the
  projection honestly). That's grammar only — it does not promise an N1 *pass*
  (vocab/reading/listening are their own mountains). It does promise: walk into the
  grammar section of any level and it's the easy part.

## Exam anchors (verified 2026-07-17; confidence medium — re-verify at registration)

- **Dec 6 2026** (Sun) — first realistic sitting. Registration ~**late Aug–mid Sep 2026**,
  fills in days; from 2026 test-takers in Japan MUST hold mid/long-term residence status and
  enter a 在留カード number — the WHV card is issued at NRT on landing (verified: airport
  issuance at NRT/HND/KIX/Chubu), so it exists before the window; do the 14-day address
  registration promptly (this, not any grammar mechanic, is the single point of failure for
  the Dec sitting). Target: **N3**.
- **Jul 4 2027** (Sun) — registration ~mid-Mar–early Apr 2027. Target: **N2** (N1 grammar
  fully covered by then; sitting N1 vs N2 is the owner's call in spring).
- These dates/deadlines get BAKED into `tips.json` (`timeSensitive` + `calendar`) in **R2**
  — a tiny data addendum shipped in July, so the existing bell nags the Dec registration
  from day one of the window (round-2 fix: R12 would have been two months too late).

## Placement: its own section (DECIDED, owner asked "phrases or its own — decide")

**`#/study` is its own route**, not a phrases sub-surface. Reasons: (1) phrases-anki is the
imported Core-2000 *vocab* refresher, deliberately answer-always-visible ("a fast refresher,
not a review session" — owner, 2026-07-10); the grammar trainer is the opposite contract
(production-first, scheduled, graded) — one page hosting both contradicts itself and the
phrases page already carries two surfaces. (2) Different data (your .apkg vs baked grammar),
different state keys, different session semantics. (3) A daily gym deserves its own
`document.title`, deep link, and keyboard scope. It joins the Japanese-learning cluster as a
sibling: registered `HIDDEN` alongside `phrases`/`grammar`, linked prominently from the
**Survival Japanese hub, the grammar page header, a phrases-page cross-link chip ("Grammar
gym →"), and the R11 dashboard widget** (the real daily front door). If it earns nav-bar
status after a month of use, promoting `HIDDEN`→`ROUTES` is a two-line change.

## The teaching model (what we stole, from whom)

1. **Typed cloze on real sentences** (Bunpro) — the review spine; the `p`-anchored token
   model already marks the pattern span in every baked example (verified: 706/706 examples
   carry ≥1 `p` token, validator-enforced), so cloze generation is free. R5 enriches every
   point from 2 to **3 examples** — the Game-Gengo multiple-contexts principle (a pattern
   seen across varied sentences is learned as a pattern, not a memorized sentence), and
   what makes the 3-distinct-example gate satisfiable.
2. **FSRS-lite scheduling with a legible stage ladder** (Anki/FSRS × WaniKani's *idea* of
   named stages — names are our own: **Seed → Sprout → Young → Mature → Deep → Mastered**,
   derived from stability thresholds; "Mastered" additionally requires the gate above).
   Power-law memory model (per-point D/S, published default weights folded to constants,
   desired retention 0.90) under the hood. One scheduler; a dual scheduler was rejected.
3. **3-beat lessons before SRS** (Genki/Tobira): rule card → guided recognition → first
   typed production; blocked intro, *then* interleaved review (the evidence's two-phase rule).
4. **Confusable co-scheduling + contrast drills** (新完全マスター + interleaving research,
   d≈0.64 on confusables): は/が, に/で, そう/らしい/ようだ, ば/たら/なら/と drilled
   *against* each other. The R8 "nuance duel" deliberately masses one *pair* for
   discrimination training (≤1 duel per session) — a bounded, flagged exception to the
   interleaving rule, which otherwise forbids massed same-point repetition.
5. **★ scramble (文の組み立て)** (JLPT) — auto-generated from token arrays; `dnd.js` already
   does keyboard-accessible drag-reorder. 96.7% of examples have ≥5 tokens; a per-POINT
   guard degrades the 2 known points with no scramble-able example (`n4-te-sumimasen`,
   `n4-nakya`) to cloze/MCQ only.
6. **4-choice 文法形式 with authored confusable distractors** (JLPT + Shin Kanzen) — the
   exam's signature difficulty is near-synonym traps; random distractors are fake practice.
7. **Passage cloze 文章の文法** (JLPT) — the one format that cannot be synthesized from
   per-point data; gets an authored passage bank (with a no-recent-repeat window, like the
   MCQ generator).
8. **Ghosts + leeches** (Bunpro/WaniKani's biggest gap, fixed): lapsing points haunt on a
   tight sub-schedule; ≥5 lapses → Leech deck, surfaced, never silently clogging.
9. **Progressive hint ladder** (Bunpro): EN gloss → structure hint → first kana → reveal.
   **The anime peg is NOT a hint tier** (it contains the target pattern verbatim — as a
   pre-answer cue it would replace retrieval with recognition); pegs appear in lessons and
   in post-answer feedback only.
10. **Review-debt protection** (the #1 SRS quit-cause): daily review cap (default 45),
    **overflow re-spread** (cap overflow reschedules by retrievability, most-forgotten
    first — bounded: a card defers at most twice, then it enters the session even over cap,
    so chronic deferral can't rot into a hidden debt spiral) and **lapse amnesty** (after
    missed days, the backlog re-spreads over the following week instead of dumping). Streak
    = "days shown up", 2 auto-freezes/month.
11. **Anime pegs** (Game Gengo + episodic-memory research): a famous line the owner already
    carries is the retrieval peg; original in-style drill sentences do the work.
12. **Register honesty** (yakuwarigo research): per-point **`flags[]`** — independent,
    combinable values from a validator-enforced vocabulary: `anime-common`,
    `casual-spoken` (contracted/colloquial forms — 〜なきゃ, 〜ちゃう: fine with friends,
    wrong in writing and formal speech), `written-formal`, `yakuwarigo-recognize-only`,
    `rude-in-life`, `keigo-critical`. **Absence of flags = standard neutral-polite** —
    defined, not implicit. Axes co-occur by design: 〜てやる is `anime-common` AND
    `rude-in-life`. `written-formal` also switches the point's gate to recognition mode
    (above). Named `flags` (not `reg`) to avoid confusion with the existing prose
    `register` field.

### Session & grading contract (the arbitration rules, spec'd in R1's lib, unit-tested)

- **Typed correctness decides pass/fail.** Wrong → Again, automatically. Correct → the
  learner picks Hard/Good/Easy (buttons only appear after a correct answer).
- **Close-match** (Levenshtein ≤1 after kana-fold/NFKC) → "take it?" accept caps the grade
  at **Hard**. Never self-graded up to Easy.
- **Hints cap the grade**: gloss/structure hint → max Good; first-kana → max Hard; reveal →
  Again. One precedence chain, no ambiguity.
- **Session math, honest**: cap 45 reviews × ~15–25 s ≈ 11–19 min, + 4 lessons ≈ 6–8 min →
  **~20–30 min worst case**; steady-state due load is well under cap most days. The cap is
  a settings dial; the contract is "bounded and honest", not "always 15 minutes".
- **The drip throttle is a day-level valve, not a deadlock**: lessons pause when due-load
  crests (&gt; cap·0.8) and resume as the cohort's stability grows; R1's simulation asserts
  full-corpus seeding still completes by mid-Nov in the worst modeled case (heavy seed +
  heavy test-out week).

### Anime content doctrine (amendment to the "all examples ORIGINAL" rule)

New per-point `peg` field, separate from `examples[]`:
`{ ja, romaji, en, source:"One Piece — Luffy", kind:"verbatim"|"styled" }`.
**Verbatim pegs**: catchphrase-length — validator-capped ~40 chars, one line, always
attributed, always wrapped in our grammar commentary. This is the Game-Gengo posture,
risk-ranked LOW (a fair-use/引用-aligned posture, not a legal guarantee) for a
non-commercial educational repo; some of the researched 52 seed lines will be trimmed or
dropped by the cap — the cap wins. **Styled pegs**: original sentences in a named
character's voice (N2/N1 mostly, since formal grammar is anime-thin). NEVER: multi-line
dialogue, lyrics, images, audio clips, subs. `examples[]` drill sentences stay 100%
original. Every peg runs the validator + a reading-accuracy critic before baking.

## Architecture

New hidden route **`#/study`** (registered like grammar: `HIDDEN`, `TITLES`, view div,
lazy-mount on `jwh:route`). New modules: `lib/study.js` (pure scheduler + queue + grading
arbitration, Node-tested), `lib/questions.js` (pure generators: cloze/scramble/MCQ/passage,
Node-tested), `study.js` (session runner UI), later `study-exam.js` (mock mode, lazy). One
new store key **`jwh-study-v1`** `{v, points:{[id]:{D,S,last,due,stage,reps,lapses,ghost,
gate}}, log:[ring], settings:{newPerDay,capReviews,streak,freezes}}` (~55 KB at full corpus —
negligible against the 5 MB budget) registered in `KEYS`; backup.js prefix-walk covers it.
**Shape-growth policy** (owned here, not discovered later): any round that grows the record
shape bumps the key suffix and ships a migration in the same PR; R1 builds the
`migrate(vN→vN+1)` scaffold and the ✓/◆ import is its first use. Data extensions live in
`grammar-n*.json` (new optional fields: `confusable[]`, `distractors[]`, `peg{}`, `flags[]`,
a third `examples[]` entry — each landing with its validator extension in the round that
authors it; unknown fields don't break the current validator, verified). Bell/calendar
integration uses the existing `buildItems()` / `KEYS.events` seams (verified present).
Every asset round bumps SW `CACHE` + `ASSETS` (called out per-round for new JS files); new
*data files* also extend the SWR regex (`sw.js` line ~34). **CLAUDE.md and `i18n.js` frame
strings are updated in any round that adds a module/route/key/heading** (both owned
per-round, not deferred — round-2 fix closed the i18n hole). Everything offline, zero deps.

**Seeding (existing ✓/◆ state, respected without self-sabotage):** ✓ points import at
Young-equivalent with due dates **staggered over 21 days** (deterministic by id hash) —
~200 ✓ (if that's the real count; it's device-local and unverifiable from the repo, so R2
treats it as 0..353) adds only ~10 due/day. Test-outs land at Mature (~2-week due), adding
~5–7/day even in a heavy placement week. Combined load stays under the cap with the
throttle valve absorbing crests (simulation-asserted, above). ◆ imports as ghost. If
`done[]` turns out sparse, day-one value comes from R3's placement sweep instead — the
early-value claim does not depend on the assumption.

---

## The 15 rounds

Each round = one PR (branch → PR → squash-merge, per repo prefs), implementation plan
written at execution time. **R5 and R15 are the two flagged may-land-as-2-stacked-PRs
rounds** (R5: data sweep N5–N3 / N2–N1; R15: analytics / hardening). R1 is the most likely
to overrun — its natural split seam is scheduler+stages vs queue+gate+arbitration.
**Usable from R2.**

### R1 — The engine: `lib/study.js` (pure, no UI)
FSRS-lite: per-point `{D,S}`, power-law retrievability, default weights as constants,
desired retention 0.90; stage thresholds (Seed→…→Deep) from S; gate state machine — at
Deep, scheduled reviews run gate-mode (timed, hint-free; production or recognition per
point flags/level), 3 consecutive passes on distinct examples → Mastered, a failed gate
demotes S; grading arbitration exactly as the contract above; lapse → relearn + stability
penalty; ghost sub-schedule (10m/1d/3d until 2 clean); leech at 5 lapses, auto-suspend at
8 with nudge. Queue builder: due-first, cap 45, overflow re-spread (max 2 deferrals per
card), lapse amnesty, drip 4/day throttling to 0 when due &gt; cap·0.8, confusable/related
co-scheduling hook, interleave shuffle (no massed same-point repetition — duels are the
flagged pair-exception), staggered ✓/◆ seed import via the migration scaffold. ~20 unit
tests incl. a simulated 400-day run asserting bounded daily load, no card deferred &gt;2×,
and worst-case seeding completing by mid-Nov. Also: CLAUDE.md 352→353 fix.
**Verify:** `node --test` green; simulation fixtures pass.

### R2 — Session runner: `#/study` MVP + exam anchors baked
Route + lazy mount + view div (+ `TITLES`, `nav.*` i18n strings, SW `ASSETS` + `CACHE`
bump for `study.js`/`lib/*`). Bounded session → typed-cloze cards (blank `p` tokens; kana
input; accepts surface `t` or reading via `readingOf`; kana-fold + NFKC; close-match flow
per contract), immediate feedback with full example (ruby via `rubyHTML`, `.gtok` inspect
layer reused), post-correct grade buttons + keyboard (scoped to container, root in
`NO_SWIPE`), session summary, mobile bottom bar + tap zones, static-sibling live region.
Seeds ✓/◆ on first run (staggered). **Plus the exam-anchor bake**: JLPT dates +
registration windows into `tips.json` (`timeSensitive` **with `dueBy` on each entry** — the
bell rides `timeSensitive.dueBy`, not `calendar` — plus `calendar` entries for the calendar
surface, confidence-flagged) — pure data, ~10 lines, ships in July so the bell nags the
late-Aug Dec-registration window on time.
**Verify:** full session desktop+mobile emulation, no console errors; seeded review
round-trips to a future due date; focus restore across rebuilds; json.tool green;
registration deadline visible in the bell.

### R3 — Lessons: 3-beat onboarding + placement sweep + test-out
"Learn" tab: today's 4 new points (level-ordered N5→N1, `related`-aware prerequisites
first; **exam-priority lever** — when a sitting is registered, that level's unseeded
points jump the queue, **pulling their unseeded `related` prerequisites along with them**
— the lever never front-runs a prerequisite). Per point: rule card
(pattern/connection/meaning/nuance/register/caution — all baked) → 2 guided-recognition MC
taps → 1 typed cloze → enters at Seed. **Placement sweep**: per-level rapid triage
(self-sort known/unknown, ~5 min a level) that queues test-outs. **Test-out**: 2 timed, hint-free
checks **in the point's gate modality** (typed clozes normally; recognition items for
N1/`written-formal` points) on distinct examples (from R8 on, +1 confusable MCQ) → lands at
**Mature with ~2-week due** — hard enough to resist guessing, without re-flooding weekly
reviews for material the owner demonstrably knows; a false positive fails its ~2-week
review and demotes normally.
**Verify:** drip/throttle honored; test-out and lever-prerequisite closure unit-tested;
lesson→review handoff under a mocked clock.

### R4 — ★ scramble + interleaving on
`lib/questions.js` scramble: group tokens into 4 natural chunks (pattern span whole,
crossing ≥1 boundary where possible); corpus-wide test asserts validity for ≥95% of
examples; per-point guard degrades scramble-less points (the known 2) to cloze/MCQ. UI:
drag (dnd.js) + tap-to-place + keyboard; report-the-★-slot scoring. Mixed in for points ≥
Young. Confusable co-scheduling on via `related[]` (308/353 points have entries; full
coverage arrives with R7's graph).
**Verify:** corpus-wide generator test; dnd keyboard path; format mix by stage asserted.

### R5 — DATA: the corpus enrichment sweep (pegs + flags + third examples)
Validator extension first (peg shape, attribution required on verbatim, ~40-char cap,
`flags[]` vocabulary incl. `casual-spoken`, examples 1–3→exactly-3 for enriched points),
(if the round lands as its 2-stacked split, the validator extension rides the FIRST PR of
the stack), then ONE authoring sweep across 353 points: `peg` (verbatim where a genuinely famous line
exists — the researched 52-line map is seed and quality bar; styled in-character
otherwise), `flags[]`, and a **third original example sentence** per point (full token
model: furigana segments, glosses, `p` anchors — same bar as #138), which the gate and the
multiple-contexts principle both require. Accuracy critic over every peg and every new
sentence (the #138 pipeline). Data-only round; flagged may-land-as-2-stacked-PRs
(N5–N3 / N2–N1).
**Verify:** validator green over all 5 files; critic pass logged; spot-check 20 pegs
against sources; corpus assertion: every point now has 3 examples.

### R6 — Peg + register UI
Peg renders on lesson rule cards, expanded reference cards, and post-answer review feedback
(attributed, styled distinctly). `flags[]` badges + filter on `#/grammar` and lesson cards.
Archetype→register cheat-sheet as a grammar-page disclosure, **visually split into two
halves**: "master and produce" (keigo ladders — the Tokyo-workplace prize) vs "recognize,
never reproduce" (yakuwarigo: ojou-sama ですわ, delinquent やがる, old-sage じゃ …) — the
two are opposite instructions and must not share a banner. i18n strings for new headings.
**Verify:** page renders clean; filter works; badges match data; no `.jp` collisions.

### R7 — DATA: confusable graph + authored distractors
Per point: `confusable[]` (symmetric ids; clusters authored deliberately: purpose
ように/ために, conditionals ば/たら/なら/と, evidential そうだ(伝聞)・らしい・ようだ(推量)
— labeled per sense: 伝聞そうだ = hearsay, らしい = inference from external evidence
(with a hearsay flavor — not pure hearsay), ようだ = conjecture/appearance; 様態そう
clusters with ようだ/みたい on the appearance axis; obligation cluster; N2 causal nuance ばかりに/だけに — あまり sits
in the degree cluster) and `distractors[]` (2-3 authored wrong surfaces where confusables
can't fill a 4-choice set). Validator: referential integrity, no self-refs, distractor ≠
any valid answer.
**Verify:** validator green; corpus-wide test: every point can assemble a 4-choice set;
critic samples trap quality.

### R8 — 文法形式 MCQ + nuance duels
MCQ generator (blank pattern, 4 choices = answer + confusables/distractors, same-level
fallback, shuffle, no-repeat window). **Nuance duel**: two confusable points, 6 rapid
"which fits?" sentences — the bounded massed-pair exception, ≤1 per session, launchable
from any grammar card ("vs. 〜ように" chip). Both formats join the stage mix; test-out
gains its third item (confusable MCQ) here.
**Verify:** generator unit tests (distractor precedence, dedupe); duel from reference page;
duel-per-session bound asserted.

### R9 — Hints, ghosts, leeches (struggle UX)
Hint ladder UI per the contract (peg excluded); hint→grade-cap coupling (lib, tested).
Ghost lifecycle UI (haunted badge, tight reps). Leech tab: leeches with their confusables +
"duel it" shortcut; suspended leeches surfaced with a nudge, never silent. ◆ cross-populates.
**Verify:** hint caps tested; scripted-lapse leech surfaces; suspended point never in queue.

### R10 — The Mastered gate goes live
Gate-mode reviews switch on for Deep points (the R1 state machine, now surfaced: timer
ring, "gate check" framing, per-point production-vs-recognition mode from flags/level).
Because gates ride scheduled reviews, corpus-wide gating costs zero extra daily load; a
point completes its gate ~6–10 weeks after reaching Deep (3 Deep-interval reviews).
**Sentence-build practice** ("decline an invitation politely using 〜わけにはいかない",
model-answer compare) ships here as *practice only* — explicitly not a gate signal.
**Verify:** gate transitions incl. demotion tested in lib; simulation asserts gate
completion tracks the Jun-2027 projection; sentence-build renders with model compare.

### R11 — Habit dashboard
Dashboard study widget (due count, streak flame = days-shown-up, freezes, per-level
goal-gradient rings "N4: 61/86 mastered"); bell `reviews due` via the `buildItems()` seam
(one source branch, ids encode `@date`, no double-count with checklist dueBy);
`celebrate()` on Mature stage-ups, gate passes, and level completions. i18n widget strings.
**Verify:** bell shows due next morning (lib clock test); widget honors reduce-motion; no
alert double-count.

### R12 — DATA: passage bank v1 (N5–N3)
Authored original passages (~10/level: konbini notices, ward-office letters, share-house
emails, Tokyo diary), 4-5 tagged blanks mixing grammar with discourse (conjunctions,
demonstratives, sentence-final register), authored discourse distractors. New
`grammar-passages.json` + validator + SW ASSETS + **SWR regex extension**. Passage
selection gets a no-recent-repeat window. Targeted late Oct.
**Verify:** validator green; blank uniqueness critic pass; passage drill playable.

### R13 — Mock exam mode
`study-exam.js` (lazy; SW ASSETS + CACHE bump): timed grammar-section simulation per level,
authentic composition (N3 ≈ 13 形式 + 5 ★ + 5 passage; N1 ≈ 10/5/5), exam numbering,
feedback only at the end. Report: raw → indicative band, explicitly labeled **"Language
Knowledge (vocab+grammar) shares the 19/60 sectional floor — this mock covers the grammar
half only"** (never "you've cleared the section"); per-format + per-cluster breakdown;
time-per-question vs budget (the ★ time-sink warning). Results to the ring log for R15's
trendline. **Targeted early Nov** — the plan promises ≥2 full N3 mocks before Dec 6
(weekly if it lands earlier); daily timed ★ drills carry format practice regardless.
**Verify:** counts/timers match spec; report math unit-tested; full N5 mock offline.

### R14 — DATA: passages v2 (N2/N1) + keigo-critical coverage
Advanced passage bank (editorial/business register — where N2/N1 grammar lives), sized for
the spring taper (no-repeat window; grow the bank if mock cadence exhausts it). The
`keigo-critical` ★-flagged points get dedicated drill coverage through EXISTING formats
(cloze/MCQ items in business scenarios: interview, konbini shift, ward office) — content,
not a new trainer surface. (A standalone keigo trainer, can-do lens, and TTS shadowing were
cut in review as scope creep; a future kana-driven TTS via `readingOf()` — which would
dodge homograph misreads — is noted as a post-program idea, deliberately out of scope.)
**Verify:** validator green; keigo drills playable; flag badges link to the drill lens.

### R15 — Analytics, pacing, hardening, the Master moment (flagged: 2 stacked PRs)
**Mastery tab**: 353-cell heat grid (stage-colored, tap-through), weakest-cluster rollup,
leech history, estimated retention, mock trendline, exam-countdown pacing (projected
all-gates-passed date vs Dec 6 / Jul 4; one-tap re-pace adjusts newPerDay only via explicit
tap). **Hardening**: a11y (focus order, live regions, stage-color contrast), reduce-motion,
airplane-mode full session + mock, backup/restore round-trip of the study key, perf (no
boot regression), guide chapter, final CLAUDE.md/KEYS/SW/i18n sweep. Then the payoff:
**JLPT Master certificate** when all 353 gates pass — celebration sequence + a printable,
identity-free certificate card (stats: days, reviews, accuracy, five level rings at 100%).
(Certificate is the first thing cut if this round overruns.) Final adversarial audit of the
whole feature set.
**Verify:** verification-harness checklist vs `#/study`; airplane-mode session; certificate
fires on a seeded-complete fixture; projection math tested against simulated histories.

---

## Curriculum overlay (the human schedule the app enforces)

Assumptions, stated: (a) owner has meaningful prior N5/N4 exposure (grammar-reference study
pass + Core-2000) — placement sweep + test-out should clear a large share of the 168
N5+N4 points quickly; the plan does NOT assume a specific ✓ count; (b) if test-out clears
&lt;60% of N5+N4 by Sep 1, the exam-priority lever pulls N3 lessons (plus prerequisites)
forward anyway; (c) build cadence ~3 rounds/month through Oct, slower after.

| When | Build | Learner state |
|---|---|---|
| Jul–Aug 2026 | R1–R6 | Placement sweep week 1; drip 4/day + test-outs; exam anchors in the bell from R2; pegs land; **register for Dec JLPT late Aug** (bell nags on time) |
| Sep–Oct 2026 | R7–R12 | Confusable duels; gate-mode reviews from R10; N3 priority via lever; all 353 seeded mid-Oct–mid-Nov |
| Nov 2026 | R13 (early Nov) | ≥2 full N3 mocks + daily timed ★ drills; **Dec 6: sit N3** |
| Dec–Feb 2027 | R14 | N2 maturation + gates accruing; keigo-critical drills (job season); N1 recognition track |
| Mar–May 2027 | R15 | Pacing tab live before **early-Apr registration** (bell); N2/N1 mocks |
| Jun–Jul 2027 | — | All gates ≈ Jun (tail early Jul); taper + mocks; **Jul 4 2027: sit N2 (or N1 — owner's call)** |

Daily contract: one bounded session (~20–30 min worst case: ≤45 reviews + 4 lessons),
streak counts showing up, freezes cover bad days, overflow re-spread (bounded) + lapse
amnesty — never a debt spiral. The grammar reference page stays the browse/lookup home;
`#/study` is the gym.

## Constraints (inherited, binding on every round)

Zero-build vanilla ES modules, no new CDNs; every dynamic string through `esc()` (typed
answers especially); SW `CACHE` bump + `ASSETS` add every asset round (named in each
JS-adding round), SWR regex for new data files; new keys in `KEYS` with `-v1` + the
shape-growth migration policy (Architecture); CLAUDE.md AND i18n.js frame strings updated
in any round adding a module/route/key/heading; pure logic Node-import-safe and tested
from repo root; identity-free content; confidence flags on researched claims (exam dates
medium — "verify closer"); `.gtok`-not-`.jp`; popover cross-dismiss owner protocol; focus
restore across innerHTML rebuilds; `data-no-swipe` on interactive zones; live regions as
static siblings.

## Review log

**Round 1 (2026-07-17, 4 Opus critics: codebase-feasibility, pedagogy/curriculum,
scope/sequencing, exam+anime domain).** Codebase lens SIGNED OFF (every seam verified:
counts exact at 353, 706/706 p-tokens, all named APIs present; CLAUDE.md "352" stale).
Fixed from the other three: [pedagogy B1] ✓-seed at short due would throttle drip to 0 for
weeks → staggered 21-day seeding; [B2] 60-cap vs 15-25-min contract arithmetically
impossible → cap 45 + honest ~20–30 min contract with the math shown; [M1] stage-name
ambiguity → single ladder Seed→…→Deep→Mastered, gate defines Mastered; [M2] self-graded
mastery gate → objective machine-scored gate, sentence-build demoted to practice; [M3]
typed-vs-buttons arbitration → precedence contract; [M4] anime peg as hint leaks the
answer → peg removed from hint ladder; [M5/M6] unstated test-out assumptions + leniency →
assumptions stated, exam-priority lever, hardened test-out; [M7] gate built too late →
moved to R10; [scope M1-M4] oversized rounds → R5 data/UI split, habit round split, gate
round slimmed, keigo folded into R14; [scope M5] migration ownership → shape-growth
policy; [scope M6] cold-start → seeding independent of ✓ count; [scope M7 + domain]
can-do lens, TTS shadowing, standalone keigo trainer CUT (TTS also embeds homograph
misreads); [domain M1] single reg enum → independent `flags[]`; [domain minors] WaniKani
ladder names dropped, 19/60 mock labeling, copyright wording, 40-char cap governs, あまり
recluster. Rejected: cutting the certificate (cheap, owner-motivating, flagged cut-first).

**Round 2 (2026-07-17, 3 fresh Opus critics: pedagogy, scope, domain).** New evidence:
**every point has exactly 2 examples (353/353)** — the 3-distinct-example gate was
unsatisfiable corpus-wide [pedagogy F1, BLOCKER] → R5 sweep now authors a third example
per point (gate lives at R10 &gt; R5, so data precedes it); [F2] gate-sweep arithmetic
conflated 353 points with 1,059 checks → gates now ride scheduled Deep reviews (zero extra
load), projection restated as ~Jun 2027; [F3] pre-R7 test-out demanded 3 examples → 2
timed hint-free clozes, +MCQ from R8; [F4/F6] test-out Young landing re-flooded known
material and strained the throttle → lands at Mature/~2-week due, load model updated,
simulation asserts worst-case seeding; [F5] lever vs prerequisites precedence → lever
pulls prerequisites along; [F7] duel exemption mislabeled → interleave rule restated as
no-massed-same-point, duels the flagged pair-exception; [F8] unbounded overflow deferral =
renamed debt spiral → max 2 deferrals per card, then over-cap entry; [scope M1] exam
bake in R12 missed the Aug registration window it exists for → moved to R2; [scope M2]
i18n ownership hole → per-round rule added; [scope M3] "pre-R7" MCQ off-by-one → R8;
[scope M4] "weekly mocks" not guaranteed → R13 targeted early Nov, promise softened to
≥2 mocks + daily drills; [scope minors] SW bumps named in R2/R13, R1 flagged
most-likely-to-overrun with split seam; [domain M1] flags[] missing the casual pole +
undefined default → `casual-spoken` added, no-flags = neutral-polite defined; [domain M2]
gate keyed on level while rationale is register → `written-formal` points recognition-gate
at any level; [domain minors] cheat-sheet split produce-vs-recognize, passage no-repeat
window + advanced bank sizing, evidential cluster relabeled (ようだ = conjecture, not
hearsay). No round-2 finding was rejected.

**Round 3 (2026-07-17, 3 fresh Opus critics — final): ALL THREE SIGNED OFF.** Zero
blockers/majors. Pedagogy: gate state machine coheres ("gate-mode" qualifier does real
work — practice items neither count nor reset), Mature/2-week test-out landing consistent
with stage-S semantics, Jun-2027 tail judged optimistic-but-honestly-hedged. Scope: all
~60 R-number cross-references clean, all dependency chains resolve, bake-move fully
covered by inherited bell GC/dismissal semantics; independently re-verified 353 points /
2-examples-each / 706 p-tokens / SWR regex state. Domain: all round-2 fixes landed
correctly. Non-gating minors applied post-sign-off: test-out now uses the point's gate
modality (recognition for N1/`written-formal`); らしい relabeled inference-from-evidence
(not pure hearsay) with 様態そう noted on the appearance axis; R2 bake names the
`timeSensitive.dueBy` requirement the bell depends on; R5's validator extension pinned to
the first PR of its stack. Noted, not acted on: keigo-critical∧written-formal points
recognition-gate (defensible — written keigo is template-like); "neutral-polite" default
naming; やがる sits in yakuwarigo column though it's productive vulgar speech (the
"never reproduce" instruction is safe either way).
