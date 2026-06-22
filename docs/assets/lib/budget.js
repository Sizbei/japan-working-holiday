'use strict';
// Pure budget math — no DOM, importable in Node (unit-tested in tests/budget.test.mjs).
// Merges baked tips.json defaults with the user's localStorage state (overrides / hidden /
// custom lines) and computes the summary band (to-land, monthly burn/net, runway).
//
// Defensive by contract: a corrupted/empty state object (the store type-guard returns {})
// must never throw — every field is default-destructured and every amount coerced.

// non-negative integer yen; anything non-numeric → 0
function coerce(x) { return Math.max(0, Math.round(+x || 0)); }

// "¥1,234,567" — display formatter OWNED here (lib/rooms.js only parses yen).
export function fmtYen(n) { return '¥' + Math.round(+n || 0).toLocaleString('en-US'); }

// "C$2,167" — CAD twin of a yen figure. The rate≤0 / non-finite → '' guard lives INSIDE so a
// divide-by-zero / Infinity / NaN can never render. rate is yen-per-1-CAD (e.g. 108).
export function fmtCad(yen, rate) {
  if (!(rate > 0)) return '';
  return 'C$' + Math.round(yen / rate).toLocaleString('en-US');
}

// the effective line list for one group: baked (override ?? default, minus hidden) ++ custom.
// state is default-destructured so {} / partial / null pieces can't throw.
export function effectiveLines(baked, state, group) {
  const { overrides = {}, hidden = [], custom = { oneTime: [], monthly: [] } } = state || {};
  const ov = (overrides && typeof overrides === 'object') ? overrides : {};
  const hid = Array.isArray(hidden) ? hidden : [];
  const cust = (custom && typeof custom === 'object') ? custom : {};

  const bakedGroup = Array.isArray(baked?.[group]) ? baked[group] : [];
  const out = bakedGroup
    .filter(l => l && !hid.includes(l.id))
    .map(l => ({
      id: l.id,
      label: l.label,
      amount: coerce(Object.prototype.hasOwnProperty.call(ov, l.id) ? ov[l.id] : l.amount),
      baked: true,
      note: l.note,
      confidence: l.confidence,
    }));

  const customGroup = Array.isArray(cust[group]) ? cust[group] : [];
  customGroup.forEach(c => {
    if (!c || !c.id) return;
    out.push({ id: c.id, label: c.label, amount: coerce(c.amount), baked: false });
  });
  return out;
}

export function sum(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((t, l) => t + coerce(l && l.amount), 0);
}

export function summary(baked, state) {
  // cadRate (yen-per-1-CAD) is destructured here for a single default home; the page reads it to
  // drive optional CAD twins via fmtCad. 0/blank → CAD hidden.
  const { savings = 0, monthlyIncome = 0, cadRate = 0 } = state || {};
  const sav = coerce(savings);
  const income = coerce(monthlyIncome);

  const oneTimeTotal = sum(effectiveLines(baked, state, 'oneTime'));
  const monthlyTotal = sum(effectiveLines(baked, state, 'monthly'));
  const monthlyNet = income - monthlyTotal;
  // Infinity is in-memory only — never serialized (JSON can't hold it). UI renders "∞ / sustainable".
  const runwayMonths = monthlyNet < 0 ? Math.floor(sav / -monthlyNet) : Infinity;

  return {
    oneTimeTotal,
    monthlyTotal,
    monthlyNet,
    toLand: oneTimeTotal,
    runwayMonths,
    afterLanding: sav - oneTimeTotal,
  };
}
