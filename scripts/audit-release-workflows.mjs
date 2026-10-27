#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowDir = path.resolve('.github/workflows');
const files = (await readdir(workflowDir)).filter(name => /\.ya?ml$/i.test(name)).sort();
const mutationPatterns = [
  /\bwrangler\s+(?:deploy|versions\s+deploy)\b/i,
  /\bsupabase\s+(?:functions\s+deploy|db\s+push)\b/i,
  /\bfirebase\s+deploy\b/i,
  /\b(?:cloudflare\s+pages|pages)\s+deploy\b/i,
  /\bnpm\s+publish\b/i,
  /\bkubectl\s+apply\b/i,
  /\bhelm\s+upgrade\b/i,
  /\bgh\s+release\s+create\b/i,
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
    errors.push(\`${file}: live mutation command detected without npm run release:admit\`);
  }
  if (!source.includes('npm run release:verify')) {
    errors.push(\`${file}: live mutation command detected without npm run release:verify\`);
  }
}

if (errors.length) {
  console.error('Release workflow policy: FAIL');
  for (const error of errors) console.error(\`- ${error}\`);
  process.exitCode = 1;
} else {
  console.log(\`Release workflow policy: PASS (${files.length} workflow files inspected; any recognized live mutation must include both two-phase receipt commands)\`);
}
