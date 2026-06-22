# Emergency Quick-Reference — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Route:** new `#/emergency`

## 1. Goal
A compact, always-findable **emergency reference**: Japan emergency numbers, the Canadian Embassy, the "always carry / always have" reminders (residence card 在留カード, My Number, insurance card), and the top emergency Japanese phrases. Read-only, offline (it's the page you most need without a connection).

## 2. Where it lives
New route `emergency`, the established pattern:
- `router.js`: `'emergency'` in `ROUTES` **and** `emergency:'Emergency'` in `TITLES`.
- `index.html`: nav link `data-i18n="nav.emergency"` + `<div class="view" id="view-emergency">` with `.pillar-head` (jp accent `緊急`, `<h2 data-i18n="head.emergency">`) + lede + the card sections.
- `main.js`: `mountEmergency(data)`.
- `i18n.js`: `nav.emergency` (緊急), `head.emergency`, `lede.emergency`.
- `sw.js`: precache `assets/emergency.js`; bump `CACHE`. (This page is high-value offline → ensure it's precached.)
- Also: a quick link to it from the **⚙ Guide overlay**, and it's reachable via the command palette (batch-3 sibling). Optionally a small 🆘 hint — but a nav entry is enough.

## 3. Data — `tips.json.emergency` (curated content)
```json
"emergency": {
  "numbers": [
    { "label":"Police", "num":"110", "note":"crime, theft, lost residence card" },
    { "label":"Fire / Ambulance", "num":"119", "note":"say 救急車 (ambulance) or 火事 (fire)" },
    { "label":"Coast Guard", "num":"118", "note":"sea emergencies" },
    { "label":"Japan Helpline (EN, 24h)", "num":"0570-000-911", "note":"English support" }
  ],
  "contacts": [
    { "label":"Embassy of Canada, Tokyo", "detail":"+81-3-5412-6200 · 7-3-38 Akasaka, Minato-ku", "note":"after-hours emergencies: Ottawa +1-613-996-8885 (collect)" }
  ],
  "carry": [
    "在留カード (residence card) — carry ALWAYS, it's the law",
    "Health insurance card (NHI) once enrolled",
    "A note with your address in Japanese + your blood type / allergies"
  ],
  "phrases": [
    { "jp":"助けてください", "read":"たすけてください · tasukete kudasai", "en":"Please help" },
    { "jp":"救急車を呼んでください", "read":"きゅうきゅうしゃをよんでください · kyūkyūsha o yonde kudasai", "en":"Please call an ambulance" },
    { "jp":"警察を呼んでください", "read":"けいさつをよんでください · keisatsu o yonde kudasai", "en":"Please call the police" },
    { "jp":"アレルギーがあります", "read":"アレルギーがあります · arerugī ga arimasu", "en":"I have allergies" },
    { "jp":"道に迷いました", "read":"みちにまよいました · michi ni mayoimashita", "en":"I'm lost" }
  ]
}
```
(Full curated content produced at implementation; spec fixes the shape + the must-haves. Numbers/embassy carry `confidence` where relevant; the embassy line should be flagged "verify current number".)

## 4. UI — `assets/emergency.js`
- `export function mountEmergency(data)`: render the four sections (Numbers — big tappable `tel:` links; Contacts; Always carry; Phrases with `.jp` spans). After render, call `wireJpAccents($('#view-emergency'))` (from `lang.js`, batch-2) so the emergency phrases are keyboard-accessible too.
- Numbers as `<a href="tel:110">` so they dial on mobile. Every dynamic string `esc()`'d (baked content, but esc). Read-only — no storage, no mutation, no `jwh:data-changed`.
- Clean, high-contrast, scannable layout (this is glanced at under stress); works offline (precached + no network).

## 5. Files
- **Create:** `assets/emergency.js`.
- **Modify:** `index.html`, `router.js`, `main.js`, `lib/store.js` (none — no new key), `data/tips.json` (`emergency` block), `assets/i18n.js`, `assets/style.css` (emergency card styles), `assets/guide.js` (a link to it — optional), `sw.js` (precache + CACHE bump).
- **Reuse:** `lang.js wireJpAccents`, the `.jp` hover-dictionary.

## 6. Hardening / testing
- `tel:` hrefs: numbers are baked + digits/hyphens only → safe; still `esc()` the attribute.
- No user-input surface. `data.emergency` may be absent (older tips.json) → guard with a fallback / `data.emergency || {}` and skip empty sections.
- Browser: route loads, four sections render, a `tel:` link present, hover a `.jp` emergency phrase → dictionary popover, the phrase is keyboard-focusable (wireJpAccents ran), JP chrome toggle works, 0 console errors. Existing suites green.

## 7. Out of scope
Geolocation / nearest hospital, live embassy hours, a printable wallet card (the print-summary sibling could include emergency info later), SOS auto-dial.
