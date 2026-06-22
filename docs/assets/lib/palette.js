'use strict';
// Pure, DOM-free, network-free index + ranking for the command palette (assets/palette.js).
// buildIndex() flattens the fixed ROUTES + baked tips.json content into one searchable list;
// searchIndex() ranks a query against it. No input mutation; route values come only from the
// fixed ROUTES / hardcoded strings (never the query), so consumers can safely build a hash.
//
// Entry shape: { kind:'route'|'content', label, sub, route, key }

// Pillar arrays → route 'explore' (name → label, detail → sub).
const PILLARS = ['restaurants', 'music', 'geek', 'activities', 'building', 'meetups', 'livemusic', 'disney'];

// buildIndex(data, routeLabels) → flat entry list. routeLabels: { route: label }.
export function buildIndex(data, routeLabels) {
  const d = data || {};
  const labels = routeLabels || {};
  const index = [];

  // one route entry per label
  for (const route of Object.keys(labels)) {
    index.push({ kind: 'route', label: labels[route], sub: '', route, key: 'route:' + route });
  }

  let n = 0;
  const push = (label, sub, route) => {
    const lab = String(label ?? '').trim();
    if (!lab) return;
    index.push({ kind: 'content', label: lab, sub: String(sub ?? ''), route, key: 'c:' + (n++) });
  };

  // pillars → explore
  for (const p of PILLARS) {
    for (const c of (d[p] || [])) push(c && c.name, c && c.detail, 'explore');
  }
  // phrases → phrases (sub carries jp + reading)
  for (const p of (d.phrases || [])) {
    const sub = [p && p.jp, p && p.read].filter(Boolean).join(' · ');
    push(p && p.en, sub, 'phrases');
  }
  // checklist is PHASED: flatten phase.items[] → checklist
  for (const it of (d.checklist || []).flatMap(p => (p && p.items) || [])) {
    push(it && it.task, '', 'checklist');
  }
  // packing → packing
  for (const it of (d.packing || [])) push(it && it.item, '', 'packing');
  // deadlines: bookByTimeline (what) + timeSensitive (item)
  for (const it of (d.bookByTimeline || [])) push(it && it.what, '', 'deadlines');
  for (const it of (d.timeSensitive || [])) push(it && it.item, '', 'deadlines');

  return index;
}

// score one entry against a normalized (lowercased, trimmed) query. 0 = drop.
function scoreOf(entry, q) {
  const label = entry.label.toLowerCase();
  const sub = (entry.sub || '').toLowerCase();
  let s = 0;
  if (label.startsWith(q)) s = 3;
  else if (label.includes(q)) s = 2;
  else if (sub.includes(q)) s = 1;
  if (s === 0) return 0;
  if (entry.kind === 'route') s += 0.5;   // small boost so a route match outranks an incidental content hit
  return s;
}

// searchIndex(index, query, limit=12) → ranked subset. Empty query → just the route entries.
export function searchIndex(index, query, limit = 12) {
  const list = Array.isArray(index) ? index : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.filter(e => e.kind === 'route').slice(0, limit);

  const scored = [];
  for (const e of list) {
    const score = scoreOf(e, q);
    if (score > 0) scored.push({ entry: e, score });
  }
  scored.sort((a, b) =>
    b.score - a.score
    || a.entry.label.length - b.entry.label.length
    || a.entry.label.localeCompare(b.entry.label));
  return scored.slice(0, limit).map(s => s.entry);
}
