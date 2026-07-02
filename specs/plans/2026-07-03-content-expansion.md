# Content & Additive-Feature Expansion Plan — 2026-07-03

Constraint (owner): everything here ADDS to the site without changing existing function.
Two tracks: **A = content only** (tips.json edits, zero code — the architecture's happy path),
**B = additive modules** (new display-only surfaces; no existing behavior altered).

## Track A — content (tips.json only)

- **A1. Event calendar expansion (THIS PR).** 18–25 researched, dated events Jul 2026 → Mar 2027:
  summer hanabi (Sumida/Adachi/Edogawa/Jingu Gaien), Koenji Awa-Odori, Asakusa Samba, Comiket
  (Aug + Dec), Tokyo Game Show, Summer Sonic, Design Festa, Kanda Book Festival, Tori-no-ichi,
  Shibuya Halloween, koyo windows, winter illuminations, NYE/hatsumode, Setsubun, Tokyo Marathon,
  AnimeJapan, sakura 2027. Every entry carries `confidence` (estimates = medium/low, "verify closer").
- **A2. Pillar-card growth.** +10–15 cards across `restaurants` (listening bars, jazz kissa,
  standing sushi), `geek` (Nakano Broadway floor guide, Hard-Off crawl route, retro arcades beyond
  Akiba), `music` (small live houses in Koenji/Shimokitazawa, club nights calendar anchors).
- **A3. Post-arrival domain findings.** New `domains[]` findings for month 1–3 life: ward-office
  nuances learned on the ground, bank-account reality, IC-card/phone-plan updates, sento etiquette.
- **A4. Phrase packs.** `phrases` additions: izakaya ordering flow, barber vocabulary, ward-office
  counter phrases, delivery/redelivery call script.
- **A5. Emergency page data.** Typhoon-season prep list (Aug–Oct), embassy re-registration note.

## Track B — additive modules (new code, display-only, nothing existing changes)

- **B1. "This week" band on Explore.** Derives from the EXISTING calendar data: a horizontal strip
  of the next 7 days' events. Pure display; reuses allEvents().
- **B2. Day-plan template library.** 5–8 baked itineraries (Akihabara retro crawl, Yanaka–Nezu
  old-town walk, Shimokitazawa record-shop day, Odaiba day, Kamakura day-trip) shown on #/plan as
  "start from a template" — one tap copies into the user's plan store. Additive: the planner's own
  flow is untouched.
- **B3. Photo-spots map layer.** A new catalogue category (golden-hour spots, skyline views,
  torii/temple frames) — rides the existing pin/filter system as data.
- **B4. Year-in-review stats.** A small dashboard widget derived from existing stores: places
  visited (hanko count exists), events attended (past ✓ Going), tasks done, days in. Read-only.
- **B5. Seasonal strips (deferred to season).** Pollen/air-quality on the weather strip (Feb),
  typhoon advisories via JMA (Aug–Oct), sakura-front tracker (Mar).

## Cadence

- Monthly content re-research (the A-track) can be delegated to the existing cloud routine pattern —
  a "research + open a data PR" job; the daily PR sweep already reviews and merges data PRs safely
  since content edits can't break code (JSON validation + tests gate them).

## Status

- [x] A1 researched + baked (this PR)
- [ ] A2–A5, B1–B4 — owner picks order; each ships as its own small PR
