'use strict';
// Shared animated accordion. Pages render the `.acc[data-acc]` markup (see
// specs/2026-06-22-collapsible-accordion.md §2); this wires the behavior and
// remembers collapsed sections in localStorage (KEYS.collapse), device-local.
//
// The section id is treated as OPAQUE — it keys the persisted map and is matched
// against each section's own `data-acc` attribute. We never build a CSS selector
// or getElementById lookup from unsanitized text (consumers pass slug-safe ids).

import { KEYS, get, set } from './lib/store.js';

// the persisted collapsed-id map: { "<id>": true }
function loadMap() {
  const m = get(KEYS.collapse, {});
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}
export function loadCollapsed() { return new Set(Object.keys(loadMap())); }
export function setCollapsed(id, collapsed) {
  const m = loadMap();
  if (collapsed) m[id] = true; else delete m[id];
  set(KEYS.collapse, m);
}

function applyState(acc, collapsed) {
  acc.classList.toggle('is-collapsed', collapsed);
  const head = acc.querySelector('.acc-head');
  if (head) head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

// Wire (or re-wire) every `.acc[data-acc]` inside `container`. Idempotent:
// reads storage each call, so re-rendering a list + re-calling is safe.
export function mountAccordion(container, { allToggle } = {}) {
  if (!container) return;
  const collapsedSet = loadCollapsed();
  const sections = Array.from(container.querySelectorAll('.acc[data-acc]'));

  sections.forEach(acc => {
    const id = acc.getAttribute('data-acc');
    if (!id) return;
    applyState(acc, collapsedSet.has(id));

    const head = acc.querySelector('.acc-head');
    if (!head || head.dataset.accWired) return;   // wire each header once
    head.dataset.accWired = '1';
    head.addEventListener('click', () => {
      const nowCollapsed = !acc.classList.contains('is-collapsed');
      applyState(acc, nowCollapsed);
      setCollapsed(id, nowCollapsed);
    });
  });

  if (allToggle) {
    const btn = typeof allToggle === 'string' ? container.querySelector(allToggle) : allToggle;
    if (btn && !btn.dataset.accWired) {
      btn.dataset.accWired = '1';
      btn.addEventListener('click', () => {
        // if any section is expanded, collapse all; otherwise expand all
        const list = Array.from(container.querySelectorAll('.acc[data-acc]'));
        const anyOpen = list.some(a => !a.classList.contains('is-collapsed'));
        list.forEach(a => {
          const id = a.getAttribute('data-acc');
          if (!id) return;
          applyState(a, anyOpen);
          setCollapsed(id, anyOpen);
        });
      });
    }
  }
}
