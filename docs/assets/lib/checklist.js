'use strict';
// Pure helpers + store wrappers for user-added checklist items. The pure parts
// (customItem / partitionCustom) are import-safe in Node and unit-tested. The
// load/save wrappers are imported by BOTH content.js and calendar.js — keeping
// them here (not in content.js) lets calendar.js add an item without importing
// content.js (avoids a calendar→content cycle).

import { KEYS, get, set } from './store.js';

// Build a custom checklist item. `id` is passed in for deterministic tests;
// callers pass 'cku'+Date.now(). No `requires` (custom items never lock). Pure.
export function customItem(task, phase, dueBy = '', id) {
  return { id, task, phase, dueBy: dueBy || '' };
}

// Split custom items into { byPhase: Map<bakedLabel, item[]>, mine: item[] }.
// An item whose `phase` is exactly "My tasks" OR matches no baked phase label
// → `mine`. Otherwise grouped under its phase label. No mutation.
export function partitionCustom(custom, bakedPhaseLabels) {
  const baked = new Set(bakedPhaseLabels || []);
  const byPhase = new Map();
  const mine = [];
  (custom || []).forEach(it => {
    if (it.phase !== 'My tasks' && baked.has(it.phase)) {
      if (!byPhase.has(it.phase)) byPhase.set(it.phase, []);
      byPhase.get(it.phase).push(it);
    } else {
      mine.push(it);
    }
  });
  return { byPhase, mine };
}

// Re-home items across phase groups per the user's drag moves. `groups` is an ordered array of
// { key, items } (baked phases keyed by index-as-string, plus 'mine'); `moves` maps itemId →
// target group key. An item whose move names a missing group (stale data) stays put. Pure —
// returns new arrays, no mutation.
export function applyPhaseMoves(groups, moves) {
  const byKey = new Map((groups || []).map(g => [String(g.key), [...(g.items || [])]]));
  const home = new Map();
  (groups || []).forEach(g => (g.items || []).forEach(it => home.set(it.id, String(g.key))));
  Object.entries(moves || {}).forEach(([id, target]) => {
    const from = home.get(id), to = String(target);
    if (from == null || from === to || !byKey.has(to)) return;
    const src = byKey.get(from);
    const i = src.findIndex(it => it.id === id);
    if (i < 0) return;
    byKey.get(to).push(src.splice(i, 1)[0]);
  });
  return (groups || []).map(g => ({ key: String(g.key), items: byKey.get(String(g.key)) }));
}

// Rename a custom item in place: return a NEW array with the item whose id matches having its
// `field` set to text.trim(). Blank/whitespace text, a missing/unknown id → array returned
// unchanged. No mutation. Generic (field) so checklist (task) + packing (item) share it.
export function renameById(arr, id, field, text) {
  const list = Array.isArray(arr) ? arr : [];
  const t = String(text ?? '').trim();
  if (!id || !t) return list;
  return list.map(it => (it && it.id === id) ? { ...it, [field]: t } : it);
}

// ---- store wrappers (KEYS.checklistCustom = jwh-checklist-custom-v1) ----
export function loadChecklistCustom() { return get(KEYS.checklistCustom, []) || []; }
export function saveChecklistCustom(arr) { set(KEYS.checklistCustom, arr); }
