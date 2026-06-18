# Front Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `#/dashboard` home as a Sumi-e ink "save file" page where the countdown to landing is the hero, with a compact "Needs me" strip, a re-skinned My Tokyo band, and one-line teasers for the demoted content.

**Architecture:** Pure markup + CSS + a refactor of `dashboard.js`'s render functions. No new data model, no new routes, no new dependencies. Reuses the existing `jwh:data-changed` single-path flow: mutations dispatch the event, `dashboard.js` re-derives. The heavy ink treatment is scoped to `#view-dashboard`; the shared topbar/nav get only a light consistency pass so the other 8 routes stay intact.

**Tech Stack:** Vanilla ES-module SPA, zero build, GitHub Pages from `/docs`. Fonts already loaded (Shippori Mincho, Newsreader, Space Mono, Zen Kaku Gothic). Tests: `node --test tests/lib.test.mjs` (pure-lib only).

**Testing reality (read before starting):** This project unit-tests only the pure `lib/` modules; DOM-rendering code in `dashboard.js` is verified by serving locally and confirming the page renders with no console errors (per `CLAUDE.md` "Run / verify"). The teaser/needs-me logic added here is thin and mirrors existing inline render patterns, so it is **intentionally not** given new unit tests — adding a DOM-test harness to a no-build project would be over-engineering. Every JS-touching task still runs `node --test tests/lib.test.mjs` as a regression gate (import-break / parity), and every task ends with a browser verification.

**Spec:** `specs/2026-06-17-front-page-design.md`. **Mock:** `docs/mockups/front-mockups.html` (variant A + the "Needs me" strip from B).

**Local serve for verification (used in every task):**
```bash
cd docs && python3 -m http.server 8000   # http://localhost:8000  (password: lkjjapan)
```
In an already-open tab, hard-reload or append `?v=N` because the hash router does not reload the document. Auth shortcut for testing: set `localStorage['jwh-auth-v1'] = 'ok'`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `docs/assets/style.css` | Ink tokens + `#view-dashboard`-scoped layout + light chrome pass | Modify (append a scoped block + 2 token lines + nav/brand pass) |
| `docs/index.html` | Dashboard view markup (hero, needs-me, my-tokyo, teasers); topbar countdown a11y | Modify (`#view-dashboard` block + `#countdown` attr) |
| `docs/assets/dashboard.js` | Hero countdown, trimmed needs-me renderers, new teasers, drop widget DnD | Modify |
| `docs/sw.js` | Cache-bust the asset changes | Modify (`CACHE` bump) |

No files are created. `docs/assets/dashboard-mytokyo.js` is **not** modified — the My Tokyo re-skin is CSS-only against its existing `.mt-card` output.

---

## Task 1: Ink design tokens + scoped paper background

**Files:**
- Modify: `docs/assets/style.css` (`:root` token block near top; append a new scoped section at end of file)

- [ ] **Step 1: Add the two new ink tokens to `:root`**

Find the `:root{` block (around line 30–45, where `--c-disney`, `--indigo` etc. live) and add these two lines inside it (place them right after the existing `--indigo` / accent color declarations):

```css
  --shu:#b6391f;            /* vermilion seal — Sumi-e accent */
  --shu-deep:#8f2c17;
```

- [ ] **Step 2: Append the scoped dashboard ink base at the END of `style.css`**

```css

/* ============================================================
   FRONT PAGE — Sumi-e ink, scoped to #view-dashboard only.
   (spec: specs/2026-06-17-front-page-design.md)
   ============================================================ */
#view-dashboard{
  --ink-paper: color-mix(in srgb, var(--bg) 86%, #e9dcc2);   /* warmer kinari paper, theme-aware */
}
#view-dashboard .dash-hero,
#view-dashboard .needs-me .widget,
#view-dashboard .mt-card,
#view-dashboard .teaser{
  background: color-mix(in srgb, var(--bg-soft) 80%, var(--ink-paper));
}
/* a softer hairline used by the dashboard ink surfaces */
#view-dashboard{ --line-faint: color-mix(in srgb, var(--line) 60%, transparent); }
```

- [ ] **Step 3: Verify tokens resolve and the page still renders**

Serve locally, open `http://localhost:8000/?v=1#/dashboard`, and in DevTools console run:
```js
getComputedStyle(document.documentElement).getPropertyValue('--shu')
```
Expected: `#b6391f`. The dashboard should look slightly warmer; no layout change yet, no console errors.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/style.css
git commit -m "feat: add Sumi-e ink tokens + scoped paper base for #/dashboard"
```

---

## Task 2: Restructure the dashboard markup

Replace the entire `#view-dashboard` block and make the topbar countdown decorative (the hero becomes the live region).

**Files:**
- Modify: `docs/index.html` (the `<div class="view" id="view-dashboard">…</div><!-- /view-dashboard -->` block; and the `#countdown` span in the topbar)

- [ ] **Step 1: Make the topbar countdown non-announcing**

Find this line in the topbar:
```html
  <span class="countdown" id="countdown" role="status" aria-live="polite"></span>
```
Replace with (the hero will own the live region; this avoids a double screen-reader announcement):
```html
  <span class="countdown" id="countdown" aria-hidden="true"></span>
```

- [ ] **Step 2: Replace the whole `#view-dashboard` block**

Find the block that currently starts with `<div class="view" id="view-dashboard" data-route="dashboard">` and the long `<p class="intro">…</p>`, the `#myTokyo` section, and the `#dashHome` section with 6 widgets, ending at `</div><!-- /view-dashboard -->`. Replace the entire block with:

```html
  <div class="view" id="view-dashboard" data-route="dashboard">

  <!-- ===== HERO: the countdown is the hero (spec A·Kakemono) ===== -->
  <section class="dash-hero" aria-labelledby="heroTitleH">
    <div class="scroll-rail" aria-hidden="true">私の一年<small>2026—2027</small></div>
    <div class="dash-hero-main">
      <div class="sun-ink" aria-hidden="true"></div>
      <p class="dash-kicker">My save file · Tokyo</p>
      <h2 id="heroTitleH" class="dash-h1">My Year<br>in Japan</h2>
      <p class="dash-sub">Synths in Ochanomizu, Super Potato afternoons, listening bars, and meetups where I bring a build to show — plus the paperwork that keeps me here.</p>
      <div class="hero-count" id="heroCount" role="status" aria-live="polite">
        <span class="hc-num count">—</span>
        <span class="hc-meta"><span class="hc-unit"></span><span class="hc-date">NRT · 2026-06-30</span></span>
      </div>
    </div>
  </section>

  <!-- ===== NEEDS ME: promoted essentials (spec B·Engawa strip) ===== -->
  <section class="needs-me" aria-label="What needs me">
    <div class="widget" id="wDeadlines"><h3 class="widget-h"><span aria-hidden="true">⚖️</span> Next deadlines</h3><div class="widget-body"></div></div>
    <div class="widget" id="wGoing"><h3 class="widget-h"><span aria-hidden="true">🎫</span> Going to</h3><div class="widget-body"></div></div>
    <div class="widget" id="wProgress"><h3 class="widget-h"><span aria-hidden="true">✅</span> Checklist</h3><div class="widget-body"></div></div>
  </section>

  <!-- ===== MY TOKYO (kept, re-skinned via CSS) ===== -->
  <section id="myTokyo" aria-labelledby="myTokyoH">
    <div class="mt-head"><span class="mt-mark" aria-hidden="true"></span><h2 id="myTokyoH">My Tokyo</h2></div>
    <div class="mt-grid" id="myTokyoGrid"></div>
  </section>

  <!-- ===== TEASERS: demoted content, one line each ===== -->
  <section class="dash-teasers" aria-label="More">
    <div class="teaser" id="tBookBy"><span class="teaser-h"><span aria-hidden="true">🎟️</span> Book-by</span><div class="teaser-body"></div></div>
    <div class="teaser" id="tEvents"><span class="teaser-h"><span aria-hidden="true">📅</span> Upcoming</span><div class="teaser-body"></div></div>
    <div class="teaser" id="tPlan"><span class="teaser-h"><span aria-hidden="true">🗺️</span> Day plan</span><div class="teaser-body"></div></div>
  </section>

  </div><!-- /view-dashboard -->
```

- [ ] **Step 3: Run the unit tests (routes/lang parity must stay green)**

Run from repo root:
```bash
node --test tests/lib.test.mjs
```
Expected: 35 pass, 0 fail. (Dashboard is still route `dashboard` with `#view-dashboard` + nav link, so routes-parity holds.)

- [ ] **Step 4: Verify the page loads without crashing**

Serve, open `http://localhost:8000/?v=2#/dashboard`. The hero text + empty `—` countdown + three empty "Needs me" cards + My Tokyo + three empty teasers should appear. **No console errors** (the old `fill('#wEvents')`/`renderPlanWidget` calls target now-removed nodes, but each renderer guards `if (!el) return`, so nothing throws). Countdown/cards fill in Task 3.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html
git commit -m "feat: restructure #/dashboard markup — ink hero, needs-me strip, teasers"
```

---

## Task 3: Dashboard render logic — hero countdown, teasers, trim, drop DnD

**Files:**
- Modify: `docs/assets/dashboard.js`

- [ ] **Step 1: Remove the `makeSortable` import (no longer used)**

Find:
```js
import { makeSortable } from './dnd.js';
```
Delete that line.

- [ ] **Step 2: Remove the widget-DnD call and function**

In `mountDashboard`, delete this line:
```js
  setupWidgetDnD();
```
Then delete the entire `setupWidgetDnD()` function (the block from `function setupWidgetDnD() {` through its closing `}`). The home layout is now fixed by design (spec §9). `KEYS.widgetOrder` stays defined in `store.js` but is no longer written.

- [ ] **Step 3: Render the hero countdown (and keep the topbar copy in sync)**

Replace the existing `renderCountdown()` function:
```js
// ---- countdown ribbon ----
function renderCountdown() {
  const el = $('#countdown');
  if (!el) return;
  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', TODAY);
  const unit = c.phase === 'arrived' ? (c.days === 1 ? 'DAY IN' : 'DAYS IN') : (c.days === 1 ? 'DAY TO NRT' : 'DAYS TO NRT');
  el.innerHTML = `<span class="cd-num">${c.days ?? ''}</span><span class="cd-label">${unit}</span><span class="cd-credit">CREDIT 01</span>`;
  el.classList.toggle('arrived', c.phase === 'arrived');
}
```
with:
```js
// ---- countdown: hero numeral (canonical) + small topbar copy ----
function renderCountdown() {
  const c = countdown(DATA.meta?.arrival_date || '2026-06-30', TODAY);
  const arrived = c.phase === 'arrived';
  // topbar (decorative, aria-hidden in markup)
  const el = $('#countdown');
  if (el) {
    const unit = arrived ? (c.days === 1 ? 'DAY IN' : 'DAYS IN') : (c.days === 1 ? 'DAY TO NRT' : 'DAYS TO NRT');
    el.innerHTML = `<span class="cd-num">${c.days ?? ''}</span><span class="cd-label">${unit}</span><span class="cd-credit">CREDIT 01</span>`;
    el.classList.toggle('arrived', arrived);
  }
  // hero (the live region)
  const hero = $('#heroCount');
  if (hero) {
    const unit = arrived ? (c.days === 1 ? 'day in Japan' : 'days in Japan') : (c.days === 1 ? 'day until I land' : 'days until I land');
    hero.querySelector('.hc-num').textContent = c.days ?? '';
    hero.querySelector('.hc-unit').textContent = unit;
    hero.classList.toggle('arrived', arrived);
  }
}
```

- [ ] **Step 4: Trim the "Needs me" renderers and add teasers; drop the removed widgets**

Replace the `renderWidgets(alerts)` function:
```js
// ---- home widgets ----
function renderWidgets(alerts) {
  fill('#wDeadlines', alerts.filter(a => a.kind === 'deadline' || a.kind === 'task'));
  fill('#wEvents', alerts.filter(a => a.kind === 'event'));
  fill('#wBookBy', alerts.filter(a => a.kind === 'book'));
  renderProgress();
  renderPlanWidget();
  renderGoingWidget();
}
```
with:
```js
// ---- home: promoted "needs me" cards + demoted teasers ----
function renderWidgets(alerts) {
  fill('#wDeadlines', alerts.filter(a => a.kind === 'deadline' || a.kind === 'task'), 3);
  renderProgress();
  renderGoingWidget();
  renderTeasers(alerts);
}
function renderTeasers(alerts) {
  const book = alerts.find(a => a.kind === 'book');
  teaser('#tBookBy', book ? `${fmtShort(book.when)} · ${clip(book.title, 38)}` : 'Nothing to book yet', '#/deadlines');
  const ev = alerts.find(a => a.kind === 'event');
  teaser('#tEvents', ev ? `${fmtShort(ev.when)} · ${clip(ev.title, 38)}` : 'No upcoming events', '#/calendar');
  const plans = loadPlans();
  const date = Object.keys(plans).filter(d => plans[d] && plans[d].stops && plans[d].stops.length && d >= TODAY).sort()[0];
  teaser('#tPlan', date ? `${date === TODAY ? 'Today' : fmtShort(date)} · ${plans[date].stops.length} stop${plans[date].stops.length === 1 ? '' : 's'}` : 'Plan a day', '#/plan');
}
function teaser(sel, text, route) {
  const el = $(sel);
  if (!el) return;
  el.querySelector('.teaser-body').innerHTML = `<a href="${route}">${esc(text)} <span class="teaser-go" aria-hidden="true">→</span></a>`;
}
```

- [ ] **Step 5: Trim the Going card to the next 2 and delete the now-unused plan widget**

In `renderGoingWidget()`, change:
```js
    ? `<ul>${going.slice(0, 6).map(e => {
```
to:
```js
    ? `<ul>${going.slice(0, 2).map(e => {
```
Then delete the entire `renderPlanWidget()` function (its data now lives in the `#tPlan` teaser). Leave `renderProgress`, `fill`, `renderGoingWidget` otherwise intact.

- [ ] **Step 6: Make `fill` respect a max count**

Replace the `fill` function signature/body:
```js
function fill(sel, list) {
  const el = $(sel);
  if (!el) return;
  const body = list.length
    ? `<ul>${list.slice(0, 5).map(a => `<li class="sev-${a.severity}">
```
with:
```js
function fill(sel, list, max = 5) {
  const el = $(sel);
  if (!el) return;
  const body = list.length
    ? `<ul>${list.slice(0, max).map(a => `<li class="sev-${a.severity}">
```
(Leave the rest of `fill` unchanged.)

- [ ] **Step 7: Run the unit tests**

```bash
node --test tests/lib.test.mjs
```
Expected: 35 pass, 0 fail (no import is broken; `loadPlans`, `fmtShort`, `clip`, `esc` are already imported/defined in this file).

- [ ] **Step 8: Verify in the browser**

Serve, open `http://localhost:8000/?v=3#/dashboard`. Confirm:
- Hero shows the live day count to 2026-06-30 (e.g. `13 days until I land`).
- "Needs me" cards populate: deadlines (≤3), Going to (≤2 — Ultra Japan 2026), Checklist (% + count).
- Three teasers each show one line + `→` linking to `#/deadlines`, `#/calendar`, `#/plan`.
- **No console errors.** Toggle a checklist item on `#/checklist`, return to `#/dashboard` → the progress card reflects it (proves `jwh:data-changed` still drives the refresh).

- [ ] **Step 9: Commit**

```bash
git add docs/assets/dashboard.js
git commit -m "feat: hero countdown + teasers; trim needs-me; drop home widget DnD"
```

---

## Task 4: Dashboard ink layout (CSS)

Style the new structure. All selectors are scoped under `#view-dashboard` (or its children) so no other route is touched.

**Files:**
- Modify: `docs/assets/style.css` (append to the scoped section started in Task 1)

- [ ] **Step 1: Append the layout CSS at the end of `style.css`**

```css

/* ---- hero ---- */
#view-dashboard{ padding-top: var(--s4); }
#view-dashboard .dash-hero{
  position: relative; display: grid; grid-template-columns: auto 1fr; gap: 1.6rem;
  align-items: start; border-radius: var(--r-md); padding: 1.6rem 1.4rem 1.8rem; overflow: hidden;
  border: 1px solid var(--line-faint);
}
#view-dashboard .scroll-rail{
  writing-mode: vertical-rl; font-family: var(--serif-jp); font-weight: 700; font-size: 1.4rem;
  letter-spacing: .3em; color: var(--ink); border-left: 2px solid var(--line); padding-left: .4rem;
  display: flex; flex-direction: column; gap: .6rem;
}
#view-dashboard .scroll-rail small{ writing-mode: horizontal-tb; font-family: var(--mono); font-size: .58rem; letter-spacing: .18em; color: var(--shu); }
#view-dashboard .dash-hero-main{ position: relative; z-index: 1; }
#view-dashboard .sun-ink{
  position: absolute; z-index: 0; width: 320px; height: 320px; right: -40px; top: -60px; border-radius: 50%;
  background: radial-gradient(circle at 38% 36%, color-mix(in srgb, var(--shu) 78%, transparent), color-mix(in srgb, var(--shu) 30%, transparent) 55%, transparent 74%);
  pointer-events: none;
}
#view-dashboard .dash-kicker{ font-family: var(--serif-jp); font-weight: 600; letter-spacing: .18em; text-transform: uppercase; font-size: .72rem; color: var(--shu); margin: 0 0 .4rem; }
#view-dashboard .dash-h1{ font-family: var(--serif-jp); font-weight: 800; font-size: clamp(2rem, 5vw, 3.1rem); line-height: 1.05; margin: 0 0 .35rem; letter-spacing: -.01em; }
#view-dashboard .dash-sub{ font-family: var(--serif); font-style: italic; font-size: 1.04rem; color: var(--ink-soft); max-width: 44ch; margin: 0; }
#view-dashboard .hero-count{ display: flex; align-items: flex-end; gap: 1rem; margin-top: 1.3rem; }
#view-dashboard .hc-num{ font-family: var(--mono); font-weight: 700; font-size: clamp(4rem, 14vw, 8rem); line-height: .86; letter-spacing: -.02em; color: var(--ink); font-variant-numeric: tabular-nums; }
#view-dashboard .hero-count.arrived .hc-num{ color: var(--shu); }
#view-dashboard .hc-meta{ display: flex; flex-direction: column; padding-bottom: 1rem; }
#view-dashboard .hc-unit{ font-family: var(--serif-jp); font-size: 1.1rem; color: var(--ink); letter-spacing: .04em; }
#view-dashboard .hc-date{ font-family: var(--mono); font-size: .72rem; color: var(--ink-faint); letter-spacing: .06em; margin-top: .2rem; }

/* ---- needs-me strip ---- */
#view-dashboard .needs-me{ display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s4); margin-top: var(--s5); }
#view-dashboard .needs-me .widget{ border-radius: var(--r-md); }

/* ---- my tokyo re-skin (CSS-only over existing .mt-card markup) ---- */
#view-dashboard #myTokyo{ margin-top: var(--s6); }
#view-dashboard .mt-card{ border-radius: var(--r-md); border: 1px solid var(--line-faint); }
#view-dashboard .mt-eyebrow{ color: var(--shu); }

/* ---- teasers ---- */
#view-dashboard .dash-teasers{ display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s4); margin-top: var(--s5); }
#view-dashboard .teaser{ border: 1px solid var(--line-faint); border-radius: var(--r-md); padding: .9rem 1rem; }
#view-dashboard .teaser-h{ display: block; font-family: var(--mono); font-size: .64rem; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); margin-bottom: .4rem; }
#view-dashboard .teaser-body a{ font-family: var(--serif); font-size: .92rem; color: var(--ink); text-decoration: none; display: flex; justify-content: space-between; gap: .5rem; align-items: baseline; }
#view-dashboard .teaser-go{ color: var(--shu); }
@media (hover: hover) and (pointer: fine){ #view-dashboard .teaser:hover{ border-color: var(--line); } #view-dashboard .teaser:hover .teaser-body a{ color: var(--shu); } }

/* ---- entrance (respect reduced motion) ---- */
@keyframes dashRise{ from{ opacity: 0; transform: translateY(16px); } to{ opacity: 1; transform: none; } }
#view-dashboard.is-active .dash-hero{ animation: dashRise .6s cubic-bezier(.23,1,.32,1) both; }
#view-dashboard.is-active .needs-me .widget{ animation: dashRise .55s cubic-bezier(.23,1,.32,1) both; }
#view-dashboard.is-active .needs-me .widget:nth-child(2){ animation-delay: .05s; }
#view-dashboard.is-active .needs-me .widget:nth-child(3){ animation-delay: .1s; }
#view-dashboard.is-active .dash-teasers .teaser{ animation: dashRise .55s cubic-bezier(.23,1,.32,1) both; }
#view-dashboard.is-active .dash-teasers .teaser:nth-child(2){ animation-delay: .05s; }
#view-dashboard.is-active .dash-teasers .teaser:nth-child(3){ animation-delay: .1s; }
html[data-reduce-motion="on"] #view-dashboard *{ animation: none !important; }

/* ---- responsive ---- */
@media (max-width: 860px){
  #view-dashboard .dash-hero{ grid-template-columns: 1fr; }
  #view-dashboard .scroll-rail{ writing-mode: horizontal-tb; flex-direction: row; align-items: baseline; gap: 1rem; border-left: 0; border-bottom: 2px solid var(--line); padding: 0 0 .5rem; }
  #view-dashboard .needs-me{ grid-template-columns: 1fr; }
  #view-dashboard .dash-teasers{ grid-template-columns: 1fr; }
}
@media (max-width: 560px){
  #view-dashboard .sun-ink{ width: 220px; height: 220px; right: -50px; }
}
```

- [ ] **Step 2: Confirm the design tokens used above exist**

Run from repo root:
```bash
for t in --r-md --s4 --s5 --s6 --serif-jp --ink-faint --mono --line; do printf '%s ' "$t"; grep -c -- "$t:" docs/assets/style.css; done
```
Expected: every token prints a count `>= 1` (these are all pre-existing). `--line-faint` is defined locally on `#view-dashboard` in Task 1 Step 2 — no global definition needed.

- [ ] **Step 3: Verify desktop + mobile**

Serve, open `http://localhost:8000/?v=4#/dashboard`:
- Desktop (wide window): vertical 私の一年 rail left of the hero; giant countdown; 3-up needs-me; 3-up teasers; ink-wash sun bleeding top-right.
- Resize to ~480px: rail flips horizontal; needs-me + teasers stack to one column; no overflow.
- DevTools → emulate "Reduce motion" OR set `localStorage`/Guide toggle so `html[data-reduce-motion="on"]`: reload, confirm no entrance animation.
- **No console errors.**

- [ ] **Step 4: Commit**

```bash
git add docs/assets/style.css
git commit -m "feat: Sumi-e ink layout for #/dashboard (hero, needs-me, teasers, motion)"
```

---

## Task 5: Light chrome pass — ink nav underline + brand seal

A restrained, site-wide consistency pass on the shared topbar/nav. Must not break the other 8 routes.

**Files:**
- Modify: `docs/assets/style.css` (append)

- [ ] **Step 1: Append the chrome pass**

```css

/* ---- light ink consistency pass on shared chrome (all routes) ---- */
.route-nav a{ position: relative; }
.route-nav a::after{
  content: ""; position: absolute; left: .8rem; right: .8rem; bottom: .35rem; height: 2px;
  background: var(--shu); transform: scaleX(0); transform-origin: left;
  transition: transform .28s cubic-bezier(.77,0,.175,1);
}
@media (hover: hover) and (pointer: fine){ .route-nav a:hover::after{ transform: scaleX(1); } }
html[data-reduce-motion="on"] .route-nav a::after{ transition: none; }
```

Note: the existing `.route-nav a[aria-current="page"]` rule (red background for the active route) is intentionally left as-is — it already marks the current page; the underline is a hover affordance only, so the two do not conflict.

- [ ] **Step 2: Verify other routes are intact**

Serve, open `http://localhost:8000/?v=5#/calendar`, then click through `#/going`, `#/checklist`, `#/deadlines`, `#/explore`, `#/rooms`, `#/map`, `#/plan`. Each must render as before; the only visible change is a vermilion underline sliding under nav links on hover. The active link still shows its red background. **No console errors on any route.**

- [ ] **Step 3: Run the unit tests (routes-parity sanity)**

```bash
node --test tests/lib.test.mjs
```
Expected: 35 pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/style.css
git commit -m "feat: light ink chrome pass — vermilion nav underline on hover"
```

---

## Task 6: Cache-bust + final verification

**Files:**
- Modify: `docs/sw.js` (`CACHE` constant)

- [ ] **Step 1: Bump the service-worker cache version**

Find:
```js
const CACHE = 'jwh-v57';
```
Replace with:
```js
const CACHE = 'jwh-v58';
```
(No `ASSETS` change — no files were added or removed; only existing assets changed.)

- [ ] **Step 2: Full regression — unit tests + data validation**

From repo root:
```bash
node --test tests/lib.test.mjs
python3 -m json.tool docs/data/tips.json > /dev/null && echo "tips.json valid"
```
Expected: 35 pass, 0 fail; `tips.json valid`.

- [ ] **Step 3: Full browser pass (clear the SW first)**

In DevTools → Application: unregister the service worker + clear storage, then open `http://localhost:8000/?v=6#/dashboard`. Walk the acceptance checklist from the spec §10:
- One clear focal point: the countdown, correct live day count to 2026-06-30.
- Three "Needs me" cards with real data; three teasers each linking to their route.
- My Tokyo band re-skinned, still links to `#/explore`.
- All 9 routes navigate with no console errors.
- Mobile width reads cleanly; reduced-motion kills animation.

- [ ] **Step 4: Commit**

```bash
git add docs/sw.js
git commit -m "chore: bump SW cache to jwh-v58 for front-page redesign"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §2 composition (hero scroll + needs-me strip + my-tokyo + teasers) → Tasks 2 & 4. ✓
- §3 consolidation table (promote deadlines/going/progress; demote book-by/events/plan to teasers; fold intro; promote countdown to hero; topbar copy persists) → Tasks 2 & 3. ✓
- §4 tokens (reuse fonts/`--indigo`; add `--shu`; scope to `#view-dashboard`) → Tasks 1 & 4. ✓
- §5 dashboard.js refactor (hero countdown, trimmed renderers, renderTeasers, drop DnD, KEYS.widgetOrder left defined) → Task 3. ✓
- §6 motion (one orchestrated entrance, 50ms stagger, silent countdown, reduced-motion) → Task 4. ✓
- §7 a11y (hero is the `aria-live` region; topbar `aria-hidden`; real `<button>`/`<a>`; rail decorative) → Tasks 2 & 3. ✓
- §8 constraints (zero-build, `esc()` on the one dynamic teaser string, no KEYS shape change, SW bump) → Tasks 3 & 6. ✓
- §9 out-of-scope (drop home widget DnD; only light chrome elsewhere) → Tasks 3 & 5. ✓
- §10 success criteria → Task 6. ✓

**Placeholder scan:** none — every code step shows complete code; Task 4 Step 2 gives an explicit fallback for the two tokens most likely to be absent (`--s5`/`--s6`).

**Type/name consistency:** `#heroCount`/`.hc-num`/`.hc-unit` markup (Task 2) matches the JS that fills them (Task 3) and the CSS that styles them (Task 4). `#tBookBy`/`#tEvents`/`#tPlan` + `.teaser-body` markup (Task 2) match `teaser()`/`renderTeasers()` (Task 3) and CSS (Task 4). `fill(sel, list, max)` new third arg (Task 3 Step 6) matches the `fill('#wDeadlines', …, 3)` call (Task 3 Step 4). `--shu` defined in Task 1 is used in Tasks 4 & 5.
