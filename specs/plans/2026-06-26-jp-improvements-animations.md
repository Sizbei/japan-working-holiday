# 20-Stage Japanese Improvement + Animation Pass

> Autonomous build (user: "do 20 stage japanese improvement… add animations… continue every 20 minutes… try not to have my involvement"). Self-authored, executed in batches across ~20-min wake-ups. This file is BOTH the plan and the recovery ledger — trust it + `git log` after any context reset.

**Constraints (inherited from CLAUDE.md):** zero-build, dependency-free, no new CDNs (Google Fonts only). Every dynamic string through `esc()`. Data-driven from `tips.json` where possible. All motion gated behind the existing reduce-motion infra (`prefers-reduced-motion`, `html[data-reduce-motion="on"]`, `motion.js prefersReducedMotion()`) AND `@media (hover:hover) and (pointer:fine)` for hover effects. Bump `sw.js` CACHE + add new `assets/*.js` to ASSETS on every asset change. Keep `node --test tests/lib.test.mjs` green. Identity-free commits ("WHV Guide"). Deploy = merge to `main` + push.

**Motion budget (from design-principles.md):** entrances 200–300ms · exits 150–200ms · feedback <100ms · list stagger 50ms/item · hover scale +5% · UI easing `cubic-bezier(0.23,1,0.32,1)` · never `scale(0)` (start 0.95) · GPU-only (transform+opacity) · prefers-reduced-motion = gentler not zero (keep opacity/color, drop movement).

## Ledger (status: ☐ todo · ◐ in-progress · ☑ done+deployed)

- ☑ **S1** CJK typography + ruby/furigana CSS + jp font stack
- ☑ **S2** Route-view entrance cascade (anim.js) + ruby infra — NOTE: hover-lift/press already existed (style.css 906–920), so S2 delivers NEW motion instead of duplicating
- ☐ **S3** Furigana support in phrases (ruby render + `furi` data field + toggle)
- ☐ **S4** Phrasebook content expansion (+~40 phrases; new cats: Bank, Pharmacy/Medical, SIM/Phone, Job)
- ☐ **S5** Audio pronunciation (Web Speech `SpeechSynthesis` ja-JP) + speaker button + play animation
- ☐ **S6** Politeness-level tags (casual/polite/keigo) + filter chip
- ☐ **S7** Point-to-say survival cards (big-text; incl. Vyvanse pharmacy/import card)
- ☐ **S8** Staggered list-reveal across checklist / phrases / explore (uses `stagger()`)
- ☐ **S9** JLPT N5 starter vocab dataset + study integration
- ☐ **S10** Kana reference chart (hiragana/katakana) w/ reveal animation
- ☐ **S11** Numbers / counters / money / dates helper
- ☐ **S12** Daily-life kanji signs recognition set (入口/出口/押/引/営業中…)
- ☐ **S13** Expand hover-dictionary GLOSSARY + more frame i18n coverage
- ☐ **S14** Phrase-of-the-day dashboard widget (subtle flip/reveal)
- ☐ **S15** Quiz / self-test mode (JP↔EN) w/ feedback animations
- ☐ **S16** Count-up animations (countdown digits, progress bars)
- ☐ **S17** Restaurant/menu deep vocab + dietary/allergy phrases
- ☐ **S18** Locale-aware JP formatting + pitch-accent/pronunciation tips
- ☐ **S19** Anki export improvements (readings/furigana fields) + offline lookup cache
- ☐ **S20** Final adversarial review + regression (tests, a11y contrast, reduce-motion verify, SW bump) + deploy

## Per-stage exit criteria
Each stage: implement → `node --test tests/lib.test.mjs` green → curly-quote guard (`grep -rnP '=\x{201D}' docs/assets docs/index.html` clean) → bump SW CACHE → serve + spot-check → commit → merge to main → push. Append a ledger line: `Sn: done (commits a..b)`.

## Notes / decisions log
(append as we go)
- S1: ruby/<rt> furigana + .jp-cjk/.jp-display utilities (style.css tail).
- S2: anim.js route-view first-visit cascade, transform-only (no opacity flash vs root crossfade), wired in main.js boot after initRouter, in SW v123.
