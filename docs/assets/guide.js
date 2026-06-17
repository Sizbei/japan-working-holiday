'use strict';
// Guide & Settings — a top-right ⚙ button opens an overlay (NOT a main route) with a short
// how-to-use tutorial plus toggleable settings (theme, arcade mode, reduce motion). All
// settings persist to localStorage and apply via data-attributes on <html>.

import { $, $$ } from './lib/dom.js';
import { KEYS, getRaw, setRaw } from './lib/store.js';

export function mountGuide() {
  // apply persisted reduce-motion on boot (theme + arcade are restored by their own modules)
  if (getRaw(KEYS.reduceMotion, '') === 'on') document.documentElement.dataset.reduceMotion = 'on';
  $('#guideBtn')?.addEventListener('click', () => openGuide());
}

let ov = null, lastFocus = null;
function closeGuide() {
  if (!ov) return;
  ov.remove(); ov = null;
  document.removeEventListener('keydown', onKey, true);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function onKey(e) {
  if (!ov) return;
  if (e.key === 'Escape') { e.preventDefault(); closeGuide(); return; }
  if (e.key !== 'Tab') return;
  const f = $$('button, a, [tabindex]:not([tabindex="-1"])', ov).filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function row(id, label, sub, on) {
  return `<div class="set-row">
    <div class="set-text"><span class="set-label">${label}</span><span class="set-sub">${sub}</span></div>
    <button type="button" class="set-switch" id="${id}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${label}"><span class="set-knob" aria-hidden="true"></span></button>
  </div>`;
}

function openGuide() {
  if (ov) { closeGuide(); return; }
  lastFocus = document.activeElement;
  const dark = document.documentElement.dataset.theme === 'dark';
  const arcade = document.documentElement.dataset.arcade === 'on';
  const reduce = document.documentElement.dataset.reduceMotion === 'on';
  const celebrate = getRaw(KEYS.celebrations, '') !== 'off';   // default on
  const sound = getRaw(KEYS.sound, '') === 'on';               // default off
  ov = document.createElement('div');
  ov.className = 'guide-overlay';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'guideTitle');
  ov.innerHTML = `<div class="guide-panel">
    <button type="button" class="guide-x" aria-label="Close">✕</button>
    <h2 class="guide-title" id="guideTitle">Guide &amp; Settings</h2>

    <section class="guide-sec">
      <h3 class="guide-h">How to use this</h3>
      <ul class="guide-list">
        <li><b>The pages</b> — Dashboard (your at-a-glance), Calendar (researched + your events), Deadlines (act-by dates), Checklist (the yearlong plan), Explore (places &amp; tips), Rooms (share-houses), Map (everything pinned), Plan a Day (build an itinerary).</li>
        <li><b>Get around</b> — tap the nav, <b>swipe</b> left/right between pages on a phone, or press <b>1–8</b> and <b>[ ]</b> on a keyboard (<b>?</b> shows every shortcut).</li>
        <li><b>Quick actions</b> — <b>long-press</b> a calendar day, an Explore card, or a checklist item for a pop-up menu. Tap <b>★</b> on a restaurant to add it to your map (Tabetai).</li>
        <li><b>Rearrange</b> — drag the ⠿ handle to reorder lists; drag an event chip to another day to reschedule.</li>
        <li><b>Your data</b> — everything saves on <i>this device only</i>. Use <b>⬇ Back up my data</b> (bottom of the page) before switching phones.</li>
        <li><b>Languages</b> — the <b>あ</b> button toggles a Japanese chrome + hover-dictionary; <b>🌙</b> switches dark mode.</li>
      </ul>
    </section>

    <section class="guide-sec">
      <h3 class="guide-h">Settings</h3>
      ${row('setTheme', 'Dark mode', 'Easier on the eyes at night', dark)}
      ${row('setArcade', 'Arcade mode', 'Extra retro CRT glow &amp; pixel flair', arcade)}
      ${row('setReduce', 'Reduce motion', 'Minimise animations and transitions', reduce)}
      ${row('setCelebrate', 'Celebrations', 'Confetti when you finish things', celebrate)}
      ${row('setSound', 'Sound effects', 'Chiptune blips on milestones &amp; eggs', sound)}
    </section>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.guide-x')) closeGuide(); });

  // --- settings wiring ---
  const setSwitch = (id, on) => { const b = $('#' + id, ov); if (b) b.setAttribute('aria-checked', on ? 'true' : 'false'); };
  $('#setTheme', ov)?.addEventListener('click', () => {
    $('#themeToggle')?.click();                                   // single source of truth (also updates the topbar button)
    setSwitch('setTheme', document.documentElement.dataset.theme === 'dark');
  });
  $('#setArcade', ov)?.addEventListener('click', () => {
    const on = document.documentElement.dataset.arcade === 'on';
    document.documentElement.dataset.arcade = on ? '' : 'on';
    setRaw(KEYS.arcade, on ? '' : 'on');
    setSwitch('setArcade', !on);
  });
  $('#setReduce', ov)?.addEventListener('click', () => {
    const on = document.documentElement.dataset.reduceMotion === 'on';
    document.documentElement.dataset.reduceMotion = on ? '' : 'on';
    setRaw(KEYS.reduceMotion, on ? '' : 'on');
    setSwitch('setReduce', !on);
  });
  $('#setCelebrate', ov)?.addEventListener('click', () => {
    const on = getRaw(KEYS.celebrations, '') !== 'off';        // currently on?
    setRaw(KEYS.celebrations, on ? 'off' : 'on');
    setSwitch('setCelebrate', !on);
  });
  $('#setSound', ov)?.addEventListener('click', () => {
    const on = getRaw(KEYS.sound, '') === 'on';               // currently on? (default off)
    setRaw(KEYS.sound, on ? 'off' : 'on');
    setSwitch('setSound', !on);
  });

  document.addEventListener('keydown', onKey, true);
  const panel = ov;   // capture locally — closeGuide() may null the module-level `ov` before this fires
  setTimeout(() => { if (panel.isConnected) panel.querySelector('.guide-x')?.focus(); }, 20);
}
