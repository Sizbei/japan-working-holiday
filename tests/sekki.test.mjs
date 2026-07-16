'use strict';
// Unit tests for the sekki/72-kō almanac lookup. Run: node --test (zero dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sekkiFor } from '../docs/assets/lib/sekki.js';

test('sekkiFor rejects junk', () => {
  assert.equal(sekkiFor(''), null);
  assert.equal(sekkiFor('nope'), null);
  assert.equal(sekkiFor(null), null);
});

test('2026-07-15 → 小暑 · 蓮始開 · next 鷹乃学習 · summer', () => {
  const r = sekkiFor('2026-07-15');
  assert.equal(r.sekki.kanji, '小暑');
  assert.equal(r.sekki.romaji, 'shōsho');
  assert.equal(r.sekki.startISO, '2026-07-07');
  assert.equal(r.sekki.endISO, '2026-07-22');
  assert.equal(r.ko.kanji, '蓮始開');
  assert.equal(r.ko.romaji, 'hasu hajimete hiraku');
  assert.equal(r.ko.startISO, '2026-07-12');
  assert.equal(r.ko.endISO, '2026-07-16');
  assert.equal(r.nextKo.kanji, '鷹乃学習');
  assert.equal(r.nextKo.startISO, '2026-07-17');
  assert.deepEqual(r.season, { kanji: '夏', en: 'Summer' });
});

test('winter wraps the year boundary (冬至 spans Dec 22 → Jan 4)', () => {
  const dec = sekkiFor('2026-12-31');
  assert.equal(dec.sekki.kanji, '冬至');
  assert.equal(dec.sekki.startISO, '2026-12-22');
  assert.equal(dec.sekki.endISO, '2027-01-04');
  assert.equal(dec.ko.kanji, '麋角解');
  assert.equal(dec.ko.endISO, '2026-12-31');
  assert.equal(dec.nextKo.kanji, '雪下出麦');
  assert.equal(dec.nextKo.startISO, '2027-01-01'); // next kō is across the year line
  assert.equal(dec.season.en, 'Winter');

  const jan = sekkiFor('2027-01-03');
  assert.equal(jan.sekki.kanji, '冬至'); // still last year's 冬至
  assert.equal(jan.sekki.startISO, '2026-12-22');
  assert.equal(jan.ko.kanji, '雪下出麦');
  assert.equal(jan.ko.startISO, '2027-01-01');
  assert.equal(jan.season.en, 'Winter');

  assert.equal(sekkiFor('2027-01-05').sekki.kanji, '小寒'); // and 小寒 takes over on the 5th
});

test('the four 立 terms open their seasons', () => {
  const cases = [
    ['2026-02-04', '立春', 'Spring'],
    ['2026-05-05', '立夏', 'Summer'],
    ['2026-08-08', '立秋', 'Autumn'],
    ['2026-11-07', '立冬', 'Winter'],
  ];
  for (const [iso, kanji, season] of cases) {
    const r = sekkiFor(iso);
    assert.equal(r.sekki.kanji, kanji, iso);
    assert.equal(r.sekki.startISO, iso, iso);
    assert.equal(r.season.en, season, iso);
  }
});

test('every day of 2026 maps to exactly one sekki and one kō, contiguously', () => {
  const sekkis = new Set(), kos = new Set();
  let prev = null;
  const d = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365; i++) {
    const iso = d.toISOString().slice(0, 10);
    const r = sekkiFor(iso);
    assert.ok(r, iso);
    assert.ok(r.ko.startISO <= iso && iso <= r.ko.endISO, `${iso} inside its kō window`);
    assert.ok(r.sekki.startISO <= iso && iso <= r.sekki.endISO, `${iso} inside its sekki window`);
    if (prev && prev.ko.kanji !== r.ko.kanji) {
      // no gap and no overlap: the new kō starts the day after the old one ends
      assert.equal(r.ko.startISO, iso, `kō change lands on its start (${iso})`);
      assert.equal(prev.ko.endISO, prevISO(iso), `previous kō ended the day before (${iso})`);
    }
    sekkis.add(r.sekki.kanji);
    kos.add(r.ko.kanji);
    prev = r;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  assert.equal(sekkis.size, 24);
  assert.equal(kos.size, 72);
});

function prevISO(iso) {
  const d = new Date(Date.parse(iso) - 86400000);
  return d.toISOString().slice(0, 10);
}
