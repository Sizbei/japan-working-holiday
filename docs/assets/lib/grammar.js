'use strict';
// Pure logic for the JLPT grammar reference (#/grammar) — furigana-derived readings,
// kana→romaji (wapuro-style: matches how a learner types into an IME), and search/filter
// over grammar points. Import-safe in Node; unit-tested in tests/lib.test.mjs.
// Plan: specs/plans/2026-07-10-jlpt-grammar.md (P1).

// ---- readings -------------------------------------------------------------
// A token's furigana is per-segment [base, reading][] — the lib/furigana.js shape,
// e.g. [['食','た'],['べて','']]. Reading falls back to the base for kana segments.
export function readingOf(f) {
  return (f || []).map(s => (s && (s[1] || s[0])) || '').join('');
}

// full kana reading of one example token (string tokens read as themselves)
export function tokenReading(tok) {
  return typeof tok === 'string' ? tok : readingOf(tok && tok.f);
}

// full kana reading of an example's `ja` token array (mixed strings + {t,f,g,p} objects) —
// each token mapped through tokenReading (string → itself; object → readingOf its furigana) and
// concatenated. This is what feeds speak(): TTS pronounces the DATA's readings (行った → いった)
// instead of guessing homographs from the surface. Pure — unit-tested in tests/lib.test.mjs.
export function exampleReading(ja) {
  // fall back to a token's surface when it carries no furigana reading (all current data has f;
  // this guards a future f-less object token from being silently dropped from speech)
  return (Array.isArray(ja) ? ja : []).map(t => tokenReading(t) || (t && t.t) || '').join('');
}

// ---- kana → romaji (wapuro) ------------------------------------------------
// Wapuro-style on purpose: it mirrors IME typing habits, so a learner's "kyou"/"gakkou"
// matches. Non-kana characters (〜, kanji, punctuation) are skipped, not errors.
const DIG = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
};
const MONO = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゔ': 'vu',
};
export function kanaToRomaji(kana) {
  // katakana → hiragana so one table covers both
  const hira = String(kana || '').replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  let out = '', gem = false;
  for (let i = 0; i < hira.length;) {
    const one = hira[i];
    if (one === 'っ') { gem = true; i += 1; continue; }
    if (one === 'ー') { const m = out.match(/([aiueo])[^aiueo]*$/); out += m ? m[1] : ''; i += 1; continue; }
    const two = DIG[hira.slice(i, i + 2)];
    const r = two || MONO[one];
    if (!r) { gem = false; i += 1; continue; }           // skip non-kana (〜, punctuation, kanji)
    if (gem) { out += r[0]; gem = false; }
    out += r;
    i += two ? 2 : 1;
  }
  return out;
}

// ---- search / filter -------------------------------------------------------
// Fields matched (plan spec): pattern (what the card shows — kanji substring works),
// the kana reading, its wapuro romaji (query spaces/hyphens/apostrophes ignored so
// "mae ni" matches), and the EN meaning. Case-insensitive.
export function searchPoints(points, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return (points || []).slice();
  const qr = q.replace(/[\s'’-]/g, '');
  return (points || []).filter(p => {
    if (!p) return false;
    if (String(p.pattern || '').toLowerCase().includes(q)) return true;
    const read = String(p.reading || p.pattern || '');
    if (read.includes(q)) return true;
    if (qr && kanaToRomaji(read).includes(qr)) return true;
    return String(p.meaning || '').toLowerCase().includes(q);
  });
}

export function byLevel(points, level) {
  return (points || []).filter(p => p && p.level === level);
}

// ---- ◆ → Anki export (the shaky flag's consumer) ----------------------------
// Rows for lib/anki.js toAnkiTSV: front = the pattern, back = meaning + connection,
// tags = deck marker + level. Level order N5→N1, deck order within a level.
export function shakyRows(pointsByLevel, shakyIds) {
  const want = new Set(shakyIds || []);
  const out = [];
  for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    for (const p of pointsByLevel[level] || []) {
      if (p && want.has(p.id)) out.push({ front: p.pattern, back: `${p.meaning} — ${p.connection}`, tags: ['jwh-grammar', p.level] });
    }
  }
  return out;
}
