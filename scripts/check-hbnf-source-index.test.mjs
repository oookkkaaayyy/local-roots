import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const checkerSource = readFileSync(join(here, 'check-hbnf-source-index.mjs'));
const fixtureSource = Buffer.from('verified source\n');
const blobSha = createHash('sha1')
  .update(`blob ${fixtureSource.length}\0`)
  .update(fixtureSource)
  .digest('hex');

test('source-index check rejects indexed main source content drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'hbnf-source-index-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'docs'), { recursive: true });
    mkdirSync(join(root, 'app'), { recursive: true });
    writeFileSync(join(root, 'scripts/check-hbnf-source-index.mjs'), checkerSource);
    writeFileSync(join(root, 'AGENTS.md'), 'Read docs/HBNF_SOURCE_INDEX.json. Questions and hypotheses are not instructions.\n');
    writeFileSync(join(root, 'app/source.txt'), fixtureSource);
    writeFileSync(join(root, 'docs/HBNF_SOURCE_INDEX.json'), JSON.stringify({
      schema: 'hbnf-source-index-v1',
      program: {
        owner_questions_change_scope: false,
        feature_expansion: 'frozen_pending_field_acceptance',
        track_a_issue: 'https://github.com/oookkkaaayyy/local-roots/issues/115',
        track_b_issue: 'https://github.com/oookkkaaayyy/local-roots/issues/116',
      },
      sources: [{
        id: 'fixture',
        repository: 'oookkkaaayyy/local-roots',
        ref: 'main',
        paths: ['app/source.txt'],
        observed_github_blob_sha: { 'app/source.txt': blobSha },
        repository_content_verified: true,
        production_parity: 'not_checked',
      }],
      deployments: ['hbnf_scoring_worker', 'hbnf_opal_cart_runtime', 'hbnf_supabase_schema'].map(id => ({
        id,
        production_parity: 'unverified',
        ready_for_git_auto_deploy: false,
      })),
    }, null, 2));

    const checker = join(root, 'scripts/check-hbnf-source-index.mjs');
    const passing = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
    assert.equal(passing.status, 0, passing.stderr || passing.stdout);

    writeFileSync(join(root, 'app/source.txt'), 'changed after source verification\n');
    const drifted = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /main-branch indexed source content mismatch: app\/source\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
