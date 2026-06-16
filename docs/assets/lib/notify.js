'use strict';
// Pure alert computation. Feed it a unified list of dated items; get back sorted,
// severity-tagged alerts (overdue → due-soon → upcoming), with dismissed ids removed.

import { windowStatus, daysUntil } from './dates.js';

const ORDER = { overdue: 0, 'due-soon': 1, upcoming: 2, later: 3, none: 4 };

// items: [{ id, title, when (ISO), kind, detail, url }]
export function computeAlerts(items, todayISO, dismissed = []) {
  const dis = new Set(dismissed);
  return (items || [])
    .filter(i => i && i.when && i.id && !dis.has(i.id))
    .map(i => ({ ...i, severity: windowStatus(i.when, todayISO), days: daysUntil(i.when, todayISO) }))
    .filter(i => i.severity === 'overdue' || i.severity === 'due-soon' || i.severity === 'upcoming')
    .sort((a, b) => (ORDER[a.severity] - ORDER[b.severity]) || ((a.days ?? 0) - (b.days ?? 0)));
}

export function alertCount(items, todayISO, dismissed = []) {
  return computeAlerts(items, todayISO, dismissed).length;
}
