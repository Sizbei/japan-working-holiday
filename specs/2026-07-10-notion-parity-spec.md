# Notion Calendar parity spec (written distillation, 2026-07-10)

The owner steers calendar UX with screenshots of their Notion Calendar. Those screenshots are
session-bound and contain personal data (never commit them — PUBLIC repo). This file is the
durable, identity-free distillation; it is the loop's #1 design reference. When a fresh owner
screenshot arrives it supersedes this file — update it in the same PR.

## Month view (shipped through PR #86 — this is the achieved baseline, keep it true)
- Endless vertical scroll across the whole data range; NO month banner rows — the transition is
  the inline bold full-name day-1 label ("July 1") + the sticky toolbar label.
- Date numbers top-RIGHT of each cell. Focal month (the one in the toolbar label): full ink,
  larger (.84rem vs .72rem); non-focal months' numbers dim (ink-faint) and stay small. Today =
  crimson rounded SQUARE (6px radius) around the number; never dimmed; must not misalign its
  row (date row fixed 24px in every cell).
- All day cells the SAME background — no weekend, no past tint. Past days: EVENTS dim to 50%
  (hover restores), date number slightly soft; today/future full strength.
- Event chips: category tint bg (32% mix on elevated), ink text weight 600, 3px×10px vertical
  category LINE tick (not a dot), centered; hover deepens the tint (~46%). Timed chips show the
  time before the title.
- Cells hover-silent; the date number carries the hover pill (it zooms to that week on click;
  "+N more" also zooms to week). Cell-body click = day peek popover; empty-day click = quick-add.
- Chrome: toolbar (label ‹ › Today + view switcher) sticky on top, dow row flush under it,
  sidebar (mini-cal, calendars list, cockpit) sticky beside the grid; all react to the visible
  month as you scroll (label / mini-cal / cockpit).

## Week view (Notion reference notes, partially shipped)
- Column per day; today column highlighted; red now-line across today's column.
- Timed events: block with small colored left tick + time + title; past columns' events dim;
  ongoing multi-day bars stay bright, fully-over ones dim.
- All-day/multi-day bars in a strip above the time grid.

## General Notion feel
- Airy: generous cell padding, small dense type (.6–.7rem meta), strong ink-on-soft contrast.
- Minimal decorations: hairline separators, no outer boxes/rounded frames around grids.
- Everything reacts to scroll position; navigation glides (smooth scroll) rather than re-rendering.
