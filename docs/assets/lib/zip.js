'use strict';
// Dependency-free ZIP reader for selective media extraction from .apkg archives.
// Central-directory driven (never trusts local headers/data descriptors). Handles
// stored (0) + deflate (8) only; inflate via the DecompressionStream global (Node ≥22
// AND browsers). ZIP64 is NOT supported. No CRC verification (length check only).

const SIG_EOCD = 0x06054b50;   // PK\x05\x06 end of central directory
const SIG_CD   = 0x02014b50;   // PK\x01\x02 central-directory file header
const SIG_LOCAL = 0x04034b50;  // PK\x03\x04 local file header

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

  // EOCD: scan backwards from the end for the signature. Comment ≤ 65535, so bound the scan.
  const min = Math.max(0, u8.length - 22 - 0xffff);
  let eocd = -1;
  for (let p = u8.length - 22; p >= min; p--) {
    if (u32(u8, p) === SIG_EOCD) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');

  const count = u16(u8, eocd + 10);   // total entries this disk
  const cdOff = u32(u8, eocd + 16);   // offset of central directory
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
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([comp]).stream().pipeThrough(ds);
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length !== entry.size) throw new Error('size mismatch for ' + entry.name);
  return out;
}
