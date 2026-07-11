'use strict';
// Unit tests for the pure lib modules. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseISO, daysBetween, daysUntil, countdown, windowStatus, fmtShort } from '../docs/assets/lib/dates.js';
import { computeAlerts, alertCount } from '../docs/assets/lib/notify.js';
import { toICS, parseICS, gcalUrl } from '../docs/assets/lib/ics.js';
import { parseEvent } from '../docs/assets/lib/nlevent.js';

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
  const i18n = readFileSync(new URL('../docs/assets/i18n.js', import.meta.url), 'utf8');   // GLOSSARY moved here from lang.js
  const accents = [...html.matchAll(/class="jp"[^>]*>([^<]+)</g)].map(m => m[1].trim());
  const missing = [...new Set(accents)].filter(a => !i18n.includes(`'${a}'`));
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

// Regressions found by running enrich() over the real 44-record dataset (adversarial review).
test('parseYen: "k" only multiplies a true ¥54k shorthand, never the "k" in a following word', () => {
  assert.equal(parseYen('~¥30,000 key money + cleaning (varies by house)'), 30000);   // was 30,000,000
  assert.equal(parseYen('avg ~¥54k'), 54000);
  assert.equal(parseYen('¥50k+ rooms'), 50000);
  assert.deepEqual(yenAmounts('¥40k–95k'), [40000, 95000]);
});

test('parseRent: discount/avg/maintenance figures after the "/mo" marker do not become the floor', () => {
  assert.deepEqual(parseRent('Share house from ~¥75,000 / mo (opening discount up to ¥7,000/mo off for first 3 months)'),
    { monthlyMin: 75000, monthlyMax: 75000, unit: 'mo' });
  assert.deepEqual(parseRent('¥77,000–79,000 / mo (avg ~¥54k across Social Apt portfolio; this building higher-end)'),
    { monthlyMin: 77000, monthlyMax: 79000, unit: 'mo' });
  assert.deepEqual(parseRent('~¥19,000–67,000+ / mo (studios cluster ¥24,800–41,000) + maintenance ~¥15,000/mo'),
    { monthlyMin: 19000, monthlyMax: 67000, unit: 'mo' });
});

test('noGuarantor: catches "No Japanese guarantor"/"no-guarantor", rejects company-required phrasings', () => {
  assert.equal(noGuarantor({ requirements: ['Passport', 'No Japanese guarantor required'] }), true);
  assert.equal(noGuarantor({ requirements: ['No-guarantor listings filterable directly'] }), true);
  assert.equal(noGuarantor({ requirements: ['Guarantor company (they arrange)'] }), false);
  assert.equal(noGuarantor({ requirements: ['No personal Japanese guarantor — a guarantor company (hosho) is used'] }), false);
});

test('bookFromAbroad: explicit "after arrival only / not bookable from abroad" overrides an "apply online"', () => {
  assert.equal(bookFromAbroad({ moveIn: 'After arrival only — not bookable from abroad', requirements: ['Apply online at a UR center'] }), false);
  assert.equal(bookFromAbroad({ moveIn: 'Rolling — apply online from abroad', requirements: [] }), true);
});

import { monthGrid, addMonths, isoToYM, MONTHS, WEEKDAYS_SHORT } from '../docs/assets/lib/minical.js';

test('monthGrid: full 6x7 rectangle, right in-month count + weekday alignment', () => {
  const g = monthGrid(2026, 6);                 // July 2026 (month is 0-indexed)
  assert.equal(g.length, 6);
  assert.ok(g.every(w => w.length === 7));
  const flat = g.flat();
  assert.equal(flat.length, 42);
  assert.equal(flat.filter(c => c.inMonth).length, 31);   // July has 31 days
  // July 1 2026 is a Wednesday → row 0, column 3
  assert.equal(g[0][3].iso, '2026-07-01');
  assert.equal(g[0][3].inMonth, true);
  assert.equal(g[0][0].iso, '2026-06-28');                // leading Sunday from June
  assert.equal(g[0][0].inMonth, false);
});

test('addMonths wraps year boundaries', () => {
  assert.deepEqual(addMonths(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(addMonths(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths(2026, 5, 0), { year: 2026, month: 5 });
});

test('isoToYM parses and rejects', () => {
  assert.deepEqual(isoToYM('2026-07-01'), { year: 2026, month: 6, day: 1 });
  assert.equal(isoToYM('nope'), null);
  assert.equal(MONTHS[6], 'July');
  assert.equal(WEEKDAYS_SHORT[0], 'Su');
});

import { normalizeTag, setTags, tagsFor, allTags, tagHue } from '../docs/assets/lib/tags.js';

import { parseNominatim } from '../docs/assets/lib/nominatim.js';

test('parseNominatim maps display_name/lat/lon and drops empties', () => {
  const out = parseNominatim([
    { display_name: 'Shinjuku Station, Shinjuku, Tokyo, Japan', lat: '35.69', lon: '139.70' },
    { display_name: '', lat: '0', lon: '0' },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: 'Shinjuku Station', addr: 'Shinjuku Station, Shinjuku, Tokyo, Japan', lat: '35.69', lng: '139.70' });
  assert.deepEqual(parseNominatim(null), []);
});

test('normalizeTag: trims, strips #, strips commas, collapses ws, lowercases, caps length', () => {
  assert.equal(normalizeTag('  #Visa '), 'visa');
  assert.equal(normalizeTag('Ward  Office'), 'ward office');
  assert.equal(normalizeTag('##HOUSING'), 'housing');
  assert.equal(normalizeTag('visa,housing'), 'visa housing');   // commas → space (no commas in stored tags)
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag(null), '');
  assert.equal(normalizeTag('a'.repeat(40)).length, 24);
});

test('setTags: normalizes+dedupes a whole list, deletes when empty', () => {
  assert.deepEqual(setTags({}, 'a', ['#Visa', 'visa', 'Money']), { a: ['visa', 'money'] });
  assert.deepEqual(setTags({ a: ['x'] }, 'a', []), {});
  assert.deepEqual(setTags({ a: ['x'] }, 'a', ['  ']), {});       // all-empty → deleted
});

test('tagsFor / allTags', () => {
  const m = { a: ['money', 'visa'], b: ['visa', 'health'] };
  assert.deepEqual(tagsFor(m, 'a'), ['money', 'visa']);
  assert.deepEqual(tagsFor(m, 'missing'), []);
  assert.deepEqual(allTags(m), ['health', 'money', 'visa']);     // distinct + sorted
  assert.deepEqual(allTags({}), []);
});

test('tagHue: deterministic, in range, stable across calls', () => {
  const h = tagHue('visa');
  assert.equal(h, tagHue('visa'));
  assert.ok(Number.isInteger(h) && h >= 0 && h < 360);
});

test('seed ids all exist in tips.json checklist', () => {
  const data = JSON.parse(readFileSync(new URL('../docs/data/tips.json', import.meta.url)));
  const ids = new Set(data.checklist.flatMap(p => (p.items || []).map(i => i.id)));
  const SEED = ['chk-confirm-whv-eligibility-age-1', 'chk-gather-visa-documents-passpor', 'chk-show-proof-of-funds-in-your-ac', 'chk-book-consulate-appointment-and', 'chk-check-passport-validity-blan', 'chk-lock-the-proof-of-funds-figure-2', 'chk-book-first-week-accommodation-2', 'chk-adhd-ncd-permit'];
  SEED.forEach(id => assert.ok(ids.has(id), `seed id missing: ${id}`));
});

import { eventToGcal, nextDayISO, getMapped, setMapped, forgetCalendar } from '../docs/assets/lib/gcal.js';

test('eventToGcal maps an all-day single + multi-day event with exclusive end', () => {
  assert.deepEqual(eventToGcal({ title: 'Sumida Hanabi', date: '2026-07-25', area: 'Asakusa', note: 'arrive early' }),
    { summary: 'Sumida Hanabi', location: 'Asakusa', description: 'arrive early', start: { date: '2026-07-25' }, end: { date: '2026-07-26' } });
  // multi-day: end is exclusive (Jul 7 stay → end.date Jul 8)
  assert.equal(eventToGcal({ title: 'x', date: '2026-06-30', endDate: '2026-07-07' }).end.date, '2026-07-08');
  assert.equal(nextDayISO('2026-12-31'), '2027-01-01');   // year roll
});

// --- google-sync idempotency logic (tested with a fake api, no network) ---

/**
 * Thin replica of the INSERT-then-PATCH idempotency logic from google-sync.js, driven by
 * an injectable `api` function so we can test it in Node without DOM/fetch/GIS.
 *
 * Logic under test:
 *   • First sync of an event: POST → setMapped → write map
 *   • Second sync of same event: PATCH (uses the stored google id) → no duplicate
 *   • Locally deleted event (in map but not in localIds): DELETE → unmap
 */
async function runSyncWithFakeApi(events, initialMap, fakeApi) {
  let map = { calendarId: 'cal-1', events: {}, ...initialMap };
  const calId = map.calendarId;
  const localIds = new Set(events.map(ev => ev.id));
  const log = [];
  let inserted = 0, updated = 0, deleted = 0;

  for (const ev of events) {
    const body = eventToGcal(ev);
    const googleId = getMapped(map, ev.id);
    if (googleId) {
      await fakeApi('PATCH', `/calendars/${calId}/events/${googleId}`, body);
      log.push({ op: 'PATCH', localId: ev.id, googleId });
      updated++;
    } else {
      const created = await fakeApi('POST', `/calendars/${calId}/events`, body);
      map = setMapped(map, ev.id, created.id);
      log.push({ op: 'POST', localId: ev.id, googleId: created.id });
      inserted++;
    }
  }

  // Deletions for locally-removed events.
  for (const [localId, googleId] of Object.entries(map.events || {})) {
    if (!localIds.has(localId)) {
      await fakeApi('DELETE', `/calendars/${calId}/events/${googleId}`);
      const { [localId]: _, ...rest } = map.events;
      map = { ...map, events: rest };
      log.push({ op: 'DELETE', localId, googleId });
      deleted++;
    }
  }

  return { map, log, inserted, updated, deleted };
}

test('gcal sync: INSERT-then-PATCH idempotency — second sync PATCHes, no duplicate POST', async () => {
  let nextId = 1;
  const calls = [];
  const fakeApi = async (method, path, body) => {
    calls.push({ method, path });
    if (method === 'POST') return { id: `g${nextId++}` };
    return null;
  };

  const events = [{ id: 'local-1', title: 'Hanabi', date: '2026-07-25' }];

  // First sync: no map → POST
  const r1 = await runSyncWithFakeApi(events, { events: {} }, fakeApi);
  assert.equal(r1.inserted, 1);
  assert.equal(r1.updated, 0);
  assert.equal(getMapped(r1.map, 'local-1'), 'g1');
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);

  // Second sync: same event, map already has the google id → PATCH only
  const calls2 = [];
  const fakeApi2 = async (method, path) => { calls2.push({ method, path }); return null; };
  const r2 = await runSyncWithFakeApi(events, r1.map, fakeApi2);
  assert.equal(r2.inserted, 0);
  assert.equal(r2.updated, 1);
  assert.equal(calls2.filter(c => c.method === 'POST').length, 0, 'no second POST — would be a duplicate');
  assert.equal(calls2.filter(c => c.method === 'PATCH').length, 1);
});

test('gcal sync: locally-deleted event is DELETEd from Google and unmapped', async () => {
  const calls = [];
  const fakeApi = async (method, path) => { calls.push({ method, path }); return null; };

  // Map has an event that is no longer in the local events list.
  const initialMap = { events: { 'old-1': 'g-old-1' } };
  const r = await runSyncWithFakeApi([], initialMap, fakeApi);
  assert.equal(r.deleted, 1);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 1);
  assert.equal(getMapped(r.map, 'old-1'), undefined, 'unmapped after deletion');
});

test('gcal sync: forgetCalendar wipes calendarId and event map', () => {
  const m = { calendarId: 'cal-x', events: { 'a': 'g-a' } };
  const cleared = forgetCalendar(m);
  assert.equal(cleared.calendarId, '');
  assert.deepEqual(cleared.events, {});
  // immutable — original unchanged
  assert.equal(m.calendarId, 'cal-x');
});

test('gcal sync: setMapped is immutable — original map not mutated', () => {
  const m = { calendarId: 'cal-1', events: { 'x': 'g-x' } };
  const m2 = setMapped(m, 'y', 'g-y');
  assert.equal(getMapped(m, 'y'), undefined);   // original untouched
  assert.equal(getMapped(m2, 'y'), 'g-y');
  assert.equal(getMapped(m2, 'x'), 'g-x');      // existing entry preserved
});

// ---- natural-language quick-add (parseEvent) ----
const NL = '2026-06-30';   // a Tuesday
test('parseEvent: month-name date + pm time, clean title', () => {
  const r = parseEvent('Ramen with Kenji Jul 3 7pm', NL);
  assert.equal(r.title, 'Ramen with Kenji');
  assert.equal(r.date, '2026-07-03');
  assert.equal(r.time, '19:00');
});
test('parseEvent: relative today/tomorrow', () => {
  assert.equal(parseEvent('Call landlord today', NL).date, '2026-06-30');
  assert.equal(parseEvent('Dentist tomorrow 9am', NL).date, '2026-07-01');
  assert.equal(parseEvent('Dentist tomorrow 9am', NL).time, '09:00');
});
test('parseEvent: weekday resolves forward; "next" adds a week', () => {
  assert.equal(parseEvent('Gym friday', NL).date, '2026-07-03');   // Tue -> coming Fri
  assert.equal(parseEvent('Gym next friday', NL).date, '2026-07-10');
  assert.equal(parseEvent('Trash tuesday', NL).date, '2026-06-30'); // same weekday = today
});
test('parseEvent: ISO and numeric M/D, past date rolls to next year', () => {
  assert.equal(parseEvent('Flight 2026-07-11', NL).date, '2026-07-11');
  assert.equal(parseEvent('Viewing 7/2', NL).date, '2026-07-02');
  assert.equal(parseEvent('Party 1/5', NL).date, '2027-01-05');    // Jan already past -> next year
});
test('parseEvent: 24h time, no date defaults to today', () => {
  const r = parseEvent('Standup 09:30', NL);
  assert.equal(r.time, '09:30');
  assert.equal(r.date, '2026-06-30');
  assert.equal(r.title, 'Standup');
});
test('parseEvent: title-only, empty input safe', () => {
  assert.equal(parseEvent('Buy futon', NL).title, 'Buy futon');
  assert.equal(parseEvent('Buy futon', NL).date, '2026-06-30');
  const e = parseEvent('', NL);
  assert.equal(e.title, '');
  assert.equal(e.date, '2026-06-30');
});

// ---- lib/checklist.js applyPhaseMoves (cross-phase drag re-homing) ----
import { applyPhaseMoves } from '../docs/assets/lib/checklist.js';

const GROUPS = () => [
  { key: '0', items: [{ id: 'a' }, { id: 'b' }] },
  { key: '1', items: [{ id: 'c' }] },
  { key: 'mine', items: [{ id: 'x' }] },
];
test('applyPhaseMoves: re-homes a baked item into another phase', () => {
  const out = applyPhaseMoves(GROUPS(), { a: '1' });
  assert.deepEqual(out[0].items.map(i => i.id), ['b']);
  assert.deepEqual(out[1].items.map(i => i.id), ['c', 'a']);
});
test('applyPhaseMoves: moves into and out of the mine group', () => {
  const out = applyPhaseMoves(GROUPS(), { b: 'mine', x: '0' });
  assert.deepEqual(out[2].items.map(i => i.id), ['b']);
  assert.deepEqual(out[0].items.map(i => i.id), ['a', 'x']);
});
test('applyPhaseMoves: stale/unknown targets and same-group moves are no-ops', () => {
  const out = applyPhaseMoves(GROUPS(), { a: '9', c: '1', ghost: '0' });
  assert.deepEqual(out.map(g => g.items.map(i => i.id)), [['a', 'b'], ['c'], ['x']]);
});
test('applyPhaseMoves: does not mutate its input', () => {
  const g = GROUPS();
  applyPhaseMoves(g, { a: '1' });
  assert.deepEqual(g[0].items.map(i => i.id), ['a', 'b']);
});

// ---- lib/weather.js (Open-Meteo parse + WMO labels) ----
import { parseWeather, wmoInfo } from '../docs/assets/lib/weather.js';

test('parseWeather: maps a real Open-Meteo body to the view model', () => {
  const w = parseWeather({
    current: { temperature_2m: 22.6, apparent_temperature: 26.5, weather_code: 2 },
    daily: { temperature_2m_max: [29.1], temperature_2m_min: [21.8], precipitation_probability_max: [40] },
  });
  assert.deepEqual(w, { sunrise: null, sunset: null, temp: 23, feels: 27, code: 2, hi: 29, lo: 22, rainPct: 40 });
});
test('parseWeather: wrong/empty shapes return null; missing daily degrades to nulls', () => {
  assert.equal(parseWeather(null), null);
  assert.equal(parseWeather({}), null);
  assert.equal(parseWeather({ current: { temperature_2m: 'hot' } }), null);
  const w = parseWeather({ current: { temperature_2m: 30 } });
  assert.equal(w.temp, 30);
  assert.equal(w.hi, null);
  assert.equal(w.rainPct, null);
});
test('wmoInfo: known and unknown codes', () => {
  assert.equal(wmoInfo(0).label, 'Clear');
  assert.equal(wmoInfo(95).emoji, '⛈');
  assert.equal(wmoInfo(1234).label, 'Weather');
});

// ---- lib/quakes.js + lib/rates.js ----
import { parseQuakes, shindo } from '../docs/assets/lib/quakes.js';
import { parseUsdPerJpy } from '../docs/assets/lib/rates.js';

test('parseQuakes: maps rows, drops malformed, labels shindo/tsunami', () => {
  const q = parseQuakes([
    { earthquake: { time: '2026/07/02 13:48:00', maxScale: 45, domesticTsunami: 'Watch', hypocenter: { name: '青森県東方沖', magnitude: 4.5 } } },
    { earthquake: { hypocenter: {} } },
    null,
  ]);
  assert.equal(q.length, 1);
  assert.deepEqual(q[0], { time: '2026/07/02 13:48:00', name: '青森県東方沖', mag: 4.5, shindo: '5弱', tsunami: true });
  assert.equal(shindo(20), '2');
  assert.equal(shindo(99), null);
});
test('parseUsdPerJpy: success shape only', () => {
  assert.equal(parseUsdPerJpy({ result: 'success', rates: { USD: 0.00615 } }), 0.00615);
  assert.equal(parseUsdPerJpy({ result: 'error' }), null);
  assert.equal(parseUsdPerJpy({ result: 'success', rates: { USD: '0.006' } }), null);
  assert.equal(parseUsdPerJpy(null), null);
});
test('parseWeather: sunrise/sunset HH:MM extraction + absence', () => {
  const w = parseWeather({ current: { temperature_2m: 25 }, daily: { sunrise: ['2026-07-02T04:28'], sunset: ['2026-07-02T19:01'] } });
  assert.equal(w.sunrise, '04:28');
  assert.equal(w.sunset, '19:01');
  assert.equal(parseWeather({ current: { temperature_2m: 25 } }).sunrise, null);
});

// ---- lib/wiki.js (Wikipedia geosearch parse) ----
import { parseGeoSearch } from '../docs/assets/lib/wiki.js';

test('parseGeoSearch: maps, sorts by distance, drops malformed, encodes URL', () => {
  const r = parseGeoSearch({ query: { geosearch: [
    { title: 'Kita-Ayase Station', dist: 1092.1 },
    { title: 'Aoi Station', dist: 672 },
    { notitle: true },
  ] } });
  assert.equal(r.length, 2);
  assert.equal(r[0].title, 'Aoi Station');
  assert.equal(r[0].dist, 672);
  assert.equal(r[1].url, 'https://en.wikipedia.org/wiki/Kita-Ayase%20Station'.replace('%20', '_') === r[1].url ? r[1].url : 'https://en.wikipedia.org/wiki/Kita-Ayase_Station');
  assert.deepEqual(parseGeoSearch({}), []);
  assert.deepEqual(parseGeoSearch(null), []);
});

// ---- lib/weekgrid.js time-grid helpers (parseHM, layoutDay) ----
import { parseHM, layoutDay, fmt12 } from '../docs/assets/lib/weekgrid.js';

test('parseHM: valid times → minutes, junk → null', () => {
  assert.equal(parseHM('00:00'), 0);
  assert.equal(parseHM('15:10'), 910);
  assert.equal(parseHM('9:05'), 545);
  assert.equal(parseHM('23:59'), 1439);
  assert.equal(parseHM('24:00'), null);
  assert.equal(parseHM('12:60'), null);
  assert.equal(parseHM('noon'), null);
  assert.equal(parseHM(''), null);
});
test('fmt12: 24h "HH:MM" → compact 12h label; junk → ""', () => {
  assert.equal(fmt12('13:10'), '1:10 PM');
  assert.equal(fmt12('09:00'), '9 AM');
  assert.equal(fmt12('00:00'), '12 AM');
  assert.equal(fmt12('12:00'), '12 PM');
  assert.equal(fmt12('23:59'), '11:59 PM');
  assert.equal(fmt12('x'), '');
  assert.equal(fmt12(''), '');
});
test('layoutDay: non-overlapping = single column each; overlaps split', () => {
  const a = layoutDay([{ id: 'a', startMin: 600, endMin: 660 }, { id: 'b', startMin: 700, endMin: 760 }]);
  assert.equal(a.find(x => x.id === 'a').cols, 1);
  assert.equal(a.find(x => x.id === 'b').cols, 1);
  const o = layoutDay([{ id: 'a', startMin: 600, endMin: 720 }, { id: 'b', startMin: 660, endMin: 780 }]);
  assert.equal(o.find(x => x.id === 'a').cols, 2);
  assert.equal(o.find(x => x.id === 'a').col, 0);
  assert.equal(o.find(x => x.id === 'b').col, 1);
  // a third overlapping all three → 3 cols
  const t = layoutDay([{ id: 'a', startMin: 600, endMin: 720 }, { id: 'b', startMin: 610, endMin: 730 }, { id: 'c', startMin: 620, endMin: 700 }]);
  assert.equal(Math.max(...t.map(x => x.cols)), 3);
});

// ---- ics.js timed export (review fix) ----
test('toICS: timed event emits floating DTSTART/DTEND, all-day unchanged', () => {
  const timed = toICS([{ id: 'f1', title: 'Flight', date: '2026-06-30', time: '08:25', endTime: '10:50' }]);
  assert.match(timed, /DTSTART:20260630T082500/);
  assert.match(timed, /DTEND:20260630T105000/);
  assert.ok(!/VALUE=DATE:20260630/.test(timed), 'timed event must not be all-day');
  const allday = toICS([{ id: 'a1', title: 'Stay', date: '2026-07-10', endDate: '2026-07-15' }]);
  assert.match(allday, /DTSTART;VALUE=DATE:20260710/);
});
test('toICS: timed with no endTime → default +1h', () => {
  const t = toICS([{ id: 'h', title: 'Haircut', date: '2026-07-07', time: '10:00' }]);
  assert.match(t, /DTSTART:20260707T100000/);
  assert.match(t, /DTEND:20260707T110000/);
});
test('gcalUrl: timed event carries a timed dates param + Tokyo tz', () => {
  const u = gcalUrl({ id: 'f', title: 'Flight', date: '2026-07-15', time: '15:10', endTime: '17:00' });
  assert.match(decodeURIComponent(u), /dates=20260715T151000\/20260715T170000/);
  assert.match(u, /ctz=Asia%2FTokyo/);
  const a = gcalUrl({ id: 'a', title: 'Stay', date: '2026-07-10', endDate: '2026-07-15' });
  assert.match(decodeURIComponent(a), /dates=20260710\/20260716/);
});

// ---- lib/usage.js (private, per-device usage counters) ----
import { bumpUsage, usageSummary, normalizeUsage } from '../docs/assets/lib/usage.js';

test('bumpUsage: counts routes + acts, stamps days, never mutates the input', () => {
  const start = normalizeUsage(null);
  const a = bumpUsage(start, 'route', 'calendar', '2026-07-08');
  const b = bumpUsage(a, 'route', 'calendar', '2026-07-08');
  const c = bumpUsage(b, 'act', 'edits', '2026-07-09');
  assert.equal(c.routes.calendar.n, 2);
  assert.equal(c.routes.calendar.last, '2026-07-08');
  assert.equal(c.acts.edits.n, 1);
  assert.deepEqual(Object.keys(c.days).sort(), ['2026-07-08', '2026-07-09']);
  assert.deepEqual(start, normalizeUsage(null));           // input untouched (immutability)
  assert.equal(a.routes.calendar.n, 1);                    // intermediate untouched too
});
test('bumpUsage: prunes the oldest day stamps beyond the cap', () => {
  let u = normalizeUsage(null);
  for (let i = 0; i < 405; i++) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    u = bumpUsage(u, 'route', 'dashboard', d);
  }
  assert.equal(Object.keys(u.days).length, 400);
  assert.ok(!u.days['2026-01-01']);                         // oldest pruned
  assert.equal(u.routes.dashboard.n, 405);                  // counts survive pruning
});
test('usageSummary: ranks routes, totals visits/edits, flags never-used; guards corrupt input', () => {
  let u = normalizeUsage('corrupt string');                 // corrupt stored value → fresh state
  u = bumpUsage(u, 'route', 'map', '2026-07-08');
  u = bumpUsage(u, 'route', 'calendar', '2026-07-08');
  u = bumpUsage(u, 'route', 'calendar', '2026-07-08');
  u = bumpUsage(u, 'act', 'edits', '2026-07-08');
  const s = usageSummary(u, ['calendar', 'map', 'budget']);
  assert.deepEqual(s.routes.map(r => r.route), ['calendar', 'map']);   // ranked desc by visits
  assert.equal(s.totalVisits, 3);
  assert.equal(s.edits, 1);
  assert.equal(s.daysUsed, 1);
  assert.deepEqual(s.neverUsed, ['budget']);
});

// ---- 縁 People (trip PRM) pure lib — invented names only (public repo) ----
import { newPerson, searchPeople, sortPeople, tagSet, initialsOf, hueOf, flagOf, leavesLabel, isBirthday, isBirthdayMonth } from '../docs/assets/lib/people.js';

const _people = () => [
  newPerson({ name: 'Aria', tags: ['music', 'Ramen Nerd'], metDate: '2026-07-04', nextPlan: 'Knock Kōenji', lastSeen: '2026-07-06', star: true }, '2026-07-08', 'p1'),
  newPerson({ name: 'Bex', tags: ['share house'], metDate: '2026-07-01', notes: 'combini fried chicken', lastSeen: '2026-07-05' }, '2026-07-08', 'p2'),
  newPerson({ name: 'Cy', tags: ['music'], metDate: '2026-07-05', neighborhood: 'Somewhere' }, '2026-07-08', 'p3'),  // no lastSeen
];

test('searchPeople matches notes, tags, and nextPlan', () => {
  const ppl = _people();
  assert.deepEqual(searchPeople(ppl, 'combini').map(p => p.name), ['Bex']);      // notes
  assert.deepEqual(searchPeople(ppl, 'ramen').map(p => p.name), ['Aria']);       // tag (case-insensitive)
  assert.deepEqual(searchPeople(ppl, 'kōenji').map(p => p.name), ['Aria']);      // nextPlan
  assert.equal(searchPeople(ppl, '').length, 3);                                  // empty → all
});

test('sortPeople: starred first, then mode; missing lastSeen sorts last', () => {
  const ppl = _people();
  assert.deepEqual(sortPeople(ppl, 'met').map(p => p.name), ['Aria', 'Cy', 'Bex']);   // Aria starred → leads despite Cy being newer
  const byName = sortPeople(ppl, 'name').map(p => p.name);
  assert.equal(byName[0], 'Aria');                                                     // starred leads name mode too
  const bySeen = sortPeople(ppl, 'seen').map(p => p.name);
  assert.equal(bySeen[0], 'Aria');                                                     // starred first
  assert.equal(bySeen[bySeen.length - 1], 'Cy');                                       // no lastSeen → last
});

test('tagSet: unique, lowercase, sorted', () => {
  assert.deepEqual(tagSet(_people()), ['music', 'ramen nerd', 'share house']);
});

test('initialsOf: CJK first char, latin 1–2 chars', () => {
  assert.equal(initialsOf('山田'), '山');       // kanji → first char
  assert.equal(initialsOf('さくら'), 'さ');      // hiragana → first char
  assert.equal(initialsOf('Aria Vale'), 'AV');
  assert.equal(initialsOf('Bex'), 'BE');
  assert.equal(initialsOf(''), '?');
});

test('hueOf: deterministic + a valid palette name', () => {
  assert.equal(hueOf('p1'), hueOf('p1'));            // stable across calls
  assert.equal(hueOf('p1712000000000'), hueOf('p1712000000000'));   // stable for a realistic id
  assert.match(hueOf('p2'), /^(music|festival|convention|food|fireworks|illumination|nature|seasonal|personal|disney)$/);
});

test('flagOf: known name/code, empty on unknown', () => {
  assert.equal(flagOf('JP'), '🇯🇵');
  assert.equal(flagOf('australia'), '🇦🇺');
  assert.equal(flagOf('Canadian'), '🇨🇦');
  assert.equal(flagOf('Freedonia'), '');
  assert.equal(flagOf(''), '');
});

test('leavesLabel: future countdown, past, empty', () => {
  assert.equal(leavesLabel('2026-08-20', '2026-07-08'), '⏳ leaves Aug 20 — 6 weeks');
  assert.equal(leavesLabel('2026-07-05', '2026-07-08'), 'left Jul 5');
  assert.equal(leavesLabel('2026-07-08', '2026-07-08'), 'left Jul 8');   // today = departing/gone
  assert.equal(leavesLabel('', '2026-07-08'), '');
});

test('newPerson: name required, metDate defaults to today, tags normalized', () => {
  assert.throws(() => newPerson({ name: '   ' }, '2026-07-08', 'p9'), /name required/);
  const p = newPerson({ name: 'Dex' }, '2026-07-08', 'p9');
  assert.equal(p.metDate, '2026-07-08');
  assert.equal(p.star, false);
  assert.equal(p.seenCount, 0);
  const t = newPerson({ name: 'Ela', tags: ['Music', 'music', ' Climbing '] }, '2026-07-08', 'p10');
  assert.deepEqual(t.tags, ['music', 'climbing']);   // lowercased + deduped
});
test('sortPeople/searchPeople: malformed restored people never throw (missing name, non-string dates)', () => {
  const bad = [
    { id: 'x1', metDate: '2026-07-01' },                          // no name
    { id: 'x2', name: 'Aria', metDate: '2026-07-01' },            // date tie → secondary name compare
    { id: 'x3', name: 'Bex', metDate: 20260702, lastSeen: null }, // numeric date, null lastSeen
  ];
  for (const mode of ['met', 'name', 'seen']) {
    const out = sortPeople(bad, mode);
    assert.equal(out.length, 3);                                   // sorted without throwing
  }
  assert.doesNotThrow(() => searchPeople(bad, 'aria'));
});

test('compact-pages parity: settings control, CSS rules, and store key stay in sync', () => {
  const css = readFileSync(new URL('../docs/assets/style.css', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../docs/assets/guide.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../docs/assets/lib/store.js', import.meta.url), 'utf8');
  assert.ok(store.includes('compact:'), 'store.js KEYS must define compact');
  assert.ok(guide.includes("setCompact"), 'guide.js must render the Compact pages switch');
  assert.ok(guide.includes('applyCompact'), 'guide.js must export/apply the compact attribute');
  assert.ok(css.includes('[data-compact="on"] .pillar-head'), 'style.css must style compact mini-titles');
  assert.ok(css.includes('[data-compact="on"] .lede'), 'style.css must hide ledes in compact');
});

test('isBirthday/isBirthdayMonth: MM-DD and YYYY-MM-DD both work; junk never matches', () => {
  assert.equal(isBirthday('11-12', '2026-11-12'), true);
  assert.equal(isBirthday('1990-11-12', '2026-11-12'), true);
  assert.equal(isBirthday('11-12', '2026-11-13'), false);
  assert.equal(isBirthday('', '2026-11-12'), false);
  assert.equal(isBirthday('soon', '2026-11-12'), false);
  assert.equal(isBirthdayMonth('11-12', '2026-11-01'), true);
  assert.equal(isBirthdayMonth('1990-07-20', '2026-07-09'), true);
  assert.equal(isBirthdayMonth('11-12', '2026-10-31'), false);
});

// ---- lib/spend.js (budget actuals) ----
import { parseSpend, monthTotal, monthByCat, spendSummary, pruneSpend } from '../docs/assets/lib/spend.js';

test('parseSpend: plain, yen-sign+comma, k-suffix, bare amount', () => {
  assert.deepEqual(parseSpend('1200 ramen', '2026-07-09'), { amount: 1200, note: 'ramen', date: '2026-07-09' });
  assert.deepEqual(parseSpend('¥3,400 drinks with friends', '2026-07-09'), { amount: 3400, note: 'drinks with friends', date: '2026-07-09' });
  assert.deepEqual(parseSpend('1.2k combini', '2026-07-09'), { amount: 1200, note: 'combini', date: '2026-07-09' });
  assert.deepEqual(parseSpend('980', '2026-07-09'), { amount: 980, note: '', date: '2026-07-09' });
});
test('parseSpend: trailing date words — yesterday + PAST weekday (spends are history)', () => {
  assert.equal(parseSpend('1200 ramen yesterday', '2026-07-09').date, '2026-07-08');
  // 2026-07-09 is a Thursday → bare "mon" = most recent PAST Monday (Jul 6), never forward
  assert.equal(parseSpend('500 coffee mon', '2026-07-09').date, '2026-07-06');
  // bare weekday matching today rolls a full week BACK (a spend "thu" said on Thursday means last week? no — history semantics: not-today)
  assert.equal(parseSpend('500 coffee thu', '2026-07-09').date, '2026-07-02');
  assert.equal(parseSpend('500 coffee today', '2026-07-09').date, '2026-07-09');
});
test('parseSpend: garbage rejected', () => {
  assert.equal(parseSpend('ramen 1200', '2026-07-09'), null);   // amount must lead
  assert.equal(parseSpend('0 freebie', '2026-07-09'), null);
  assert.equal(parseSpend('', '2026-07-09'), null);
});
test('monthTotal/monthByCat: month-scoped sums, cat falls back to note', () => {
  const items = [
    { id: 's1', date: '2026-07-01', amount: 1000, cat: 'food' },
    { id: 's2', date: '2026-07-15', amount: 500, note: 'Coffee' },
    { id: 's3', date: '2026-06-30', amount: 9999, cat: 'food' },
  ];
  assert.equal(monthTotal(items, '2026-07'), 1500);
  assert.deepEqual(monthByCat(items, '2026-07'), { food: 1000, coffee: 500 });
});
test('spendSummary: trailing-30d actuals drive burn + runway; empty → null (plan fallback)', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: 's' + i, date: `2026-07-${String(i % 9 + 1).padStart(2, '0')}`, amount: 1000 }));
  const s = spendSummary(items, 190000, 900000, 0, '2026-07-09');
  assert.equal(s.actualThisMonth, 30000);
  assert.equal(s.actualMonthlyBurn, 30000);            // 30k over 30d → 1k/day → 30k monthly
  assert.equal(s.actualRunwayMonths, 29);              // (900k − 30k already spent) / 30k — savings are anchored now
  assert.ok(s.vsPlan < 0);                             // projected 31k < planned 190k
  assert.equal(spendSummary([], 190000, 900000, 0, '2026-07-09'), null);
  assert.equal(spendSummary([{ date: '2026-01-01', amount: 500 }], 1, 1, 0, '2026-07-09'), null);  // outside window
});
test('pruneSpend: drops entries older than the retention window, keeps the rest, never mutates', () => {
  const items = [{ id: 'a', date: '2024-01-05', amount: 1 }, { id: 'b', date: '2026-07-01', amount: 2 }];
  const out = pruneSpend(items, '2026-07-09');
  assert.deepEqual(out.map(i => i.id), ['b']);
  assert.equal(items.length, 2);
});
test('parseSpend: sub-0.5 decimals cannot mint a ¥0 entry; income>burn → Infinity runway', () => {
  assert.equal(parseSpend('0.4 x', '2026-07-09'), null);
  const s = spendSummary([{ date: '2026-07-08', amount: 30000 }], 190000, 900000, 500000, '2026-07-09');
  assert.equal(s.actualRunwayMonths, Infinity);   // income 500k > burn 30k
});

test('panel fixes: leap-day birthdays fold to Feb 28 in non-leap years; impossible dates rejected', () => {
  assert.equal(isBirthday('02-29', '2026-02-28'), true);    // 2026 not leap → celebrate the 28th
  assert.equal(isBirthday('02-29', '2028-02-29'), true);    // 2028 leap → the real day
  assert.equal(isBirthday('02-29', '2028-02-28'), false);
  assert.equal(isBirthdayMonth('11-31', '2026-11-05'), false);  // invalid day → no phantom badge
  assert.equal(isBirthdayMonth('13-05', '2026-01-05'), false);  // invalid month
});
test('panel fixes: runway gated on confidence + savings anchored to entry date', () => {
  // 3 entries on 3 days = not confident → callers hide runway
  const sparse = [{date:'2026-07-07',amount:500},{date:'2026-07-08',amount:600},{date:'2026-07-09',amount:550}];
  const s1 = spendSummary(sparse, 190000, 900000, 0, '2026-07-09');
  assert.equal(s1.confident, false);
  assert.equal(s1.sampleDays, 3);
  // 15 distinct days → confident; savings reduced by spends since savingsAsOf
  const dense = Array.from({length:15},(_,i)=>({date:`2026-07-${String(i+1).padStart(2,'0')}`,amount:2000}));
  const s2 = spendSummary(dense, 190000, 100000, 0, '2026-07-15', '2026-07-01');
  assert.equal(s2.confident, true);
  assert.equal(s2.savingsNow, 100000 - 30000);              // 15×2000 logged since the anchor
  assert.equal(s2.actualRunwayMonths, 2);              // floor(70k/30k) — unanchored would say 3
  // spends BEFORE the anchor don't count against savings
  const s3 = spendSummary(dense, 190000, 100000, 0, '2026-07-15', '2026-07-10');
  assert.equal(s3.savingsNow, 100000 - 12000);              // only Jul 10-15 (6×2000)
});

// ---- People v1.1: drifting + vCard + event link ----
import { driftingPeople, driftLabel, toVCard } from '../docs/assets/lib/people.js';

test('driftingPeople: >14d since last contact; metDate fallback; left people excluded; most-drifted first', () => {
  const t = '2026-07-09';
  const list = [
    { id: 'p1', name: 'Aiko', lastSeen: '2026-07-05' },                       // 4d — fresh
    { id: 'p2', name: 'Bram', lastSeen: '2026-06-20' },                       // 19d — drifting
    { id: 'p3', name: 'Chie', metDate: '2026-05-01' },                        // never seen → metDate (69d)
    { id: 'p4', name: 'Dario', lastSeen: '2026-06-01', leaves: '2026-07-01' }, // left already
    { id: 'p5', name: 'Eri', lastSeen: '2026-06-01', leaves: '2026-08-01' },   // still here (38d)
    { id: 'p6', name: 'Fen' },                                                 // no dates at all
  ];
  const out = driftingPeople(list, t);
  assert.deepEqual(out.map(x => x.id), ['p3', 'p5', 'p2']);
  assert.equal(out[0].days, 69);
});
test('driftingPeople: threshold boundary is exclusive; malformed records never throw', () => {
  const t = '2026-07-15';
  assert.equal(driftingPeople([{ id: 'a', name: 'x', lastSeen: '2026-07-01' }], t).length, 0);   // exactly 14d
  assert.equal(driftingPeople([{ id: 'a', name: 'x', lastSeen: '2026-06-30' }], t).length, 1);   // 15d
  assert.deepEqual(driftingPeople([{ lastSeen: 42 }, null, { name: 'y', metDate: 'soon' }], t), []);
});
test('driftLabel spans: days → weeks → months', () => {
  assert.equal(driftLabel(13), '13 d');
  assert.equal(driftLabel(15), '2 wks');   // drifting entries start past 14d — weeks from there
  assert.equal(driftLabel(21), '3 wks');
  assert.equal(driftLabel(90), '3 mo');
});
test('toVCard: FN/N + TEL vs URL vs handle-in-NOTE; BDAY only with a full date; escaping; CRLF', () => {
  const v = toVCard([
    { name: 'Kenji; Barber', contact: '+81 90-1234-5678', birthday: '1994-04-20', metDate: '2026-07-02', metPlace: 'Koenji' },
    { name: 'Mia', contact: 'LINE @mia_tokyo', birthday: '04-20', notes: 'ramen,\nlate nights' },
    { name: 'Site Guy', contact: 'https://example.com/a' },
    { name: '', contact: '000' },   // nameless → skipped
  ]);
  assert.ok(v.includes('FN:Kenji\\; Barber'));   // vesc escapes the semicolon
  assert.ok(v.includes('TEL;TYPE=CELL:+81 90-1234-5678'));
  assert.ok(v.includes('BDAY:1994-04-20'));
  assert.ok(v.includes('NOTE:Met 2026-07-02 · Koenji'));
  assert.ok(v.includes('Birthday: 04-20\\nContact: LINE @mia_tokyo\\nramen\\,\\nlate nights'));
  assert.ok(v.includes('URL:https://example.com/a'));
  assert.equal((v.match(/BEGIN:VCARD/g) || []).length, 3);
  assert.ok(v.endsWith('END:VCARD\r\n'));
  assert.ok(!v.includes('\n\r') && v.split('\r\n').every(l => !l.includes('\n') || l === ''));
  assert.equal(toVCard([]), '');
});
test('newPerson carries metEventId (event link) and defaults it empty', () => {
  assert.equal(newPerson({ name: 'Aiko', metEventId: ' ev-x ' }, '2026-07-09').metEventId, 'ev-x');
  assert.equal(newPerson({ name: 'Aiko' }, '2026-07-09').metEventId, '');
});

// ---- Anki Core-2000 refresher: whole-deck export parsing ----
import { parseAnkiExport, cleanField, chunkCount, chunkSlice, chunkLabel, toggleShaky, shuffled } from '../docs/assets/lib/anki.js';

const CORE_SAMPLE = `#separator:tab
#html:true
食べ物\tたべもの\tfood\tこの食べ物はおいしいです。\tThis food is delicious.[sound:c1.mp3]
学校\tがっこう\tschool\t学校へ行きます。\tI go to school.
<b>水</b>\tみず\twater\t水を飲みます。[sound:c3.mp3]\tI drink water.`;

test('parseAnkiExport: header skip, tab sniff, column auto-detect, cleaning', () => {
  const { cards, cols, delim } = parseAnkiExport(CORE_SAMPLE);
  assert.equal(delim, '\t');
  assert.equal(cards.length, 3);
  assert.deepEqual({ w: cards[0].w, r: cards[0].r, m: cards[0].m }, { w: '食べ物', r: 'たべもの', m: 'food' });
  assert.equal(cards[0].s, 'この食べ物はおいしいです。');
  assert.equal(cards[0].sm, 'This food is delicious.');      // [sound:] stripped
  assert.equal(cards[2].w, '水');                              // <b> stripped
  assert.ok(cols.expression >= 0 && cols.reading >= 0 && cols.meaning >= 0);
});
test('parseAnkiExport: semicolon fallback + mapping override + furigana brackets', () => {
  const { cards } = parseAnkiExport('犬[いぬ];dog\n猫[ねこ];cat', { expression: 0, meaning: 1, reading: -1, sentence: -1, sentenceMeaning: -1 });
  assert.equal(cards[0].w, '犬');                              // furigana bracket removed
  assert.equal(cards[1].m, 'cat');
  assert.throws(() => parseAnkiExport('#separator:tab\n\n'), /no data rows/);
  assert.throws(() => parseAnkiExport('???\t???'), /could not detect|no usable/);
});
test('cleanField: entities, tags, sound, whitespace', () => {
  assert.equal(cleanField(' <i>a&amp;b</i> [sound:x.mp3]  c '), 'a&b c');
});
test('anki chunks + shaky + deterministic shuffle', () => {
  assert.equal(chunkCount(2000), 20);
  assert.equal(chunkCount(0), 1);
  assert.equal(chunkLabel(3, 2000), '301–400');
  assert.equal(chunkLabel(19, 1950), '1901–1950');
  const cards = Array.from({ length: 250 }, (_, i) => ({ id: 'a' + i }));
  assert.equal(chunkSlice(cards, 2).length, 50);
  let sh = toggleShaky([], 'a5'); sh = toggleShaky(sh, 'a9'); sh = toggleShaky(sh, 'a5');
  assert.deepEqual(sh, ['a9']);
  const s1 = shuffled(cards, 42).map(c => c.id), s2 = shuffled(cards, 42).map(c => c.id);
  assert.deepEqual(s1, s2);                                    // same seed → same order
  assert.notDeepEqual(s1, cards.map(c => c.id));               // actually shuffles
});

// ---- Anki stage 3: pile snapshot ----
import { pileOrder, toAnkiTSV } from '../docs/assets/lib/anki.js';
test('pileOrder: deck order preserved, ids deduped by Set, empty/missing safe', () => {
  const cards = [{id:'a0'},{id:'a1'},{id:'a2'},{id:'a3'}];
  assert.deepEqual(pileOrder(cards, ['a3','a1','a1']).map(c=>c.id), ['a1','a3']);  // deck order, not flag order
  assert.deepEqual(pileOrder(cards, []), []);
  assert.deepEqual(pileOrder([], ['a1']), []);
  assert.deepEqual(pileOrder(cards, undefined), []);
});

// ---- lib/grammar.js (JLPT grammar reference, P1) ----
import { readingOf, tokenReading, kanaToRomaji, searchPoints, byLevel } from '../docs/assets/lib/grammar.js';
import { validatePoints } from '../scripts/validate-grammar.mjs';

test('readingOf: per-segment furigana derives the kana reading', () => {
  assert.equal(readingOf([['食', 'た'], ['べて', '']]), 'たべて');
  assert.equal(readingOf([['明日', 'あした']]), 'あした');
  assert.equal(readingOf([]), '');
  assert.equal(readingOf(undefined), '');
  assert.equal(tokenReading('、'), '、');
  assert.equal(tokenReading({ t: '前に', f: [['前', 'まえ'], ['に', '']] }), 'まえに');
});

test('kanaToRomaji: wapuro romaji incl. digraphs, gemination, chōon, katakana', () => {
  assert.equal(kanaToRomaji('たべて'), 'tabete');
  assert.equal(kanaToRomaji('きょう'), 'kyou');
  assert.equal(kanaToRomaji('がっこう'), 'gakkou');
  assert.equal(kanaToRomaji('しゃしん'), 'shashin');
  assert.equal(kanaToRomaji('ラーメン'), 'raamen');
  assert.equal(kanaToRomaji('まえに'), 'maeni');
  assert.equal(kanaToRomaji('も〜も'), 'momo');     // 〜 skipped, not an error
  assert.equal(kanaToRomaji(''), '');
});

test('searchPoints: pattern kanji, kana, romaji (spaces ignored), EN meaning', () => {
  const pts = [
    { id: 'n5-mae-ni', pattern: '〜前に', reading: 'まえに', meaning: 'before doing X' },
    { id: 'n5-te-kara', pattern: '〜てから', reading: 'てから', meaning: 'after doing X, Y' },
  ];
  assert.deepEqual(searchPoints(pts, '前').map(p => p.id), ['n5-mae-ni']);       // kanji the card shows
  assert.deepEqual(searchPoints(pts, 'まえに').map(p => p.id), ['n5-mae-ni']);   // kana
  assert.deepEqual(searchPoints(pts, 'mae ni').map(p => p.id), ['n5-mae-ni']);   // romaji, space ignored
  assert.deepEqual(searchPoints(pts, 'AFTER').map(p => p.id), ['n5-te-kara']);   // EN, case-insensitive
  assert.equal(searchPoints(pts, '').length, 2);                                  // empty query = all
  assert.equal(searchPoints(pts, 'zzz').length, 0);
});

test('byLevel filters', () => {
  const pts = [{ id: 'a', level: 'N5' }, { id: 'b', level: 'N4' }];
  assert.deepEqual(byLevel(pts, 'N5').map(p => p.id), ['a']);
});

test('all grammar-*.json files pass the validator (the data gate for every bake PR)', () => {
  const COUNTS = { n5: 82, n4: 86, n3: 72, n2: 66, n1: 47 };            // update per bake phase
  const files = Object.keys(COUNTS).map(l => [l.toUpperCase(),
    JSON.parse(readFileSync(new URL(`../docs/data/grammar-${l}.json`, import.meta.url), 'utf8'))]);
  const allIds = new Set(files.flatMap(([, pts]) => pts.map(p => p.id)));   // related[] crosses levels
  for (const [level, pts] of files) {
    assert.deepEqual(validatePoints(pts, level, allIds), [], level);
    assert.equal(pts.length, COUNTS[level.toLowerCase()], level);
  }
  // plan acid tests: a non-contiguous pattern + a glossed p anchor survive every merge
  const n5 = files[0][1];
  const momo = n5.find(p => p.id === 'n5-mo-mo');
  assert.equal(momo.examples[0].ja.filter(tk => tk.p).length, 2);
  const maeni = n5.find(p => p.id === 'n5-mae-ni');
  assert.ok(maeni.examples[0].ja.find(tk => tk.p && tk.g));
});

test('validator rejects malformed tokens', () => {
  const bad = [{
    id: 'n5-bad', level: 'N5', pattern: '〜てから', reading: 'てから', meaning: 'x', connection: 'x',
    confidence: 'high', tags: [], related: ['n5-nope'],
    examples: [{ en: 'x', ja: [{ t: '食べて', f: [['食', 'た'], ['べ', '']], g: 'eat' }] }],   // f ≠ t, no p token
  }];
  const errs = validatePoints(bad, 'N5', new Set(['n5-bad']));
  assert.ok(errs.some(e => e.includes('≠ t')));            // segment concat mismatch
  assert.ok(errs.some(e => e.includes('no p (pattern)'))); // missing p token
  assert.ok(errs.some(e => e.includes('unknown id')));     // dangling related ref
});


import { shakyRows } from '../docs/assets/lib/grammar.js';
test('shakyRows: level order N5→N1, deck order within, tags + TSV round-trip', () => {
  const byLevel = {
    N5: [{ id: 'n5-a', level: 'N5', pattern: '〜てから', meaning: 'after', connection: 'V-て + から' },
         { id: 'n5-b', level: 'N5', pattern: '〜たい', meaning: 'want', connection: 'stem + たい' }],
    N1: [{ id: 'n1-a', level: 'N1', pattern: '〜べく', meaning: 'in order to', connection: 'V-dict + べく' }],
  };
  const rows = shakyRows(byLevel, ['n1-a', 'n5-b']);
  assert.deepEqual(rows.map(r => r.front), ['〜たい', '〜べく']);   // N5 before N1, deck order kept
  assert.deepEqual(rows[0].tags, ['jwh-grammar', 'N5']);
  assert.equal(rows[0].back, 'want — stem + たい');
  assert.equal(toAnkiTSV(rows).split('\n').length, 2);
  assert.deepEqual(shakyRows(byLevel, []), []);
});
