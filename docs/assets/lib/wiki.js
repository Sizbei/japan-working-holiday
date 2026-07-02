'use strict';
// "What's nearby" via Wikipedia geosearch (free, keyless, CORS via origin=*).
// parseGeoSearch is pure (unit-tested); fetchNearby is the thin network wrapper.

// Pure: API body → [{title, dist, url}] sorted by distance — drops malformed rows.
export function parseGeoSearch(j) {
  const rows = j && j.query && Array.isArray(j.query.geosearch) ? j.query.geosearch : [];
  return rows.map(g => {
    if (!g || typeof g.title !== 'string' || !g.title) return null;
    return {
      title: g.title,
      dist: typeof g.dist === 'number' ? Math.round(g.dist) : null,
      url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(g.title.replace(/ /g, '_')),
    };
  }).filter(Boolean).sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
}

export async function fetchNearby(lat, lng, { radius = 1500, limit = 8 } = {}) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${encodeURIComponent(lat)}%7C${encodeURIComponent(lng)}&gsradius=${encodeURIComponent(radius)}&gslimit=${encodeURIComponent(limit)}&format=json&origin=*`;
  const t = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
  const r = await fetch(url, { signal: t });
  if (!r.ok) throw new Error('wikipedia ' + r.status);
  return parseGeoSearch(await r.json());
}
