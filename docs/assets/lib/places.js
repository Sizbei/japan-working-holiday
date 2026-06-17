'use strict';
// Single writer for user-claimed places (jwh-places-v1). map.js AND content.js mutate
// places ONLY through here — one source of truth, no cross-module imports between them.
//
// The schema is ADDITIVE (never bump the -v1 key — a bump orphans every saved pin).
// normalize() back-fills the newer optional fields so legacy records and restored
// pre-rework backups read as plain unlocked drop pins.
//
// A place:
//   { id, name, address, lat, lng, category, note, link, date, remindDate, eventId,
//     source:'drop'|'searched'|'catalogue'|'tabetai', fav, locked, visited,
//     coordKind:'exact'|'approx' }
// fav (★) => the pin is "permanent": it renders on the always-visible layer (never
// hides in a cluster). locked => protected from delete. coordKind 'approx' => the pin is
// a neighbourhood centroid (catalogue/Tabetai), NOT an exact address — surfaced honestly.

import { KEYS, get, set } from './store.js';

// ---- pure helpers (unit-tested in Node; no localStorage/document) ----
export function normalize(p) {
  return {
    source: 'drop', fav: false, locked: false, visited: false, emoji: '', home: false,
    coordKind: (typeof p.lat === 'number' && !isNaN(p.lat)) ? 'exact' : 'approx',
    note: '', link: '', date: '', remindDate: '', eventId: '', category: 'personal',
    ...p,
  };
}
export function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
export function catId(pillar, name) { return `cat:${pillar}:${slug(name)}`; }

// immutable array transforms (return new copies — never mutate input)
export function upsertInto(arr, rec) {
  const i = arr.findIndex(p => p.id === rec.id);
  if (i >= 0) { const c = arr.slice(); c[i] = { ...c[i], ...rec }; return c; }
  return [...arr, normalize(rec)];
}
export function deleteFrom(arr, id) {
  const p = arr.find(x => x.id === id);
  if (!p || p.locked) return { arr, removed: null };   // lock guard lives here, not per call-site
  return { arr: arr.filter(x => x.id !== id), removed: p };
}

// ---- storage-bound wrappers ----
export function loadPlaces() { return (get(KEYS.places, []) || []).map(normalize); }
export function savePlaces(arr) { set(KEYS.places, arr); }
export function placeById(id) { return loadPlaces().find(p => p.id === id) || null; }
export function placeByName(name) { const k = (name || '').toLowerCase().trim(); return loadPlaces().find(p => (p.name || '').toLowerCase().trim() === k) || null; }

export function upsertPlace(rec) { savePlaces(upsertInto(loadPlaces(), rec)); dispatchChanged(); return rec.id; }
export function patchPlace(id, fields) {
  const arr = loadPlaces(); const i = arr.findIndex(p => p.id === id);
  if (i >= 0) { const c = arr.slice(); c[i] = { ...c[i], ...fields }; savePlaces(c); }
}
// removes the place AND its linked calendar event; honours the lock; fires one re-render
export function deletePlace(id) {
  const { arr, removed } = deleteFrom(loadPlaces(), id);
  if (!removed) return false;
  savePlaces(arr);
  if (removed.eventId) set(KEYS.events, (get(KEYS.events, []) || []).filter(e => e.id !== removed.eventId));
  dispatchChanged();
  return true;
}
// single-home invariant in ONE write: clear `home` on every other place, set it on `id`,
// then exactly one dispatch. No-ops (one re-render still) if `id` isn't a saved place.
export function setHomeBase(id) {
  const arr = loadPlaces().map(p => p.home || p.id === id ? { ...p, home: p.id === id } : p);
  savePlaces(arr);
  dispatchChanged();
}
export function toggleFav(id) { const p = placeById(id); if (p) patchPlace(id, { fav: !p.fav }), dispatchChanged(); }
export function toggleLock(id) { const p = placeById(id); if (p) patchPlace(id, { locked: !p.locked }), dispatchChanged(); }

export function dispatchChanged() { try { document.dispatchEvent(new CustomEvent('jwh:data-changed')); } catch { /* Node */ } }
