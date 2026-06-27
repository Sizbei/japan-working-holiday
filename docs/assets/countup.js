'use strict';
// S16 — count-up animation. Any element with data-countup="N" tallies from 0 → N the first time
// the dashboard is shown (once per session). Reduce-motion shows the final value immediately.
import { prefersReducedMotion } from './motion.js';

let done = false;
const reduced = () => prefersReducedMotion() || document.documentElement.dataset.reduceMotion === 'on';

function animateOne(el) {
  const target = parseInt(el.dataset.countup, 10);
  if (!isFinite(target)) return;
  if (reduced() || typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') {
    el.textContent = String(target); return;
  }
  const dur = 900, start = performance.now();
  el.textContent = '0';
  const tick = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - k, 3);   // ease-out cubic
    el.textContent = String(Math.round(target * eased));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function run() {
  if (done) return;
  const view = document.querySelector('#view-dashboard');
  if (!view) return;
  const els = [...view.querySelectorAll('[data-countup]')];
  if (!els.length) return;
  done = true;
  els.forEach(animateOne);
}

export function mountCountUp() {
  run();   // dashboard is the default route at boot
  document.addEventListener('jwh:route', run);   // self-guards (runs once, only when targets exist)
}
