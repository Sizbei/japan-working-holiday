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

let pop = null, hideTimer = null, lastWord = '', curEl = null;

export function mountLang() {
  injectToggle();
  applyLang(getRaw(LANG_KEY, 'en'));
  wireDictionary();
}

// ---------- EN / 日本語 toggle ----------
function injectToggle() {
  const right = $('.topbar-right'); if (!right || $('#langToggle')) return;
  const btn = document.createElement('button');
  btn.id = 'langToggle'; btn.type = 'button'; btn.className = 'lang-toggle';
  btn.setAttribute('aria-label', 'Switch language');
  right.insertBefore(btn, right.firstChild);
  btn.addEventListener('click', () => applyLang(getRaw(LANG_KEY, 'en') === 'ja' ? 'en' : 'ja'));
}
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

// ---------- hover / focus dictionary ----------
function wireDictionary() {
  document.addEventListener('mouseover', (e) => { const t = e.target.closest('.jp, [data-jp]'); if (t) showFor(t); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.jp, [data-jp]')) scheduleHide(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest('.jp, [data-jp]'); if (t) showFor(t); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('.jp, [data-jp]')) scheduleHide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideNow(); });
  wireJpAccents(document);
}
// Make the .jp accents inside `container` reachable by keyboard for the lookup — as named
// buttons, not anonymous tab stops. Idempotent (skips already-wired). Pages that render .jp
// dynamically (e.g. phrases.js) call this after each render so JS-rendered .jp get keyboard
// access; the mouseover/focus delegation in wireDictionary already covers dynamic .jp.
export function wireJpAccents(container = document) {
  if (!container) return;
  container.querySelectorAll('.jp').forEach(el => {
    if (el.hasAttribute('tabindex')) return;
    const word = (el.textContent || '').trim();
    el.setAttribute('tabindex', '0');
    el.removeAttribute('aria-hidden');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Define ${word}`);
  });
}
function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'jp-dict'; pop.id = 'jpDictPop'; pop.setAttribute('role', 'tooltip');
  pop.addEventListener('mouseover', () => clearTimeout(hideTimer));
  pop.addEventListener('mouseout', scheduleHide);
  document.body.appendChild(pop);
  return pop;
}
function showFor(el) {
  clearTimeout(hideTimer);
  const word = (el.textContent || '').trim();
  if (!word || !/[぀-ヿ一-龯]/.test(word)) return;   // must contain kana/kanji
  const p = ensurePop();
  lastWord = word;
  const g = GLOSSARY[word];
  p.innerHTML = render(word, g ? g.r : '', g ? g.m : (g === undefined ? '…' : ''), !g);
  position(p, el);
  p.classList.add('show');
  if (curEl && curEl !== el) curEl.removeAttribute('aria-describedby');
  curEl = el; el.setAttribute('aria-describedby', 'jpDictPop');      // link the tooltip to its trigger while shown
  if (!g) lookup(word, p, el);                                       // enrich unknown words via the API
}
function render(word, reading, meaning, loading) {
  return `<div class="jd-word">${esc(word)}</div>
    ${reading ? `<div class="jd-read">${esc(reading)}</div>` : ''}
    <div class="jd-mean">${loading ? '<span class="jd-load">looking up…</span>' : esc(meaning || '')}</div>
    <a class="jd-link" href="https://jisho.org/search/${encodeURIComponent(word)}" target="_blank" rel="noopener noreferrer">Jisho ↗</a>`;
}
async function lookup(word, p, el) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('https://jotoba.de/api/search/words', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: word, language: 'English', no_english: false }), signal: ctrl.signal,
    });
    clearTimeout(to);
    if (lastWord !== word) return;                                   // user moved on
    const data = r.ok ? await r.json() : null;
    if (lastWord !== word) return;                                   // re-check after the json() await — don't clobber a newer word's gloss
    const w = data && data.words && data.words[0];
    const reading = w?.reading ? [w.reading.kana, w.reading.kanji].filter(Boolean).join(' · ') : '';
    const gloss = w?.senses?.[0]?.glosses?.join(', ') || '';
    if (reading || gloss) { p.innerHTML = render(word, reading, gloss, false); position(p, el); }
    else { p.innerHTML = render(word, '', 'no dictionary match — open Jisho for details', false); }
  } catch {
    if (lastWord === word) p.innerHTML = render(word, '', 'lookup unavailable — open Jisho ↗', false);
  }
}
function position(p, el) {
  const r = el.getBoundingClientRect();
  p.style.visibility = 'hidden'; p.style.display = 'block';
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;      // flip up
  p.style.left = left + 'px'; p.style.top = Math.max(8, top) + 'px';
  p.style.visibility = ''; p.style.display = '';
}
function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideNow, 220); }
function hideNow() { if (pop) pop.classList.remove('show'); lastWord = ''; if (curEl) { curEl.removeAttribute('aria-describedby'); curEl = null; } }
