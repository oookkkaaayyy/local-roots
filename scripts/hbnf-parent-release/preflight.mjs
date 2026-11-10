import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAuthenticatedReadAdapters } from './providers.mjs';
import { providerBoundPreflight } from './driver.mjs';

const input = process.argv[2];
if (!input) { process.stderr.write('Usage: node scripts/hbnf-parent-release/preflight.mjs <parent-transaction.json>\n'); process.exit(2); }
try {
  const transaction = JSON.parse(await readFile(resolve(input), 'utf8'));
  const adapters = createAuthenticatedReadAdapters();
  const result = await providerBoundPreflight(transaction, adapters, adapters);
  process.stdout.write(JSON.stringify({ status: result.status, preflightStatus: result.preflightStatus || 'NOT_RUN', admission: result.admission || 'NOT_ADMITTED', errors: result.errors || [], evidenceId: result.evidence?.id || null, evidenceSha256: result.evidence?.sha256 || null }) + '\n');
  if (result.status !== 'PENDING' || result.preflightStatus !== 'PASS') process.exitCode = 1;
} catch (error) {
  process.stderr.write(`PREFLIGHT_FAILED:${/^[A-Z0-9_: -]+$/.test(error.message) ? error.message : 'UNEXPECTED_ERROR'}\n`);
  process.exitCode = 1;
}
