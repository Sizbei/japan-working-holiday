'use strict';
// Pure, DOM-free, network-free ranking over the unified placesModel() point list (map.js).
// Powers the INSTANT, offline local section of the unified place search; the geocode
// (Nominatim) section is handled separately in map.js. No input mutation.
//
// Point shape (from placesModel): { id, kind:'user'|'event'|'catalogue', name, area, lat, lng, ... }.
// "Saved" = kind 'user'. Event points are discovery noise here and are skipped.

// score a single point against a normalized (lowercased, trimmed) query. 0 = no match (dropped).
function scoreOf(pt, q) {
  const name = (pt.name || '').toLowerCase();
  const area = (pt.area || '').toLowerCase();
  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 2;
  if (area.includes(q)) return 1;
  return 0;
}

// stable dedup key: name|lat|lng so a catalogue point that's ALSO saved (same place, same
// coords) collapses onto the saved one; fall back to the id only when name+coords are absent.
// kind 'user' wins the collision (see searchLocal).
function keyOf(pt) {
  const nm = (pt.name || '').toLowerCase().trim();
  if (nm || pt.lat != null || pt.lng != null) return nm + '|' + pt.lat + '|' + pt.lng;
  return 'id:' + pt.id;
}

export function searchLocal(points, query, limit = 6) {
  const q = (query || '').trim().toLowerCase();
  if (!q || !Array.isArray(points)) return [];
  // 1) score + filter (skip events, skip below-threshold) — copies only, never the inputs
  const scored = [];
  for (const pt of points) {
    if (!pt || pt.kind === 'event') continue;
    const score = scoreOf(pt, q);
    if (score <= 0) continue;
    scored.push({ ...pt, score });
  }
  // 2) dedup by stable key; saved (kind 'user') beats catalogue on collision
  const byKey = new Map();
  for (const r of scored) {
    const k = keyOf(r);
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, r); continue; }
    const better = (r.kind === 'user' && prev.kind !== 'user') ? r
      : (prev.kind === 'user' && r.kind !== 'user') ? prev
      : (r.score > prev.score ? r : prev);
    byKey.set(k, better);
  }
  // 3) rank: score desc, then shorter name, then alpha
  return [...byKey.values()].sort((a, b) =>
    b.score - a.score
    || (a.name || '').length - (b.name || '').length
    || (a.name || '').localeCompare(b.name || '')
  ).slice(0, limit);
}
