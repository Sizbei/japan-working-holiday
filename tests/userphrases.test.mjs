'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userPhrase, addUserPhrases, removeUserPhrase } from '../docs/assets/lib/userphrases.js';

test('userPhrase: normalizes the shape with a passed-in id', () => {
  const p = userPhrase({ jp: '水', read: 'みず', en: 'water', cat: 'Saved', src: 'jisho' }, 'uph1');
  assert.deepEqual(p, { id: 'uph1', jp: '水', read: 'みず', en: 'water', cat: 'Saved', src: 'jisho', _user: true });
});
test('userPhrase: defaults cat to Imported, missing fields to empty', () => {
  const p = userPhrase({ jp: '駅' }, 'uph2');
  assert.equal(p.cat, 'Imported'); assert.equal(p.en, ''); assert.equal(p._user, true);
});
test('addUserPhrases / removeUserPhrase: immutable', () => {
  const a = [userPhrase({ jp: 'a' }, 'i1')];
  const b = addUserPhrases(a, [userPhrase({ jp: 'b' }, 'i2')]);
  assert.equal(a.length, 1); assert.equal(b.length, 2);
  const c = removeUserPhrase(b, 'i1');
  assert.equal(c.length, 1); assert.equal(c[0].id, 'i2'); assert.equal(b.length, 2);
});
