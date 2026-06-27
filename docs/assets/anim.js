'use strict';
// S2 — route-view entrance cascade. On the FIRST visit to each route, the active
// view's top-level cards gently rise into place with a 45ms stagger. Transform-only
// (no opacity reset) so it never flashes against router.js's root crossfade, and
// first-visit-only so frequent back/forth nav isn't over-animated (design-principles:
// tens×/day actions → reduce motion). Fully reduce-motion gated.
import { prefersReducedMotion } from './motion.js';

const shown = new Set();
const SEL = '.card2, .top-card, .widget, .block, .pillar, .trk-card';
const EASE = 'cubic-bezier(.22, 1, .36, 1)';   // --ease-out

function reduced() {
  return prefersReducedMotion() || document.documentElement.dataset.reduceMotion === 'on';
}

function reveal() {
  const view = document.querySelector('.view.is-active');
  if (!view) return;
  const route = view.id || 'view';
  if (shown.has(route)) return;          // first visit only
  shown.add(route);
  if (reduced() || typeof Element.prototype.animate !== 'function') return;
  const els = [...view.querySelectorAll(SEL)]
    .filter(el => el.offsetParent !== null)   // visible only
    .slice(0, 12);                            // cap to the first screenful
  els.forEach((el, i) => {
    el.animate(
      [{ transform: 'translateY(9px)' }, { transform: 'translateY(0)' }],
      { duration: 240, delay: i * 45, easing: EASE, fill: 'backwards' }
    );
  });
}

export function mountAnim() {
  document.addEventListener('jwh:route', reveal);
  reveal();   // animate the view present at boot
}
