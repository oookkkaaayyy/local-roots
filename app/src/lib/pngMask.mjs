import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Decode an 8-bit, non-interlaced PNG (gray, gray+alpha, RGB, RGBA) to a 1-bit mask (1 = light).
export function decodePngToMask(buf, threshold = 128) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('Not a PNG');
  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 4, 6].includes(ctype)) throw new Error('Unsupported PNG: need 8-bit, non-interlaced gray/RGB');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype], stride = w * ch;
  const raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? px[dst + i - ch] : 0, b = y ? px[dst - stride + i] : 0, c = i >= ch && y ? px[dst - stride + i - ch] : 0;
      let v = raw[src + i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error('Bad PNG filter');
      px[dst + i] = v & 255;
    }
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * ch; let g = ch >= 3 ? (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000 : px[o];
    if (ch === 2 || ch === 4) { const al = px[o + ch - 1] / 255; g = g * al + 255 * (1 - al); }
    mask[i] = g >= threshold ? 1 : 0;
  }
  return { mask, width: w, height: h };
}

export function encodeMaskToPng(mask, w, h) {
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = mask[y * w + x] ? 255 : 0;
  const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
