'use strict';
// S5 — Japanese pronunciation via the native Web Speech API (SpeechSynthesis). Zero deps,
// no network. Picks a ja-JP voice when the platform offers one; slightly slowed for learners.
// The button's "is-speaking" pulse is the only motion (CSS, reduce-motion gated) — audio itself
// always plays.

import { exampleReading } from './lib/grammar.js';

let jaVoice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = window.speechSynthesis.getVoices() || [];
  jaVoice = vs.find(v => /ja[-_]?JP/i.test(v.lang)) || vs.find(v => /^ja/i.test(v.lang)) || null;
  return jaVoice;
}

if ('speechSynthesis' in window) {
  pickVoice();
  // voices load async on most browsers — repick when they arrive
  try { window.speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch { /* older Safari */ }
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

// Speak `text` in Japanese. If `btn` is given, toggle .is-speaking on it for the duration.
export function speak(text, btn) {
  if (!canSpeak() || !text) return;
  try {
    window.speechSynthesis.cancel();                 // interrupt any in-flight utterance
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (!jaVoice) pickVoice();
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.92;                                    // a touch slower than native pace
    if (btn) {
      const done = () => btn.classList.remove('is-speaking');
      btn.classList.add('is-speaking');
      u.onend = done; u.onerror = done;
    }
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable — fail silently */ }
}

// Speak an example's `ja` token array by its DATA readings (exampleReading), not the raw surface —
// so homographs (行った → いった) sound correct. Used across the Grammar Gym study surfaces.
export function speakExample(ja, btn) {
  speak(exampleReading(ja), btn);
}

// Shared 🔊 button markup for the study surfaces — a real <button data-act="speak"> that the
// module's delegated handler routes to speak/speakExample. Returns '' when TTS is unavailable, so
// callers can drop it in unconditionally and it self-hides. `cls` adds a site-specific class.
export function speakBtnHTML(cls = '') {
  if (!canSpeak()) return '';
  return `<button type="button" class="stu-speak${cls ? ' ' + cls : ''}" data-act="speak" aria-label="Play audio" title="Play audio">🔊</button>`;
}
