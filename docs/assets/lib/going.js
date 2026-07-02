'use strict';
// "Going to" — a small curated set of event ids the user has committed to attending
// (distinct from the auto "upcoming events" stream). Works for baked OR user events by id.
// Seeded with Ultra Japan since the owner said they're going; once they toggle anything,
// their actual set persists.

import { KEYS, get, set } from './store.js';

const SEED = ['mus-ultra-japan-2026'];

export function loadGoing() {
  const a = get(KEYS.going, SEED);
  return new Set(Array.isArray(a) ? a : SEED);
}
export function isGoing(id) { return !!id && loadGoing().has(id); }
export function setGoing(id, on = true) {
  if (!id) return false;
  const g = loadGoing();
  if (on === g.has(id)) return on;   // already in the wanted state — no write, no dispatch
  if (on) g.add(id); else g.delete(id);
  set(KEYS.going, [...g]);
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  return on;
}
export function toggleGoing(id) {
  if (!id) return false;
  const g = loadGoing();
  g.has(id) ? g.delete(id) : g.add(id);
  set(KEYS.going, [...g]);
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));   // dashboard widget + calendar re-derive
  return g.has(id);
}
