'use strict';
// #/study — R10 "Build a sentence" PRACTICE. Explicitly NOT a gate signal (plan R10): this NEVER
// calls review() and NEVER touches scheduling. A free-writing drill offered from the course home for
// Deep/Mastered points — prompt from the point's pattern + meaning, a free textarea, a "Show model"
// reveal of one of the point's example sentences to self-compare, an honest DISPLAY-ONLY self-rating
// (got it / close / missed), and optional TTS of the model via speak.js (canSpeak-guarded). Lazy-
// imported by study.js and run as an activeFlow controller { onAct, onKey, teardown }.
//
// Conventions honoured: every dynamic string through esc(); ruby via rubyHTML; token spans use
// .stok, NEVER .jp; focus restored after each rebuild; keyboard scoped to the study root.

import { esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { canSpeak, speakExample } from './speak.js';

const RATINGS = [['got', 'Got it'], ['close', 'Close'], ['missed', 'Missed']];

function tokensHTML(ja) {
  return (Array.isArray(ja) ? ja : []).map(t => {
    if (typeof t === 'string') return esc(t);
    if (!t || typeof t !== 'object') return '';
    return `<span class="stok" lang="ja">${rubyHTML(t.f, t.t)}</span>`;
  }).join('');
}
function modelEx(p) {
  const exs = (p && Array.isArray(p.examples)) ? p.examples : [];
  return exs.find(e => e && Array.isArray(e.ja) && e.ja.length) || null;
}

// startBuild(ctx, point). ctx = { root, announce, nextPoint(), done() }. nextPoint() returns another
// practice-eligible point (or null); it's how "Another" advances without leaving the flow.
export function startBuild(ctx, point) {
  const { root } = ctx;
  const announce = ctx.announce || (() => {});
  let cur = point;
  let revealed = false;
  let queued = null;      // the point "Another" will advance to (picked lazily at rate time)

  function render() {
    revealed = false; queued = null;
    const p = cur;
    root.innerHTML = `
      <div class="stu-build">
        <div class="stu-lesson-top"><span class="stu-lesson-tag">✍️ Build a sentence</span><span class="stu-lvl">${esc(p.level || '')}</span></div>
        <p class="stu-build-prompt">Write your own sentence using <b lang="ja">${esc(p.pattern || '')}</b>.</p>
        ${p.meaning ? `<p class="stu-note stu-build-mean">${esc(p.meaning)}</p>` : ''}
        <textarea class="stu-build-input" id="stuBuildInput" lang="ja" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Write your sentence"></textarea>
        <div class="stu-build-model" id="stuBuildModel" hidden></div>
        <div class="stu-controls" id="stuBuildControls">
          <button type="button" class="stu-btn stu-btn-ghost" data-act="buildDone">Done</button>
          <button type="button" class="stu-btn stu-btn-primary" data-act="buildModel">Show model</button>
        </div>
        <p class="stu-note stu-build-foot">Practice only — this doesn't affect your reviews or the gate.</p>
      </div>`;
    root.querySelector('#stuBuildInput')?.focus({ preventScroll: true });
    announce(`Build a sentence using ${p.pattern || ''}. ${p.meaning || ''} Write your attempt, then show the model to compare.`);
  }

  function showModel() {
    if (revealed) return;
    const ex = modelEx(cur);
    const box = root.querySelector('#stuBuildModel');
    if (!ex || !box) { announce('No model sentence available for this point.'); return; }
    revealed = true;
    const speakBtn = canSpeak()
      ? `<button type="button" class="stu-btn stu-btn-ghost stu-build-speak" data-act="buildSpeak" aria-label="Play the model sentence">🔊 Play</button>` : '';
    box.hidden = false;
    box.innerHTML = `
      <p class="stu-build-model-h">Model — compare with yours:</p>
      <p class="stu-sentence" lang="ja">${tokensHTML(ex.ja)}</p>
      ${ex.en ? `<p class="stu-en">${esc(ex.en)}</p>` : ''}
      ${speakBtn}
      <div class="stu-build-rate" role="group" aria-label="How did yours compare?">
        <span class="stu-build-rate-q">How did yours compare?</span>
        ${RATINGS.map(([r, l]) => `<button type="button" class="stu-btn stu-btn-ghost stu-build-rate-b" data-act="buildRate" data-r="${esc(r)}">${esc(l)}</button>`).join('')}
      </div>`;
    const ctl = root.querySelector('#stuBuildControls');
    if (ctl) ctl.innerHTML = `<button type="button" class="stu-btn stu-btn-ghost" data-act="buildDone">Done</button>`;
    box.querySelector('.stu-build-rate-b')?.focus({ preventScroll: true });
    announce('Model sentence shown. Compare it with yours, then rate honestly — got it, close, or missed. This is practice only, nothing is scheduled.');
  }

  // DISPLAY-ONLY: a self-rating never calls review() / never schedules anything.
  function rate(r) {
    const label = (RATINGS.find(x => x[0] === r) || [null, ''])[1];
    queued = ctx.nextPoint ? ctx.nextPoint() : null;
    const rateEl = root.querySelector('.stu-build-rate');
    if (rateEl) rateEl.innerHTML = `<p class="stu-build-ack">Noted: <b>${esc(label)}</b>. This is for you only — nothing scheduled.</p>
      <div class="stu-controls">
        ${queued ? `<button type="button" class="stu-btn stu-btn-primary" data-act="buildAnother">Another</button>` : ''}
        <button type="button" class="stu-btn stu-btn-ghost" data-act="buildDone">Done</button>
      </div>`;
    (root.querySelector('[data-act="buildAnother"]') || root.querySelector('[data-act="buildDone"]'))?.focus({ preventScroll: true });
    announce(`${label}. Practice only — nothing was scheduled.`);
  }

  function another() { if (queued) { cur = queued; render(); } }

  render();
  return {
    teardown() {},
    onAct(name, btn) {
      if (name === 'buildModel') showModel();
      else if (name === 'buildSpeak') { const ex = modelEx(cur); if (ex) speakExample(ex.ja, btn); }
      else if (name === 'buildRate') rate(btn.dataset.r);
      else if (name === 'buildAnother') another();
      else if (name === 'buildDone') ctx.done();
    },
    onKey(e) {
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;   // textarea owns typing; buttons activate natively
      if (e.key === 'Enter') { e.preventDefault(); if (!revealed) showModel(); else another(); }
    },
  };
}
