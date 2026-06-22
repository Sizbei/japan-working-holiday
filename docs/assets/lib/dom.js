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

// Turn a `[＋ Add]` toggle button + a `.list-add` panel (the form) into an expandable add:
// the button reveals the panel (animated via the .is-open class on the panel), focuses the
// first input, and labels itself with aria-expanded. Submitting (the form fires `jwh:add-done`),
// Escape, or blur-while-empty collapses it back to the button and restores focus there.
// `firstField` is the input to focus on open. Chrome only — the caller owns the submit handler.
// Wired once (guarded).
export function wireExpandableAdd(toggle, panel, firstField) {
  if (!toggle || !panel || toggle.dataset.addXWired) return;
  toggle.dataset.addXWired = '1';
  const open = () => {
    panel.classList.add('is-open'); panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    firstField?.focus();
  };
  const collapse = (refocus = true) => {
    panel.classList.remove('is-open'); panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (refocus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    panel.classList.contains('is-open') ? collapse() : open();
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); collapse(); }
  });
  // collapse if focus leaves the panel while every text field is empty
  panel.addEventListener('focusout', () => {
    setTimeout(() => {
      if (panel.contains(document.activeElement)) return;
      const filled = [...panel.querySelectorAll('input[type=text],input[type=search]')]
        .some(i => i.value.trim());
      if (!filled && panel.classList.contains('is-open')) collapse(false);
    }, 0);
  });
  // the caller dispatches this on the panel after a successful add → collapse back
  panel.addEventListener('jwh:add-done', () => collapse());
}

export function srcLinks(sources, cls = 'c-src') {
  const s = (sources || []).filter(Boolean);
  if (!s.length) return '';
  return `<div class="${cls}">${s.slice(0, 3).map((u, i) =>
    `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ${i + 1} ↗</a>`).join('')}</div>`;
}
