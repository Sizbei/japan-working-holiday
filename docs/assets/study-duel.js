'use strict';
// Nuance duel (R8) — a focused discrimination drill between ONE confusable pair (teaching model
// item 4: the bounded massed-pair exception to interleaving). Six rapid "which fits this blank?"
// 2-choice items alternate between the pair's example sentences; immediate feedback + a post-answer
// peg; an end-of-duel score. Launched from any grammar reference card's "vs 〜X" chip (the primary
// entry). Duels are PRACTICE — they do NOT call review()/testOutResult and NEVER touch scheduling
// or the store; nothing here is durable (formative by design).
//
// Self-contained overlay (its own focus-trapped dialog + focus restore) so it can run over the
// grammar page without a #/study session. Every dynamic string through esc(); ruby via rubyHTML;
// token spans use .stok, NEVER .jp. data-no-swipe on the dialog so a horizontal drag never routes.

import { esc } from './lib/dom.js';
import { rubyHTML } from './lib/furigana.js';
import { pegHTML } from './lib/peg.js';
import { clozeFor } from './lib/questions.js';

const DUEL_N = 6;

// blanked-stem renderer (clozeFor `blankedTokens` shape)
function stemHTML(tokens) {
  return (Array.isArray(tokens) ? tokens : []).map(b => {
    if (b.blank) return `<span class="stu-blank stu-blank-mcq" aria-label="blank">＿＿</span>`;
    const tok = b.token;
    if (typeof tok === 'string') return esc(tok);
    if (!tok || typeof tok !== 'object') return '';
    return `<span class="stok" lang="ja">${rubyHTML(tok.f, tok.t)}</span>`;
  }).join('');
}

// build DUEL_N items alternating target a / b; only keep items whose target example yields a blank.
function buildItems(a, b) {
  const items = [];
  for (let k = 0; k < DUEL_N; k++) {
    const tgt = k % 2 === 0 ? a : b;
    const exIdx = Math.floor(k / 2) % ((tgt.examples && tgt.examples.length) || 1);
    const { blankedTokens } = clozeFor(tgt, exIdx);
    if (!blankedTokens.some(t => t.blank)) continue;      // no p-span → skip this beat
    const ex = tgt.examples && tgt.examples[exIdx];
    items.push({ tgt, stem: blankedTokens, en: (ex && ex.en) || '', correct: k % 2 === 0 ? 0 : 1 });
  }
  return items;
}

// openDuel(a, b) — a, b are two point objects (a = the card you launched from). No-op if either is
// missing examples. Returns nothing; the overlay owns its own lifecycle.
export function openDuel(a, b) {
  if (!a || !b || !Array.isArray(a.examples) || !Array.isArray(b.examples)) return;
  const items = buildItems(a, b);
  if (!items.length) return;
  const options = [a.pattern || '', b.pattern || ''];   // fixed order [a, b] across the whole duel

  const prevFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'duel-overlay';
  overlay.setAttribute('data-no-swipe', '');
  overlay.innerHTML = `
    <div class="duel-box" role="dialog" aria-modal="true" aria-labelledby="duelTitle">
      <div class="duel-head">
        <h2 id="duelTitle" class="duel-title"><span lang="ja">${esc(a.pattern || '')}</span> vs <span lang="ja">${esc(b.pattern || '')}</span></h2>
        <button type="button" class="duel-x" data-duel="close" aria-label="Close duel">✕</button>
      </div>
      <div class="duel-body" id="duelBody"></div>
      <p class="sr-only" id="duelLive" role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector('#duelBody');
  const live = overlay.querySelector('#duelLive');
  const announce = (m) => { if (live) live.textContent = m; };

  let i = 0, score = 0, step = 'choose';

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
  }

  function renderItem() {
    step = 'choose';
    const it = items[i];
    const optHTML = options.map((o, k) =>
      `<button type="button" class="stu-mc-opt duel-opt" data-duel="pick" data-k="${k}">
         <span class="stu-mc-key" aria-hidden="true">${k + 1}</span><span lang="ja">${esc(o)}</span></button>`).join('');
    body.innerHTML = `
      <div class="duel-prog"><span class="duel-prog-n">${i + 1} / ${items.length}</span>
        <span class="duel-prog-bar" aria-hidden="true"><i style="width:${Math.round((i + 1) / items.length * 100)}%"></i></span></div>
      <p class="stu-sentence stu-mcq-stem" lang="ja">${stemHTML(it.stem)}</p>
      <p class="stu-en" hidden>${esc(it.en)}</p>
      <div class="stu-mc" role="group" aria-label="Choices">${optHTML}</div>
      <div class="stu-feedback" id="duelFb" aria-live="off"></div>
      <div class="stu-controls" id="duelCtl"></div>`;
    body.querySelector('.duel-opt')?.focus({ preventScroll: true });
    announce(`Item ${i + 1} of ${items.length}. Which fits — ${options[0]} or ${options[1]}?`);
  }

  function pick(k) {
    if (step !== 'choose') return;
    step = 'graded';
    const it = items[i];
    const ok = k === it.correct;
    if (ok) score++;
    body.querySelectorAll('.duel-opt').forEach((o, idx) => {
      o.disabled = true;
      if (idx === it.correct) o.classList.add('stu-mc-right');
      else if (idx === k) o.classList.add('stu-mc-wrong');
    });
    body.querySelector('.stu-en')?.removeAttribute('hidden');
    const fb = body.querySelector('#duelFb');
    const ans = options[it.correct];
    if (fb) fb.innerHTML = (ok
      ? `<span class="stu-fb-ok">Correct — <b lang="ja">${esc(ans)}</b>.</span>`
      : `<span class="stu-fb-wrong">Not quite — <b lang="ja">${esc(ans)}</b> fits here.</span>`)
      + pegHTML(it.tgt);
    const ctl = body.querySelector('#duelCtl');
    const last = i >= items.length - 1;
    if (ctl) ctl.innerHTML = `<button type="button" class="stu-btn stu-btn-primary" data-duel="next">${last ? 'See score' : 'Next'} ⏎</button>`;
    ctl?.querySelector('button')?.focus({ preventScroll: true });
    announce(ok ? 'Correct.' : `Not quite. ${ans} fits here.`);
  }

  function next() {
    i++;
    if (i >= items.length) { renderScore(); return; }
    renderItem();
  }

  function renderScore() {
    step = 'done';
    const pct = Math.round(score / items.length * 100);
    body.innerHTML = `
      <div class="duel-score">
        <div class="duel-score-art" aria-hidden="true">⚔️</div>
        <p class="duel-score-n">${score} / ${items.length}</p>
        <p class="stu-note">${pct >= 80 ? "You've got the distinction." : 'Keep drilling this pair — the contrast is the point.'}</p>
        <div class="stu-controls">
          <button type="button" class="stu-btn stu-btn-ghost" data-duel="close">Done</button>
          <button type="button" class="stu-btn stu-btn-primary" data-duel="retry">Again</button>
        </div>
      </div>`;
    body.querySelector('.stu-btn-primary')?.focus({ preventScroll: true });
    announce(`Duel complete. ${score} of ${items.length}.`);
  }

  overlay.addEventListener('click', (e) => {
    const b2 = e.target.closest('[data-duel]');
    if (b2) {
      const act = b2.dataset.duel;
      if (act === 'close') close();
      else if (act === 'pick') pick(parseInt(b2.dataset.k, 10));
      else if (act === 'next') next();
      else if (act === 'retry') { i = 0; score = 0; renderItem(); }
      return;
    }
    if (e.target === overlay) close();   // backdrop click closes
  });

  function onKey(e) {
    if (!document.body.contains(overlay)) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {                                // simple focus trap
      const f = overlay.querySelectorAll('button:not([disabled])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (step === 'choose' && /^[12]$/.test(e.key)) {           // 1/2 pick (an option button is focused — don't gate on that)
      e.preventDefault(); pick(parseInt(e.key, 10) - 1);
    } else if (step === 'graded' && (e.key === 'Enter' || e.key === ' ') && !(t && t.tagName === 'BUTTON')) {
      e.preventDefault(); next();                              // Enter on the focused Next button native-activates instead
    }
  }
  document.addEventListener('keydown', onKey, true);

  renderItem();
}
