import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupByCategory } from '../docs/assets/lib/packing.js';

// phrases.js reuses the already-tested groupByCategory; this guards the BAKED data shape:
// the curated tips.json phrases must stay well-formed and within the fixed category set
// (phrases.js renders unknown cats last, but the spec fixes these 8).
const data = JSON.parse(readFileSync(new URL('../docs/data/tips.json', import.meta.url), 'utf8'));
const CATEGORY_ORDER = ['Daily', 'Konbini', 'Restaurant', 'Transit', 'Ward office', 'Apartment', 'Emergency', 'Work/meetup'];

test('tips.json has a non-trivial phrases array', () => {
  assert.ok(Array.isArray(data.phrases), 'phrases must be an array');
  assert.ok(data.phrases.length >= 40, `expected ~45-55 phrases, found ${data.phrases.length}`);
});

test('every phrase has the required fields and a ph- id', () => {
  for (const p of data.phrases) {
    for (const k of ['id', 'cat', 'jp', 'read', 'en']) {
      assert.ok(typeof p[k] === 'string' && p[k].length, `phrase ${p.id} missing/empty ${k}`);
    }
    assert.ok(p.id.startsWith('ph-'), `phrase id must start with ph-: ${p.id}`);
  }
});

test('phrase ids are unique', () => {
  const ids = data.phrases.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate phrase id');
});

test('every phrase category is one of the fixed 8', () => {
  for (const p of data.phrases) {
    assert.ok(CATEGORY_ORDER.includes(p.cat), `unexpected category "${p.cat}" on ${p.id}`);
  }
});

test('groupByCategory yields the categories in the fixed order, all populated', () => {
  const groups = groupByCategory(data.phrases, CATEGORY_ORDER);
  // every produced category is from the fixed set, and appears in fixed-order order
  const cats = groups.map(g => g.cat);
  assert.deepEqual(cats, CATEGORY_ORDER.filter(c => cats.includes(c)));
  for (const g of groups) assert.ok(g.items.length > 0, `empty group ${g.cat}`);
});
