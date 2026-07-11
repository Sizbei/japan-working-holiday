'use strict';
// Trip-mode derivations — pure, node-tested. A "trip" is a chain of stay events
// (title contains "Stay:" — the baked-data convention; a colon-less "initial stay"
// deliberately does NOT match). Nights are half-open [date, endDate): endDate is the
// checkout morning. NOTE the alerts dependency: baked stays' bookBy fields are mirrored
// by hand into tips.json bookByTimeline (that's what feeds the bell pre-trip) — keep the
// two in sync when editing stays.
// Plan: specs/plans/2026-07-10-pre-trip.md.

export function isStay(e) { return /stay:/i.test((e && e.title) || ''); }

export function stayBooked(e) { return !/not booked/i.test((e && e.title) || ''); }

const day = (v) => String(v || '').slice(0, 10);

// the stay whose night covers iso: date ≤ iso < endDate. Ties prefer a booked stay.
export function stayForNight(events, iso) {
  const d = day(iso);
  const hits = (events || []).filter(e => isStay(e) && day(e.date) <= d && d < day(e.endDate));
  if (hits.length < 2) return hits[0] || null;
  return hits.find(stayBooked) || hits[0];
}

// chain stays where next.date ≤ prev.endDate (contiguous or overlapping) into windows;
// return the window covering iso as {start, end, day, total, stays} — `end` is the last
// checkout day (included: the fly-home day is day N/N with no stay that night) — or null.
export function tripWindow(events, iso) {
  const d = day(iso);
  const stays = (events || []).filter(e => isStay(e) && e.date && e.endDate)
    .slice().sort((a, b) => day(a.date) < day(b.date) ? -1 : 1);
  let chain = [], maxEnd = '';
  const flush = () => {
    if (!chain.length) return null;
    const start = day(chain[0].date);
    if (start <= d && d <= maxEnd) {
      const n = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
      return { start, end: maxEnd, day: n(start, d) + 1, total: n(start, maxEnd) + 1, stays: chain.slice() };
    }
    return null;
  };
  for (const s of stays) {
    if (chain.length && day(s.date) > maxEnd) {    // a GAP night splits the chain (vs the chain's MAX endDate — overlaps extend it)
      const w = flush(); if (w) return w;
      chain = []; maxEnd = '';
    }
    chain.push(s);
    if (day(s.endDate) > maxEnd) maxEnd = day(s.endDate);
  }
  return flush();
}
