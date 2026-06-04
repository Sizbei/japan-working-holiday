# Project Plan — "My Year in Japan" Site

**Repo:** `japan-working-holiday` (public) · **Live:** https://sizbei.github.io/japan-working-holiday/
**What it is:** A personal, identity-free hub for a year in Tokyo on a Canadian Working Holiday Visa — logistics + life + culture, tuned to a builder's interests (games, music software, anime/tech, remote work). Static site (vanilla HTML/CSS/JS), GitHub Pages from `/docs`, all interactive state saved in the browser (localStorage).

---

## Guiding principles

1. **Identity-free, interest-personalized.** No personal name or company names anywhere public. Personalization shows up as *which topics appear*, in first-person voice.
2. **Static & dependency-free.** No build step, no frameworks, no new CDNs (except existing Google Fonts). Must keep working on plain GitHub Pages.
3. **Data-driven.** All content lives in `docs/data/tips.json`; the page renders from it. Adding content = editing JSON, not code.
4. **Private interactivity.** Checklist, brew scratchpad, idea cards, theme — all localStorage, nothing leaves the device.
5. **Sourced & current.** Every researched item carries source links; flag confidence; verify time-sensitive facts (visa, tax, Disney systems, event dates).
6. **Surgical changes.** Small, safe, reversible edits. The page must always load.

---

## Current state (done)

- [x] Repo created, public, GitHub Pages live from `/docs`.
- [x] Name removed from content; git author neutralized ("WHV Guide").
- [x] Data-driven renderer (`app.js`) + Japan-accent design (`style.css`).
- [x] Sections live: Time-Sensitive, Canada notes, Arrival sequence, Top moves, Logistics domains, Sources.
- [x] Personal pillars scaffolded (loading states): Building From Tokyo, Music/Gear, Games/Anime/Tech, Meetups & Conventions.
- [x] Content pillars scaffolded (loading states): Activities, Restaurants (budget filter), Tokyo Disney.
- [x] **Brainstorm & Brew**: autosaving scratchpad + add/delete idea cards.
- [x] **Yearlong checklist**: seeded with 8 phases / 51 items, checkboxes + progress bar persist.
- [x] First-person voice, wider (1100px) mobile-first layout, dark mode, search + filters.

---

## The plan from here (deliberate, no background swarms)

### Phase 1 — Lock the foundation _(next)_
- [ ] Decide content-population approach: **manual curated passes** (I research a pillar, you review, we commit) instead of long autonomous workflows.
- [ ] Confirm scope priority order for the empty pillars (which fills first).
- [ ] Quick accessibility + mobile polish pass (skip-link, focus states, contrast, tap targets) — small, by hand.

### Phase 2 — Fill content, one pillar at a time
For each pillar: research → draft JSON entries (with sources + confidence) → you review → commit → push. Order TBD with you, suggested:
- [ ] **Restaurants** (broad, all budgets) — highest everyday value.
- [ ] **Building From Tokyo** (coworking, work cafés, timezone/async) — you'll need this fast.
- [ ] **Meetups & Conventions** (Connpass/Meetup groups, TGS, Comiket, AnimeJapan, Maker Faire).
- [ ] **Music/Gear** (Ochanomizu, synth shops, Disk Union, listening bars).
- [ ] **Games/Anime/Tech** (Akihabara, arcades, Nakano Broadway, teamLab).
- [ ] **Seasonal Activities** (hanami, fireworks, koyo, illuminations) — ties into the checklist.
- [ ] **Tokyo Disney** (parks, Premier Access/Standby, Fantasy Springs, seasonal).

### Phase 3 — Enrich the interactive tools
- [ ] Checklist: refine items as research lands; add per-item due windows.
- [ ] Brew: optional export/import of notes (copy-to-clipboard JSON) so it's portable across devices.
- [ ] Optional: link checklist items to relevant pillar entries.

### Phase 4 — Polish & ship
- [ ] Design refinement pass (spacing rhythm, micro-interactions, empty states).
- [ ] Performance (defer script, verify font-display, no layout thrash).
- [ ] Final verification: JSON valid, all section ids wired, no name leaked, paths relative.
- [ ] Optional: custom touches (favicon, OG meta — identity-free).

---

## Open decisions for you

1. **Population method:** manual curated passes (recommended) vs. re-running workflows? _(Killed the workflows per your call.)_
2. **Pillar priority:** which empty section do we fill first?
3. **Privacy:** keep the repo public, or flip to private (Pages then needs GitHub Pro to stay live)?
4. **Return flight:** still one-way on the calendar — affects visa proof-of-funds bracket. Add a return when known?

---

## File map

```
japan-working-holiday/
├── PLAN.md            ← this file (source of truth for direction)
├── README.md
└── docs/              ← GitHub Pages root
    ├── index.html
    ├── assets/
    │   ├── style.css
    │   └── app.js
    └── data/
        └── tips.json  ← all content; edit here to add/change content
```

## localStorage keys (browser-saved state)
- `jwh-theme` — light/dark
- `jwh-checklist-v1` — checked items
- `jwh-brew-notes-v1` — scratchpad text
- `jwh-brew-ideas-v1` — idea cards
