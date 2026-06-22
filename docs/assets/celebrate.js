'use strict';
// Shared 100%-completion celebration: a 1-up blip, a toast, and a confetti burst.
// Extracted from content.js so both the yearlong checklist and the packing page can
// reuse it (DRY — no duplicated confetti). Honors the Settings "celebrations" gate
// and the OS reduce-motion preference.

import { blip } from './lib/audio.js';
import { dndToast } from './dnd.js';
import { getRaw, KEYS } from './lib/store.js';

export function celebrate(message) {
  if (getRaw(KEYS.celebrations, '') === 'off') return;   // user disabled celebrations in Settings
  blip('1up');                                           // sound-gated inside audio.js (no-op unless Sound on)
  dndToast(message);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.createElement('div');
  wrap.className = 'confetti'; wrap.setAttribute('aria-hidden', 'true');
  const colors = ['#bc002d', '#223a70', '#b8860b', '#1e8e3e', '#a8228d'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.left = Math.round((i / 36) * 100) + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (i % 12) * 40 + 'ms';
    p.style.transform = `translateY(0) rotate(${i * 37}deg)`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2600);
}
