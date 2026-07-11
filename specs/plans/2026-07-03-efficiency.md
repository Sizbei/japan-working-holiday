# Efficiency Plan — 2026-07-03 (loop-driven)

Baseline (localhost, SW bypassed, median of 5 — numbers are parse/mount cost): 92 JS modules /
637KB raw (196KB gz) all eagerly imported at boot; median DOMContentLoaded ≈ 771ms (high variance); tips.json 516KB (156KB gz)
fetched `no-store` every load; style.css 224KB (50KB gz).

Rules per stage: function-preserving, branch → PR → squash-merge, SW bump, tests + CDP
before/after metrics, extensive review (critics on anything non-trivial).

- [x] **EF1 — Lazy Phrases bundle.** *(boot 92→77 files, −100KB. CORRECTED metrics after review: controlled A/B (worktree of the pre-change revision vs main, SW bypassed on both, fresh profile, median of 5): DCL 771ms → 215ms (−72%); the originally-claimed 1584ms baseline was a single noisy first run. PR #31 + review-fix PR, SW v206→207)* The 12 phrases-page modules (~76KB: phrases, vocab, kana,
      numbers, signs, quiz, pronunciation, particles, verbs, adjectives, pointtosay + collapse
      seed) mount at boot for the least-visited route. Move to `phrasesboot.js`, dynamic-import
      on first `#/phrases` entry (and on direct load). `phraseday` stays eager (dashboard widget).
      Verify: boot module count/bytes drop; phrases page fully mounts on first visit; dashboard
      phrase-of-the-day unaffected.
- [x] **EF2 — tips.json stale-while-revalidate (SW-level).** *(2nd-load tips.json: 5ms / 0 bytes from SW cache, background revalidate; trade-off: data deploys land on the NEXT load; PR #32, SW v207)* Serve the cached copy instantly,
      revalidate in the background (data at most one visit stale). NOTE: softens the
      "updates always land when online" guarantee to "…by the next load" for tips.json only —
      flag to owner in the PR.
- [x] **EF3 — Don't re-render hidden views.** *(dispatch cost 10ms→~0-2ms; adversarially reviewed pre-merge, SIGN-OFF; double-render findings fixed; PR #33, SW v208)* calendar/checklist re-render on every
      jwh:data-changed even when off-route (map already defers via pinsDirty). Dirty-flag +
      render-on-entry, preserving the single-path data flow.
- [x] **EF4 — boot double-work audit.** *(audit found only the documented-intentional dashboard teaser dual-trigger, sub-ms — closed with no action)* mount + first jwh:route both trigger refresh paths
      (dashboard refresh ran twice pre-weather-dedup; sweep for remaining doubles).
- [x] **EF5 — Lazy route-only pages (people / rooms / going).** *(boot eager assets/*.js 86→83; ~74KB JS moved off the boot path — people.js 36K + rooms.js 20K + lib/rooms.js 12K + going-page.js 8K, minus the ~2K helper. CDP-verified: 0 exceptions, all three paint on first visit (direct-load AND hash-change), the people-open race is proven (unfixed dispatch misses the listener; the shipped await-path opens the drawer). SW v306→v307.)* Three route-only pages
      parse+mount at boot for pages the user may never open. New `lazyroutes.js` (`registerLazyRoute` +
      `ensureRoute`) dynamic-imports each on first `#/people|#/rooms|#/going` entry, mirroring EF1.
      Two gotchas handled: (a) first-paint — the module's own `jwh:route` "render on entry" listener
      attaches AFTER the triggering event fired, and the `.is-active` toggle runs in a View-Transition
      microtask, so first paint is keyed on `location.hash` (rooms) / an unconditional mount render
      (people, going); (b) the calendar "縁 met here" jump (`jwh:people-open`) now `await`s
      `ensureRoute('people')` before dispatching, or the listener isn't attached yet. `lib/people.js`
      stays eager (dashboard `isBirthday`); `lib/rooms.js` defers with rooms. Deferred: map+plan bundle
      (EF6 — Leaflet cold-start + `placesModel` DATA coupling need their own isolated verification).
- [x] **EF6 — Lazy map + plan bundle.** *(boot eager assets/*.js 83→76; map.js 64K + plan.js 24K + their now-unreachable libs off the boot path — the biggest single stage. CDP-verified: 0 exceptions; Leaflet cold-start renders 12 tiles on first lazy #/map visit; plan rail+body paint on first #/plan visit; plan-goto listener responds (empty-date clears, back-to-Jul-4 restores); BOTH orders correct — plan-first keeps Leaflet unloaded until #/map is shown. SW v307→v308.)* map.js 64K + plan.js 24K
      parsed+mounted at boot for two pages the user may never open. They share ONE lazy bundle because
      `plan.js` imports `placesModel/drawRoute/clearRoute` from `map.js` and `placesModel()` reads map's
      module-level `DATA` set ONLY by `mountMap` — so the loader always mounts BOTH (map first). Extra
      gotcha beyond EF5: Leaflet cold-start — map's route-entry body (`ensureLeaflet` + `onMapShown` +
      route redraw) was inline in the `jwh:route` handler, which never fires for the entry that
      triggered the lazy load; extracted to `enterMap()` and called hash-gated at mount end. The
      `ensureLeaflet→loadScript→initMap` chain self-completes via the script-load callback (sets
      `leafletReady`, calls `onMapShown`), independent of `jwh:route` — unchanged by EF6. `jwh:plan-goto`
      (gestures long-press) now navigates first, then `await ensureRoute('plan')` before dispatching.
