'use strict';
// Lazy boot for the PHRASES page (efficiency plan EF1). These 12 modules (+ the one-time
// collapse seed) used to run in the main boot for every visit to any page; now they dynamic-
// import on the first entry to #/phrases. Order preserved exactly from main.js.

import { mountPhrases, mountSurvival } from './phrases.js';
import { mountAnki } from './phrases-anki.js';
// pointtosay retired from the page (2026-07-11 declutter) — module kept for possible emergency-page reuse
import { mountVocab } from './vocab.js';
import { mountKana } from './kana.js';
import { mountNumbers } from './numbers.js';
import { mountSigns } from './signs.js';
import { mountQuiz } from './quiz.js';
import { mountPronunciation } from './pronunciation.js';
import { mountParticles } from './particles.js';
import { mountVerbs } from './verbs.js';
import { mountAdjectives } from './adjectives.js';
import { setCollapsed } from './collapse.js';
import { $$ } from './lib/dom.js';
import { get, set, KEYS } from './lib/store.js';

export function mountPhrasesBundle(data) {
  const safe = (fn) => { try { fn(); } catch (err) { console.error('[phrases]', err); } };
  safe(() => mountPhrases(data));
  safe(() => mountSurvival(data));
  safe(() => mountAnki(data));
  safe(() => mountVocab(data));
  safe(() => mountKana());
  safe(() => mountNumbers());
  safe(() => mountSigns(data));
  safe(() => mountQuiz(data));
  safe(() => mountPronunciation());
  safe(() => mountParticles());
  safe(() => mountVerbs());
  safe(() => mountAdjectives());
  // First visit: collapse every section except the first phrase category (one-time; persisted)
  safe(() => {
    if (get(KEYS.phraseCollapseSeed, false) !== true) {
      $$('#view-phrases .acc[data-acc]').forEach((a, i) => {
        if (i === 0) return;
        a.classList.add('is-collapsed');
        a.querySelector('.acc-head')?.setAttribute('aria-expanded', 'false');
        setCollapsed(a.dataset.acc, true);
      });
      set(KEYS.phraseCollapseSeed, true);
    }
  });
}
