'use strict';
// User-created "calendars": named + coloured buckets you assign events to. A calendar's `id` doubles
// as an event `category` value, so assigning an event = setting its category to the calendar id, and
// the existing category-filter (hiddenCats) and chip-colour (--chip-cat) machinery reuse unchanged.
// Pure CRUD — the app supplies ids/persistence. Visibility lives in the shared hiddenCats set, so
// there is no `hidden` field here.

// Palette the create/edit modal offers. Distinct from (but harmonious with) the researched category
// hues; kept to a fixed set so runtime colour injection is bounded and predictable.
export const CAL_PALETTE = ['#c02a6e', '#2f7d4f', '#2b6cb0', '#8a4fd0', '#b8541a', '#0f8a8a', '#b03030', '#5a5f6b'];

const clampName = (s) => String(s ?? '').trim().slice(0, 40);
const safeColor = (c) => (CAL_PALETTE.includes(c) ? c : CAL_PALETTE[0]);

// Drop malformed entries from a restored/hand-edited value; never throws.
export function normalizeCalendars(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const c of v) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id ?? '');
    // id + name required, unique, and a safe slug — the id is interpolated into a CSS selector
    // (`.cat-<id>{…}`) at runtime, so reject anything but [a-z0-9-] (app ids are 'cal-<base36>').
    if (!id || seen.has(id) || !/^[a-z0-9-]+$/i.test(id) || !clampName(c.name)) continue;
    seen.add(id);
    out.push({ id, name: clampName(c.name), color: safeColor(c.color) });
  }
  return out;
}
// Add a calendar with a caller-supplied id (e.g. 'cal-<base36>'). No-op on a blank name or dup id.
export function addCalendar(list, { name, color } = {}, id) {
  const n = clampName(name), cid = String(id ?? '');
  const cur = normalizeCalendars(list);
  if (!n || !cid || cur.some(c => c.id === cid)) return cur;
  return [...cur, { id: cid, name: n, color: safeColor(color) }];
}
// Patch name and/or color of one calendar (ignores unknown keys / blank name).
export function updateCalendar(list, id, patch = {}) {
  return normalizeCalendars(list).map(c => {
    if (c.id !== id) return c;
    const name = 'name' in patch ? (clampName(patch.name) || c.name) : c.name;
    const color = 'color' in patch ? safeColor(patch.color) : c.color;
    return { ...c, name, color };
  });
}
export function removeCalendar(list, id) { return normalizeCalendars(list).filter(c => c.id !== id); }

// The next palette colour not already in use (cycles once every colour is taken) — a sensible
// default so creating a calendar can be name-only if the user doesn't pick.
export function nextColor(list) {
  const used = new Set(normalizeCalendars(list).map(c => c.color));
  return CAL_PALETTE.find(c => !used.has(c)) || CAL_PALETTE[normalizeCalendars(list).length % CAL_PALETTE.length];
}
