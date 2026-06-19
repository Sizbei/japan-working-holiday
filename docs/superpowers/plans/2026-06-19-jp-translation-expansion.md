# Japanese Translation Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 日本語 toggle translate the app's static frame (brand, nav, all section/widget/tracker headings, and the 16 lede intros) into natural Japanese, with every string in one new module.

**Architecture:** A new static ES module `docs/assets/i18n.js` exports `STRINGS` (key→JP) and `GLOSSARY`, imported synchronously by `lang.js` (no fetch → no async race / flash / offline failure). `index.html` elements carry `data-i18n="<key>"`; `applyLang` swaps text (or `innerHTML` for the 2 ledes with inline markup, flagged `data-i18n-html`). A `node --test` drift test guards English↔Japanese key coverage.

**Tech Stack:** Vanilla ES modules, no build. Tests via `node --test` (zero deps). Spec: `specs/2026-06-19-jp-translation-expansion.md`.

**Branch:** `feat/jp-translation` (already created; the spec is committed there).

**Element categories (used throughout):**
- **Direct** — bare-text heading: add `data-i18n="<key>"` on the element; `textContent` swap.
- **Wrap** — heading/label containing an inline emoji span: wrap its translatable text in `<span data-i18n="<key>">…</span>` so the emoji span is untouched.
- **HTML** — the 2 ledes with links/live spans: add `data-i18n="<key>" data-i18n-html`; `innerHTML` swap.

---

## File Structure

- **Create** `docs/assets/i18n.js` — the only data file: `export const STRINGS`, `export const GLOSSARY`.
- **Create** `tests/i18n.test.mjs` — drift guard (pure, node --test).
- **Modify** `docs/assets/lang.js` — import the module; rewrite `applyLang` (HTML path, per-element `lang`, `data-jp` only on nav+brand); update header comment.
- **Modify** `docs/index.html` — ~54 `data-i18n` attrs (+2 `data-i18n-html`); migrate nav keys to `nav.*`.
- **Modify** `docs/assets/tracker.js` — `data-i18n` on its 2 `<h3>`.
- **Modify** `docs/sw.js` — bump `CACHE`, precache `assets/i18n.js`.
- **Modify** `CLAUDE.md` — reconcile the lang.js note.

`main.js` is **not** touched (the module is a static import inside lang.js).

---

## Task 1: Create the translation module

**Files:**
- Create: `docs/assets/i18n.js`

- [ ] **Step 1: Write the module**

Create `docs/assets/i18n.js` with exactly this content:

```js
'use strict';
// Single source of truth for all Japanese UI strings + the hover-dictionary glossary.
// Static module (imported synchronously by lang.js): no fetch, no async race, offline-safe.
// Scope: the static FRAME only — brand, nav, section/widget/tracker headings, lede intros.
// Researched CARD content (from tips.json) stays English by design. See
// specs/2026-06-19-jp-translation-expansion.md.

// key → 日本語. Keys: brand · nav.* · head.* · lede.*  (dotted, consistent).
export const STRINGS = {
  brand: '日本での一年',

  'nav.dashboard': 'ダッシュボード',
  'nav.calendar': 'カレンダー',
  'nav.going': '参加予定',
  'nav.checklist': 'チェックリスト',
  'nav.deadlines': '締め切り',
  'nav.explore': 'さがす',
  'nav.rooms': '部屋',
  'nav.map': '地図',
  'nav.plan': 'プラン',

  'head.dashboard.needs': '対応が必要なこと',
  'head.widget.deadlines': '次の締め切り',
  'head.widget.going': '参加予定',
  'head.widget.checklist': 'チェックリスト',
  'head.dashboard.more': 'その他',
  'head.teaser.bookby': '予約期限',
  'head.teaser.upcoming': '近日予定',
  'head.teaser.dayplan': '一日プラン',
  'head.calendar': '私のカレンダー',
  'head.going': '参加予定',
  'head.tracker': '抽選・先行販売',
  'head.timesensitive': '要・期限管理 — 2026年6月30日の到着を基準に',
  'head.topmoves': '最優先アクション',
  'head.checklist': '一年間のチェックリスト',
  'head.brew': 'アイデア出し',
  'head.activities': '四季の楽しみ',
  'head.restaurants': '行きたい店',
  'head.disney': '東京ディズニーランド & ディズニーシー',
  'head.building': '東京から創る',
  'head.music': '音楽・機材・シンセ',
  'head.geek': 'ゲーム・アニメ・テック',
  'head.meetups': '集まり・イベント',
  'head.livemusic': 'ライブ & ナイトライフ',
  'head.canada': 'カナダ向けメモ',
  'head.sources': '参考情報',
  'head.rooms': '部屋探し',
  'head.map': '東京マップ',
  'head.plan': '一日プラン',
  // JS-rendered (tracker.js) — not present as static data-i18n in index.html:
  'head.tracker.fixed': '定時リリースのルール',
  'head.tracker.dated': '日付指定の予約枠',

  'lede.calendar': '調べたイベントを色分けして登録済み。日付をタップすれば自分の予定を追加できます。編集・削除・.ics の読み込み、必要なタグだけの書き出しもできます。',
  'lede.going': '参加を決めたイベント。<a href="#/calendar">カレンダー</a>でイベントを開き、<b>✓ 参加</b>を押すとここに追加されます。<span id="goingCount"></span>',
  'lede.tracker': '数分の差で勝負が決まる予約。毎月10日10:00（日本時間）のジブリ、ディズニーの60日ローリング枠、相撲の発売日など。分単位でアラームを。逃したら終わりです。',
  'lede.checklist': '一年を通して段階分け。前提が終わると次のステップが解除されます。📅 で期限を設定（通知に反映）。進捗はこの端末に保存されます。',
  'lede.brew': '思いつくままに — アイデア、調べたいこと、聞いた場所。この端末に自動保存され、ブラウザの外には出ません。',
  'lede.activities': '花見、花火、紅葉、イルミネーション、祭り、そして行ってみたい日帰り旅行。',
  'lede.restaurants': '¥400 のチェーン丼から、予約してでも行きたい贅沢まで。予算で絞り込めます。',
  'lede.disney': '両パークの外せない定番、プレミアアクセス／スタンバイの仕組み、ファンタジースプリングス、そして予算を溶かさずに楽しむコツ。',
  'lede.building': 'バンクーバーより16時間先でリリース。集中したい時は広尾の図書館、スタートアップに繋がるなら CIC Tokyo、合間はワークカフェ。自分のスタンドアップが、誰かの真夜中。',
  'lede.music': '巡礼リスト：御茶ノ水のギターストリート、ヴィンテージポリの Five G、シンセ／機材店、掘るならディスクユニオン、足を運ぶ価値のあるリスニングバー。平日に行くのがおすすめ — いい店ほど小さいから。',
  'lede.geek': '拠点は秋葉原。カセットならスーパーポテト、クレーンゲームは GiGO、ディープな掘り出しは中野ブロードウェイ。午後まるごと確保して、現金を忘れずに。',
  'lede.meetups': '自分の仲間たち。デモナイトは Tokyo Indies や AI Tinkerers、それ以外は Connpass／Doorkeeper、そして大型イベント — コミケ、TGS、AnimeJapan — があれば。粗くてもいいから作ったものを持って行こう。',
  'lede.livemusic': 'ナイトライフの地図 — テクノ／ハウスのクラブ、ライブハウス、ジャズ＆リスニングバー、レコードフェア、シンセの集まり、遠征する価値のあるフェス。多くは定期開催 — その日は RA か会場で確認を。',
  'lede.rooms': '外国人歓迎のシェアハウス＆アパート — 礼金なし、保証人なし、海外から予約可。あくまで出発点です（公開 API を持つ事業者はありません）。最新の空室はリンクから。<span id="roomCount" class="room-count" role="status" aria-live="polite"></span>',
  'lede.map': 'ここにある全スポットをエリア別にまとめています — タップで Google マップが開きます（スマホではマップアプリが起動）。下の地図は位置把握用の都心エリアです。',
  'lede.plan': '一日ずつ組み立て — 保存したピン、カタログ、イベントから立ち寄り先を追加。ドラッグで並べ替え、各区間のおおよその移動時間も表示。決まったらカレンダーに書き出せます。',
};

// JP term → reading + gloss for the hover dictionary (covers the .jp accents + nav + brand;
// Jotoba enriches anything else at hover time). Readings normalized to かな · romaji.
export const GLOSSARY = {
  '日本での一年': { r: 'にほんでのいちねん · nihon de no ichinen', m: 'a year in Japan' },
  'ワーキングホリデー': { r: 'wākingu horidē', m: 'working holiday' },
  'ダッシュボード': { r: 'dasshubōdo', m: 'dashboard' },
  'カレンダー': { r: 'karendā', m: 'calendar' },
  'チェックリスト': { r: 'chekkurisuto', m: 'checklist' },
  '締め切り': { r: 'しめきり · shimekiri', m: 'deadline' },
  'さがす': { r: 'sagasu', m: 'to search / look for' },
  '部屋': { r: 'へや · heya', m: 'room' },
  '参加予定': { r: 'さんかよてい · sanka yotei', m: 'planned attendance — events you’re going to' },
  '地図': { r: 'ちず · chizu', m: 'map' },
  'プラン': { r: 'puran', m: 'plan (itinerary)' },
  '一日': { r: 'いちにち · ichinichi', m: 'one day' },
  '一年の計画': { r: 'いちねんのけいかく · ichinen no keikaku', m: 'a year’s plan' },
  '夜の音楽': { r: 'よるのおんがく · yoru no ongaku', m: 'night music / nightlife' },
  '音楽の街': { r: 'おんがくのまち · ongaku no machi', m: 'music town' },
  '部屋探し': { r: 'へやさがし · heya-sagashi', m: 'room hunting' },
  '東京で創る': { r: 'とうきょうでつくる · Tōkyō de tsukuru', m: 'building in Tokyo' },
  '考える場所': { r: 'かんがえるばしょ · kangaeru basho', m: 'a place to think' },
  '四季の楽しみ': { r: 'しきのたのしみ · shiki no tanoshimi', m: 'enjoying the four seasons' },
  '抽選・先行販売': { r: 'ちゅうせん・せんこうはんばい · chūsen · senkō hanbai', m: 'lottery / advance sale' },
  '東京ディズニー': { r: 'とうきょうディズニー · Tōkyō Dizunī', m: 'Tokyo Disney' },
  '集まり・イベント': { r: 'あつまり・イベント · atsumari · ibento', m: 'meetups & events' },
  'ゲーム・アニメ・技術': { r: 'ゲーム・アニメ・ぎじゅつ · gēmu · anime · gijutsu', m: 'games · anime · tech' },
  '食べ歩き': { r: 'たべあるき · tabe-aruki', m: 'food-walking (eating around)' },
};
```

- [ ] **Step 2: Validate it parses**

Run: `node -e "import('./docs/assets/i18n.js').then(m => console.log(Object.keys(m.STRINGS).length, 'strings,', Object.keys(m.GLOSSARY).length, 'glossary'))"`
Expected: prints `56 strings, 24 glossary` (56 = 1 brand + 9 nav + 30 head [incl. 2 tracker JS keys] + 16 lede). Of these, 54 appear as static `data-i18n` in index.html; the 2 `head.tracker.*` are JS-rendered.

- [ ] **Step 3: Commit**

```bash
git add docs/assets/i18n.js
git commit -m "feat: i18n.js — central STRINGS + GLOSSARY module for JP frame translation"
```

---

## Task 2: Drift-guard test (RED)

**Files:**
- Create: `tests/i18n.test.mjs`

- [ ] **Step 1: Write the test**

Create `tests/i18n.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../docs/assets/i18n.js';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
// match the data-i18n="..." attribute only (NOT data-i18n-html, which is a bare boolean attr)
const htmlKeys = [...html.matchAll(/\sdata-i18n="([^"]+)"/g)].map(m => m[1]);

// keys rendered by JS (not present as static data-i18n in index.html)
const JS_KEYS = ['head.tracker.fixed', 'head.tracker.dated'];

test('every data-i18n key in index.html has a Japanese string', () => {
  for (const k of htmlKeys) {
    assert.ok(STRINGS[k] !== undefined, `index.html uses data-i18n="${k}" but STRINGS has no such key`);
  }
});

test('every STRINGS key is used in index.html or by known JS', () => {
  const used = new Set([...htmlKeys, ...JS_KEYS]);
  for (const k of Object.keys(STRINGS)) {
    assert.ok(used.has(k), `STRINGS["${k}"] is orphaned — no element uses it`);
  }
});

test('expected number of tagged elements present', () => {
  assert.ok(htmlKeys.length >= 45, `expected ~52 data-i18n elements in index.html, found ${htmlKeys.length}`);
});
```

- [ ] **Step 2: Run it — expect RED**

Run: `node --test tests/i18n.test.mjs`
Expected: FAIL. `index.html` still has the OLD bare nav keys (`dashboard`, `calendar`, …) which are not in `STRINGS` (it has `nav.dashboard`), and almost no elements are tagged yet, so both the first test (`brand` is fine but `dashboard` missing) and the count test fail.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/i18n.test.mjs
git commit -m "test: i18n key-coverage drift guard (red until index.html is tagged)"
```

---

## Task 3: Tag index.html (GREEN)

**Files:**
- Modify: `docs/index.html`

Work top-to-bottom. After each group, you can re-run the drift test; it goes green only when the whole file is tagged and nav keys migrated.

- [ ] **Step 1: Migrate the 9 nav keys (lines 48–56)**

For each nav link, change the bare key to the `nav.*` key. Example (line 48):

```html
<!-- before --> <a href="#/dashboard" data-route="dashboard" data-i18n="dashboard">Dashboard</a>
<!-- after  --> <a href="#/dashboard" data-route="dashboard" data-i18n="nav.dashboard">Dashboard</a>
```

Apply the same rename to all 9: `dashboard→nav.dashboard`, `calendar→nav.calendar`, `going→nav.going`, `checklist→nav.checklist`, `deadlines→nav.deadlines`, `explore→nav.explore`, `rooms→nav.rooms`, `map→nav.map`, `plan→nav.plan`. (The brand on line 32 already has `data-i18n="brand"` — leave it.)

- [ ] **Step 2: Tag the bare-text headings (Direct — add `data-i18n` on the element)**

These `<h2>` are bare text (pillar-head sections + 2 sr-only). Add `data-i18n="<key>"`:

| line | element text | key |
|---|---|---|
| 80 | What needs me (sr-only h2) | `head.dashboard.needs` |
| 88 | More (sr-only h2) | `head.dashboard.more` |
| 99 | My Calendar | `head.calendar` |
| 135 | Going To | `head.going` |
| 145 | Lottery & Timed-Release Drops | `head.tracker` |
| 172 | My Yearlong Checklist | `head.checklist` |
| 200 | Brainstorm & Brew | `head.brew` |
| 247 | Things I'll Do — Season by Season | `head.activities` |
| 253 | Restaurants to Try | `head.restaurants` |
| 265 | Tokyo Disneyland & DisneySea | `head.disney` |
| 271 | Building From Tokyo | `head.building` |
| 277 | Music, Gear & Synths | `head.music` |
| 283 | Games, Anime & Tech Culture | `head.geek` |
| 289 | Meetups & Conventions | `head.meetups` |
| 296 | Live Music & Nightlife | `head.livemusic` |
| 315 | Find a Room | `head.rooms` |
| 350 | My Tokyo Map | `head.map` |
| 379 | Plan a Day | `head.plan` |

Example (line 99):
```html
<!-- before --> <div class="pillar-head"><span class="jp" lang="ja" aria-hidden="true">カレンダー</span><h2>My Calendar</h2></div>
<!-- after  --> <div class="pillar-head"><span class="jp" lang="ja" aria-hidden="true">カレンダー</span><h2 data-i18n="head.calendar">My Calendar</h2></div>
```

- [ ] **Step 3: Tag the emoji-prefixed headings (Wrap — wrap the text in a `<span data-i18n>`)**

These contain an inline emoji span; wrap ONLY the trailing text so the emoji is untouched.

4 section `<h2>` with `<span class="emoji">`:
```html
<!-- L152 before --> <h2><span class="emoji" aria-hidden="true">⏰</span> Time-Sensitive — anchored to June 30, 2026 arrival</h2>
<!-- L152 after  --> <h2><span class="emoji" aria-hidden="true">⏰</span> <span data-i18n="head.timesensitive">Time-Sensitive — anchored to June 30, 2026 arrival</span></h2>
```
- L163 `🏆 Highest-Value Moves` → wrap text with `data-i18n="head.topmoves"`
- L303 `🇨🇦 Canada-Specific Notes` → `data-i18n="head.canada"`
- L309 `📚 Sources` → `data-i18n="head.sources"`

3 widget `<h3 class="widget-h">` (lines 81–83):
```html
<!-- L81 before --> <h3 class="widget-h"><span aria-hidden="true">⚖️</span> Next deadlines</h3>
<!-- L81 after  --> <h3 class="widget-h"><span aria-hidden="true">⚖️</span> <span data-i18n="head.widget.deadlines">Next deadlines</span></h3>
```
- L82 `🎫 Going to` → `data-i18n="head.widget.going"`
- L83 `✅ Checklist` → `data-i18n="head.widget.checklist"`

3 teaser `<span class="teaser-h">` (lines 89–91):
```html
<!-- L89 before --> <span class="teaser-h"><span aria-hidden="true">🎟️</span> Book-by</span>
<!-- L89 after  --> <span class="teaser-h"><span aria-hidden="true">🎟️</span> <span data-i18n="head.teaser.bookby">Book-by</span></span>
```
- L90 `📅 Upcoming` → `data-i18n="head.teaser.upcoming"`
- L91 `🗺️ Day plan` → `data-i18n="head.teaser.dayplan"`

- [ ] **Step 4: Tag the 14 plain-text ledes (Direct — add `data-i18n` on the `<p>`)**

| line | key |
|---|---|
| 100 | `lede.calendar` |
| 146 | `lede.tracker` |
| 173 | `lede.checklist` |
| 201 | `lede.brew` |
| 248 | `lede.activities` |
| 254 | `lede.restaurants` |
| 266 | `lede.disney` |
| 272 | `lede.building` |
| 278 | `lede.music` |
| 284 | `lede.geek` |
| 290 | `lede.meetups` |
| 297 | `lede.livemusic` |
| 351 | `lede.map` |
| 380 | `lede.plan` |

Example (line 100):
```html
<!-- before --> <p class="lede">Researched events are baked in (colour-coded by type); …</p>
<!-- after  --> <p class="lede" data-i18n="lede.calendar">Researched events are baked in (colour-coded by type); …</p>
```

- [ ] **Step 5: Tag the 2 HTML ledes (HTML — `data-i18n` + `data-i18n-html`)**

Line 136 (going):
```html
<!-- before --> <p class="lede">Events you've locked in. Open any event on the <a href="#/calendar">Calendar</a> and tap <b>✓ Going</b> to add it here. <span id="goingCount"></span></p>
<!-- after  --> <p class="lede" data-i18n="lede.going" data-i18n-html>Events you've locked in. Open any event on the <a href="#/calendar">Calendar</a> and tap <b>✓ Going</b> to add it here. <span id="goingCount"></span></p>
```

Line 316 (rooms) — add `data-i18n="lede.rooms" data-i18n-html` to the opening `<p class="lede">` tag (leave the body, including the `<span id="roomCount" …>`, untouched).

- [ ] **Step 6: Run the drift test — expect GREEN**

Run: `node --test tests/i18n.test.mjs`
Expected: PASS (3/3). If "orphaned key" fails, an element wasn't tagged (or was tagged with the wrong key); if "no such key" fails, a `data-i18n` value has a typo.

- [ ] **Step 7: Commit**

```bash
git add docs/index.html
git commit -m "feat: tag brand/nav/headings/ledes with data-i18n keys (drift test green)"
```

---

## Task 4: Rewrite lang.js to use the module

**Files:**
- Modify: `docs/assets/lang.js`

- [ ] **Step 1: Replace the header comment + imports + remove the inline maps (lines 1–37)**

Replace everything from the top of the file through the end of the `GLOSSARY` const (the block ending `};` near line 37) with:

```js
'use strict';
// Japanese option + hover-dictionary. Two aids for a Japanese learner:
//  1) An EN / 日本語 toggle that translates the static UI FRAME — brand, nav, section/widget
//     headings, and the lede intros — from STRINGS (docs/assets/i18n.js). Researched CARD
//     content (from tips.json) stays English by design.
//  2) Hover/focus any Japanese word (the .jp accents, or the translated nav in JP mode) to see
//     its reading + meaning: bundled GLOSSARY (instant, offline) → Jotoba API → Jisho deep-link.
//     Contained like Leaflet/Nominatim: hover-only, time-boxed, never blocks, fails safe.

import { $, $$, esc } from './lib/dom.js';
import { getRaw, setRaw, KEYS } from './lib/store.js';
import { STRINGS, GLOSSARY } from './i18n.js';

const LANG_KEY = KEYS.lang;
```

(The old `const I18N = {…}` and `const GLOSSARY = {…}` blocks are deleted — `GLOSSARY` now comes from the import and is still used unchanged at the `const g = GLOSSARY[word]` line.)

- [ ] **Step 2: Replace `applyLang`**

Replace the whole `applyLang` function with:

```js
function applyLang(lang) {
  setRaw(LANG_KEY, lang);
  const ja = lang === 'ja';
  const btn = $('#langToggle');
  if (btn) { btn.textContent = ja ? 'A' : 'あ'; btn.setAttribute('aria-pressed', ja ? 'true' : 'false'); btn.title = ja ? 'Switch to English' : '日本語に切り替え'; }
  let swappedHtml = false;
  $$('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const isHtml = el.hasAttribute('data-i18n-html');
    if (el.dataset.en == null) el.dataset.en = isHtml ? el.innerHTML : el.textContent;   // remember English once
    const dict = el.matches('[data-route]') || key === 'brand';                          // only nav + brand feed the hover dictionary
    if (ja && STRINGS[key]) {
      if (isHtml) { el.innerHTML = STRINGS[key]; swappedHtml = true; } else { el.textContent = STRINGS[key]; }
      el.lang = 'ja';
      if (dict) el.setAttribute('data-jp', '1'); else el.removeAttribute('data-jp');
    } else {
      if (isHtml) el.innerHTML = el.dataset.en; else el.textContent = el.dataset.en;
      el.lang = 'en';
      el.removeAttribute('data-jp');
    }
  });
  // ledes swapped via innerHTML re-create empty #goingCount/#roomCount; nudge their owners to repaint.
  // Safe: applyLang is never invoked from a jwh:data-changed handler, so this cannot loop.
  if (swappedHtml) document.dispatchEvent(new CustomEvent('jwh:data-changed'));
}
```

Note what changed vs. the old version: `STRINGS` instead of `I18N`; `data-i18n-html` → `innerHTML` path; per-element `el.lang` instead of `document.documentElement.lang`; `data-jp` restricted to nav+brand; the count-repaint dispatch. `mountLang`, `injectToggle`, `wireDictionary`, and the dictionary code are unchanged.

- [ ] **Step 3: Confirm no leftover references**

Run: `grep -n "I18N\|documentElement.lang" docs/assets/lang.js`
Expected: no output (both are gone).

- [ ] **Step 4: Lint-parse the module**

Run: `node --check docs/assets/lang.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add docs/assets/lang.js
git commit -m "feat: lang.js translates the static frame from i18n.js (innerHTML ledes, per-el lang)"
```

---

## Task 5: Tracker sub-headings

**Files:**
- Modify: `docs/assets/tracker.js:43-44`

- [ ] **Step 1: Add `data-i18n` to the 2 `<h3>`**

```js
// before
    <div class="trk-group"><h3 class="trk-h">Fixed timed-release rules</h3><div class="trk-grid">${recurring}</div></div>
    ${dated.length ? `<div class="trk-group"><h3 class="trk-h">Dated booking windows</h3><div class="trk-grid">${datedHTML}</div></div>` : ''}`;
// after
    <div class="trk-group"><h3 class="trk-h" data-i18n="head.tracker.fixed">Fixed timed-release rules</h3><div class="trk-grid">${recurring}</div></div>
    ${dated.length ? `<div class="trk-group"><h3 class="trk-h" data-i18n="head.tracker.dated">Dated booking windows</h3><div class="trk-grid">${datedHTML}</div></div>` : ''}`;
```

(No `applyCurrentLang` call needed — `mountTracker` runs at `main.js:48`, before `mountLang` at `:55`, so these `<h3>` are in the DOM when the one-time `applyLang` runs.)

- [ ] **Step 2: Parse-check**

Run: `node --check docs/assets/tracker.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/assets/tracker.js
git commit -m "feat: translate the 2 tracker sub-headings in JP mode"
```

---

## Task 6: Service worker + doc reconciliation

**Files:**
- Modify: `docs/sw.js:5-13`
- Modify: `CLAUDE.md` (the `lang.js` bullet)

- [ ] **Step 1: Bump CACHE and precache the new module**

In `docs/sw.js`: change `const CACHE = 'jwh-v63';` to `const CACHE = 'jwh-v64';`. In the `ASSETS` array, add `'assets/i18n.js'` next to `'assets/lang.js'`:

```js
… 'assets/eventsearch.js', 'assets/lang.js', 'assets/i18n.js', 'assets/backup.js', …
```

- [ ] **Step 2: Reconcile the CLAUDE.md note**

In `CLAUDE.md`, find the `lang.js` bullet (currently `lang.js` (あ JP-chrome toggle + hover dictionary)) and replace it with:

```
- `lang.js` (あ EN/日本語 toggle: translates the static **frame** — brand, nav, section/widget/tracker headings, lede intros — from `assets/i18n.js`; researched **card** content stays English. Plus the hover dictionary: GLOSSARY → Jotoba → Jisho).
```

- [ ] **Step 3: Validate sw.js parses**

Run: `node --check docs/sw.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/sw.js CLAUDE.md
git commit -m "chore: precache i18n.js (sw jwh-v64); reconcile lang.js doc note"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `node --test tests/lib.test.mjs tests/i18n.test.mjs`
Expected: all green (existing lib tests unaffected; i18n drift test passes).

- [ ] **Step 2: Serve and browser-verify**

```bash
cd docs && python3 -m http.server 8000
```
In a browser at `http://localhost:8000/?v=1` (set `localStorage['jwh-auth-v1']='ok'` to skip the gate), verify:
- Toggle あ → 日本語. Brand, all 9 nav items, and every section heading flip to Japanese. Toggle back → English restored exactly (links/counts intact).
- Visit **#/deadlines**: the 2 sub-headings (定時リリースのルール / 日付指定の予約枠) are Japanese.
- Visit **#/going** in JP mode: the lede shows 参加を決めたイベント… with a working カレンダー link; mark an event ✓ Going on the Calendar and confirm `#goingCount` still updates.
- Visit **#/rooms** in JP mode: lede is Japanese; change a filter and confirm the `#roomCount` summary still updates.
- Dashboard widget/teaser headings (次の締め切り / 予約期限 …) keep their emoji and read Japanese.
- Hover a `.jp` accent and a translated nav item → dictionary popover appears with reading+meaning. Hover a translated **lede paragraph** → NO popover (ledes are not dictionary targets).
- Reload in JP mode: no flash of English, no console errors.
- Screen-reader/devtools spot check: `document.documentElement.lang` stays `en`; a swapped heading has `lang="ja"`.

- [ ] **Step 3: Confirm 0 console errors across routes**

Click through all 8 routes in both languages; the console stays clean.

---

## Self-Review notes (done by plan author)

- **Spec coverage:** §3.1 i18n.js → T1; §8 drift test → T2; §3.2/§4/§5/§6/§7 markup → T3; §3.2 mechanism + a11y + dictionary scoping → T4; §3.3 tracker → T5; §10 SW + §9 docs → T6; §12 verification → T7. All sections mapped.
- **Type/name consistency:** keys in `STRINGS` (T1) exactly match the `data-i18n` values used in T3/T5 and the `JS_KEYS` allow-list in T2 (`head.tracker.fixed`/`head.tracker.dated`). `data-i18n-html` is a bare boolean attribute everywhere (T3 §Step 5, T4 `hasAttribute`).
- **No placeholders:** every code/markup step shows the literal before/after.
