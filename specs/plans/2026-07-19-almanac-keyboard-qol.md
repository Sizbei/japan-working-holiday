# The Grammar Almanac — Keyboard & QoL Program (5 rounds) — 2026-07-19

Owner: "quality-life updates with keyboard keys and shortcuts to improve the experience.
research how other courses do it. then create a 5-round program on improvement." REVISED once
under adversarial review (3 Opus critics: codebase-feasibility, keyboard-UX/a11y/IME,
scope/sequencing — log at bottom).

Research base (3 Opus agents): SRS/flashcard keyboard conventions (Anki, Bunpro, WaniKani,
Duolingo, jpdb, Quizlet, Kahoot), course/web-app keyboard UX + WCAG (Coursera/edX/Khan/
Codecademy, command palettes, single-key + sequence shortcuts, ? overlay, roving tabindex,
WCAG 2.1.4), and a full audit of the app's current keyboard layer (all factual claims below
verified against the code).

## The one hinge (why a typed-Japanese trainer is special)

In a typed-cloze reviewer **the kana input is focused for the whole pre-answer phase**. That
single fact decides the design:
- A **bare letter/digit key must TYPE, never command, while the input is focused** — so bare
  keys (R replay, E sentence, A autoplay, digit-grade) can only act **post-answer**, once the
  input has blurred and focus sits on a card/button. Anything needed **pre-answer** (Hint,
  reveal, skip) is a **labelled control + `aria-keyshortcuts`**, never a bare key (and not
  Option/Alt combos either — Option+H types a dead char `˙` on macOS, the same failure).
- The consistent cross-card invariant is **"advance," not "reveal"**: on typed cards **Enter**
  reveals (after the IME finalizes), on non-typed reveal cards Space reveals; **Space =
  advance post-answer *only when focus is not on a control*** — when a grade/Continue button is
  focused, Space/Enter **fall through to native activation** (the existing BUTTON-fallthrough
  guard), so `resolveKey` returns `null` for nav/grade keys when `targetKind==='button'` to
  avoid a double-advance. Digits pick options on MCQ. (Do not promise "Space=reveal"
  universally — it can't hold while a field is focused. This corrects the first draft.)
- **IME:** `if (e.isComposing || e.keyCode === 229) return;` before any key logic. The first
  Enter finalizes 変換 (guarded), a later Enter submits; the **submit→continue transition is
  debounced** (ignore Enter for a tick after the card rebuilds) so one keypress never submits
  AND skips past the result. **Finalize-side fallback (not just a test):** because Safari/mobile
  have historically mis-set `isComposing` on the finalize-Enter, submit also requires the field
  value to have settled (ignore Enter within a short window of the last `compositionend`) so a
  stray finalize-Enter can't submit half-composed text. Cross-IME behaviour (macOS 日本語 /
  MS-IME / Google日本語入力 / iOS / Android) is an explicit test/manual-protocol target.

## Architecture the whole program hangs on (built in K1)

**A declarative binding registry — the single source of truth.** `lib/shortcuts.js` (pure,
Node-import-safe): `BINDINGS = [{ id, keys, phase, surface, label, control, kind }]` (kind =
nav | grade | reveal | media | integrity | help …) plus a pure resolver
`resolveKey({ key, phase, targetKind, composing, enabled }) → actionId | null` (no DOM — takes
the already-computed active-element KIND, so it's unit-testable). Every consumer reads the
registry: the study dispatcher routes through `resolveKey`; the `?` sheet renders from
`BINDINGS`; the kbd chips read their key from it; the palette shows each row's direct key from
it. This is what makes K3's drift-test and K5's palette-shows-key feasible, and it makes the
dispatch **decisions** node-testable even though focus/scroll behaviour stays a documented
manual protocol.

## Binding principles (apply to every round)

1. **IME first** (`isComposing || keyCode 229`), everywhere, preserved.
2. **Bare keys never fire over a focused field** (`typingTarget` = INPUT/TEXTAREA/SELECT/
   contenteditable). Pre-answer aids are controls/modifiers, not bare keys.
3. **"Advance" is the consistent invariant, not "reveal"** (see the hinge).
4. **WCAG 2.1.4 (Level A):** a shared `shortcutsEnabled()` gate (default on, `KEYS.kbd`
   sentinel) consulted by **every** bare-single-char listener — not just gestures/study/
   phrases but **calendar (m/w/d/a/n/t), checklist (j/k/d/p/e), the mock-exam runner (F flag,
   digit-pick), and every card `onKey`**. Turn-off satisfies the criterion only if it covers
   them all; the plan scopes the gate to the full bare-key surface (each listener adds one
   guard line reading the shared helper).
5. **Every keyboard action has a visible, focusable, tappable control** (this is a phone-heavy
   app; undo/mark/flag/autoplay/hint must be reachable by touch and by Tab, and must survive
   the WCAG toggle being off). Satisfies WCAG 2.1.1 too.
6. **Never animate keyboard-initiated actions** (grade, next, keyboard route-swap, palette
   open/close, grid arrow-move) — render instantly; keyboard route-swaps skip the View
   Transition via a `jwh:route {source:'keyboard'}` flag. Animation stays for mouse/tap.
7. **Discoverable > clever:** kbd chips (passive, always on) → `?` sheet (on demand) → palette
   (power path). One one-time "press ? for shortcuts" nudge (no usage-tracking heuristics).
8. **Power modes are opt-in** (jpdb lesson): conservative defaults; auto-advance is a setting.
9. **Preserve the guards:** the R8 `stopPropagation` guard (widened, never removed), the
   **BUTTON-fallthrough guard** (`if (t.tagName==='BUTTON') return` — a focused control
   activates natively; `resolveKey` mirrors this by returning `null` for nav/grade keys when
   `targetKind==='button'`), focus restore across `innerHTML` rebuilds, `#stuLive`
   announcements, reduce-motion, real focusable controls; new prefs in `lib/store.js` KEYS
   (`jwh-`-prefixed, getRaw/setRaw sentinels, backup-covered); `esc()` all dynamic; SW
   `CACHE`+`ASSETS` on new files.

## Verified current-state anchors (audit)

- The **leak is a real bug**: `study.js wireRoot` stops propagation only for `{1-9,Enter,
  Space,Escape}` when a card is active; `gestures.js` bails only on `typingTarget`, so a
  focused card BUTTON lets `] [ 0 b \ , ? /` fire — and because `#/study` is HIDDEN,
  `currentRoute()` falls back to `dashboard`, so `]` navigates to a neighbour and **abandons
  the session**. `1` is currently swallowed (a no-op) — free to bind to Again. `act('again')`
  and `act('speak')`/`useHint()` already exist.
- The `?` overlay documents **zero** study keys; bindings are scattered `if/switch` chains +
  a hardcoded help string (no source of truth yet — the registry fixes this).
- The command palette (`palette.js`+`lib/palette.js`) is **navigation-only** and its route
  index is built from `ROUTES`, so it **can't even reach** the hidden study/grammar routes.
- Heat grid = **353 native tab stops** (no roving tabindex); mock exam is keyboard-dead except
  digit-pick; `review()` is a pure state→state fn with **no undo/snapshot** (must be built).
- Precedent to copy: `phrases-anki.js wireDeckKeys()` (P audio, S flag, guarded doc-level
  binding, a real roving-tabindex skim grid).

## The 5 rounds

Each round = one PR (branch → PR → squash-merge), own implementation plan at execution time,
dual adversarial review before merge. **K1, K2, and K4 are flagged may-land-as-2-stacked-PRs**
(each has a clean seam — K1: leak-fix+gate+toggle as slice A, registry+resolver+contract+stub
as slice B). Per-module adoption of the registry is **incremental** — each round migrates the
modules it touches; K1 does NOT rewrite all 8 card modules at once.

### K1 — Foundation: kill the leak, build the registry, ship the WCAG gate + the contract
- **Leak fix (bug, ships immediately, module-agnostic):** in `study.js wireRoot`, while a card/
  flow is active, `stopPropagation` **all bare keys except `?`** (so the help sheet still
  bubbles to gestures, which sees `modal===null` and opens — avoids the aria-modal `?`-trap the
  feasibility critic flagged). No per-module change needed for the fix itself.
- **`lib/shortcuts.js` registry + pure `resolveKey`** (the architecture above) + its unit
  tests (key+phase+targetKind+composing+enabled → actionId). Establishes the testable core;
  focus/scroll/IME stay a documented manual protocol.
- **Shared `shortcutsEnabled()` WCAG gate** (`KEYS.kbd`, default on) + a "Keyboard shortcuts"
  toggle in the Guide & Settings overlay, wired into **every bare-key listener** (gestures,
  study wireRoot + each card `onKey`, phrases, calendar, checklist — one guard line each).
- **The contract:** `1`=Again (graded), 1–4 grade, Space=advance (post-answer, only when a
  control is NOT focused — else native activation), Enter=submit then continue with the
  **submit→continue debounce** + the finalize-side IME fallback. **Motion:** a module-level
  `pendingNavSource` flag is set to `'keyboard'` *before* gestures mutates `location.hash`, and
  `router.js activate()` reads it *before* `transitionView()` to skip the View Transition on
  keyboard swaps (the current `jwh:route` fires AFTER `transitionView`, so a route-detail flag
  can't gate it — a pre-set module flag can).
- **Minimal `?`-sheet study stub** so the ~3 keys K1 changes/adds are documented on day one
  (grows into the full grouped sheet in K3).
**Verify:** resolveKey unit tests (incl. composing→null, disabled→null, targetKind=input→type
not command); trace no global key fires mid-card in ANY phase; toggle silences every bare-key
surface; cross-IME finalize→submit manual protocol documented + Enter debounce; keyboard
route-swap has no animation.

### K2 — Reviewer power keys (may land as 2 stacked PRs: audio half, integrity half)
- **Audio half (post-answer, bare keys safe):** **R** replay audio, **E** sentence audio, **A**
  toggle autoplay — all only when the input is blurred/focus on the card; each announced via
  `#stuLive`; each gets a visible button (tap parity). **Hint** stays a **labelled control +
  `aria-keyshortcuts`** — NOT a bare key (bare `H` types into the cloze) and NOT an Option/Alt
  combo (Option+H = dead char on macOS). The button is the affordance. Registry + kbd chips each.
- **Integrity half (the trust kit — the program's riskiest code):** **Z = undo last answer,
  bounded to within-session (pre-summary)** — a new pure `undoReview(state, snapshot)` in
  `lib/study.js` restores a **whole-state snapshot** taken just before `grade()` (covers
  `points[id]`, session position/stats, and the ghost/gate/streak fields inside points/settings;
  transient `celebrate()`/`blip()`/`announce()` need no reversal). **Undo is NOT offered on the
  summary screen:** the last-card grade triggers `sessionEnd` + `recordSession` (streak/week/
  daysStudied, **idempotent per calendar day** — a naive decrement can't tell if today's streak
  came from this session), so un-ending it cleanly is out of scope; Z stops at the last card.
  **Backspace/Esc on a just-wrong typed card = retry, no penalty** — only when the retry control
  has focus (not the re-enabled input, where Backspace deletes a char), phase-guarded to the
  just-wrong state (Esc here is distinguished from the sheet/exam-exit Esc by phase). **`+`/`−`
  = mark the auto-grade correct/wrong** via **revert-to-snapshot then re-apply `review()` with
  the corrected grade AND the snapshot's ORIGINAL `now`** (FSRS derives `last`/`due` from `now`;
  a fresh timestamp would diverge from a first-time grade) — NEVER a second `review()` on the
  un-reverted id (double-apply). Undo also reverts a `+/−` override. Pick a **JIS-reachable**
  mark pair (`−` is direct on JIS but `+` is Shift+; — choose keys reachable without awkward
  chords, or an alt pair); both are post-answer so no typing conflict. Each has a visible control.
- **Session wrap-up:** the end-of-session summary gets keyboard flow (Enter = next batch /
  return), announced — so a keyboard-only user isn't stranded when the queue empties.
**Verify:** `undoReview` restores byte-identical pre-answer state incl. session pos (control-run
test); retry doesn't double-count a lapse; mark-correct/wrong re-grades exactly once (revert-
then-reapply, asserted no double-`review`); R/E/A never fire while composing/typing; wrap-up
reachable by keyboard; every new action has a tap target.

### K3 — Discoverability: the `?` sheet learns the Almanac (reads the registry)
- **Full grouped `?` sheet** rendered FROM `BINDINGS`, grouped by surface AND **shown per
  phase** (so the digit-overload — `1` picks option pre-answer vs `1`=Again post-answer — reads
  correctly), searchable if long, focus-trapped + Esc + labelled dialog + focus-move-in/return.
- **The drift-guard test** (now feasible): asserts the `?` sheet's key list == the registry ==
  the dispatcher's `resolveKey` table, so they can't diverge. This makes sheet-upkeep automatic
  for K4/K5 (the test fails if a new key isn't documented).
- **kbd chips everywhere** from the registry, `aria-hidden` (SR gets the shortcut from
  `aria-keyshortcuts` on the control, not doubled in the name); `aria-keyshortcuts` is
  dropped/hidden when the WCAG toggle is off (no announcing dead keys).
- **One-time first-run nudge** ("press ? for shortcuts"), persisted-dismiss. No usage-tracking.
**Verify:** drift test green (sheet↔registry↔dispatcher); chips render + correct keys; nudge
shows once; a11y (dialog role/label/trap/restore, aria-keyshortcuts toggles with the pref).

### K4 — Mock exam + heat grid: keyboard-complete & accessible (may land as 2 stacked PRs)
- **Mock-exam keys:** **F** flag, **← / →** prev/next question, **Enter** submit (when
  complete)/confirm, **Esc** exit-with-confirm, a **scramble digit path** (so every item type
  is keyboard-answerable), palette cells reachable by arrows not N tab stops. F and the digit
  picks read the shared `shortcutsEnabled()` gate (they're bare char-key shortcuts); each key
  action has a visible tap control; confirm no exam item focuses a free-text field while F/arrows
  are live (they don't — the runner has no free-text input). No mid-exam feedback /
  peg-suppression regressions.
- **Heat-grid roving tabindex** (the heavy half): 353 cells → ONE tab stop; arrows move + roll
  the `0` + auto-scroll into view; **Home/End** (row), **Ctrl+Home/End** (grid),
  **PageUp/PageDown** for a 353-cell grid; `role="grid"`/`gridcell`; Enter drills the cell.
- **Skip-to-content link** as the first focusable element.
**Verify:** every exam item type answerable by keyboard; Esc confirms before discarding; grid
= one tab stop with arrow+Home/End+PageUp/Dn nav, Enter drills, no keyboard trap; registry +
`?` sheet updated (drift test enforces it).

### K5 — Palette reach + one opt-in mode + motion/a11y sweep (trimmed per research)
- **Palette:** make it **reach the hidden `#/study` and `#/grammar` routes** (today it can't —
  the index is built from `ROUTES`, which excludes hidden routes) and **show each reachable
  row's direct key** from the registry (Superhuman-teaches). That's the navigation-scoped slice
  the research blessed. **CUT** (gold-plating per research + scope critic): no "level routes"
  (JLPT levels are in-page accordion state, not routes — nothing to navigate to), no
  command-verb/action registry, no `g`-sequences.
- **One opt-in grading mode:** **auto-advance on a correct answer** (default OFF, persisted) —
  the single most-requested power toggle; drop select-then-confirm (keep the program to one new
  flow, not two).
- **Motion + a11y final sweep:** confirm no keyboard action animates; every new control
  focus-visible + reduce-motion clean; the `?` sheet + registry cover the full final binding
  set; the WCAG gate covers everything shipped; guide + CLAUDE.md document the keyboard model.
- Final adversarial keyboard-only audit (a full session + a mock + the grid, shortcuts on and
  off, with animation off).
**Verify:** palette reaches study/grammar + shows keys; auto-advance setting behaves + persists
(additive key — no migration); full keyboard-only run passes; drift test green; verification-
harness pass.

## Constraints (inherited, binding)

Zero-build vanilla ES modules, no new CDNs; IME guard + `typingTarget` bail + the R8
`stopPropagation` guard preserved/widened (never removed); the shared `shortcutsEnabled()`
gate on every bare-key listener; `⌘/Ctrl/Alt` left to the OS/native; real focusable controls +
focus restore + `#stuLive` announcements + a tap target per action; reduce-motion; new prefs
in `lib/store.js` KEYS (`jwh-`-prefixed, getRaw/setRaw sentinels, backup-covered — all
ADDITIVE, no shape migration); `esc()` all dynamic; SW `CACHE` bump + `ASSETS` add for new
assets (`lib/shortcuts.js`); pure logic Node-tested from repo root; don't regress the shipped
R1–R15 study behaviour, the audio feature, the redesign, or the rename; route id / KEYS /
data-act stay stable.

## Review log

**Round 1 (2026-07-19, 3 Opus critics: codebase-feasibility, keyboard-UX/a11y/IME, scope/
sequencing).** Factual spine verified correct by all three (the leak, `#/study` dashboard
fallback, swallowed `1`, zero study keys, 353 tab stops, digit-only exam, nav-only palette,
missing undo — all real; `getRaw/setRaw`, `speak.js`, `useHint`, `act('again')`, the phrases
roving-grid all exist as claimed). No sign-off; fixed the majors:
- **[UX M1] bare `H` hint can't fire pre-answer** (input focused) → Hint is a labelled control
  + `aria-keyshortcuts`/optional Alt+H, never bare; codified "pre-answer aids aren't bare keys."
- **[UX M2] "Space=reveal" over-claimed** → invariant restated as **"advance," not "reveal"**
  (Enter reveals on typed cards; the hinge + Principle 3).
- **[UX M3 / touch] no tap target per action** → Principle 5: every action has a visible
  focusable/tappable control.
- **[UX M4] Enter finalize→submit→continue triple-fire** → submit→continue debounce + a
  cross-IME finalize→submit test target.
- **[UX M5] no session wrap-up** → keyboard wrap-up added to K2.
- **[feasibility M1 / scope] WCAG toggle under-scoped** ("one switch = compliant" was false —
  calendar/checklist/per-card bare keys exist) → a shared `shortcutsEnabled()` gate on EVERY
  bare-key listener (Principle 4), honestly scoped.
- **[feasibility M2 / scope #1] drift-test needs a source of truth** → K1 builds a **declarative
  binding registry** (`lib/shortcuts.js`) that the dispatcher, `?` sheet, chips, and palette all
  read; the pure `resolveKey` also makes dispatch node-testable (answers scope's "no test
  strategy" major).
- **[scope] K1/K2/K4 each >1 PR** → per-module registry adoption made incremental (not big-bang
  in K1); K2 and K4 flagged may-land-as-2-stacked; the leak fix ships as K1's first slice ahead
  of the refactor.
- **[scope] discoverability lagged 2 rounds** → a minimal `?`-sheet stub in K1; drift test in K3
  makes per-round sheet-upkeep automatic.
- **[scope] K5 gold-plating** → cut the palette action-verb registry and `g`-sequences; K5 =
  palette-reach + show-keys + ONE opt-in mode (auto-advance) + sweep.
- Minors folded in: undo reverts point+session+side-effects (not just SRS delta); mark-correct/
  wrong = revert-then-reapply, never a 2nd `review()`; the `?` leak-fix excludes `?` from the
  widened stopPropagation (avoids the aria-modal `?`-trap); roving grid gains Home/End/PageUp/
  Dn; kbd chips `aria-hidden` + `aria-keyshortcuts` dropped when disabled; digits shown
  per-phase in the sheet; `E`/`+`/`−` documented per-surface (and check `+` on JIS = Shift+;,
  pick a JIS-reachable alt if awkward); "migrate" wording dropped (prefs are additive). No
  round-1 finding was rejected.

**Round 2 (2026-07-19, 2 Opus critics: keyboard-UX/a11y + scope/correctness).** No new
factual errors in the spine; two no-sign-offs on residual majors, all fixed:
- **[UX R1] `Space`=advance double-fires with the BUTTON-fallthrough guard** (a focused grade
  button already advances on Space natively; a second bare-key advance skips a card) → the hinge
  and Principle 9 now make `resolveKey` return **null when `targetKind === 'button'`**, so the
  native activation is the only one.
- **[Q4] "level routes" don't exist** (JLPT levels are in-page accordion state, not hash routes)
  → dropped from K5's palette-reach; palette now reaches only `#/study` + `#/grammar`.
- **[Q6] undo undefined at the summary boundary** (`recordSession` is idempotent per calendar
  day; un-ending a session can't cleanly reverse streak/week/daysStudied) → **Z is bounded to
  within-session (pre-summary)**; not offered on the summary screen. Snapshot is now a
  whole-state capture taken before `grade()`.
- Minors folded in: Alt/Option combos dropped entirely for Hint (Option+H = dead char on macOS)
  — the button is the affordance; mark-correct re-applies `review()` with the snapshot's
  **original `now`** (fresh timestamp would diverge FSRS `last`/`due`); Backspace/Esc retry only
  when the retry **control** (not the re-enabled input) has focus, phase-guarded; IME
  finalize-side fallback for the Enter test; mock-exam `F`/digits explicitly under the
  `shortcutsEnabled()` gate; module-level `pendingNavSource` flag (read in router `activate()`)
  as the route-source mechanism for the motion no-double-animate goal. No round-2 finding was
  rejected. **Converged — factual spine clean, no new majors; signed off for landing as a spec.**
