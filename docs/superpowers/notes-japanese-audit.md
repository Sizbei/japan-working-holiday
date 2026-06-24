# Japanese hover / integration audit (loop notes)

Running log of the JP-hover QA loop. AI-review → plan → fix ONE high-value issue per iteration.

## Inventory — where Japanese is rendered, and is it wired to the hover dictionary?

| Site | File | `.jp` class? | `wireJpAccents`? | `lang="ja"`? | Verdict |
|---|---|---|---|---|---|
| Static card accents | index.html (20×) | yes | `wireJpAccents(document)` at mount | n/a (inline) | OK |
| Nav in JP mode | lang.js `applyLang` | `[data-jp]` attr | delegated hover/focus/tap | `el.lang='ja'` | OK |
| Phrase rows | phrases.js `rowHTML` | yes | `wireJpAccents(wrap)` (l299) | yes (l258) | OK |
| Emergency card JP | emergency.js | yes | `wireJpAccents(#view-emergency)` (l73) | yes (l61) | OK |
| Per-card 訳 output | cardtranslate.js | no | no | **no** | see below |
| Translate-tool result | phrases.js `wireTranslateInner` | no | no | **no** | see below |
| Dictionary lookup reading | phrases.js `runLookup` | no | no | **no** | see below |

## Findings

- **F1 (FIXED, c63e543):** hover dictionary was hover/focus-only → dead on touch. Added an explicit
  tap path (click a `.jp` accent → popover; tap-outside → dismiss; nav `[data-jp]` excluded so it
  still navigates) + `aria-live=polite` so async Jotoba results are announced. Browser-verified.

- **F2 (REJECTED):** "wrap per-card 訳 / translate-tool output in `.jp` + wireJpAccents." Those
  outputs are full *sentences*; the dictionary does single-*word* Jotoba lookup, so wrapping a
  sentence yields a useless whole-sentence lookup. Genuine word-level lookup there needs a
  tokenizer (out of scope). Both already expose a "Dictionary ↗" link. Not applying.

- **F3 (FIXING this iteration):** machine-translation output is Japanese but carries no `lang="ja"`.
  Consequence: screen readers read it with the page (English) voice — WCAG 3.1.2 Language of Parts —
  and CJK glyph/font selection can be wrong. The static + phrase-row + emergency JP all set it; the
  three *dynamic MT* sites don't. Fix = mark the Japanese output `lang="ja"` (per-card 訳 is always
  EN→JA; translate-tool only when `to==='ja'`; lookup reading is always kana). English glosses/tags
  stay unmarked. Small, correct, no behavior change.

- **F4 (noted, low):** GLOSSARY is ~31 entries (UI frame only). Expansion is content work, not a bug.
- **F5 (noted, OK):** Jotoba timeout handled — hover 2500ms (lang.js), lookup 4000ms (phrases.js),
  both fall back to a Jisho link on abort/failure. No change needed.
