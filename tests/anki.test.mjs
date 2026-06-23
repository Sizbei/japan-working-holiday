'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAnkiTSV, parseAnkiTSV, mapNoteFields, stripHtml } from '../docs/assets/lib/anki.js';

test('toAnkiTSV: front<TAB>back<TAB>tags, newline-joined, tabs/newlines flattened', () => {
  const tsv = toAnkiTSV([{ front: '水', back: 'mizu <br> water', tags: ['whv', 'Daily'] }, { front: 'a\tb', back: 'c\nd', tags: [] }]);
  const lines = tsv.split('\n');
  assert.equal(lines[0], '水\tmizu <br> water\twhv Daily');
  assert.equal(lines[1], 'a b\tc d\t');
});
test('parseAnkiTSV: skips #headers + blanks, needs a Front, reads tags col', () => {
  const rows = parseAnkiTSV('#separator:tab\n#html:true\n\n水\tmizu\twhv Daily\n\tonly-back\nfoo\tbar');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { front: '水', back: 'mizu', tags: ['whv', 'Daily'] });
  assert.deepEqual(rows[1], { front: 'foo', back: 'bar', tags: [] });
});
test('mapNoteFields: detects by name; falls back to positional', () => {
  assert.deepEqual(mapNoteFields([{ name: 'English' }, { name: 'Japanese' }, { name: 'Reading' }]), { jpIdx: 1, enIdx: 0, readIdx: 2 });
  assert.deepEqual(mapNoteFields([{ name: 'Front' }, { name: 'Back' }]), { jpIdx: 0, enIdx: 1, readIdx: 2 });
  assert.deepEqual(mapNoteFields(['v0', 'v1']), { jpIdx: 0, enIdx: 1, readIdx: 2 });
});
test('stripHtml: removes markup (regex path when no DOMParser)', () => {
  assert.equal(stripHtml('mizu <br> <b>water</b>'), 'mizu water');
  assert.equal(stripHtml('<img src=x onerror=alert(1)>hi'), 'hi');
});
