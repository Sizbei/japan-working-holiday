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

// ---- store wrappers (KEYS.checklistCustom = jwh-checklist-custom-v1) ----
export function loadChecklistCustom() { return get(KEYS.checklistCustom, []) || []; }
export function saveChecklistCustom(arr) { set(KEYS.checklistCustom, arr); }
