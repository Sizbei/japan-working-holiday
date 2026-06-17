#!/usr/bin/env node
'use strict';
// Re-runnable bake/merge job. The app is a static GitHub-Pages site (no backend), so data is
// gathered at BUILD time and baked into docs/data/tips.json (the "bake-not-scrape" model).
//
// Pipeline to refresh data:
//   1. Run the gather workflow (multi-agent research): produces { rooms:[], events:[] }.
//   2. Save that JSON to tools/gathered.json.
//   3. node tools/merge-data.mjs            (or: node tools/merge-data.mjs path/to.json)
//   4. node --test && serve locally to verify, then commit.
//
// Merge is idempotent: de-dupes by id AND by lowercased name/title, so re-running never
// duplicates. Missing ids are generated as kebab-case slugs.

import { readFileSync, writeFileSync } from 'node:fs';

const tipsPath = 'docs/data/tips.json';
const gatheredPath = process.argv[2] || 'tools/gathered.json';
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

const tips = JSON.parse(readFileSync(tipsPath, 'utf8'));
const gathered = JSON.parse(readFileSync(gatheredPath, 'utf8'));

function mergeArray(existing, incoming, nameKey) {
  const ids = new Set(existing.map(x => x.id));
  const names = new Set(existing.map(x => String(x[nameKey] || '').toLowerCase().trim()));
  let added = 0;
  for (const item of (incoming || [])) {
    if (!item.id) item.id = slug(item[nameKey] || item.name || item.title);
    const nm = String(item[nameKey] || '').toLowerCase().trim();
    if (ids.has(item.id) || (nm && names.has(nm))) continue;   // dedupe
    existing.push(item); ids.add(item.id); names.add(nm); added++;
  }
  return added;
}

tips.rooms ||= [];
tips.calendar ||= [];
const addedRooms = mergeArray(tips.rooms, gathered.rooms, 'name');
const addedEvents = mergeArray(tips.calendar, gathered.events, 'title');

writeFileSync(tipsPath, JSON.stringify(tips, null, 2));
console.log(`merged: +${addedRooms} rooms (now ${tips.rooms.length}), +${addedEvents} events (now ${tips.calendar.length})`);
