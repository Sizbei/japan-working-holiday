'use strict';
// Pure iCalendar (.ics) generate/parse + Google Calendar template URLs.
// All-day events (VALUE=DATE). Round-trips with parseICS for tests.

function dstamp(iso) {
  const m = (iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}
function nextDay(iso) {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function unesc(s) {
  return String(s ?? '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}
function descOf(e) {
  return [e.bookingNotes, e.note, e.why, (e.sources && e.sources[0])].filter(Boolean).join('\n');
}

export function toICS(events, calName = 'My Year in Japan') {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jwh//trip//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(calName)}`];
  for (const e of (events || [])) {
    const start = dstamp(e.date);
    if (!start) continue;
    const end = dstamp(nextDay(e.endDate ? e.endDate : e.date));
    out.push('BEGIN:VEVENT', `UID:${esc(e.id || start + '-' + (e.title || ''))}@jwh`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${esc(e.title)}`);
    const desc = descOf(e);
    if (desc) out.push(`DESCRIPTION:${esc(desc)}`);
    if (e.area) out.push(`LOCATION:${esc(e.area)}`);
    if (e.category) out.push(`CATEGORIES:${esc(e.category)}`);
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

export function parseICS(text) {
  // unfold continuation lines, normalize newlines
  const norm = String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const out = [];
  const blocks = norm.split(/BEGIN:VEVENT/i).slice(1);
  for (const blk of blocks) {
    const body = blk.split(/END:VEVENT/i)[0];
    const get = (k) => {
      const m = body.match(new RegExp('(?:^|\\n)' + k + '[^:\\n]*:(.*)', 'i'));
      return m ? unesc(m[1].trim()) : '';
    };
    const dt = body.match(/(?:^|\n)DTSTART[^:\n]*:(\d{8})/i);
    if (!dt) continue;
    const iso = `${dt[1].slice(0, 4)}-${dt[1].slice(4, 6)}-${dt[1].slice(6, 8)}`;
    // DTEND on an all-day VEVENT is EXCLUSIVE (the day after the last) — subtract 1 to recover endDate
    let endIso = '';
    const de = body.match(/(?:^|\n)DTEND[^:\n]*:(\d{8})/i);
    if (de) {
      const d = new Date(Date.UTC(+de[1].slice(0, 4), +de[1].slice(4, 6) - 1, +de[1].slice(6, 8)));
      d.setUTCDate(d.getUTCDate() - 1);
      const back = d.toISOString().slice(0, 10);
      if (back > iso) endIso = back;
    }
    out.push({
      title: get('SUMMARY') || '(untitled)',
      date: iso,
      endDate: endIso,
      note: get('DESCRIPTION'),
      area: get('LOCATION'),
      category: (get('CATEGORIES') || 'imported').toLowerCase(),
    });
  }
  return out;
}

export function gcalUrl(e) {
  const s = dstamp(e.date);
  if (!s) return '#';
  const en = dstamp(nextDay(e.endDate ? e.endDate : e.date));
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: e.title || '', dates: `${s}/${en}`,
    details: descOf(e), location: e.area || '',
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
