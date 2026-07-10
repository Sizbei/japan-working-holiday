# 20-stage improvement loop (2026-07-10)

Owner: "run through the site and let's run 20 stages of improvements … brainstorm parity and design
fixes and visually weird things and bad UI choices." Loop fires every 30 min; each stage = small,
verified, shipped (branch → PR → squash → SW bump). Tick stages off here with the PR number.
Lenses: Notion parity · design fixes · visually weird · bad UI choices.
Evidence: 13-of-14-surface screenshot sweep 2026-07-10 (session scratchpad — NOT durable).
**Stage descriptions below are sweep HYPOTHESES, not established findings** — the pipeline's
evidence step re-verifies each on fresh screenshots before fixing; a hypothesis that doesn't
reproduce gets ticked "verified non-issue" with evidence. Parity reference (durable):
`specs/2026-07-10-notion-parity-spec.md`. Harness: `specs/verification-harness.md`.

- [x] **1. Calendar breath + motion + tick fix** — cell/chip spacing, fixed centered tick, popover
  + mode-switch entrances, chip hover transition. (PR #86)
- [x] **2. Topbar nav crowding (~1300px)** — reproduced (compact relocated nav: "Plan a Day"
  wrapped to 3 lines, nav 77px tall; row scrolled with ends clipped). Fixed: links nowrap +
  flex:none, padding .68→.46rem, row gap .25rem — measured: wrapped 1→0, navH 77→32px,
  overflow at 1300px 48→6px (both end links fully visible), 1600px 0. 1100px scrolls cleanly
  by design. (PR #93)
- [ ] **2b. (appended) Nav edge-fade affordance** — below ~1240px the compact nav row scrolls
  with hidden scrollbar and no visual hint; add scroll-edge fades (needs a JS scrollable-state
  class — CSS alone can't detect overflow).
- [x] **3. Budget empty-state honesty** — reproduced (untouched page: `Net / mo −¥190,000` in
  alarm tone, savings null). Fixed: unconfigured (no savings AND no monthlyIncome) → Net/Runway/
  After-setup render neutral em-dashes + "set savings below ↓" hint, no tone class; verified
  three states: unset neutral · ¥900k → amber "4 mo" · ¥200k → red "1 mo" (alarm only for real
  numbers). Dashboard teaser untouched (own gate). (PR #101)
- [x] **4. Going page layout** — grid hypothesis mostly NON-ISSUE (cards flow 2-up inside the
  site's standard 960px column; the "void" was the 1-card state). Two real fixes: "Upcoming
  only" active was off-palette pure green rgb(30,142,62) (~3.6:1 with white text, sub-AA) →
  override removed, inherits the site-wide `.chip.active` indigo (verified pixel-identical to
  the "All" chip); the ✎ location-edit affordance dangled full-strength after the station text →
  rests ink-faint, wakes indigo+tint on hover/focus (editor still opens, toggle verified with
  trusted clicks). (PR #102)
- [x] **5. Plan-a-Day date strip** — reproduced hard: 45 pills, 2041px hidden overflow, 28 pills
  clipped, no affordance. Fixed: scroll-edge mask fades (left/right classes toggled from real
  scroll state — verified right-only → both → left-only across the strip) + the active chip
  re-centers on every #/plan entry (verified after picking a far-August day, leaving, returning).
- [x] **6. Plan-a-Day stop cards** — ▲/✕ shared a ragged first row with ▼ orphaned below → one
  `.stop-rail` column (measured: all three centered at the same x). Long notes hard-clipped
  mid-word in the input → text-overflow ellipsis + full text in the title tooltip (inputs can't
  wrap; textarea conversion deferred). (both PR #103)
- [ ] **7. Map tiles vs theme** — map renders near-black in LIGHT theme (dark tile filter leaking,
  or slow tiles): verify + scope any tile filter to `[data-theme="dark"]`.
- [x] **8. Rooms badge overload** — VERIFIED NO-CHANGE: measured 3–5 `.room-flag` per card
  (hard max 6 by construction), ONE uniform color family (ok-green tint), 175 across 43 cards.
  Every flag is load-bearing rental-decision info (NO KEY MONEY / NO GUARANTOR / BOOK FROM
  ABROAD…) — hiding them behind "+N more" on a comparison page would be a worse UI. The sweep's
  "overload" was the downscaled screenshot compressing 43 cards. (no PR)
- [x] **9. Topbar icon row** — the "stuck glow" hypothesis was a NON-ISSUE (it's the yellow moon
  emoji reading as a halo at small scale, not a stuck state). Real measured inconsistencies fixed:
  sizes {34,38}→{38×38} (lang-toggle was small), radii {r-sm,10px}→{10px}, rest shadows 1→0
  (theme-toggle was the only one), hover unified to the family lift+indigo (moon keeps its -12°
  tilt, gear keeps its spin). Titles/aria all present (verified). (PR #94)
- [x] **10. Dashboard hero balance** — VERIFIED NON-ISSUE: fresh measurement shows dead-right =
  22px (the sun motif fills the column, hero-main content reaches x=1243 of 1265); hero 354px.
  The sweep impression didn't convert to a single measured delta → no fix (vibes rule). (no PR)
- [x] **11. Dashboard widget row rhythm** — VERIFIED NO-CHANGE: row 1 heights 187/187/187, row 2
  198/198/198 (grid-stretch equal within rows), padding uniform 12.75px, title font uniform
  15.3px; teasers all 99px with identical 9.35/13.6px padding; left edges aligned (hero offset =
  its scroll-rail). Zero measured deltas → no fix. (no PR)
- [x] **12. Explore finding cards** — two real fixes, one drop: (a) cards had ZERO hover/focus
  rules → `.finding:hover/:focus-within` indigo border (the shared interactive-row pattern);
  (b) confidence badges measured (canvas alpha-composite — computed-style regex lies for
  color-mix values): HIGH 3.86 / MEDIUM 3.93 light and LOW 4.38 dark all sub-AA → inks mixed
  toward `--ink`; post-fix all six theme×badge ratios 5.31–8.69 (allAA:true). (c) source-link
  row produced no measurable delta → dropped per the vibes rule. (PR #105)
- [x] **13. Checklist visual pass** — VERIFIED NO-CHANGE: row padding uniform 8.5/12.75px across
  all 20 sampled rows (heights vary with content only); phase headers uniform 17px disclosure
  rows; locked items read clearly (opacity .55 + 🔒 + .locked class); the shared interactive-row
  hover exists. One logged non-fix: locked rows keep cursor:grab (drag-reorder stays allowed by
  design). 0 console errors. (no PR)
- [x] **14. People page review** — VERIFIED NO-CHANGE (as expected for a freshly-designed page):
  card padding uniform 22.1/22.1/17px across all cards, grid gap consistent 18.7px, drift strip
  renders at its own 13.6px scale, 0 console errors with seeded data. Zero deltas → no fix.
  (no PR)
- [x] **15. Week view chrome parity** — diffed vs #83/#85: past-column dimming ✓ (5 cols + 1 bar
  measured), gutter alignment ✓ (delta 0px), now-line ✓, today column ✓, toolbar sticky ✓. ONE
  residual: switching month→week inherited the endless grid's ~2200px window scroll, which
  clamped against the short week page and buried the day-name header at −138px (0 of 7 day
  labels visible). Fix: real mode CHANGES reset the window scroll (data re-renders keep it —
  verified 120px preserved). After: winY 0, head fully visible, 7/7 labels. Mini-matrix green.
  (PR #96)
- [x] **16. Agenda view Notion-list parity** — VERIFIED NO-CHANGE: month group headers (serif) +
  700-weight date labels + 600 titles + 400 meta = hierarchy present; `.agenda-row:hover`
  exists (indigo border, the deliberate site-wide interactive-row pattern shared with
  .check-item); full-row click already opens the event panel (wireAgenda). The probe's
  "hoverable:false" was a selector heuristic miss, not a defect. Zero deltas → no fix. (no PR)
- [x] **17. Dark-theme audit** — ALL FIVE PASS, measured live in dark theme (WCAG formula on
  computed colors): (a) chip ink worst 17.29:1 across 8 categories (fireworks) ≥4.5 ✓;
  (b) `.moff` 4.92:1 vs focal 12.34:1 (dim reads, both AA) ✓; (c) today square #fff on #bc002d
  = 6.61:1 (the #92 fix confirmed live) ✓; (d) tick worst 7.66:1 (holiday) ≥3:1 non-text ✓;
  (e) 46% hover tint ink worst 17.28:1 ✓. Visual check clean. No fix needed; one tick of the
  two budgeted. (no PR)
- [x] **18. Mobile (≤820) endless-month audit** — at 600 AND 800px, trusted touch input:
  (a) chips 10.9px/18px → bumped to 24px tall under (hover:none); (c) entry lands on today ✓;
  (d) quick-add present ✓; (e) popover opens via trusted TOUCH tap ✓ (pointer-capture seam
  holds). TWO fixes shipped: (b) dow row was static and invisible on mobile (0 labels) → sticky
  top:0 ≤820px; date-button touch target 52×14 → 58×24 (WCAG 2.5.8 24px; the 44px gate was a
  deliberate compromise — a 44px date would eat half the cell, and the huge cell-body popover
  target is the primary touch surface). Desktop verified byte-identical behavior. One tick of
  two budgeted. (PR #99)
- [ ] **19. Motion pass 2** — dashboard widget entrance stagger (50ms/item), toast timing/position
  vs design principles, checklist celebration timing; gate everything on reduce-motion.
- [ ] **20. Final sweep (explicitly 2–3 ticks; cannot ship a subset — the deliverable is the
  verdict)** — behavioral regression over ALL 14 surfaces (11 ROUTES + deadlines/packing/phrases;
  see harness doc) × light/dark × normal/compact + 600px; a11y pass (contrast/focus/aria);
  Opus critic panel over the loop's accumulated diff; written verdict here — unfixed findings
  logged, not buried.

- [ ] **21. (Arc E) Map layout & sidebar** — "Your pins" list rhythm (row density, icons,
  hover/focus states), filter chip rows (two stacked rows read noisy), search box + "＋ drop a
  pin" affordances; sidebar↔map proportions at 1300px.
- [ ] **22. (Arc E) Pins, clusters & popup cards** — marker/cluster styling on-palette, popup
  card typography/actions parity with the calendar side-panel language; selected-pin state.
- [ ] **23. (Arc E) Map controls & touch** — zoom/locate control styling per theme, 44px touch
  targets, geocoding feedback states (loading/empty/error), keyboard reachability of the pin list.

- [ ] **24. Un-reviewed surfaces: emergency + deadlines + packing + phrases** — emergency is a
  FULL nav route (crisis usability — worst page to skip); the other three are deep-linked from
  the dashboard (bell → deadlines, teaser → packing). Review each shot, write measured findings
  here, fix the top issues per page or tick "verified clean".

## Mid-loop critic (Arc C gate, 2026-07-10)
Opus critic over #93/#94/#96/#99: **#93, #94, #96 SIGN-OFF** (compact-nav scoping verified no
drawer leak; icon family exact; scroll-reset traced clean through goWeek/t/data-render paths).
**#99 NO-SIGN-OFF → fixed same tick (PR #100):** the mobile dowrow pinned at top:0 UNDERNEATH
the sticky mobile topbar (my "topbar scrolls away on mobile" premise was false — its static rule
is desktop-only, and my probe tested viewport presence, not occlusion). Now `top: var(--header-h)`;
re-verified with elementFromPoint occlusion checks at 600+800px. Logged minors (pre-existing,
no-fix): zero `(hover:hover)` gates repo-wide vs the plan's gate (plan-vs-practice drift);
38px topbar icons on touch (family standard).

## Working notes
- **Vibes-word rule (stages 10/11/13/14/16):** "balance/rhythm/breath/parity" must be converted,
  during the stage's evidence step, into ≥2 concrete measured deltas (px/ratio/count) written
  into this file BEFORE fixing; the PR body carries before/after numbers. No deltas → no fix.
- Screenshot evidence in session scratchpad: `sweep-dashboard/going/checklist/budget/explore/people/map/plan/rooms/packing/emergency/deadlines/phrases.png`.
- Not-yet-reviewed shots: people, checklist, packing, emergency, deadlines, phrases — review before
  their stages; add findings here.
- Parked (owner never re-requested): icon-rail cosmetic; Notion budget sync (needs owner token).
