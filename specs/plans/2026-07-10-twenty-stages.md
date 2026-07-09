# 20-stage improvement loop (2026-07-10)

Owner: "run through the site and let's run 20 stages of improvements … brainstorm parity and design
fixes and visually weird things and bad UI choices." Loop fires every 30 min; each stage = small,
verified, shipped (branch → PR → squash → SW bump). Tick stages off here with the PR number.
Lenses: Notion parity · design fixes · visually weird · bad UI choices.
Evidence: full-route screenshot sweep 2026-07-10 (scratchpad `sweep-*.png`), 0 console errors.

- [x] **1. Calendar breath + motion + tick fix** — cell/chip spacing, fixed centered tick, popover
  + mode-switch entrances, chip hover transition. (PR #86)
- [ ] **2. Topbar nav crowding (~1300px)** — "Plan a Day" wraps to 3 lines, "Emergency" truncates
  (visible in compact sweep + owner screenshot). Tighten label spacing/size, consider shorter
  labels ("Plan", "SOS"?? keep honest), prevent wrap; verify 1100–1600px.
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
- [ ] **13. Checklist visual pass** — row density/phase-header hierarchy parity with the
  calendar's new breath; verify locked-item affordance still reads.
- [ ] **14. People page breath** — mirror the calendar breath (card paddings/grid gap); drift-strip
  styling refinement.
- [ ] **15. Week view chrome parity** — sticky toolbar behavior in week mode, time-gutter/dow
  header alignment, past-column tint consistency with month.
- [ ] **16. Agenda view Notion-list parity** — date group headers, weight hierarchy, hover rows.
- [ ] **17. Dark-theme audit of the Notion calendar** — ticks, `.moff` dim levels, red today square,
  32% chip tints, hover tint: all against dark bg (WCAG AA).
- [ ] **18. Mobile (≤820) endless-month audit** — chip legibility, dow row, positioning on entry,
  quick-add, popover reachability with touch (no hover).
- [ ] **19. Motion pass 2** — dashboard widget entrance stagger (50ms/item), toast timing/position
  vs design principles, checklist celebration timing; gate everything on reduce-motion.
- [ ] **20. Final sweep** — full behavioral regression (all routes, both themes, compact, mobile),
  a11y pass (contrast/focus/aria), Opus critic panel over the loop's accumulated diff; fix or
  log every finding.

## Working notes
- Screenshot evidence in session scratchpad: `sweep-dashboard/going/checklist/budget/explore/people/map/plan/rooms/packing/emergency/deadlines/phrases.png`.
- Not-yet-reviewed shots: people, checklist, packing, emergency, deadlines, phrases — review before
  their stages; add findings here.
- Parked (owner never re-requested): icon-rail cosmetic; Notion budget sync (needs owner token).
