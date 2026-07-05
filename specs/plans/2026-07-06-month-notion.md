# Month view → Notion-style (connected bars + bigger) — plan (2026-07-06)

Owner: connect multi-day events into ONE continuous bar across days + week-rows (today a chip is
repeated per cell); make the calendar bigger (taller cells); more Notion-like. Decisions: multi-day
spanning bars (not same-title linking); taller cells. (Page-scroll already fixed in PR #48.)

- [x] MC1 Connected multi-day bars: 6 `.cal-week` rows; per week packLanes() the multi-day events
      into lanes → `.cal-bar` spanning grid-column with ‹/› continuation; cells reserve top space for
      the lanes; single-day events stay chips below. Lane cap ~3 → overflow to "+N more".
- [x] MC2 Bigger cells (now that the page scrolls as one).
- [ ] MC3 (deferred — merged what we have per owner) Notion polish (day numbers, pills, weekend/out, today).
- [ ] MC4 (deferred — adversarial review after merge) Verify + adversarial review.
