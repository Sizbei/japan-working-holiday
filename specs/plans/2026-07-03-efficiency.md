# Efficiency Plan — 2026-07-03 (loop-driven)

Baseline (localhost, so network≈free — numbers are parse/mount cost): 92 JS modules / 637KB raw
(196KB gz) all eagerly imported at boot; DOMContentLoaded ≈ 1584ms; tips.json 516KB (156KB gz)
fetched `no-store` every load; style.css 224KB (50KB gz).

Rules per stage: function-preserving, branch → PR → squash-merge, SW bump, tests + CDP
before/after metrics, extensive review (critics on anything non-trivial).

- [x] **EF1 — Lazy Phrases bundle.** *(boot 92→77 files, −100KB, DCL 1584→170ms; phrases mounts on demand, POTD stays eager; PR #31, SW v206)* The 12 phrases-page modules (~76KB: phrases, vocab, kana,
      numbers, signs, quiz, pronunciation, particles, verbs, adjectives, pointtosay + collapse
      seed) mount at boot for the least-visited route. Move to `phrasesboot.js`, dynamic-import
      on first `#/phrases` entry (and on direct load). `phraseday` stays eager (dashboard widget).
      Verify: boot module count/bytes drop; phrases page fully mounts on first visit; dashboard
      phrase-of-the-day unaffected.
- [ ] **EF2 — tips.json stale-while-revalidate (SW-level).** Serve the cached copy instantly,
      revalidate in the background (data at most one visit stale). NOTE: softens the
      "updates always land when online" guarantee to "…by the next load" for tips.json only —
      flag to owner in the PR.
- [ ] **EF3 — Don't re-render hidden views.** calendar/checklist re-render on every
      jwh:data-changed even when off-route (map already defers via pinsDirty). Dirty-flag +
      render-on-entry, preserving the single-path data flow.
- [ ] **EF4 — boot double-work audit.** mount + first jwh:route both trigger refresh paths
      (dashboard refresh ran twice pre-weather-dedup; sweep for remaining doubles).
