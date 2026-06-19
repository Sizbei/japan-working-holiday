# Japanese Translation Expansion — Design Spec

**Date:** 2026-06-19
**Status:** design contract (awaiting user review → implementation plan)
**Supersedes intent of:** the "language-practice layer over the navigation, not a full translation" note in `docs/assets/lang.js` (that note is reconciled by this spec — see §9).

## 1. Goal

Toggling 日本語 (the あ button) translates the app's **static UI frame** into natural Japanese: the brand, the nav (already done), every static section `<h2>` heading, the small dashboard widget/teaser headings, the 2 JS-rendered tracker sub-headings, and all 16 lede intro paragraphs. The **researched content cards** (pillar cards, calendar events, room listings, domain findings, dashboard tips — everything sourced from `tips.json`) and **all interactive controls** (buttons, filters, form labels, placeholders) stay English.

All Japanese strings live in **one file**, out of `lang.js`.

## 2. Non-goals (explicitly out of scope)

- Translating content cards / `tips.json`-sourced text.
- Translating control labels (buttons, filters, placeholders, form fields, modal bodies, toasts). Per user direction "don't worry about the controls."
- `map.js` sidebar headers (`Your pins`, `All places by area`) — these are widget/control labels, not section headings → English.
- A full furigana rendering system. The hover dictionary stays as-is (glossary + Jotoba fallback).

## 3. Architecture

### 3.1 Translation lives in a static ES module — `docs/assets/i18n.js`

```js
// docs/assets/i18n.js — single source of truth for all Japanese UI strings + the
// hover-dictionary glossary. Static module (imported synchronously by lang.js): no fetch,
// no async race, offline-safe, precached like any other asset.
export const STRINGS = {
  // key: japanese
};
export const GLOSSARY = {
  // 'japanese term': { r: 'かな · romaji', m: 'english meaning' }
};
```

**Why a JS module, not `data/i18n.json` + fetch:** a static `import` is synchronous and offline-safe. It removes an entire class of bugs the adversarial review surfaced — async boot ordering, flash-of-English on slow networks, and cold-start/offline glossary failure — none of which can occur when the strings are resolved at module-load time. It still satisfies "one file that holds all the translations." (The file is small, static, UI-coupled strings — a module is the right boundary; `tips.json` stays JSON because it is large research data.)

### 3.2 `lang.js` changes

- `import { STRINGS, GLOSSARY } from './i18n.js';` — replaces the inline `I18N`/`GLOSSARY` consts.
- `applyLang(lang)` swaps every `[data-i18n]` element:
  - **Plain elements** (headings, widget headings, 14 text-only ledes): store English in `data-en` from `textContent`, swap `textContent`. (Existing pattern — safe, no `esc` needed.)
  - **HTML elements** (the 2 ledes marked `data-i18n-html`, see §5): store English in `data-en` from **`innerHTML`**, swap **`innerHTML`** with the JP string (which re-includes the same inline markup). After the swap completes, re-dispatch `jwh:data-changed` once so `#goingCount`/`#roomCount` repaint.
  - Set `el.lang = (lang === 'ja') ? 'ja' : 'en'` **per element** (a11y, see §7). Do **not** set `data-jp` on headings/ledes (see §6).
- **Missing-key contract (fail-safe):** if a `data-i18n` key is absent from `STRINGS`, the element keeps English (the existing `else` branch restores `data-en`). The drift test (§8) prevents accidental gaps.
- Stop flipping `document.documentElement.lang` to `ja` (see §7).

### 3.3 Re-apply hook for JS-rendered tracker headings

`lang.js` exports `applyCurrentLang()` (applies the persisted language to all current `[data-i18n]` in the DOM). `tracker.js` calls it at the end of its render, after injecting its `innerHTML` (the 2 `<h3>` carry `data-i18n`). This is the only render site touched.

## 4. Key naming scheme

Normalize to a consistent dotted scheme. The ~10 existing bare nav keys (`dashboard`, `calendar`, …) migrate to `nav.*`; update their `data-i18n` attributes in `index.html` to match.

- `brand`
- `nav.<route>` — dashboard, calendar, going, checklist, deadlines, explore, rooms, map, plan
- `head.<id>` — section + widget/teaser + tracker sub-headings
- `lede.<id>` — the 16 lede paragraphs

## 5. The 2 HTML ledes (verified — only these two)

| Line | id | Inline markup to preserve |
|---|---|---|
| 136 | `going` | `<a href="#/calendar">`, `<b>✓ Going</b>`, `<span id="goingCount">` |
| 316 | `rooms` | `<span id="roomCount" class="room-count" role="status" aria-live="polite">` |

These get `data-i18n="lede.going"` **+ `data-i18n-html`** (likewise `lede.rooms`). Their JP `STRINGS` values include the same tags/ids verbatim. Both `#goingCount` (`going-page.js:48`) and `#roomCount` (`rooms.js:194`) are re-queried by id at update time (verified — not cached refs), so they survive the `innerHTML` swap and refill on the re-dispatched `jwh:data-changed`.

## 6. Hover-dictionary interaction

Do **not** stamp `data-jp` on translated headings/ledes. A whole-paragraph hover target produces a useless "no match" lookup. The dictionary stays scoped to the short `.jp` accent labels and the nav chrome (unchanged behaviour). `applyCurrentLang()` therefore sets `lang="ja"` on swapped elements but leaves `data-jp` alone.

## 7. Accessibility

The document root stays `lang="en"` (the content cards are English; flipping the root to `ja` mis-announces them). Each swapped element gets `lang="ja"` when showing Japanese, restored to `en` (or attribute removed) in English mode. The `.jp` accents already carry `lang="ja"`.

## 8. Drift guard — new pure test

`tests/i18n.test.mjs` (run by `node --test`, zero deps):
1. `import { STRINGS } from '../docs/assets/i18n.js'`.
2. Read `docs/index.html` as text; extract every `data-i18n="<key>"`.
3. Assert every HTML key exists in `STRINGS` (no untranslated tagged element).
4. Assert every `STRINGS` key whose prefix is `nav.`/`head.`/`lede.`/`brand` is referenced by some `data-i18n` in the HTML **or** is one of the known JS-rendered keys (the 2 tracker headings) — a small allow-list constant in the test. (Catches dead/renamed keys.)

This is the testable unit; it fails loudly when someone edits an English heading/lede and forgets the Japanese.

## 9. Doc reconciliation

- Rewrite the `docs/assets/lang.js` header comment: it now translates the static frame (nav + headings + lede intros), while researched **card** content stays English.
- Update the matching note in `CLAUDE.md` (the `lang.js` bullet) to the same effect.

## 10. Service worker

Bump `CACHE` in `docs/sw.js`; add `'assets/i18n.js'` to the `ASSETS` precache list.

## 11. The translations (for review)

Proper nouns kept as-is. Review and adjust any wording before implementation.

### Brand + nav
| key | English | 日本語 |
|---|---|---|
| `brand` | My Year in Japan | 日本での一年 |
| `nav.dashboard` | Dashboard | ダッシュボード |
| `nav.calendar` | Calendar | カレンダー |
| `nav.going` | Going | 参加予定 |
| `nav.checklist` | Checklist | チェックリスト |
| `nav.deadlines` | Deadlines | 締め切り |
| `nav.explore` | Explore | さがす |
| `nav.rooms` | Rooms | 部屋 |
| `nav.map` | Map | 地図 |
| `nav.plan` | Plan a Day | プラン |

### Section + widget + tracker headings
| key | English | 日本語 |
|---|---|---|
| `head.dashboard.needs` | What needs me | 対応が必要なこと |
| `head.widget.deadlines` | Next deadlines | 次の締め切り |
| `head.widget.going` | Going to | 参加予定 |
| `head.widget.checklist` | Checklist | チェックリスト |
| `head.dashboard.more` | More | その他 |
| `head.teaser.bookby` | Book-by | 予約期限 |
| `head.teaser.upcoming` | Upcoming | 近日予定 |
| `head.teaser.dayplan` | Day plan | 一日プラン |
| `head.calendar` | My Calendar | 私のカレンダー |
| `head.going` | Going To | 参加予定 |
| `head.tracker` | Lottery & Timed-Release Drops | 抽選・先行販売 |
| `head.timesensitive` | Time-Sensitive — anchored to June 30, 2026 arrival | 要・期限管理 — 2026年6月30日の到着を基準に |
| `head.topmoves` | Highest-Value Moves | 最優先アクション |
| `head.checklist` | My Yearlong Checklist | 一年間のチェックリスト |
| `head.brew` | Brainstorm & Brew | アイデア出し |
| `head.activities` | Things I'll Do — Season by Season | 四季の楽しみ |
| `head.restaurants` | Restaurants to Try | 行きたい店 |
| `head.disney` | Tokyo Disneyland & DisneySea | 東京ディズニーランド & ディズニーシー |
| `head.building` | Building From Tokyo | 東京から創る |
| `head.music` | Music, Gear & Synths | 音楽・機材・シンセ |
| `head.geek` | Games, Anime & Tech Culture | ゲーム・アニメ・テック |
| `head.meetups` | Meetups & Conventions | 集まり・イベント |
| `head.livemusic` | Live Music & Nightlife | ライブ & ナイトライフ |
| `head.canada` | Canada-Specific Notes | カナダ向けメモ |
| `head.sources` | Sources | 参考情報 |
| `head.rooms` | Find a Room | 部屋探し |
| `head.map` | My Tokyo Map | 東京マップ |
| `head.plan` | Plan a Day | 一日プラン |
| `head.tracker.fixed` | Fixed timed-release rules *(JS, tracker.js)* | 定時リリースのルール |
| `head.tracker.dated` | Dated booking windows *(JS, tracker.js)* | 日付指定の予約枠 |

### Ledes
| key | 日本語 |
|---|---|
| `lede.calendar` | 調べたイベントを色分けして登録済み。日付をタップすれば自分の予定を追加できます。編集・削除・.ics の読み込み、必要なタグだけの書き出しもできます。 |
| `lede.going` *(HTML)* | 参加を決めたイベント。\<a href="#/calendar">カレンダー\</a> でイベントを開き、\<b>✓ 参加\</b> を押すとここに追加されます。\<span id="goingCount">\</span> |
| `lede.tracker` | 数分の差で勝負が決まる予約。毎月10日10:00（日本時間）のジブリ、ディズニーの60日ローリング枠、相撲の発売日など。分単位でアラームを。逃したら終わりです。 |
| `lede.checklist` | 一年を通して段階分け。前提が終わると次のステップが解除されます。📅 で期限を設定（通知に反映）。進捗はこの端末に保存されます。 |
| `lede.brew` | 思いつくままに — アイデア、調べたいこと、聞いた場所。この端末に自動保存され、ブラウザの外には出ません。 |
| `lede.activities` | 花見、花火、紅葉、イルミネーション、祭り、そして行ってみたい日帰り旅行。 |
| `lede.restaurants` | ¥400 のチェーン丼から、予約してでも行きたい贅沢まで。予算で絞り込めます。 |
| `lede.disney` | 両パークの外せない定番、プレミアアクセス／スタンバイの仕組み、ファンタジースプリングス、そして予算を溶かさずに楽しむコツ。 |
| `lede.building` | バンクーバーより16時間先でリリース。集中したい時は広尾の図書館、スタートアップに繋がるなら CIC Tokyo、合間はワークカフェ。自分のスタンドアップが、誰かの真夜中。 |
| `lede.music` | 巡礼リスト：御茶ノ水のギターストリート、ヴィンテージポリの Five G、シンセ／機材店、掘るならディスクユニオン、足を運ぶ価値のあるリスニングバー。平日に行くのがおすすめ — いい店ほど小さいから。 |
| `lede.geek` | 拠点は秋葉原。カセットならスーパーポテト、クレーンゲームは GiGO、ディープな掘り出しは中野ブロードウェイ。午後まるごと確保して、現金を忘れずに。 |
| `lede.meetups` | 自分の仲間たち。デモナイトは Tokyo Indies や AI Tinkerers、それ以外は Connpass／Doorkeeper、そして大型イベント — コミケ、TGS、AnimeJapan — があれば。粗くてもいいから作ったものを持って行こう。 |
| `lede.livemusic` | ナイトライフの地図 — テクノ／ハウスのクラブ、ライブハウス、ジャズ＆リスニングバー、レコードフェア、シンセの集まり、遠征する価値のあるフェス。多くは定期開催 — その日は RA か会場で確認を。 |
| `lede.rooms` *(HTML)* | 外国人歓迎のシェアハウス＆アパート — 礼金なし、保証人なし、海外から予約可。あくまで出発点です（公開 API を持つ事業者はありません）。最新の空室はリンクから。\<span id="roomCount" class="room-count" role="status" aria-live="polite">\</span> |
| `lede.map` | ここにある全スポットをエリア別にまとめています — タップで Google マップが開きます（スマホではマップアプリが起動）。下の地図は位置把握用の都心エリアです。 |
| `lede.plan` | 一日ずつ組み立て — 保存したピン、カタログ、イベントから立ち寄り先を追加。ドラッグで並べ替え、各区間のおおよその移動時間も表示。決まったらカレンダーに書き出せます。 |

### Glossary (moved from lang.js; readings normalized to `かな · romaji`)
Carry over the existing entries; normalize every reading to the `かな · romaji` form, and add entries for any new heading term a learner might hover (`部屋探し`, `参考情報`, `最優先アクション`, etc.). Full list finalized in the plan.

## 12. Testing / verification

- `node --test tests/lib.test.mjs` stays green; `node --test tests/i18n.test.mjs` (new) green.
- Serve locally; toggle あ↔日本語 on **every** route: brand, nav, all section/widget/tracker headings, and all 16 ledes flip to Japanese and back to English cleanly.
- `#goingCount` / `#roomCount` still update after toggling (mark a Going event, change a room filter).
- Hover dictionary still works on `.jp` accents + nav; no useless paragraph-hover popups.
- 0 console errors. Screen-reader spot check: document announces `en`, JP elements announce `ja`.

## 13. Files touched

- **Create:** `docs/assets/i18n.js`, `tests/i18n.test.mjs`
- **Modify:** `docs/assets/lang.js` (import module, innerHTML path for 2 ledes, per-element `lang`, no `data-jp` on ledes, `applyCurrentLang` export, header comment), `docs/index.html` (~50 `data-i18n` attrs + 2 `data-i18n-html`; migrate nav keys to `nav.*`), `docs/assets/tracker.js` (`data-i18n` on 2 `<h3>` + call `applyCurrentLang()`), `docs/sw.js` (CACHE bump + precache `assets/i18n.js`), `CLAUDE.md` (lang.js note).
