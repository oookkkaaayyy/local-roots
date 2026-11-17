import { compileStencil, normalizeArtwork, maskToCutSvg, buildValidatorReport, type CompileResult } from './duStencilCompiler.mjs';

const MAX_WIDTH_PX = 2400;

export type CompiledStencil = {
  result: CompileResult; width: number; height: number; mmPerPx: number;
  png: Blob; pngSha256: string; svg: string; report: Record<string, any>;
  beforeUrl: string; afterUrl: string; changeUrl: string;
};

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function paint(width: number, height: number, pixel: (i: number) => [number, number, number]) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) { const [r, g, b] = pixel(i); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG.'))), 'image/png'));

export async function compileMasterImage(source: Blob, label: string): Promise<CompiledStencil> {
  const bitmap = await createImageBitmap(source);
  const scale = bitmap.width > MAX_WIDTH_PX ? MAX_WIDTH_PX / bitmap.width : 1;
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bitmap, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data, lum = new Uint8Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  const norm = normalizeArtwork(lum, w, h);
  await new Promise((resolve) => setTimeout(resolve, 30)); // let the page paint before the heavy step
  const result = compileStencil(norm.mask, norm.width, norm.height, norm.mmPerPx);
  const out = paint(norm.width, norm.height, (i) => (result.mask[i] ? [255, 255, 255] : [0, 0, 0]));
  const png = await toBlob(out), pngSha256 = await sha256Hex(await png.arrayBuffer());
  const before = paint(norm.width, norm.height, (i) => (norm.mask[i] ? [255, 255, 255] : [0, 0, 0]));
  const change = paint(norm.width, norm.height, (i) => {
    const a = norm.mask[i], b = result.mask[i];
    if (a === b) return b ? [235, 235, 235] : [40, 40, 40];
    return a ? [230, 40, 60] : [40, 120, 235]; // red: vinyl removed, blue: vinyl added
  });
  const report = buildValidatorReport({ label, mm: norm.mmPerPx, width: norm.width, height: norm.height, result, sourceSha256: pngSha256 });
  return { result, width: norm.width, height: norm.height, mmPerPx: norm.mmPerPx, png, pngSha256, svg: maskToCutSvg(result.mask, norm.width, norm.height, norm.mmPerPx), report, beforeUrl: before.toDataURL('image/png'), afterUrl: out.toDataURL('image/png'), changeUrl: change.toDataURL('image/png') };
}

export async function svgFromStencilPng(source: Blob): Promise<string> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data, lum = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < lum.length; i++) lum[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  const norm = normalizeArtwork(lum, canvas.width, canvas.height);
  return maskToCutSvg(norm.mask, norm.width, norm.height, norm.mmPerPx);
}
