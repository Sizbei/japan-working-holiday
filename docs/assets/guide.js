'use strict';
// Guide & Settings — a top-right ⚙ button opens an overlay (NOT a main route) with a short
// how-to-use tutorial plus toggleable settings (theme, arcade mode, reduce motion). All
// settings persist to localStorage and apply via data-attributes on <html>.

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, getRaw, setRaw } from './lib/store.js';
import { HOME_LAYOUTS, HOME_LAYOUT_LABELS, normalizeHomeLayout } from './lib/homelayout.js';
import { listCtl, LISTCTL } from './lib/listctl.js';
import { usageSummary } from './lib/usage.js';
import { ROUTES, routeLabel } from './router.js';

const LISTCTL_OPTS = [
  { v: LISTCTL.QUICKLINE, label: 'Quick-line' },
  { v: LISTCTL.PILLS, label: 'Pills' },
];

// Reflect the persisted home-layout theme onto <html data-home>. Exported so main.js can call
// it as early as possible in boot (before the dashboard paints) to avoid a layout flash.
// Compact pages: <html data-compact="on"> shrinks every pillar-head to a one-line mini-title
// (kanji + lede hidden) and lets the calendar height-lock to the viewport. Applied early in boot.
export function applyCompact() {
  document.documentElement.dataset.compact = getRaw(KEYS.compact, '') === 'on' ? 'on' : '';
}

export function applyHomeLayout() {
  document.documentElement.dataset.home = normalizeHomeLayout(getRaw(KEYS.homeLayout, ''));
}

export function mountGuide() {
  // apply persisted reduce-motion + home layout on boot (theme + arcade are restored by their own modules)
  if (getRaw(KEYS.reduceMotion, '') === 'on') document.documentElement.dataset.reduceMotion = 'on';
  applyHomeLayout();
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

// "Your usage" — private, per-device aggregates (lib/usage.js) so the owner can see which
// pages actually earn their keep. Hidden until there's at least one recorded visit.
function usageSectionHTML() {
  const s = usageSummary(get(KEYS.usage, null), ROUTES);
  if (!s.totalVisits) return '';
  const max = s.routes[0]?.n || 1;
  const rows = s.routes.slice(0, 10).map(r =>
    `<div class="use-row"><span class="use-name">${esc(routeLabel(r.route))}</span><span class="use-bar"><i style="width:${Math.max(4, Math.round(r.n / max * 100))}%"></i></span><span class="use-n">${r.n}</span></div>`).join('');
  const never = s.neverUsed.map(r => esc(routeLabel(r))).join(', ');
  return `<section class="guide-sec">
    <h3 class="guide-h">Your usage <span class="use-sub">— this device only, never leaves it</span></h3>
    <p class="use-stats">${s.daysUsed} day${s.daysUsed === 1 ? '' : 's'} active · ${s.totalVisits} page visit${s.totalVisits === 1 ? '' : 's'} · ${s.edits} edit${s.edits === 1 ? '' : 's'}</p>
    <div class="use-list">${rows}</div>
    ${never ? `<p class="use-hint">Never opened on this device: ${never} — candidates to improve or retire.</p>` : ''}
  </section>`;
}

function openGuide() {
  if (ov) { closeGuide(); return; }
  lastFocus = document.activeElement;
  const dark = document.documentElement.dataset.theme === 'dark';
  const arcade = document.documentElement.dataset.arcade === 'on';
  const reduce = document.documentElement.dataset.reduceMotion === 'on';
  const compact = document.documentElement.dataset.compact === 'on';
  const celebrate = getRaw(KEYS.celebrations, '') !== 'off';   // default on
  const sound = getRaw(KEYS.sound, '') === 'on';               // default off
  const homeLayout = normalizeHomeLayout(getRaw(KEYS.homeLayout, ''));
  const listCtlCur = listCtl();
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
        <li><b>Anki sync</b> — works when you run this dashboard locally (http://localhost) with Anki + the AnkiConnect add-on open, and add that origin to AnkiConnect's webCorsOriginList (per-origin, all-or-nothing — only add origins you trust). On the live site, Export/Import fall back to a file.</li>
      </ul>
    </section>

    <section class="guide-sec">
      <h3 class="guide-h">Settings</h3>
      <div class="set-row">
        <div class="set-text"><span class="set-label">Home layout</span><span class="set-sub">How the Dashboard arranges itself</span></div>
        <div class="set-seg" role="radiogroup" aria-label="Home layout">
          ${HOME_LAYOUTS.map(l => `<button type="button" class="seg-btn" role="radio" data-home-opt="${l}" aria-checked="${l === homeLayout ? 'true' : 'false'}">${HOME_LAYOUT_LABELS[l]}</button>`).join('')}
        </div>
      </div>
      <div class="set-row">
        <div class="set-text"><span class="set-label">List controls</span><span class="set-sub">How Checklist &amp; Packing search and add</span></div>
        <div class="set-seg" role="radiogroup" aria-label="List controls">
          ${LISTCTL_OPTS.map(o => `<button type="button" class="seg-btn" role="radio" data-listctl-opt="${o.v}" aria-checked="${o.v === listCtlCur ? 'true' : 'false'}">${o.label}</button>`).join('')}
        </div>
      </div>
      ${row('setTheme', 'Dark mode', 'Easier on the eyes at night', dark)}
      ${row('setArcade', 'Arcade mode', 'Extra retro CRT glow &amp; pixel flair', arcade)}
      ${row('setReduce', 'Reduce motion', 'Minimise animations and transitions', reduce)}
      ${row('setCompact', 'Compact pages', 'Small titles, more content — the calendar fits one screen', compact)}
      ${row('setCelebrate', 'Celebrations', 'Confetti when you finish things', celebrate)}
      ${row('setSound', 'Sound effects', 'Chiptune blips on milestones &amp; eggs', sound)}
    </section>
    ${usageSectionHTML()}
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
  $('#setCompact', ov)?.addEventListener('click', () => {
    const on = document.documentElement.dataset.compact === 'on';
    setRaw(KEYS.compact, on ? '' : 'on');
    applyCompact();
    setSwitch('setCompact', !on);
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));   // active views re-render so compact-aware bits (month chip cap) flip instantly
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
  $$('.set-seg [data-home-opt]', ov).forEach(b => b.addEventListener('click', () => {
    const v = normalizeHomeLayout(b.dataset.homeOpt);
    setRaw(KEYS.homeLayout, v);
    applyHomeLayout();                                         // live: reflects onto <html data-home> immediately
    $$('.set-seg [data-home-opt]', ov).forEach(x => x.setAttribute('aria-checked', x.dataset.homeOpt === v ? 'true' : 'false'));
  }));
  $$('.set-seg [data-listctl-opt]', ov).forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.listctlOpt === LISTCTL.PILLS ? LISTCTL.PILLS : LISTCTL.QUICKLINE;
    setRaw(KEYS.listCtl, v);
    $$('.set-seg [data-listctl-opt]', ov).forEach(x => x.setAttribute('aria-checked', x.dataset.listctlOpt === v ? 'true' : 'false'));
    document.dispatchEvent(new CustomEvent('jwh:settings-changed'));   // checklist + packing re-render their toolbars
  }));

  document.addEventListener('keydown', onKey, true);
  const panel = ov;   // capture locally — closeGuide() may null the module-level `ov` before this fires
  setTimeout(() => { if (panel.isConnected) panel.querySelector('.guide-x')?.focus(); }, 20);
}
