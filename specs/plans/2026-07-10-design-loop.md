# Design-polish loop — execution plan for the 20 stages (2026-07-10)

Companion to `2026-07-10-twenty-stages.md` (the WHAT). This is the HOW: the pipeline each loop
tick runs, the design gates every change must clear, ordering, and the review cadence. Loop: cron
every 30 min, session-local; owner can fire a stage early with "continue".

## Arcs (execution order)

The backlog re-grouped so related surfaces ship together and global chrome lands before the pages
that sit under it:

| Arc | Stages | Theme |
|---|---|---|
| A — Global chrome | 2 (nav crowding), 9 (topbar icon states) | one visual language above every page |
| B — Page layouts | 3 (budget defaults), 4 (going), 5+6 (plan-a-day, PAIRED), 8 (rooms), 10+11 (dashboard, PAIRED), 12 (explore), 13 (checklist), 14 (people) | the sweep's "visually weird / bad UI" findings |
| C — Calendar family | 7 (map tiles — verified first, may be a non-bug), 15 (week chrome), 16 (agenda parity), 17 (dark audit), 18 (mobile audit) | finish the Notion-parity arc on every calendar surface |
| E — The map | 21 (layout & sidebar), 22 (pins/clusters/popups), 23 (controls & touch) | owner-added: the map is a whole surface, not one tile check |
| D — Motion + close | 19 (motion pass 2), 20 (final regression + critic panel) | polish, then prove it — always LAST |

Order: A → B → C → E → D (the close stays last). Map stages load Leaflet — verify on #/map with the lazy-load settled before probing.

Pairing rule: 5+6 and 10+11 are same-file/same-surface pairs — one PR each. Everything else is
one stage = one PR (small blast radius, easy revert). Never merge stages across arcs.

## Per-stage pipeline (every tick)

1. **Evidence first.** Re-screenshot the target surface fresh (light theme; + dark for anything
   color-touching; + 600px for anything layout-touching). Never fix from memory or from the
   original sweep alone — pages may have drifted. For the six never-reviewed routes (people,
   checklist, packing, emergency, deadlines, phrases): review their sweep shot at the START of
   the stage that touches them and append findings to the backlog.
2. **Diagnose against the checklists.** Two references, in order: the owner's Notion screenshots
   (parity is the product goal) and `~/.claude/design-principles.md` (the numbers). Name the
   specific violated rule in the commit body — "looks nicer" is not a diagnosis.
3. **Smallest fix.** CSS before JS; JS only when structure genuinely blocks the fix. New findings
   discovered mid-stage get APPENDED to the backlog, not fixed inline — scope creep is how a
   30-min tick becomes a 2-hour one.
4. **Verify.** Headless CDP: geometry probes for the specific claim (measured px, computed styles,
   trusted-pointer interactions when behavior changed — synthetic clicks lie, see the popover
   incident), before/after screenshot, `node --test` green, 0 console errors. Anything touching
   the calendar re-runs the mini-matrix: boot→today, ‹ ›, Today, leave/return, compact boot.
5. **Ship.** SW CACHE bump · feature branch · PR (body: evidence → diagnosis → fix → test plan) ·
   squash-merge · tick the stage in `2026-07-10-twenty-stages.md` with the PR number (same PR).
6. **Show the owner.** SendUserFile the after-screenshot with a one-line caption — the owner
   steers this loop with screenshots; give them one to react to per stage.

## Design gates (every change, from design-principles.md)

- Entrances 200–300ms / exits 150–200ms, strong curve `cubic-bezier(0.23,1,0.32,1)`; hover
  feedback <100ms; list stagger 50ms/item; animate transform+opacity ONLY.
- No animation on keyboard-repeated actions; everything rides the global reduce-motion kill.
- Hover states gated `@media (hover:hover)` when they'd misfire on touch; 44px touch targets.
- Contrast: WCAG AA minimum on every changed text/bg pair — measure, don't eyeball (the repo has
  prior AA regressions as evidence this gate earns its keep).
- Empty states: never alarm-red for "not configured" (stage 3 is the poster child); hint at the
  next action instead.
- One spacing rhythm per surface: when adding breath, change the scale consistently (padding, gap,
  min-height together) — stage 1 set the calendar's; other pages match their own internal scale.

## Review cadence

- **Mid-loop critic (after stage 11, end of arc B):** one Opus adversarial critic over the
  accumulated diff since #86 — lenses: esc()/XSS on any new markup, regression risk in shared CSS
  (chip/chrome selectors are used by 4 views), contrast claims, convention drift. Fix gating
  findings before arc C.
- **Stage 20 (close):** full behavioral regression (13 routes × light/dark × normal/compact +
  600px), a11y pass (focus order, aria, contrast), Opus critic PANEL (2–3 lenses) over the whole
  loop diff. Honest verdict in the plan file — unfixed findings get logged, not buried.
- Screenshots to the owner every stage (see pipeline 6) — cheap continuous review.

## Rails

- The 30-min tick does ONE stage (or one pair). If a stage doesn't fit, ship the verified subset,
  note the remainder in the backlog, end the tick. Never hold main hostage mid-stage.
- Deploy watch: don't block a tick on GitHub Pages; note the SW version and let the next tick
  confirm it went live.
- tips.json is data, not design — the loop doesn't touch it except when a stage's evidence shows
  a data-driven rendering bug.
- Identity-free, esc() discipline, localStorage keys versioned — all standing repo rules apply;
  the loop earns no exemptions.
- Stop conditions: backlog exhausted (stage 20 verdict written) · owner says stop · a stage's fix
  regresses the matrix twice in a row (stop, report, ask).

## Stage-specific acceptance criteria (the non-obvious ones)

- **2 (nav):** no label wraps at any width 1100–1600px; active underline intact; drawer behavior
  below 821px untouched.
- **3 (budget):** unset savings+income → RUNWAY "—" + neutral hint; real numbers still produce the
  red when genuinely negative; teaser on the dashboard unaffected (it has its own confidence gate).
- **5 (date strip):** today auto-scrolled into view on mount; edge fade only where content
  actually overflows (no fade on short strips).
- **7 (map):** first determine whether the black map was the dark-tile filter or slow tiles in the
  sweep — if it's a non-bug, tick with "verified non-issue" and evidence.
- **17 (dark):** measure the 32% chip tint + ink, `.moff` faint, crimson square against dark bg —
  numbers in the commit body.
- **18 (mobile):** popover reachability with TOUCH (no hover) — the drag-create/pointer-capture
  seam burned us once; test with real touch events.
- **19 (motion):** frequency gating per the principles — dashboard widgets animate on entry only,
  never on data refresh.
