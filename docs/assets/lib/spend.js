'use strict';
// Spend log — pure math for the budget page's actuals tracker (device-local, jwh-spend-v1).
// The planner (lib/budget.js) estimates; this measures. Import-safe in Node, tested.

const MAX_MONTHS = 18;   // history kept; older entries pruned (bounded storage)
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Parse a natural quick-add: "1200 ramen" · "¥3,400 drinks with friends" · "1.2k combini"
 * · optional trailing date word: "yesterday" | "today" | a weekday (most recent PAST one —
 * spends are history, unlike event quick-add where weekdays roll forward).
 * Returns { amount, note, date } or null (no leading amount / zero / garbage).
 */
export function parseSpend(text, todayIso) {
  const m = /^\s*(?:[¥￥]\s*)?([\d,]+(?:\.\d+)?)\s*([kK])?\s+(.*)$|^\s*(?:[¥￥]\s*)?([\d,]+(?:\.\d+)?)\s*([kK])?\s*$/.exec(String(text || ''));
  if (!m) return null;
  const numRaw = m[1] ?? m[4], kFlag = m[2] ?? m[5];
  let amount = parseFloat(String(numRaw).replace(/,/g, ''));
  if (!isFinite(amount) || amount <= 0) return null;
  if (kFlag) amount *= 1000;
  amount = Math.round(amount);
  if (amount <= 0) return null;   // 0.4 → rounds to ¥0 — reject after rounding too
  let note = (m[3] || '').trim();
  let date = String(todayIso).slice(0, 10);
  const dm = /\b(yesterday|today|sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s*$/i.exec(note);
  if (dm) {
    const w = dm[1].toLowerCase();
    if (w === 'yesterday') date = addDays(date, -1);
    else if (w !== 'today') {
      const want = DAYS.findIndex(d => w.startsWith(d));
      const today = new Date(date + 'T00:00:00Z').getUTCDay();
      const back = (today - want + 7) % 7 || 7;     // most recent past occurrence (bare weekday ≠ today)
      date = addDays(date, -back);
    }
    note = note.slice(0, dm.index).trim();
  }
  return { amount, note, date };
}

export function monthTotal(items, ym) {
  return (items || []).reduce((s, it) => s + (String(it?.date || '').slice(0, 7) === ym ? (+it.amount || 0) : 0), 0);
}

export function monthByCat(items, ym) {
  const out = {};
  for (const it of items || []) {
    if (String(it?.date || '').slice(0, 7) !== ym) continue;
    const c = String(it.cat || it.note || 'other').toLowerCase();
    out[c] = (out[c] || 0) + (+it.amount || 0);
  }
  return out;
}

/**
 * Actuals summary. Returns null when there are no spends in the trailing 30 days —
 * callers fall back to the planner's estimated-burn copy.
 */
export function spendSummary(items, plannedMonthly, savings, income, todayIso) {
  const today = String(todayIso).slice(0, 10);
  const from = addDays(today, -30);
  const trailing = (items || []).filter(it => { const d = String(it?.date || '').slice(0, 10); return d > from && d <= today; });
  if (!trailing.length) return null;
  const trailing30 = trailing.reduce((s, it) => s + (+it.amount || 0), 0);
  const dailyRate = trailing30 / 30;
  const ym = today.slice(0, 7);
  const daysInMonth = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const actualThisMonth = monthTotal(items, ym);
  const projectedMonth = Math.round(dailyRate * daysInMonth);
  const actualMonthlyBurn = Math.round(dailyRate * 30);
  const net = (+income || 0) - actualMonthlyBurn;
  const actualRunwayMonths = net < 0 ? Math.floor((+savings || 0) / -net) : Infinity;
  return { actualThisMonth, dailyRate, projectedMonth, vsPlan: projectedMonth - (+plannedMonthly || 0), actualMonthlyBurn, actualRunwayMonths };
}

// keep ~MAX_MONTHS of history; prune older (returns a NEW array — never mutates)
export function pruneSpend(items, todayIso) {
  const cutYm = (() => { const d = new Date(String(todayIso).slice(0, 10) + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - MAX_MONTHS); return d.toISOString().slice(0, 7); })();
  return (items || []).filter(it => String(it?.date || '').slice(0, 7) >= cutYm);
}
