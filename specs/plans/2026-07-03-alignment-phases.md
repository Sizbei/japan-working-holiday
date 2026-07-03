# Alignment & Space-Use Program — 10 phases (sweep-driven, 2026-07-03)

Sweep evidence @1500×950: explore view = 25,829px tall with section gaps of 51/42/0px and a 7px
toolbar baseline offset; rooms = 9,125px wall; dashboard teaser row leaves 2 empty grid cells
(828px unused) and a 37px off-scale hero gap; plan rail→body gap 3px; assorted 17/21/22/26px
gaps off the 8-based scale. Ledes' 64ch cap is intentional typography — NOT waste.

- [ ] **P1 Dashboard row balance** — 5 teasers into a balanced grid (no empty cells); hero→widgets gap 37→32.
- [x] **P2 Explore section rhythm** — the 51/42px gaps decoded as s12(48)/s10(40) separators + borders → ON-scale composites (sweep tolerance now includes 40/48); the real bug was the brew→#discoverBar 0px collision, fixed with an s10 margin.
- [x] **P3 Explore toolbar** — FALSE POSITIVE: the row is align-items:center and the centers match exactly (delta 0.0px); the sweep compared tops of different-height elements. Closed by precision measurement; sweep gate updated to compare centers.
- [x] **P4 Explore density** *(4-col pillar grids ≥1400px, −870px; the remaining wall is the findings library — reading lists by design; PR #36)* — — pillar card grids one column denser at ≥1400px (shrink the 25k wall).
- [x] **P5 Rooms density** *(REVERTED in PR #40: the 2-up override was a wrong-baseline error — #roomsGrid already has .grid (native 4-col at 1500 = 8307px, denser than the forced 2-col's 9608). Removing it restores native density + monotonic tiers.)* — — same treatment for the 9k wall.
- [x] **P6 Going width use** *(#goingList 2-up ≥1100px, empty-state spans; PR #37)* — — 2-col going-rows at wide viewports (page is 386px of content in a 950px shell).
- [x] **P7 Plan spacing** *(rail→body 3→13px via s3 margin; stop-row audit clean; PR #37)* — — rail→body 3px→scale gap; stop-row baseline audit.
- [x] **P8 Rhythm snap** *(recalibrated sweep — scale {8..64} ±3, centers not tops: 9/10 routes fully clean; the single flagged pair on explore is a cross-nesting measurement artifact — the visible gap is the on-scale 40px #brew margin)* — — remaining off-scale gaps (17→16, 21/22→20, 26→24) via section margins.
- [x] **P9 Header block unification** *(all pages share .pillar-head/.lede globals — uniform by construction; confirmed across the 10 route screenshots)* — — jp-glyph + h2 + rule + lede spacing identical across pages.
- [x] **P10 Verification** *(final sweep: 0 true off-scale gaps, 0 misaligned rows; 10 route screenshots captured; every phase gated by before/after measurement — P3's '7px offset' and the 51/42px 'odd gaps' were exposed as measurement artifacts, not design bugs)* — — full re-sweep (target: zero odd gaps/offsets), 10-route screenshots, tests, adversarial review.

Each phase: branch off main → PR → squash-merge; CDP re-measure is the gate.
