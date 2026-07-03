'use strict';
// S2 — route-view entrance cascade. On the FIRST visit to each route, the active
// view's top-level cards gently rise into place with a 45ms stagger. Transform-only
// (no opacity reset) so it never flashes against router.js's root crossfade, and
// first-visit-only so frequent back/forth nav isn't over-animated (design-principles:
// tens×/day actions → reduce motion). Fully reduce-motion gated.
import { prefersReducedMotion } from './motion.js';

const shown = new Set();
const CARD_SEL = '.card2, .top-card, .widget, .block, .pillar, .trk-card';
const LIST_SEL = '.check-item, .phrase-row';   // S8 — list-heavy views stagger rows, not blocks
const EASE = 'cubic-bezier(.22, 1, .36, 1)';   // --ease-out

function reduced() {
  return prefersReducedMotion() || document.documentElement.dataset.reduceMotion === 'on';
}

function visibleSlice(view, sel, cap) {
  return [...view.querySelectorAll(sel)].filter(el => el.offsetParent !== null).slice(0, cap);
}

function reveal() {
  const view = document.querySelector('.view.is-active');
  if (!view) return;
  const route = view.id || 'view';
  if (shown.has(route)) return;          // first visit only
  if (reduced() || typeof Element.prototype.animate !== 'function') { shown.add(route); return; }
  // Pick ONE strategy per view so motion never compounds (a block rising AND its rows rising):
  // stagger list rows on list-heavy views, else cascade the top-level cards/blocks.
  const rows = visibleSlice(view, LIST_SEL, 16);
  const useRows = rows.length >= 3;
  const targets = useRows ? rows : visibleSlice(view, CARD_SEL, 12);
  if (!targets.length) return;           // lazy view still importing (EF1) — don't burn its one animation on an empty shell
  shown.add(route);
  const step = useRows ? 32 : 45;        // rows are smaller/more numerous → tighter stagger
  targets.forEach((el, i) => {
    el.animate(
      [{ transform: 'translateY(9px)' }, { transform: 'translateY(0)' }],
      { duration: 240, delay: i * step, easing: EASE, fill: 'backwards' }
    );
  });
}

export function mountAnim() {
  document.addEventListener('jwh:route', reveal);
  reveal();   // animate the view present at boot
}
