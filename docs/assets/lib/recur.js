'use strict';
// Pure recurrence expansion. A recurring user event (recur = 'weekly' | 'monthly' | 'yearly') expands
// into SINGLE-DAY occurrences within [fromISO, toISO]; a non-recurring event passes through unchanged
// as its own single {date, endDate} span (so callers can treat every event the same way). Import-safe
// (no DOM) so it's unit-tested in Node like the rest of lib/.

const isoOf = (d) => d.toISOString().slice(0, 10);
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
};
const addDays = (iso, n) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
// clamp the day into the target month (so a Jan-31 monthly recurrence lands on Feb 28/29, not Mar 3)
const clampDay = (y, m, day) => { const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(day, dim))); };

export function isRecurring(e) { return !!(e && e.recur && e.recur !== 'none'); }

export function recurOccurrences(e, fromISO, toISO) {
  const s0 = ((e && e.date) || '').slice(0, 10);
  if (!isRecurring(e)) return [{ date: s0, endDate: ((e && e.endDate) || '').slice(0, 10) }];
  const anchor = parse(s0); if (!anchor) return [];
  const from = (fromISO || '').slice(0, 10), to = (toISO || '').slice(0, 10);
  if (!from || !to || from > to) return [];
  const out = [], MAX = 750;
  // an occurrence never precedes the anchor and always falls inside the requested window
  const push = (iso) => { if (iso >= s0 && iso >= from && iso <= to) out.push({ date: iso, endDate: '' }); };
  const aM = anchor.getUTCMonth(), aD = anchor.getUTCDate();
  if (e.recur === 'yearly') {
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) push(isoOf(clampDay(y, aM, aD)));
  } else if (e.recur === 'monthly') {
    let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    for (let i = 0; i < MAX; i++) {
      const cand = isoOf(clampDay(y, m, aD));
      if (cand > to) break;
      push(cand);
      if (++m > 11) { m = 0; y++; }
    }
  } else if (e.recur === 'weekly') {
    let d = s0;
    const gap = Math.floor((parse(from) - anchor) / 86400000);
    if (gap > 7) d = addDays(s0, Math.floor(gap / 7) * 7);   // fast-forward to near the window start
    for (let i = 0; i < MAX && d <= to; i++) { push(d); d = addDays(d, 7); }
  }
  return out;
}
