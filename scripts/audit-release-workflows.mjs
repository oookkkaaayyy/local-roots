#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowDir = path.resolve(process.env.RELEASE_WORKFLOW_DIR || '.github/workflows');
const files = (await readdir(workflowDir)).filter(name => /\.ya?ml$/i.test(name)).sort();
const mutationPatterns = [
  /\bwrangler\s+(?:deploy|versions\s+deploy)\b/i,
  /\bsupabase\s+(?:functions\s+deploy|db\s+push)\b/i,
  /\bfirebase\s+(?:deploy|hosting:channel:deploy)\b/i,
  /\b(?:cloudflare\s+pages|pages)\s+deploy\b/i,
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:deploy|publish)\b/i,
  /\bvercel\s+deploy\b/i,
  /\bnetlify\s+deploy\b/i,
  /\bgcloud\s+(?:run|functions)\s+deploy\b/i,
  /\baws\s+(?:cloudformation\s+deploy|s3\s+sync|lambda\s+update-function-code)\b/i,
  /\bdocker\s+push\b/i,
  /\bkubectl\s+(?:apply|set\s+image)\b/i,
  /\bhelm\s+upgrade\b/i,
  /\bgh\s+release\s+(?:create|upload)\b/i,
  /\b(?:idf\.py\s+flash|esptool(?:\.py)?\s+(?:write_flash|write-flash)|(?:pio|platformio)\s+run\b.*--target\s+upload|arduino-cli\s+upload|west\s+flash|dfu-util\s+-D|avrdude\b)/i,
];
const errors = [];

for (const file of files) {
  const source = (await readFile(path.join(workflowDir, file), 'utf8'))
    .split(/\r?\n/)
    .filter(line => !/^\s*#/u.test(line))
    .join('\n');
  const mutations = mutationPatterns.filter(pattern => pattern.test(source));
  if (mutations.length === 0) continue;

  if (!source.includes('npm run release:admit')) {
    errors.push(file + ': live mutation command detected without npm run release:admit');
  }
  if (!source.includes('npm run release:verify')) {
    errors.push(file + ': live mutation command detected without npm run release:verify');
  }
}

if (errors.length) {
  console.error('Release workflow policy: FAIL');
  for (const error of errors) console.error('- ' + error);
  process.exitCode = 1;
} else {
  console.log('Release workflow policy: PASS (' + files.length + ' workflow files inspected; recognized deployment, publication, and firmware-write commands require both two-phase receipt commands)');
}
