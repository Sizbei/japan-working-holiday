'use strict';
// Pure neighbourhood-geocoding helpers shared by map.js and content.js. A baked place has
// no exact coords, only a neighbourhood; we place it at that neighbourhood's centroid
// (from tips.json `areaGeo`) plus a deterministic per-name jitter so places in one area
// spread instead of stacking. coordKind for these is always 'approx'.

export const AREAS = ['Shibuya', 'Shinjuku', 'Akihabara', 'Nakano', 'Koenji', 'Shimokitazawa', 'Shimokita',
  'Ebisu', 'Ikebukuro', 'Harajuku', 'Aoyama', 'Omotesando', 'Daikanyama', 'Nakameguro', 'Asakusa',
  'Ochanomizu', 'Toyosu', 'Roppongi', 'Ginza', 'Setagaya', 'Sangenjaya', 'Kichijoji', 'Ueno'];

export function areaOf(s) {
  const l = (s || '').toLowerCase();
  for (const a of AREAS) if (l.includes(a.toLowerCase())) return a === 'Shimokita' ? 'Shimokitazawa' : a;
  return 'Around Tokyo';
}
export const AREA_ORDER = [...new Set(AREAS.map(a => a === 'Shimokita' ? 'Shimokitazawa' : a)), 'Around Tokyo'];

export function jitter(name) {
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { dy: ((h % 1000) / 1000 - 0.5) * 0.011, dx: (((h >>> 10) % 1000) / 1000 - 0.5) * 0.011 };
}
export function centroid(areaGeo, group) { const g = areaGeo || {}; return g[group] || g['Around Tokyo'] || { lat: 35.68, lng: 139.74 }; }

// approximate coords for a baked place given its area string + a name for jitter
export function approxCoord(areaGeo, areaStr, name) {
  const c = centroid(areaGeo, areaOf(areaStr));
  const j = jitter(name || areaStr || '');
  return { lat: +(c.lat + j.dy).toFixed(5), lng: +(c.lng + j.dx).toFixed(5) };
}
