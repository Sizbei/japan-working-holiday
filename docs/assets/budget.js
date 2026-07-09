'use strict';
// Budget planner page (#/budget). A planner, not an expense tracker: set savings + monthly
// income, edit the researched one-time / monthly cost estimates, add your own lines, and see
// the bottom line — to-land, monthly burn, net, and runway. All state is device-local
// (jwh-budget-v1). Pure math lives in lib/budget.js; this file is DOM glue.
//
// Mutations save + re-render the budget view DIRECTLY — they do NOT dispatch jwh:data-changed
// (nothing else derives from the budget yet; dispatching would trigger no-op re-renders).

import { $, $$, esc } from './lib/dom.js';
import { KEYS, get, set } from './lib/store.js';
import { confirmModal } from './lib/modal.js';
import { mountAccordion } from './collapse.js';
import { effectiveLines, sum, summary, fmtYen, fmtCad } from './lib/budget.js';
import { parseSpend, monthTotal, spendSummary, pruneSpend } from './lib/spend.js';
import { nowISO, fmtShort } from './lib/dates.js';

// hardcoded fallback if tips.json has no budget block (defensive — UI must still mount)
const FALLBACK = { currency: 'JPY', oneTime: [], monthly: [] };

let BAKED = FALLBACK;

const GROUPS = [
  { key: 'oneTime', acc: 'budget-onetime', title: 'One-time costs' },
  { key: 'monthly', acc: 'budget-monthly', title: 'Monthly costs' },
];

// ---- state (defensive read — object fallback fires the store type-guard) ----
function load() { return get(KEYS.budget, {}) || {}; }
function save(state) { set(KEYS.budget, state); }

export function mountBudget(data) {
  const wrap = $('#budgetGroups');
  if (!wrap) return;
  BAKED = (data && data.budget && typeof data.budget === 'object') ? data.budget : FALLBACK;
  wireInputs();
  wireReset();
  render();
  renderSpend();
}

// ---- spend log (actuals) — jwh-spend-v1; unlike the planner, spend mutations DO dispatch
// jwh:data-changed: the dashboard teaser derives real burn/runway from them. ----
let spendYm = nowISO().slice(0, 7);   // month being browsed (quick-add dates independently)
function loadSpend() { const s = get(KEYS.spend, {}) || {}; return Array.isArray(s.items) ? s.items : []; }
function saveSpend(items) {
  set(KEYS.spend, { v: 1, items: pruneSpend(items, nowISO()) });
  document.dispatchEvent(new CustomEvent('jwh:data-changed'));
  renderSpend(); renderSummary();
}
function renderSpend() {
  const card = $('#spendCard'); if (!card) return;
  const items = loadSpend();
  const planned = summary(BAKED, load()).monthlyTotal;
  const total = monthTotal(items, spendYm);
  const isNow = spendYm === nowISO().slice(0, 7);
  const pct = planned > 0 ? Math.min(100, Math.round(total / planned * 100)) : 0;
  const rows = items.filter(it => String(it.date || '').slice(0, 7) === spendYm)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, 8)
    .map(it => `<li class="sp-row"><span class="sp-date">${esc(fmtShort(it.date))}</span><span class="sp-note">${esc(it.note || '—')}</span><span class="sp-amt">${fmtYen(it.amount)}</span><button type="button" class="sp-del" data-del="${esc(it.id)}" aria-label="Delete ${fmtYen(it.amount)} ${esc(it.note || '')}">✕</button></li>`).join('');
  const [yy, mm] = spendYm.split('-');
  const monthName = new Date(Date.UTC(+yy, +mm - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  card.innerHTML = `
    <div class="sp-head"><h3 class="sp-h">Spent ${isNow ? 'this month' : `— ${esc(monthName)} ${esc(yy)}`}</h3>
      <span class="sp-nav"><button type="button" class="sp-mv" data-mv="-1" aria-label="Previous month">‹</button><button type="button" class="sp-mv" data-mv="1" aria-label="Next month" ${isNow ? 'disabled' : ''}>›</button></span></div>
    <div class="sp-total"><b>${fmtYen(total)}</b>${planned > 0 ? ` <span class="sp-of">of ${fmtYen(planned)} planned</span>` : ''}</div>
    ${planned > 0 ? `<div class="sp-bar" role="img" aria-label="${pct}% of planned monthly burn"><i style="width:${pct}%" class="${total > planned ? 'over' : ''}"></i></div>` : ''}
    ${isNow ? `<form id="spendAdd" class="sp-add" autocomplete="off"><span class="sp-plus" aria-hidden="true">＋</span><input type="text" id="spendInput" placeholder="1200 ramen · ¥3,400 drinks yesterday · 1.2k combini" aria-label="Quick-add a spend — amount then note, optional trailing date word"><span class="sp-hint" id="spendHint" aria-live="polite"></span></form>` : ''}
    ${rows ? `<ul class="sp-list">${rows}</ul>` : `<p class="sp-empty">${isNow ? 'Nothing logged yet — add your first spend above.' : 'Nothing logged this month.'}</p>`}`;
  card.querySelectorAll('.sp-mv').forEach(b => b.addEventListener('click', () => {
    const d = new Date(Date.UTC(+yy, +mm - 1 + (+b.dataset.mv), 1));
    const next = d.toISOString().slice(0, 7);
    if (next <= nowISO().slice(0, 7)) { spendYm = next; renderSpend(); }
  }));
  card.querySelector('#spendAdd')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = card.querySelector('#spendInput');
    const parsed = parseSpend(input.value, nowISO());
    if (!parsed) { const h = card.querySelector('#spendHint'); if (h) h.textContent = 'amount first — e.g. “1200 ramen”'; return; }
    saveSpend([{ id: 's' + Date.now(), ...parsed }, ...loadSpend()]);
    const inp = $('#spendInput'); if (inp) { inp.focus(); }   // card re-rendered — re-find + keep the flow going
  });
  card.querySelectorAll('.sp-del').forEach(b => b.addEventListener('click', async () => {
    if (!await confirmModal('Delete this spend entry?', { ok: 'Delete', danger: true })) return;
    saveSpend(loadSpend().filter(it => it.id !== b.dataset.del));
  }));
}

// Savings + Monthly income number inputs — debounced save, then re-render (summary only would
// suffice, but a full render keeps it simple and the page is small).
function wireInputs() {
  let t = null;
  const debounced = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const s = load();
      s.savings = clampInt($('#budgetSavings')?.value);
      s.monthlyIncome = clampInt($('#budgetIncome')?.value);
      s.cadRate = clampRate($('#budgetCadRate')?.value);   // yen-per-1-CAD; 0/blank → CAD twins hidden
      save(s);
      renderSummary();
    }, 250);
  };
  const sav = $('#budgetSavings'), inc = $('#budgetIncome'), cad = $('#budgetCadRate');
  if (sav && !sav.dataset.wired) { sav.dataset.wired = '1'; sav.addEventListener('input', debounced); }
  if (inc && !inc.dataset.wired) { inc.dataset.wired = '1'; inc.addEventListener('input', debounced); }
  if (cad && !cad.dataset.wired) { cad.dataset.wired = '1'; cad.addEventListener('input', debounced); }
}

function wireReset() {
  const btn = $('#budgetReset');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', async () => {
    if (!await confirmModal('Reset budget to the researched defaults? Your edits, custom lines, savings and income will be cleared.', { ok: 'Reset', danger: true })) return;
    save({});
    render();
  });
}

// coerce a number-input string to a non-negative integer yen (no eval; mirrors lib coerce)
function clampInt(v) { return Math.max(0, Math.round(+v || 0)); }
// coerce the CAD rate (yen-per-1-CAD): blank/≤0/non-finite → 0 (off). fmtCad re-guards anyway.
function clampRate(v) { const n = +v; return n > 0 ? n : 0; }

// ---- summary band ----
function renderSummary() {
  const band = $('#budgetSummary');
  if (!band) return;
  const s = summary(BAKED, load());

  const runwayInf = s.runwayMonths === Infinity;
  const runwayText = runwayInf ? '∞ / sustainable' : `${s.runwayMonths} mo`;
  // color the net/runway: green sustainable, amber tight (<6mo), red (<3mo)
  let tone = 'good';
  if (!runwayInf) tone = s.runwayMonths < 3 ? 'bad' : (s.runwayMonths < 6 ? 'warn' : 'good');

  const netSign = s.monthlyNet > 0 ? '+' : (s.monthlyNet < 0 ? '−' : '±');
  const netAbs = fmtYen(Math.abs(s.monthlyNet));

  // optional CAD twin under each yen figure — only when a positive rate is set (fmtCad → '' otherwise).
  const rate = clampRate(load().cadRate);
  const cad = (yen) => { const t = fmtCad(yen, rate); return t ? `<span class="bdg-cad">≈ ${esc(t)}</span>` : ''; };
  const netCad = (() => { const t = fmtCad(s.monthlyNet, rate); return t ? `<span class="bdg-cad">≈ ${esc(t)}</span>` : ''; })();   // fmtCad owns the sign now

  band.innerHTML = `
    <div class="bdg-stat">
      <span class="bdg-stat-label">To land</span>
      <span class="bdg-stat-num">${esc(fmtYen(s.toLand))}</span>
      ${cad(s.toLand)}
    </div>
    <div class="bdg-stat">
      <span class="bdg-stat-label">Monthly burn</span>
      <span class="bdg-stat-num">${esc(fmtYen(s.monthlyTotal))}</span>
      ${cad(s.monthlyTotal)}
    </div>
    <div class="bdg-stat bdg-${esc(tone)}">
      <span class="bdg-stat-label">Net / mo</span>
      <span class="bdg-stat-num">${esc(netSign + netAbs)}</span>
      ${netCad}
    </div>
    <div class="bdg-stat bdg-${esc(tone)}">
      <span class="bdg-stat-label">Runway</span>
      <span class="bdg-stat-num">${esc(runwayText)}</span>
    </div>
    <div class="bdg-stat bdg-after">
      <span class="bdg-stat-label">After setup</span>
      <span class="bdg-stat-num">${esc(fmtYen(s.afterLanding))}</span>
      ${cad(s.afterLanding)}
    </div>`;
}

// ---- one line row: label + editable amount + remove × ----
function lineRowHTML(line) {
  const conf = (line.confidence || '').toLowerCase();
  const lowBadge = (conf === 'low') ? `<span class="badge low">verify</span>` : '';
  const note = line.note ? `<span class="bdg-note">${esc(line.note)}</span>` : '';
  return `
    <li class="bdg-line" data-id="${esc(line.id)}">
      <span class="bdg-line-body">
        <span class="bdg-line-label">${esc(line.label || '')} ${lowBadge}</span>
        ${note}
      </span>
      <span class="bdg-line-amt">
        <span class="bdg-yen" aria-hidden="true">¥</span>
        <input type="number" inputmode="numeric" min="0" step="1000" class="bdg-amt"
          data-id="${esc(line.id)}" value="${esc(String(line.amount))}"
          aria-label="${esc(line.label || 'line')} amount in yen">
      </span>
      <button type="button" class="bdg-del" data-del="${esc(line.id)}"
        aria-label="Remove ${esc(line.label || 'line')}">✕</button>
    </li>`;
}

function groupHTML(g) {
  const lines = effectiveLines(BAKED, load(), g.key);
  const subtotal = sum(lines);
  const rows = lines.length
    ? lines.map(lineRowHTML).join('')
    : `<li class="bdg-empty">No lines — add one below.</li>`;
  return `<section class="acc bdg-group" data-acc="${esc(g.acc)}">
    <button type="button" class="acc-head" aria-expanded="true" aria-controls="acc-panel-${esc(g.acc)}" aria-label="${esc(g.title)}">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">${esc(g.title)}</span>
      <span class="acc-count">${esc(fmtYen(subtotal))}</span>
    </button>
    <div class="acc-panel" id="acc-panel-${esc(g.acc)}" role="region" aria-label="${esc(g.title)}">
      <div class="acc-inner">
        <ul class="bdg-list">${rows}</ul>
        <form class="bdg-add" data-group="${esc(g.key)}" autocomplete="off">
          <input type="text" class="bdg-add-label" placeholder="Add a cost…" aria-label="New ${esc(g.title)} label" maxlength="120">
          <span class="bdg-yen" aria-hidden="true">¥</span>
          <input type="number" inputmode="numeric" min="0" step="1000" class="bdg-add-amt" placeholder="0" aria-label="New ${esc(g.title)} amount in yen">
          <button type="submit" class="bdg-add-btn">＋ Add line</button>
        </form>
      </div>
    </div>
  </section>`;
}

function render() {
  const wrap = $('#budgetGroups');
  if (!wrap) return;
  // reflect saved savings/income into the inputs (e.g. after a reset)
  const state = load();
  const sav = $('#budgetSavings'), inc = $('#budgetIncome'), cad = $('#budgetCadRate');
  if (sav && document.activeElement !== sav) sav.value = state.savings != null ? clampInt(state.savings) : '';
  if (inc && document.activeElement !== inc) inc.value = state.monthlyIncome != null ? clampInt(state.monthlyIncome) : '';
  if (cad && document.activeElement !== cad) cad.value = clampRate(state.cadRate) > 0 ? clampRate(state.cadRate) : '';

  wrap.innerHTML = GROUPS.map(groupHTML).join('');
  wireRows();
  mountAccordion(wrap);
  renderSummary();
}

function wireRows() {
  // edit a baked line → write an override; edit a custom line → update its amount in custom[]
  $$('#budgetGroups .bdg-amt').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.id;
    const amount = clampInt(inp.value);
    const s = load();
    const customGroup = findCustom(s, id);
    if (customGroup) {
      const arr = s.custom[customGroup];
      const item = arr.find(x => x && x.id === id);
      if (item) item.amount = amount;
    } else {
      s.overrides = (s.overrides && typeof s.overrides === 'object') ? s.overrides : {};
      s.overrides[id] = amount;
    }
    save(s);
    render();
  }));

  // remove: hide a baked line, or drop a custom line entirely
  $$('#budgetGroups .bdg-del').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.del;
    // capture the clicked button's index so render() can restore keyboard focus (the button is destroyed)
    const dels = $$('#budgetGroups .bdg-del');
    const idx = dels.indexOf(btn);
    const s = load();
    const customGroup = findCustom(s, id);
    if (customGroup) {
      s.custom[customGroup] = s.custom[customGroup].filter(x => x && x.id !== id);
      if (s.overrides) delete s.overrides[id];
    } else {
      s.hidden = Array.isArray(s.hidden) ? s.hidden : [];
      if (!s.hidden.includes(id)) s.hidden.push(id);
      if (s.overrides) delete s.overrides[id];   // an override on a hidden line is dead weight
    }
    save(s);
    render();
    // restore focus to the same-index delete button (or the last one, or the groups container)
    const after = $$('#budgetGroups .bdg-del');
    (after[idx] || after[after.length - 1] || $('#budgetGroups'))?.focus();
  }));

  // add a custom line — id is GENERATED (never from the label, which is free user text)
  $$('#budgetGroups .bdg-add').forEach(form => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const group = form.dataset.group === 'monthly' ? 'monthly' : 'oneTime';
    const labelEl = form.querySelector('.bdg-add-label');
    const amtEl = form.querySelector('.bdg-add-amt');
    const label = (labelEl?.value || '').trim();
    if (!label) { labelEl?.focus(); return; }
    const amount = clampInt(amtEl?.value);
    const s = load();
    s.custom = (s.custom && typeof s.custom === 'object') ? s.custom : { oneTime: [], monthly: [] };
    if (!Array.isArray(s.custom[group])) s.custom[group] = [];
    s.custom[group].push({ id: 'bdg' + Date.now(), label, amount });
    save(s);
    render();
  }));
}

// which custom group (if any) owns this id — used to route edits/removes
function findCustom(state, id) {
  const c = state.custom;
  if (!c || typeof c !== 'object') return null;
  if (Array.isArray(c.oneTime) && c.oneTime.some(x => x && x.id === id)) return 'oneTime';
  if (Array.isArray(c.monthly) && c.monthly.some(x => x && x.id === id)) return 'monthly';
  return null;
}
