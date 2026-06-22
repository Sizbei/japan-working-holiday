'use strict';
// Unit tests for the pure budget lib. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effectiveLines, sum, summary, fmtYen, fmtCad } from '../docs/assets/lib/budget.js';

const BAKED = {
  currency: 'JPY',
  oneTime: [
    { id: 'flight', label: 'Flight', amount: 90000, confidence: 'medium' },
    { id: 'visa', label: 'WHV', amount: 0, confidence: 'high' },
    { id: 'deposit', label: 'Move-in', amount: 120000, confidence: 'medium' },
  ],
  monthly: [
    { id: 'rent', label: 'Rent', amount: 60000, confidence: 'medium' },
    { id: 'food', label: 'Food', amount: 45000, confidence: 'low' },
  ],
};

// ---- fmtYen ----
test('fmtYen formats 0', () => {
  assert.equal(fmtYen(0), '¥0');
});
test('fmtYen formats large numbers with commas', () => {
  assert.equal(fmtYen(1234567), '¥1,234,567');
  assert.equal(fmtYen(8000000), '¥8,000,000');
});
test('fmtYen rounds non-integers', () => {
  assert.equal(fmtYen(99.6), '¥100');
});

// ---- fmtCad ----
test('fmtCad: rate 0 / blank / NaN / negative → empty string (guard inside)', () => {
  assert.equal(fmtCad(234000, 0), '');
  assert.equal(fmtCad(234000, ''), '');
  assert.equal(fmtCad(234000, NaN), '');
  assert.equal(fmtCad(234000, -108), '');
  assert.equal(fmtCad(234000, undefined), '');
});
test('fmtCad: normal rate converts and formats with commas', () => {
  assert.equal(fmtCad(234000, 108), 'C$2,167');   // 2166.67 → 2167
});
test('fmtCad: rounds to nearest dollar', () => {
  assert.equal(fmtCad(108, 108), 'C$1');
  assert.equal(fmtCad(162, 108), 'C$2');           // 1.5 → 2
  assert.equal(fmtCad(0, 108), 'C$0');
});
test('fmtCad: negative renders the sign before the symbol (− U+2212), consistently', () => {
  assert.equal(fmtCad(-234000, 108), '−C$2,167');
  assert.equal(fmtCad(-108, 108), '−C$1');
});

// ---- effectiveLines ----
test('effectiveLines returns baked defaults when state is empty', () => {
  const lines = effectiveLines(BAKED, {}, 'oneTime');
  assert.deepEqual(lines.map(l => l.id), ['flight', 'visa', 'deposit']);
  assert.equal(lines[0].amount, 90000);
  assert.ok(lines.every(l => l.baked === true));
});

test('effectiveLines: override beats default', () => {
  const lines = effectiveLines(BAKED, { overrides: { flight: 75000 } }, 'oneTime');
  assert.equal(lines.find(l => l.id === 'flight').amount, 75000);
});

test('effectiveLines: hidden lines are removed', () => {
  const lines = effectiveLines(BAKED, { hidden: ['visa'] }, 'oneTime');
  assert.deepEqual(lines.map(l => l.id), ['flight', 'deposit']);
});

test('effectiveLines: custom lines appended after baked', () => {
  const state = { custom: { oneTime: [{ id: 'bdg1', label: 'Extra', amount: 5000 }], monthly: [] } };
  const lines = effectiveLines(BAKED, state, 'oneTime');
  assert.deepEqual(lines.map(l => l.id), ['flight', 'visa', 'deposit', 'bdg1']);
  assert.equal(lines[3].baked, false);
  assert.equal(lines[3].amount, 5000);
});

test('effectiveLines: corrupted/missing pieces do not throw', () => {
  // empty {} (the type-guard fallback)
  assert.doesNotThrow(() => effectiveLines(BAKED, {}, 'monthly'));
  // partially-shaped state
  assert.doesNotThrow(() => effectiveLines(BAKED, { overrides: null, hidden: null, custom: null }, 'oneTime'));
  const lines = effectiveLines(BAKED, { overrides: null, hidden: null, custom: null }, 'oneTime');
  assert.equal(lines.length, 3);
});

test('effectiveLines: amounts coerced (negative/NaN → 0, rounded)', () => {
  const lines = effectiveLines(BAKED, { overrides: { flight: -50, deposit: 'abc' } }, 'oneTime');
  assert.equal(lines.find(l => l.id === 'flight').amount, 0);
  assert.equal(lines.find(l => l.id === 'deposit').amount, 0);
});

test('effectiveLines: unknown group returns empty', () => {
  assert.deepEqual(effectiveLines(BAKED, {}, 'nope'), []);
});

// ---- sum ----
test('sum adds line amounts', () => {
  assert.equal(sum([{ amount: 10 }, { amount: 20 }, { amount: 5 }]), 35);
});
test('sum of empty list is 0', () => {
  assert.equal(sum([]), 0);
});
test('sum coerces bad amounts to 0', () => {
  assert.equal(sum([{ amount: 'x' }, { amount: 10 }]), 10);
});

// ---- summary ----
test('summary: toLand = one-time total; afterLanding = savings - oneTime', () => {
  const s = summary(BAKED, { savings: 8000000, monthlyIncome: 0 });
  assert.equal(s.oneTimeTotal, 210000);     // 90000 + 0 + 120000
  assert.equal(s.toLand, 210000);
  assert.equal(s.afterLanding, 8000000 - 210000);
});

test('summary: monthlyNet = income - monthly total', () => {
  const s = summary(BAKED, { savings: 8000000, monthlyIncome: 80000 });
  assert.equal(s.monthlyTotal, 105000);     // 60000 + 45000
  assert.equal(s.monthlyNet, 80000 - 105000);
});

test('summary: runway = floor(savings / -net) when net negative', () => {
  // monthly total 105000, income 0 → net -105000; savings 1,000,000 → floor(9.52) = 9
  const s = summary(BAKED, { savings: 1000000, monthlyIncome: 0 });
  assert.equal(s.monthlyNet, -105000);
  assert.equal(s.runwayMonths, 9);
});

test('summary: runway is Infinity when net >= 0', () => {
  const s = summary(BAKED, { savings: 1000000, monthlyIncome: 200000 });
  assert.ok(s.monthlyNet >= 0);
  assert.equal(s.runwayMonths, Infinity);
  // exact break-even (net 0) is also sustainable
  const sEven = summary(BAKED, { savings: 500000, monthlyIncome: 105000 });
  assert.equal(sEven.monthlyNet, 0);
  assert.equal(sEven.runwayMonths, Infinity);
});

test('summary: empty/corrupted state defaults to 0 savings/income, no throw', () => {
  assert.doesNotThrow(() => summary(BAKED, {}));
  const s = summary(BAKED, {});
  assert.equal(s.afterLanding, 0 - 210000);
  assert.equal(s.runwayMonths, 0);          // savings 0, net -105000 → floor(0) = 0
});

test('summary: reflects overrides, hidden, and custom in totals', () => {
  const state = {
    savings: 0, monthlyIncome: 0,
    overrides: { flight: 80000 },
    hidden: ['deposit'],
    custom: { oneTime: [{ id: 'bdg1', label: 'X', amount: 1000 }], monthly: [{ id: 'bdg2', label: 'Y', amount: 2000 }] },
  };
  const s = summary(BAKED, state);
  assert.equal(s.oneTimeTotal, 80000 + 0 + 1000);   // flight override + visa, deposit hidden, +custom
  assert.equal(s.monthlyTotal, 60000 + 45000 + 2000);
});
