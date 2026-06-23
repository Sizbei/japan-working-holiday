'use strict';
// Shared on-demand translate(): MyMemory fetch (lib/translate.js) + a tiny localStorage cache.
// Used by the Phrases "Translate" panel and the per-card 訳. I/O (fetch) — not unit-tested.
import { translateURL, parseTranslation } from './translate.js';
import { KEYS, get, set } from './store.js';

function tCacheGet(k) { const c = get(KEYS.translateCache, {}) || {}; return c[k]; }
function tCachePut(k, v) {
  const c = get(KEYS.translateCache, {}) || {};
  c[k] = v; const keys = Object.keys(c);
  if (keys.length > 20) delete c[keys[0]];     // FIFO trim to 20 (set() already try/catches quota)
  set(KEYS.translateCache, c);
}
export async function translate(text, from, to) {
  const key = `${from}|${to}|${text}`;
  const hit = tCacheGet(key); if (hit) return hit;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(translateURL(text, from, to), { signal: ctrl.signal });
    const out = parseTranslation(await r.json());
    if (out.text) tCachePut(key, out);
    return out;
  } finally { clearTimeout(t); }
}
