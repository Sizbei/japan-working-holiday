'use strict';
// Versioned localStorage helpers. All state is device-local; nothing leaves the browser.

export const KEYS = {
  auth: 'jwh-auth-v1',
  events: 'jwh-events-v1',
  going: 'jwh-going-v1',
  calFilters: 'jwh-calfilters-v1',
  calGoingOnly: 'jwh-cal-goingonly-v1',
  eventOverrides: 'jwh-event-overrides-v1',
  places: 'jwh-places-v1',
  mapFilters: 'jwh-mapfilters-v1',
  dayPlans: 'jwh-dayplans-v1',
  checkOrder: 'jwh-checkorder-v1',
  widgetOrder: 'jwh-widgetorder-v1',
  arcade: 'jwh-arcade-v1',
  due: 'jwh-due-v1',
  dismissed: 'jwh-notif-dismissed-v1',
  checklist: 'jwh-checklist-v1',
  checklistCustom: 'jwh-checklist-custom-v1',
  checkHideDone: 'jwh-check-hidedone-v1',
  checkPriority: 'jwh-check-priority-v1',
  checkPriorityV2: 'jwh-check-priority-v2',
  checkSmartView: 'jwh-check-smartview',
  theme: 'jwh-theme',
  lang: 'jwh-lang',
  reduceMotion: 'jwh-reduce-motion',
  listCtl: 'jwh-listctl-v1',
  celebrations: 'jwh-celebrations',
  sound: 'jwh-sound',
  homeLayout: 'jwh-home-layout-v1',
  brewNotes: 'jwh-brew-notes-v1',
  brewIdeas: 'jwh-brew-ideas-v1',
  rooms: 'jwh-rooms-v1',
  collapse: 'jwh-collapse-v1',
  packing: 'jwh-packing-v1',
  packCustom: 'jwh-pack-custom-v1',
  packOrder: 'jwh-pack-order-v1',
  packHideDone: 'jwh-pack-hidedone-v1',
  budget: 'jwh-budget-v1',
  phraseFav: 'jwh-phrasefav-v1',
  furi: 'jwh-furi-v1',
  dictCache: 'jwh-dict-cache-v1',
  quizStats: 'jwh-quiz-stats-v1',
  phraseCollapseSeed: 'jwh-phrase-collapse-seed-v1',
  checkPhaseCollapseSeed: 'jwh-check-phase-collapse-seed-v1',
  phraseFavView: 'jwh-phrase-favview-v1',
  userPhrases: 'jwh-phrases-user-v1',
  ankiDeck: 'jwh-anki-deck-v1',
  translateCache: 'jwh-translate-cache-v1',
  tags: 'jwh-tags-v1',
  seed: 'jwh-seed-v1',
  gcalMap: 'jwh-gcal-map-v1',
  seedNearby: 'jwh-seed-nearby-v1',
  fixHousing: 'jwh-fix-housing-v1',
  seedPlan: 'jwh-seed-plan-v1',
};

export function get(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    const parsed = JSON.parse(v);
    // type-guard against a corrupted/wrong-typed value (e.g. a bad backup restore) bricking a
    // consumer that does .map()/Object.keys() — when the caller passes a typed fallback, enforce it
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)
      && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) return fallback;
    return parsed;
  }
  catch { return fallback; }
}
export function set(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { try { document.dispatchEvent(new CustomEvent('jwh:storage-full')); } catch { /* Node */ } return false; }   // quota → global warning
}
export function getRaw(key, fallback = '') {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; }
}
export function setRaw(key, val) {
  try { localStorage.setItem(key, val); return true; } catch { return false; }
}
export function del(key) { try { localStorage.removeItem(key); } catch {} }
