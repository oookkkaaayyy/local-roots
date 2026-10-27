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
const admitPattern = /npm\s+run\s+release:admit\s+--\s+([^\r\n#]+)/gi;
const verifyPattern = /npm\s+run\s+release:verify\s+--\s+([^\r\n#]+)/gi;
const errors = [];

function commands(source, pattern) {
  return [...source.matchAll(pattern)].map(match => ({
    position: match.index,
    args: match[1].trim(),
  }));
}

for (const file of files) {
  const source = (await readFile(path.join(workflowDir, file), 'utf8'))
    .split(/\r?\n/)
    .filter(line => !/^\s*#/u.test(line))
    .join('\n');
  const mutations = mutationPatterns.flatMap(pattern => {
    const globalPattern = new RegExp(pattern.source, 'gi');
    return [...source.matchAll(globalPattern)].map(match => ({ position: match.index, command: match[0] }));
  }).sort((a, b) => a.position - b.position);
  if (mutations.length === 0) continue;

  const admissions = commands(source, admitPattern);
  const closeouts = commands(source, verifyPattern);
  for (const mutation of mutations) {
    const validPair = admissions.some(admission =>
      admission.position < mutation.position &&
      closeouts.some(closeout =>
        closeout.position > mutation.position && closeout.args === admission.args));
    if (!validPair) {
      errors.push(file + ': ' + mutation.command +
        ' must be between release:admit and release:verify commands using the same receipt and root arguments');
    }
  }
}

if (errors.length) {
  console.error('Release workflow policy: FAIL');
  for (const error of errors) console.error('- ' + error);
  process.exitCode = 1;
} else {
  console.log('Release workflow policy: PASS (' + files.length + ' workflow files inspected; recognized mutations are ordered between same-receipt two-phase gate commands)');
}
