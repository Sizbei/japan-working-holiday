'use strict';
// Tiny DOM helpers shared across modules.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Turn a `.list-search-x` widget (toggle button + input) into an expandable search:
// the 🔍 button grows the input, Escape clears + collapses, blur-while-empty collapses,
// an active query keeps it open. Chrome only — the caller still owns the input-event filter.
// `onClear` re-runs that filter after Escape blanks the field. Wired once (guarded).
export function wireExpandableSearch(input, onClear) {
  if (!input || input.dataset.searchXWired) return;
  const box = input.closest('.list-search-x');
  const toggle = box?.querySelector('[data-search-toggle]');
  if (!box || !toggle) return;
  input.dataset.searchXWired = '1';
  const open = () => { box.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); input.tabIndex = 0; input.focus(); };
  const collapse = () => { box.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); input.tabIndex = -1; };
  toggle.addEventListener('click', () => { box.classList.contains('is-open') && !input.value ? collapse() : open(); });
  input.addEventListener('blur', () => { if (!input.value.trim()) collapse(); });   // active query keeps it open
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (input.value) { input.value = ''; onClear?.(); }
    collapse();
    toggle.focus();
  });
}

export function srcLinks(sources, cls = 'c-src') {
  const s = (sources || []).filter(Boolean);
  if (!s.length) return '';
  return `<div class="${cls}">${s.slice(0, 3).map((u, i) =>
    `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ${i + 1} ↗</a>`).join('')}</div>`;
}
