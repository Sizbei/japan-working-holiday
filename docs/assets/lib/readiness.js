'use strict';
// Pure trip-readiness math — no DOM, import-safe in Node (unit-tested in tests/readiness.test.mjs).
// Aggregates checklist + packing + budget into one 0–100 score with a small breakdown. The caller
// (dashboard.js) derives the raw percentages and the budget status; this file only weights + tones.

// clamp a numeric pct into 0..100; NaN / non-numeric / negative → 0.
function clampPct(x) {
  const n = +x;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 100 ? 100 : n;
}

// budget status → its 0–100 contribution. 'ready' → 100, 'tight' → 50, anything else → 0.
function budgetValue(status) {
  if (status === 'ready') return 100;
  if (status === 'tight') return 50;
  return 0;
}

// readiness({ checklistPct, packingPct, budgetReady, daysToArrival }) → { score, parts, daysToArrival, tone }
// Weighted average: checklist 45% + packing 30% + budget 25%. tone: >=75 good, >=40 ok, else low.
export function readiness({ checklistPct, packingPct, budgetReady, daysToArrival } = {}) {
  const cl = clampPct(checklistPct);
  const pk = clampPct(packingPct);
  const bg = budgetValue(budgetReady);
  const score = Math.round(cl * 0.45 + pk * 0.30 + bg * 0.25);
  const tone = score >= 75 ? 'good' : score >= 40 ? 'ok' : 'low';
  return {
    score,
    parts: [
      { key: 'checklist', label: 'Checklist', pct: cl },
      { key: 'packing', label: 'Packing', pct: pk },
      { key: 'budget', label: 'Budget', status: budgetReady == null ? 'unset' : String(budgetReady) },
    ],
    daysToArrival,
    tone,
  };
}
