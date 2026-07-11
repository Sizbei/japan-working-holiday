import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../docs/assets/i18n.js';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
// match the data-i18n="..." attribute only (NOT data-i18n-html, which is a bare boolean attr)
const htmlKeys = [...html.matchAll(/\sdata-i18n="([^"]+)"/g)].map(m => m[1]);

// keys rendered by JS (not present as static data-i18n in index.html)
const JS_KEYS = ['head.tracker.fixed', 'head.tracker.dated', 'head.readiness.arrived',
  'nav.phrases', 'nav.grammar', 'nav.packing', 'nav.deadlines'];   // optional nav pages — links are JS-injected (guide.js applyNavShow)   // set from dashboard.js post-arrival heading swap

test('every data-i18n key in index.html has a Japanese string', () => {
  for (const k of htmlKeys) {
    assert.ok(STRINGS[k] !== undefined, `index.html uses data-i18n="${k}" but STRINGS has no such key`);
  }
});

test('every STRINGS key is used in index.html or by known JS', () => {
  const used = new Set([...htmlKeys, ...JS_KEYS]);
  for (const k of Object.keys(STRINGS)) {
    assert.ok(used.has(k), `STRINGS["${k}"] is orphaned — no element uses it`);
  }
});

test('expected number of tagged elements present', () => {
  assert.ok(htmlKeys.length >= 45, `expected ~52 data-i18n elements in index.html, found ${htmlKeys.length}`);
});
