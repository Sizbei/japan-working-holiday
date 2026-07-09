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
| B1 — Dashboard | 10+11 (PAIRED) | the landing surface — promoted for owner value |
| C — Calendar family | 15 (week chrome), 16 (agenda parity), 17 (dark audit), 18 (mobile audit) | the owner's primary surface — promoted ahead of the long tail |
| B2 — Page layouts | 3 (budget defaults), 4 (going), 5+6 (plan-a-day, PAIRED), 8 (rooms), 12 (explore), 13 (checklist), 14 (people), 24 (un-reviewed surfaces) | the sweep's "visually weird / bad UI" hypotheses |
| E — The map | 7 (tile/theme check FIRST — may be a sweep artifact), 21 (layout & sidebar), 22 (pins/clusters/popups), 23 (controls & touch) | owner-added; stage 7 moved here from Arc C — it's a map concern and Arc E owns the Leaflet-load discipline |
| D — Motion + close | 19 (motion pass 2), 20 (final regression + critic panel) | polish, then prove it — always LAST |

Order: **A → B1 (dashboard) → C (calendar) → B2 → E → D** — the owner's two highest-touch
surfaces come right after global chrome; the close is always last. Map stages load Leaflet —
verify on #/map with the lazy-load settled before probing.

Pairing rule: 5+6 and 10+11 are same-file/same-surface pairs — one PR each. Everything else is
one stage = one PR (small blast radius, easy revert). Never merge stages across arcs.

## Per-stage pipeline (every tick)

1. **Evidence first.** Re-screenshot the target surface fresh (light theme; + dark for anything
   color-touching; + 600px for anything layout-touching). Never fix from memory or from the
   original sweep alone — pages may have drifted. For the six never-reviewed routes (people,
   checklist, packing, emergency, deadlines, phrases): review their sweep shot at the START of
   the stage that touches them and append findings to the backlog.
2. **Diagnose against the checklists.** Two references, in order:
   `specs/2026-07-10-notion-parity-spec.md` (the DURABLE distillation of the owner's Notion
   screenshots — in-conversation screenshots don't survive compaction and are never committed:
   personal data, public repo) and `~/.claude/design-principles.md` (the numbers). Name the
   specific violated rule in the commit body — "looks nicer" is not a diagnosis. Fresh owner
   screenshot → update the parity spec in the same PR.
3. **Smallest fix.** CSS before JS; JS only when structure genuinely blocks the fix. New findings
   discovered mid-stage get APPENDED to the backlog, not fixed inline — scope creep is how a
   30-min tick becomes a 2-hour one.
4. **Verify.** Per `specs/verification-harness.md` (boot recipe, trusted-pointer rule, contrast
   procedure, gotcha list, the calendar mini-matrix, the 14-surface denominator). Geometry probes
   for the specific claim, before/after screenshot, `node --test` green, 0 console errors.
5. **Ship.** SW CACHE bump · feature branch · PR (body: evidence → diagnosis → fix → test plan) ·
   squash-merge · tick the stage in `2026-07-10-twenty-stages.md` with the PR number (same PR).
6. **Show the owner.** SendUserFile the after-screenshot with a one-line caption — the owner
   steers this loop with screenshots; give them one to react to per stage.

## Design gates (every change, from design-principles.md)

- Entrances 200–300ms / exits 150–200ms; UI curve `cubic-bezier(0.23,1,0.32,1)`, POSITIONAL
  movement (strip scrolls, reorders) uses the move curve `cubic-bezier(0.77,0,0.175,1)`; hover
  feedback <100ms; list stagger 50ms/item; animate transform+opacity ONLY.
- **Frequency gate is hard:** 100+×/day surfaces get NO animation ever — in this repo that is
  the command palette and every keyboard shortcut/route-key (1–9, [ ], t, m/w/d/a). Occasional
  surfaces (modals, drawers, popovers) = standard.
- **Reduce-motion: deliberate deviation, owned here.** The principles say "gentler, not zero";
  this repo's owner toggle + media query TOTAL-kill all animation including opacity — accepted
  as the owner's explicit accessibility preference. Do not add carve-outs; do not cite the
  principle against the kill.
- Hover states gated `@media (hover:hover) and (pointer:fine)`; 44px touch targets.
- Contrast: WCAG AA minimum on every changed text/bg pair — measured via the harness doc's
  pixel-sampling procedure (tinted chips COMPOSITE; computed styles alone lie); numbers in the
  commit body.
- Empty states: never alarm-red for "not configured" (stage 3 is the poster child); hint at the
  next action instead.
- One spacing rhythm per surface: 4px base grid; when adding breath, change the scale
  consistently (padding, gap, min-height together) — stage 1 set the calendar's; other pages
  match their OWN internal scale (this gate governs stages 13/14 — never import the calendar's
  numbers onto another page).

## Review cadence

- **Mid-loop critic — fires when Arc C finishes (all of 15–18 ticked):** one Opus adversarial
  critic over `git diff <stage-1-merge>..HEAD` (stage 1 = PR #86's merge commit; the range is
  contiguous on main regardless of arc order) — lenses: esc()/XSS on any new markup, regression risk in shared CSS
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
- Stop conditions: backlog exhausted (stage 20 verdict written) · owner says stop · a stage
  fails ITS OWN verification twice (the stage's matrix = its geometry probes + `node --test` +
  0 console errors on the touched surface + calendar mini-matrix when calendar files changed;
  record `attempt: N` in the backlog's working notes so the counter survives compaction —
  at attempt 2 failing: stop, report, ask).

## Stage-specific acceptance criteria (the non-obvious ones)

- **2 (nav):** no label wraps at any width 1100–1600px; active underline intact; drawer behavior
  below 821px untouched.
- **3 (budget):** unset savings+income → RUNWAY "—" + neutral hint; real numbers still produce the
  red when genuinely negative; teaser on the dashboard unaffected (it has its own confidence gate).
- **5 (date strip):** today auto-scrolled into view on mount; edge fade only where content
  actually overflows (no fade on short strips).
- **7 (map, now in Arc E):** first determine whether the black map was the dark-tile filter or
  slow tiles in the sweep — if it's a non-bug, tick with "verified non-issue" and evidence.
- **Breakpoints:** "mobile" checks run at 600px AND 800px (the 601–820 drawer band is where
  drawer bugs live); desktop layout checks at 1100–1600px.
- **17 (dark):** measure the 32% chip tint + ink, `.moff` faint, crimson square against dark bg —
  numbers in the commit body.
- **18 (mobile):** popover reachability with TOUCH (no hover) — the drag-create/pointer-capture
  seam burned us once; test with real touch events.
- **19 (motion):** frequency gating per the principles — dashboard widgets animate on entry only,
  never on data refresh.
