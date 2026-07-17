'use strict';
// R6 — surfacing the R5 anime/register data. Two pure, esc()-safe render helpers shared by the
// grammar reference (#/grammar) and the study lessons (#/study):
//   pegHTML(point)        → the anime "peg" quote card. POST-explanation / POST-answer ONLY —
//                           NEVER a pre-answer cue (the peg contains the target pattern verbatim,
//                           so as a hint it would replace retrieval with recognition — teaching
//                           model item 9). Verbatim vs styled pegs differ by CSS tone only; the
//                           "(styled)" suffix already lives in the data's `source`.
//   flagBadgesHTML(point) → register-honesty chips from point.flags[], each with an instruction
//                           tooltip (teaching model item 12). FLAG_META is exported so the
//                           grammar-page flag filter can reuse the labels/semantics.
// Pure (no DOM, no store); every dynamic string through esc(). Peg JP text is a plain lang=ja
// span — NO .gtok/.jp token layer (those selectors belong to grammar.js / lang.js).
import { esc } from './dom.js';

// The validator-enforced register vocabulary. label = chip text; title = the instruction the
// learner must internalise; cls = the muted tone (keigo = the gold/prize accent; rude +
// role-language = a warning tone; the rest = neutral-muted).
export const FLAG_META = {
  'anime-common': { label: 'anime', title: "You'll hear this constantly in anime.", cls: 'anime' },
  'casual-spoken': { label: 'casual', title: 'Friends & speech — not for writing or formal contexts.', cls: 'casual' },
  'written-formal': { label: 'written', title: 'Written register — recognize when reading; gates as recognition.', cls: 'written' },
  'yakuwarigo-recognize-only': { label: 'role-language', title: 'Fictional role-language — recognize, never reproduce.', cls: 'role' },
  'rude-in-life': { label: 'rough', title: "Rough in real life — recognize, don't use on strangers.", cls: 'rude' },
  'keigo-critical': { label: 'keigo ★', title: 'The Tokyo-workplace register — master AND produce.', cls: 'keigo' },
};

// register-flag chips for one point. Unknown flags are dropped (defensive against future values);
// no flags = standard neutral-polite, so nothing renders.
export function flagBadgesHTML(point) {
  const flags = point && Array.isArray(point.flags) ? point.flags : [];
  const chips = flags.filter(f => FLAG_META[f]).map(f => {
    const m = FLAG_META[f];
    return `<span class="flag-chip flag-chip--${esc(m.cls)}" title="${esc(m.title)}">${esc(m.label)}</span>`;
  });
  if (!chips.length) return '';
  return `<span class="flag-chips" role="group" aria-label="Register flags">${chips.join('')}</span>`;
}

// the anime peg as a distinct quote card. Returns '' when the point has no peg. Defensive against a
// partial peg object (a missing romaji/en/source line is simply omitted).
export function pegHTML(point) {
  const peg = point && point.peg;
  if (!peg || !peg.ja) return '';
  const kind = peg.kind === 'verbatim' ? 'verbatim' : 'styled';
  const romaji = peg.romaji ? `<p class="peg-romaji">${esc(peg.romaji)}</p>` : '';
  const en = peg.en ? `<p class="peg-en">${esc(peg.en)}</p>` : '';
  const src = peg.source ? `<figcaption class="peg-src">— ${esc(peg.source)}</figcaption>` : '';
  return `<figure class="peg peg--${kind}">`
    + `<blockquote class="peg-ja" lang="ja">「${esc(peg.ja)}」</blockquote>`
    + romaji + en + src
    + `</figure>`;
}

// predicate factory for the grammar-page flag filter. The concrete flag options map 1:1; the
// composite "recognize-only" option matches every "recognize, never reproduce" flag (yakuwarigo +
// rude-in-life) — the recognize half of the cheat-sheet. '' (All) matches everything.
const FLAG_FILTER = {
  'anime-common': ['anime-common'],
  'casual-spoken': ['casual-spoken'],
  'written-formal': ['written-formal'],
  'keigo-critical': ['keigo-critical'],
  'recognize-only': ['yakuwarigo-recognize-only', 'rude-in-life'],
};
export function matchesFlag(point, value) {
  if (!value) return true;
  const want = FLAG_FILTER[value];
  if (!want) return true;
  const flags = point && Array.isArray(point.flags) ? point.flags : [];
  return flags.some(f => want.includes(f));
}
