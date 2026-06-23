'use strict';
// Pure CRUD for user-imported / saved phrases (jwh-phrases-user-v1). Mirrors lib/places.js:
// the feature module assigns ids (no Date.now() in the pure lib).
//   A user phrase: { id, jp, read, en, cat, src, _user:true }

export function userPhrase({ jp = '', read = '', en = '', cat = 'Imported', src = '' } = {}, id) {
  return { id, jp: String(jp), read: String(read), en: String(en), cat: String(cat || 'Imported'), src: String(src), _user: true };
}
export function addUserPhrases(list, incoming) { return [...(list || []), ...(incoming || [])]; }
export function removeUserPhrase(list, id) { return (list || []).filter(p => p.id !== id); }
