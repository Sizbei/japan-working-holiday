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
- [ ] **3. Budget empty-state honesty** — with savings/income unset the header screams
  `NET −¥190,000` / `RUNWAY 0 mo` in crimson. Unset → em-dash + "set your savings below" hint;
  alarm colors only when real numbers produce them.
- [ ] **4. Going page layout** — one card in a huge void: grid `auto-fill minmax(300px,1fr)` to use
  the column; stray ✎ icon dangling under the location line; "Upcoming only" chip is an
  off-palette green outline → align with site chip language.
- [ ] **5. Plan-a-Day date strip** — pills overflow the right edge with a cut-off pill and no
  affordance: horizontal scroll + edge fades (design-principles tabs rule), auto-scroll today
  into view.
- [ ] **6. Plan-a-Day stop cards** — ▲▼/✕ control cluster misaligned two-row; long transit notes
  clip at the card edge (`overflow` → wrap); tighten the dead right rail.
- [ ] **7. Map tiles vs theme** — map renders near-black in LIGHT theme (dark tile filter leaking,
  or slow tiles): verify + scope any tile filter to `[data-theme="dark"]`.
- [ ] **8. Rooms badge overload** — listing cards drown in colored mono badges; keep 2–3 primary
  + "+N more" disclosure.
- [ ] **9. Topbar icon row** — moon (theme) button shows a stuck glow/highlight circle; unify the
  5 icon buttons' rest/hover/active states + titles.
- [ ] **10. Dashboard hero balance** — large dead space right of the title block; tighten hero
  height / let the sun motif or countdown fill the column.
- [ ] **11. Dashboard widget row rhythm** — bottom teaser cards: equalize paddings/heights,
  consistent title/label hierarchy.
- [ ] **12. Explore finding cards** — hover/focus affordance (cards read static), tighten
  source-link row, audit HIGH/MEDIUM/LOW badge colors for contrast.
- [ ] **13. Checklist visual pass** — FIRST review its (never-reviewed) sweep shot and write
  measured findings here; fix against the page's OWN spacing scale (not the calendar's — the
  own-scale gate governs); verify locked-item affordance still reads. Clean page → tick
  "verified no-change".
- [ ] **14. People page review** — page is freshly designed (#68/#71/#82): review its
  never-reviewed shot first, write measured findings, fix only measured inconsistencies against
  its OWN scale. Expect small or no changes; "verified no-change" is a valid outcome.
- [ ] **15. Week view chrome parity** — START by diffing against what #83/#85 already shipped
  (past-column dimming, aligned rows) and cite the RESIDUAL gap; then: sticky toolbar behavior
  in week mode, time-gutter/dow header alignment vs `specs/2026-07-10-notion-parity-spec.md`
  week section. No residual gap → "verified no-issue".
- [ ] **16. Agenda view Notion-list parity** — date group headers, weight hierarchy, hover rows.
- [ ] **17. Dark-theme audit (bounded checklist, may span 2 ticks)** — measure each against dark
  bg per the harness contrast procedure: (a) chip tint+ink ratio, (b) `.moff` dim vs focal,
  (c) crimson today square, (d) tick visibility, (e) chip hover tint. Stage ticks when all five
  have measured numbers and any failures are fixed.
- [ ] **18. Mobile (≤820) endless-month audit (bounded checklist, may span 2 ticks)** — at 600px
  AND 800px (drawer band): (a) chip legibility, (b) dow row, (c) positioning on entry,
  (d) quick-add, (e) popover reachability with TRUSTED touch input (pointer-capture seam burned
  us once). Stage ticks when all five verified/fixed.
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

## Working notes
- **Vibes-word rule (stages 10/11/13/14/16):** "balance/rhythm/breath/parity" must be converted,
  during the stage's evidence step, into ≥2 concrete measured deltas (px/ratio/count) written
  into this file BEFORE fixing; the PR body carries before/after numbers. No deltas → no fix.
- Screenshot evidence in session scratchpad: `sweep-dashboard/going/checklist/budget/explore/people/map/plan/rooms/packing/emergency/deadlines/phrases.png`.
- Not-yet-reviewed shots: people, checklist, packing, emergency, deadlines, phrases — review before
  their stages; add findings here.
- Parked (owner never re-requested): icon-rail cosmetic; Notion budget sync (needs owner token).
