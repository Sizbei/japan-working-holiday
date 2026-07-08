'use strict';
// Tiny hash router for the SPA. Routes #/dashboard #/calendar #/deadlines #/checklist
// #/explore; maps legacy section anchors to their route; animates view swaps via
// motion.transitionView; moves focus to the view heading for a11y.

import { transitionView, prefersReducedMotion } from './motion.js';

// deadlines/packing/phrases retired from the nav post-arrival (their views + data remain for the
// dashboard/notifications; re-add here + in index.html to restore).
export const ROUTES = ['dashboard', 'calendar', 'plan', 'map', 'explore', 'going', 'checklist', 'budget', 'rooms', 'emergency'];

// retired from the nav but still deep-linkable — dashboard teasers/notifications link here
// (#/deadlines, #/packing) and the views stay mounted; they're just not in the swipe/nav order.
const HIDDEN = ['deadlines', 'packing', 'phrases'];

// legacy section id → route (for intercepting old in-app anchor links)
const LEGACY = {
  main: 'dashboard', dashHome: 'dashboard',
  calendarSection: 'calendar',
  trackerSection: 'dashboard', timeSensitiveSection: 'dashboard', topSection: 'dashboard',   // deadlines route retired → land on the dashboard
  checklist: 'checklist',
  controls: 'explore', brew: 'explore', activities: 'explore', restaurants: 'explore',
  disney: 'explore', building: 'explore', music: 'explore', geek: 'explore',
  meetups: 'explore', homeSection: 'explore', sourcesSection: 'explore',
  livemusic: 'explore', rooms: 'rooms', map: 'map', plan: 'plan',
};

// pure: parse a hash string into a route (exported for unit testing)
export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  if (ROUTES.includes(h) || HIDDEN.includes(h)) return h;
  if (LEGACY[h]) return LEGACY[h];
  return 'dashboard';
}

let current = null;

// per-route document title so browser tabs + history entries read like real pages
const TITLES = {
  dashboard: 'Dashboard', calendar: 'Calendar', going: 'Going To', checklist: 'Checklist',
  budget: 'Budget', explore: 'Explore', rooms: 'Rooms', map: 'Map', plan: 'Plan a Day', emergency: 'Emergency',
  deadlines: 'Deadlines', packing: 'Packing', phrases: 'Phrases',
};
const SITE = 'My Year in Japan';

// route → human label (for the command palette). TITLES stays module-local.
export function routeLabel(route) { return TITLES[route] || route; }

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
  let activeNav = null;
  document.querySelectorAll('#routeNav a[data-route]').forEach(a => {
    if (a.dataset.route === route) { a.setAttribute('aria-current', 'page'); activeNav = a; }
    else a.removeAttribute('aria-current');
  });
  // on the mobile scrollable bottom bar, keep the current tab in view (no-op on the desktop wrap nav)
  activeNav?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  if (scroll && route !== current) {
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    // desktop app-shell: MAIN is the scroll container; the window barely scrolls (footer sliver)
    document.getElementById('main')?.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  }
  current = route;
  document.body.dataset.route = route;   // lets CSS scope per-route (e.g. the calendar opts out of the app-shell internal scroll)
  document.dispatchEvent(new CustomEvent('jwh:route', { detail: { route } }));
}

function onHash() { activate(parseRoute(location.hash)); }

export function initRouter() {
  document.documentElement.classList.add('js-router');
  // intercept legacy section anchors (skip-link, brand, widget links, sources) → route
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    if (a.classList.contains('skip-link')) {       // 2.4.1: skip = focus main, NOT a navigation
      e.preventDefault();
      document.getElementById('main')?.focus();
      return;
    }
    const href = a.getAttribute('href');
    if (href.startsWith('#/')) return;             // real route link — let hashchange run
    const id = href.slice(1);
    if (LEGACY[id] !== undefined) { e.preventDefault(); location.hash = '#/' + LEGACY[id]; }
  });
  window.addEventListener('hashchange', onHash);
  onHash();
}
