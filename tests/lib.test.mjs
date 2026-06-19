'use strict';
// Unit tests for the pure lib modules. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseISO, daysBetween, daysUntil, countdown, windowStatus, fmtShort } from '../docs/assets/lib/dates.js';
import { computeAlerts, alertCount } from '../docs/assets/lib/notify.js';
import { toICS, parseICS, gcalUrl } from '../docs/assets/lib/ics.js';

const TODAY = '2026-06-15';
const ARRIVAL = '2026-06-30';

test('parseISO rejects junk, accepts ISO', () => {
  assert.equal(parseISO('nope'), null);
  assert.equal(parseISO(''), null);
  assert.ok(parseISO('2026-06-30'));
});

test('daysBetween / daysUntil are signed and tz-stable', () => {
  assert.equal(daysBetween('2026-06-15', '2026-06-30'), 15);
  assert.equal(daysBetween('2026-06-30', '2026-06-15'), -15);
  assert.equal(daysUntil(ARRIVAL, TODAY), 15);
});

test('countdown flips from before → arrived', () => {
  assert.deepEqual(countdown(ARRIVAL, TODAY), { days: 15, phase: 'before', label: '15 days to NRT' });
  assert.equal(countdown(ARRIVAL, '2026-06-29').label, '1 day to NRT');
  assert.equal(countdown(ARRIVAL, ARRIVAL).phase, 'arrived');
  assert.equal(countdown(ARRIVAL, '2026-07-04').label, 'Day 5 in Japan');
});

test('windowStatus buckets correctly (the as-of overdue logic)', () => {
  assert.equal(windowStatus('2026-06-10', TODAY), 'overdue');
  assert.equal(windowStatus('2026-06-16', TODAY), 'due-soon');
  assert.equal(windowStatus('2026-06-18', TODAY), 'due-soon');
  assert.equal(windowStatus('2026-06-25', TODAY), 'upcoming');
  assert.equal(windowStatus('2026-09-01', TODAY), 'later');
  assert.equal(windowStatus('', TODAY), 'none');
});

test('computeAlerts sorts by severity then days, drops later + dismissed', () => {
  const items = [
    { id: 'a', title: 'overdue thing', when: '2026-06-10' },
    { id: 'b', title: 'soon', when: '2026-06-17' },
    { id: 'c', title: 'upcoming', when: '2026-06-28' },
    { id: 'd', title: 'far', when: '2026-12-01' },
    { id: 'e', title: 'no date' },
  ];
  const a = computeAlerts(items, TODAY);
  assert.deepEqual(a.map(x => x.id), ['a', 'b', 'c']);
  assert.equal(a[0].severity, 'overdue');
  assert.equal(alertCount(items, TODAY, ['a']), 2);
});

test('toICS → parseICS round-trips an all-day event', () => {
  const ev = [{ id: 'x1', title: 'Sumida Hanabi', date: '2026-07-25', area: 'Asakusa', category: 'fireworks', bookingNotes: 'Arrive early; comma, and; semicolon test' }];
  const ics = toICS(ev);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260725/);
  const back = parseICS(ics);
  assert.equal(back.length, 1);
  assert.equal(back[0].title, 'Sumida Hanabi');
  assert.equal(back[0].date, '2026-07-25');
  assert.equal(back[0].area, 'Asakusa');
  assert.match(back[0].note, /semicolon test/);
});

test('multi-day event end date is exclusive next-day', () => {
  const ics = toICS([{ id: 'c1', title: 'Comiket', date: '2026-08-15', endDate: '2026-08-16' }]);
  assert.match(ics, /DTEND;VALUE=DATE:20260817/);
});

test('parseICS rejects an impossible DTEND instead of rolling it over', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Bad end\r\nDTSTART;VALUE=DATE:20260110\r\nDTEND;VALUE=DATE:20260145\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const back = parseICS(ics);
  assert.equal(back.length, 1);
  assert.equal(back[0].date, '2026-01-10');
  assert.equal(back[0].endDate, '');   // impossible end dropped → single-day
});

test('gcalUrl builds a template link', () => {
  const u = gcalUrl({ title: 'teamLab', date: '2026-07-10', area: 'Toyosu' });
  assert.match(u, /calendar\.google\.com/);
  assert.match(u, /dates=20260710%2F20260711/);
  assert.match(u, /text=teamLab/);
});

import { reorderIds } from '../docs/assets/dnd.js';
test('reorderIds moves an id before/after a target', () => {
  assert.deepEqual(reorderIds(['a','b','c'], 'a', 'c', true), ['b','c','a']);
  assert.deepEqual(reorderIds(['a','b','c'], 'c', 'a', false), ['c','a','b']);
  assert.deepEqual(reorderIds(['a','b','c'], 'b', null), ['a','c','b']);
  assert.deepEqual(reorderIds(['a','b','c'], 'a', 'a'), ['a','b','c']);
});

import { normalize, slug, catId, upsertInto, deleteFrom } from '../docs/assets/lib/places.js';

test('normalize back-fills new fields, infers coordKind, preserves data', () => {
  const legacy = { id: 'p1', name: 'Old Pin', lat: 35.6, lng: 139.7, eventId: 'e9' };
  const n = normalize(legacy);
  assert.equal(n.source, 'drop');
  assert.equal(n.fav, false);
  assert.equal(n.locked, false);
  assert.equal(n.coordKind, 'exact');           // had numeric coords
  assert.equal(n.eventId, 'e9');                 // existing data wins over defaults
  assert.equal(normalize({ id: 'x', name: 'NoCoords' }).coordKind, 'approx');
});

test('slug + catId are deterministic and url-safe', () => {
  assert.equal(slug('Big Love Records (Harajuku)!'), 'big-love-records-harajuku');
  assert.equal(catId('restaurants', 'Ichiran'), 'cat:restaurants:ichiran');
  assert.equal(catId('restaurants', 'Ichiran'), catId('restaurants', 'Ichiran'));  // stable
});

test('upsertInto is idempotent on repeat star (no duplicate)', () => {
  const rec = { id: 'cat:restaurants:ichiran', name: 'Ichiran', source: 'tabetai', fav: true };
  let arr = upsertInto([], rec);
  assert.equal(arr.length, 1);
  arr = upsertInto(arr, { ...rec, visited: true });   // second press updates, not appends
  assert.equal(arr.length, 1);
  assert.equal(arr[0].visited, true);
  assert.equal(arr[0].fav, true);
});

test('upsertInto does not mutate the input array (immutability)', () => {
  const a = [];
  const b = upsertInto(a, { id: 'z', name: 'Z' });
  assert.equal(a.length, 0);
  assert.equal(b.length, 1);
});

test('deleteFrom honours the lock and reports the removed record', () => {
  const arr = [{ id: 'a', name: 'A', locked: false, eventId: 'e1' }, { id: 'b', name: 'B', locked: true }];
  const ok = deleteFrom(arr, 'a');
  assert.equal(ok.arr.length, 1);
  assert.equal(ok.removed.eventId, 'e1');        // caller uses this to remove the linked event
  const blocked = deleteFrom(arr, 'b');
  assert.equal(blocked.arr.length, 2);           // locked → unchanged
  assert.equal(blocked.removed, null);
});

import { haversineKm, estimateMinutes, format, totalTransit, areaCount } from '../docs/assets/lib/transit.js';
import { newStop, upsertStopIn, removeStopIn, patchStopIn, reorderStopsIn, planToEvents } from '../docs/assets/lib/dayplan.js';

const GEO = { Shinjuku: { lat: 35.69376, lng: 139.70363 }, Shibuya: { lat: 35.66337, lng: 139.6965 },
  Nakano: { lat: 35.70862, lng: 139.66294 }, 'Around Tokyo': { lat: 35.68, lng: 139.74 } };

test('haversineKm: Shinjuku→Shibuya ≈ 3.4km', () => {
  const d = haversineKm(GEO.Shinjuku, GEO.Shibuya);
  assert.ok(d > 3 && d < 4, `got ${d}`);
});
test('estimateMinutes: same area → 10, override pair honoured, scales with distance', () => {
  assert.equal(estimateMinutes('Shibuya', 'Shibuya', GEO), 10);
  assert.equal(estimateMinutes('Nakano', 'Shinjuku', GEO), 16);          // express-corridor override
  assert.ok(estimateMinutes('Shinjuku', 'Shibuya', GEO) > 10);
});
test('format floors at ≈10 and rounds to 5-min buckets', () => {
  assert.equal(format(7), '≈10 min');
  assert.equal(format(23), '≈25 min');
  assert.equal(format(10), '≈10 min');
});
test('totalTransit + areaCount over a stop list', () => {
  const stops = [{ area: 'Shibuya' }, { area: 'Shibuya' }, { area: 'Shinjuku' }];
  assert.equal(areaCount(stops), 2);
  assert.ok(totalTransit(stops, GEO) >= 10);
});

test('dayplan upsertStopIn adds then updates by id (immutable)', () => {
  const s = newStop({ id: 'a', name: 'Disk Union', area: 'Shimokitazawa' });
  let plans = upsertStopIn({}, '2026-07-04', s);
  assert.equal(plans['2026-07-04'].stops.length, 1);
  plans = upsertStopIn(plans, '2026-07-04', { id: 'a', startTime: '13:00' });
  assert.equal(plans['2026-07-04'].stops.length, 1);                     // updated, not appended
  assert.equal(plans['2026-07-04'].stops[0].startTime, '13:00');
  assert.equal(plans['2026-07-04'].stops[0].name, 'Disk Union');         // snapshot preserved
});
test('dayplan reorderStopsIn reorders and keeps unlisted stops', () => {
  let plans = { d: { date: 'd', stops: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } };
  plans = reorderStopsIn(plans, 'd', ['c', 'a', 'b']);
  assert.deepEqual(plans.d.stops.map(s => s.id), ['c', 'a', 'b']);
});
test('dayplan removeStopIn isolates other dates; planToEvents → one all-day event', () => {
  const plans = { d1: { date: 'd1', stops: [{ id: 'x', name: 'X', area: 'Shibuya', startTime: '10:00' }] },
                  d2: { date: 'd2', stops: [{ id: 'y', name: 'Y' }] } };
  const after = removeStopIn(plans, 'd1', 'x');
  assert.equal(after.d1.stops.length, 0);
  assert.equal(after.d2.stops.length, 1);                                // untouched
  const evs = planToEvents({ date: 'd1', title: '', stops: plans.d1.stops });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, 'plan:d1');
  assert.ok(evs[0].note.includes('10:00 X'));
  assert.equal(planToEvents({ date: 'd', stops: [] }).length, 0);        // empty → no event
});

import { readFileSync } from 'node:fs';
import { setPlanMetaIn } from '../docs/assets/lib/dayplan.js';

test('lang parity: every .jp accent in index.html has a glossary entry', () => {
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  const lang = readFileSync(new URL('../docs/assets/lang.js', import.meta.url), 'utf8');
  const accents = [...html.matchAll(/class="jp"[^>]*>([^<]+)</g)].map(m => m[1].trim());
  const missing = [...new Set(accents)].filter(a => !lang.includes(`'${a}'`));
  assert.deepEqual(missing, [], `JP accents missing from the hover-dictionary glossary: ${missing.join(', ')}`);
});

test('routes parity: every ROUTES entry has a #view-<route> section and a nav link', () => {
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  const router = readFileSync(new URL('../docs/assets/router.js', import.meta.url), 'utf8');
  const routes = router.match(/export const ROUTES = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
  const missingView = routes.filter(r => !html.includes(`id="view-${r}"`));
  const missingNav = routes.filter(r => !html.includes(`data-route="${r}"`));
  assert.deepEqual(missingView, [], `routes with no view section: ${missingView}`);
  assert.deepEqual(missingNav, [], `routes with no nav link: ${missingNav}`);
});

test('dayplan patchStopIn updates one field immutably; setPlanMetaIn sets title', () => {
  const plans = { d: { date: 'd', title: '', stops: [{ id: 'a', durationMin: 60 }, { id: 'b', durationMin: 60 }] } };
  const p2 = patchStopIn(plans, 'd', 'a', { durationMin: 90 });
  assert.equal(p2.d.stops[0].durationMin, 90);
  assert.equal(p2.d.stops[1].durationMin, 60);
  assert.equal(plans.d.stops[0].durationMin, 60);            // input unchanged (immutable)
  const p3 = setPlanMetaIn(plans, 'd', { title: 'Akihabara day' });
  assert.equal(p3.d.title, 'Akihabara day');
});

import { directionsUrl, waypointsUrl, groupByArea } from '../docs/assets/lib/directions.js';

test('directionsUrl: Google form omits origin when not a real coord, includes it when present', () => {
  const noOrig = directionsUrl({ to: { lat: 35.66, lng: 139.69 } });
  assert.match(noOrig, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(noOrig, /api=1/);
  assert.ok(!/origin=/.test(noOrig));                       // null/omitted device location → no origin
  assert.match(noOrig, /destination=35\.66%2C139\.69/);

  const withOrig = directionsUrl({ from: { lat: 35.69, lng: 139.70 }, to: { lat: 35.66, lng: 139.69 } });
  assert.match(withOrig, /origin=35\.69%2C139\.7/);
});

test('directionsUrl: transit is default travelmode; honours an override', () => {
  assert.match(directionsUrl({ to: { lat: 1, lng: 2 } }), /travelmode=transit/);
  assert.match(directionsUrl({ to: { lat: 1, lng: 2 }, mode: 'walking' }), /travelmode=walking/);
});

test('directionsUrl: a name destination is handed off as encoded text (not coords)', () => {
  const u = directionsUrl({ to: 'Disk Union, Shinjuku' });
  assert.match(u, /destination=Disk%20Union%2C%20Shinjuku/);
});

test('directionsUrl: ios → Apple Maps form with dirflg=r, saddr only when origin present', () => {
  const cur = directionsUrl({ to: { lat: 35.66, lng: 139.69 }, platform: 'ios' });
  assert.match(cur, /^https:\/\/maps\.apple\.com\/\?/);
  assert.match(cur, /daddr=35\.66%2C139\.69/);
  assert.match(cur, /dirflg=r/);
  assert.ok(!/saddr=/.test(cur));                           // no origin → current location
  const both = directionsUrl({ from: { lat: 35.69, lng: 139.70 }, to: { lat: 35.66, lng: 139.69 }, platform: 'ios' });
  assert.match(both, /saddr=35\.69%2C139\.7/);
});

test('waypointsUrl: drops coordless stops and reports them', () => {
  const stops = [{ lat: 35.69, lng: 139.70 }, { lat: 35.66, lng: 139.69 }, { name: 'no coords' }, null];
  const r = waypointsUrl(stops);
  assert.equal(r.used, 2);
  assert.equal(r.dropped, 2);                               // the coordless object + the null
  assert.match(r.url, /\/maps\/dir\/35\.69%2C139\.7\/35\.66%2C139\.69\?/);
  assert.match(r.url, /travelmode=transit/);
});

test('waypointsUrl: caps at 9 points and counts the overflow as dropped', () => {
  const stops = Array.from({ length: 12 }, (_, i) => ({ lat: 35 + i * 0.01, lng: 139 + i * 0.01 }));
  const r = waypointsUrl(stops);
  assert.equal(r.used, 9);
  assert.equal(r.dropped, 3);
  const path = r.url.match(/\/maps\/dir\/([^?]+)\?/)[1];
  assert.equal(path.split('/').length, 9);                 // exactly 9 LAT,LNG points in the path
});

test('waypointsUrl: fewer than 2 usable stops → empty url', () => {
  assert.equal(waypointsUrl([{ lat: 1, lng: 2 }]).url, '');
  assert.equal(waypointsUrl([]).url, '');
});

test('groupByArea: groups same-area stops, preserves first-seen + within-area order, no-area trails', () => {
  const stops = [
    { id: 'a', area: 'Shibuya' },
    { id: 'b', area: 'Shinjuku' },
    { id: 'c', area: 'Shibuya' },
    { id: 'd', area: null },
    { id: 'e', area: 'Shinjuku' },
  ];
  const out = groupByArea(stops, (s) => s.area);
  assert.deepEqual(out, ['a', 'c', 'b', 'e', 'd']);         // Shibuya bucket, Shinjuku bucket, then no-area
});

import { placesVisitedStats } from '../docs/assets/lib/placestats.js';

test('placesVisitedStats: counts total/visited and distinct areas (all vs visited)', () => {
  const areaOf = (s) => s.split(':')[0];                    // stub: bucket = text before the colon
  const places = [
    { address: 'Shibuya:1', visited: true },
    { address: 'Shibuya:2', visited: false },
    { area: 'Shinjuku:1', visited: true },
    { address: 'Nakano:1' },                                // unvisited
  ];
  const s = placesVisitedStats(places, areaOf);
  assert.equal(s.total, 4);
  assert.equal(s.visited, 2);
  assert.equal(s.areasTotal, 3);                            // Shibuya, Shinjuku, Nakano
  assert.equal(s.areasVisited, 2);                          // Shibuya, Shinjuku
  assert.deepEqual(placesVisitedStats(null, areaOf), { total: 0, visited: 0, areasTotal: 0, areasVisited: 0 });
});

import { seasonalEgg } from '../docs/assets/easter.js';

// seasonalEgg reads the JST wall clock via UTC getters, so build dates with Date.UTC.
const jst = (y, mo, d, h = 12) => new Date(Date.UTC(y, mo, d, h));

test('seasonalEgg: landing day, sakura, new year, night-owl, else null', () => {
  assert.equal(seasonalEgg(jst(2026, 5, 30)), 'landing');     // 2026-06-30 arrival
  assert.equal(seasonalEgg(jst(2027, 2, 25)), 'sakura');      // late March
  assert.equal(seasonalEgg(jst(2027, 0, 1)), 'newyear');      // Jan 1
  assert.equal(seasonalEgg(jst(2027, 5, 1, 2)), 'nightowl');  // 02:00 JST any day
  assert.equal(seasonalEgg(jst(2027, 5, 1, 12)), null);       // ordinary noon
  assert.equal(seasonalEgg('not a date'), null);
});

import { HOME_LAYOUTS, DEFAULT_HOME_LAYOUT, HOME_LAYOUT_LABELS, normalizeHomeLayout } from '../docs/assets/lib/homelayout.js';

test('normalizeHomeLayout: valid passes through, junk/empty → default', () => {
  for (const l of HOME_LAYOUTS) assert.equal(normalizeHomeLayout(l), l);
  assert.equal(normalizeHomeLayout(''), DEFAULT_HOME_LAYOUT);
  assert.equal(normalizeHomeLayout('nonsense'), DEFAULT_HOME_LAYOUT);
  assert.equal(normalizeHomeLayout(undefined), DEFAULT_HOME_LAYOUT);
  assert.ok(HOME_LAYOUTS.includes(DEFAULT_HOME_LAYOUT));      // default must itself be a valid layout
});

test('home-layout parity: every layout has a label, a CSS rule, and the settings control + store stay in sync', () => {
  const css = readFileSync(new URL('../docs/assets/style.css', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../docs/assets/guide.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../docs/assets/lib/store.js', import.meta.url), 'utf8');

  // 1. every layout has a human label for the segmented control
  const noLabel = HOME_LAYOUTS.filter(l => !HOME_LAYOUT_LABELS[l]);
  assert.deepEqual(noLabel, [], `layouts missing a label: ${noLabel}`);

  // 2. the base layout (default) needs no [data-home] override; every OTHER layout must have CSS
  const needCss = HOME_LAYOUTS.filter(l => l !== DEFAULT_HOME_LAYOUT);
  const missingCss = needCss.filter(l => !css.includes(`[data-home="${l}"]`));
  assert.deepEqual(missingCss, [], `layouts with no CSS rule: ${missingCss}`);

  // 3. the settings control is DERIVED from the canonical list (guide imports it) — can't drift
  assert.ok(guide.includes("from './lib/homelayout.js'"), 'guide.js must import the canonical layout list');
  assert.ok(guide.includes('HOME_LAYOUTS'), 'guide.js must build its control from HOME_LAYOUTS');

  // 4. the persisted key exists in the store
  assert.ok(store.includes('homeLayout:'), 'store.js KEYS must define homeLayout');
});

test('route-title parity: every route has a TITLES entry (drives the sr-only h1)', () => {
  const router = readFileSync(new URL('../docs/assets/router.js', import.meta.url), 'utf8');
  const routes = router.match(/export const ROUTES = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
  const titlesBlock = router.match(/const TITLES = \{([\s\S]*?)\}/)[1];
  const missing = routes.filter(r => !new RegExp(`\\b${r}:`).test(titlesBlock));
  assert.deepEqual(missing, [], `routes missing a TITLES entry: ${missing}`);
});

import {
  yenAmounts, parseYen, parseRent, depositYen, moveInEstimate, monthlyAllIn,
  lineTokens, bookFromAbroad, noGuarantor, womenOnly, searchBlob, enrich, LINE_LABELS,
} from '../docs/assets/lib/rooms.js';

test('parseRent: ranges, compound dorm/private, /night ×30, ¥k shorthand, junk→null', () => {
  assert.deepEqual(parseRent('¥45,000–95,000 / mo'), { monthlyMin: 45000, monthlyMax: 95000, unit: 'mo' });
  assert.deepEqual(parseRent('Dorm ¥40,000–60,000 · private ¥60,000–95,000 / mo'),
    { monthlyMin: 40000, monthlyMax: 95000, unit: 'mo' });
  assert.deepEqual(parseRent('¥3,000–6,000 / night'), { monthlyMin: 90000, monthlyMax: 180000, unit: 'night' });
  assert.deepEqual(parseRent('Share ¥50k+ · 1K apt ¥70,000–120,000 / mo'),
    { monthlyMin: 50000, monthlyMax: 120000, unit: 'mo' });
  assert.deepEqual(parseRent('From ¥40,000 / mo'), { monthlyMin: 40000, monthlyMax: 40000, unit: 'mo' });
  assert.deepEqual(parseRent('Per house'), { monthlyMin: null, monthlyMax: null, unit: 'mo' });
});

test('parseYen / yenAmounts: first amount, ¥0, none→null, k-shorthand', () => {
  assert.equal(parseYen('~¥30,000 contract'), 30000);
  assert.equal(parseYen('¥0'), 0);
  assert.equal(parseYen('Included'), null);
  assert.deepEqual(yenAmounts('¥10,000–22,000 utilities/mo'), [10000, 22000]);
  assert.deepEqual(yenAmounts('avg ~¥54k'), [54000]);
});

test('moveInEstimate: first month + oneTime + deposit; months×rent; unknown→null', () => {
  assert.deepEqual(
    moveInEstimate({ rent: '¥45,000–95,000 / mo', oneTime: '~¥30,000 contract', deposit: 'Low' }),
    { total: 75000, isEstimate: true });
  assert.deepEqual(
    moveInEstimate({ rent: '¥60,000–80,000 / mo', oneTime: '~¥30,000', deposit: '~1 month' }),
    { total: 150000, isEstimate: true });
  assert.deepEqual(
    moveInEstimate({ rent: '¥50,000–90,000 / mo', oneTime: 'No key money', deposit: '¥20,000 (¥10,000 non-refundable)' }),
    { total: 70000, isEstimate: true });
  assert.deepEqual(moveInEstimate({ rent: 'Per house', oneTime: 'Low', deposit: 'Low' }),
    { total: null, isEstimate: true });
});

test('depositYen: ¥ amount wins; ¥0 is zero (not falsy-skipped); months×rent; junk→0', () => {
  assert.equal(depositYen({ deposit: '¥20,000 (¥10,000 non-refundable)' }, 60000), 20000);
  assert.equal(depositYen({ deposit: '¥0' }, 60000), 0);
  assert.equal(depositYen({ deposit: '~2–3 months' }, 60000), 120000);   // low end ×rent
  assert.equal(depositYen({ deposit: 'Low' }, 60000), 0);
  assert.equal(depositYen({ deposit: '~1 month' }, null), 0);            // unknown rent → 0
});

test('monthlyAllIn: rent floor + first fee amount; fees included → rent alone; junk→null', () => {
  assert.equal(monthlyAllIn({ rent: '¥45,000–95,000 / mo', fees: '¥10,000–22,000 utilities/mo' }), 55000);
  assert.equal(monthlyAllIn({ rent: '¥55,000–80,000 / mo', fees: 'Utilities included' }), 55000);
  assert.equal(monthlyAllIn({ rent: 'Per house', fees: '~¥15,000' }), null);
});

test('lineTokens: dictionary match over station + area', () => {
  assert.deepEqual(lineTokens({ station: 'Various', area: 'Nakano, Koenji, Oji, Kuramae' }).sort(),
    ['Asakusa/Kuramae', 'Koenji', 'Nakano'].sort());
  assert.ok(lineTokens({ station: 'Koenji (JR Chuo/Sobu)', area: 'Koenji / Suginami (Chuo line)' }).includes('Chuo line'));
  assert.deepEqual(lineTokens({ station: 'Filter', area: 'All Tokyo' }), []);
  assert.ok(Array.isArray(LINE_LABELS) && LINE_LABELS.length > 0);
});

test('flag derivations: bookFromAbroad / noGuarantor / womenOnly', () => {
  assert.equal(bookFromAbroad({ moveIn: 'Rolling — book from abroad', requirements: [] }), true);
  assert.equal(bookFromAbroad({ moveIn: 'Viewings encouraged', requirements: ['Visa'] }), false);
  assert.equal(noGuarantor({ requirements: ['No guarantor needed'] }), true);
  assert.equal(noGuarantor({ requirements: ['Guarantor company (they arrange)'] }), false);
  assert.equal(womenOnly({ gender: 'women-only' }), true);
  assert.equal(womenOnly({ gender: 'mixed (some women-only rooms)' }), false);
});

test('enrich: adds derived fields, leaves the source object untouched (immutable)', () => {
  const src = [{ id: 'x', name: 'X House', provider: 'P', area: 'Nakano', station: 'Various',
    rent: '¥45,000–95,000 / mo', fees: '~¥10,000', oneTime: '~¥30,000', deposit: 'Low',
    roomType: 'private', gender: 'mixed', noKeyMoney: true, moveIn: 'Rolling — apply online from abroad',
    requirements: ['No guarantor'], note: 'nice' }];
  const out = enrich(src);
  assert.equal(out[0]._allIn, 55000);
  assert.equal(out[0]._moveIn.total, 75000);
  assert.deepEqual(out[0]._price, { monthlyMin: 45000, monthlyMax: 95000, unit: 'mo' });
  assert.ok(out[0]._lines.includes('Nakano'));
  assert.equal(out[0]._bookAbroad, true);
  assert.equal(out[0]._noGuarantor, true);
  assert.equal(out[0]._women, false);
  assert.equal(out[0]._blob.includes('nakano'), true);
  assert.equal(out[0]._blob.includes('private'), true);   // roomType searchable
  assert.equal(out[0]._blob.includes('mixed'), true);     // gender searchable
  assert.equal(src[0]._allIn, undefined);
});
