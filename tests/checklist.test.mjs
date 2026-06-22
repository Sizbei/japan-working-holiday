'use strict';
// Unit tests for the pure checklist-custom lib. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { customItem, partitionCustom } from '../docs/assets/lib/checklist.js';

test('customItem: builds the shape with passed-in id', () => {
  const it = customItem('Renew passport', 'Pre-departure', '2026-05-01', 'cku123');
  assert.deepEqual(it, { id: 'cku123', task: 'Renew passport', phase: 'Pre-departure', dueBy: '2026-05-01' });
});

test('customItem: dueBy defaults to empty string', () => {
  const it = customItem('Buy adapter', 'My tasks', undefined, 'cku9');
  assert.equal(it.dueBy, '');
  assert.equal(it.task, 'Buy adapter');
  assert.equal(it.phase, 'My tasks');
  assert.equal(it.id, 'cku9');
});

test('customItem: does not mutate any input', () => {
  // primitives only, but assert no surprise: re-calling is pure & deterministic
  const a = customItem('T', 'P', 'd', 'id1');
  const b = customItem('T', 'P', 'd', 'id1');
  assert.deepEqual(a, b);
  assert.notEqual(a, b);   // distinct objects
});

test('partitionCustom: groups items by phase under a baked label', () => {
  const custom = [
    { id: 'c1', task: 'A', phase: 'Phase 1', dueBy: '' },
    { id: 'c2', task: 'B', phase: 'Phase 2', dueBy: '' },
    { id: 'c3', task: 'C', phase: 'Phase 1', dueBy: '' },
  ];
  const { byPhase, mine } = partitionCustom(custom, ['Phase 1', 'Phase 2']);
  assert.deepEqual(byPhase.get('Phase 1').map(i => i.id), ['c1', 'c3']);
  assert.deepEqual(byPhase.get('Phase 2').map(i => i.id), ['c2']);
  assert.deepEqual(mine, []);
});

test('partitionCustom: "My tasks" phase goes to mine', () => {
  const custom = [{ id: 'c1', task: 'A', phase: 'My tasks', dueBy: '' }];
  const { byPhase, mine } = partitionCustom(custom, ['Phase 1']);
  assert.equal(byPhase.size, 0);
  assert.deepEqual(mine.map(i => i.id), ['c1']);
});

test('partitionCustom: orphan phase label (not baked) goes to mine', () => {
  const custom = [{ id: 'c1', task: 'A', phase: 'Deleted Phase', dueBy: '' }];
  const { byPhase, mine } = partitionCustom(custom, ['Phase 1', 'Phase 2']);
  assert.equal(byPhase.size, 0);
  assert.deepEqual(mine.map(i => i.id), ['c1']);
});

test('partitionCustom: empty input → empty byPhase + empty mine', () => {
  const { byPhase, mine } = partitionCustom([], ['Phase 1']);
  assert.equal(byPhase.size, 0);
  assert.deepEqual(mine, []);
});

test('partitionCustom: does not mutate the input array', () => {
  const custom = [{ id: 'c1', task: 'A', phase: 'My tasks', dueBy: '' }];
  const snapshot = JSON.parse(JSON.stringify(custom));
  partitionCustom(custom, ['Phase 1']);
  assert.deepEqual(custom, snapshot);
});
