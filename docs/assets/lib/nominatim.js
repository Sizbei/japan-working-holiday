'use strict';
// Minimal OpenStreetMap/Nominatim place search for Japan. parseNominatim is pure (unit-tested);
// searchJP is a thin fetch wrapper shared by the map's add-place box and the calendar event form.
// Suggestion-list rendering (and esc()) stays in each caller.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Map raw Nominatim jsonv2 rows → [{ name, addr, lat, lng }]. Pure; drops rows with no address.
export function parseNominatim(rows) {
  return (Array.isArray(rows) ? rows : []).map(d => ({
    name: String(d.display_name || '').split(',')[0].trim(),
    addr: String(d.display_name || ''),
    lat: String(d.lat ?? ''),
    lng: String(d.lon ?? ''),
  })).filter(m => m.addr);
}

// Search Japan addresses. Resolves [{name,addr,lat,lng}]; throws on HTTP error / abort / offline.
export async function searchJP(query, signal) {
  const url = `${ENDPOINT}?format=jsonv2&countrycodes=jp&limit=5&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  return parseNominatim(await r.json());
}
