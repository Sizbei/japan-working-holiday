'use strict';
// Tiny hash router for the SPA. Routes #/dashboard #/calendar #/deadlines #/checklist
// #/explore; maps legacy section anchors to their route; animates view swaps via
// motion.transitionView; moves focus to the view heading for a11y.

import { transitionView, prefersReducedMotion } from './motion.js';

export const ROUTES = ['dashboard', 'calendar', 'going', 'deadlines', 'checklist', 'packing', 'explore', 'rooms', 'map', 'plan'];

// legacy section id → route (for intercepting old in-app anchor links)
const LEGACY = {
  main: 'dashboard', dashHome: 'dashboard',
  calendarSection: 'calendar',
  trackerSection: 'deadlines', timeSensitiveSection: 'deadlines', topSection: 'deadlines',
  checklist: 'checklist',
  controls: 'explore', brew: 'explore', activities: 'explore', restaurants: 'explore',
  disney: 'explore', building: 'explore', music: 'explore', geek: 'explore',
  meetups: 'explore', canadaSection: 'explore', sourcesSection: 'explore',
  livemusic: 'explore', rooms: 'rooms', map: 'map', plan: 'plan',
};

// pure: parse a hash string into a route (exported for unit testing)
export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  if (ROUTES.includes(h)) return h;
  if (LEGACY[h]) return LEGACY[h];
  return 'dashboard';
}

let current = null;

// per-route document title so browser tabs + history entries read like real pages
const TITLES = {
  dashboard: 'Dashboard', calendar: 'Calendar', going: 'Going To', deadlines: 'Deadlines', checklist: 'Checklist',
  packing: 'Packing', explore: 'Explore', rooms: 'Rooms', map: 'Map', plan: 'Plan a Day',
};
const SITE = 'My Year in Japan';

function activate(route, { scroll = true } = {}) {
  const target = document.getElementById('view-' + route);
  if (!target) return;
  document.title = TITLES[route] ? `${TITLES[route]} · ${SITE}` : SITE;
  const rh = document.getElementById('routeH1');
  if (rh) { rh.hidden = route === 'dashboard'; rh.textContent = TITLES[route] || SITE; }
  transitionView(() => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    target.classList.add('is-active');
  }).then(() => {
    const h = target.querySelector('h1, h2, h3');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  });
  document.querySelectorAll('#routeNav a[data-route]').forEach(a => {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (scroll && route !== current) {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  current = route;
  document.dispatchEvent(new CustomEvent('jwh:route', { detail: { route } }));
}

function onHash() { activate(parseRoute(location.hash)); }

export function initRouter() {
  document.documentElement.classList.add('js-router');
  // intercept legacy section anchors (skip-link, brand, widget links, sources) → route
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#/')) return;             // real route link — let hashchange run
    const id = href.slice(1);
    if (LEGACY[id] !== undefined) { e.preventDefault(); location.hash = '#/' + LEGACY[id]; }
  });
  window.addEventListener('hashchange', onHash);
  onHash();
}
