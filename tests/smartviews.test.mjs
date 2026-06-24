import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDue, filterView, groupByDay } from '../docs/assets/lib/smartviews.js';

const TODAY = '2026-06-24';

// --- classifyDue ---

describe('classifyDue', () => {
  it('empty string → none', () => {
    assert.equal(classifyDue('', TODAY), 'none');
  });

  it('past date → overdue', () => {
    assert.equal(classifyDue('2026-06-20', TODAY), 'overdue');
  });

  it('today → today', () => {
    assert.equal(classifyDue('2026-06-24', TODAY), 'today');
  });

  it('future date → upcoming', () => {
    assert.equal(classifyDue('2026-06-30', TODAY), 'upcoming');
  });
});

// --- filterView ---

const ITEMS = [
  { id: 1, effectiveDue: '' },             // no due
  { id: 2, effectiveDue: '2026-06-20' },   // overdue
  { id: 3, effectiveDue: '2026-06-24' },   // today
  { id: 4, effectiveDue: '2026-06-25' },   // upcoming day 1
  { id: 5, effectiveDue: '2026-07-01' },   // upcoming day 7
  { id: 6, effectiveDue: '2026-07-02' },   // day 8 — outside 7-day window
  { id: 7, effectiveDue: '2026-07-10' },   // far future
];

describe('filterView', () => {
  it('all → returns all items', () => {
    const result = filterView(ITEMS, 'all', TODAY);
    assert.equal(result.length, ITEMS.length);
  });

  it('today → includes today and overdue items, excludes no-due and future', () => {
    const result = filterView(ITEMS, 'today', TODAY);
    const ids = result.map(i => i.id);
    assert.ok(ids.includes(2), 'should include overdue');
    assert.ok(ids.includes(3), 'should include today');
    assert.ok(!ids.includes(1), 'should exclude no-due');
    assert.ok(!ids.includes(4), 'should exclude upcoming');
  });

  it('overdue → only overdue items', () => {
    const result = filterView(ITEMS, 'overdue', TODAY);
    assert.deepEqual(result.map(i => i.id), [2]);
  });

  it('upcoming → day 1..7 only (day 7 in, day 8 out, today out)', () => {
    const result = filterView(ITEMS, 'upcoming', TODAY);
    const ids = result.map(i => i.id);
    assert.ok(ids.includes(4), 'day 1 should be in');
    assert.ok(ids.includes(5), 'day 7 should be in');
    assert.ok(!ids.includes(6), 'day 8 should be out');
    assert.ok(!ids.includes(3), 'today should be out of upcoming');
    assert.ok(!ids.includes(1), 'no-due should be excluded');
  });

  it('no-due items excluded from today/upcoming/overdue', () => {
    const noDueItems = [{ id: 99, effectiveDue: '' }];
    assert.equal(filterView(noDueItems, 'today', TODAY).length, 0);
    assert.equal(filterView(noDueItems, 'overdue', TODAY).length, 0);
    assert.equal(filterView(noDueItems, 'upcoming', TODAY).length, 0);
  });

  it('filterView does not mutate input array', () => {
    const input = [{ id: 1, effectiveDue: '2026-06-20' }];
    filterView(input, 'today', TODAY);
    assert.equal(input.length, 1);
  });
});

// --- groupByDay ---

describe('groupByDay', () => {
  it('groups items by effectiveDue and sorts ascending', () => {
    const items = [
      { id: 'a', effectiveDue: '2026-07-01' },
      { id: 'b', effectiveDue: '2026-06-25' },
      { id: 'c', effectiveDue: '2026-07-01' },
      { id: 'd', effectiveDue: '' },           // omitted
    ];
    const result = groupByDay(items);
    assert.equal(result.length, 2);
    assert.equal(result[0].day, '2026-06-25');
    assert.deepEqual(result[0].items.map(i => i.id), ['b']);
    assert.equal(result[1].day, '2026-07-01');
    assert.deepEqual(result[1].items.map(i => i.id), ['a', 'c']);
  });

  it('omits items with no effectiveDue', () => {
    const result = groupByDay([{ id: 1, effectiveDue: '' }]);
    assert.equal(result.length, 0);
  });
});
