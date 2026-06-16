'use strict';
// Motion primitives — View Transitions API with a Web-Animations fallback, plus
// stagger + FLIP helpers. All resolve a Promise so callers can await; all collapse
// to instant under prefers-reduced-motion (callbacks still fire — never stuck).

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Run a DOM-swap inside a transition. Stable regions (topbar/hero/route-nav) carry a
// view-transition-name so they don't cross-fade — only the swapped view does.
export function transitionView(updateFn) {
  if (prefersReducedMotion() || !document.startViewTransition) {
    updateFn();
    return Promise.resolve();
  }
  try {
    return document.startViewTransition(updateFn).finished.catch(() => {});
  } catch {
    updateFn();
    return Promise.resolve();
  }
}

// Entrance stagger for a list of elements (hero, card grids).
export function stagger(els, { y = 10, step = 38, dur = 240 } = {}) {
  if (prefersReducedMotion() || !els || !els.length) return;
  [...els].forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }],
      { duration: dur, delay: i * step, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }
    );
  });
}

// FLIP settle for drag-drop: animate an element from a previous rect to its new spot.
export function playFLIP(el, fromRect, { dur = 180 } = {}) {
  if (prefersReducedMotion() || !fromRect || !el) return;
  const to = el.getBoundingClientRect();
  const dx = fromRect.left - to.left, dy = fromRect.top - to.top;
  if (!dx && !dy) return;
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
    { duration: dur, easing: 'cubic-bezier(.34,1.56,.64,1)' }
  );
}
