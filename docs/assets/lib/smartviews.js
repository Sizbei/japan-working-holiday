'use strict';
// Pure Todoist-style smart-view helpers for checklist items with `.effectiveDue` (ISO 'YYYY-MM-DD' or '').
// Import-safe in Node — no DOM/window/fetch access.

import { daysBetween } from './dates.js';

/**
 * Classify an effectiveDue date relative to today.
 * @param {string} effectiveDue  ISO 'YYYY-MM-DD' or ''
 * @param {string} todayISO      ISO 'YYYY-MM-DD'
 * @returns {'none'|'overdue'|'today'|'upcoming'}
 */
export function classifyDue(effectiveDue, todayISO) {
  if (!effectiveDue) return 'none';
  if (effectiveDue < todayISO) return 'overdue';
  if (effectiveDue === todayISO) return 'today';
  return 'upcoming';
}

/**
 * Filter items by smart view.
 * - 'all'      → all items
 * - 'today'    → classifyDue is 'today' OR 'overdue'
 * - 'overdue'  → classifyDue is 'overdue'
 * - 'upcoming' → due strictly in the future AND within the next 7 days (daysBetween 1..7)
 * Items with no due date are excluded from today/upcoming/overdue.
 * Returns a new array; input is never mutated.
 *
 * @param {Array<{effectiveDue:string}>} items
 * @param {'all'|'today'|'upcoming'|'overdue'} view
 * @param {string} todayISO
 * @returns {Array}
 */
export function filterView(items, view, todayISO) {
  if (view === 'all') return items.slice();

  return items.filter(item => {
    const due = item.effectiveDue;
    if (!due) return false; // no-due items excluded from all non-'all' views

    const cls = classifyDue(due, todayISO);

    if (view === 'today') return cls === 'today' || cls === 'overdue';
    if (view === 'overdue') return cls === 'overdue';
    if (view === 'upcoming') {
      // strictly future AND within 7 days
      const d = daysBetween(todayISO, due);
      return d !== null && d >= 1 && d <= 7;
    }
    return false;
  });
}

/**
 * Group items by their effectiveDue day, omitting items with no due.
 * Returns [{day: ISO, items: [...]}] sorted ascending by day.
 * Items within each group retain their original order.
 *
 * @param {Array<{effectiveDue:string}>} items
 * @returns {Array<{day:string, items:Array}>}
 */
export function groupByDay(items) {
  /** @type {Map<string, Array>} */
  const map = new Map();

  for (const item of items) {
    const due = item.effectiveDue;
    if (!due) continue;
    if (!map.has(due)) map.set(due, []);
    map.get(due).push(item);
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, dayItems]) => ({ day, items: dayItems }));
}
