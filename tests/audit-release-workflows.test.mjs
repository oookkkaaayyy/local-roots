import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/audit-release-workflows.mjs', import.meta.url));

async function runAudit(workflowText) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-workflow-audit-'));
  const workflowDir = path.join(root, 'workflows');
  await mkdir(workflowDir);
  await writeFile(path.join(workflowDir, 'release.yml'), workflowText);
  try {
    return spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { ...process.env, RELEASE_WORKFLOW_DIR: workflowDir },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('ignores deployment-like commands in YAML comments', async () => {
  const result = await runAudit('# supabase functions deploy production\nname: checks\non: push\n');
  assert.equal(result.status, 0, result.stderr);
});

test('fails a Supabase deployment workflow without either gate phase', async () => {
  const result = await runAudit('name: deploy\njobs:\n  deploy:\n    steps:\n      - run: supabase functions deploy app\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release:admit/);
  assert.match(result.stderr, /release:verify/);
});

test('fails firmware flashing without the two-phase gate', async () => {
  const result = await runAudit('name: flash\njobs:\n  flash:\n    steps:\n      - run: esptool.py write_flash 0x0 firmware.bin\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release:admit/);
  assert.match(result.stderr, /release:verify/);
});

test('fails common package and Pages deployment commands without the gate', async () => {
  for (const command of ['npm run deploy:production', 'wrangler pages deploy dist']) {
    const result = await runAudit('name: deploy\njobs:\n  deploy:\n    steps:\n      - run: ' + command + '\n');
    assert.equal(result.status, 1, command);
  }
});

test('rejects admission or closeout commands placed on the wrong side of deployment', async () => {
  const result = await runAudit([
    'name: deploy',
    'jobs:',
    '  deploy:',
    '    steps:',
    '      - run: supabase functions deploy app',
    '      - run: npm run release:admit -- receipt.json receipt-root',
    '      - run: npm run release:verify -- receipt.json receipt-root',
  ].join('\n'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be between/);
});

test('rejects mismatched admission and closeout receipt arguments', async () => {
  const result = await runAudit([
    'name: deploy',
    'jobs:',
    '  deploy:',
    '    steps:',
    '      - run: npm run release:admit -- receipt-a.json receipt-root',
    '      - run: supabase functions deploy app',
    '      - run: npm run release:verify -- receipt-b.json receipt-root',
  ].join('\n'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /same receipt and root/);
});

test('passes only after both admission and closeout commands are present', async () => {
  const result = await runAudit([
    'name: deploy',
    'jobs:',
    '  deploy:',
    '    steps:',
    '      - run: npm run release:admit -- receipt.json receipt-root',
    '      - run: supabase functions deploy app',
    '      - run: npm run release:verify -- receipt.json receipt-root',
  ].join('\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
});
