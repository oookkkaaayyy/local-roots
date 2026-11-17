#!/usr/bin/env node
// Usage: node scripts/du-cut-sheet.mjs out-dir   (writes cut-sheet.svg and legend.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildCutSheet } from '../src/lib/duCutSheet.mjs';
const out = process.argv[2]; if (!out) { console.error('usage: du-cut-sheet.mjs out-dir'); process.exit(2); }
mkdirSync(out, { recursive: true });
const sheet = buildCutSheet();
writeFileSync(path.join(out, 'cut-sheet.svg'), sheet.svg);
writeFileSync(path.join(out, 'legend.json'), JSON.stringify(sheet.legend, null, 2));
console.log(`cut-sheet.svg ${sheet.widthMm} x ${sheet.heightMm} mm`);
