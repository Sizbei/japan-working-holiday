'use strict';
// Unit tests for the pure trip-readiness lib. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readiness } from '../docs/assets/lib/readiness.js';

test('all-zero plan → score 0, tone low, parts show 0%/unset', () => {
  const r = readiness({ checklistPct: 0, packingPct: 0, budgetReady: 'unset', daysToArrival: 8 });
  assert.equal(r.score, 0);
  assert.equal(r.tone, 'low');
  assert.equal(r.daysToArrival, 8);
  assert.deepEqual(r.parts, [
    { key: 'checklist', label: 'Checklist', pct: 0 },
    { key: 'packing', label: 'Packing', pct: 0 },
    { key: 'budget', label: 'Budget', status: 'unset' },
  ]);
});

test('all-100 (budget ready) → score 100, tone good', () => {
  const r = readiness({ checklistPct: 100, packingPct: 100, budgetReady: 'ready', daysToArrival: 0 });
  assert.equal(r.score, 100);
  assert.equal(r.tone, 'good');
});

test('weighted score: checklist 45 + packing 30 + budget(ready=100) 25', () => {
  // 100*.45 + 0*.30 + 100*.25 = 70
  const r = readiness({ checklistPct: 100, packingPct: 0, budgetReady: 'ready', daysToArrival: 5 });
  assert.equal(r.score, 70);
  assert.equal(r.tone, 'ok');   // >=40, <75
});

test('budget tight contributes 50', () => {
  // 0*.45 + 0*.30 + 50*.25 = 12.5 → round 13
  const r = readiness({ checklistPct: 0, packingPct: 0, budgetReady: 'tight', daysToArrival: 5 });
  assert.equal(r.score, 13);
  assert.equal(r.parts[2].status, 'tight');
});

test('budget unset contributes 0', () => {
  // 100*.45 + 100*.30 + 0*.25 = 75 → tone good (>=75)
  const r = readiness({ checklistPct: 100, packingPct: 100, budgetReady: 'unset', daysToArrival: 5 });
  assert.equal(r.score, 75);
  assert.equal(r.tone, 'good');
});

test('mixed combo', () => {
  // 60*.45 + 40*.30 + 50*.25 = 27 + 12 + 12.5 = 51.5 → 52
  const r = readiness({ checklistPct: 60, packingPct: 40, budgetReady: 'tight', daysToArrival: 5 });
  assert.equal(r.score, 52);
  assert.equal(r.tone, 'ok');
});

test('tone thresholds: 75 good, 74 ok, 40 ok, 39 low', () => {
  const at = (n) => readiness({ checklistPct: n, packingPct: n, budgetReady: 'ready', daysToArrival: 0 });
  // score === n when all three inputs are equal pct (45+30+25 = 100% weight) and budget=ready(100)
  // but budget is fixed 100; use checklist+packing only to hit thresholds precisely:
  // helper: target score s with checklist=packing=x, budget unset(0): x*.75 = s → x = s/.75
  const score = (x) => readiness({ checklistPct: x, packingPct: x, budgetReady: 'unset', daysToArrival: 0 }).score;
  const tone = (x) => readiness({ checklistPct: x, packingPct: x, budgetReady: 'unset', daysToArrival: 0 }).tone;
  assert.equal(score(100), 75); assert.equal(tone(100), 'good');     // exactly 75
  assert.equal(tone(98), 'ok');                                      // 73.5→74 < 75
  assert.equal(tone(54), 'ok');                                      // 40.5→41 >=40
  assert.equal(tone(52), 'low');                                     // 39 < 40
  void at;
});

test('clamps NaN / negative / over-100 inputs to 0..100', () => {
  const r = readiness({ checklistPct: NaN, packingPct: -50, budgetReady: 'ready', daysToArrival: 5 });
  // checklist NaN→0, packing -50→0, budget ready→100. 0*.45 + 0*.30 + 100*.25 = 25
  assert.equal(r.score, 25);
  assert.equal(r.parts[0].pct, 0);
  assert.equal(r.parts[1].pct, 0);

  const over = readiness({ checklistPct: 250, packingPct: 999, budgetReady: 'ready', daysToArrival: 5 });
  assert.equal(over.score, 100);
  assert.equal(over.parts[0].pct, 100);
  assert.equal(over.parts[1].pct, 100);
});

test('missing inputs do not throw; default to 0 / unset', () => {
  const r = readiness({});
  assert.equal(r.score, 0);
  assert.equal(r.tone, 'low');
  assert.equal(r.parts[2].status, 'unset');
});

test('unknown budgetReady value treated as 0 contribution but echoed as status', () => {
  const r = readiness({ checklistPct: 0, packingPct: 0, budgetReady: 'whatever', daysToArrival: 5 });
  assert.equal(r.score, 0);
  assert.equal(r.parts[2].status, 'whatever');
});

test('parts shape: checklist/packing carry pct, budget carries status', () => {
  const r = readiness({ checklistPct: 50, packingPct: 50, budgetReady: 'ready', daysToArrival: 5 });
  assert.equal(r.parts.length, 3);
  assert.ok('pct' in r.parts[0] && !('status' in r.parts[0]));
  assert.ok('pct' in r.parts[1] && !('status' in r.parts[1]));
  assert.ok('status' in r.parts[2] && !('pct' in r.parts[2]));
});
