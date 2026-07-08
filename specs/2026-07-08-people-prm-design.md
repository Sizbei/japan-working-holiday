# 縁 People — a trip PRM (2026-07-08)

**Goal:** A small personal-relationship page: everyone met this year, and what I know about them — the guesthouse friend, the barber, the festival tent-neighbour. Optimized for one moment: *"I'm about to see/message this person — what do I remember?"*

**The hard constraint that shapes everything:** the repo is PUBLIC. Real people's names/details must NEVER appear in `tips.json`, code, commits, or any committed file — not even in examples. All people data lives in localStorage (`jwh-people-v1`), rides the existing `jwh-` prefix backup/export, and the UI says so ("saved on this device only"). Mock/test data uses invented names only.

## What it looks like (mock: 3 views, approved by owner)

1. **Grid (#/people)** — kanji accent `縁` (en — "connection/fate"), serif `People` heading, italic lede with the privacy promise in bold. Toolbar: search (`names, places, plans, notes…`), **⊞ Cards / ☰ List view toggle** (persisted, `jwh-people-view-v1` raw), sort (`recently met ▾` / name / recently seen), crimson `＋ Add person`. Filter chips: All · ★ starred · tags. Grid uses `minmax(280px,1fr)` (4-across at full width — fewer orphan rows); a card with no plan/leaves shows its notes preview in that slot so card heights stay even.
1b. **List view** — dense rows in a single bordered table-card: avatar · ★ name + `flag neighborhood · langs` subline · met story (bold date · place — context) · **next plan / leaves** column (indigo ▸ plan, amber ⏳ leaves, — when none) · `seen date · ×N` · tag chips. Row click opens the same drawer. Mobile: the met-story column collapses; name + plan/leaves + seen survive. Cards: initials avatar (deterministic per-person hue), name + reading, `from · languages` mono subline, **"Met Jul 4 · Fuji Rock — camped in the next tent"** (the emotional hook), tag chips, italic notes preview with left rule, footer = last-seen (green dot ≤7 days, amber "☾ N days ago" when drifting) + contact link.
2. **Detail = right-edge DRAWER** (owner rejected the expanding side panel): a fixed 380px surface slides in from the right edge over the page (240ms ease-out, reduce-motion gated); the page dims behind a scrim and NEVER moves or reflows. Esc / ✕ / scrim-click closes; focus returns to the opener. Label/value rows per the v2 field set; notes block with "updated <date>". Actions: **✓ Seen today** (primary), ★ toggle, ✎ Edit, ＋ Note, Delete (confirm). On ≤560px the drawer is full-width (a sheet).
3. **Empty state** — ⛩️👋, "The people make the year.", human copy, one primary CTA. Doubles as onboarding.

## Data model — `jwh-people-v1` (array)

```js
{
  id: 'p<timestamp>',
  name: 'Kenji',            // required
  reading: '健二',           // optional — kana/kanji or nickname
  star: true,                // ★ "this person's special" — single toggle, no rating scale
  metDate: '2026-07-04',     // required (defaults today)
  metPlace: 'Fuji Rock',     // optional
  metContext: 'camped in the next tent, lent us a tarp',  // optional — the hook
  nationality: 'JP',         // optional country → flag emoji on the card
  from: 'Osaka',             // hometown (distinct from nationality and from…)
  neighborhood: 'Nakameguro',// …where they live/hang in Tokyo — "who's near me right now?"
  leaves: '2026-08-20',      // optional — traveler friends expire; card shows "⏳ leaves Aug 20 — 6 weeks"
  nextPlan: 'Knock Kōenji — he offered to take us',   // the open promise; card shows it as a "▸" pill
  addressAs: 'Kenji — casual, first name',            // Japan etiquette cheat line (san/kun/keigo)
  metThrough: 'Mia',         // connection trail, plain string (no graph)
  food: 'vegetarian-ish',    // dietary/favourite-spot notes — hangouts = eating
  speaks: 'JP, EN', birthday: '11-12',                 // optional; birthday MM-DD or YYYY-MM-DD
  contact: 'LINE @kenji_mod · IG @knj.modular',        // free text, one line
  tags: ['music', 'ramen nerd'],                       // free-form, lowercase
  notes: '…', notesUpdated: '2026-07-06',
  seenCount: 3,              // auto-increments with ✓ Seen today
  lastSeen: '2026-07-06', lastSeenWhere: 'Shimokitazawa',
}
```

**Card renders (v2 mock, owner-approved fields):** ★ top-right (starred cards get a warm amber border), flag + `hometown → lives neighborhood · languages` subline, met line, **⏳ leaves countdown** (amber, when set), **▸ next-plan pill** (indigo — it takes the notes preview's slot when both exist), tag chips, footer `seen <date> · ×N` + contact. **Panel adds rows:** nationality · lives · address-as · next-plan · leaves · met-through · food · seen ×N.

**Star behaviours:** toggle on card + panel; a "★ starred" filter chip leads the tag row; starred people sort to the top within any sort mode.

No schema server, no photos (storage + privacy), no relationship graph, no rating scales. Brainstorm-rejected: emoji avatars, job field. Tags are free-form strings; the filter row is derived from tags present.

## Behaviours

- **CRUD** via the site's modal pattern (focus-trapped, label-outside inputs, all 6 input states). Add defaults `metDate` = today. Delete = `confirmModal` + the calendar-style undo toast if cheap to reuse.
- **✓ Seen today** sets `lastSeen` = today (one tap, no form). "＋ Note" appends to notes and stamps `notesUpdated`.
- **Search** across name/reading/place/context/notes/tags/from/neighborhood/nextPlan. **Sort**: recently met (default) · name · recently seen — starred first within each. **Filter chips**: All · ★ starred · then tags.
- **✓ Seen today** also increments `seenCount`. **Leaves**: card shows a compact countdown; past-`leaves` people stay but the line becomes "left <date>" (they're memories, not clutter — no auto-delete).
- **Contact links**: if the contact text contains an `@handle` or URL, render as link where safe; otherwise plain text. (No deep LINE integration — out of scope.)
- **Birthday**: shown on the card month-of; optionally surfaces as a dashboard "Today" line when it's their birthday (v1.1 — not in v1).
- **Data events**: mutations dispatch `jwh:data-changed` (consistent with the rest of the site); the page re-renders through the single path.
- **Backup**: automatic — backup.js exports all `jwh-*` keys.
- **Usage tracking**: the route is counted automatically by the existing `jwh:route` listener.

## Route & nav

New route `people` in `ROUTES`, placed after `going` (the social cluster): `dashboard, calendar, plan, map, explore, going, people, checklist, budget, rooms, emergency` (11). Number keys: `1–9` cover through budget; `0` must keep meaning **Emergency** — gestures.js's `0` handler currently maps `ROUTES[9]` and its help text hardcodes "Emergency", so the `0` key handler changes to `go('emergency')` explicitly (rooms goes unkeyed; it's episodic). Nav `<a>` order matches ROUTES. View title: `People`. Per-route `document.title` entry.

## Files (new module, small)

- `docs/assets/people.js` (~250 lines) — mount, render (grid/empty), detail panel, edit modal, wiring. Uses `$/$$/esc`, `store`, `confirmModal`, the existing modal-shell pattern.
- `docs/assets/lib/people.js` (~60 lines, pure, Node-tested) — `newPerson(fields, todayIso)`, `searchPeople(list, q)`, `sortPeople(list, mode)`, `tagSet(list)`, `initialsOf(name)`, `hueOf(id)` (deterministic avatar colour).
- `index.html`: nav link + `#view-people` section. `router.js`: ROUTES + TITLES. `style.css`: `.ppl-*` styles (reuse card/chip/panel idioms). `sw.js`: +2 ASSETS, CACHE bump. `lib/store.js`: `people: 'jwh-people-v1'`.

## Out of scope (v1)

Photos · import from contacts · reminders/bell nudges ("haven't seen X in a month") · birthday alerts · relationship graph · linking people to calendar events/places. All possible later; the data model doesn't block any of them.

## A11y & motion

Real buttons everywhere; focus restored across grid re-renders (calendar's `focusRow` pattern); panel = dialog with Esc + focus return; empty state is real content not aria-hidden; entrances 200–250ms ease-out, list stagger 50ms, gated on reduce-motion; 44px touch targets on coarse pointers.
