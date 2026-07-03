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
- [ ] **EF3 — Don't re-render hidden views.** calendar/checklist re-render on every
      jwh:data-changed even when off-route (map already defers via pinsDirty). Dirty-flag +
      render-on-entry, preserving the single-path data flow.
- [ ] **EF4 — boot double-work audit.** mount + first jwh:route both trigger refresh paths
      (dashboard refresh ran twice pre-weather-dedup; sweep for remaining doubles).
