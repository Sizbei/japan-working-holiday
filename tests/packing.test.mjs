'use strict';
// Unit tests for the pure packing lib. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groupByCategory, progress, CATEGORY_ORDER } from '../docs/assets/lib/packing.js';

test('CATEGORY_ORDER is the fixed category set', () => {
  assert.deepEqual(CATEGORY_ORDER, ['Documents', 'Money', 'Electronics', 'Clothing', 'Health', 'Day-one bag', 'Misc']);
});

test('groupByCategory groups in fixed order, skips empty categories', () => {
  const items = [
    { id: 'a', cat: 'Money', item: 'Cash' },
    { id: 'b', cat: 'Documents', item: 'Passport' },
    { id: 'c', cat: 'Money', item: 'Cards' },
  ];
  const groups = groupByCategory(items, CATEGORY_ORDER);
  assert.deepEqual(groups.map(g => g.cat), ['Documents', 'Money']);
  assert.deepEqual(groups[0].items.map(i => i.id), ['b']);
  assert.deepEqual(groups[1].items.map(i => i.id), ['a', 'c']);
});

test('groupByCategory puts unknown categories last (in first-seen order)', () => {
  const items = [
    { id: 'a', cat: 'Zzz', item: 'mystery' },
    { id: 'b', cat: 'Documents', item: 'Passport' },
    { id: 'c', cat: 'Aaa', item: 'other' },
  ];
  const groups = groupByCategory(items, CATEGORY_ORDER);
  assert.deepEqual(groups.map(g => g.cat), ['Documents', 'Zzz', 'Aaa']);
});

test('groupByCategory on empty input returns no groups', () => {
  assert.deepEqual(groupByCategory([], CATEGORY_ORDER), []);
});

test('progress: zero done', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(progress(items, {}), { done: 0, total: 2, pct: 0 });
});

test('progress: partial (rounds)', () => {
  const items = [{ id: 'pk1' }, { id: 'pk2' }, { id: 'custom1' }];
  assert.deepEqual(progress(items, { pk1: true }), { done: 1, total: 3, pct: 33 });
});

test('progress: 100 percent', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(progress(items, { a: true, b: true }), { done: 2, total: 2, pct: 100 });
});

test('progress counts ALL items including custom, regardless of hide-done', () => {
  // baked ++ custom; checked map drives `done`. The lib never knows about hide-done.
  const items = [{ id: 'pk1' }, { id: 'pk2' }, { id: 'pku123' }];
  assert.deepEqual(progress(items, { pk1: true }), { done: 1, total: 3, pct: 33 });
});

test('progress: empty list is 0/0/0 (no divide-by-zero)', () => {
  assert.deepEqual(progress([], {}), { done: 0, total: 0, pct: 0 });
});
