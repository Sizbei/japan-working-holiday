'use strict';
// Versioned localStorage helpers. All state is device-local; nothing leaves the browser.

export const KEYS = {
  auth: 'jwh-auth-v1',
  events: 'jwh-events-v1',
  calFilters: 'jwh-calfilters-v1',
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
  theme: 'jwh-theme',
  brewNotes: 'jwh-brew-notes-v1',
  brewIdeas: 'jwh-brew-ideas-v1',
};

export function get(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
export function set(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}
export function getRaw(key, fallback = '') {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; }
}
export function setRaw(key, val) {
  try { localStorage.setItem(key, val); return true; } catch { return false; }
}
export function del(key) { try { localStorage.removeItem(key); } catch {} }
