import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStart,
  weekDays,
  isMultiDay,
  clampSpan,
  packLanes,
} from '../docs/assets/lib/weekgrid.js';

// Reference: 2026-06-24 is a Wednesday.
// With weekStartsOn=0 (Sunday), the week is 2026-06-21 (Sun) … 2026-06-27 (Sat).

describe('weekStart', () => {
  it('returns Sunday of the week for a Wednesday (default, weekStartsOn=0)', () => {
    assert.equal(weekStart('2026-06-24'), '2026-06-21');
  });

  it('returns Monday of the week for a Wednesday (weekStartsOn=1)', () => {
    assert.equal(weekStart('2026-06-24', 1), '2026-06-22');
  });

  it('returns the same day when iso is already the week start day', () => {
    assert.equal(weekStart('2026-06-21'), '2026-06-21'); // Sunday
  });
});

describe('weekDays', () => {
  it('returns 7 ISO strings starting from Sunday for 2026-06-24', () => {
    const days = weekDays('2026-06-24');
    assert.deepEqual(days, [
      '2026-06-21',
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
    ]);
  });

  it('has exactly 7 entries', () => {
    assert.equal(weekDays('2026-06-24').length, 7);
  });
});

describe('isMultiDay', () => {
  it('returns true when endDate is after date', () => {
    assert.equal(isMultiDay({ date: '2026-06-21', endDate: '2026-06-23' }), true);
  });

  it('returns false when endDate equals date', () => {
    assert.equal(isMultiDay({ date: '2026-06-21', endDate: '2026-06-21' }), false);
  });

  it('returns false when endDate is absent', () => {
    assert.equal(isMultiDay({ date: '2026-06-21', endDate: '' }), false);
  });

  it('returns false when endDate is missing', () => {
    assert.equal(isMultiDay({ date: '2026-06-21' }), false);
  });
});

describe('clampSpan', () => {
  const DAYS = weekDays('2026-06-24'); // Sun–Sat 2026-06-21..27

  it('returns correct cols for an event fully inside the week', () => {
    // Mon–Wed: col0=1, col1=3
    const result = clampSpan({ date: '2026-06-22', endDate: '2026-06-24' }, DAYS);
    assert.deepEqual(result, { col0: 1, col1: 3, contL: false, contR: false });
  });

  it('returns null for an event entirely before the week', () => {
    assert.equal(clampSpan({ date: '2026-06-01', endDate: '2026-06-15' }, DAYS), null);
  });

  it('returns null for an event entirely after the week', () => {
    assert.equal(clampSpan({ date: '2026-06-28', endDate: '2026-06-30' }, DAYS), null);
  });

  it('clips and sets contL when event starts before the week', () => {
    // starts Fri before week, ends Tuesday in week
    const result = clampSpan({ date: '2026-06-17', endDate: '2026-06-23' }, DAYS);
    assert.deepEqual(result, { col0: 0, col1: 2, contL: true, contR: false });
  });

  it('clips and sets contR when event ends after the week', () => {
    // starts Thursday in week, ends next week
    const result = clampSpan({ date: '2026-06-25', endDate: '2026-07-05' }, DAYS);
    assert.deepEqual(result, { col0: 4, col1: 6, contL: false, contR: true });
  });

  it('sets both contL and contR for an event spanning the whole week', () => {
    const result = clampSpan({ date: '2026-06-01', endDate: '2026-06-30' }, DAYS);
    assert.deepEqual(result, { col0: 0, col1: 6, contL: true, contR: true });
  });

  it('handles a single-day event (no endDate) correctly', () => {
    const result = clampSpan({ date: '2026-06-24', endDate: '' }, DAYS);
    assert.deepEqual(result, { col0: 3, col1: 3, contL: false, contR: false });
  });
});

describe('packLanes', () => {
  const DAYS = weekDays('2026-06-24'); // Sun–Sat

  it('places two non-overlapping events in the same lane (lane 0)', () => {
    const events = [
      { date: '2026-06-21', endDate: '2026-06-22' }, // Sun–Mon  col0=0,col1=1
      { date: '2026-06-24', endDate: '2026-06-25' }, // Wed–Thu  col0=3,col1=4
    ];
    const result = packLanes(events, DAYS);
    assert.equal(result.length, 2);
    const lanes = result.map(r => r.lane);
    assert.deepEqual(lanes, [0, 0]);
  });

  it('places two overlapping events in different lanes', () => {
    const events = [
      { date: '2026-06-21', endDate: '2026-06-24' }, // Sun–Wed  col0=0,col1=3
      { date: '2026-06-23', endDate: '2026-06-25' }, // Tue–Thu  col0=2,col1=4
    ];
    const result = packLanes(events, DAYS);
    assert.equal(result.length, 2);
    const lanes = result.map(r => r.lane);
    assert.equal(lanes[0], 0);
    assert.equal(lanes[1], 1);
  });

  it('skips events with no overlap in the week', () => {
    const events = [
      { date: '2026-06-01', endDate: '2026-06-10' }, // entirely before
      { date: '2026-06-24', endDate: '2026-06-25' }, // overlaps
    ];
    const result = packLanes(events, DAYS);
    assert.equal(result.length, 1);
    assert.equal(result[0].col0, 3);
  });

  it('exposes col0/col1/contL/contR in returned items', () => {
    const events = [{ date: '2026-06-17', endDate: '2026-06-23' }];
    const [item] = packLanes(events, DAYS);
    assert.equal(item.col0, 0);
    assert.equal(item.col1, 2);
    assert.equal(item.contL, true);
    assert.equal(item.contR, false);
  });
});
