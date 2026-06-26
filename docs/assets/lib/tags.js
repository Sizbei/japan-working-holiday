'use strict';
// Pure helpers for free-form task labels (tags). Stored device-local as
// { [taskId]: string[] } under KEYS.tags (jwh-tags-v1). Pure + import-safe in Node;
// the load/save store wrappers live in checklist-page.js (next to the other check stores).

const MAX_LEN = 24;

// trim, strip leading '#', strip commas (→ space), collapse inner whitespace, lowercase, cap length.
// '' for junk. Commas are stripped so a pasted "a,b" can never become one comma-bearing tag.
export function normalizeTag(s) {
  return String(s == null ? '' : s)
    .trim().replace(/^#+/, '').replace(/,/g, ' ').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_LEN).trim();
}

// replace an id's whole list with a normalized, de-duplicated array → NEW map; deletes when empty.
export function setTags(map, id, arr) {
  const norm = [];
  (Array.isArray(arr) ? arr : []).forEach(t => { const n = normalizeTag(t); if (n && !norm.includes(n)) norm.push(n); });
  const out = { ...map };
  if (norm.length) out[id] = norm; else delete out[id];
  return out;
}

export function tagsFor(map, id) {
  const cur = map && map[id];
  return Array.isArray(cur) ? cur : [];
}

// distinct tags across all ids, sorted ascending.
export function allTags(map) {
  const set = new Set();
  Object.values(map || {}).forEach(arr => { if (Array.isArray(arr)) arr.forEach(t => set.add(t)); });
  return [...set].sort();
}

// stable hue 0-359 from the tag text — deterministic, pure (for the chip colour).
export function tagHue(tag) {
  const s = String(tag || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
