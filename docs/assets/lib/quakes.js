'use strict';
// Recent Japan earthquakes via P2P地震情報 (api.p2pquake.net — free, keyless, JMA-sourced).
// parseQuakes is pure (unit-tested); fetchQuakes is the thin network wrapper.

// JMA maxScale integers → 震度 (shindo) labels
const SCALE = { 10: '1', 20: '2', 30: '3', 40: '4', 45: '5弱', 50: '5強', 55: '6弱', 60: '6強', 70: '7' };
export function shindo(maxScale) { return SCALE[maxScale] || null; }

// Pure: API rows (code 551) → [{time, name, mag, shindo, tsunami}] — drops malformed rows.
export function parseQuakes(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => {
    const e = r && r.earthquake;
    const h = e && e.hypocenter;
    if (!e || !h || !h.name) return null;
    return {
      time: String(e.time || ''),                       // "2026/07/02 13:48:00" JST
      name: String(h.name),
      mag: typeof h.magnitude === 'number' && h.magnitude >= 0 ? h.magnitude : null,
      shindo: shindo(e.maxScale),
      tsunami: e.domesticTsunami && e.domesticTsunami !== 'None' && e.domesticTsunami !== 'Unknown',
    };
  }).filter(Boolean);
}

export async function fetchQuakes(limit = 5) {
  const t = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
  const r = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=${encodeURIComponent(limit)}`, { signal: t });
  if (!r.ok) throw new Error('p2pquake ' + r.status);
  return parseQuakes(await r.json());
}
