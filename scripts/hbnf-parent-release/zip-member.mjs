// Read-only extraction of one exact ZIP member for artifact integrity verification.
// Never writes extracted bytes to disk. Fails closed for encrypted, Zip64,
// multi-disk, ambiguous or oversized inputs. Only stored/deflated ZIP entries.
import { inflateRawSync } from 'node:zlib';

const fail = why => { throw new Error('ZIP_MEMBER_REJECTED:' + why); };
export function readZipMember(archive, memberName, maxUncompressedBytes = 20 * 1024 * 1024) {
  const bytes = Buffer.from(archive);
  if (!memberName || memberName.startsWith('/') || memberName.includes(String.fromCharCode(92)) || memberName.split('/').includes('..')) fail('unsafe-member-name');
  const scan = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= scan; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0) fail('end-of-central-directory-missing');
  if (bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) fail('multi-disk');
  const entries = bytes.readUInt16LE(eocd + 10), cdSize = bytes.readUInt32LE(eocd + 12), cdOff = bytes.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) fail('zip64-not-supported');
  if (cdOff + cdSize > eocd) fail('bad-central-directory');
  let pos = cdOff, found;
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > cdOff + cdSize || bytes.readUInt32LE(pos) !== 0x02014b50) fail('malformed-central-record');
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    const compressedSize = bytes.readUInt32LE(pos + 20), plainSize = bytes.readUInt32LE(pos + 24);
    const nameLen = bytes.readUInt16LE(pos + 28), extraLen = bytes.readUInt16LE(pos + 30), commentLen = bytes.readUInt16LE(pos + 32);
    const local = bytes.readUInt32LE(pos + 42);
    const end = pos + 46 + nameLen + extraLen + commentLen;
    if (end > cdOff + cdSize) fail('central-record-out-of-bounds');
    const name = bytes.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    if (name === memberName) {
      if (found) fail('duplicate-member-name');
      if (flags & 1) fail('encrypted');
      if (![0, 8].includes(method)) fail('unsupported-compression');
      if (compressedSize === 0xffffffff || plainSize === 0xffffffff) fail('zip64-member');
      if (plainSize > maxUncompressedBytes) fail('oversized-member');
      if (local + 30 > cdOff || bytes.readUInt32LE(local) !== 0x04034b50) fail('invalid-local-record');
      const localNameLen = bytes.readUInt16LE(local + 26), localExtraLen = bytes.readUInt16LE(local + 28);
      const localName = bytes.subarray(local + 30, local + 30 + localNameLen).toString('utf8');
      if (localName !== name) fail('local-name-mismatch');
      const start = local + 30 + localNameLen + localExtraLen;
      if (start + compressedSize > cdOff) fail('compressed-data-out-of-bounds');
      const compressed = bytes.subarray(start, start + compressedSize);
      const plain = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: maxUncompressedBytes + 1 });
      if (plain.length !== plainSize) fail('uncompressed-size-mismatch');
      found = plain;
    }
    pos = end;
  }
  if (pos !== cdOff + cdSize) fail('central-directory-size-mismatch');
  if (!found) fail('member-not-found');
  return found;
}
