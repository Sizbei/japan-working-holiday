'use strict';
// Unit tests for the pure lib modules. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseISO, daysBetween, daysUntil, countdown, windowStatus, fmtShort } from '../docs/assets/lib/dates.js';
import { computeAlerts, alertCount } from '../docs/assets/lib/notify.js';
import { toICS, parseICS, gcalUrl } from '../docs/assets/lib/ics.js';

const TODAY = '2026-06-15';
const ARRIVAL = '2026-06-30';

test('parseISO rejects junk, accepts ISO', () => {
  assert.equal(parseISO('nope'), null);
  assert.equal(parseISO(''), null);
  assert.ok(parseISO('2026-06-30'));
});

test('daysBetween / daysUntil are signed and tz-stable', () => {
  assert.equal(daysBetween('2026-06-15', '2026-06-30'), 15);
  assert.equal(daysBetween('2026-06-30', '2026-06-15'), -15);
  assert.equal(daysUntil(ARRIVAL, TODAY), 15);
});

test('countdown flips from before → arrived', () => {
  assert.deepEqual(countdown(ARRIVAL, TODAY), { days: 15, phase: 'before', label: '15 days to NRT' });
  assert.equal(countdown(ARRIVAL, '2026-06-29').label, '1 day to NRT');
  assert.equal(countdown(ARRIVAL, ARRIVAL).phase, 'arrived');
  assert.equal(countdown(ARRIVAL, '2026-07-04').label, 'Day 5 in Japan');
});

test('windowStatus buckets correctly (the as-of overdue logic)', () => {
  assert.equal(windowStatus('2026-06-10', TODAY), 'overdue');
  assert.equal(windowStatus('2026-06-16', TODAY), 'due-soon');
  assert.equal(windowStatus('2026-06-18', TODAY), 'due-soon');
  assert.equal(windowStatus('2026-06-25', TODAY), 'upcoming');
  assert.equal(windowStatus('2026-09-01', TODAY), 'later');
  assert.equal(windowStatus('', TODAY), 'none');
});

test('computeAlerts sorts by severity then days, drops later + dismissed', () => {
  const items = [
    { id: 'a', title: 'overdue thing', when: '2026-06-10' },
    { id: 'b', title: 'soon', when: '2026-06-17' },
    { id: 'c', title: 'upcoming', when: '2026-06-28' },
    { id: 'd', title: 'far', when: '2026-12-01' },
    { id: 'e', title: 'no date' },
  ];
  const a = computeAlerts(items, TODAY);
  assert.deepEqual(a.map(x => x.id), ['a', 'b', 'c']);
  assert.equal(a[0].severity, 'overdue');
  assert.equal(alertCount(items, TODAY, ['a']), 2);
});

test('toICS → parseICS round-trips an all-day event', () => {
  const ev = [{ id: 'x1', title: 'Sumida Hanabi', date: '2026-07-25', area: 'Asakusa', category: 'fireworks', bookingNotes: 'Arrive early; comma, and; semicolon test' }];
  const ics = toICS(ev);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260725/);
  const back = parseICS(ics);
  assert.equal(back.length, 1);
  assert.equal(back[0].title, 'Sumida Hanabi');
  assert.equal(back[0].date, '2026-07-25');
  assert.equal(back[0].area, 'Asakusa');
  assert.match(back[0].note, /semicolon test/);
});

test('multi-day event end date is exclusive next-day', () => {
  const ics = toICS([{ id: 'c1', title: 'Comiket', date: '2026-08-15', endDate: '2026-08-16' }]);
  assert.match(ics, /DTEND;VALUE=DATE:20260817/);
});

test('gcalUrl builds a template link', () => {
  const u = gcalUrl({ title: 'teamLab', date: '2026-07-10', area: 'Toyosu' });
  assert.match(u, /calendar\.google\.com/);
  assert.match(u, /dates=20260710%2F20260711/);
  assert.match(u, /text=teamLab/);
});

import { reorderIds } from '../docs/assets/dnd.js';
test('reorderIds moves an id before/after a target', () => {
  assert.deepEqual(reorderIds(['a','b','c'], 'a', 'c', true), ['b','c','a']);
  assert.deepEqual(reorderIds(['a','b','c'], 'c', 'a', false), ['c','a','b']);
  assert.deepEqual(reorderIds(['a','b','c'], 'b', null), ['a','c','b']);
  assert.deepEqual(reorderIds(['a','b','c'], 'a', 'a'), ['a','b','c']);
});
