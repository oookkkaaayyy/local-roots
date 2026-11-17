#!/usr/bin/env node
// Usage: node scripts/du-stencil-compile.mjs in.png out-dir [--label NAME]
// Writes compiled.png, cut.svg and report.json using the same compiler the Dye Studio page runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { decodePngToMask, encodeMaskToPng } from '../src/lib/pngMask.mjs';
import { compileStencil, maskToCutSvg, buildValidatorReport, normalizeArtwork } from '../src/lib/duStencilCompiler.mjs';

const args = process.argv.slice(2), i = args.indexOf('--label'), label = i < 0 ? 'cli' : args.splice(i, 2)[1];
const [inp, outDir] = args;
if (!inp || !outDir) { console.error('usage: du-stencil-compile.mjs in.png out-dir [--label NAME]'); process.exit(2); }
const { mask, width, height } = decodePngToMask(readFileSync(inp));
const lum = new Uint8Array(width * height); for (let k = 0; k < lum.length; k++) lum[k] = mask[k] ? 255 : 0;
const n = normalizeArtwork(lum, width, height);
const result = compileStencil(n.mask, n.width, n.height, n.mmPerPx);
const png = encodeMaskToPng(result.mask, n.width, n.height);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'compiled.png'), png);
writeFileSync(path.join(outDir, 'cut.svg'), maskToCutSvg(result.mask, n.width, n.height, n.mmPerPx));
const report = buildValidatorReport({ label, mm: n.mmPerPx, width: n.width, height: n.height, result, sourceSha256: createHash('sha256').update(png).digest('hex') });
writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(result.verdict, JSON.stringify({ change: result.fidelity.level, islands: result.validation.islandFails.length, necks: result.validation.necks.length }));
process.exit(result.verdict === 'PASS' ? 0 : 1);
