# Phrasebook Page — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Route:** new `#/phrases`

## 1. Goal
A survival-Japanese **phrasebook** for the working-holiday year: categorized essential phrases (konbini, ward office / 区役所 paperwork, apartment hunting, restaurant, transit, emergency, daily) — each with the Japanese, a romaji/kana reading, and an English meaning. Leverages the existing `.jp` hover-dictionary and JP chrome. A reference page (read-only content), with collapsible categories (reuse the accordion) and an optional "favorite" star to pin the ones you're learning.

**Assumption (figure-it-out):** a curated reference (not a flashcard/SRS trainer — that's a bigger feature, deferred). Favorites are a light personalization.

## 2. Where it lives
New route `phrases`, the established new-page pattern (like packing/budget):
- `router.js`: `'phrases'` in `ROUTES` **and** `phrases:'Phrases'` in `TITLES`.
- `index.html`: nav link `data-i18n="nav.phrases"` + `<div class="view" id="view-phrases">` with `.pillar-head` (jp accent `言葉`, `<h2 data-i18n="head.phrases">`) + lede + a category list container `#phraseList` + a "★ favorites only" toggle.
- `main.js`: `mountPhrases(data)` near the other mounts.
- `lib/store.js` `KEYS`: `phraseFav: 'jwh-phrasefav-v1'` (a `{ id: true }` map). (Collapse state uses the shared `KEYS.collapse`.)
- `i18n.js`: `nav.phrases` (言葉), `head.phrases`, `lede.phrases`.
- `sw.js`: precache `assets/phrases.js`; bump `CACHE`.

## 3. Data model — `tips.json.phrases` (curated content)
```json
"phrases": [
  { "id":"ph-konbini-bag", "cat":"Konbini", "jp":"袋はいりません", "read":"ふくろはいりません · fukuro wa irimasen", "en":"I don't need a bag" },
  { "id":"ph-ward-moverin", "cat":"Ward office", "jp":"転入届を出したいです", "read":"てんにゅうとどけをだしたいです · tennyū todoke o dashitai desu", "en":"I'd like to file a move-in notification" },
  { "id":"ph-apt-viewing", "cat":"Apartment", "jp":"内見できますか", "read":"ないけんできますか · naiken dekimasu ka", "en":"Can I view the room?" }
  // … a researched ~40–60 phrase list across: Daily, Konbini, Restaurant, Transit, Ward office, Apartment, Emergency, Work/meetup
]
```
Fields: `id` (`ph-<slug>`), `cat`, `jp`, `read` (`かな · romaji`), `en`. Categories render in a fixed order. (Full list produced at implementation; spec fixes shape + the category set + the genuinely-useful WHV phrases — residence card, My Number, pension exemption 免除, garbage day, no-guarantor, etc.)

## 4. UI (`phrases.js`)
- **Collapsible accordion categories** (reuse `mountAccordion`, ids `ph-cat-${slug(cat)}`); `.acc-count` = phrase count (or fav count) per category.
- Each phrase row: the **`jp`** wrapped in a `.jp` span (so the hover-dictionary works) + `lang="ja"`, the `read`, the `en`, and a **★ favorite** toggle (persist to `jwh-phrasefav-v1`). Optional: a 🔊 button is **out of scope** (no TTS).
- **Hover-dictionary on JS-rendered `.jp` (required fix):** `lang.js`'s mouseover/focus delegation already works for dynamic `.jp` (mouse), but its **keyboard** enablement (the `tabindex`/`role=button`/`aria-label` it adds) runs as a **one-time `$$('.jp')` scan at boot**, before the phrasebook renders → JS-rendered phrases would be mouse-hoverable but **not keyboard-accessible**. Fix: `lang.js` exports `wireJpAccents(container)` (the per-`.jp` keyboard-enable loop, extracted from `wireDictionary`); `phrases.js` calls `wireJpAccents($('#phraseList'))` after every render. (Apply the same to any other page that renders `.jp` dynamically — out of scope here.)
- **"★ Favorites only"** toggle filters to favorited phrases (re-render).
- Every dynamic string through `esc()`. The `jp`/`read`/`en` come from baked tips.json (developer-controlled); favorites add no free-text. Real `<button>` for the star (a11y).
- Mutations (fav toggle) save to `jwh-phrasefav-v1` and re-render directly (no `jwh:data-changed` — nothing else consumes it).

## 5. Files
- **Create:** `assets/phrases.js`, `tests/phrases.test.mjs` (a tiny pure `groupByCategory`/`favCount` helper, or reuse `lib/packing.js`'s `groupByCategory` since it's generic — prefer reusing it).
- **Modify:** `index.html`, `router.js`, `main.js`, `lib/store.js`, `data/tips.json` (`phrases[]`), `assets/i18n.js`, `assets/style.css` (phrase rows), `assets/lang.js` (extract + export `wireJpAccents(container)`), `sw.js`.
- **esc() obligation:** `jp`/`read`/`en` and `data-id="${esc(id)}"` all through `esc()` (double-quoted attributes only — `esc()` doesn't escape `'`).
- **Reuse:** `assets/collapse.js`, `lib/packing.js` `groupByCategory` (generic), the `.jp` hover-dictionary (already global via `lang.js`).

## 6. Hardening / testing
- ids are `ph-<slug>` (baked, safe); fav map keyed by id; `store.get(KEYS.phraseFav, {})` fallback. No user free-text → low XSS surface, but still `esc()` all interpolation.
- If reusing `lib/packing.js groupByCategory`, the test already covers it; add a phrases-specific test only if a new helper is introduced.
- Browser: categories render + collapse + persist; hover a `.jp` phrase → dictionary popover (reading+meaning); ★ a phrase, toggle favorites-only → filters; reload persists favs; JP chrome toggle works; 0 console errors.

## 7. Out of scope
TTS/audio, flashcards/SRS, search within phrases (could add later), user-added custom phrases (v1 is curated + favorites).
