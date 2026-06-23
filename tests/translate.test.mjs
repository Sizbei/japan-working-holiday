'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateURL, parseTranslation, MAX_LEN } from '../docs/assets/lib/translate.js';

test('translateURL: builds a MyMemory URL with pipe langpair + encoding', () => {
  const u = translateURL('Where is the station?', 'en', 'ja');
  assert.match(u, /^https:\/\/api\.mymemory\.translated\.net\/get\?q=/);
  assert.match(u, /langpair=en\|ja$/);
  assert.match(u, /Where%20is%20the%20station%3F/);
});
test('translateURL: throws on empty, bad pair, same lang, over-length', () => {
  assert.throws(() => translateURL('', 'en', 'ja'));
  assert.throws(() => translateURL('hi', 'en', 'fr'));
  assert.throws(() => translateURL('hi', 'en', 'en'));
  assert.throws(() => translateURL('x'.repeat(MAX_LEN + 1), 'en', 'ja'));
});
test('parseTranslation: ok body -> text + match', () => {
  const r = parseTranslation({ responseData: { translatedText: '駅はどこですか。', match: 0.9 }, responseStatus: 200 });
  assert.equal(r.text, '駅はどこですか。');
  assert.equal(r.warning, '');
});
test('parseTranslation: quota / non-200 / malformed -> warning, no text', () => {
  assert.equal(parseTranslation({ responseData: { translatedText: 'x', quotaFinished: true }, responseStatus: 200 }).text, '');
  assert.equal(parseTranslation({ responseStatus: 403, responseDetails: 'MYMEMORY WARNING: DAILY LIMIT' }).text, '');
  assert.ok(parseTranslation({}).warning);
  assert.equal(parseTranslation({ responseData: { translatedText: 'ok' }, responseStatus: '200' }).text, 'ok');
});
