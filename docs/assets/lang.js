'use strict';
// Japanese option + hover-dictionary. Two independent aids for a Japanese learner:
//  1) An EN / 日本語 toggle that swaps the UI CHROME (nav, brand) via a small static map —
//     instant, offline, no build step. The researched CONTENT stays English (it's reference
//     data); this is a language-practice layer over the navigation, not a full translation.
//  2) Hover/focus any Japanese word (the .jp accents, or the translated nav in JP mode) to
//     see its reading + meaning. Source order: a bundled GLOSSARY (instant, offline) →
//     a live lookup via Jotoba (open dictionary API, CORS-ok) → a Jisho deep-link fallback.
//     Contained like Leaflet/Nominatim: hover-only, time-boxed, never blocks, fails safe.

import { $, $$, esc } from './lib/dom.js';
import { getRaw, setRaw, KEYS } from './lib/store.js';

const LANG_KEY = KEYS.lang;

// UI chrome strings (keyed by data-i18n)
const I18N = {
  brand: '私の一年', dashboard: 'ダッシュボード', calendar: 'カレンダー', checklist: 'チェックリスト',
  deadlines: '締め切り', explore: 'さがす', rooms: '部屋', map: '地図', plan: 'プラン',
};
// JP term → reading + gloss (covers the app's own Japanese; Jotoba enriches anything else)
const GLOSSARY = {
  '私の一年': { r: 'watashi no ichinen', m: 'my one year' },
  'ワーキングホリデー': { r: 'wākingu horidē', m: 'working holiday' },
  'ダッシュボード': { r: 'dasshubōdo', m: 'dashboard' }, 'カレンダー': { r: 'karendā', m: 'calendar' },
  'チェックリスト': { r: 'chekkurisuto', m: 'checklist' }, '締め切り': { r: 'しめきり · shimekiri', m: 'deadline' },
  'さがす': { r: 'sagasu', m: 'to search / look for' }, '部屋': { r: 'へや · heya', m: 'room' },
  '地図': { r: 'ちず · chizu', m: 'map' }, 'プラン': { r: 'puran', m: 'plan (itinerary)' },
  '一日': { r: 'いちにち · ichinichi', m: 'one day' }, '一年の計画': { r: 'ichinen no keikaku', m: 'a year’s plan' },
  '夜の音楽': { r: 'yoru no ongaku', m: 'night music / nightlife' }, '音楽の街': { r: 'ongaku no machi', m: 'music town' },
  '部屋探し': { r: 'heya-sagashi', m: 'room hunting' }, '東京で創る': { r: 'Tōkyō de tsukuru', m: 'building in Tokyo' },
  '考える場所': { r: 'kangaeru basho', m: 'a place to think' }, '四季の楽しみ': { r: 'shiki no tanoshimi', m: 'enjoying the four seasons' },
  '抽選・先行販売': { r: 'chūsen · senkō hanbai', m: 'lottery / advance sale' }, '東京ディズニー': { r: 'Tōkyō Dizunī', m: 'Tokyo Disney' },
  '集まり・イベント': { r: 'atsumari · ibento', m: 'meetups & events' }, 'ゲーム・アニメ・技術': { r: 'gēmu · anime · gijutsu', m: 'games · anime · tech' },
  '食べ歩き': { r: 'tabe-aruki', m: 'food-walking (eating around)' },
};

let pop = null, hideTimer = null, lastWord = '';

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
  document.documentElement.lang = lang === 'ja' ? 'ja' : 'en';
  const btn = $('#langToggle'); if (btn) { btn.textContent = lang === 'ja' ? 'A' : 'あ'; btn.setAttribute('aria-pressed', lang === 'ja' ? 'true' : 'false'); btn.title = lang === 'ja' ? 'Switch to English' : '日本語に切り替え'; }
  $$('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (el.dataset.en == null) el.dataset.en = el.textContent;     // remember the English once
    if (lang === 'ja' && I18N[key]) { el.textContent = I18N[key]; el.setAttribute('data-jp', '1'); }
    else { el.textContent = el.dataset.en; el.removeAttribute('data-jp'); }
  });
}

// ---------- hover / focus dictionary ----------
function wireDictionary() {
  document.addEventListener('mouseover', (e) => { const t = e.target.closest('.jp, [data-jp]'); if (t) showFor(t); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.jp, [data-jp]')) scheduleHide(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest('.jp, [data-jp]'); if (t) showFor(t); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('.jp, [data-jp]')) scheduleHide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideNow(); });
  // make the decorative .jp accents reachable by keyboard for the lookup
  $$('.jp').forEach(el => { if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); el.removeAttribute('aria-hidden'); } });
}
function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'jp-dict'; pop.setAttribute('role', 'tooltip');
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
  if (!g) lookup(word, p, el);                                       // enrich unknown words via the API
}
function render(word, reading, meaning, loading) {
  return `<div class="jd-word">${esc(word)}</div>
    ${reading ? `<div class="jd-read">${esc(reading)}</div>` : ''}
    <div class="jd-mean">${loading ? '<span class="jd-load">looking up…</span>' : esc(meaning || '')}</div>
    <a class="jd-link" href="https://jisho.org/search/${encodeURIComponent(word)}" target="_blank" rel="noopener">Jisho ↗</a>`;
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
function hideNow() { if (pop) pop.classList.remove('show'); lastWord = ''; }
