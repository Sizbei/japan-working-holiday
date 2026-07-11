'use strict';
// Dependency-free, READ-ONLY SQLite file reader (browser + Node, no wasm).
// Enough of the SQLite file format to pull rowid tables out of an Anki .apkg
// collection (`notes`, `col`). Implements: file header, varints, table b-tree
// traversal (interior + leaf), overflow chains, the record/serial-type codec,
// and INTEGER-PRIMARY-KEY-as-rowid aliasing. NOT a query engine — it walks a
// whole table's b-tree and hands back rows as arrays of JS values.
//
// Format reference: https://www.sqlite.org/fileformat2.html
// Caveats: 64-bit ints (serial types 5/6) are returned as JS Number, so values
// beyond ±2^53 lose precision. Index b-trees are never traversed (rowid tables
// only). Freelist / pointer-map / WAL / auto_vacuum pages are irrelevant to a
// pointer-driven table walk and are ignored.

const MAGIC = 'SQLite format 3\0';

// ---- varint: 1–9 bytes, big-endian 7-bit groups; 9th byte contributes all 8 bits ----
// returns [value:Number, bytesConsumed]. Values may exceed 2^53 (see caveat).
function readVarint(buf, off) {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    const byte = buf[off + i];
    result = result * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [result, i + 1];
  }
  // 9th byte: all 8 bits
  result = result * 256 + buf[off + 8];
  return [result, 9];
}

function u8ToString(u8) {
  // UTF-8 decode. TextDecoder exists in Node ≥11 and all target browsers.
  return new TextDecoder('utf-8').decode(u8);
}

// signed big-endian integer from `n` bytes. For n===8, float64 accumulation loses the low
// bits (2^64-1 rounds to 2^64, so -1 would decode to 0) — use BigInt for the 8-byte case and
// return a Number when it fits ±2^53 (all Anki columns do), else the BigInt.
function readSignedBE(buf, off, n) {
  if (n === 8) {
    let b = 0n;
    for (let i = 0; i < 8; i++) b = (b << 8n) | BigInt(buf[off + i]);
    if (b & 0x8000000000000000n) b -= 1n << 64n;   // two's-complement sign
    return (b >= -9007199254740991n && b <= 9007199254740991n) ? Number(b) : b;
  }
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + buf[off + i];
  const top = buf[off];
  if (top & 0x80) v -= Math.pow(2, 8 * n);   // sign-extend
  return v;
}

// ---- open: validate header, capture geometry ----
export function openSqlite(u8) {
  if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
  if (u8.length < 100) throw new Error('not a sqlite file');
  for (let i = 0; i < MAGIC.length; i++) {
    if (u8[i] !== MAGIC.charCodeAt(i)) throw new Error('not a sqlite file');
  }
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let pageSize = view.getUint16(16); // big-endian u16
  if (pageSize === 1) pageSize = 65536;
  const reserved = u8[20];
  const usable = pageSize - reserved;
  if (usable <= 35) throw new Error('bad page geometry');   // guards take<=0 overflow-loop hang (hostile reserved byte)
  const encoding = view.getUint32(56);
  if (encoding !== 1) throw new Error('unsupported text encoding (only UTF-8)');
  // bytes 18/19: file-format read/write version. 1 = legacy (rollback journal),
  // 2 = WAL. Anki exports are journal-mode, but accept both.
  const readVer = u8[19];
  if (readVer !== 1 && readVer !== 2) throw new Error('unsupported file format version');
  return { u8, view, pageSize, usable };
}

// page bytes for 1-based page number
function pageOffset(db, pageNumber) {
  return (pageNumber - 1) * db.pageSize;
}

// b-tree page header starts at 100 on page 1, else at the page start.
function headerOffset(db, pageNumber) {
  return pageNumber === 1 ? 100 : 0;
}

// ---- assemble a cell's full payload, following overflow chain if needed ----
// `payloadLen` = total record length (P). `localStart` = offset of payload start.
function readPayload(db, payloadLen, localStart) {
  const { u8, usable } = db;
  const U = usable;
  // hostile-input guard: a payload longer than the whole file is corrupt — reject BEFORE
  // allocating (a crafted varint could ask for gigabytes and OOM the tab).
  if (!(payloadLen >= 0) || payloadLen > u8.length) throw new Error('corrupt payload length');
  const X = U - 35; // table-leaf local-payload threshold
  if (payloadLen <= X) {
    return u8.subarray(localStart, localStart + payloadLen);
  }
  // overflow: compute local payload size per spec.
  const M = Math.floor(((U - 12) * 32) / 255) - 23;
  const K = M + ((payloadLen - M) % (U - 4));
  const local = K <= X ? K : M;
  const out = new Uint8Array(payloadLen);
  out.set(u8.subarray(localStart, localStart + local), 0);
  // 4-byte big-endian next-overflow-page pointer follows the local bytes.
  let filled = local;
  let nextPage = (u8[localStart + local] << 24) | (u8[localStart + local + 1] << 16) |
                 (u8[localStart + local + 2] << 8) | u8[localStart + local + 3];
  nextPage = nextPage >>> 0;
  const seen = new Set();   // hostile-input guard: an overflow chain that cycles (A→B→A) would hang forever
  while (nextPage !== 0 && filled < payloadLen) {
    if (seen.has(nextPage)) throw new Error('overflow chain cycle');
    seen.add(nextPage);
    const base = pageOffset(db, nextPage);
    if (base < 0 || base + 4 > u8.length) throw new Error('overflow page out of range');
    // first 4 bytes of an overflow page = next page pointer; then U-4 content bytes.
    const next = (u8[base] << 24) | (u8[base + 1] << 16) | (u8[base + 2] << 8) | u8[base + 3];
    const take = Math.min(U - 4, payloadLen - filled);
    if (take <= 0) throw new Error('overflow makes no progress');   // U>35 is enforced in openSqlite, but belt-and-braces
    out.set(u8.subarray(base + 4, base + 4 + take), filled);
    filled += take;
    nextPage = next >>> 0;
  }
  return out;
}

// ---- decode one record (payload) into an array of JS values ----
function decodeRecord(payload) {
  const [headerLen, hlBytes] = readVarint(payload, 0);
  const serials = [];
  let p = hlBytes;
  while (p < headerLen) {
    const [st, n] = readVarint(payload, p);
    serials.push(st);
    p += n;
  }
  // p now points at the body (== headerLen)
  const values = [];
  let body = headerLen;
  for (const st of serials) {
    if (st === 0) { values.push(null); continue; }
    if (st === 1) { values.push(readSignedBE(payload, body, 1)); body += 1; continue; }
    if (st === 2) { values.push(readSignedBE(payload, body, 2)); body += 2; continue; }
    if (st === 3) { values.push(readSignedBE(payload, body, 3)); body += 3; continue; }
    if (st === 4) { values.push(readSignedBE(payload, body, 4)); body += 4; continue; }
    if (st === 5) { values.push(readSignedBE(payload, body, 6)); body += 6; continue; }
    if (st === 6) { values.push(readSignedBE(payload, body, 8)); body += 8; continue; } // >2^53 loses precision
    if (st === 7) {
      // 8-byte big-endian IEEE-754 float
      const dv = new DataView(payload.buffer, payload.byteOffset + body, 8);
      values.push(dv.getFloat64(0, false));
      body += 8; continue;
    }
    if (st === 8) { values.push(0); continue; }
    if (st === 9) { values.push(1); continue; }
    // serial types 10,11 are reserved — treat as null (never appears in real files)
    if (st === 10 || st === 11) { values.push(null); continue; }
    const len = st >= 12 && st % 2 === 0 ? (st - 12) / 2 : (st - 13) / 2;
    const slice = payload.subarray(body, body + len);
    if (st % 2 === 0) {
      values.push(slice.slice()); // BLOB → copy to detach from big buffer
    } else {
      values.push(u8ToString(slice)); // TEXT (UTF-8)
    }
    body += len;
  }
  return values;
}

// ---- walk a table b-tree rooted at `rootpage`, emitting [rowid, values] ----
function walkTable(db, rootpage, emit, seen) {
  seen = seen || new Set();
  if (seen.has(rootpage)) return; // cycle guard (also bounds interior-tree recursion depth to the page count)
  seen.add(rootpage);
  const { u8, pageSize } = db;
  const base = pageOffset(db, rootpage);
  if (rootpage < 1 || base + pageSize > u8.length + pageSize) { /* last page may be short */ }
  if (base < 0 || base >= u8.length) throw new Error('page out of range');   // hostile child/rootpage pointer
  const hOff = base + headerOffset(db, rootpage);
  const type = u8[hOff];
  const view = new DataView(u8.buffer, u8.byteOffset);
  const cellCount = view.getUint16(hOff + 3);
  // cell content pointer array starts after the header (8 bytes leaf, 12 bytes interior).
  const headerSize = type === 0x05 ? 12 : 8;
  const ptrArray = hOff + headerSize;
  const pageEnd = base + pageSize;
  const cellOff = (i) => {   // validated cell offset — a hostile cellPtr/cellCount can't read OOB
    if (ptrArray + i * 2 + 2 > u8.length) throw new Error('cell pointer out of range');
    const off = base + view.getUint16(ptrArray + i * 2);
    if (off < hOff || off >= pageEnd) throw new Error('cell offset out of range');
    return off;
  };

  if (type === 0x0d) {
    // leaf table page
    for (let i = 0; i < cellCount; i++) {
      let off = cellOff(i);
      const [payloadLen, n1] = readVarint(u8, off); off += n1;
      const [rowid, n2] = readVarint(u8, off); off += n2;
      const payload = readPayload(db, payloadLen, off);
      emit(rowid, decodeRecord(payload));
    }
    return;
  }
  if (type === 0x05) {
    // interior table page: each cell = 4-byte left child page + rowid varint.
    for (let i = 0; i < cellCount; i++) {
      const off = cellOff(i);
      const child = view.getUint32(off); // 4-byte BE left-child page number
      walkTable(db, child, emit, seen);
    }
    // right-most pointer lives in the interior header at hOff+8.
    const rightMost = view.getUint32(hOff + 8);
    walkTable(db, rightMost, emit, seen);
    return;
  }
  // 0x02 / 0x0a are index pages — a rowid-table walk never lands here. Skip.
}

// ---- sqlite_master (page 1): [{name, rootpage, sql}] for type='table' ----
export function sqliteTables(db) {
  const out = [];
  walkTable(db, 1, (_rowid, cols) => {
    // schema table columns: (type, name, tbl_name, rootpage, sql)
    const [type, name, , rootpage, sql] = cols;
    if (type === 'table') out.push({ name, rootpage, sql: sql == null ? '' : sql });
  });
  return out;
}

// detect the INTEGER PRIMARY KEY column index from CREATE TABLE sql (rowid alias).
// Good enough for Anki schemas: split the column list on top-level commas, find
// the column whose definition matches /integer primary key/i, return its index.
function ipkColumnIndex(sql) {
  if (!sql) return -1;
  const open = sql.indexOf('(');
  const close = sql.lastIndexOf(')');
  if (open < 0 || close < 0) return -1;
  const inner = sql.slice(open + 1, close);
  // split on commas not inside parentheses
  const cols = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { cols.push(inner.slice(start, i)); start = i + 1; }
  }
  cols.push(inner.slice(start));
  for (let i = 0; i < cols.length; i++) {
    const def = cols[i].trim();
    // skip table-level constraints (PRIMARY KEY (...), UNIQUE, etc.)
    if (/^(primary\s+key|unique|check|foreign\s+key|constraint)\b/i.test(def)) continue;
    if (/\binteger\s+primary\s+key\b/i.test(def)) return i;
  }
  return -1;
}

// ---- rows of one table as arrays of JS values in column order ----
export function sqliteRows(db, tableName) {
  const tbl = sqliteTables(db).find((t) => t.name === tableName);
  if (!tbl) throw new Error(`table not found: ${tableName}`);
  const ipk = ipkColumnIndex(tbl.sql);
  const rows = [];
  walkTable(db, tbl.rootpage, (rowid, cols) => {
    // rowid alias: an INTEGER PRIMARY KEY column is stored as NULL; substitute rowid.
    if (ipk >= 0 && (ipk >= cols.length || cols[ipk] == null)) {
      while (cols.length <= ipk) cols.push(null);
      cols[ipk] = rowid;
    }
    rows.push(cols);
  });
  return rows;
}
