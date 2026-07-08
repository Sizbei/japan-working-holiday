# 縁 People (trip PRM) — implementation plan (2026-07-08)

Spec: `specs/2026-07-08-people-prm-design.md` (mock approved). Branch → PR → squash per stage or one PR for S1–S3 if diffs stay small. Verify gate per stage: `node --test` green · page renders with 0 console errors · SW bumped.

**Global constraints:** PUBLIC repo — no real names anywhere committed (tests/mocks use invented names). All data `jwh-people-v1` localStorage. `esc()` on every dynamic string. Single-path data flow (`set → jwh:data-changed → render`). Real buttons; focus restored across re-renders; reduce-motion gated.

## S1 — Pure lib + route scaffold
- [ ] `docs/assets/lib/people.js`: `newPerson(fields, todayIso)` (id `'p'+ts` passed in — no Date.now in pure code; validate name required, default metDate=today), `searchPeople(list, q)` (case-insensitive across name/reading/metPlace/metContext/notes/tags/from), `sortPeople(list, mode)` (`met`|`name`|`seen`), `tagSet(list)` (sorted unique lowercase), `initialsOf(name)` (1–2 chars, CJK-aware: first char if CJK), `hueOf(id)` (stable hash → one of ~10 site-palette colours).
- [ ] Tests in `tests/lib.test.mjs` (~6): search hits notes+tags, sort modes incl. missing lastSeen last, tagSet dedupe, initials for CJK + latin, hue stability, newPerson validation. **Invented names only.**
- [ ] `lib/store.js`: `people: 'jwh-people-v1'`.
- [ ] `router.js`: `people` in ROUTES after `going`; TITLES entry. `index.html`: nav `<a>` (matching position) + empty `<section id="view-people" class="view">` shell with kanji header `縁` / `People` / lede (privacy line bold). `gestures.js`: change key `0` handler from `ROUTES[9]` to explicit `go('emergency')` (rooms goes unkeyed); confirm help overlay stays truthful (it derives 1–9 from ROUTES; the `0` row already says Emergency).
- Verify: route reachable (`#/people` + nav + key 7), empty shell renders, tests green.

## S2 — Grid, empty state, detail panel
- [ ] `docs/assets/people.js` `mountPeople()`: render grid from store through search/sort/tag-filter state (module-local, not persisted); empty state (⛩️👋 + CTA) when no people AND no active filter; "no results" variant when filtered (distinct copy per design checklist).
- [ ] Card per mock: avatar (initials + `hueOf`), name+reading, from·speaks subline, met line (`Met <b>date · place</b> — context`), tag chips, notes preview (2-line clamp), footer last-seen (green dot ≤7d, amber `☾ Nd ago` >7d, "—" never) + contact (linkify only `https?://` URLs; handles stay text).
- [ ] Detail panel: reuse the calendar side-panel pattern (portal, Esc, focus return, document-anchored). Rows per mock; actions `✓ Seen today` (sets lastSeen=today → data-changed), `✎ Edit`, `＋ Note` (prompt-style small modal appending to notes + notesUpdated), `Delete` (confirmModal).
- [ ] Wire in `main.js` (`safe(() => mountPeople())`), re-render on `jwh:data-changed` only when route active (EF3 dirty-flag pattern).
- Verify: add via devtools-seeded data renders; panel opens/closes with focus correct; search/sort/tags live-filter; 0 errors.

## S3 — Add/Edit modal + polish
- [ ] Modal (site modal-shell pattern): fields name*, reading, met date (default today)/place/context, from, speaks, birthday (MM-DD ok), contact, tags (comma input → chips), notes. Label-outside, all 6 input states, submit validates name.
- [ ] Focus restoration across grid re-renders (calendar `focusRow` pattern keyed by person id).
- [ ] `style.css` `.ppl-*` (~80 lines): grid `repeat(auto-fill,minmax(300px,1fr))`, card 24px padding, entrance stagger 50ms gated on reduce-motion, 44px touch targets under `(hover:none)`.
- [ ] `sw.js`: +`assets/people.js`, +`assets/lib/people.js`, CACHE bump.
- Verify: full CRUD loop headless (add → edit → seen-today → note → delete/undo?) with 0 errors; mobile 600px render sane.

## S4 — Review & ship
- [ ] Adversarial critic (Opus) over the diff: esc discipline on all person fields (user-typed → innerHTML), focus paths, single-path flow, no real-name leakage in tests/fixtures, ROUTES/keys invariants.
- [ ] Fix findings → merge → live-site smoke.

**Deferred (v1.1 candidates, spec'd not built):** birthday surfacing on dashboard "Today" · "haven't seen in a while" nudges · linking a person to a calendar event/place · export people as vCard.
