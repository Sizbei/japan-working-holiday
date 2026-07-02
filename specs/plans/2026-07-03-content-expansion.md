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

## Staged execution ledger

Rules for every stage: branch off fresh `main` (`feat/exp-s<N>`), additive only (no existing
behavior changes), every dynamic string through esc(), bump docs/sw.js CACHE + precache any new
assets, `node --test tests/lib.test.mjs` green + curly guard clean + CDP smoke, PR → squash-merge,
then tick the stage here with a one-line note. Identity-free commits ("WHV Guide"). A stage is
one PR; if it grows, split it.

- [x] **S0 — Event research + bake (A1).** 15 new events Jul26–Mar27, plan doc. *(PR #13, SW v191)*
- [x] **S1 — Pillar cards (A2).** *(12 cards baked: restaurants 14→18, geek 13→17, music 15→19; all 2026-verified, 1 medium-confidence; PR #15, SW v192)* +10–15 tips.json cards: restaurants (listening bars, jazz
      kissa, standing sushi), geek (Nakano Broadway floors, Hard-Off crawl, retro arcades),
      music (Koenji/Shimokita live houses). Verify: JSON valid, cards render on #/explore,
      correct schema (content-card, NOT findings).
- [ ] **S2 — Day-plan template library (B2).** 5–8 baked itineraries in tips.json
      (`planTemplates[]`: Akihabara retro crawl, Yanaka–Nezu walk, Shimokita record day, Odaiba,
      Kamakura day-trip) + a "start from a template" strip on #/plan that copies one into
      jwh-dayplans-v1 for a chosen date. Verify: CDP — template copies, stops render, map route
      draws; existing plan CRUD untouched.
- [ ] **S3 — "This week" band on Explore (B1).** Display-only strip of the next 7 days from
      allEvents() at the top of #/explore. Verify: CDP — matches calendar data, zero mutations.
- [ ] **S4 — Post-arrival findings + phrase packs (A3+A4).** New domains[] findings (ward
      office/bank/phone reality) + phrases (izakaya, barber, redelivery). Content only.
- [ ] **S5 — Photo-spots map layer (B3).** New catalogue category riding the existing
      pin/filter system (golden-hour spots, skyline views). Data + one filter chip.
- [ ] **S6 — Typhoon-season emergency data (A5).** Prep list + JMA advisory note on
      #/emergency. Content only. **Ship before August.**
- [ ] **S7 — Year-in-review stats widget (B4).** Read-only dashboard widget from existing
      stores: places visited, events attended (past ✓ Going), tasks done, days in.
- [ ] **S8 — Monthly content re-research routine.** Cloud routine (like the daily PR sweep)
      that re-runs the A1 research monthly and opens a data PR; the sweep reviews/merges it.
- [ ] **S9 — Pollen/air-quality strip (B5a).** Open-Meteo air-quality on the weather strip.
      **Scheduled: late January 2027** (kafun season).
- [ ] **S10 — Sakura front tracker (B5b).** Forecast window strip. **Scheduled: late Feb 2027.**
