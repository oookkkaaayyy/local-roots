import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const snapshotRoot = path.dirname(root);
const publicRoot = path.join(snapshotRoot, 'public');
const manifestPath = path.join(root, 'LOCAL_ASSET_SHA256SUMS');
const manifest = readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/);
const expected = new Map();

for (const line of manifest) {
  const match = line.match(/^([a-f\d]{64})\s+(.+)$/i);
  assert.ok(match, `invalid SHA-256 manifest line: ${line}`);
  const [, hash, relativePath] = match;
  assert.ok(relativePath.startsWith('public/'), `manifest path is outside public/: ${relativePath}`);
  assert.ok(!relativePath.split(/[\\/]/).includes('..'), `manifest path escapes snapshot: ${relativePath}`);
  assert.ok(!expected.has(relativePath), `duplicate manifest path: ${relativePath}`);
  expected.set(relativePath, hash.toLowerCase());
}

for (const relativePath of expected.keys()) {
  const filePath = path.join(snapshotRoot, relativePath);
  assert.ok(filePath.startsWith(`${snapshotRoot}${path.sep}`), `asset path escapes snapshot: ${relativePath}`);
  assert.ok(statSync(filePath).isFile(), `asset is not a file: ${relativePath}`);
  const actualHash = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  assert.equal(actualHash, expected.get(relativePath), `asset hash mismatch: ${relativePath}`);
}

// The source tree also carries local-only review pages and parser modules.
// Release packaging deliberately selects only the pinned asset manifest.
assert.equal(expected.size, 44, 'production asset allowlist must remain exactly 44 entries');

console.log(JSON.stringify({ result: 'PASS', localSnapshotAssets: expected.size, providerParity: 'NOT_ESTABLISHED' }, null, 2));
