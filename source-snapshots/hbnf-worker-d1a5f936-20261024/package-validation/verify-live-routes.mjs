import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const snapshotRoot = path.dirname(root);
const assetRoot = path.join(snapshotRoot, 'public');
const baseUrl = 'https://hbnightflyers.com/';
const routes = [
  ['admin', 'admin.html'],
  ['cart', 'cart.html'],
  ['glow', 'glow.html'],
  ['hbnf-cart.html', 'hbnf-cart.html'],
  ['', 'index.html'],
  ['matrix', 'matrix.html'],
  ['random', 'random.html'],
  ['skills', 'skills.html'],
  ['skins', 'skins.html'],
];
const challengeStart = '<script>(function(){function c(){var b=a.contentDocument';

export function normalizeObservedHtmlResponse(body) {
  const start = body.indexOf(challengeStart);
  if (start < 0 || body.indexOf(challengeStart, start + challengeStart.length) >= 0) {
    return { body, removedChallenge: false };
  }

  const end = body.indexOf('</script>', start);
  if (end < 0) return { body, removedChallenge: false };
  const blockEnd = end + '</script>'.length;
  const challenge = body.slice(start, blockEnd);
  const isCloudflareChallenge = challenge.includes('__CF$cv$params')
    && challenge.includes('/cdn-cgi/challenge-platform/scripts/');
  if (!isCloudflareChallenge) return { body, removedChallenge: false };

  return {
    body: `${body.slice(0, start)}${body.slice(blockEnd)}`,
    removedChallenge: true,
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function compareLiveRoutes(fetchImpl = fetch) {
  const results = [];
  for (const [route, asset] of routes) {
    const url = new URL(route, baseUrl);
    const local = readFileSync(path.join(assetRoot, asset));
    const response = await fetchImpl(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
    const responseBytes = Buffer.from(await response.arrayBuffer());
    const normalized = normalizeObservedHtmlResponse(responseBytes.toString('utf8'));
    const normalizedBytes = Buffer.from(normalized.body);
    results.push({
      route: `/${route}`,
      status: response.status,
      removedAppendedCloudflareChallenge: normalized.removedChallenge,
      liveSha256: sha256(normalizedBytes),
      snapshotSha256: sha256(local),
      matchesObservedSnapshot: response.ok && normalizedBytes.equals(local),
    });
  }
  return results;
}

async function main() {
  const results = await compareLiveRoutes();
  const matches = results.filter((result) => result.matchesObservedSnapshot).length;
  const report = {
    result: matches === results.length ? 'PASS' : 'DIFFERENCES_FOUND',
    evidenceLevel: 'read-only HTTP response comparison',
    activeWorkerDeploymentLineage: 'NOT_ESTABLISHED',
    matchingRoutes: matches,
    totalRoutes: results.length,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (matches !== results.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
