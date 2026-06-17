'use strict';
// Pure stat counter for the map header "visited" line (Map v2 spec §2d):
//   "You've been to 23 of 60 saved places · 7 of 11 neighbourhoods."
// No DOM, no storage — import-safe in Node, unit-tested. The caller supplies `areaOf`
// (from lib/geo.js) so this module stays decoupled from the geocoding tables.

// places  : array of place records ({ visited, address?, area? } shape)
// areaOf  : (string) => neighbourhood bucket name (geo.js areaOf)
// returns : { total, visited, areasTotal, areasVisited }
//   total        = number of places
//   visited      = count with .visited truthy
//   areasTotal   = distinct area buckets across ALL places
//   areasVisited = distinct area buckets among VISITED places only
export function placesVisitedStats(places, areaOf) {
  const list = Array.isArray(places) ? places : [];
  // bucket each place by its area string (address preferred, then area, then '')
  const bucket = (p) => areaOf((p && (p.address || p.area)) || '');
  const allAreas = new Set();
  const visitedAreas = new Set();
  let visited = 0;
  for (const p of list) {
    const a = bucket(p);
    allAreas.add(a);
    if (p && p.visited) { visited++; visitedAreas.add(a); }
  }
  return { total: list.length, visited, areasTotal: allAreas.size, areasVisited: visitedAreas.size };
}
