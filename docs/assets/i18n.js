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
