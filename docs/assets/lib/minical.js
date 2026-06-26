'use strict';
// Pure month-grid math for the mini-calendar — shared by the date-picker popover
// (datepicker.js) and the calendar sidebar navigator. No DOM; import-safe in Node.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;   // m is 0-11

// 6-week (42-cell) grid, weeks starting Sunday. Each cell:
// { iso:'YYYY-MM-DD', day:1..31, inMonth:bool }. Built with UTC to stay tz-stable.
export function monthGrid(year, month) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();   // 0=Sun
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(Date.UTC(year, month, 1 - firstDow + w * 7 + d));
      const y = cur.getUTCFullYear(), m = cur.getUTCMonth(), day = cur.getUTCDate();
      row.push({ iso: isoOf(y, m, day), day, inMonth: m === month && y === year });
    }
    weeks.push(row);
  }
  return weeks;
}

// Step the (year, month) pair by delta months, normalising the year. Pure.
export function addMonths(year, month, delta) {
  const t = month + delta;
  return { year: year + Math.floor(t / 12), month: ((t % 12) + 12) % 12 };
}

// Parse 'YYYY-MM-DD' → { year, month(0-11), day }. null on junk.
export function isoToYM(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? { year: +m[1], month: +m[2] - 1, day: +m[3] } : null;
}
