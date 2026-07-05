# Event detail → anchored flip-popover — plan (2026-07-06)

Owner ask (from a Notion reference): the event detail should appear as a compact popover
ANCHORED to the clicked event, flipping to the opposite side (event on the right → popover on
the left, and vice versa) so the event stays visible — not the current always-from-the-right
full-height side panel. And the Going/actions pinned at the BOTTOM (not squished into the
content flow). Decisions: mobile = bottom sheet (already the CSS behavior); width ~320px.

## Stages

- [x] **EP1 Anchored flip-positioning (≥700px).** Repurpose `.cal-sidepanel`: the fixed container
      holds a transparent (no-dim) backdrop + a content-sized `.sp-inner` card (width 320, max-height
      70vh) positioned via inline top/left computed in `openSidePanel` from the trigger's rect:
      place LEFT of the event when it's in the right ~55% or there's no room right, else RIGHT;
      clamp both axes into the viewport. Entrance = fade/scale (reduce-motion gated), not the slide.
- [x] **EP2 Actions pinned to the bottom.** `.sp-body` becomes `flex:1; min-height:0; overflow-y:auto`
      so it scrolls; `.sp-actions` is the always-visible footer (Going hero + secondary row). Because
      the card is content-sized with a max-height, short events have no dead zone AND long ones keep
      Going reachable at the bottom.
- [x] **EP3 Keep + mobile.** Click-away/Escape/focus-restore unchanged. ≤699px keeps the existing
      bottom-sheet CSS (dim backdrop, slide-up, actions at bottom) — JS skips inline positioning there.
- [x] **EP4 Verify.** CDP: click a RIGHT-side event → popover flips LEFT (event visible); click a
      LEFT event → popover RIGHT; actions pinned at bottom on a long note; mobile still a bottom sheet;
      screenshots both flips; tests + guard. Adversarial review after.
