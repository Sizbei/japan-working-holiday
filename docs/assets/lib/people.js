'use strict';
// Pure, Node-testable logic for the 縁 People page (a trip PRM). No DOM, no Date.now —
// the caller passes id + todayIso so this stays deterministic and import-safe under `node --test`.
// Every consumer is device-local (localStorage `jwh-people-v1`); nothing here touches storage.

// ---- construction ----
// newPerson(fields, todayIso, id) → a normalized person record. Throws on missing name.
export function newPerson(fields = {}, todayIso = '', id = '') {
  const name = String(fields.name ?? '').trim();
  if (!name) throw new Error('name required');
  const tags = Array.isArray(fields.tags)
    ? fields.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    id: id || `p${todayIso}`,
    name,
    reading: str(fields.reading),
    star: !!fields.star,
    metDate: str(fields.metDate) || todayIso,   // required — defaults to today
    metPlace: str(fields.metPlace),
    metContext: str(fields.metContext),
    nationality: str(fields.nationality),
    from: str(fields.from),
    neighborhood: str(fields.neighborhood),
    leaves: str(fields.leaves),
    nextPlan: str(fields.nextPlan),
    addressAs: str(fields.addressAs),
    metThrough: str(fields.metThrough),
    food: str(fields.food),
    speaks: str(fields.speaks),
    birthday: str(fields.birthday),
    contact: str(fields.contact),
    tags: [...new Set(tags)],
    notes: str(fields.notes),
    notesUpdated: str(fields.notesUpdated),
    seenCount: Number.isFinite(fields.seenCount) ? fields.seenCount : 0,
    lastSeen: str(fields.lastSeen),
    lastSeenWhere: str(fields.lastSeenWhere),
  };
}
const str = (v) => String(v ?? '').trim();

// ---- search ----
// Case-insensitive substring across the fields worth recalling someone by.
export function searchPeople(list, q) {
  const query = String(q ?? '').trim().toLowerCase();
  if (!query) return list.slice();
  return list.filter((p) => {
    const hay = [
      p.name, p.reading, p.metPlace, p.metContext, p.notes,
      p.from, p.neighborhood, p.nextPlan,
      ...(Array.isArray(p.tags) ? p.tags : []),
    ].join(' \n ').toLowerCase();
    return hay.includes(query);
  });
}

// ---- sort ----
// Starred people always lead within any mode. Secondary key by mode; missing dates sort last.
export function sortPeople(list, mode = 'met') {
  const arr = list.slice();
  const cmp = comparators[mode] || comparators.met;
  arr.sort((a, b) => {
    if (!!b.star !== !!a.star) return b.star ? 1 : -1;   // starred first
    return cmp(a, b);
  });
  return arr;
}
// A missing/empty date should sort AFTER any real date in a "most recent" ordering.
const descDate = (av, bv) => {
  const a = av || '', b = bv || '';
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);   // newest first
};
// shape-tolerant accessors: a restored backup can carry malformed people (missing name,
// non-string dates) — sorting must degrade gracefully, never throw and brick the render.
const nm = (x) => String(x?.name ?? '');
const ds = (x) => (typeof x === 'string' ? x : '');
const comparators = {
  met: (a, b) => descDate(ds(a.metDate), ds(b.metDate)) || nm(a).localeCompare(nm(b)),
  seen: (a, b) => descDate(ds(a.lastSeen), ds(b.lastSeen)) || nm(a).localeCompare(nm(b)),
  name: (a, b) => nm(a).localeCompare(nm(b), undefined, { sensitivity: 'base' }),
};

// ---- tags ----
// Sorted unique lowercase tags present across the list (drives the filter chip row).
export function tagSet(list) {
  const set = new Set();
  for (const p of list) for (const t of (Array.isArray(p.tags) ? p.tags : [])) {
    const tag = String(t).trim().toLowerCase();
    if (tag) set.add(tag);
  }
  return [...set].sort();
}

// ---- avatar ----
const CJK = /[　-鿿＀-￯㐀-䶿]/;   // kana, kanji, CJK punctuation/fullwidth
// 1–2 uppercase initials. A CJK name yields its first character (e.g. 山田 → 山).
export function initialsOf(name) {
  const n = String(name ?? '').trim();
  if (!n) return '?';
  if (CJK.test(n[0])) return n[0];
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

// Deterministic avatar hue: a stable string hash of the id → one of the site's category colour
// NAMES, so CSS can map it to var(--c-<name>). Same id always yields the same hue.
const HUES = ['music', 'festival', 'convention', 'food', 'fireworks', 'illumination', 'nature', 'seasonal', 'personal', 'disney'];
export function hueOf(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return HUES[h % HUES.length];
}

// ---- nationality → flag emoji ----
const FLAGS = {
  jp: '🇯🇵', japan: '🇯🇵', japanese: '🇯🇵',
  au: '🇦🇺', australia: '🇦🇺', australian: '🇦🇺',
  us: '🇺🇸', usa: '🇺🇸', 'united states': '🇺🇸', american: '🇺🇸',
  uk: '🇬🇧', gb: '🇬🇧', britain: '🇬🇧', british: '🇬🇧', england: '🇬🇧',
  ca: '🇨🇦', canada: '🇨🇦', canadian: '🇨🇦',
  fr: '🇫🇷', france: '🇫🇷', french: '🇫🇷',
  de: '🇩🇪', germany: '🇩🇪', german: '🇩🇪',
  kr: '🇰🇷', korea: '🇰🇷', 'south korea': '🇰🇷', korean: '🇰🇷',
  cn: '🇨🇳', china: '🇨🇳', chinese: '🇨🇳',
  tw: '🇹🇼', taiwan: '🇹🇼', taiwanese: '🇹🇼',
  nz: '🇳🇿', 'new zealand': '🇳🇿',
  it: '🇮🇹', italy: '🇮🇹', italian: '🇮🇹',
  es: '🇪🇸', spain: '🇪🇸', spanish: '🇪🇸',
  nl: '🇳🇱', netherlands: '🇳🇱', dutch: '🇳🇱',
  br: '🇧🇷', brazil: '🇧🇷', brazilian: '🇧🇷',
  in: '🇮🇳', india: '🇮🇳', indian: '🇮🇳',
  th: '🇹🇭', thailand: '🇹🇭', thai: '🇹🇭',
  ph: '🇵🇭', philippines: '🇵🇭', filipino: '🇵🇭',
  sg: '🇸🇬', singapore: '🇸🇬',
  ie: '🇮🇪', ireland: '🇮🇪', irish: '🇮🇪',
  se: '🇸🇪', sweden: '🇸🇪', swedish: '🇸🇪',
};
export function flagOf(nationality) {
  const key = String(nationality ?? '').trim().toLowerCase();
  return FLAGS[key] || '';
}

// ---- leaves countdown ----
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Aug 20" from an ISO date, tz-stable (no Date parsing of the whole string).
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${MON[+m[2] - 1]} ${+m[3]}`;
}
function daysApart(fromIso, toIso) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fromIso || ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(toIso || ''));
  if (!a || !b) return null;
  const ta = Date.UTC(+a[1], +a[2] - 1, +a[3]);
  const tb = Date.UTC(+b[1], +b[2] - 1, +b[3]);
  return Math.round((tb - ta) / 86400000);
}
// '⏳ leaves Aug 20 — 6 weeks' (future) | 'left Aug 20' (past/today) | '' (unset/invalid).
export function leavesLabel(leaves, todayIso) {
  const iso = String(leaves || '').trim();
  if (!iso) return '';
  const d = daysApart(todayIso, iso);
  if (d === null) return '';
  if (d <= 0) return `left ${shortDate(iso)}`;
  const when = shortDate(iso);
  let span;
  if (d < 14) span = `${d} day${d === 1 ? '' : 's'}`;
  else if (d < 60) { const w = Math.round(d / 7); span = `${w} week${w === 1 ? '' : 's'}`; }
  else { const mo = Math.round(d / 30); span = `${mo} month${mo === 1 ? '' : 's'}`; }
  return `⏳ leaves ${when} — ${span}`;
}
