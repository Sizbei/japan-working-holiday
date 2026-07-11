'use strict';
// Lazy route loader (efficiency plan EF5). Route-only page modules import + mount on the FIRST
// entry to their hash route instead of at boot, so their parse/mount cost leaves the boot path
// for pages you may never open. Generalizes the EF1 phrases pattern.
//
// First-paint contract: every registered module renders on mount (or the loader arranges it),
// because the jwh:route event that triggered the load has ALREADY fired by the time the module
// attaches its own listener. Gate first paint on location.hash — the router sets the hash
// synchronously, but the .is-active class toggle runs in a View-Transition microtask (motion.js),
// so it is NOT yet true when the module mounts.
//
// Cross-module events that target a lazy page (e.g. calendar's "縁 met here" → jwh:people-open)
// fire before the page's listener exists unless they wait. ensureRoute(name) returns the memoized
// load promise so a dispatcher can do:
//   location.hash = '#/people'; ensureRoute('people').then(() => dispatch(...));

const registry = new Map();   // route name -> memoized loader () => Promise

// Register a lazy page. `routes` are the hash-route names that trigger it; `load` performs the
// dynamic import + mount and returns a Promise. `load` runs at most once (the loader is memoized).
export function registerLazyRoute(routes, load) {
  let promise = null;
  const busy = (r) => document.getElementById('view-' + r);
  const run = (entered) => {
    if (promise) return promise;
    const v = busy(entered) || busy(routes[0]);
    v?.setAttribute('aria-busy', 'true');           // dims the static shell until the mount lands (see CSS)
    // Mount ONCE: never reset `promise` on failure. A re-run would re-attach listeners (rooms
    // attaches its jwh:route/data-changed listeners BEFORE its first render), and retrying a
    // deterministic mount error just repeats it. This matches the prior eager safe(mount) — one
    // attempt, console on failure — and beats eager for import errors (one page fails, not boot).
    promise = Promise.resolve().then(load)
      .then(() => v?.removeAttribute('aria-busy'))
      .catch(err => { v?.removeAttribute('aria-busy'); console.error('[lazyroute]', routes.join('/'), err); });
    return promise;
  };
  routes.forEach(r => registry.set(r, () => run(r)));
  document.addEventListener('jwh:route', (e) => { const r = e.detail?.route; if (routes.includes(r)) run(r); });
  // direct load / reload while already on one of these routes (exact hash match)
  const rx = new RegExp('^#/?(' + routes.join('|') + ')$');
  if (rx.test(location.hash)) run(routes.find(r => location.hash.replace(/^#\/?/, '') === r) || routes[0]);
}

// Ensure a lazy route's module is mounted; resolves when the mount is done (memoized). Returns a
// resolved promise for an unregistered/eager route so callers can await unconditionally.
export function ensureRoute(name) {
  const loader = registry.get(name);
  return loader ? loader() : Promise.resolve();
}
