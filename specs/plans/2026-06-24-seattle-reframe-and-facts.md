# Seattle/US Reframe + Personal Facts + Auto-Tick Seed — Implementation Plan

> **For agentic workers:** This plan mixes judgment-dense JSON content edits (do these as DIRECT, `json.tool`-validated edits — NOT via transcription subagents, which corrupt quotes on string-heavy edits and could mis-edit context-sensitive references) with mechanical code edits (fine for subagents). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the dashboard accurate for the real owner — a **Canadian citizen departing from Seattle / US** with the WHV in hand — and reflect their concrete status (visa done, NCD/Vyvanse permit, Chase Sapphire Preferred, Sakura House until Jul 7), including a one-time auto-tick of completed items.

**Architecture:** Most changes are `data/tips.json` content. The `canadaNotes` data key is renamed to `homeNotes` (touching 4 code refs). A one-time additive boot seed (guarded by `KEYS.seed`) ticks completed checklist items. No new modules.

**Tech Stack:** Vanilla ES modules, no build. Validate JSON with `python3 -m json.tool docs/data/tips.json`. Tests: `node --test tests/lib.test.mjs`.

## Global Constraints

- Zero-build, dependency-free vanilla ES modules; GitHub Pages from `/docs`.
- **NEVER change a checklist item's `id`** — only `task`/`kind`/`dueBy`/`requires`. Checked-state, due-dates, tag, order, and the seed all key on `id`; a changed id orphans user state.
- **Canadian-citizen reframe rule (keep WHV substance, flip only departure location):**
  - KEEP verbatim: CAD proof-of-funds figures, "twice in a lifetime," "free for Canadians," the **Canadian embassy** emergency contact, Canadian omiyage, and any WHV eligibility fact.
  - KEEP verbatim: every "CAD" that means **computer-aided-design software** (the `building`/`activities`/`music` maker pillars) — do NOT touch those.
  - FLIP: departure-*location* phrasing only — "in/from Canada" → "from the US / Seattle / before you fly"; "Canada-issued (Wise) card" → "US/home-issued"; meta title "Canada → Tokyo" → "Seattle → Tokyo"; "Canadian plugs" → "North-American plugs"; "e-signed … from Canada" → "from the US".
- Every dynamic string already flows through `esc()`; this plan only edits data + a tiny seed.
- Researched/2026 content keeps its `confidence` flag; new items carry `confidence` + (where claimed) `sources`.
- Service worker: bump `CACHE` `jwh-v110` → `jwh-v111`; this plan adds no new asset files (data + existing modules only), so no `ASSETS` additions — but the bump is required so the data/code refresh lands.
- `data/tips.json` must pass `python3 -m json.tool` after EVERY edit.

---

### Task 1: Rename the `canadaNotes` data key → `homeNotes` (4 code refs + data) and author US/Seattle notes

**Files:** `docs/assets/content.js`, `docs/index.html`, `docs/assets/i18n.js`, `docs/assets/router.js`, `docs/data/tips.json`.

**Interfaces:** the section renders from `DATA.homeNotes` into `#homeList` under `#homeSection`; heading i18n key `head.home`.

- [ ] **Step 1 — content.js.** In `docs/assets/content.js`, the function `renderCanada` reads `DATA.canadaNotes` / `#canadaSection` / `#canadaList`. Rename it and its refs:
  - `function renderCanada() {` → `function renderHome() {`
  - `const list = DATA.canadaNotes || [];` → `const list = DATA.homeNotes || [];`
  - `const sec = $('#canadaSection');` → `const sec = $('#homeSection');`
  - `$('#canadaList').innerHTML = ...` → `$('#homeList').innerHTML = ...`
  - Update its caller in `renderContent`: `renderCanada();` → `renderHome();`

- [ ] **Step 2 — index.html.** Find the block (currently ~line 388):
  ```html
  <section class="block" id="canadaSection">
    <h2><span class="emoji" aria-hidden="true">🇨🇦</span> <span data-i18n="head.canada">Canada-Specific Notes</span></h2>
    <ul class="note-list" id="canadaList"></ul>
  ```
  Replace with:
  ```html
  <section class="block" id="homeSection">
    <h2><span class="emoji" aria-hidden="true">🍁</span> <span data-i18n="head.home">Pre-Departure Notes (Canadian, leaving Seattle)</span></h2>
    <ul class="note-list" id="homeList"></ul>
  ```
  (Keep the 🍁 maple leaf — the owner is Canadian — but the heading now signals the Seattle departure.)

- [ ] **Step 3 — i18n.js.** Change the key `'head.canada': 'カナダ向けメモ',` → `'head.home': '出発前メモ（カナダ国籍・シアトル発）',`. If `head.canada` appears in BOTH the EN and JA maps in `i18n.js`, rename both occurrences to `head.home` (grep first: `grep -n "head.canada" docs/assets/i18n.js`).

- [ ] **Step 4 — router.js.** Line 18 legacy anchor map: `canadaSection: 'explore',` → `homeSection: 'explore',`.

- [ ] **Step 5 — tips.json: rename the key + author the notes.** Rename `"canadaNotes": [ … ]` → `"homeNotes": [ … ]` and replace its 5 Canada-WHV-eligibility entries with these Seattle-departure notes (the WHV itself is in hand, so these are logistics, not eligibility):
  ```json
  "homeNotes": [
    "You're a Canadian citizen departing from Seattle — your WHV is already in hand, so pre-departure is logistics, not eligibility.",
    "Cross-border tax is genuinely complex here (Canadian citizen, recent US resident, now leaving for Japan): you may have US and/or Canadian filing duties and a Canadian departure-tax/residency question. Washington has no state income tax. Verify with a cross-border accountant — don't guess. (confidence: low — personal, verify)",
    "Keep a US mailing address + a working US bank/card while abroad; set USPS mail forwarding or a mail-scanning service before you fly.",
    "Carry your CAD proof-of-funds statement and your status packet through Narita even though the visa is granted — immigration can spot-check.",
    "Your Canadian passport + consular protection still run through the Embassy of Canada in Tokyo (see the Emergency tab)."
  ]
  ```

- [ ] **Step 6 — validate + commit.**
  ```bash
  python3 -m json.tool docs/data/tips.json > /dev/null && echo JSON_OK
  node --test tests/lib.test.mjs   # unaffected, must stay green
  grep -rn "canadaSection\|canadaNotes\|canadaList\|renderCanada\|head.canada" docs/   # expect ZERO hits
  git add docs/assets/content.js docs/index.html docs/assets/i18n.js docs/assets/router.js docs/data/tips.json
  git commit -m "feat(data): canadaNotes -> homeNotes; Seattle-departure pre-departure notes"
  ```

---

### Task 2: Reframe the "Pre-Departure (Canada)" checklist phase

**Files:** `docs/data/tips.json` (the `checklist[]` phase whose `phase` is `"Pre-Departure (Canada)"`). **IDs unchanged.**

- [ ] **Step 1 — rename the phase.** `"phase": "Pre-Departure (Canada)"` → `"phase": "Pre-Departure (Seattle / US)"`. Leave `window` (`"Now → June 29 2026"`).

- [ ] **Step 2 — reframe the departure-location phrasing in each item's `task` (keep CAD/WHV substance; ids fixed).** Apply these targeted edits:
  - `chk-confirm-whv-eligibility-age-1`: `"…residing in Canada)"` → `"…Canadian citizen, age 18–30; visa already granted)"`.
  - `chk-open-a-wise-multi-currency-acc`: `"…account from Canada"` → `"…account before you fly (while still in the US)"`.
  - `chk-reserve-a-furnished-share-hous`: leave wording, but this is DONE (Sakura House) — it gets ticked by the seed (Task 5).
  - `chk-line-up-a-no-key-money-share-h-2`: replace `"You can apply online from Canada and reserve a room before you land."` → `"You can apply online before you fly and reserve a room before you land."` Keep the rest (key-money/guarantor substance is universal).
  - `chk-order-a-wise-formerly-transfe-2`: replace `"verify the account while still in CANADA, before you fly. A Wise card issued in Canada keeps Apple Pay/Google Pay compatibility"` → `"verify the account while still in the US, before you fly. A Wise card issued in your home country (CA/US) keeps Apple Pay/Google Pay compatibility"`. Keep the Japan-issued-loses-Apple-Pay point.
  - `chk-decide-your-long-term-plan-bef-2`: replace `"pays with your Canadian card"` → `"pays with your home (CA/US) card"`. Keep Mobal/SIM substance.
  - `chk-lock-the-proof-of-funds-figure-2`: KEEP the CAD figures (Canadian WHV). Replace only `"with YOUR consulate before flying"` → `"per your Canadian WHV terms (already cleared at application)"`, since the visa is granted. CAD 3,500/4,500 stays.
  - `chk-buy-a-data-esim-5-days-befor`, `chk-fill-out-visit-japan-web-for-f`, `chk-move-2fa-to-an-authenticator-a`, `chk-check-passport-validity-blan`, `chk-gather-visa-documents-passpor`, `chk-show-proof-of-funds-in-your-ac`, `chk-book-consulate-appointment-and`, `chk-decide-the-one-way-vs-return-f-2`, `chk-before-you-fly-buy-and-instal-2`: no Canada-location phrasing to change (verify each `task` string; if it contains "Canada"/"from Canada", apply the same flip). The visa-application ones are ticked by the seed (Task 5).

- [ ] **Step 3 — validate + commit.**
  ```bash
  python3 -m json.tool docs/data/tips.json > /dev/null && echo JSON_OK
  git add docs/data/tips.json
  git commit -m "feat(data): reframe Pre-Departure phase for a Canadian leaving Seattle (ids unchanged)"
  ```

---

### Task 3: Reframe Landing-Day + scattered Canada-location references

**Files:** `docs/data/tips.json`. KEEP CAD figures, the Canadian embassy, "free for Canadians," CAD-software. Flip only departure-location/issuer phrasing.

- [ ] **Step 1 — Landing Day items.** In the `"Landing Day — Jun 30"` phase: `chk-set-up-mobile-suica-in-apple-w` and `chk-carry-proof-of-funds-onward` and `chk-maintain-your-proof-of-funds-b`: keep CAD funds; change `"Canada-issued Wise card"` → `"home (CA/US)-issued Wise card"` and `"Canadian WHV applicants must show…"` → `"Your Canadian WHV required showing…"` (past tense — already granted). Leave the universal arrival mechanics.

- [ ] **Step 2 — `meta.title`.** `"Japan Working Holiday — Insider Living Hacks (Canada → Tokyo)"` → `"Japan Working Holiday — Insider Living Hacks (Seattle → Tokyo)"`.

- [ ] **Step 3 — `top10`.** `top10[3].tip` and `top10[3].reason`: `"Canada-issued Wise card"` → `"home (CA/US)-issued Wise card"` (both occurrences). `top10[1]`/`top10[4]`: no location change needed (verify).

- [ ] **Step 4 — `arrivalSequence` / `arrivalWeek`.** `arrivalSequence[5]`: `"no-FX-fee Canadian card"` → `"no-FX-fee home card (your Chase Sapphire Preferred has no FX fee)"`. `arrivalWeek[0].steps[4]`: `"Canada-issued Wise card"` → `"home-issued Wise card"`. `arrivalWeek[1].steps[1]`: `"applied to a share house from Canada"` → `"applied to your Sakura House room before you flew"`. `arrivalWeek[4].steps[3]`: `"CAD↔JPY transfers"` → keep (CAD currency is correct).

- [ ] **Step 5 — `bookByTimeline`.** Entry `book-pre-departure-sim-esim-wise-card-canada-iss`: KEEP the `id` (changing it could orphan UI state); change `what` `"Wise card (Canada-issued)"` → `"Wise card (home-issued)"`; in `action` `"verify in CANADA before flying"` → `"verify before flying (while in the US)"`. The accommodation entry (`bookByTimeline[1]`): prepend `"DONE — booked Sakura House (Makoto) through Jul 7. "` to its `action` and keep the rest as reference.

- [ ] **Step 6 — `packing` / `budget` / `rooms`.** `packing[10]`: `"Canada plugs fit"`/`"Canadian plugs physically fit"` → `"North-American plugs fit"` (CA/US share Type A + 120V). `packing[30]` Canadian omiyage: KEEP. `budget.oneTime[1].note` "Free for Canadians": KEEP. `rooms[41].note` `"e-signed via DocuSign from Canada"` → `"e-signed via DocuSign from the US"`.

- [ ] **Step 7 — `timeSensitive` / `emergency`.** `timeSensitive[1]`, `[4]`, `[10]`: KEEP (CAD funds, Canada-Japan totalization treaty, "Canadian WHV is single-entry" — all correct for a Canadian). `emergency` Embassy of Canada + Canadian watch line: KEEP. (No edits — listed here so the executor confirms they're intentionally untouched.)

- [ ] **Step 8 — validate + commit.**
  ```bash
  python3 -m json.tool docs/data/tips.json > /dev/null && echo JSON_OK
  # Confirm only intended Canada refs remain (embassy, CAD funds, CAD-software, free-for-Canadians, omiyage):
  grep -ci "canad" docs/data/tips.json   # expect a small residual count, all intentional
  git add docs/data/tips.json
  git commit -m "feat(data): reframe scattered Canada-location refs to Seattle/US (keep CAD funds, embassy, CAD-software)"
  ```

---

### Task 4: Personal facts → data (Vyvanse, Chase Sapphire, Sakura House)

**Files:** `docs/data/tips.json`.

- [ ] **Step 1 — Vyvanse / NCD task.** Add a new item to the `"Pre-Departure (Seattle / US)"` phase `items[]` (new id, stable):
  ```json
  { "id": "chk-adhd-ncd-permit", "kind": "legal", "dueBy": "",
    "task": "ADHD meds — carry your NCD (Narcotics Control Department) import permit + 3-month supply. Japan classes lisdexamfetamine (Vyvanse) as a 'Stimulants' Raw Material'; the NCD advance-import permit carried WITH your prescription is the legal route. Adult domestic refills are not available in Japan — plan resupply for months 4-12 (verify with your prescriber).",
    "confidence": "medium",
    "sources": ["https://www.ncd.mhlw.go.jp/en/application2.html", "https://www.zengaijin.com/post/bringing-medication-to-japan"] }
  ```
  And add an undone follow-on to the `"Ongoing Setup & Money"` phase:
  ```json
  { "id": "chk-adhd-resupply-plan", "kind": "legal", "dueBy": "",
    "task": "Plan ADHD-med resupply for months 4-12 — no adult refills in Japan (mail-import with a fresh NCD permit, a trip home, or a prescriber arrangement)." }
  ```

- [ ] **Step 2 — Chase Sapphire money note + cash-card task.** Add to `"Ongoing Setup & Money"` phase `items[]`:
  ```json
  { "id": "chk-csp-primary-card", "kind": "money", "dueBy": "",
    "task": "Primary card = Chase Sapphire Preferred (Visa, no foreign-transaction fee). Set a travel notice and add it to Apple/Google Pay. Note: CSP at an ATM is a cash-advance (fee + interest) — use it for purchases, not yen withdrawals." }
  ```
  ```json
  { "id": "chk-cash-atm-card", "kind": "money", "dueBy": "",
    "task": "Sort a cash/ATM card for Japan — Japan is cash-heavy and CSP charges a cash-advance fee. Bring a no-FX debit card (or the home-issued Wise card) for Seven-Bank ATM withdrawals." }
  ```

- [ ] **Step 3 — Sakura House baked calendar event + lock-housing task.** Add to `calendar[]` (real schema: `id/title/date/endDate/category/area/confidence`):
  ```json
  { "id": "ev-sakura-house-makoto-stay", "title": "Sakura House (Makoto) — initial stay",
    "date": "2026-06-30", "endDate": "2026-07-07", "category": "housing",
    "area": "Tokyo (Sakura House Makoto)", "confidence": "high",
    "bookingNotes": "Booked initial accommodation, arrival through Jul 7. Find long-term housing before checkout." }
  ```
  Add to `"First Month — Settle In"` phase `items[]`:
  ```json
  { "id": "chk-lock-long-term-housing", "kind": "housing", "dueBy": "2026-07-07",
    "task": "Lock in long-term housing before the Sakura House (Makoto) stay ends on Jul 7 — view share-house rooms in person, then sign." }
  ```
  > **Note (calendar `housing` category color):** confirm `housing` maps to a legend color. If `calendar.js`/CSS has no `housing` category color, either reuse an existing category (e.g. the one used for logistics) OR add a `--cat-housing` mapping. The executor checks `grep -i housing docs/assets/calendar.js docs/assets/style.css` and, if absent, adds a color so the event isn't un-themed.

- [ ] **Step 4 — validate + commit.**
  ```bash
  python3 -m json.tool docs/data/tips.json > /dev/null && echo JSON_OK
  git add docs/data/tips.json docs/assets/calendar.js docs/assets/style.css 2>/dev/null
  git commit -m "feat(data): personal facts — Vyvanse/NCD, Chase Sapphire, Sakura House stay + lock-housing"
  ```

---

### Task 5: One-time additive auto-tick seed

**Files:** `docs/assets/lib/store.js` (add `KEYS.seed`), `docs/assets/main.js` (the seed).

**Seeded done-ids** (visa granted + passport ready + first accommodation booked + NCD permit in hand). All have `requires: None`, so no transitive prereqs to add:
`chk-confirm-whv-eligibility-age-1`, `chk-gather-visa-documents-passpor`, `chk-show-proof-of-funds-in-your-ac`, `chk-book-consulate-appointment-and`, `chk-check-passport-validity-blan`, `chk-lock-the-proof-of-funds-figure-2`, `chk-reserve-a-furnished-share-hous`, `chk-book-first-week-accommodation-2`, `chk-line-up-a-no-key-money-share-h-2`, `chk-adhd-ncd-permit`.

- [ ] **Step 1 — store.js.** Add to `KEYS` (after `tags`): `seed: 'jwh-seed-v1',`.

- [ ] **Step 2 — main.js seed.** Read `docs/assets/main.js` to confirm boot order (gate → fetch tips.json → mount features → router → …). Import `get, set` (and `KEYS`) from `./lib/store.js` if not already imported. AFTER the checklist mounts (i.e. after `renderContent(data, today)` runs), add a one-time additive merge:
  ```js
  // One-time seed: tick the items the owner has already completed (visa granted, passport ready,
  // first accommodation booked, NCD permit in hand). Additive only (never un-checks); runs once.
  if (!get(KEYS.seed, false)) {
    const SEED_DONE = ['chk-confirm-whv-eligibility-age-1','chk-gather-visa-documents-passpor','chk-show-proof-of-funds-in-your-ac','chk-book-consulate-appointment-and','chk-check-passport-validity-blan','chk-lock-the-proof-of-funds-figure-2','chk-reserve-a-furnished-share-hous','chk-book-first-week-accommodation-2','chk-line-up-a-no-key-money-share-h-2','chk-adhd-ncd-permit'];
    const checks = get(KEYS.checklist, {}) || {};
    SEED_DONE.forEach(id => { checks[id] = true; });   // additive — only sets true
    set(KEYS.checklist, checks);
    set(KEYS.seed, true);
    document.dispatchEvent(new CustomEvent('jwh:data-changed'));   // refresh dashboard/bell/progress
  }
  ```
  Place it so `get(KEYS.checklist…)`/`set` exist and the dispatch reaches the already-mounted checklist + dashboard. The merge is additive so it never clobbers a user who already ticked/un-ticked things; the flag makes it run exactly once per device.

- [ ] **Step 3 — seed-id existence test.** Append to `tests/lib.test.mjs` a test that every seeded id exists in `tips.json` (fails loudly if a future edit renames one). It reads the file via `node:fs`:
  ```js
  test('seed ids all exist in tips.json checklist', () => {
    const fs = require('node:fs');
    const data = JSON.parse(fs.readFileSync(new URL('../docs/data/tips.json', import.meta.url)));
    const ids = new Set(data.checklist.flatMap(p => (p.items||[]).map(i => i.id)));
    const SEED = ['chk-confirm-whv-eligibility-age-1','chk-gather-visa-documents-passpor','chk-show-proof-of-funds-in-your-ac','chk-book-consulate-appointment-and','chk-check-passport-validity-blan','chk-lock-the-proof-of-funds-figure-2','chk-reserve-a-furnished-share-hous','chk-book-first-week-accommodation-2','chk-line-up-a-no-key-money-share-h-2','chk-adhd-ncd-permit'];
    SEED.forEach(id => assert.ok(ids.has(id), `seed id missing: ${id}`));
  });
  ```
  (`require` is available in `.mjs` only via `createRequire`; if `require` is undefined, use `import { readFileSync } from 'node:fs'` at the top instead. The implementer adapts to whatever the existing test file already imports.)

- [ ] **Step 4 — verify + commit.**
  ```bash
  node --test tests/lib.test.mjs   # incl. the new seed-id existence test — all green
  node --check docs/assets/main.js
  git add docs/assets/lib/store.js docs/assets/main.js tests/lib.test.mjs
  git commit -m "feat(seed): one-time additive auto-tick of completed items (visa/passport/accommodation/NCD)"
  ```

---

### Task 6: Service-worker bump

- [ ] **Step 1.** `docs/sw.js`: `const CACHE = 'jwh-v110';` → `const CACHE = 'jwh-v111';` (no ASSETS change — this plan adds no asset files).
- [ ] **Step 2.** `node --check docs/sw.js`; confirm `CACHE` is `'jwh-v111'`. `node --test tests/lib.test.mjs` green.
- [ ] **Step 3.** Commit: `git add docs/sw.js && git commit -m "chore(sw): bump to jwh-v111 for the data reframe + seed"`.

---

## Self-Review

**Spec coverage (WS4 Seattle reframe + WS5 personal facts + seed):**
- `canadaNotes`→`homeNotes` across content.js/index.html/i18n.js/router.js (the 4 verified refs) + US/Seattle notes → Task 1. ✓
- "Pre-Departure (Canada)" phase renamed + items reframed, ids unchanged → Task 2. ✓
- Scattered Canada-location refs flipped; CAD funds / embassy / CAD-software / free-for-Canadians KEPT → Task 3. ✓
- Visa-done framing (application items ticked by seed; CAD funds kept as carry-reference) → Tasks 2, 5. ✓
- Vyvanse/NCD (medium-confidence, sourced) + resupply follow-on → Task 4. ✓
- Chase Sapphire money note + cash-card task → Task 4. ✓
- Sakura House baked event (date 2026-06-30 → endDate 2026-07-07, housing) + lock-housing task → Task 4. ✓
- One-time additive seed, guarded by `jwh-seed-v1`, ids final after Tasks 2-4, + existence test → Task 5. ✓
- SW bump → Task 6. ✓

**Placeholder scan:** none — every edit names an exact id/key/string and authored replacement.

**Risk notes:** (1) Seed ids verified `requires: None` → no checked-but-locked rows. (2) Cross-border tax note is `confidence: low` — deliberately non-prescriptive. (3) The `housing` calendar category may need a color (Task 4 Step 3 checks). (4) The reframe deliberately leaves CAD funds, the Canadian embassy, CAD-software, and "free for Canadians" untouched — the executor must resist a blanket Canada→US sweep.
