'use strict';
// Pure leg-window logic for the baked multi-day `itinerary` block in tips.json (the Hokkaido
// week). Import-safe in Node (no DOM). The home widget (dashboard.js renderHokkaido) uses this
// to decide whether to show, which day is "today", and which days to spotlight — so the
// date-window math is unit-tested here rather than tangled into rendering.

// UTC-stable day shift for an ISO (YYYY-MM-DD) date. Trip dates are date-only, so we never touch
// local time (which would drift across DST / timezones).
export function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Where `todayISO` sits relative to the leg. Returns null when the widget should be HIDDEN:
//   - the trip is over (today past the last day), or
//   - today is more than `leadDays` before the first day (too far out to be "the next couple of days").
// Otherwise: { days, todayIdx, phase, start, end } where
//   todayIdx = index of the day matching today, or -1 when we're still in the lead-in;
//   phase = 'before' (lead-in) | 'during' | 'last' (final day).
export function legStatus(itin, todayISO, leadDays = 3) {
  if (!itin || !Array.isArray(itin.days) || !itin.days.length || !todayISO) return null;
  const days = itin.days;
  const start = days[0].date;
  const end = days[days.length - 1].date;
  if (todayISO > end) return null;                       // trip finished → nothing to spotlight
  if (todayISO < addDaysISO(start, -leadDays)) return null; // still weeks away → stay out of the way
  const todayIdx = days.findIndex(d => d.date === todayISO);
  const phase = todayIdx === -1 ? 'before' : (todayIdx === days.length - 1 ? 'last' : 'during');
  return { days, todayIdx, phase, start, end };
}

// Find the itinerary day for an ISO date (or null). Used by the #/plan day planner to offer a
// one-tap seed of the baked schedule on the matching date.
export function itineraryDay(itin, dateISO) {
  if (!itin || !Array.isArray(itin.days) || !dateISO) return null;
  return itin.days.find(d => d.date === dateISO) || null;
}

// Convert a baked itinerary day's schedule[] into day-plan stop fields (lib/dayplan.js newStop
// shape). A "HH:MM"-ish `t` becomes startTime; a soft label ("morning"/"evening") folds into the
// note so nothing is lost. Pure — no coords (the planner treats these as approx).
export function itineraryStops(day) {
  if (!day || !Array.isArray(day.schedule)) return [];
  return day.schedule.map(s => {
    const m = String(s.t || '').match(/(\d{1,2}):(\d{2})/);
    const label = m ? '' : String(s.t || '').replace(/^~/, '').trim();
    return {
      name: s.what || 'Stop',
      area: day.base || '',
      startTime: m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '',
      durationMin: 60,
      note: [label, s.note].filter(Boolean).join(' · '),
    };
  });
}

// The day indices to open/spotlight: today + tomorrow while travelling, or day 1 during the lead-in.
// Always in-bounds; the "next couple of days" the request asked to surface.
export function focusDays(status) {
  if (!status) return [];
  const last = status.days.length - 1;
  if (status.todayIdx < 0) return [0];                   // before the trip → preview day 1
  return status.todayIdx >= last ? [last] : [status.todayIdx, status.todayIdx + 1];
}
