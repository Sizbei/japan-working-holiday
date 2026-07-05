'use strict';
// Pure week-view layout math for an all-day calendar.
// No DOM/window/fetch references — safe to import in Node.

import { parseISO } from './dates.js';

/**
 * Given an ISO date string and a week-start day (0=Sun, 1=Mon…),
 * return the ISO string of the first day of that week.
 */
export function weekStart(iso, weekStartsOn = 0) {
  const d = parseISO(iso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = (dow - weekStartsOn + 7) % 7;
  const start = new Date(d.getTime() - delta * 86400000);
  return start.toISOString().slice(0, 10);
}

/**
 * Return an array of 7 ISO strings representing the week containing iso.
 */
export function weekDays(iso, weekStartsOn = 0) {
  const start = parseISO(weekStart(iso, weekStartsOn));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * True iff the event's endDate is strictly after its date.
 */
export function isMultiDay(ev) {
  if (!ev.endDate) return false;
  const end = ev.endDate.slice(0, 10);
  return end > ev.date.slice(0, 10);
}

/**
 * Compute the column span of ev within the given 7-day array.
 * Returns null if the event does not overlap the week at all.
 * Otherwise returns { col0, col1, contL, contR }.
 */
export function clampSpan(ev, days) {
  const s = ev.date.slice(0, 10);
  const e = (ev.endDate ? ev.endDate.slice(0, 10) : s);

  // No overlap if event ends before week starts or begins after week ends.
  if (e < days[0] || s > days[6]) return null;

  const col0 = days.indexOf(s < days[0] ? days[0] : s);
  const effectiveEnd = e > days[6] ? days[6] : e;
  const col1 = days.indexOf(effectiveEnd);

  return {
    col0,
    col1,
    contL: s < days[0],
    contR: e > days[6],
  };
}

/**
 * For every event that overlaps the week, compute clampSpan then greedily
 * pack into the minimum number of lanes (no two bars in the same lane overlap).
 *
 * Sort order: col0 asc, then col1 desc (longest spans first).
 * Returns [{ ev, lane, col0, col1, contL, contR }].
 */
export function packLanes(events, days) {
  // Build clamped items, drop non-overlapping events.
  const items = [];
  for (const ev of events) {
    const span = clampSpan(ev, days);
    if (span === null) continue;
    items.push({ ev, ...span });
  }

  // Sort: col0 asc, col1 desc within same col0.
  items.sort((a, b) => a.col0 - b.col0 || b.col1 - a.col1);

  // Greedy lane assignment. `laneEnds[i]` = col1 of the last bar in lane i.
  const laneEnds = [];
  for (const item of items) {
    let assigned = -1;
    for (let l = 0; l < laneEnds.length; l++) {
      if (laneEnds[l] < item.col0) {
        assigned = l;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(item.col1);
    } else {
      laneEnds[assigned] = item.col1;
    }
    item.lane = assigned;
  }

  return items;
}

/**
 * Parse "HH:MM" (24h) → minutes since midnight, or null if not a valid time.
 * Pure. Used by the week time-grid to place timed events.
 */
export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Lay out a day's timed events into side-by-side columns for overlaps.
 * Input: [{ id, startMin, endMin }] (endMin > startMin). Output: same items with
 * { col, cols } added — col = 0-based column, cols = total columns in that overlap
 * cluster. Greedy interval partitioning (the "meeting rooms" algorithm). Pure.
 */
export function layoutDay(events) {
  const items = [...(events || [])].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster = [];
  let clusterEnd = -1;
  const out = [];
  const flush = () => {
    const cols = cluster.reduce((m, it) => Math.max(m, it.col + 1), 0);
    cluster.forEach(it => { it.cols = cols; out.push(it); });
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    // assign the lowest free column within the current cluster
    const taken = new Set(cluster.filter(c => c.endMin > it.startMin).map(c => c.col));
    let col = 0; while (taken.has(col)) col++;
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return out;
}
