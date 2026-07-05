# Week View → Hour-by-Hour Time Grid — plan (2026-07-05)

Goal: rework the DESKTOP week view into a scrollable hour-by-hour time grid (Notion-Calendar
style), in our warm-paper/dark theme. Mobile keeps the existing per-day list. All-day/multi-day
events stay in the top band (reusing the proven bars + drag-resize); timed events move into the grid.

Owner decisions: (1) FULL — add start/end time to the editor + bake real times into the flights so
the grid has content; (2) mobile stays the list.

Crux found: events have a `time` (start, from quick-add only) but no end time, and the editor has
NO time field — so today nearly everything is all-day. Fixing the data is half the job.

## Stages (each: branch already open; verify gate; one PR at the end or split if large)

- [x] **WG0** Pure helpers — `parseHM`, `layoutDay` (overlap columns) in lib/weekgrid.js, unit-tested (+3, 83 total).
- [ ] **WG1** Data + editor. Add optional Start/End time to the event editor (row2), save `time`/`endTime`
      on user events (clamp end>start; default 60-min block when end missing). Bake times into the 4
      flight events (OZ271 dep, OZ102 08:25–10:50, NRT→CTS 15:10–17:00, CTS→NRT 10:30–12:10).
      Verify: editor round-trips time/endTime; flights carry times; JSON valid; tests green.
- [ ] **WG2** Desktop grid. Split week events: multi-day → bars (band), single-day untimed → chips
      (band), single-day timed → grid. New `weekGridHTML`: day-header row, all-day band, then a
      scrollable 24×7 grid — hour gutter (JST only), hour rules, positioned blocks (top=start,
      height=duration, side-by-side on overlap via layoutDay), red now-line on today, auto-scroll
      to ~8AM/now. Theme: category tint + left accent, --line rules, --shu now-line.
      Verify: CDP desktop screenshot matches the reference; flights/quick-adds land at the right hour.
- [ ] **WG3** Wiring. Click block → openSidePanel; click an empty hour cell → openModal prefilled
      with that day + rounded time; preserve the band's drag-resize/drag-create; narrow-week list
      untouched. Verify: click-to-open, click-empty-to-add-at-time, mobile still list, 0 console errors.
- [ ] **WG4** Verify + iterate. Full week-view CDP (desktop grid + mobile list), no page overflow,
      tests, curly guard. Screenshot to owner; iterate on spacing/typography.
