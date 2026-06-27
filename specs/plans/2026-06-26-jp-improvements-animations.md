# 20-Stage Japanese Improvement + Animation Pass

> Autonomous build (user: "do 20 stage japanese improvement… add animations… continue every 20 minutes… try not to have my involvement"). Self-authored, executed in batches across ~20-min wake-ups. This file is BOTH the plan and the recovery ledger — trust it + `git log` after any context reset.

**Constraints (inherited from CLAUDE.md):** zero-build, dependency-free, no new CDNs (Google Fonts only). Every dynamic string through `esc()`. Data-driven from `tips.json` where possible. All motion gated behind the existing reduce-motion infra (`prefers-reduced-motion`, `html[data-reduce-motion="on"]`, `motion.js prefersReducedMotion()`) AND `@media (hover:hover) and (pointer:fine)` for hover effects. Bump `sw.js` CACHE + add new `assets/*.js` to ASSETS on every asset change. Keep `node --test tests/lib.test.mjs` green. Identity-free commits ("WHV Guide"). Deploy = merge to `main` + push.

**Motion budget (from design-principles.md):** entrances 200–300ms · exits 150–200ms · feedback <100ms · list stagger 50ms/item · hover scale +5% · UI easing `cubic-bezier(0.23,1,0.32,1)` · never `scale(0)` (start 0.95) · GPU-only (transform+opacity) · prefers-reduced-motion = gentler not zero (keep opacity/color, drop movement).

## Ledger (status: ☐ todo · ◐ in-progress · ☑ done+deployed)

- ☑ **S1** CJK typography + ruby/furigana CSS + jp font stack
- ☑ **S2** Route-view entrance cascade (anim.js) + ruby infra — NOTE: hover-lift/press already existed (style.css 906–920), so S2 delivers NEW motion instead of duplicating
- ☑ **S3** Furigana support in phrases (ruby render + `furi` data field + toggle)
- ☑ **S4** Phrasebook content expansion (+~40 phrases; new cats: Bank, Pharmacy/Medical, SIM/Phone, Job)
- ☑ **S5** Audio pronunciation (Web Speech `SpeechSynthesis` ja-JP) + speaker button + play animation
- ☑ **S6** Register badges (casual/keigo) — ADAPTED: phrasebook is intentionally uniform teineigo, so a 3-way filter would be near-useless and bulk-tagging risks wrong nuance; instead badge only the 4 phrases that genuinely deviate
- ☑ **S7** Point-to-say survival cards (big-text; incl. Vyvanse pharmacy/import card)
- ☑ **S8** Staggered list-reveal — anim.js now picks ONE strategy per view (rows vs cards) to avoid compounding motion
- ☑ **S9** JLPT N5 starter vocab dataset + study integration
- ☑ **S10** Kana reference chart (hiragana/katakana) w/ reveal animation
- ☑ **S11** Numbers / counters / money / dates helper
- ☑ **S12** Daily-life kanji signs recognition set (入口/出口/押/引/営業中…)
- ☑ **S13** Expand hover-dictionary GLOSSARY + more frame i18n coverage
- ☑ **S14** Phrase-of-the-day dashboard widget (subtle flip/reveal)
- ☑ **S15** Quiz / self-test mode (JP↔EN) w/ feedback animations
- ☑ **S16** Count-up animations (countdown digits, progress bars)
- ☑ **S17** Restaurant/menu deep vocab + dietary/allergy phrases
- ☑ **S18** Locale-aware JP formatting + pitch-accent/pronunciation tips
- ☑ **S19** Anki export improvements (readings/furigana fields) + offline lookup cache
- ☑ **S20** Final adversarial review + regression (tests, a11y contrast, reduce-motion verify, SW bump) + deploy

## Per-stage exit criteria
Each stage: implement → `node --test tests/lib.test.mjs` green → curly-quote guard (`grep -rnP '=\x{201D}' docs/assets docs/index.html` clean) → bump SW CACHE → serve + spot-check → commit → merge to main → push. Append a ledger line: `Sn: done (commits a..b)`.

## Notes / decisions log
(append as we go)
- S1: ruby/<rt> furigana + .jp-cjk/.jp-display utilities (style.css tail).
- S2: anim.js route-view first-visit cascade, transform-only (no opacity flash vs root crossfade), wired in main.js boot after initRouter, in SW v123.
- S3: furigana ruby — 50/59 phrases got verified `furi` [base,reading] arrays (each reconstructs jp exactly); rubyJp() renders <ruby> with esc() per part; data-word keeps hover-dict lookups clean (lang.js prefers el.dataset.word); 'あ Furigana' toggle (#phraseFuri, KEYS.furi) hides rt + reading line via .furi-off. SW v124.
- S5: speak.js — native SpeechSynthesis ja-JP (rate .92, picks a ja voice), 🔊 per phrase row, gated on canSpeak(); .is-speaking pulse (reduce-motion gated). SW v125. (Did S3+S5 this cycle; S4 next.)
- S4: +20 phrases (59→79) in 4 new cats — Bank(5), Phone/SIM(4), Pharmacy(5, incl. import-permit phrase for Vyvanse), Job(6). All carry verified furi. CATEGORY_ORDER updated. SW v126. (Note: targeted ~20 high-value over a padded 40.)
- S6: `reg` field on 4 deviating phrases (助けて=casual; いただけますか/よろしくお願いします/ございました=keigo); small token-colored badge by the English; no filter (low value for a uniform-register set). SW v127.
- S7: pointtosay.js — 6 'Point & show' cards at top of #/phrases (data: pointToSay[]); tap → big-text modal (showModal wide) you show staff; incl. the ADHD/Vyvanse import-certificate card + hospital/allergy/lost/police/no-Japanese; speaker on each. SW v128.
- S8: anim.js reveal() upgraded — list-heavy views (≥3 .check-item/.phrase-row) stagger rows (32ms step, cap 16); other views cascade top-level cards (45ms). Single strategy per view = no block+row compounding. First-visit, transform-only, reduce-motion gated. SW v129.
- S9: vocab.js — 45 N5 starter words (vocab[], 7 themes: Numbers/Time/Places/People/Verbs/Adjectives/Daily), collapsible on #/phrases, reuses phrase-row styling + furigana + speaker. Extracted lib/furigana.js (rubyHTML) shared by phrases+vocab; furi toggle retargeted to #phrases so it covers both. SW v130.
- S10: kana.js — collapsible gojūon chart on #/phrases, ひらがな/カタカナ toggle, tap any kana to hear it (speak), cells stagger in on first expand (reduce-motion gated). Static reference data in-module. SW v131.
- S11: numbers.js — collapsible reference (money ¥1–¥10000, counters with rendaku, days of week, irregular month-days, the 万 grouping note); tap to hear. Curated/static (avoids reading-gen bugs). SW v132.
- S12: signs.js — 20-sign recognition grid (signs[] in tips.json): 入口/出口/非常口/押/引/営業中/準備中/危険/立入禁止… tap to hear. Collapsible.
- S13: GLOSSARY 31→53 terms (signs, ward-office/bank/transit/pharmacy vocab, kana/kanji/furigana meta) for instant offline hover glosses; added head.vocab i18n + data-i18n on the vocab heading. SW v133.
- S14: phraseday.js — dashboard widget (#wPhrase) shows a phrase chosen deterministically by today's date, furigana+audio, 'Another ↻' shuffle; card flips/reveals on render (reduce-motion gated). i18n head.widget.potd. SW v134.
- S15: quiz.js — multiple-choice self-test over phrases+vocab (124 items), JP→EN / EN→JP toggle, 4 options, running score; correct flashes green+pulse, wrong shakes red and reveals the answer (motion reduce-motion gated, color kept). Collapsible on #/phrases. SW v135.
- S16: countup.js — readiness score tallies 0→N (ease-out cubic, 900ms) the first time the dashboard shows, once per session via data-countup; reduce-motion shows final value instantly. (Progress bars already animate via CSS width transitions.) SW v136.
- S17: +6 Restaurant phrases, +6 new 'Dietary' category (vegan/pork/egg-allergy/allergens/halal/wheat), +13 'Food' vocab words — all with verified furigana. phrases 79→91, vocab 45→58. CATEGORY_ORDER+Dietary, THEME_ORDER+Food. SW v137.
- S18: pronunciation.js — 7 tips (pitch-not-stress, vowel length, small っ, moraic ん, devoicing, ら-flap, question rise) with audio examples; lib/jpdate.js formats 年月日（曜日） shown as a live 'today in Japanese' line. App-wide date reformatting descoped as high-risk/low-ROI. SW v138.
- S19: offline dict cache — lookupWord now caches Jotoba results (incl. confirmed 'no match') in KEYS.dictCache (cap 600) → instant repeat hovers + works offline. Anki full export now also includes the 58 study-vocab words (tagged 'vocab'+theme). SW v139.
- S20: regression GREEN — 64 tests, JSON valid, curly-clean, all 138 furigana reconstruct exactly, 83 assets all precached, reduce-motion gated everywhere. Independent code-review APPROVED (0 critical/0 high); fixed its 2 MEDIUM (phrases.js import hygiene) + 1 LOW (quiz now uses explicit data-correct, not jp-uniqueness). SW v140. BUILD COMPLETE 20/20.
