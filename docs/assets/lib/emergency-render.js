'use strict';
// Shared, pure HTML builders for the two emergency surfaces — the #/emergency page
// (emergency.js) and the 🆘 offline pocket modal (pocket.js). Extracted so the tap-to-dial
// numbers — the one thing that MUST be identical on both — can never drift. Import-safe in
// Node (no DOM at module load); every dynamic string esc()'d before it reaches innerHTML.
import { esc } from './dom.js';

// One tap-to-dial target.
//   tier 'hero'    → big display card, shows the "when to call" note (110 / 119 on the page)
//   tier 'sub'     → slim row chip, label only (118 / helpline on the page)
//   tier 'compact' → small pocket-modal cell, label only
export function dialHTML(n, tier = 'sub') {
  const num = String(n?.num ?? '').trim();
  if (!num) return '';
  const label = String(n?.label ?? '');
  const note = tier === 'hero' && n?.note
    ? `<span class="sos-dial-note">${esc(n.note)}</span>` : '';
  const aria = label ? `Call ${label}, ${num}` : `Call ${num}`;
  return `<a class="sos-dial sos-dial--${tier}" href="tel:${esc(num)}" aria-label="${esc(aria)}">`
    + `<span class="sos-dial-num">${esc(num)}</span>`
    + `<span class="sos-dial-lbl">${esc(label)}</span>`
    + note
    + `</a>`;
}

// A run of dials from tips.json.emergency.numbers (frozen data — entries without a num skipped).
//   { hero: N }   → the first N render as 'hero', the rest as 'sub'   (the page)
//   { compact: true } → every dial renders 'compact'                  (the pocket)
export function dialsHTML(numbers, { hero = 0, compact = false } = {}) {
  const list = Array.isArray(numbers) ? numbers.filter(n => n && n.num) : [];
  return list.map((n, i) =>
    dialHTML(n, compact ? 'compact' : (i < hero ? 'hero' : 'sub'))
  ).join('');
}

// Turn +-prefixed international phone numbers inside a frozen text string into tel: links,
// esc()'ing everything around them. Only leading-'+' numbers become links (embassy line,
// after-hours watch centre) — bare digit runs like a postal code (107-8503) or a street
// number (7-3-38) stay plain text. Returns trusted HTML.
// No \s in the class: allowing spaces would greedily fuse "+81-3-1234-5678 90" into ONE tel:
// target (a corrupted dial number on a panic page). A space-separated phone simply stays plain
// text — under-linking is safe, a wrong dial target is not. Curated data uses hyphens.
const INTL_PHONE = /\+\d[\d.\-()]{5,}\d/g;
export function linkifyIntlPhones(text) {
  const s = String(text ?? '');
  let out = '', last = 0, m;
  INTL_PHONE.lastIndex = 0;
  while ((m = INTL_PHONE.exec(s))) {
    const raw = m[0];
    const href = raw.replace(/[\s.()]/g, '');   // keep +, digits, hyphens — a valid tel: target
    out += esc(s.slice(last, m.index))
      + `<a class="sos-tel" href="tel:${esc(href)}">${esc(raw)}</a>`;
    last = m.index + raw.length;
  }
  return out + esc(s.slice(last));
}
