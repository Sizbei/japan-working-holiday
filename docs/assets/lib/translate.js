'use strict';
// Pure helpers for on-demand machine translation via MyMemory (keyless, CORS-enabled).
// The fetch lives in the feature modules; these are import-safe + unit-tested.

const LANGS = new Set(['en', 'ja']);
export const MAX_LEN = 500;

export function translateURL(text, from, to) {
  const t = (text || '').trim();
  if (!t) throw new Error('translateURL: empty text');
  if (!LANGS.has(from) || !LANGS.has(to) || from === to) throw new Error('translateURL: bad language pair');
  if (t.length > MAX_LEN) throw new Error('translateURL: text exceeds ' + MAX_LEN);
  return `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${from}|${to}`;
}

export function parseTranslation(json) {
  const rd = json && json.responseData;
  const status = json && json.responseStatus;
  const details = (json && json.responseDetails) || '';
  if (!rd || Number(status) !== 200 || rd.quotaFinished === true || /quota|limit|exceed/i.test(String(details))) {
    return { text: '', match: 0, warning: String(details || 'translation unavailable') };
  }
  return { text: String(rd.translatedText || ''), match: Number(rd.match) || 0, warning: '' };
}
