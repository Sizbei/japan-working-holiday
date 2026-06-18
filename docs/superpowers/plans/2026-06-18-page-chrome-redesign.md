# Page Chrome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the repeated global masthead from the 8 inner routes so the nav sits directly under the topbar (editorial, left-aligned, ink-underline active) with each page leading on its own heading; give every route exactly one `h1` via the router; and drop the dashboard "My Tokyo" band.

**Architecture:** Pure markup + CSS, plus small edits to `main.js` (drop two masthead setters + the My Tokyo mount), `router.js` (drive a centralized sr-only route `h1`), and `sw.js` (cache bump + asset-list edit). One module is deleted (`dashboard-mytokyo.js`). No new data, routes, or dependencies. The nav is shared chrome, so its restyle applies on all routes (including the dashboard) for consistency.

**Tech Stack:** Vanilla ES-module SPA, zero build, GitHub Pages from `/docs`. Tests: `node --test tests/lib.test.mjs` (pure-lib + source-parity only).

**Testing reality (read first):** This project unit-tests only pure `lib/` modules and does source-text *parity* checks (routes, lang, home-layout). The chrome changes here are markup/CSS verified by serving locally and confirming each route renders with no console errors (per `CLAUDE.md` "Run / verify"). Each task still runs `node --test` as the regression gate; Task 3 adds one new parity test. The controller does the visual browser pass.

**Spec:** `specs/2026-06-18-page-chrome-redesign.md`. **Mock:** `docs/mockups/header-mockups.html` (Variant B · Editorial).

**Serve for verification:**
```bash
cd docs && python3 -m http.server 8000   # http://localhost:8000  (password: lkjjapan)
```
Hash routing does not reload the document — hard-reload or append `?v=N`. Auth shortcut: `localStorage['jwh-auth-v1']='ok'`.

---

## File Structure

| File | Change |
|---|---|
| `docs/index.html` | Remove `<header class="hero">`; add sr-only `<h1 id="routeH1">` in `<main>`; remove `#myTokyo` section |
| `docs/assets/main.js` | Remove `#heroSub`/`#metaArrival` setters; remove `mountMyTokyo` import + call |
| `docs/assets/router.js` | In `activate()`, set the route `h1` (text + hidden-on-dashboard) |
| `docs/assets/style.css` | Remove `.hero*` rules; editorial nav; remove `.mt-*`/`#myTokyo` rules; drop `tokyo` area from Engawa/Bento |
| `docs/assets/dashboard-mytokyo.js` | **Delete** (orphaned) |
| `docs/sw.js` | Drop `dashboard-mytokyo.js` from ASSETS; bump `CACHE` |
| `tests/lib.test.mjs` | Add route-title parity test |

---

## Task 1: Remove the masthead (markup + JS setters + dead CSS)

**Files:** `docs/index.html`, `docs/assets/main.js`, `docs/assets/style.css`

- [ ] **Step 1: Delete the masthead markup**

In `docs/index.html`, delete this entire block (between the topbar's closing `</div>` and `<nav class="route-nav"`):
```html
<header class="hero">
  <div class="hero-mark" aria-hidden="true"><span class="sun"></span></div>
  <p class="hero-kicker" lang="ja" aria-hidden="true">私の一年 · ワーキングホリデー</p>
  <h1 id="heroTitle">My Year in Japan</h1>
  <p class="hero-sub" id="heroSub">Synths, arcades, shipping code at 2am JST — plus the paperwork that keeps me here.</p>
  <div class="hero-meta"><span id="metaArrival"></span></div>
</header>
```

- [ ] **Step 2: Remove the orphaned masthead setters in main.js**

In `docs/assets/main.js`, delete these two lines (keep the `#footGen` line above them):
```js
      setText('#heroSub', m.subtitle || '');
      setText('#metaArrival', m.arrival_date ? `Arrival: ${m.arrival_date}` : '');
```

- [ ] **Step 3: Remove the hero-specific CSS rules (surgical — do NOT remove `.theme-toggle`, `.sun`, or `@keyframes pulse`, which are shared/used elsewhere)**

In `docs/assets/style.css`, delete each of these rules. They are interleaved with kept rules, so delete them individually, not by line range:

Delete `.hero { … }`:
```css
.hero {
  position: relative; text-align: center; padding: 5rem 1.5rem 3rem;
  max-width: var(--maxw); margin: 0 auto; z-index: 1;
}
```
Delete `.hero-mark { display: flex; justify-content: center; margin-bottom: 1.5rem; }`
Delete `.hero-kicker { font-size: .8rem; letter-spacing: .35em; text-transform: uppercase; color: var(--indigo); margin: 0 0 .5rem; font-weight: 700; }`
Delete `.hero h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(2.4rem, 7vw, 4rem); margin: 0; letter-spacing: -.02em; line-height: 1.05; }`
Delete `.hero-sub { font-size: 1.15rem; color: var(--ink-soft); margin: .75rem 0 0; }`
Delete the `.hero-status` block + its `:empty`:
```css
.hero-status {
  display: inline-block; margin-top: 1.25rem; padding: .5rem 1rem; border-radius: 100px;
  background: color-mix(in srgb, var(--gold) 14%, transparent); color: var(--gold-ink);
  font-size: .85rem; font-weight: 500; border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent);
}
.hero-status:empty { display: none; }
```
Delete `.hero-meta { margin-top: 1.5rem; font-size: .85rem; color: var(--ink-soft); }`
Delete `.hero-meta .dot { margin: 0 .5rem; opacity: .5; }`
Delete `.hero { padding: 2.75rem var(--gutter) 1.75rem; }`
Delete `.hero      { view-transition-name: jwh-hero; }`
Delete `.hero-mark .sun{ width: 60px; height: 60px; animation: none; }`
Delete `.hero-kicker{ font-family: var(--pixel); letter-spacing: .16em; font-size: 1.05rem; }`
Delete the masthead-hide rule + its comment:
```css
/* On the dashboard the bespoke ink hero IS the hero, so hide the global masthead
   there to avoid a duplicate "My Year in Japan" title. Other routes keep the masthead. */
html:has(#view-dashboard.is-active) header.hero{ display: none; }
```

- [ ] **Step 4: Remove the dead responsive `.hero` rules (inside `@media` blocks — delete only the `.hero*` lines, leave the neighbours)**

Delete `.hero { padding-top: 3.5rem; }` (the one followed by `.block { padding: 1.25rem; }`).
Delete `.hero { padding-top: 3rem; }` (the one followed by the TOC comment).
Delete these three lines together (the tighter-hero mobile block):
```css
  .hero{ padding: 1.4rem var(--gutter) .9rem; }
  .hero-mark .sun{ width: 44px; height: 44px; }
  .hero-kicker{ font-size: .9rem; }
```

- [ ] **Step 5: Run the unit tests**

```bash
node --test tests/lib.test.mjs
```
Expected: 37 pass, 0 fail.

- [ ] **Step 6: Structural verify (controller does the visual pass)**

```bash
grep -c 'class="hero"' docs/index.html        # expect 0
grep -c 'heroSub\|metaArrival' docs/assets/main.js   # expect 0
grep -nE '^\.hero|header\.hero|view-transition-name: jwh-hero' docs/assets/style.css   # expect no matches
grep -c 'theme-toggle' docs/assets/style.css  # expect >=1 (KEPT)
```

- [ ] **Step 7: Commit**

```bash
git add docs/index.html docs/assets/main.js docs/assets/style.css
git commit -m "feat: remove the global masthead (redundant with topbar + page headings)"
```

---

## Task 2: Editorial nav (left-aligned, ink-underline active, static)

**Files:** `docs/assets/style.css`

- [ ] **Step 1: Restyle the nav container — left-aligned + static (the spec's 'scrolls away normally')**

Replace:
```css
.route-nav {
  position: sticky; top: var(--header-h); z-index: 20;
  display: flex; gap: .25rem; justify-content: center; flex-wrap: wrap; align-items: center;
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  -webkit-backdrop-filter: saturate(1.3) blur(8px);
  backdrop-filter: saturate(1.3) blur(8px);
  padding: .4rem var(--gutter); border-bottom: 1px solid var(--line);
}
```
with:
```css
.route-nav {
  position: static; z-index: 20;
  display: flex; gap: .15rem; justify-content: flex-start; flex-wrap: wrap; align-items: center;
  background: var(--bg);
  padding: .4rem var(--gutter); border-bottom: 1px solid var(--line);
}
```

- [ ] **Step 2: Drop the hover pill**

Replace `.route-nav a:hover { color: var(--ink); background: var(--bg-soft); }`
with `.route-nav a:hover { color: var(--ink); }`

- [ ] **Step 3: Replace the red-pill active state with the ink underline**

Replace `.route-nav a[aria-current="page"] { color: var(--on-accent); background: var(--red); }`
with:
```css
.route-nav a[aria-current="page"] { color: var(--ink); font-weight: 800; }
.route-nav a[aria-current="page"]::after { transform: scaleX(1); }
```
(The `.route-nav a::after` vermilion underline is already defined in the chrome-consistency block lower in the file; the active rule above shows it persistently. Its higher specificity — the attribute selector — wins over the base `scaleX(0)`, so order doesn't matter.)

- [ ] **Step 4: Run the unit tests**

```bash
node --test tests/lib.test.mjs
```
Expected: 37 pass, 0 fail.

- [ ] **Step 5: Structural verify**

```bash
grep -n 'position: static; z-index: 20;' docs/assets/style.css        # the new nav
grep -c 'aria-current="page"] { color: var(--on-accent)' docs/assets/style.css  # expect 0 (old pill gone)
```

- [ ] **Step 6: Commit**

```bash
git add docs/assets/style.css
git commit -m "feat: editorial nav — left-aligned, ink-underline active, static"
```

---

## Task 3: Centralized per-route `h1` (accessibility)

**Files:** `docs/index.html`, `docs/assets/router.js`, `tests/lib.test.mjs`

- [ ] **Step 1: Add the sr-only route heading to the markup**

In `docs/index.html`, immediately after `<main id="main">`, add:
```html
  <h1 id="routeH1" class="sr-only"></h1>
```
(The `.sr-only` utility already exists in `style.css`.)

- [ ] **Step 2: Drive it from the router**

In `docs/assets/router.js`, inside `activate(route, …)`, find:
```js
  document.title = TITLES[route] ? `${TITLES[route]} · ${SITE}` : SITE;
```
and add directly below it:
```js
  const rh = document.getElementById('routeH1');
  if (rh) { rh.hidden = route === 'dashboard'; rh.textContent = TITLES[route] || SITE; }
```
(On the dashboard the visible dash-hero already provides the `<h1>`, so the sr-only one is hidden there to keep exactly one `h1` per page.)

- [ ] **Step 3: Write the failing parity test**

In `tests/lib.test.mjs`, append:
```js
test('route-title parity: every route has a TITLES entry (drives the sr-only h1)', () => {
  const router = readFileSync(new URL('../docs/assets/router.js', import.meta.url), 'utf8');
  const routes = router.match(/export const ROUTES = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
  const titlesBlock = router.match(/const TITLES = \{([\s\S]*?)\}/)[1];
  const missing = routes.filter(r => !new RegExp(`\\b${r}:`).test(titlesBlock));
  assert.deepEqual(missing, [], `routes missing a TITLES entry: ${missing}`);
});
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/lib.test.mjs
```
Expected: 38 pass, 0 fail (the new test passes — `TITLES` already lists all 9 routes).

- [ ] **Step 5: Structural verify**

```bash
grep -c 'id="routeH1"' docs/index.html              # expect 1
grep -c 'getElementById(.routeH1.)' docs/assets/router.js   # expect 1
```

- [ ] **Step 6: Commit**

```bash
git add docs/index.html docs/assets/router.js tests/lib.test.mjs
git commit -m "feat: centralized sr-only route h1 (one h1 per page after masthead removal)"
```

---

## Task 4: Drop the dashboard My Tokyo band

**Files:** `docs/index.html`, `docs/assets/main.js`, `docs/assets/dashboard-mytokyo.js` (delete), `docs/sw.js`, `docs/assets/style.css`

- [ ] **Step 1: Delete the `#myTokyo` section markup**

In `docs/index.html`, delete:
```html
  <!-- ===== MY TOKYO (kept, re-skinned via CSS) ===== -->
  <section id="myTokyo" aria-labelledby="myTokyoH">
    <div class="mt-head"><span class="mt-mark" aria-hidden="true"></span><h2 id="myTokyoH">My Tokyo</h2></div>
    <div class="mt-grid" id="myTokyoGrid"></div>
  </section>
```

- [ ] **Step 2: Remove the mount wiring in main.js**

Delete the import line:
```js
import { mountMyTokyo } from './dashboard-mytokyo.js';
```
and the call line:
```js
      mountMyTokyo(data);            // surface my interests at the top of the dashboard
```

- [ ] **Step 3: Delete the orphaned module**

```bash
git rm docs/assets/dashboard-mytokyo.js
```

- [ ] **Step 4: Drop it from the service-worker precache**

In `docs/sw.js`, remove `'assets/dashboard-mytokyo.js', ` from the `ASSETS` array (the long `assets/*.js` line).

- [ ] **Step 5: Remove the My Tokyo CSS band**

In `docs/assets/style.css`, delete:
```css
/* MY TOKYO dashboard band */
#myTokyo{ max-width: var(--maxw); margin: 0 auto var(--s8); padding: 0 var(--gutter); }
.mt-head{ display: flex; align-items: center; gap: .6rem; margin-bottom: var(--s4); }
.mt-mark{ width: 22px; height: 22px; background: var(--hinomaru) center/contain no-repeat; display: inline-block; flex: none; }
#myTokyoH{ font-family: var(--pixel); font-size: clamp(1.5rem, 1.2rem + 1vw, 1.9rem); letter-spacing: .06em; margin: 0; }
.mt-grid{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s4); }
.mt-card{ text-decoration: none; color: var(--ink); display: block; }
.mt-eyebrow{ display: block; font-size: .64rem; letter-spacing: .1em; margin-bottom: .3rem; }
.mt-card.cat-gear .mt-eyebrow, .mt-card.cat-listen .mt-eyebrow{ color: var(--c-music-ink); }
.mt-card.cat-arcade .mt-eyebrow{ color: var(--c-geek); }
.mt-card.cat-build .mt-eyebrow{ color: var(--c-build); }
```

- [ ] **Step 6: Remove the dashboard re-skin rules**

Delete (the "my tokyo re-skin" block under the dashboard ink section):
```css
/* ---- my tokyo re-skin (CSS-only over existing .mt-card markup) ---- */
#view-dashboard #myTokyo{ margin-top: var(--s6); }
#view-dashboard .mt-card{ border-radius: var(--r-md); border: 1px solid var(--line-faint); }
#view-dashboard .mt-eyebrow{ color: var(--shu); }
```

- [ ] **Step 7: Drop `.mt-eyebrow` / `.mt-card` from the three shared selector lists**

Replace `.topbar-brand, .route-nav a, .widget-h, .trk-h, .cp-head, .mt-eyebrow{`
with `.topbar-brand, .route-nav a, .widget-h, .trk-h, .cp-head{`

Replace `.finding .f-why, .card2 .c-detail, .ci-note, .lede, .mt-card, .top-card .t-reason,`
with `.finding .f-why, .card2 .c-detail, .ci-note, .lede, .top-card .t-reason,`

Remove the `.mt-card` line from the dashboard ink-paper background rule — replace:
```css
#view-dashboard .dash-hero,
#view-dashboard .needs-me .widget,
#view-dashboard .mt-card,
#view-dashboard .teaser{
  background: color-mix(in srgb, var(--bg-soft) 80%, var(--ink-paper));
}
```
with:
```css
#view-dashboard .dash-hero,
#view-dashboard .needs-me .widget,
#view-dashboard .teaser{
  background: color-mix(in srgb, var(--bg-soft) 80%, var(--ink-paper));
}
```

- [ ] **Step 8: Drop the `tokyo` area from the Engawa & Bento layouts**

Engawa — replace `  grid-template-areas: "hero needs" "tokyo tokyo" "teasers teasers";`
with `  grid-template-areas: "hero needs" "teasers teasers";`

Engawa — delete the `#myTokyo` reset rule + its comment:
```css
/* #myTokyo ships with `max-width + margin:0 auto`; on a grid item the auto margins
   disable stretch (it collapses to content width + centers). Reset so it fills the row. */
html[data-home="engawa"] #view-dashboard > #myTokyo{ grid-area: tokyo; margin: 0; max-width: none; padding: 0; }
```

Engawa mobile — replace `  html[data-home="engawa"] #view-dashboard{ grid-template-columns: 1fr; grid-template-areas: "hero" "needs" "tokyo" "teasers"; }`
with `  html[data-home="engawa"] #view-dashboard{ grid-template-columns: 1fr; grid-template-areas: "hero" "needs" "teasers"; }`

Bento — delete `html[data-home="bento"] #view-dashboard #myTokyo .mt-head{ justify-content: center; }`

- [ ] **Step 9: Run tests + confirm no dead My Tokyo references remain**

```bash
node --test tests/lib.test.mjs                                  # expect 38 pass
grep -rn 'myTokyo\|mt-card\|mt-eyebrow\|mt-head\|mt-grid\|mt-mark\|mountMyTokyo\|dashboard-mytokyo' docs/   # expect NO matches
```
Expected: tests green; the grep returns nothing.

- [ ] **Step 10: Commit**

```bash
git add -A docs/index.html docs/assets/main.js docs/sw.js docs/assets/style.css docs/assets/dashboard-mytokyo.js
git commit -m "feat: drop the dashboard My Tokyo band (+ remove its tokyo grid-area)"
```

---

## Task 5: Cache-bust + full verification

**Files:** `docs/sw.js`

- [ ] **Step 1: Bump the service-worker cache**

In `docs/sw.js`, replace `const CACHE = 'jwh-v59';` with `const CACHE = 'jwh-v60';`.

- [ ] **Step 2: Full regression**

```bash
node --test tests/lib.test.mjs
python3 -m json.tool docs/data/tips.json > /dev/null && echo "tips.json valid"
```
Expected: 38 pass, 0 fail; `tips.json valid`.

- [ ] **Step 3: Browser pass (clear the SW first — DevTools → Application → unregister + clear storage)**

Open `http://localhost:8000/?v=1#/calendar` and confirm, per spec §7:
- Masthead gone; nav sits directly under the topbar, left-aligned, "Calendar" ink-underlined; page leads with "My Calendar" + lede; content begins ~150px from the top.
- Walk all 8 inner routes (calendar, going, deadlines, checklist, explore, rooms, map, plan) — each renders, nav active marker correct, no console errors.
- DevTools → Elements: each inner route has exactly one `<h1>` (the sr-only `#routeH1` with the page name).
- Dashboard (`#/dashboard`): unchanged except the My Tokyo band is gone; `#routeH1` is `hidden`; the dash-hero `<h1>` is the only one. Open ⚙ → Settings → Home layout and confirm **Scroll / Split / Bento** all render countdown → needs-me → teasers with no empty gap where My Tokyo was.
- Reduced-motion + dark mode still intact.

- [ ] **Step 4: Commit**

```bash
git add docs/sw.js
git commit -m "chore: bump SW cache to jwh-v60 for page-chrome redesign"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §3a remove masthead (markup + JS setters + dead `.hero` CSS, keeping shared `.theme-toggle`/`.sun`/pulse) → Task 1. ✓
- §3b editorial nav (left-aligned, ink-underline active, drop red pill + hover bg, static per the user's "scrolls away" choice, hairline border) → Task 2. ✓
- §3c centralized sr-only route `h1` via the router, hidden on dashboard, with a parity test → Task 3. ✓
- §4 drop My Tokyo (markup, mount, module delete, sw asset, CSS, Engawa/Bento `tokyo` area) → Task 4. ✓
- §5 SW bump; §7 verification (one h1/page, all routes, layouts, no console errors) → Tasks 4–5. ✓

**Placeholder scan:** none — every step has exact code/commands. The one judgement step (Task 1 Step 3) explicitly names what to keep vs. delete because the rules interleave.

**Type/name consistency:** `#routeH1` markup (T3 S1) matches the router lookup (T3 S2) and the parity test reads the existing `TITLES`/`ROUTES` (no rename). `.sr-only` is pre-existing. The Engawa/Bento edits (T4 S8) remove exactly the `tokyo` area added for the now-deleted `#myTokyo`. `CACHE` goes `jwh-v59` → `jwh-v60` (current value confirmed). Test count: 37 → 38 after Task 3's new test.

**Watch-outs flagged for the executor:**
- Task 1 Step 3: do NOT delete `.theme-toggle` (topbar dark-mode button), `.sun`, or `@keyframes pulse` — they interleave with the hero rules but are used elsewhere.
- Task 2 Step 3: the active underline relies on the chrome-pass `.route-nav a::after` defined later in the file; it must remain.
