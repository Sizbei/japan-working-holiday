# Researched Task Gaps + Cleanup Implementation Plan

> **For agentic workers:** Execute the JSON additions as DIRECT, `json.tool`-validated edits (judgment-dense content; subagent transcription corrupts quotes). The **cleanup (Task 2) REMOVES baked items and MUST be owner-vetoed** — surface the candidate list and wait for approval before deleting anything.

**Goal:** Fill the genuine gaps in the checklist with current, sourced 2026 tasks tailored to a **Canadian on a working holiday**, and (with the owner's veto) de-duplicate the overlapping baked items — without a giant rewrite (the existing 74+ items already cover the major obligations).

**Architecture:** `data/tips.json` edits only (+ SW bump). Additions carry `confidence` + `sources` per the data rules; ids are new and stable; existing item ids are never changed.

**Tech Stack:** Vanilla, no build. Validate with `python3 -m json.tool docs/data/tips.json`. `node --test tests/lib.test.mjs` (the seed-id existence test must still pass).

## Global Constraints

- Zero-build; GitHub Pages from `/docs`.
- **Additions are tailored to a Canadian citizen** (ROCA, CAA IDP, Canadian embassy) — keep that framing; don't genericize.
- New researched items carry `confidence` (high/medium/low) + `sources`; 2026 estimates stay flagged.
- **NEVER change an existing item `id`** (orphans checked-state/seed/order). New ids only.
- **Task 2 deletions are owner-gated** — present the dup/overlap list; remove only what the owner approves. The seed-id existence test guards against deleting a seeded id.
- Service worker: bump `CACHE` to the next unused version (executed branch is `jwh-v113`; later plans take higher numbers — read + increment).
- `json.tool` must pass after every edit.

## What's ALREADY covered (do NOT re-add)
Residence-card pickup at NRT, ward-office move-in (14-day), National Health Insurance, National Pension + exemption, My Number, Japanese bank (Yūcho), SIM/eSIM + Mobile Suica, re-entry permit, resident tax, tax agent on exit, proof-of-funds carry, Vyvanse/NCD (Plan 3), Chase Sapphire + cash card (Plan 3), Makoto Guesthouse + long-term housing (Plan 3). **Plan 7 only fills what's missing.**

---

### Task 1: Add the researched gap-filling tasks

**Files:** `docs/data/tips.json`. Insert each into the most fitting existing phase's `items[]` (new ids). Author verbatim (esc not needed in JSON; the app esc()s on render).

- [ ] **Step 1 — Pre-Departure (Seattle / US) phase: ROCA + IDP.**
  ```json
  { "id": "chk-register-roca", "kind": "legal",
    "task": "Register with Registration of Canadians Abroad (ROCA) — free; lets Global Affairs Canada reach you in an emergency (disaster, unrest) and you reach them. Do it before/just after you land.",
    "confidence": "high", "sources": ["https://travel.gc.ca/travelling/registration"] }
  ```
  ```json
  { "id": "chk-idp-driving", "kind": "logistics",
    "task": "(Only if you'll drive) Get a CAA International Driving Permit before you fly — Canada signed the 1949 Geneva Convention, so a Canadian licence + IDP lets you drive in Japan for up to 1 year from entry. If you're in the US, CAA takes mail/online orders — apply early so it arrives before departure. For a longer stay, get a JAF translation of your licence or convert (gaimen kirikae).",
    "confidence": "high", "sources": ["https://english.jaf.or.jp/driving-in-japan/drive-in-japan", "https://www.international.gc.ca/country-pays/japan-japon/drivers_licenses-permis_de_conduire.aspx?lang=eng"] }
  ```

- [ ] **Step 2 — First Month / move-in tasks: utilities+garbage, renters insurance, mail-forwarding.**
  ```json
  { "id": "chk-utilities-garbage", "kind": "setup",
    "task": "At long-term move-in: set up electricity / gas / water (usually an online or phone form) + internet, and learn your ward's garbage-sorting + collection-day rules — burnable / non-burnable / recyclables differ by ward and mis-sorting gets bags rejected.",
    "confidence": "high", "sources": ["https://www.japan-guide.com/e/e2060.html"] }
  ```
  ```json
  { "id": "chk-renters-insurance", "kind": "setup",
    "task": "Sort renters / contents (kasai hoken) insurance for your long-term place — share houses sometimes bundle it; a normal lease usually requires it. Confirm what's already included before buying.",
    "confidence": "medium", "sources": [] }
  ```
  ```json
  { "id": "chk-mail-forwarding-move", "kind": "logistics",
    "task": "When you move from Makoto Guesthouse to long-term housing: file a Japan Post mail-forwarding (tensō) request AND re-register your address at the ward office (within 14 days of the move).",
    "confidence": "high", "sources": ["https://www.post.japanpost.jp/int/index_en.html"] }
  ```

- [ ] **Step 3 — Ongoing / Exit: hanko (optional), tax-filing-if-working, pension lump-sum on exit.**
  ```json
  { "id": "chk-hanko-optional", "kind": "setup",
    "task": "(Usually optional) A hanko / inkan personal seal — most banks and contracts now accept a signature for foreign residents. You only really need a REGISTERED seal (jitsuin) for major legal transactions (car, real estate, insurance payouts). Skip unless something specifically asks for it.",
    "confidence": "medium", "sources": ["https://expatsguide.jp/living-in/visas-residency/registering-personal-seal/"] }
  ```
  ```json
  { "id": "chk-tax-filing-if-working", "kind": "money",
    "task": "If you work during the WHV: you'll either get a year-end adjustment (nenmatsu chōsei) via your employer, or file a tax return (kakutei shinkoku) by mid-March for the prior year. Keep your payslips + My Number.",
    "confidence": "medium", "sources": ["https://www.nta.go.jp/english/"] }
  ```
  ```json
  { "id": "chk-pension-lumpsum-exit", "kind": "money",
    "task": "On leaving Japan, claim the National Pension lump-sum withdrawal (dattai ichijikin) — file within 2 years of departure. A withholding tax (commonly cited ~20.42%) is taken at source but is reclaimable through your appointed tax agent; verify the current rate when you file.",
    "confidence": "medium", "sources": ["https://www.nenkin.go.jp/international/"] }
  ```

- [ ] **Step 4 — validate + commit.** `python3 -m json.tool docs/data/tips.json >/dev/null && echo JSON_OK`; `node --test tests/lib.test.mjs` (seed test still green); confirm the 8 new ids present. Commit `feat(data): researched gap-filling tasks (ROCA, IDP, utilities, insurance, hanko, tax, pension, mail)`.

---

### Task 2: De-duplicate overlapping baked items — OWNER-VETOED

**Files:** `docs/data/tips.json` (removals ONLY after approval).

The existing checklist has genuine duplicates/overlaps. **Do not auto-remove.** Surface this candidate list to the owner; remove/merge only the ones they approve (and never a seeded id):

- [ ] **Step 1 — present the candidate list:**
  - **Residence card (Landing Day) — 2 near-identical items:** `chk-collect-your-residence-card-z` and `chk-get-your-residence-card-zairy` both say "collect your residence card at NRT." → merge to one.
  - **Address registration — 2 items:** `chk-addr-reg` (First 14 Days) and `chk-register-your-address-at-the-l` (First 14 Days) both cover the 14-day ward-office move-in. → merge to one (keep the one with the fine + jūminhyō detail).
  - **SIM / phone overlap:** `chk-break-the-sim-bank-address-chi` (Landing) + `chk-get-a-japanese-phone-number-s` (First 14) + `chk-at-narita-on-landing-day-rely`/`chk-decide-your-long-term-plan-bef-2` — several touch the passport-only-SIM story. → consider consolidating the most redundant pair (owner picks).
  - **Mobile Suica overlap:** `chk-set-up-mobile-suica-in-apple-w` (Landing) + `chk-iphone-users-set-up-transit-i` (First 14) overlap. → consider merging.
  - **NOT candidates (keep):** anything seeded (visa/passport/accommodation/NCD), and items that look similar but cover distinct steps.

- [ ] **Step 2 — apply only approved removals.** For each approved id: delete its item object; the seed-id existence test will fail loudly if an approved-for-deletion id was actually seeded (in which case keep it). After edits: `python3 -m json.tool` + `node --test` green.
- [ ] **Step 3 — commit** `chore(data): de-duplicate overlapping checklist items (owner-approved)` — list the removed ids in the commit body.

---

### Task 3: Service-worker bump

- [ ] **Step 1.** `docs/sw.js`: read `CACHE` + increment (no new asset files → no `ASSETS` change). `node --check`; `node --test` green.
- [ ] **Step 2.** Commit `chore(sw): bump for researched tasks + cleanup`.

---

## Self-Review

**Spec coverage (WS6 — researched expansion + cleanup):** 8 sourced, confidence-flagged gap-fillers tailored to a Canadian (ROCA, CAA IDP, utilities/garbage, renters insurance, mail-forwarding, hanko-optional, tax-filing, pension lump-sum) → Task 1. ✓ Veto-gated de-dup of the real overlaps (residence-card ×2, address-reg ×2, SIM/Suica) → Task 2. ✓ SW bump → Task 3. ✓

**Placeholder scan:** the two empty `sources: []` (renters insurance) are honest "no single canonical source" — the claim is general/low-stakes (`confidence: medium`); acceptable, not a placeholder.

**Scope check:** deliberately NOT a giant expansion — the existing list already covers the majors (documented above), so Plan 7 only fills verified gaps + dedupes. This avoids re-adding covered obligations.

**Risks:** (1) **Owner-gated deletions** — Task 2 removes nothing without approval; the seed-id test backstops accidental removal of a seeded id. (2) **2026 facts** — additions are sourced + confidence-flagged; the medium-confidence ones (hanko, tax, pension) say "verify"/"if". **Executor: confirm each `sources` URL resolves at build time and replace any 404** (deep gov/JAF/nenkin links move — the IDP claim is JAF-sourced, the pension rate is hedged "verify current rate"). (3) **Canadian framing** — ROCA/IDP/embassy are correct for a Canadian; don't genericize. (4) **JSON fragility** — `json.tool` after every edit; direct controller edits (not transcription).
