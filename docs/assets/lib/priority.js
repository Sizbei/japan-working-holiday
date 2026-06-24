/**
 * priority.js — pure p1–p4 priority helpers for the checklist.
 * Import-safe in Node: no DOM, no fetch, no window.
 */

/**
 * Migrate a v1 priority value to the canonical {id: level} map form.
 * - Array of ids (old binary flags) → each id mapped to level 1 (p1).
 * - Plain object                    → shallow copy (already the new shape).
 * - Anything else (null, number…)   → {}.
 *
 * @param {*} v1
 * @returns {{ [id: string]: number }}
 */
export function migratePriority(v1) {
  if (Array.isArray(v1)) {
    const map = {};
    for (const id of v1) map[id] = 1;
    return map;
  }
  if (v1 !== null && typeof v1 === 'object') {
    return { ...v1 };
  }
  return {};
}

/**
 * Return the priority level (1–4) for id, or 0 if not present.
 *
 * @param {{ [id: string]: number }} map
 * @param {string} id
 * @returns {number}
 */
export function getLevel(map, id) {
  return map[id] ?? 0;
}

/**
 * Return a NEW map with id set to level.
 * - level falsy, 0, or outside 1..4 → remove id from map.
 * - level 1..4                       → set id to level.
 * Never mutates the input map.
 *
 * @param {{ [id: string]: number }} map
 * @param {string} id
 * @param {number|null|undefined} level
 * @returns {{ [id: string]: number }}
 */
export function setLevel(map, id, level) {
  const next = { ...map };
  if (level && level >= 1 && level <= 4) {
    next[id] = level;
  } else {
    delete next[id];
  }
  return next;
}

/**
 * Return a sortable rank where p1 sorts first.
 * Out-of-range / falsy levels return 5 (sorts last, after p4).
 *
 * @param {number|null|undefined} level
 * @returns {number}
 */
export function priorityRank(level) {
  return (level >= 1 && level <= 4) ? level : 5;
}

/**
 * Cycle through priority levels for a click-to-cycle UI.
 * 0 → 1 → 2 → 3 → 4 → 0
 *
 * @param {number} level
 * @returns {number}
 */
export function cyclePriority(level) {
  return (level >= 0 && level < 4) ? level + 1 : 0;
}
