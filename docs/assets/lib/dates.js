'use strict';
// Pure date helpers. All dates are ISO 'YYYY-MM-DD' strings, treated as UTC midnight
// so day math never drifts across timezones. Functions take an explicit `today` for testability.

export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function nowISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// whole days from a → b (positive if b is later)
export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

// positive = target is in the future relative to today
export function daysUntil(targetISO, todayISO) {
  return daysBetween(todayISO, targetISO);
}

export function countdown(arrivalISO, todayISO) {
  const d = daysBetween(todayISO, arrivalISO);
  if (d === null) return { days: null, phase: 'unknown', label: '' };
  if (d > 0) return { days: d, phase: 'before', label: `${d} day${d === 1 ? '' : 's'} to NRT` };
  const since = -d;
  return { days: since, phase: 'arrived', label: `Day ${since + 1} in Japan` };
}

export function windowStatus(targetISO, todayISO, soon = 3, horizon = 30) {
  const d = daysUntil(targetISO, todayISO);
  if (d === null) return 'none';
  if (d < 0) return 'overdue';
  if (d <= soon) return 'due-soon';
  if (d <= horizon) return 'upcoming';
  return 'later';
}

export function fmtDate(iso) {
  const d = parseISO(iso);
  if (!d) return iso || '';
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function fmtShort(iso) {
  const d = parseISO(iso);
  if (!d) return iso || '';
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
