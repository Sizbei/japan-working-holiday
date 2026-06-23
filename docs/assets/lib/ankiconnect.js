'use strict';
// Thin AnkiConnect client (localhost:8765). I/O only — exercised in-browser, not unit-tested.
// Works when the dashboard is served over http://localhost with Anki + the AnkiConnect add-on
// (this origin in its webCorsOriginList). Blocked on the HTTPS site (mixed content) — callers
// detect via isAvailable() and fall back to the TSV file path. READ/ADD actions only.

const ENDPOINT = 'http://127.0.0.1:8765';

export async function invoke(action, params = {}, { timeoutMs = 1500 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params }), signal: ctrl.signal,
    });
    const data = await r.json();
    if (data && data.error) throw new Error(data.error);
    return data ? data.result : null;
  } finally { clearTimeout(to); }
}

let _avail = null;
export async function isAvailable(force = false) {
  if (_avail !== null && !force) return _avail;
  try { await invoke('version'); _avail = true; } catch { _avail = false; }
  return _avail;
}
