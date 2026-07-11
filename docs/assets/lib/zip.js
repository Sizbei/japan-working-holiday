'use strict';
// Dependency-free ZIP reader for selective media extraction from .apkg archives.
// Central-directory driven (never trusts local headers/data descriptors). Handles
// stored (0) + deflate (8) only; inflate via the DecompressionStream global (Node ≥22
// AND browsers). ZIP64 is NOT supported. No CRC verification (length check only).

const SIG_EOCD = 0x06054b50;   // PK\x05\x06 end of central directory
const SIG_CD   = 0x02014b50;   // PK\x01\x02 central-directory file header
const SIG_LOCAL = 0x04034b50;  // PK\x03\x04 local file header
const ENTRY_CAP = 512 * 1024 * 1024;   // 512MB single-entry inflate cap (zip-bomb guard); a real Anki collection.anki2 is well under this

const utf8 = new TextDecoder('utf-8');

// little-endian readers over a Uint8Array
const u16 = (u8, p) => u8[p] | (u8[p + 1] << 8);
const u32 = (u8, p) => (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)) >>> 0;

/**
 * List entries via the central directory.
 * @param {Uint8Array} u8
 * @returns {{name,method,size,csize,offset}[]}
 */
export function listZip(u8) {
  if (!(u8 instanceof Uint8Array) || u8.length < 22) throw new Error('not a zip (too small)');

  // EOCD: scan backwards for the signature. Comment ≤ 65535, so bound the scan. A valid ZIP
  // comment (or trailing junk) can itself CONTAIN the EOCD bytes — so don't trust the first
  // hit: require the record's own invariants (comment length reaches EOF, CD offset+size land
  // exactly here). Keep scanning past a false positive.
  const min = Math.max(0, u8.length - 22 - 0xffff);
  let eocd = -1, count = 0, cdOff = 0;
  for (let p = u8.length - 22; p >= min; p--) {
    if (u32(u8, p) !== SIG_EOCD) continue;
    const commentLen = u16(u8, p + 20);
    if (p + 22 + commentLen !== u8.length) continue;   // comment must run exactly to EOF
    const c = u16(u8, p + 10), off = u32(u8, p + 16), size = u32(u8, p + 12);
    if (off !== 0xffffffff && size !== 0xffffffff && off + size <= p) { eocd = p; count = c; cdOff = off; break; }
    if (c === 0xffff || off === 0xffffffff) { eocd = p; count = c; cdOff = off; break; }   // zip64 sentinel — let the check below throw
  }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error('zip64 unsupported');

  const entries = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || u32(u8, p) !== SIG_CD) throw new Error('bad central directory');
    const method = u16(u8, p + 10);
    const csize  = u32(u8, p + 20);
    const size   = u32(u8, p + 24);
    const nLen   = u16(u8, p + 28);
    const eLen   = u16(u8, p + 30);
    const cLen   = u16(u8, p + 32);
    const offset = u32(u8, p + 42);   // offset of LOCAL header
    if (size === 0xffffffff || csize === 0xffffffff || offset === 0xffffffff) throw new Error('zip64 unsupported');
    if (method !== 0 && method !== 8) throw new Error('unsupported compression method ' + method);
    // Name is bytes p+46 .. +nLen; bit-11 flags UTF-8 but ZIP text is UTF-8 in practice either way.
    const name = utf8.decode(u8.subarray(p + 46, p + 46 + nLen));
    entries.push({ name, method, size, csize, offset });
    p += 46 + nLen + eLen + cLen;
  }
  return entries;
}

/**
 * Extract ONE entry's decompressed bytes lazily.
 * @param {Uint8Array} u8
 * @param {{name,method,size,csize,offset}} entry
 * @returns {Promise<Uint8Array>}
 */
export async function readZipEntry(u8, entry) {
  const p = entry.offset;
  if (p + 30 > u8.length || u32(u8, p) !== SIG_LOCAL) throw new Error('bad local header for ' + entry.name);
  // Local name/extra lengths can DIFFER from the CD — always read them here.
  const nLen = u16(u8, p + 26);
  const eLen = u16(u8, p + 28);
  const start = p + 30 + nLen + eLen;
  const end = start + entry.csize;
  if (end > u8.length) throw new Error('truncated entry ' + entry.name);
  const comp = u8.subarray(start, end);

  if (entry.method === 0) {
    // stored: copy out (subarray shares the parent buffer; return an independent copy)
    const out = comp.slice();
    if (out.length !== entry.size) throw new Error('size mismatch for ' + entry.name);
    return out;
  }

  // deflate: inflate raw. Empty payloads have no deflate stream — short-circuit.
  if (entry.size === 0) return new Uint8Array(0);
  // zip-bomb guard: reject an entry claiming an absurd inflated size BEFORE decompressing,
  // and cap what we read as it streams (a lying CD size + a real bomb both die here, not in OOM).
  if (entry.size > ENTRY_CAP) throw new Error('entry too large: ' + entry.name);
  const out = new Uint8Array(entry.size);
  let n = 0;
  try {
    const ds = new DecompressionStream('deflate-raw');
    const reader = new Blob([comp]).stream().pipeThrough(ds).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (n + value.length > entry.size) { await reader.cancel(); throw new Error('inflate overran'); }
      out.set(value, n); n += value.length;
    }
  } catch (e) { throw new Error('inflate failed for ' + entry.name + (e && e.message ? ': ' + e.message : '')); }   // platform DecompressionStream throws a blank-message TypeError on truncated data
  if (n !== entry.size) throw new Error('size mismatch for ' + entry.name);
  return out;
}
