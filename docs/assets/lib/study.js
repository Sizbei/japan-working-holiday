'use strict';
// Pure SRS engine for #/study — FSRS-lite scheduler, stage ladder + mastery gate, queue
// builder with debt protection, seed import, session helpers. 100% pure: no DOM, no
// localStorage, no Date.now() — every function takes `now` in ms; the only randomness is a
// deterministic id hash. Every function returns NEW state; nothing is mutated in place.
// Node-import-safe and unit-tested from the repo root (see tests/lib.test.mjs).

// ── Memory model (FSRS-lite) ─────────────────────────────────────────────────
// Retrievability R(t,S) = (1 + (19/81)·t/S)^(−0.5), with t and S measured in DAYS. A useful
// property of this curve: at desired retention 0.90 the solved next interval equals S exactly
// (nextInterval(S) === S below), so a card seen "on schedule" is seen at ~90% recall — the
// stability S literally *is* the 90%-retention interval in days.
const FACTOR = 19 / 81;         // power-law decay factor
const RETENTION = 0.90;         // desired retention (fixed)
const GROWTH = 1.2;             // success stability-growth constant (tunable ≤1.6 — see sim)
const DAY = 86400000;           // ms per day
const MIN = 60000;              // ms per minute
const CURRENT_V = 2;            // store schema version

// First-rating table, indexed by grade g∈{1,2,3,4} → S0[g−1]; D0 = clamp(5 − 1.5·(g−3), 1, 10).
const S0 = [0.4, 0.6, 2.4, 5.8];
// Success "hardness" multiplier h by grade: Hard 0.6 / Good 1.0 / Easy 1.6.
const H = { 2: 0.6, 3: 1.0, 4: 1.6 };
// Ghost (◆ relearn ladder) fixed steps — cycled until 2 consecutive passes exit the ladder.
// Relearn steps for ghosts: 10min then 1d; the exit (2 clean passes) sets S = max(S, 3),
// i.e. a ~3-day next interval — the ladder's final rung, expressed through S.
const GHOST_STEPS = [10 * MIN, 1 * DAY];
// Leech thresholds.
const LEECH_AT = 5, SUSPEND_AT = 8;
// Stability floor (days) for the Deep stage — also the ceiling a failed gate demotes back below.
const DEEP_MIN = 21;

// Named stage ladder, derived from stability S (Mastered additionally requires the gate).
export const STAGES = ['seed', 'sprout', 'young', 'mature', 'deep', 'mastered'];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Deterministic FNV-1a string hash (no Math.random anywhere in this module).
export function hash(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── Core curve ───────────────────────────────────────────────────────────────
export function retrievability(tDays, S) {
  if (!(S > 0)) return 0;
  return Math.pow(1 + FACTOR * Math.max(0, tDays) / S, -0.5);
}
// Interval (days) to fall to RETENTION from full stability S. At 0.90 this is exactly S.
export function nextInterval(S) {
  return (S / FACTOR) * (Math.pow(RETENTION, -2) - 1);
}

// ── Stage classification ─────────────────────────────────────────────────────
export function stageOf(p) {
  if (!p) return 'seed';
  if (p.gate && p.gate.passed) return 'mastered';
  if (!p.reps || p.S < 1) return 'seed';
  if (p.S < 3) return 'sprout';
  if (p.S < 10) return 'young';
  if (p.S < DEEP_MIN) return 'mature';
  return 'deep';
}

// ── Grading arbitration (the session contract) ───────────────────────────────
// One precedence chain, no ambiguity:
//   typed wrong → 1 (Again) regardless of anything else;
//   reveal hint → 1;
//   closeAccepted (Levenshtein-≤1 accept) caps at 2 (Hard);
//   gloss/structure hint caps at 3 (Good); kana hint caps at 2 (Hard);
//   otherwise the chosen Hard/Good/Easy button (2/3/4).
export function effectiveGrade({ typedCorrect, closeAccepted, hintTier, chosen } = {}) {
  if (typedCorrect === false) return 1;
  if (hintTier === 'reveal') return 1;
  let cap = 4;
  if (closeAccepted) cap = Math.min(cap, 2);
  if (hintTier === 'gloss' || hintTier === 'structure') cap = Math.min(cap, 3);
  if (hintTier === 'kana') cap = Math.min(cap, 2);
  const g = chosen || 3;
  return clamp(Math.min(cap, g), 1, 4);
}

// Gate modality by register, not just level: recognition (timed MCQ/scramble) iff the point is
// N1 OR carries the `written-formal` flag; typed production otherwise.
export function gateMode(point, meta = {}) {
  const flags = meta.flags || [];
  if (meta.level === 'N1' || flags.includes('written-formal')) return 'recognition';
  return 'production';
}

// ── State scaffold ───────────────────────────────────────────────────────────
export function newState(now = 0) {
  return {
    v: CURRENT_V,
    points: {},
    session: null,
    units: {},              // per-unit { checkpoint } — reserved for R8 (units are R3's data layer)
    log: [],
    lastSession: now,
    settings: {
      newPerDay: 4, capReviews: 45, weeklyGoal: 5, streak: { count: 0, last: null }, freezes: 2,
      placed: [],           // levels the placement sweep has run for (v2)
      examLevel: null,      // exam-priority lever: null | 'N3' | 'N2' | 'N1' (v2)
    },
  };
}

// Migration scaffold: a chain of v→v+1 upgraders. Each key `n` upgrades a v=n state to v=n+1,
// preserving user data; an unknown/corrupt shape resets to a fresh state so a bad restore can
// never brick boot. v1→v2 adds settings.placed (placement bookkeeping) + settings.examLevel
// (the exam-priority lever) without disturbing points/session/units.
const UPGRADERS = {
  1: (s) => ({ ...s, v: 2, settings: { ...s.settings, placed: [], examLevel: null } }),
};
export function migrate(state, upgraders = UPGRADERS, target = CURRENT_V) {
  if (!state || typeof state !== 'object' || typeof state.v !== 'number') return newState(0);
  let s = state;
  while (s.v !== target && typeof upgraders[s.v] === 'function') s = upgraders[s.v](s);
  if (s.v !== target) return newState(0);   // future/unknown version → fresh
  return s;
}

// ── Internal point updates (return a new point, never mutate) ─────────────────
const setPoint = (state, id, p) => ({ ...state, points: { ...state.points, [id]: p } });

function markLeech(p) {
  const l = p.lapses || 0;
  if (l >= SUSPEND_AT) return { ...p, leech: true, suspended: true };
  if (l >= LEECH_AT) return { ...p, leech: true };
  return p;
}

function applySuccess(p, grade, now) {
  const t = (now - (p.last ?? now)) / DAY;
  const R = retrievability(t, p.S);
  const h = H[grade] || 1.0;
  const S2 = p.S * (1 + GROWTH * (11 - p.D) * Math.pow(p.S, -0.21) * (Math.exp(2.5 * (1 - R)) - 1) * h);
  const D2 = clamp((p.D - 0.5 * (grade - 3)) * 0.98 + 5 * 0.02, 1, 10);
  return { ...p, S: S2, D: D2, last: now, reps: (p.reps || 0) + 1, due: now + nextInterval(S2) * DAY, defers: 0 };
}

function applyFail(p, now) {
  const S2 = Math.max(0.3, 0.4 * Math.pow(p.S, 0.6));   // stability penalty
  return {
    ...p, S: S2, D: clamp(p.D + 1.5, 1, 10), lapses: (p.lapses || 0) + 1,
    last: now, reps: (p.reps || 0) + 1, due: now + 10 * MIN, defers: 0,   // relearn in 10 min
  };
}

// ── review(): apply one graded answer ────────────────────────────────────────
// ans = { pass:bool, grade:1..4, exampleIdx, mode:'review'|'gate' }. Scheduling lives ONLY
// here (never in the session helpers) — that separation is what makes mid-session resume
// idempotent.
export function review(state, id, ans, now) {
  const { pass, grade = 3, exampleIdx = 0, mode = 'review' } = ans || {};
  const existing = state.points[id];

  // First encounter (a lesson's first typed production, or a brand-new id) → Seed via S0/D0.
  if (!existing) {
    const g = pass === false ? 1 : grade;
    const s0 = S0[g - 1], d0 = clamp(5 - 1.5 * (g - 3), 1, 10);
    let p = {
      D: d0, S: s0, last: now, reps: 1, lapses: 0, ghost: null, gate: null,
      leech: false, suspended: false, defers: 0,
      due: pass === false ? now + 10 * MIN : now + nextInterval(s0) * DAY,
    };
    return setPoint(state, id, { ...p, stage: stageOf(p) });
  }

  let p = existing;

  // Ghost (◆) — fixed relearn ladder, ignores FSRS scheduling until 2 consecutive passes.
  if (p.ghost) {
    p = markLeech(applyGhost(p, pass, now));
    return setPoint(state, id, { ...p, stage: stageOf(p) });
  }

  // Gate — only at Deep with mode:'gate'. 3 passes on DISTINCT example indices → Mastered;
  // any fail resets the passes AND halves S (demoting a freshly-Deep point below Deep).
  if (mode === 'gate' && stageOf(p) === 'deep') {
    const np = applyGate(p, pass, grade, exampleIdx, now);
    return setPoint(state, id, { ...np, stage: stageOf(np) });
  }

  // Normal review. An out-of-contract lapse (a Deep point failed in mode:'review') still
  // voids in-progress gate passes — a lapse must never leave the gate one pass from Mastered.
  let np = pass ? applySuccess(p, grade, now) : applyFail(p, now);
  if (!pass && np.gate && !np.gate.passed && (np.gate.passes || []).length) np = { ...np, gate: { passes: [] } };
  np = markLeech(np);
  return setPoint(state, id, { ...np, stage: stageOf(np) });
}

function applyGhost(p, pass, now) {
  if (!pass) return {
    ...p, ghost: { step: 0, streak: 0 }, lapses: (p.lapses || 0) + 1, D: clamp(p.D + 1.5, 1, 10),
    last: now, reps: (p.reps || 0) + 1, due: now + GHOST_STEPS[0], defers: 0,
  };
  const streak = (p.ghost.streak || 0) + 1;
  if (streak >= 2) {                        // exit the ladder → S≥3 (~3d), back to FSRS
    const S = Math.max(p.S || 0, 3);
    return { ...p, ghost: null, S, last: now, reps: (p.reps || 0) + 1, due: now + nextInterval(S) * DAY, defers: 0 };
  }
  const step = Math.min((p.ghost.step || 0) + 1, GHOST_STEPS.length - 1);
  return { ...p, ghost: { step, streak }, last: now, reps: (p.reps || 0) + 1, due: now + GHOST_STEPS[step], defers: 0 };
}

function applyGate(p, pass, grade, exampleIdx, now) {
  if (pass) {
    const np = applySuccess(p, grade, now);
    const passes = (p.gate && p.gate.passes) ? p.gate.passes.slice() : [];
    if (!passes.includes(exampleIdx)) passes.push(exampleIdx);
    return { ...np, gate: passes.length >= 3 ? { passes, passed: true } : { passes } };
  }
  // passes reset + S·0.5 — a real setback that forces a re-climb before the next attempt.
  const np = applyFail(p, now);
  return markLeech({ ...np, S: p.S * 0.5, gate: { passes: [] }, due: now + 10 * MIN });
}

// ── Queue builder ────────────────────────────────────────────────────────────
// Reorder ids so no two identical entries sit adjacent (relearn/ghost re-queues). Unique
// lists are returned untouched, preserving the retrievability sort.
export function interleave(ids) {
  if (new Set(ids).size === ids.length) return ids.slice();
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const out = [];
  let last = null;
  for (let i = 0; i < ids.length; i++) {
    let best = null, bestC = -1;
    for (const [id, c] of counts) if (c > 0 && id !== last && c > bestC) { best = id; bestC = c; }
    if (best === null) for (const [id, c] of counts) if (c > 0) { best = id; break; }   // only `last` left
    out.push(best); counts.set(best, counts.get(best) - 1); last = best;
  }
  return out;
}

// Persist one deferral of a card to tomorrow (caller applies buildQueue().deferred).
export function deferCard(state, id, now) {
  const p = state.points[id];
  if (!p) return state;
  return setPoint(state, id, { ...p, defers: (p.defers || 0) + 1, due: now + DAY });
}

// buildQueue(state, now, {coSchedule}) → { reviews:[ids], lessons:n, deferred:[ids] }.
// Due-first sorted by retrievability ascending (most forgotten first), suspended excluded.
// Cap = settings.capReviews (45); overflow defers to tomorrow, but a card defers at most
// twice — the 3rd time it force-enters over cap so chronic deferral can't rot into a hidden
// debt spiral. Drip throttles to 0 when the day is already ≥80% of cap.
export function buildQueue(state, now, opts = {}) {
  const cap = state.settings.capReviews;
  const related = opts.coSchedule || null;

  const due = [];
  for (const [id, p] of Object.entries(state.points)) {
    if (p.suspended) continue;
    if (p.due != null && p.due <= now) due.push(id);
  }
  const R = (id) => {
    const p = state.points[id];
    return retrievability((now - (p.last ?? now)) / DAY, p.S || 0.4);
  };
  due.sort((a, b) => R(a) - R(b));
  const dueCount = due.length;

  const reviews = [], deferred = [];
  for (const id of due) {
    if (reviews.length < cap) reviews.push(id);
    else if ((state.points[id].defers || 0) >= 2) reviews.push(id);   // force-entry on the 3rd
    else deferred.push(id);
  }

  // Co-schedule: pull related ids due within 2 days into today, but only under cap.
  if (related && reviews.length < cap) {
    const soon = now + 2 * DAY, inR = new Set(reviews);
    for (const id of reviews.slice()) {
      for (const rid of (related[id] || [])) {
        if (reviews.length >= cap) break;
        const rp = state.points[rid];
        if (rp && !rp.suspended && !inR.has(rid) && rp.due != null && rp.due <= soon) {
          reviews.push(rid); inR.add(rid);
        }
      }
    }
  }

  // Drip throttle: a day-level valve, not a deadlock — new lessons pause when due-load crests.
  const lessons = dueCount > 0.8 * cap ? 0 : state.settings.newPerDay;

  return { reviews: interleave(reviews), lessons, deferred };
}

// Lapse amnesty: after ≥3 missed days, re-spread the overdue backlog over the next 7 days
// (deterministic by id hash) instead of dumping it all today — keep only today's most-forgotten
// up to cap. Gap-gated internally, so callers can run it unconditionally at day start.
export function amnesty(state, now) {
  const last = state.lastSession;
  if (last == null || (now - last) < 3 * DAY) return state;
  const cap = state.settings.capReviews;
  const due = [];
  for (const [id, p] of Object.entries(state.points)) {
    if (!p.suspended && p.due != null && p.due <= now) due.push(id);
  }
  if (due.length <= cap) return state;
  const R = (id) => retrievability((now - (state.points[id].last ?? now)) / DAY, state.points[id].S || 0.4);
  due.sort((a, b) => R(a) - R(b));
  let points = { ...state.points };
  for (const id of due.slice(cap)) {               // spread everything past today's cap
    const offset = 1 + (hash(id) % 7);             // 1..7 days out
    points = { ...points, [id]: { ...points[id], due: now + offset * DAY } };
  }
  return { ...state, points };
}

// ── Seed import (existing ✓/◆ state) ─────────────────────────────────────────
// done → Young (S=7, D=5) with due staggered over 21 days so a big cohort doesn't all fall
// due at once (which would throttle the drip to 0 for weeks). shaky → ghost, due within 3 days.
export function seedImport(state, { done = [], shaky = [] } = {}, now = 0) {
  let points = { ...state.points };
  for (const id of done) {
    const p = { D: 5, S: 7, last: now, reps: 1, lapses: 0, ghost: null, gate: null, leech: false, suspended: false, defers: 0, due: now + (1 + (hash(id) % 21)) * DAY };
    points[id] = { ...p, stage: stageOf(p) };
  }
  for (const id of shaky) {
    const p = { D: 6, S: 0.6, last: now, reps: 0, lapses: 1, ghost: { step: 0, streak: 0 }, gate: null, leech: false, suspended: false, defers: 0, due: now + (hash(id) % 3) * DAY };
    points[id] = { ...p, stage: stageOf(p) };
  }
  return { ...state, points };
}

// ── Session helpers (pure; NO scheduling effects — that is the idempotency invariant) ─────
// sessionRecord only appends a display-only result + advances pos; restore is just reading
// state.session and resuming at pos. Scheduling happens exclusively through review().
export function sessionStart(state, queue) {
  const q = Array.isArray(queue) ? queue : (queue && queue.reviews) || [];
  return { ...state, session: { queue: q.slice(), pos: 0, results: [] } };
}
export function sessionRecord(state, result) {
  if (!state.session) return state;
  const s = state.session;
  return { ...state, session: { ...s, results: [...s.results, result], pos: s.pos + 1 } };
}
export function sessionEnd(state) {
  return { ...state, session: null };
}

// ── R3: course-home lesson ordering, unit progress, test-out ─────────────────
const LEVEL_RANK = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const levelOfId = (id) => { const m = /^n([1-5])-/.exec(String(id)); return m ? 'N' + m[1] : null; };

// lessonOrder(unitsList, statePoints, opts) → ordered array of UNSEEDED point ids (a point is
// "seeded" once it exists in statePoints). Walks units level-by-level N5→N1 in unit order;
// within the walk a point's unseeded `related` PREREQUISITES (same or lower level, resolvable to
// a level) are emitted first via a cycle-guarded closure, so a prerequisite is never front-run.
// opts: { examLevel, related }. related is the { id: [relatedIds] } prerequisite map (the pure
// engine can't read the corpus, so the caller supplies it; absent → plain unit order). When
// examLevel is set, that level's units jump to the front of the walk, pulling their unseeded
// prerequisites along (closure) — the exam-priority lever.
export function lessonOrder(unitsList, statePoints = {}, opts = {}) {
  const related = opts.related || {};
  const examLevel = opts.examLevel || null;
  const seeded = (id) => !!statePoints[id];

  const byLevel = { N5: [], N4: [], N3: [], N2: [], N1: [] };
  for (const u of (unitsList || [])) if (byLevel[u.level]) byLevel[u.level].push(u);

  let walk = ['N5', 'N4', 'N3', 'N2', 'N1'];
  if (examLevel && byLevel[examLevel]) walk = [examLevel, ...walk.filter(l => l !== examLevel)];

  const out = [], added = new Set();
  const push = (id, guard) => {
    if (added.has(id) || seeded(id) || guard.has(id)) return;
    guard.add(id);
    const myRank = LEVEL_RANK[levelOfId(id)] ?? 99;
    for (const rid of (related[id] || [])) {
      if (added.has(rid) || seeded(rid)) continue;
      const rRank = LEVEL_RANK[levelOfId(rid)];
      if (rRank == null || rRank > myRank) continue;   // unresolvable / higher-level → not a prereq
      push(rid, guard);
    }
    if (!added.has(id)) { out.push(id); added.add(id); }
  };
  for (const lv of walk) for (const u of byLevel[lv]) for (const id of u.points) push(id, new Set());
  return out;
}

// unitProgress(unit, statePoints) → { introduced, total, state }. introduced = points already in
// state; done = every point introduced. (✓★ gold — the checkpoint-passed decoration — arrives
// with R8; this reports the plain ○ untouched / ● inprogress / ✓ done ladder.)
export function unitProgress(unit, statePoints = {}) {
  const pts = (unit && unit.points) || [];
  const total = pts.length;
  let introduced = 0;
  for (const id of pts) if (statePoints[id]) introduced++;
  const state = introduced === 0 ? 'untouched' : (total > 0 && introduced >= total ? 'done' : 'inprogress');
  return { introduced, total, state };
}

// testOutResult(state, id, passes, now) → pure. `passes` is the array of the timed checks'
// pass/fail booleans. Both (≥2) pass → the point lands at Mature (S=14, D=5, due now+14d): known
// material re-enters at a fortnight, not re-flooding weekly reviews; a false positive fails its
// ~2-week review and demotes normally. Any fail (or too few checks) → state returned UNCHANGED,
// and the caller routes the point into the normal lesson queue (unseeded).
export function testOutResult(state, id, passes, now) {
  const arr = Array.isArray(passes) ? passes : [];
  if (arr.length < 2 || !arr.every(Boolean)) return state;   // any fail → normal lesson path
  const p = {
    D: 5, S: 14, last: now, reps: 2, lapses: 0, ghost: null, gate: null,
    leech: false, suspended: false, defers: 0, due: now + 14 * DAY,
  };
  return setPoint(state, id, { ...p, stage: stageOf(p) });
}
