'use strict';
// Local, private usage tracking — aggregate counters only (no raw event log, nothing
// leaves the device). Answers "which pages/features do I actually use?" so the site
// can be improved around real behaviour. Pure functions (import-safe in Node); the
// DOM wiring lives in main.js, the summary UI in guide.js. Per-device by design.

const MAX_DAYS = 400;   // ~13 months of daily stamps; oldest pruned beyond this

export function emptyUsage() { return { v: 1, days: {}, routes: {}, acts: {} }; }

// guard a corrupted/legacy stored value → start fresh rather than brick
export function normalizeUsage(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return emptyUsage();
  return {
    v: 1,
    days: (u.days && typeof u.days === 'object') ? u.days : {},
    routes: (u.routes && typeof u.routes === 'object') ? u.routes : {},
    acts: (u.acts && typeof u.acts === 'object') ? u.acts : {},
  };
}

// Record one hit. kind: 'route' | 'act'. Returns a NEW state (never mutates the input).
export function bumpUsage(state, kind, key, todayIso) {
  const u = normalizeUsage(state);
  const bucketName = kind === 'route' ? 'routes' : 'acts';
  const prev = u[bucketName][key] || { n: 0, last: '' };
  const days = { ...u.days, [todayIso]: (u.days[todayIso] || 0) + 1 };
  const keys = Object.keys(days).sort();
  while (keys.length > MAX_DAYS) delete days[keys.shift()];   // prune oldest day-stamps
  return {
    ...u,
    days,
    [bucketName]: { ...u[bucketName], [key]: { n: prev.n + 1, last: todayIso } },
  };
}

// Summarise for display. allRoutes = the site's route ids (to surface never-visited ones).
export function usageSummary(state, allRoutes = []) {
  const u = normalizeUsage(state);
  const routes = Object.entries(u.routes)
    .map(([route, r]) => ({ route, n: r.n || 0, last: r.last || '' }))
    .sort((a, b) => b.n - a.n || a.route.localeCompare(b.route));
  const totalVisits = routes.reduce((s, r) => s + r.n, 0);
  const edits = u.acts.edits?.n || 0;
  const visited = new Set(routes.map(r => r.route));
  const neverUsed = allRoutes.filter(r => !visited.has(r));
  return { daysUsed: Object.keys(u.days).length, totalVisits, edits, routes, neverUsed };
}
