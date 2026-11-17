#!/usr/bin/env node
// Usage: node scripts/du-stencil-repair.mjs in.png out.png [--width-mm 190.5] [--report out.json]
// Thresholds to a binary mask (white = retained vinyl), bridges or removes failing islands, writes PNG and report.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePngToMask, encodeMaskToPng } from '../src/lib/pngMask.mjs';
import { repairIslands } from '../src/lib/duStencilConstraints.mjs';

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args.splice(i, 2)[1]; };
const widthMm = Number(flag('--width-mm', 190.5)), reportPath = flag('--report', null);
const [inp, out] = args;
if (!inp || !out) { console.error('usage: du-stencil-repair.mjs in.png out.png [--width-mm N] [--report file.json]'); process.exit(2); }
const { mask, width, height } = decodePngToMask(readFileSync(inp));
const r = repairIslands(mask, width, height, widthMm / width);
writeFileSync(out, encodeMaskToPng(r.mask, width, height));
const report = { input: inp, output: out, widthPx: width, heightPx: height, mmPerPx: widthMm / width, repairs: r.log, before: { failingIslands: r.before.failingIslands, thinWhiteAreaMm2: r.before.thinWhiteAreaMm2 }, after: { failingIslands: r.after.failingIslands, thinWhiteAreaMm2: r.after.thinWhiteAreaMm2, verdict: r.after.verdict } };
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2)); else console.log(JSON.stringify(report, null, 2));
process.exit(r.after.failingIslands === 0 ? 0 : 1);
