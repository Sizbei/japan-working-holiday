'use strict';
// Natural-language quick-add parser (Fantastical-style). Pure + unit-tested.
//   parseEvent("Ramen with Kenji Jul 3 7pm", "2026-06-30")
//     -> { title: "Ramen with Kenji", date: "2026-07-03", time: "19:00" }
// The calendar is all-day-first, so `date` is always set (defaults to today when no date is
// recognised) and `time` is optional (''). Everything is UTC-date math to match the rest of the app.

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const WD = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(dt.getTime()) ? null : dt;
}
const isoOf = (dt) => toISO(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
function addDays(dt, n) { const d = new Date(dt); d.setUTCDate(d.getUTCDate() + n); return d; }

export function parseEvent(input, todayISO) {
  let text = (input || '').trim();
  const today = parseISO(todayISO) || new Date(Date.UTC(2026, 5, 30));
  const tISO = isoOf(today);
  let date = null, time = '';

  // ---- TIME first (so "7/3" isn't misread) — 3pm / 3:30pm / 15:30 ----
  let tm = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (tm) {
    let h = (+tm[1]) % 12; if (/pm/i.test(tm[3])) h += 12;
    time = `${pad(h)}:${tm[2] || '00'}`; text = text.replace(tm[0], ' ');
  } else {
    const t24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
    if (t24) { time = `${pad(+t24[1])}:${t24[2]}`; text = text.replace(t24[0], ' '); }
  }

  // ---- DATE ----
  let m;
  // ISO
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text))) { date = toISO(+m[1], +m[2] - 1, +m[3]); text = text.replace(m[0], ' '); }
  // numeric M/D or M/D/Y — bare year rolls forward if already past
  if (!date && (m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text))) {
    const mo = +m[1] - 1, d = +m[2];
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : today.getUTCFullYear();
    let iso = toISO(y, mo, d);
    if (!m[3] && parseISO(iso) < today) iso = toISO(y + 1, mo, d);
    date = iso; text = text.replace(m[0], ' ');
  }
  // month-name + day (Jul 3 / July 3 2026 / 3 Jul)
  if (!date) {
    m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i.exec(text)
      || /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s*(\d{4}))?\b/i.exec(text);
    if (m) {
      let mo, d, yr;
      if (/^\d/.test(m[1])) { d = +m[1]; mo = MON[m[2].slice(0, 3).toLowerCase()]; yr = m[3]; }
      else { mo = MON[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; yr = m[3]; }
      let y = yr ? +yr : today.getUTCFullYear();
      let iso = toISO(y, mo, d);
      if (!yr && parseISO(iso) < today) iso = toISO(y + 1, mo, d);
      date = iso; text = text.replace(m[0], ' ');
    }
  }
  // relative words
  if (!date) {
    if (/\b(today|tonight)\b/i.test(text)) { date = tISO; text = text.replace(/\b(today|tonight)\b/i, ' '); }
    else if (/\btomorrow\b/i.test(text)) { date = isoOf(addDays(today, 1)); text = text.replace(/\btomorrow\b/i, ' '); }
  }
  // weekday (optional "next" = +1 week); bare weekday matching today = today
  if (!date && (m = /\b(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i.exec(text))) {
    const target = WD[m[2].slice(0, 3).toLowerCase()];
    let add = (target - today.getUTCDay() + 7) % 7;
    if (m[1]) add += 7;
    date = isoOf(addDays(today, add)); text = text.replace(m[0], ' ');
  }

  if (!date) date = tISO;

  // ---- title: strip the date/time gaps, collapse ws, trim dangling connectors ----
  let title = text.replace(/\s+/g, ' ').trim();
  title = title.replace(/[\s,–—-]*\b(on|at|this|the)\b\s*$/i, '').replace(/^\s*\b(on|at)\b\s+/i, '');
  title = title.replace(/[-–—,]\s*$/, '').replace(/^\s*[-–—,]\s*/, '').trim();

  return { title, date, time };
}
