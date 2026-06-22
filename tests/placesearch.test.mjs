import { test } from 'node:test';
import assert from 'node:assert';
import { searchLocal } from '../docs/assets/lib/placesearch.js';

const pt = (over) => ({ id: 'x', kind: 'catalogue', name: 'Place', area: 'Shibuya', lat: 35.6, lng: 139.7, ...over });

test('searchLocal: empty / whitespace query → []', () => {
  const pts = [pt({ name: 'Ramen Jiro' })];
  assert.deepEqual(searchLocal(pts, ''), []);
  assert.deepEqual(searchLocal(pts, '   '), []);
});

test('searchLocal: ranking — name prefix > name substring > area substring', () => {
  const pts = [
    pt({ id: 'a', name: 'Tokyo Tower', area: 'Minato' }),       // area-only match for "to"? no — name prefix
    pt({ id: 'b', name: 'Studio Tokyo', area: 'Shinjuku' }),    // name substring
    pt({ id: 'c', name: 'Cafe Hana', area: 'Tokyo' }),          // area substring
  ];
  const res = searchLocal(pts, 'tokyo');
  assert.deepEqual(res.map(r => r.id), ['a', 'b', 'c']);
  assert.equal(res[0].score, 3);
  assert.equal(res[1].score, 2);
  assert.equal(res[2].score, 1);
});

test('searchLocal: case-insensitive + trims the query', () => {
  const pts = [pt({ id: 'a', name: 'Shibuya Sky' })];
  assert.equal(searchLocal(pts, '  SHIBUYA  ')[0].id, 'a');
});

test('searchLocal: ties broken by shorter name then alpha', () => {
  const pts = [
    pt({ id: 'a', name: 'Ramen Beta' }),    // prefix score 3, len 10
    pt({ id: 'b', name: 'Ramen' }),         // prefix score 3, len 5  → first (shorter)
    pt({ id: 'c', name: 'Ramen Alpha' }),   // prefix score 3, len 11
  ];
  const res = searchLocal(pts, 'ramen');
  assert.deepEqual(res.map(r => r.id), ['b', 'a', 'c']);
});

test('searchLocal: respects the limit', () => {
  const pts = Array.from({ length: 10 }, (_, i) => pt({ id: 'i' + i, name: 'Tokyo ' + i }));
  assert.equal(searchLocal(pts, 'tokyo').length, 6);          // default 6
  assert.equal(searchLocal(pts, 'tokyo', 3).length, 3);
});

test('searchLocal: below-threshold (no name/area hit) dropped', () => {
  const pts = [pt({ id: 'a', name: 'Sushi Zen', area: 'Ginza' })];
  assert.deepEqual(searchLocal(pts, 'ramen'), []);
});

test('searchLocal: skips event points', () => {
  const pts = [
    pt({ id: 'e', kind: 'event', name: 'Tokyo Fireworks' }),
    pt({ id: 'c', kind: 'catalogue', name: 'Tokyo Cafe' }),
  ];
  assert.deepEqual(searchLocal(pts, 'tokyo').map(r => r.id), ['c']);
});

test('searchLocal: dedup — saved (user) beats catalogue on collision, shows once', () => {
  const pts = [
    pt({ id: 'cat:music:bigcat', kind: 'catalogue', name: 'Big Cat', area: 'Shibuya', lat: 35.66, lng: 139.7 }),
    pt({ id: 'u1', kind: 'user', name: 'Big Cat', area: 'Shibuya', lat: 35.66, lng: 139.7 }),
  ];
  const res = searchLocal(pts, 'big cat');
  assert.equal(res.length, 1);
  assert.equal(res[0].kind, 'user');     // saved wins
});

test('searchLocal: does not mutate inputs', () => {
  const pts = [pt({ id: 'a', name: 'Tokyo Tower' })];
  const snapshot = JSON.parse(JSON.stringify(pts));
  const res = searchLocal(pts, 'tokyo');
  assert.deepEqual(pts, snapshot);             // originals untouched
  assert.ok(!('score' in pts[0]));             // score added to copies, not originals
  assert.ok('score' in res[0]);
});
