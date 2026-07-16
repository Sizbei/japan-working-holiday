'use strict';
// The Japanese almanac: 24 solar terms (二十四節気, sekki) and 72 micro-seasons (七十二候, kō)
// from the Meiji-era Ryakuhon-reki (略本暦) list. Pure lookup — no DOM, no module-state mutation.
// Boundary dates are the usual fixed month-days; the true astronomical dates shift ±1 day by
// year (same honesty rule as the app's other researched dates — approximate, verify closer).
// All dates are ISO 'YYYY-MM-DD' strings treated as UTC midnight, matching lib/dates.js.

const SEASONS = [
  { kanji: '春', en: 'Spring' },
  { kanji: '夏', en: 'Summer' },
  { kanji: '秋', en: 'Autumn' },
  { kanji: '冬', en: 'Winter' },
];

// [month, day, kanji, romaji, gloss, seasonIndex] — sorted by month-day.
const SEKKI = [
  [1, 5, '小寒', 'shōkan', 'lesser cold', 3],
  [1, 20, '大寒', 'daikan', 'greater cold', 3],
  [2, 4, '立春', 'risshun', 'beginning of spring', 0],
  [2, 19, '雨水', 'usui', 'rainwater', 0],
  [3, 6, '啓蟄', 'keichitsu', 'insects awaken', 0],
  [3, 21, '春分', 'shunbun', 'spring equinox', 0],
  [4, 5, '清明', 'seimei', 'pure and clear', 0],
  [4, 20, '穀雨', 'kokuu', 'grain rain', 0],
  [5, 5, '立夏', 'rikka', 'beginning of summer', 1],
  [5, 21, '小満', 'shōman', 'lesser ripening', 1],
  [6, 6, '芒種', 'bōshu', 'grain in ear', 1],
  [6, 21, '夏至', 'geshi', 'summer solstice', 1],
  [7, 7, '小暑', 'shōsho', 'lesser heat', 1],
  [7, 23, '大暑', 'taisho', 'greater heat', 1],
  [8, 8, '立秋', 'risshū', 'beginning of autumn', 2],
  [8, 23, '処暑', 'shosho', 'heat abates', 2],
  [9, 8, '白露', 'hakuro', 'white dew', 2],
  [9, 23, '秋分', 'shūbun', 'autumn equinox', 2],
  [10, 8, '寒露', 'kanro', 'cold dew', 2],
  [10, 23, '霜降', 'sōkō', 'frost descends', 2],
  [11, 7, '立冬', 'rittō', 'beginning of winter', 3],
  [11, 22, '小雪', 'shōsetsu', 'lesser snow', 3],
  [12, 7, '大雪', 'taisetsu', 'greater snow', 3],
  [12, 22, '冬至', 'tōji', 'winter solstice', 3],
];

// [month, day, kanji, romaji, gloss] — the 72 kō, three per sekki, sorted by month-day.
// (雪下出麦 opens the calendar year: it is the last kō of the previous year's 冬至.)
const KO = [
  [1, 1, '雪下出麦', 'yuki watarite mugi nobiru', 'wheat sprouts beneath the snow'],
  [1, 5, '芹乃栄', 'seri sunawachi sakau', 'parsley flourishes'],
  [1, 10, '水泉動', 'shimizu atataka o fukumu', 'springs stir beneath the ice'],
  [1, 15, '雉始雊', 'kiji hajimete naku', 'pheasants begin to call'],
  [1, 20, '款冬華', 'fuki no hana saku', 'butterburs bud'],
  [1, 25, '水沢腹堅', 'sawamizu kōri tsumeru', 'ice thickens on the streams'],
  [1, 30, '鶏始乳', 'niwatori hajimete toya ni tsuku', 'hens begin to lay'],
  [2, 4, '東風解凍', 'harukaze kōri o toku', 'east wind melts the ice'],
  [2, 9, '黄鶯睍睆', 'uguisu naku', 'bush warblers begin to sing'],
  [2, 14, '魚上氷', 'uo kōri o izuru', 'fish rise through cracking ice'],
  [2, 19, '土脉潤起', 'tsuchi no shō uruoi okoru', 'rain moistens the soil'],
  [2, 24, '霞始靆', 'kasumi hajimete tanabiku', 'mist begins to linger'],
  [3, 1, '草木萌動', 'sōmoku mebae izuru', 'grasses sprout, trees bud'],
  [3, 6, '蟄虫啓戸', 'sugomori mushi to o hiraku', 'hibernating insects open their doors'],
  [3, 11, '桃始笑', 'momo hajimete saku', 'first peach blossoms'],
  [3, 16, '菜虫化蝶', 'namushi chō to naru', 'caterpillars become butterflies'],
  [3, 21, '雀始巣', 'suzume hajimete sukū', 'sparrows begin to nest'],
  [3, 26, '桜始開', 'sakura hajimete hiraku', 'first cherry blossoms'],
  [3, 31, '雷乃発声', 'kaminari sunawachi koe o hassu', 'distant thunder finds its voice'],
  [4, 5, '玄鳥至', 'tsubame kitaru', 'swallows return'],
  [4, 10, '鴻雁北', 'kōgan kaeru', 'wild geese fly north'],
  [4, 15, '虹始見', 'niji hajimete arawaru', 'first rainbows appear'],
  [4, 20, '葭始生', 'ashi hajimete shōzu', 'reeds begin to sprout'],
  [4, 25, '霜止出苗', 'shimo yamite nae izuru', 'frost ends, rice seedlings rise'],
  [4, 30, '牡丹華', 'botan hana saku', 'peonies bloom'],
  [5, 5, '蛙始鳴', 'kawazu hajimete naku', 'frogs begin to sing'],
  [5, 10, '蚯蚓出', 'mimizu izuru', 'earthworms surface'],
  [5, 15, '竹笋生', 'takenoko shōzu', 'bamboo shoots appear'],
  [5, 21, '蚕起食桑', 'kaiko okite kuwa o hamu', 'silkworms feast on mulberry'],
  [5, 26, '紅花栄', 'benibana sakau', 'safflowers flower in abundance'],
  [5, 31, '麦秋至', 'mugi no toki itaru', 'barley ripens golden'],
  [6, 6, '螳螂生', 'kamakiri shōzu', 'praying mantises hatch'],
  [6, 11, '腐草為螢', 'kusaretaru kusa hotaru to naru', 'rotting grass becomes fireflies'],
  [6, 16, '梅子黄', 'ume no mi kibamu', 'plums turn yellow'],
  [6, 21, '乃東枯', 'natsukarekusa karuru', 'self-heal withers'],
  [6, 27, '菖蒲華', 'ayame hana saku', 'irises bloom'],
  [7, 2, '半夏生', 'hange shōzu', 'crow-dipper sprouts'],
  [7, 7, '温風至', 'atsukaze itaru', 'warm winds arrive'],
  [7, 12, '蓮始開', 'hasu hajimete hiraku', 'lotuses begin to bloom'],
  [7, 17, '鷹乃学習', 'taka sunawachi waza o narau', 'young hawks learn to fly'],
  [7, 23, '桐始結花', 'kiri hajimete hana o musubu', 'paulownia sets its flower buds'],
  [7, 29, '土潤溽暑', 'tsuchi uruōte mushiatsushi', 'earth is damp, air is sweltering'],
  [8, 3, '大雨時行', 'taiu tokidoki furu', 'great rains sometimes fall'],
  [8, 8, '涼風至', 'suzukaze itaru', 'cool winds arrive'],
  [8, 13, '寒蝉鳴', 'higurashi naku', 'evening cicadas sing'],
  [8, 18, '蒙霧升降', 'fukaki kiri matō', 'thick fog blankets all'],
  [8, 23, '綿柎開', 'wata no hana shibe hiraku', 'cotton bolls split open'],
  [8, 28, '天地始粛', 'tenchi hajimete samushi', 'the heat begins to relent'],
  [9, 2, '禾乃登', 'kokumono sunawachi minoru', 'rice ripens'],
  [9, 8, '草露白', 'kusa no tsuyu shiroshi', 'dew shines white on the grass'],
  [9, 13, '鶺鴒鳴', 'sekirei naku', 'wagtails sing'],
  [9, 18, '玄鳥去', 'tsubame saru', 'swallows depart'],
  [9, 23, '雷乃収声', 'kaminari sunawachi koe o osamu', 'thunder stills its voice'],
  [9, 28, '蟄虫坏戸', 'mushi kakurete to o fusagu', 'insects seal their doors'],
  [10, 3, '水始涸', 'mizu hajimete karuru', 'paddies are drained of water'],
  [10, 8, '鴻雁来', 'kōgan kitaru', 'wild geese return'],
  [10, 13, '菊花開', 'kiku no hana hiraku', 'chrysanthemums bloom'],
  [10, 18, '蟋蟀在戸', 'kirigirisu to ni ari', 'crickets sing by the door'],
  [10, 23, '霜始降', 'shimo hajimete furu', 'first frost falls'],
  [10, 28, '霎時施', 'kosame tokidoki furu', 'light rains pass through'],
  [11, 2, '楓蔦黄', 'momiji tsuta kibamu', 'maples and ivy turn gold'],
  [11, 7, '山茶始開', 'tsubaki hajimete hiraku', 'sasanqua begins to bloom'],
  [11, 12, '地始凍', 'chi hajimete kōru', 'the land begins to freeze'],
  [11, 17, '金盞香', 'kinsenka saku', 'narcissus blooms fragrant'],
  [11, 22, '虹蔵不見', 'niji kakurete miezu', 'rainbows hide away'],
  [11, 27, '朔風払葉', 'kitakaze konoha o harau', 'north wind strips the leaves'],
  [12, 2, '橘始黄', 'tachibana hajimete kibamu', 'tachibana citrus turns gold'],
  [12, 7, '閉塞成冬', 'sora samuku fuyu to naru', 'skies close in, winter arrives'],
  [12, 12, '熊蟄穴', 'kuma ana ni komoru', 'bears retreat to their dens'],
  [12, 16, '鱖魚群', 'sake no uo muragaru', 'salmon gather upstream'],
  [12, 22, '乃東生', 'natsukarekusa shōzu', 'self-heal sprouts'],
  [12, 27, '麋角解', 'sawashika no tsuno otsuru', 'deer shed their antlers'],
];

// ---- date plumbing (UTC, matching lib/dates.js conventions) ----
function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}
const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const mdd = (m, d) => m * 100 + d;

// index of the last entry whose month-day is ≤ the given key; -1 if the key
// precedes the first entry (caller wraps to the table's final entry, previous year)
function lastAtOrBefore(table, key) {
  let i = -1;
  for (let j = 0; j < table.length; j++) {
    if (mdd(table[j][0], table[j][1]) <= key) i = j; else break;
  }
  return i;
}

// resolve entry i of `table` for a date (y, key): its start/end ISO and the following entry
function resolve(table, i, y, key) {
  const wrapped = i === -1;
  const at = wrapped ? table.length - 1 : i;
  const entry = table[at];
  const startY = wrapped || mdd(entry[0], entry[1]) > key ? y - 1 : y;
  const next = table[(at + 1) % table.length];
  const nextY = mdd(next[0], next[1]) > mdd(entry[0], entry[1]) ? startY : startY + 1;
  const end = new Date(Date.UTC(nextY, next[0] - 1, next[1]) - 86400000);
  return {
    entry,
    next,
    startISO: toISO(startY, entry[0], entry[1]),
    endISO: toISO(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
    nextStartISO: toISO(nextY, next[0], next[1]),
  };
}

// For an ISO date, the current solar term + micro-season + what comes next.
// Returns null for unparseable input.
export function sekkiFor(iso) {
  const d = parseISO(iso);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const key = mdd(d.getUTCMonth() + 1, d.getUTCDate());

  const s = resolve(SEKKI, lastAtOrBefore(SEKKI, key), y, key);
  const k = resolve(KO, lastAtOrBefore(KO, key), y, key);

  return {
    sekki: { kanji: s.entry[2], romaji: s.entry[3], en: s.entry[4], startISO: s.startISO, endISO: s.endISO },
    ko: { kanji: k.entry[2], romaji: k.entry[3], en: k.entry[4], startISO: k.startISO, endISO: k.endISO },
    nextKo: { kanji: k.next[2], romaji: k.next[3], en: k.next[4], startISO: k.nextStartISO },
    season: { ...SEASONS[s.entry[5]] },
  };
}
