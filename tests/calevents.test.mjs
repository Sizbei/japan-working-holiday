import { test } from 'node:test';
import assert from 'node:assert';
import { duplicateUserEvent, eventMenuSpec } from '../docs/assets/lib/calevents.js';

test('duplicateUserEvent: copies fields with new id + copyOf, no input mutation', () => {
  const ev = { id: 'u1', title: 'Gig', date: '2026-07-01', endDate: '', category: 'music', note: 'n', area: 'Shibuya', source: 'user' };
  const copy = duplicateUserEvent(ev, 'u2');
  assert.equal(copy.id, 'u2');
  assert.equal(copy.copyOf, 'u1');
  assert.equal(copy.title, 'Gig');
  assert.equal(copy.date, '2026-07-01');
  assert.equal(copy.category, 'music');
  assert.equal(copy.area, 'Shibuya');
  assert.equal(ev.id, 'u1');               // input untouched
  assert.ok(!('copyOf' in ev));
});

test('eventMenuSpec: user event → edit/duplicate/plan/checklist/gcal + sep + delete(danger)', () => {
  const spec = eventMenuSpec({ id: 'u1', source: 'user' });
  assert.deepEqual(spec.filter(i => i.key).map(i => i.key), ['edit', 'duplicate', 'plan', 'checklist', 'gcal', 'delete']);
  assert.ok(spec.some(i => i.sep));
  assert.equal(spec.find(i => i.key === 'delete').danger, true);
});

test('eventMenuSpec: baked event → open/plan/checklist/gcal/copy, no edit/delete/duplicate', () => {
  const spec = eventMenuSpec({ id: 'b1', source: 'baked' });
  const keys = spec.filter(i => i.key).map(i => i.key);
  assert.deepEqual(keys, ['open', 'plan', 'checklist', 'gcal', 'copy']);
});

test('eventMenuSpec: alreadyPlanned omits the ＋ Add to day plan item', () => {
  const userSpec = eventMenuSpec({ id: 'u1', source: 'user' }, { alreadyPlanned: true });
  assert.ok(!userSpec.some(i => i.key === 'plan'));
  const bakedSpec = eventMenuSpec({ id: 'b1', source: 'baked' }, { alreadyPlanned: true });
  assert.ok(!bakedSpec.some(i => i.key === 'plan'));
});
