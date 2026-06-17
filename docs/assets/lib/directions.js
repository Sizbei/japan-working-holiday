'use strict';
// Directions handoff — keyless Maps deep-links (Map v2 spec §1b).
// PURE + import-safe in Node: no DOM, no localStorage, no network. The UI (map.js /
// plan.js) builds the href from these, escapes it, and opens it in the native Maps app.
// We never compute routing in-app — same keyless-URL family as map.js gmaps().

// Web Mercator caps usable lat to ±85; a finite, real coordinate pair only.
const isNum = (n) => typeof n === 'number' && isFinite(n);
const isLatLng = (p) => p && isNum(p.lat) && isNum(p.lng);
const coord = (p) => `${p.lat},${p.lng}`;            // "LAT,LNG" (unencoded; encoded by caller below)
const enc = encodeURIComponent;

// Google caps a single dir URL at 10 points total (origin + dest + 8 waypoints).
const MAX_POINTS = 9;                                 // origin + destination + up to 7 waypoints

// directionsUrl — one origin→destination link.
//   from: {lat,lng} | null | undefined  (omitted when not a real coord — e.g. live device location)
//   to:   {lat,lng} | name string       (name handed off as text for approx/jittered pins)
//   mode: Google travelmode (transit | driving | walking | bicycling)
//   platform: 'ios' → Apple Maps form; anything else → Google (universal default)
export function directionsUrl({ from, to, mode = 'transit', platform } = {}) {
  // Destination: a real coord beats a name; a name string falls back to a text search.
  const dest = isLatLng(to) ? coord(to) : String(to ?? '');
  const orig = isLatLng(from) ? coord(from) : '';     // omit origin unless it's a real coord

  if (platform === 'ios') {
    // Apple Maps: dirflg=r => transit (public transport). saddr omitted => current location.
    const parts = [];
    if (orig) parts.push('saddr=' + enc(orig));
    parts.push('daddr=' + enc(dest));
    parts.push('dirflg=r');
    return 'https://maps.apple.com/?' + parts.join('&');
  }

  // Google Maps universal URL scheme (api=1).
  const parts = ['api=1'];
  if (orig) parts.push('origin=' + enc(orig));
  parts.push('destination=' + enc(dest));
  parts.push('travelmode=' + enc(mode));
  return 'https://www.google.com/maps/dir/?' + parts.join('&');
}

// waypointsUrl — one Google "dir/" link threading an ordered list of {lat,lng} stops
// (a whole planned day). Drops coordless/non-numeric stops (mirrors drawRoute's filter)
// and caps at MAX_POINTS, noting any overflow that was dropped.
//   returns { url, used, dropped } — url is '' when fewer than 2 usable stops remain.
export function waypointsUrl(stops, opts = {}) {
  const mode = opts.mode || 'transit';
  const usable = (stops || []).filter(isLatLng);      // drop null / non-numeric coords
  const noCoord = (stops || []).length - usable.length;

  const used = usable.slice(0, MAX_POINTS);
  const overflow = usable.length - used.length;       // valid stops beyond the 9-point cap
  const dropped = noCoord + overflow;

  if (used.length < 2) return { url: '', used: used.length, dropped };

  // Google "dir/" path form: /LAT,LNG/LAT,LNG/... — intermediate points become waypoints.
  const path = used.map((p) => enc(coord(p))).join('/');
  const url = `https://www.google.com/maps/dir/${path}?api=1&travelmode=${enc(mode)}`;
  return { url, used: used.length, dropped };
}

// groupByArea — reorder stop ids so stops in the same neighbourhood sit next to each
// other, for an honest "group by area" itinerary (the spec's replacement for the cut
// lat/lng "sort by nearest", which approx+jitter coords can't support).
//   stops:  [{ id, ... }]
//   areaOf: (stop) => area string | null/'' for "no area"
// Order rules: first-seen area order is preserved; within an area, original order is
// preserved; stops with no area keep their relative order and sit at the very end.
export function groupByArea(stops, areaOf) {
  const list = stops || [];
  const order = [];          // area names, in first-seen order
  const buckets = new Map(); // area -> [id, id, ...] (original order within)
  const noArea = [];         // ids with no area, original order

  for (const s of list) {
    const a = areaOf ? areaOf(s) : null;
    if (!a) { noArea.push(s.id); continue; }
    if (!buckets.has(a)) { buckets.set(a, []); order.push(a); }
    buckets.get(a).push(s.id);
  }

  const out = [];
  for (const a of order) out.push(...buckets.get(a));
  out.push(...noArea);       // unsorted stops trail at the end
  return out;
}
