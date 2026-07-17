'use strict';
// #/study — R10 gate-mode framing for the Mastered gate. The gate STATE MACHINE lives in the pure
// engine (lib/study.js: review(mode:'gate'), gateMode, stageOf) and is unit-tested — this module
// only SURFACES it. It decides which example/format a Deep-point gate card shows, renders the
// "🎯 Mastery check — n/3" header, mounts the soft ~20 s countdown (mild pressure, NEVER an
// auto-fail cutoff), and fires the mastered celebration / honest gate-reset feedback after a graded
// gate answer. No scheduling maths here — study.js drives review()/gateFeedback.
//
// Conventions honoured: every dynamic string through esc(); the timer respects reduce-motion (a
// static numeric readout, never a depleting/spinning ring); elapsed derives from Date.now() at
// card start so a backgrounded tab still reads true time.

import { esc } from './lib/dom.js';
import { gateMode, stageOf } from './lib/study.js';
import { clozeFor, scrambleFor, mcqFor } from './lib/questions.js';
import { prefersReducedMotion } from './motion.js';
import { celebrate } from './celebrate.js';

export const GATE_SECONDS = 20;   // soft timer — display + mild pressure, NOT a cutoff
export const GATE_TARGET = 3;     // 3 distinct-example passes complete the gate (engine constant)

// A point's next scheduled review runs in GATE MODE once it reaches Deep (gates ride the normal
// schedule). Keyed on the engine's stage ladder — not re-derived here.
export function isGateCard(p) { return stageOf(p) === 'deep'; }

// how many distinct-example gate passes are banked (0..3) — drives the header.
export function gatePasses(p) { return (p && p.gate && Array.isArray(p.gate.passes)) ? p.gate.passes.length : 0; }

// buildGateCard(id, point, p, pointsCache) → a card descriptor { id, exIdx, point, type, gate:true,
// mcq? } for a Deep point, or null if nothing renders. Production points (gateMode → 'production')
// gate as a typed cloze; recognition points (N1 / written-formal) gate as ★-scramble or MCQ. The
// example is chosen from the NOT-yet-passed indices FIRST (so a correct answer advances the engine's
// distinct-example count), falling back to already-passed indices only if none of the unpassed ones
// can render in the wanted format.
export function buildGateCard(id, point, p, pointsCache) {
  const recog = gateMode(point, { level: point.level, flags: point.flags }) === 'recognition';
  const n = (Array.isArray(point.examples) && point.examples.length) || 0;
  if (!n) return null;
  const passed = new Set((p.gate && p.gate.passes) || []);
  const order = [];
  for (let i = 0; i < n; i++) if (!passed.has(i)) order.push(i);
  for (let i = 0; i < n; i++) if (passed.has(i)) order.push(i);
  if (recog) {
    // distinctness-first: exhaust an unpassed example in BOTH recognition formats before
    // falling to a passed one — never re-serve a passed example while an unpassed one exists.
    for (const ex of order) {
      if (scrambleFor(point, ex)) return { id, exIdx: ex, point, type: 'scramble', gate: true };
      const mcq = mcqFor(point, pointsCache, ex);
      if (mcq) return { id, exIdx: ex, point, type: 'mcq', gate: true, mcq };
    }
  }
  for (const ex of order) { const { blankedTokens, answers } = clozeFor(point, ex); if (answers.length) return { id, exIdx: ex, point, type: 'cloze', gate: true, blankedTokens, answers }; }
  return null;
}

// the "🎯 Mastery check — n/3" header, with 3 pips and a slot the soft timer mounts into.
export function gateHeaderHTML(passes) {
  const done = Math.max(0, Math.min(passes, GATE_TARGET));
  const pips = Array.from({ length: GATE_TARGET }, (_, k) =>
    `<span class="stu-gate-pip${k < done ? ' is-done' : ''}" aria-hidden="true"></span>`).join('');
  return `<div class="stu-gate-head">
    <span class="stu-gate-ic" aria-hidden="true">🎯</span>
    <span class="stu-gate-label">Mastery check — <b>${esc(String(done))}/${esc(String(GATE_TARGET))}</b></span>
    <span class="stu-gate-pips" role="img" aria-label="${esc(String(done))} of ${esc(String(GATE_TARGET))} passes">${pips}</span>
    <span class="stu-gate-timer-slot" id="stuGateTimer"></span>
  </div>`;
}

// mountGateTimer(host, opts) → { teardown() }. A soft countdown from GATE_SECONDS. Under
// reduce-motion it's a static numeric readout (no depleting ring); otherwise a ring that empties.
// At zero it flags "over time" and stops the ticker — the answer is still accepted (no cutoff).
export function mountGateTimer(host, opts = {}) {
  if (!host) return { teardown() {} };
  const seconds = opts.seconds || GATE_SECONDS;
  const reduce = opts.reduceMotion != null ? opts.reduceMotion : prefersReducedMotion();
  const start = Date.now();
  const C = 2 * Math.PI * 15.5;
  if (reduce) {
    host.innerHTML = `<span class="stu-gate-timer stu-gate-timer-num" role="timer" aria-label="About ${esc(String(seconds))} seconds, soft timer">${esc(String(seconds))}s</span>`;
  } else {
    host.innerHTML = `<span class="stu-gate-timer" role="img" aria-label="About ${esc(String(seconds))} second soft timer">
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="stu-gt-bg" cx="18" cy="18" r="15.5"/>
      <circle class="stu-gt-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/></svg>
      <span class="stu-gt-num">${esc(String(seconds))}</span></span>`;
  }
  let iv = 0;
  const stop = () => { if (iv) { clearInterval(iv); iv = 0; } };
  const tick = () => {
    const box = host.querySelector('.stu-gate-timer');
    if (!box) { stop(); return; }
    const left = Math.max(0, seconds - (Date.now() - start) / 1000);
    if (reduce) {
      box.textContent = Math.ceil(left) + 's';
    } else {
      const numEl = host.querySelector('.stu-gt-num');
      const fg = host.querySelector('.stu-gt-fg');
      if (numEl) numEl.textContent = String(Math.ceil(left));
      if (fg) fg.setAttribute('stroke-dashoffset', (C * (1 - left / seconds)).toFixed(1));
    }
    if (left <= 0) { box.classList.add('is-over'); box.setAttribute('title', 'Over time — no rush, it still counts'); stop(); }
  };
  iv = setInterval(tick, reduce ? 1000 : 250);
  return { teardown: stop };
}

// gateFeedback(point, newP, pass, announce): call AFTER a graded gate answer commits. 3rd pass →
// mastered celebration; a fail → honest "back to Mature, gate restarts" toast + live-region. An
// in-progress pass that isn't the 3rd needs nothing here — the header advances on the next card.
export function gateFeedback(point, newP, pass, announce) {
  const pat = (point && point.pattern) || '';
  if (stageOf(newP) === 'mastered') {
    celebrate(`Mastered — ${pat} 🎯`);
    if (announce) announce(`Gate complete. ${pat} is mastered.`);
    return true;
  }
  if (!pass) {
    const demoted = stageOf(newP) !== 'deep';   // a high-stability point stays Deep after the halving
    const where = demoted ? 'drops to Mature; ' : '';
    gateToast(`🎯 Missed — <b lang="ja">${esc(pat)}</b> ${where}the gate restarts.`);
    if (announce) announce(`Missed. ${pat}${demoted ? ' drops back to Mature and' : ','} the mastery gate restarts.`);
  }
  return false;
}

let gateToastEl = null, gateToastTimer = 0;
function gateToast(html) {
  if (typeof document === 'undefined') return;
  if (gateToastEl) gateToastEl.remove();
  gateToastEl = document.createElement('div');
  gateToastEl.className = 'stu-toast stu-gate-toast';
  gateToastEl.setAttribute('role', 'status');
  gateToastEl.innerHTML = html;
  document.body.appendChild(gateToastEl);
  clearTimeout(gateToastTimer);
  gateToastTimer = setTimeout(() => { if (gateToastEl) { gateToastEl.remove(); gateToastEl = null; } }, 3600);
}
