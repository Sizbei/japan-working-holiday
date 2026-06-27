'use strict';
import { esc } from './dom.js';

// Build inline <ruby> furigana from a [base, reading][] array; esc() each part. Falls back to
// the plain escaped string when there's no furi data. Shared by phrases.js and vocab.js.
export function rubyHTML(furi, fallback) {
  if (!Array.isArray(furi) || !furi.length) return esc(fallback || '');
  return furi.map(seg => {
    const base = esc(seg[0] || '');
    return seg[1] ? `<ruby>${base}<rt>${esc(seg[1])}</rt></ruby>` : base;
  }).join('');
}
