'use strict';
// Tiny DOM helpers shared across modules.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function srcLinks(sources, cls = 'c-src') {
  const s = (sources || []).filter(u => /^https?:\/\//i.test(u));   // only real web URLs into href (no javascript:)
  if (!s.length) return '';
  return `<div class="${cls}">${s.slice(0, 3).map((u, i) =>
    `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ${i + 1} ↗</a>`).join('')}</div>`;
}
