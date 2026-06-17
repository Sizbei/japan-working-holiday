'use strict';
// Tiny Web Audio chiptune synth — no sound files, no deps. Every export is a NO-OP unless the
// Sound setting is on (getRaw(KEYS.sound) === 'on'). One lazily-created AudioContext, resumed on
// first use (browsers block autoplay until a user gesture). Import-safe in Node (no window/ctx).

import { KEYS, getRaw } from './store.js';

const AC = typeof window !== 'undefined'
  ? (window.AudioContext || window.webkitAudioContext)
  : null;

let ctx = null;

function soundOn() { return getRaw(KEYS.sound, '') === 'on'; }

// returns the shared AudioContext (created on first use), or null if unavailable
function getCtx() {
  if (!AC) return null;
  try {
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// one oscillator + a short gain envelope (attack/decay) → 8-bit feel, no clicks
function tone(freq, durMs = 180, type = 'square', when = 0) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const dur = durMs / 1000;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// single tone (the mini-synth uses this); no-op unless Sound is on
export function note(freq, durMs = 180) {
  if (!soundOn()) return;
  tone(freq, durMs, 'square');
}

// play a sequence of [freq, durMs] back-to-back; no-op unless Sound is on
export function playNotes(seq) {
  if (!soundOn() || !Array.isArray(seq)) return;
  let acc = 0;
  for (const step of seq) {
    if (!Array.isArray(step)) continue;
    const freq = step[0];
    const durMs = step[1] == null ? 180 : step[1];
    tone(freq, durMs, 'square', acc);
    acc += durMs / 1000;
  }
}

// preset chiptune blips; no-op unless Sound is on
const BLIPS = {
  coin: [[988, 80], [1319, 180]],            // Mario coin: B5 → E6
  '1up': [[523, 90], [659, 90], [784, 90], [1047, 240]], // C5 E5 G5 C6
  powerup: [[392, 70], [523, 70], [659, 70], [784, 160]],
  select: [[660, 60], [880, 90]],
};

export function blip(name) {
  if (!soundOn()) return;
  const seq = BLIPS[name];
  if (!seq) return;
  let acc = 0;
  for (const [freq, durMs] of seq) {
    tone(freq, durMs, 'triangle', acc);
    acc += durMs / 1000;
  }
}
