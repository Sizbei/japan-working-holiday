'use strict';
// On-demand per-card translation (訳). Explicit tap only — never bulk/auto, so a page of cards
// never fires N requests and the user's content leaves the device only when they ask.
// Splits name/detail into separate <=500-char MyMemory requests; truncates visibly past 500.
import { esc } from './lib/dom.js';
import { prefersReducedMotion } from './motion.js';
import { translate } from './lib/translatecache.js';
import { MAX_LEN } from './lib/translate.js';

async function tField(text) {
  const t = (text || '').trim(); if (!t) return '';
  const slice = t.slice(0, MAX_LEN);
  const res = await translate(slice, 'en', 'ja');
  // output is always Japanese (EN→JA) → mark lang="ja" so screen readers use a JP voice (WCAG 3.1.2)
  return res.text ? `<span lang="ja">${esc(res.text)}</span>` + (t.length > MAX_LEN ? ' <span class="ct-trunc">… (truncated)</span>' : '') : '';
}

export function attachCardTranslate(triggerEl, fields, mountEl) {
  if (!triggerEl || triggerEl.dataset.ctWired) return; triggerEl.dataset.ctWired = '1';
  triggerEl.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (mountEl.dataset.open === '1') { mountEl.hidden = true; mountEl.dataset.open = '0'; return; }
    mountEl.hidden = false; mountEl.dataset.open = '1';
    if (!mountEl.dataset.done) {
      mountEl.innerHTML = '<span class="ct-load">訳しています…</span>';
      try {
        const parts = await Promise.all((fields || []).filter(Boolean).map(tField));
        const html = parts.filter(Boolean).join('<br>');
        mountEl.innerHTML = (html || 'translation unavailable') + '<div class="ct-tag">machine translation · MyMemory</div>';
        mountEl.dataset.done = '1';
        if (!prefersReducedMotion()) mountEl.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      } catch { mountEl.innerHTML = 'translation unavailable'; }
    }
  });
}
