import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/public/skins.html', import.meta.url);
const html = readFileSync(fileURLToPath(root), 'utf8');

assert.match(html, /<span class="pill" id="syncStatus" role="status" aria-live="polite">/);
assert.match(html, /@media\(max-width:760px\)\{\.sync-status-strip\{width:calc\(100% - 32px\)[^}]*\}\.sync-status-strip #syncStatus\{[^}]*max-width:100%[^}]*white-space:normal[^}]*overflow-wrap:anywhere[^}]*\}\}/,
  'the long accessible save status must wrap inside the narrow mobile content width');
