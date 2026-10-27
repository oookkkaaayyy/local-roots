#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowDir = path.resolve(process.env.RELEASE_WORKFLOW_DIR || '.github/workflows');
const files = (await readdir(workflowDir)).filter(name => /\.ya?ml$/i.test(name)).sort();
  /^\s*uses:\s*[^\r\n#]*(?:\bdeploy\b|pages-action|wrangler-action|github-pages-deploy-action|actions-gh-pages|vercel-action|netlify-action|workers-action)[^\r\n#]*/im,
  /^\\s*uses:\\s*[^\\r\\n#]*(?:\\bdeploy\\b|pages-action|wrangler-action|github-pages-deploy-action|actions-gh-pages|vercel-action|netlify-action|workers-action)[^\\r\\n#]*/im,
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

function findMutations(source) {
  return mutationPatterns.flatMap(pattern => {
    const globalPattern = new RegExp(pattern.source, 'gi');
    return [...source.matchAll(globalPattern)].map(match => ({ position: match.index, command: match[0] }));
  }).sort((a, b) => a.position - b.position);
}

function findJobs(source) {
  const jobsMatch = source.match(/^jobs:\s*\r?\n([\s\S]*)$/m);
  if (!jobsMatch) return [];
  const jobs = [];
  let currentName = null;
  let currentLines = [];
  for (const line of jobsMatch[1].split(/\r?\n/)) {
    if (/^[^\s#]/u.test(line)) break;
    const start = line.match(/^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$/u);
    if (start) {
      if (currentName) jobs.push({ name: currentName, source: currentLines.join('\n') });
      currentName = start[1];
      currentLines = [line];
    } else if (currentName) {
      currentLines.push(line);
    }
  }
  if (currentName) jobs.push({ name: currentName, source: currentLines.join('\n') });
  return jobs;
}

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
  const allMutations = findMutations(source);
  if (allMutations.length === 0) continue;

  const jobs = findJobs(source);
  if (!jobs.length) {
    errors.push(file + ': recognized mutation command is not inside an auditable GitHub Actions job');
    continue;
  }
  const jobMutations = jobs.flatMap(job =>
    findMutations(job.source).map(mutation => ({ ...mutation, job: job.name })));
  if (jobMutations.length !== allMutations.length) {
    errors.push(file + ': could not associate every recognized mutation with a GitHub Actions job');
  }

  for (const job of jobs) {
    const mutations = findMutations(job.source);
    if (!mutations.length) continue;
    const admissions = commands(job.source, admitPattern);
    const closeouts = commands(job.source, verifyPattern);
    for (const mutation of mutations) {
      const validPair = admissions.some(admission =>
        admission.position < mutation.position &&
        closeouts.some(closeout =>
          closeout.position > mutation.position && closeout.args === admission.args));
      if (!validPair) {
        errors.push(file + ' job ' + job.name + ': ' + mutation.command +
          ' must be between release:admit and release:verify in the same job, using identical receipt/root arguments');
      }
    }
  }
}

if (errors.length) {
  console.error('Release workflow policy: FAIL');
  for (const error of errors) console.error('- ' + error);
  process.exitCode = 1;
} else {
  console.log('Release workflow policy: PASS (' + files.length + ' workflow files inspected; recognized mutations are ordered between same-job, same-receipt two-phase gate commands)');
}
