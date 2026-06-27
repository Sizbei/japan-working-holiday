'use strict';
// S18 — Pronunciation tips (pitch accent, vowel length, small っ, ん, devoicing, intonation) plus
// a locale-aware "today in Japanese" line. Collapsible on the phrasebook page; tap examples to hear.
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';
import { jpDate } from './lib/jpdate.js';

const SPK = canSpeak();

// each tip: { title, body, ex: [jp, reading, gloss] | null }
const TIPS = [
  { title: 'Pitch, not stress', body: 'Japanese distinguishes words by high/low pitch, not by stressing a syllable like English. はし can be bridge, chopsticks, or edge depending on pitch — keep syllables even and let pitch do the work.', ex: ['はし', 'hashi', 'bridge / chopsticks / edge'] },
  { title: 'Vowel length matters', body: 'A long vowel is a separate beat and can change the meaning: おばさん (aunt) vs おばあさん (grandmother). Hold ō, ū, ā for two beats.', ex: ['おばあさん', 'obāsan', 'grandmother'] },
  { title: 'The small っ is a beat', body: 'A small っ (sokuon) is a held, stopped beat before the next consonant: きて (come) vs きって (stamp). Pause briefly — it counts as one mora.', ex: ['きって', 'kitte', 'postage stamp'] },
  { title: 'ん is its own beat', body: 'ん (moraic n) takes a full beat. しんぶん (newspaper) is four beats: shi-n-bu-n, not two syllables.', ex: ['しんぶん', 'shinbun', 'newspaper'] },
  { title: 'Devoiced vowels', body: 'Between voiceless consonants (or at the end), い and う often nearly drop: です sounds like "des", すき like "ski". Don\'t over-pronounce them.', ex: ['すき', 'suki', 'like / fond of'] },
  { title: 'The Japanese ら-row', body: 'ら り る れ ろ are a light flap of the tongue — between an English r, l, and d. Tap once, lightly; never roll it.', ex: ['ありがとう', 'arigatō', 'thank you'] },
  { title: 'Questions rise at か', body: 'A statement and a question share the same words; the final か rises in pitch to mark a question — like a gentle upward inflection at the end.', ex: ['いいですか', 'ii desu ka', 'is it OK?'] },
];

export function mountPronunciation() {
  const host = $('#pronTips');
  if (!host) return;
  const today = jpDate(new Date());
  const cards = TIPS.map(t => {
    const ex = t.ex
      ? `<div class="pron-ex">
           <span class="jp" lang="ja" data-word="${esc(t.ex[0])}">${esc(t.ex[0])}</span>
           <span class="pron-read">${esc(t.ex[1])}</span>
           <span class="pron-gloss">${esc(t.ex[2])}</span>
           ${SPK ? `<button type="button" class="phrase-spk" data-jp="${esc(t.ex[0])}" aria-label="Play ${esc(t.ex[1])}">🔊</button>` : ''}
         </div>` : '';
    return `<div class="pron-card"><h4 class="pron-h">${esc(t.title)}</h4><p class="pron-body">${esc(t.body)}</p>${ex}</div>`;
  }).join('');
  host.innerHTML = `<section class="acc pron-acc" data-acc="pron">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-pron" aria-label="Pronunciation tips">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Pronunciation tips</span>
    </button>
    <div class="acc-panel" id="acc-panel-pron" role="region" aria-label="Pronunciation tips">
      <div class="acc-inner">
        ${today ? `<p class="pron-today">Today in Japanese: <span class="jp" lang="ja">${esc(today)}</span></p>` : ''}
        ${cards}
      </div>
    </div>
  </section>`;
  if (SPK) host.querySelectorAll('.phrase-spk').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  mountAccordion(host);
}
