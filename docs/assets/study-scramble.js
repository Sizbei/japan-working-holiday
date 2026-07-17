'use strict';
// #/study — the ★-scramble (文の組み立て) card. A shared sub-controller used by BOTH the R2
// session runner (study.js, with grade buttons) and the R3 test-out runner (study-lessons.js,
// recognition modality for N1 / written-formal points, auto-graded). Given a point + example it
// renders 4 slots (one marked ★) and 4 shuffled chunk tiles; the learner places tiles into
// slots (tap-to-place + native keyboard on real buttons), and once all four are placed it
// auto-checks the WHOLE order — exam-authentic (the ★ slot is the exam's answer format, but we
// require the full chain and highlight the ★ chunk). Correct → Hard/Good/Easy (or Continue in
// auto mode); wrong → mark the wrong slots, reveal the sentence, grade Again.
//
// DnD decision: dnd.js models LIST reorder (move an item among siblings), not slot-filling into a
// fixed 4-slot frame, so it doesn't fit here — tap-to-place + real-button keyboard (arrows/Tab
// native, Enter/Space places) is the interaction, which is fully accessible.
//
// Conventions honoured: every dynamic string through esc(); ruby via rubyHTML; token spans use
// .stok, NEVER .jp; focus restored after each rebuild; keyboard scoped to the study root (study.js
// forwards its delegated events here, above the IME guard).

import { esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { pegHTML } from './lib/peg.js';
import { scrambleFor } from './lib/questions.js';

// scrambleCard(ctx, host, point, exIdx, opts) → controller { teardown, onAct(name, btn), onKey(e) }
// opts: { onResult({ pass, chosen }), grade:bool (show Hard/Good/Easy on a correct answer, else a
// plain Continue), seed }. Reports once, on the learner's final action (grade / again / continue).
export function scrambleCard(ctx, host, point, exIdx, opts = {}) {
  const { onResult, grade = false, seed } = opts;
  const announce = ctx.announce || (() => {});
  const sc = scrambleFor(point, exIdx, seed);
  if (!sc) {                                   // caller should have gated on scramblable(); be safe
    if (typeof onResult === 'function') onResult({ pass: false });
    return { teardown() {}, onAct() {}, onKey() {} };
  }
  const { chunks, order, star } = sc;
  const N = 4;
  const slots = new Array(N).fill(null);       // slots[pos] = tile index (0..3) or null
  const placed = new Array(chunks.length).fill(false);
  let step = 'place';                          // 'place' | 'graded' | 'wrong'
  let result = null;                           // { pass }

  const tileRuby = (i) => rubyHTML(chunks[i].rt, chunks[i].text);

  function paint() {
    const slotHTML = slots.map((ti, pos) => {
      const isStar = pos === star, filled = ti != null;
      const wrong = step === 'wrong' && ti !== order[pos];
      return `<button type="button" class="stu-slot${isStar ? ' stu-slot-star' : ''}${filled ? ' is-filled' : ''}${wrong ? ' stu-slot-bad' : ''}"
          data-act="slot" data-pos="${pos}"${step !== 'place' ? ' disabled' : ''}
          aria-label="Slot ${esc(String(pos + 1))}${isStar ? ', star' : ''}${filled ? `, ${esc(chunks[ti].text)}` : ', empty'}">
          ${isStar ? '<span class="stu-slot-star-mark" aria-hidden="true">★</span>' : ''}
          <span class="stu-slot-body" lang="ja">${filled ? tileRuby(ti) : '<span class="stu-slot-ph" aria-hidden="true">＿</span>'}</span></button>`;
    }).join('');
    const tileHTML = chunks.map((c, i) => placed[i] ? ''
      : `<button type="button" class="stu-tile" data-act="tile" data-i="${esc(String(i))}" lang="ja">${tileRuby(i)}</button>`).join('');
    host.innerHTML = `
      <div class="stu-scramble">
        <p class="stu-scram-q">並べ替え — arrange the pieces; which lands on ★?</p>
        <div class="stu-slots" role="group" aria-label="Answer slots">${slotHTML}</div>
        <div class="stu-tiles" id="stuTiles" role="group" aria-label="Pieces">${tileHTML}</div>
        <div class="stu-feedback" id="stuFeedback" aria-live="off"></div>
        <div class="stu-controls" id="stuControls"></div>
      </div>`;
    // focus the first available tile (place phase) so keyboard users can act immediately
    const firstTile = host.querySelector('.stu-tile');
    if (step === 'place' && firstTile) firstTile.focus({ preventScroll: true });
  }

  function placeTile(i) {
    if (step !== 'place' || placed[i]) return;
    const pos = slots.indexOf(null);
    if (pos < 0) return;
    slots[pos] = i; placed[i] = true;
    paint();
    if (slots.every(s => s != null)) {
      const ctl = host.querySelector('#stuControls');
      if (ctl) ctl.innerHTML = `<button type="button" class="stu-btn stu-btn-primary" data-act="check">Check ⏎</button>`;
      ctl?.querySelector('button')?.focus({ preventScroll: true });
      announce(`${chunks[i].text} placed in slot ${pos + 1}. All pieces placed — check your order, or tap a slot to change it.`);
    } else {
      announce(`${chunks[i].text} placed in slot ${pos + 1}.`);
    }
  }
  function clearSlot(pos) {
    if (step !== 'place') return;
    const ti = slots[pos];
    if (ti == null) return;
    slots[pos] = null; placed[ti] = false;
    paint(); announce(`Slot ${pos + 1} cleared.`);
  }

  function check() {
    const correct = slots.every((ti, pos) => ti === order[pos]);
    result = { pass: correct };
    step = correct ? 'graded' : 'wrong';
    paint();                                   // repaint disables slots + marks wrong ones
    const starChunk = chunks[order[star]].text;
    const fb = host.querySelector('#stuFeedback');
    const c = host.querySelector('#stuControls');
    if (correct) {
      if (fb) fb.innerHTML = `<span class="stu-fb-ok">Correct — ★ was <b lang="ja">${esc(starChunk)}</b>.</span>`;
      if (c) c.innerHTML = grade
        ? `<button type="button" class="stu-btn stu-grade" data-act="grade" data-g="2">Hard <kbd>2</kbd></button>
           <button type="button" class="stu-btn stu-grade stu-good" data-act="grade" data-g="3">Good <kbd>3</kbd></button>
           <button type="button" class="stu-btn stu-grade" data-act="grade" data-g="4">Easy <kbd>4</kbd></button>`
        : `<button type="button" class="stu-btn stu-btn-primary" data-act="next">Continue ⏎</button>`;
      announce(grade ? 'Correct. Choose Hard, Good or Easy.' : 'Correct.');
    } else {
      const right = order.map(i => chunks[i].text).join('');
      if (fb) fb.innerHTML = `<span class="stu-fb-wrong">Not quite — the order is <b lang="ja">${esc(right)}</b> (★ = <b lang="ja">${esc(starChunk)}</b>).</span>`;
      if (c) c.innerHTML = `<button type="button" class="stu-btn stu-btn-primary" data-act="again">Continue ⏎</button>`;
      announce(`Not quite. The order is ${right}.`);
    }
    if (fb) fb.insertAdjacentHTML('beforeend', pegHTML(point));   // post-answer peg reward, same as the cloze card
    const btn = host.querySelector('#stuControls .stu-good, #stuControls .stu-btn-primary');
    if (btn) btn.focus({ preventScroll: true });
  }

  function finalize(chosen) {
    if (typeof onResult === 'function') onResult({ pass: !!(result && result.pass), chosen });
  }

  paint();
  return {
    teardown() {},
    onAct(name, btn) {
      if (name === 'tile') placeTile(parseInt(btn.dataset.i, 10));
      else if (name === 'slot') clearSlot(parseInt(btn.dataset.pos, 10));
      else if (name === 'check') { if (step === 'place' && slots.every(s2 => s2 != null)) check(); }
      else if (name === 'grade') { if (step === 'graded') finalize(parseInt(btn.dataset.g, 10)); }
      else if (name === 'again') { if (step === 'wrong') finalize(); }
      else if (name === 'next') { if (step === 'graded') finalize(); }
    },
    // tiles/slots/controls are real buttons — Enter/Space activate natively (→ delegated click →
    // onAct), so onKey only adds the numeric grade shortcuts on a correct answer.
    onKey(e) {
      if (step === 'place' && e.key === 'Enter' && slots.every(s2 => s2 != null)
          && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); check(); return; }
      if (step !== 'graded' || !grade) return;
      if (e.key === '2') { e.preventDefault(); finalize(2); }
      else if (e.key === '3') { e.preventDefault(); finalize(3); }
      else if (e.key === '4') { e.preventDefault(); finalize(4); }
    },
  };
}
