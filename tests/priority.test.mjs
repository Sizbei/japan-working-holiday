import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  migratePriority,
  getLevel,
  setLevel,
  priorityRank,
  cyclePriority,
} from '../docs/assets/lib/priority.js';

describe('migratePriority', () => {
  it('migrates a v1 array of ids to p1 map', () => {
    const result = migratePriority(['a', 'b', 'c']);
    assert.deepEqual(result, { a: 1, b: 1, c: 1 });
  });

  it('is idempotent on an already-plain-object map (shallow copy)', () => {
    const input = { x: 2, y: 4 };
    const result = migratePriority(input);
    assert.deepEqual(result, { x: 2, y: 4 });
    assert.notEqual(result, input); // must be a new object
  });

  it('returns {} for null', () => {
    assert.deepEqual(migratePriority(null), {});
  });

  it('returns {} for garbage values', () => {
    assert.deepEqual(migratePriority(undefined), {});
    assert.deepEqual(migratePriority(42), {});
    assert.deepEqual(migratePriority('string'), {});
  });
});

describe('getLevel', () => {
  it('returns the level for a known id', () => {
    assert.equal(getLevel({ foo: 3 }, 'foo'), 3);
  });

  it('returns 0 for an unknown id', () => {
    assert.equal(getLevel({ foo: 3 }, 'bar'), 0);
  });
});

describe('setLevel', () => {
  it('sets a level in the map', () => {
    const result = setLevel({}, 'a', 2);
    assert.deepEqual(result, { a: 2 });
  });

  it('removes an id when level is 0 (falsy)', () => {
    const result = setLevel({ a: 3 }, 'a', 0);
    assert.equal('a' in result, false);
  });

  it('removes an id when level is falsy (null)', () => {
    const result = setLevel({ a: 2 }, 'a', null);
    assert.equal('a' in result, false);
  });

  it('removes an id when level is out of 1..4 range (e.g. 5)', () => {
    const result = setLevel({ a: 1 }, 'a', 5);
    assert.equal('a' in result, false);
  });

  it('does not mutate the input map', () => {
    const original = { a: 1 };
    setLevel(original, 'a', 3);
    assert.deepEqual(original, { a: 1 });
  });
});

describe('priorityRank', () => {
  it('ranks p1 < p2 < p3 < p4 < none(0)', () => {
    assert.ok(priorityRank(1) < priorityRank(2));
    assert.ok(priorityRank(2) < priorityRank(3));
    assert.ok(priorityRank(3) < priorityRank(4));
    assert.ok(priorityRank(4) < priorityRank(0));
  });

  it('maps none/out-of-range to 5 (sorts last)', () => {
    assert.equal(priorityRank(0), 5);
    assert.equal(priorityRank(null), 5);
    assert.equal(priorityRank(99), 5);
  });
});

describe('cyclePriority', () => {
  it('cycles 0→1→2→3→4→0', () => {
    assert.equal(cyclePriority(0), 1);
    assert.equal(cyclePriority(1), 2);
    assert.equal(cyclePriority(2), 3);
    assert.equal(cyclePriority(3), 4);
    assert.equal(cyclePriority(4), 0);
  });
});
