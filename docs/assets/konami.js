'use strict';
// Konami-code easter egg — an identity-free gamer/builder wink. Unlocks "arcade mode"
// (heavier CRT/glow via [data-arcade=on] CSS gate), persisted, with a 1UP toast.

import { KEYS, getRaw, setRaw } from './lib/store.js';
import { dndToast } from './dnd.js';

const SEQ = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

export function initKonami() {
  if (getRaw(KEYS.arcade, '') === 'on') document.documentElement.dataset.arcade = 'on';
  let i = 0;
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if (k === SEQ[i]) { i++; if (i === SEQ.length) { i = 0; unlock(); } }
    else { i = (k === SEQ[0]) ? 1 : 0; }
  });
}

function unlock() {
  const on = document.documentElement.dataset.arcade === 'on';
  document.documentElement.dataset.arcade = on ? '' : 'on';
  setRaw(KEYS.arcade, on ? '' : 'on');
  try { dndToast(on ? 'ARCADE MODE OFF' : '1UP — ARCADE MODE'); } catch {}
}
