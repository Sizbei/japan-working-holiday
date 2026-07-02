'use strict';
// ¥→USD exchange rate via open.er-api.com (free, keyless, daily refresh upstream).
// parseUsdPerJpy is pure (unit-tested); fetchUsdPerJpy is the thin network wrapper.

// Pure: er-api body → USD-per-JPY number, or null on any unexpected shape.
export function parseUsdPerJpy(j) {
  const v = j && j.result === 'success' && j.rates && j.rates.USD;
  return (typeof v === 'number' && v > 0 && Number.isFinite(v)) ? v : null;
}

export async function fetchUsdPerJpy() {
  const t = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
  const r = await fetch('https://open.er-api.com/v6/latest/JPY', { signal: t });
  if (!r.ok) throw new Error('er-api ' + r.status);
  return parseUsdPerJpy(await r.json());
}
