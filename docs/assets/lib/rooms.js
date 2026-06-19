'use strict';
// Pure helpers that derive structured fields from the free-text room records in tips.json
// (rent/fees/deposit/station strings). Import-safe in Node — no DOM, no storage. Every
// function is total: unparseable input yields a safe default and never throws. The figures
// are estimates (the source is human-written ranges), surfaced in the UI with an "est" tag.

// Fixed dictionary: Tokyo areas/lines that actually recur across the 44 records. Each entry is
// [label, regex]; matched against `station + area`. Drives the area/line filter chips.
const LINE_DICT = [
  ['Nakano', /nakano/i],
  ['Koenji', /koenji/i],
  ['Suginami', /suginami/i],
  ['Setagaya', /setagaya|sangenjaya|shimokita|gotokuji|kyodo|todoroki|oyamadai/i],
  ['Shibuya', /shibuya/i],
  ['Shinjuku', /shinjuku/i],
  ['Ikebukuro', /ikebukuro/i],
  ['Itabashi', /itabashi|\boyama\b/i],
  ['Toshima/Bunkyo', /toshima|bunkyo|otsuka|gokokuji|sugamo|komagome|kagurazaka|shiinamachi/i],
  ['Minato', /minato|roppongi|azabu|hiroo|aoyama/i],
  ['Asakusa/Kuramae', /asakusa|kuramae/i],
  ['Yamanote line', /yamanote/i],
  ['Chuo line', /chuo|sobu/i],
];

export const LINE_LABELS = LINE_DICT.map(([label]) => label);

// All ¥ amounts in a string, supporting the "¥54k" shorthand and ranges where only the first
// operand carries the ¥ ("¥45,000–95,000"). Returns number[] (may be empty).
export function yenAmounts(str) {
  const out = [];
  const re = /¥\s*([\d,]+)\s*(k)?(?:\s*[–-]\s*([\d,]+)\s*(k)?)?/gi;
  let m;
  while ((m = re.exec(String(str || '')))) {
    let n = parseInt(m[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n)) {
      if (m[2]) n *= 1000;          // "¥54k" → 54000
      out.push(n);
    }
    if (m[3] != null) {             // range second operand: "¥45,000–95,000"
      let n2 = parseInt(m[3].replace(/,/g, ''), 10);
      if (Number.isFinite(n2)) {
        if (m[4]) n2 *= 1000;
        out.push(n2);
      }
    }
  }
  return out;
}

// First ¥ amount in a string, or null.
export function parseYen(str) {
  const a = yenAmounts(str);
  return a.length ? a[0] : null;
}

// Monthly rent range from the free-text rent string. Nightly rates are ×30 (flagged unit:'night').
export function parseRent(rentStr) {
  const s = String(rentStr || '');
  const amts = yenAmounts(s);
  const unit = /night|nightly/i.test(s) ? 'night' : 'mo';
  if (!amts.length) return { monthlyMin: null, monthlyMax: null, unit };
  let lo = Math.min(...amts), hi = Math.max(...amts);
  if (unit === 'night') { lo *= 30; hi *= 30; }
  return { monthlyMin: lo, monthlyMax: hi, unit };
}

// Deposit in yen (estimate): a ¥ amount if present, else "N month(s)" → N × monthlyMin, else 0.
export function depositYen(room, monthlyMin) {
  const s = String(room.deposit || '');
  const yen = parseYen(s);
  if (yen != null) return yen;                                 // "¥20,000", "¥0"
  const mo = s.match(/(\d+)\s*(?:[–-]\s*\d+\s*)?month/i);      // "1 month", "~2–3 months" (takes the low end), "0–1 month"
  if (mo && monthlyMin != null) return parseInt(mo[1], 10) * monthlyMin;
  return 0;                                                    // "Low", "None", "Varies", ""
}

// Estimated up-front cash to move in: first month + one-time + deposit. null if rent unknown.
export function moveInEstimate(room) {
  const { monthlyMin } = parseRent(room.rent);
  if (monthlyMin == null) return { total: null, isEstimate: true };
  const oneTime = parseYen(room.oneTime) || 0;
  const deposit = depositYen(room, monthlyMin);
  return { total: monthlyMin + oneTime + deposit, isEstimate: true };
}

// Monthly all-in: rent floor + first fee amount, or rent alone when fees are included/unparseable.
export function monthlyAllIn(room) {
  const { monthlyMin } = parseRent(room.rent);
  if (monthlyMin == null) return null;
  const fees = parseYen(room.fees);
  return fees != null ? monthlyMin + fees : monthlyMin;
}

// Area/line tokens matched from the fixed dictionary against station + area.
export function lineTokens(room) {
  const hay = `${room.station || ''} ${room.area || ''}`;
  return LINE_DICT.filter(([, re]) => re.test(hay)).map(([label]) => label);
}

// requirements may be authored as a non-array by mistake; coerce to an array so callers never throw.
const reqs = (room) => Array.isArray(room.requirements) ? room.requirements : [];

export function bookFromAbroad(room) {
  const hay = `${room.moveIn || ''} ${reqs(room).join(' ')}`;
  return /abroad|before arrival|apply online/i.test(hay);
}

export function noGuarantor(room) {
  const hay = `${reqs(room).join(' ')} ${room.oneTime || ''}`;
  return /no guarantor/i.test(hay);
}

export function womenOnly(room) {
  return /^women-only/i.test(String(room.gender || ''))
    || /women-only/i.test(`${room.name || ''} ${room.area || ''}`);
}

export function searchBlob(room) {
  return [room.name, room.provider, room.area, room.station, room.note, room.roomType, room.gender,
    reqs(room).join(' ')].join(' ').toLowerCase();
}

// Map each room to a copy with derived fields. Run once, on first render. Does not mutate input.
export function enrich(rooms) {
  return (rooms || []).map(r => ({
    ...r,
    _price: parseRent(r.rent),
    _moveIn: moveInEstimate(r),
    _allIn: monthlyAllIn(r),
    _lines: lineTokens(r),
    _bookAbroad: bookFromAbroad(r),
    _noGuarantor: noGuarantor(r),
    _women: womenOnly(r),
    _blob: searchBlob(r),
  }));
}
