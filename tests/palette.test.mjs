import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, searchIndex } from '../docs/assets/lib/palette.js';

// A small representative routeLabels map (palette.js derives this from ROUTES + routeLabel()).
const routeLabels = {
  dashboard: 'Dashboard', calendar: 'Calendar', deadlines: 'Deadlines',
  checklist: 'Checklist', packing: 'Packing', phrases: 'Phrases',
  explore: 'Explore', budget: 'Budget',
};

// A representative slice of the baked tips.json shape (only the fields buildIndex reads).
const data = {
  restaurants: [{ name: 'Ichiran Ramen', detail: 'Tonkotsu, solo booths' }],
  music: [{ name: 'Tower Records Shibuya', detail: 'CDs and vinyl' }],
  geek: [{ name: 'Mandarake', detail: 'Used anime goods' }],
  activities: [{ name: 'TeamLab Planets', detail: 'Digital art' }],
  building: [{ name: 'Co-working in Tokyo', detail: 'Desk options' }],
  meetups: [{ name: 'Tokyo Indie Devs', detail: 'Monthly meetup' }],
  livemusic: [{ name: 'Shinjuku Loft', detail: 'Live house' }],
  disney: [{ name: 'DisneySea', detail: 'Theme park' }],
  phrases: [{ en: 'Hello / good afternoon', jp: 'こんにちは', read: 'konnichiwa' }],
  checklist: [
    { phase: 'P1', items: [{ task: 'Apply for WHV visa', id: 'c1' }, { task: 'Book flight', id: 'c2' }] },
    { phase: 'P2', items: [{ task: 'Find share house', id: 'c3' }] },
  ],
  packing: [{ item: 'Passport (6+ months validity)' }],
  bookByTimeline: [{ what: 'Sumida River Fireworks grandstand' }],
  timeSensitive: [{ item: 'Collect Residence Card at Narita' }],
};

test('buildIndex produces one route entry per routeLabel, each with a valid route', () => {
  const index = buildIndex(data, routeLabels);
  const routes = index.filter(e => e.kind === 'route');
  assert.equal(routes.length, Object.keys(routeLabels).length);
  for (const r of routes) {
    assert.ok(r.route in routeLabels, `route entry has unknown route: ${r.route}`);
    assert.equal(r.label, routeLabels[r.route]);
    assert.equal(typeof r.key, 'string');
  }
});

test('buildIndex includes content entries with valid target routes', () => {
  const index = buildIndex(data, routeLabels);
  const content = index.filter(e => e.kind === 'content');
  assert.ok(content.length > 0);
  // pillar → explore
  assert.ok(content.some(e => e.label === 'Ichiran Ramen' && e.route === 'explore'));
  assert.ok(content.some(e => e.label === 'Tower Records Shibuya' && e.route === 'explore'));
  assert.ok(content.some(e => e.label === 'DisneySea' && e.route === 'explore'));
  // phrases → phrases (sub carries jp + read)
  const phr = content.find(e => e.label === 'Hello / good afternoon');
  assert.ok(phr && phr.route === 'phrases');
  assert.ok(phr.sub.includes('こんにちは') && phr.sub.includes('konnichiwa'));
  // packing → packing
  assert.ok(content.some(e => e.label.startsWith('Passport') && e.route === 'packing'));
  // deadlines (bookByTimeline + timeSensitive)
  assert.ok(content.some(e => e.label.includes('Fireworks') && e.route === 'deadlines'));
  assert.ok(content.some(e => e.label.includes('Residence Card') && e.route === 'deadlines'));
});

test('buildIndex flattens phased checklist into per-item entries on route checklist', () => {
  const index = buildIndex(data, routeLabels);
  const tasks = index.filter(e => e.kind === 'content' && e.route === 'checklist');
  assert.equal(tasks.length, 3); // 2 + 1 across two phases
  assert.ok(tasks.some(e => e.label === 'Apply for WHV visa'));
  assert.ok(tasks.some(e => e.label === 'Find share house'));
});

test('buildIndex guards missing/undefined content arrays without throwing', () => {
  const index = buildIndex({}, routeLabels);
  // only the route entries survive
  assert.equal(index.filter(e => e.kind === 'content').length, 0);
  assert.equal(index.filter(e => e.kind === 'route').length, Object.keys(routeLabels).length);
});

test('buildIndex does not mutate its inputs', () => {
  const dataCopy = JSON.parse(JSON.stringify(data));
  const labelsCopy = { ...routeLabels };
  buildIndex(data, routeLabels);
  assert.deepEqual(data, dataCopy);
  assert.deepEqual(routeLabels, labelsCopy);
});

test('searchIndex empty query returns just the route entries', () => {
  const index = buildIndex(data, routeLabels);
  const res = searchIndex(index, '');
  assert.equal(res.length, Object.keys(routeLabels).length);
  assert.ok(res.every(e => e.kind === 'route'));
});

test('searchIndex empty query (whitespace) also returns routes only', () => {
  const index = buildIndex(data, routeLabels);
  const res = searchIndex(index, '   ');
  assert.ok(res.every(e => e.kind === 'route'));
});

test('searchIndex: a route startsWith match outranks an incidental content includes match', () => {
  const index = buildIndex(data, routeLabels);
  // "che" → "Checklist" route startsWith; some content may include "che" (none here),
  // but the route must rank first regardless.
  const res = searchIndex(index, 'che');
  assert.equal(res[0].kind, 'route');
  assert.equal(res[0].route, 'checklist');
});

test('searchIndex respects the limit', () => {
  const index = buildIndex(data, routeLabels);
  const res = searchIndex(index, 'o', 3); // broad query, many includes
  assert.ok(res.length <= 3);
});

test('searchIndex default limit caps at 12', () => {
  const index = buildIndex(data, routeLabels);
  const res = searchIndex(index, 'a'); // very broad
  assert.ok(res.length <= 12);
});

test('searchIndex is case-insensitive', () => {
  const index = buildIndex(data, routeLabels);
  const lower = searchIndex(index, 'ichiran');
  const upper = searchIndex(index, 'ICHIRAN');
  assert.ok(lower.some(e => e.label === 'Ichiran Ramen'));
  assert.deepEqual(lower.map(e => e.label), upper.map(e => e.label));
});

test('searchIndex drops below-threshold (no-match) entries', () => {
  const index = buildIndex(data, routeLabels);
  const res = searchIndex(index, 'zzzzzzznomatch');
  assert.equal(res.length, 0);
});

test('searchIndex does not mutate the index', () => {
  const index = buildIndex(data, routeLabels);
  const snapshot = JSON.parse(JSON.stringify(index));
  searchIndex(index, 'ramen');
  assert.deepEqual(index, snapshot);
});

test('searchIndex tie-break: shorter label, then alpha', () => {
  const idx = [
    { kind: 'content', label: 'Apple pie', sub: '', route: 'explore', key: 'k1' },
    { kind: 'content', label: 'Apple', sub: '', route: 'explore', key: 'k2' },
    { kind: 'content', label: 'Apricot', sub: '', route: 'explore', key: 'k3' },
  ];
  const res = searchIndex(idx, 'ap');
  // all startsWith 'ap' (score 3 content). shorter first: 'Apple' (5) < 'Apple pie' (9) < 'Apricot' (7)
  assert.equal(res[0].label, 'Apple');
  assert.equal(res[1].label, 'Apricot');
  assert.equal(res[2].label, 'Apple pie');
});
