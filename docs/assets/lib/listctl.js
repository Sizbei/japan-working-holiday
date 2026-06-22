'use strict';
// Which list-controls variant the checklist / packing toolbars render:
//   'quickline' (A) — one slim input that searches AND adds, with a contextual add row.
//   'pills'     (B) — two pills (🔍 Search / ＋ Add), each expanding in place.
// Stored in jwh-listctl-v1; default A. The ⚙ Guide & Settings overlay flips it and
// fires jwh:settings-changed, which content.js / packing.js listen to for a re-render.

import { KEYS, getRaw } from './store.js';

export const LISTCTL = { QUICKLINE: 'quickline', PILLS: 'pills' };

export function listCtl() {
  return getRaw(KEYS.listCtl, LISTCTL.QUICKLINE) === LISTCTL.PILLS ? LISTCTL.PILLS : LISTCTL.QUICKLINE;
}
