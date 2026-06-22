'use strict';
// Pure, unit-tested logic for the packing page. No DOM, import-safe in Node.

// The fixed category set, rendered in this order. Unknown cats fall to the end.
export const CATEGORY_ORDER = ['Documents', 'Money', 'Electronics', 'Clothing', 'Health', 'Day-one bag', 'Misc'];

// Group items by category into [{ cat, items[] }], following ORDER. Categories not
// in ORDER are appended last (in first-seen order). Empty categories are dropped.
export function groupByCategory(items, ORDER) {
  const byCat = new Map();
  const order = [];
  (items || []).forEach(it => {
    const cat = it.cat;
    if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat); }
    byCat.get(cat).push(it);
  });
  const known = (ORDER || []).filter(c => byCat.has(c));
  const unknown = order.filter(c => !(ORDER || []).includes(c));
  return [...known, ...unknown].map(cat => ({ cat, items: byCat.get(cat) }));
}

// Progress over ALL items (baked ++ custom) — counts every item, never just visible.
// `done` = items whose id is truthy in the checked map. pct rounds to a whole number.
export function progress(items, checked) {
  const list = items || [];
  const map = checked || {};
  const total = list.length;
  const done = list.filter(it => map[it.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}
