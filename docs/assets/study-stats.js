'use strict';
// #/study — R15 Mastery analytics tab + the JLPT Master certificate. The "Progress" face of the
// Grammar Gym: a 353-cell stage heat grid (tap-through to a focused drill), course-% rollups keyed on
// point mastery (gates, NEVER checkpoints), estimated retention today, per-level mock trendlines, a
// weakest-confusable-cluster rollup, and exam-countdown pacing with a one-tap re-pace. All numbers
// come from the pure lib selectors (lib/study.js) — this module owns ONLY the UI. Parked in study.js's
// `activeFlow`, so the shell's delegated click/keydown forward here.
//
// Conventions (binding): every dynamic string through esc(); token spans use .stok, NEVER .jp; focus
// restored after each rebuild; announce() drives the shared #stuLive live region; reduce-motion is
// handled globally in CSS (html[data-reduce-motion="on"] kills every animation/transition) + celebrate()
// self-gates; the heat grid is NOT color-only — each cell dual-encodes stage as a fill-height bar +
// its aria-label carries the stage name. Chunked (rAF-batched) grid fill so 353 cells never block a frame.
// Plan: specs/plans/2026-07-17-grammar-mastery-program.md (R15).

import { esc } from './lib/dom.js';
import { nowISO, fmtDate } from './lib/dates.js';
import {
  courseRollup, isMasterComplete, estimatedRetention, mockTrend, clusterWeakness,
  mockClustersFromLog, paceProjection, repaceNewPerDay, certStats, stageOf, masteryStats, LEVEL_TOTALS,
} from './lib/study.js';
import { celebrate } from './celebrate.js';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const DAY = 86400000;
// The baked JLPT anchor dates (mirrors tips.json / the plan — confidence MEDIUM, "verify closer").
const EXAM_ANCHORS = [
  { iso: '2026-12-06', label: 'Dec 6 2026', target: 'N3' },
  { iso: '2027-07-04', label: 'Jul 4 2027', target: 'N2 / N1' },
];
// The all-gates target the re-pace aims at (the later, achievable sitting; Dec is an N3-only sitting).
const REPACE_TARGET = '2027-07-04';
const PREVIEW_KEY = 'jwh-study-cert-preview';   // set to '1' in localStorage to preview the certificate

// Stage → { rank 0..5, label } for the heat grid's dual (color + fill-height + aria) encoding.
const STAGE_META = {
  none: { rank: -1, label: 'not started' },
  seed: { rank: 0, label: 'Seed' }, sprout: { rank: 1, label: 'Sprout' }, young: { rank: 2, label: 'Young' },
  mature: { rank: 3, label: 'Mature' }, deep: { rank: 4, label: 'Deep (in the gate)' }, mastered: { rank: 5, label: 'Mastered' },
};
const STAGE_ORDER = ['seed', 'sprout', 'young', 'mature', 'deep', 'mastered'];

// startStats(ctx, opts) → the activeFlow controller. ctx: { root, announce, getState, commit,
// pointsCache, units, ensureAllLevels, drill(id), done() }. opts.view === 'cert' opens straight to the
// certificate (the master-complete moment). ensureAllLevels() has already run at the call site so the
// confusable graph + patterns are warm.
export function startStats(ctx, opts = {}) {
  const { root, announce } = ctx;
  let view = opts.view === 'cert' ? 'cert' : 'main';
  let rafId = 0;
  const cancelFill = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } };

  // ── confusable graph → clusters (connected components; the pure clusterWeakness scores them) ──
  function buildClusters() {
    const pc = ctx.pointsCache || {};
    const parent = {};
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };
    for (const id in pc) if (!(id in parent)) parent[id] = id;
    for (const id in pc) {
      const cs = pc[id] && Array.isArray(pc[id].confusable) ? pc[id].confusable : [];
      for (const cid of cs) { if (!(cid in parent)) parent[cid] = cid; union(id, cid); }
    }
    const comps = {};
    for (const id in parent) (comps[find(id)] || (comps[find(id)] = [])).push(id);
    const clusters = [], keyOfId = {};
    for (const root0 in comps) {
      const ids = comps[root0];
      if (ids.length < 2) continue;                       // a lone point is no trap family
      const key = ids.slice().sort()[0];
      const label = ids.map(i => pc[i] && pc[i].pattern).filter(Boolean).slice(0, 3).join(' / ') || key;
      clusters.push({ key, label, ids });
      for (const i of ids) keyOfId[i] = key;
    }
    return { clusters, keyOfId };
  }

  // remap the persisted mock byCluster tallies (keyed by point id) onto the component keys
  function mockByClusterKey(keyOfId, state) {
    const raw = mockClustersFromLog(state), out = {};
    for (const cid in raw) { const k = keyOfId[cid]; if (k) out[k] = (out[k] || 0) + raw[cid]; }
    return out;
  }

  // ── pacing card ──────────────────────────────────────────────────────────────
  function pacingHTML(state, now) {
    const p = paceProjection(state, now);
    if (p.done) {
      return `<section class="stu-pace stu-pace-done" aria-label="Pacing">
        <h4 class="stu-stats-h">Exam pacing</h4>
        <p class="stu-pace-line"><span class="stu-mark-shu" aria-hidden="true">✦</span> <b>All 353 gates passed.</b> Nothing left to project — you're a JLPT grammar master.</p></section>`;
    }
    const projISO = new Date(p.projected).toISOString().slice(0, 10);
    const anchors = EXAM_ANCHORS.map(a => {
      const beats = p.projected <= Date.parse(a.iso + 'T00:00:00Z');
      const state0 = beats ? 'ahead' : 'behind';
      return `<li class="stu-pace-anchor stu-pace-${state0}">
        <span class="stu-pace-anchor-date">${esc(a.label)}</span>
        <span class="stu-pace-anchor-target">${esc(a.target)}</span>
        <span class="stu-pace-anchor-verdict">${beats ? '✓ on pace for all gates' : '✗ all-gates lands after'}</span></li>`;
    }).join('');
    const suggest = repaceNewPerDay(state, REPACE_TARGET, now);
    const cur = (state.settings && state.settings.newPerDay) || 4;
    const repaceBtn = suggest !== cur
      ? `<button type="button" class="stu-btn stu-btn-primary stu-repace" data-act="statsRepace" data-n="${esc(String(suggest))}">
           Re-pace: ${esc(String(cur))} → ${esc(String(suggest))} new/day <span class="stu-cont-sub">(aim for ${esc(fmtDate(REPACE_TARGET))})</span></button>`
      : `<p class="stu-note">Your current pace (${esc(String(cur))} new/day) already lands all gates by ${esc(fmtDate(REPACE_TARGET))}.</p>`;
    return `<section class="stu-pace" aria-label="Exam pacing">
      <h4 class="stu-stats-h">Exam pacing</h4>
      <p class="stu-pace-proj">Projected <b>all-gates-passed</b>: <b class="stu-pace-date">${esc(fmtDate(projISO))}</b>
        <span class="stu-note">(~${esc(String(p.mastered))}/353 mastered · ${esc(String(p.unseeded))} not yet introduced · ${esc(String(cur))} new/day)</span></p>
      <ul class="stu-pace-anchors">${anchors}</ul>
      ${repaceBtn}
      <p class="stu-note stu-pace-caveat">Exam dates are estimates (confidence medium) — verify on jlpt.jp closer to registration. Re-pace only changes your daily new-lesson count, and only when you tap it.</p>
    </section>`;
  }

  // ── course-% rollup (KEYED ON MASTERY / gates, never checkpoints) ──────────────
  function rollupHTML(state) {
    const r = courseRollup(state, ctx.units || []);
    const bars = LEVELS.map(lv => {
      const c = r.perLevel[lv];
      return `<div class="stu-roll-row">
        <span class="stu-roll-lv">${esc(lv)}</span>
        <span class="stu-roll-bar" aria-hidden="true"><i style="width:${c.pct}%"></i></span>
        <span class="stu-roll-n">${esc(String(c.mastered))}/${esc(String(c.total))} <span class="stu-note">(${esc(String(c.pct))}%)</span></span></div>`;
    }).join('');
    return `<section class="stu-roll" aria-label="Course progress">
      <h4 class="stu-stats-h">Course mastery <span class="stu-note">(by point — gates, not checkpoints)</span></h4>
      <div class="stu-roll-overall">
        <span class="stu-roll-overall-pct">${esc(String(r.overall.pct))}%</span>
        <span class="stu-roll-overall-l">${esc(String(r.overall.mastered))} / 353 points mastered overall</span></div>
      ${bars}</section>`;
  }

  // ── estimated retention today ──────────────────────────────────────────────────
  function retentionHTML(state, now) {
    const { mean, n } = estimatedRetention(state, now);
    if (!n) return '';
    const pct = Math.round(mean * 100);
    return `<section class="stu-ret" aria-label="Estimated retention">
      <h4 class="stu-stats-h">Estimated retention today</h4>
      <p class="stu-ret-line"><b class="stu-ret-pct">${esc(String(pct))}%</b>
        <span class="stu-note">average recall across the ${esc(String(n))} points you've started, right now.</span></p></section>`;
  }

  // ── mock trendline sparklines ──────────────────────────────────────────────────
  function sparkline(series) {
    if (series.length < 2) return `<span class="stu-note">${series.length ? esc(String(series[0].pct)) + '%' : 'no mocks yet'}</span>`;
    const W = 120, H = 32, pad = 3;
    const xs = (i) => pad + i * (W - 2 * pad) / (series.length - 1);
    const ys = (v) => H - pad - (v / 100) * (H - 2 * pad);
    const pts = series.map((e, i) => `${xs(i).toFixed(1)},${ys(e.pct).toFixed(1)}`).join(' ');
    const last = series[series.length - 1];
    return `<svg class="stu-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(String(series.length))} mocks, latest ${esc(String(last.pct))} percent">
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${xs(series.length - 1).toFixed(1)}" cy="${ys(last.pct).toFixed(1)}" r="2.5" fill="currentColor"/></svg>`;
  }
  function trendHTML(state) {
    const t = mockTrend(state);
    const rows = LEVELS.filter(lv => t[lv] && t[lv].length).map(lv => {
      const series = t[lv], last = series[series.length - 1];
      return `<div class="stu-trend-row">
        <span class="stu-trend-lv">${esc(lv)}</span>
        <span class="stu-trend-spark">${sparkline(series)}</span>
        <span class="stu-trend-last">${esc(String(last.pct))}% <span class="stu-note">(${esc(String(series.length))} mock${series.length === 1 ? '' : 's'})</span></span></div>`;
    }).join('');
    if (!rows) return `<section class="stu-trend" aria-label="Mock trend"><h4 class="stu-stats-h">Mock trend</h4>
      <p class="stu-note">No mock exams logged yet — run one from the course home (試 Mock exam) to start the trendline.</p></section>`;
    return `<section class="stu-trend" aria-label="Mock trend"><h4 class="stu-stats-h">Mock trend <span class="stu-note">(grammar half, directional)</span></h4>${rows}</section>`;
  }

  // ── weakest confusable clusters ────────────────────────────────────────────────
  function weaknessHTML(state, clusters, keyOfId) {
    const weak = clusterWeakness(clusters, state.points || {}, mockByClusterKey(keyOfId, state)).slice(0, 6);
    if (!weak.length) return `<section class="stu-weak" aria-label="Weak clusters"><h4 class="stu-stats-h">Trap families to drill</h4>
      <p class="stu-note">No confusable clusters are giving you trouble yet — nice.</p></section>`;
    const rows = weak.map(w => `<div class="stu-weak-row">
      <span class="stu-weak-label" lang="ja">${esc(w.label)}</span>
      <span class="stu-weak-metrics"><span class="stu-note">${esc(String(w.lapses))} lapse${w.lapses === 1 ? '' : 's'}${w.leeches ? ` · ${esc(String(w.leeches))} leech` : ''}${w.mock ? ` · ${esc(String(w.mock))} mock miss${w.mock === 1 ? '' : 'es'}` : ''}</span></span></div>`).join('');
    return `<section class="stu-weak" aria-label="Weak clusters">
      <h4 class="stu-stats-h">Trap families to drill</h4>
      <p class="stu-note">The confusable clusters costing you the most — drill these pairs (nuance duels target exactly these).</p>${rows}</section>`;
  }

  // ── 353-cell mastery heat grid (dual-encoded, chunk-filled) ────────────────────
  function heatShellHTML() {
    // legend: every stage named + a fill sample so the grid is legible WITHOUT color
    const legend = STAGE_ORDER.map(st => {
      const m = STAGE_META[st];
      return `<span class="stu-hc-key"><span class="stu-hc stu-hc-${st}" aria-hidden="true"><i style="height:${(m.rank + 1) / 6 * 100}%"></i></span>${esc(m.label)}</span>`;
    }).join('');
    // Grid semantics (K4b): the visual grid flow-wraps into fluid, viewport-dependent lines, so
    // fabricating a role="row" per visual line would LIE to AT (the row count would change with the
    // window and never match the DOM). The ONE honest, stable grouping is by JLPT level — which is how
    // the grid is already organised — so each level is a single ARIA row inside role="grid", the level
    // header is aria-hidden (its text rides the row's aria-label), and every cell is a role="gridcell".
    // Arrow/Home/End/Page/Ctrl+Home/End nav is a roving-tabindex composite (one tab stop for all 353)
    // driven by onGridKey below; Up/Down move by VISUAL column since the rows wrap.
    const levels = LEVELS.map((lv, i) => `<div class="stu-hc-level" data-level="${lv}" role="rowgroup">
      <div class="stu-hc-level-h" aria-hidden="true">${esc(lv)} <span class="stu-note" data-lvcount>· ${esc(String(LEVEL_TOTALS[lv]))}</span></div>
      <div class="stu-hc-grid" data-grid="${lv}" role="row" aria-rowindex="${i + 1}" aria-label="${esc(lv)}, ${esc(String(LEVEL_TOTALS[lv]))} points"></div></div>`).join('');
    return `<section class="stu-heat" aria-label="Mastery heat grid">
      <h4 class="stu-stats-h" id="stuHcH">Mastery map <span class="stu-note">(353 points · arrow keys to move, Enter to drill)</span></h4>
      <div class="stu-hc-legend">${legend}</div>
      <div class="stu-hc-grids" role="grid" aria-labelledby="stuHcH" aria-rowcount="${LEVELS.length}">${levels}</div>
      <div class="stu-hc-detail" id="stuHcDetail" role="status" aria-live="polite"></div>
    </section>`;
  }

  // Build the ordered cell descriptors (by level → unit order) and fill each level's grid in rAF batches.
  function fillHeat(state) {
    const pc = ctx.pointsCache || {}, pts = state.points || {};
    const units = ctx.units || [];
    // level → ordered ids: walk the unit map (syllabus order), then append any corpus id not in a unit.
    const byLevel = {}; LEVELS.forEach(l => byLevel[l] = []);
    const seen = new Set();
    for (const u of units) if (byLevel[u.level]) for (const id of (u.points || [])) if (!seen.has(id)) { byLevel[u.level].push(id); seen.add(id); }
    for (const id in pc) { const lv = pc[id] && pc[id].level; if (byLevel[lv] && !seen.has(id)) { byLevel[lv].push(id); seen.add(id); } }

    const cellHTML = (id) => {
      const seeded = pts[id];
      const st = seeded ? stageOf(seeded) : 'none';
      const m = STAGE_META[st] || STAGE_META.none;
      const pat = (pc[id] && pc[id].pattern) || id;
      const fill = m.rank >= 0 ? (m.rank + 1) / 6 * 100 : 0;
      // role="gridcell" on the <button>: a focusable cell (native Enter/Space still fires click →
      // hcCell, independent of the role override). tabindex="-1" for the roving pattern — fillHeat
      // promotes the very first cell to 0 once it mounts.
      return `<button type="button" role="gridcell" tabindex="-1" class="stu-hc stu-hc-${st}" data-act="hcCell" data-id="${esc(id)}" title="${esc(pat)} — ${esc(m.label)}" aria-label="${esc(pat)}, ${esc(m.label)}"><i style="height:${fill.toFixed(0)}%"></i></button>`;
    };

    // queue: [{ grid, html }] flattened, filled in batches of 64
    const queue = [];
    for (const lv of LEVELS) { const grid = root.querySelector(`[data-grid="${lv}"]`); if (grid) for (const id of byLevel[lv]) queue.push({ grid, html: cellHTML(id) }); }
    let i = 0;
    const BATCH = 64;
    const step = () => {
      const end = Math.min(i + BATCH, queue.length);
      // group consecutive same-grid appends into one insertAdjacentHTML for fewer reflows
      let buf = '', gridEl = end > i ? queue[i].grid : null;
      for (let k = i; k < end; k++) {
        if (queue[k].grid !== gridEl) { if (gridEl) gridEl.insertAdjacentHTML('beforeend', buf); buf = ''; gridEl = queue[k].grid; }
        buf += queue[k].html;
      }
      if (gridEl && buf) gridEl.insertAdjacentHTML('beforeend', buf);
      i = end;
      if (i < queue.length) rafId = requestAnimationFrame(step); else rafId = 0;
    };
    if (queue.length) {
      step();                                    // first batch is synchronous → the first cell now exists
      const first = gridCells()[0];              // promote it to the single tab stop (roving init)
      if (first) first.tabIndex = 0;
    }
  }

  // ── heat-grid roving tabindex (K4b) ────────────────────────────────────────────
  // The 353 cells are ONE tab stop; named keys move the active cell + roll the `0`. All keys here are
  // WCAG-2.1.4-EXEMPT (arrows / Home / End / PageUp/Down / Ctrl+Home/End — never bare printable chars),
  // so onGridKey lives on the grid container (fires before study.js's root handler and stopPropagation-s)
  // and stays live even when the shortcut toggle is off. Enter/Space are NOT handled here — the native
  // <button> activation opens the cell (delegated click → hcCell), so a keydown handler would double-fire.
  const gridCells = () => [...root.querySelectorAll('.stu-hc-grid .stu-hc')];

  function focusCell(cells, idx) {
    if (!cells.length) return;
    idx = Math.max(0, Math.min(cells.length - 1, idx));
    const prev = root.querySelector('.stu-hc-grid .stu-hc[tabindex="0"]');
    if (prev) prev.tabIndex = -1;
    const c = cells[idx];
    c.tabIndex = 0;
    c.focus({ preventScroll: true });
    c.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }

  // Up/Down move by VISUAL column: with fluid wrapping there is no logical column, so we read layout
  // rects (viewport coords, consistent across the 5 per-level containers) and step to the nearest cell
  // one visual line up/down, matching x as closely as possible. O(353) per press — negligible.
  function moveVertical(cells, cur, dir) {
    const r = cells[cur].getBoundingClientRect();
    const cx = r.left, cy = r.top;
    let lineTop = null;                          // the top of the immediately adjacent line in `dir`
    for (const cell of cells) {
      const t = cell.getBoundingClientRect().top;
      if (dir < 0) { if (t < cy - 1 && (lineTop === null || t > lineTop)) lineTop = t; }
      else { if (t > cy + 1 && (lineTop === null || t < lineTop)) lineTop = t; }
    }
    if (lineTop === null) return cur;            // already on the top/bottom line
    let best = cur, bestDx = Infinity;
    for (let k = 0; k < cells.length; k++) {
      const rr = cells[k].getBoundingClientRect();
      if (Math.abs(rr.top - lineTop) > 2) continue;   // only cells on the target line
      const dx = Math.abs(rr.left - cx);
      if (dx < bestDx) { bestDx = dx; best = k; }
    }
    return best;
  }

  // level-group anchors for Home/End (this level's ends) and PageUp/Down (jump whole levels).
  function levelBounds(cells, cur) {
    const grid = cells[cur].closest('.stu-hc-grid');
    let start = cur, end = cur;
    while (start > 0 && cells[start - 1].closest('.stu-hc-grid') === grid) start--;
    while (end < cells.length - 1 && cells[end + 1].closest('.stu-hc-grid') === grid) end++;
    return { start, end };
  }
  function levelJump(cells, cur, dir) {
    const { start, end } = levelBounds(cells, cur);
    if (dir > 0) return end < cells.length - 1 ? end + 1 : cur;   // first cell of the next level
    // PageUp: from mid-level land on this level's start first; from the start, jump to the previous level.
    if (cur > start) return start;
    return start > 0 ? levelBounds(cells, start - 1).start : cur;
  }

  function onGridKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const cells = gridCells();
    if (!cells.length) return;                   // guard the chunked mount — nothing to move yet
    let cur = cells.findIndex(c => c === document.activeElement);
    if (cur < 0) cur = cells.findIndex(c => c.tabIndex === 0);
    if (cur < 0) cur = 0;
    const k = e.key;
    let next = null;
    if ((e.ctrlKey || e.metaKey) && k === 'Home') next = 0;
    else if ((e.ctrlKey || e.metaKey) && k === 'End') next = cells.length - 1;
    else if (e.ctrlKey || e.metaKey) return;     // leave other modified combos to the OS/gestures
    else if (k === 'ArrowLeft') next = cur - 1;
    else if (k === 'ArrowRight') next = cur + 1;
    else if (k === 'ArrowUp') next = moveVertical(cells, cur, -1);
    else if (k === 'ArrowDown') next = moveVertical(cells, cur, 1);
    else if (k === 'Home') next = levelBounds(cells, cur).start;
    else if (k === 'End') next = levelBounds(cells, cur).end;
    else if (k === 'PageUp') next = levelJump(cells, cur, -1);
    else if (k === 'PageDown') next = levelJump(cells, cur, 1);
    else return;                                 // Enter/Space fall through to native button activation
    e.preventDefault();
    e.stopPropagation();                         // don't let study.js's root handler / gestures also see it
    focusCell(cells, next);
  }

  function onHcCell(btn) {
    const id = btn.dataset.id;
    const state = ctx.getState();
    const pc = ctx.pointsCache || {};
    const seeded = state.points && state.points[id];
    const st = seeded ? stageOf(seeded) : 'none';
    const m = STAGE_META[st] || STAGE_META.none;
    const p = pc[id];
    const pat = (p && p.pattern) || id;
    const mean = (p && p.meaning) || '';
    const detail = root.querySelector('#stuHcDetail');
    if (!detail) return;
    const canDrill = !!(seeded && p && Array.isArray(p.examples) && p.examples.length);
    detail.innerHTML = `<div class="stu-hc-card">
      <div class="stu-hc-card-main"><span class="stu-hc-card-pat" lang="ja">${esc(pat)}</span>
        <span class="stu-hc-card-mean">${esc(mean)}</span>
        <span class="stu-hc-card-stage stu-hc-stage-${st}">${esc(m.label)}</span></div>
      ${canDrill
        ? `<button type="button" class="stu-btn stu-btn-primary stu-hc-drill" data-act="hcDrill" data-id="${esc(id)}">Drill it now →</button>`
        : `<p class="stu-note">Not introduced yet — it'll arrive through your daily lessons.</p>`}</div>`;
    announce(`${pat}. Stage: ${m.label}.${canDrill ? ' Drill it now available.' : ' Not introduced yet.'}`);
    const b = detail.querySelector('.stu-hc-drill');
    if (b) b.focus({ preventScroll: true });
  }

  // ── certificate (identity-free; real trigger is 353/353, or the preview flag for testing) ──────
  function certificateHTML(state) {
    const cr = courseRollup(state, ctx.units || []);
    const cs = certStats(state);
    const complete = isMasterComplete(state);
    const rings = LEVELS.map(lv => {
      const pct = complete ? 100 : cr.perLevel[lv].pct;
      return `<span class="stu-cert-ring" role="img" aria-label="${esc(lv)} ${esc(String(pct))} percent">
        <b class="stu-cert-ring-lv">${esc(lv)}</b><span class="stu-cert-ring-pct">${esc(String(pct))}%</span></span>`;
    }).join('');
    return `<div class="stu-cert" role="group" aria-label="JLPT Grammar Master certificate">
      <div class="stu-cert-inner">
        <div class="stu-cert-seal stu-mark-shu" aria-hidden="true">✦</div>
        <p class="stu-cert-kicker">Certificate of Mastery</p>
        <h3 class="stu-cert-title" lang="ja">文法マスター</h3>
        <p class="stu-cert-sub">${complete ? 'JLPT Grammar Master — all 353 points mastered' : 'Preview — unlocks at 353 / 353 mastered'}</p>
        <div class="stu-cert-rings">${rings}</div>
        <div class="stu-cert-stats">
          <div class="stu-cert-stat"><span class="stu-cert-stat-n">${esc(String(cs.days))}</span><span class="stu-cert-stat-l">days shown up</span></div>
          <div class="stu-cert-stat"><span class="stu-cert-stat-n">${esc(String(cs.reviews))}</span><span class="stu-cert-stat-l">reviews done</span></div>
          <div class="stu-cert-stat"><span class="stu-cert-stat-n">${esc(String(cs.accuracy))}%</span><span class="stu-cert-stat-l">accuracy</span></div>
        </div>
        <p class="stu-cert-date">Completed ${esc(fmtDate(nowISO()))}</p>
      </div>
    </div>`;
  }

  function renderCert() {
    view = 'cert';
    cancelFill();
    const state = ctx.getState();
    const complete = isMasterComplete(state);
    const preview = !complete;   // reached here without completion → a preview (debug flag / not-yet button)
    root.innerHTML = `<div class="stu-stats-view">
      <div class="stu-stats-top">
        <button type="button" class="stu-btn stu-btn-ghost stu-stats-back" data-act="statsBack">← Back</button>
        <h3 class="stu-stats-title">JLPT Master</h3>
      </div>
      ${preview ? `<p class="stu-note stu-cert-preview-note">Preview — the real certificate unlocks when all 353 points reach Mastered.</p>` : ''}
      ${certificateHTML(state)}
      <div class="stu-cert-foot">
        <button type="button" class="stu-btn stu-btn-primary stu-cert-print" data-act="certPrint"><span aria-hidden="true">印</span> Print / save</button>
        <button type="button" class="stu-btn stu-btn-ghost" data-act="statsBack">Back to progress</button>
      </div>
    </div>`;
    root.querySelector('.stu-stats-back')?.focus({ preventScroll: true });
    announce(complete ? 'JLPT Grammar Master. All 353 points mastered. Certificate ready to print.' : 'Certificate preview.');
  }

  function renderMain() {
    view = 'main';
    cancelFill();
    const state = ctx.getState();
    const now = Date.now();
    const { clusters, keyOfId } = buildClusters();
    const complete = isMasterComplete(state);
    const previewFlag = (() => { try { return localStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; } })();
    const ms = masteryStats(state);
    const certRow = (complete || previewFlag)
      ? `<button type="button" class="stu-btn stu-btn-primary stu-cert-open" data-act="certOpen"><span class="stu-mark-shu" aria-hidden="true">✦</span> ${complete ? 'View your JLPT Master certificate' : 'Preview certificate'} →</button>`
      : `<p class="stu-note stu-cert-locked">JLPT Master certificate unlocks at 353/353 mastered (you're at ${esc(String(Object.values(ms.perLevel).reduce((a, b) => a + b, 0)))}).</p>`;
    root.innerHTML = `<div class="stu-stats-view">
      <div class="stu-stats-top">
        <button type="button" class="stu-btn stu-btn-ghost stu-stats-back" data-act="statsBack">← Course home</button>
        <h3 class="stu-stats-title">Progress</h3>
      </div>
      ${pacingHTML(state, now)}
      ${rollupHTML(state)}
      ${retentionHTML(state, now)}
      ${trendHTML(state)}
      ${weaknessHTML(state, clusters, keyOfId)}
      ${heatShellHTML()}
      <div class="stu-cert-entry">${certRow}</div>
    </div>`;
    root.querySelector('.stu-stats-back')?.focus({ preventScroll: true });
    fillHeat(state);
    // roving-tabindex nav for the heat grid — named keys only, so it's live even with shortcuts off.
    // Self-cleans on the next root.innerHTML rebuild (same lifecycle as K4a's run-container listener).
    root.querySelector('.stu-hc-grids')?.addEventListener('keydown', onGridKey);
    announce('Progress. Mastery analytics, exam pacing, and the mastery map.');
  }

  function doRepace(n) {
    const val = parseInt(n, 10);
    if (!(val >= 1 && val <= 40)) return;
    const state = ctx.getState();
    ctx.commit({ ...state, settings: { ...state.settings, newPerDay: val } });
    renderMain();
    announce(`Re-paced to ${val} new lessons per day.`);
  }

  async function drill(id) {
    // hand back to study.js's focused-drill path (it starts a single-card session + renders it)
    if (ctx.drill) await ctx.drill(id);
  }

  function printCert() {
    document.body.classList.add('stu-cert-printing');
    const clear = () => { document.body.classList.remove('stu-cert-printing'); window.removeEventListener('afterprint', clear); };
    window.addEventListener('afterprint', clear);
    try { window.print(); } catch { clear(); }
    setTimeout(clear, 1500);   // afterprint isn't universal — belt + braces
  }

  // initial paint (opts.view === 'cert' → straight to the celebration certificate)
  if (view === 'cert') {
    renderCert();
    // the master-moment burst (self-gates on reduce-motion / celebrations-off inside celebrate())
    if (isMasterComplete(ctx.getState())) celebrate('✦ JLPT Grammar Master — all 353 points!');
  } else {
    renderMain();
  }

  return {
    teardown() { cancelFill(); },
    onAct(name, btn) {
      switch (name) {
        case 'statsBack': if (view === 'cert') renderMain(); else { cancelFill(); ctx.done(); } break;
        case 'statsRepace': doRepace(btn.dataset.n); break;
        case 'hcCell': onHcCell(btn); break;
        case 'hcDrill': cancelFill(); drill(btn.dataset.id); break;
        case 'certOpen': renderCert(); break;
        case 'certPrint': printCert(); break;
      }
    },
    onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (view === 'cert') renderMain(); else { cancelFill(); ctx.done(); } }
    },
  };
}
