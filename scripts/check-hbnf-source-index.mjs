#!/usr/bin/env node
// Low-cost, offline preflight for HBNF source routing. It does NOT verify remote deployment.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(readFileSync(join(root, 'docs/HBNF_SOURCE_INDEX.json'), 'utf8'));
const agentInstructions = readFileSync(join(root, 'AGENTS.md'), 'utf8');
const sha1 = /^[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;
assert.equal(index.schema, 'hbnf-source-index-v1');
assert.equal(index.program.owner_questions_change_scope, false);
assert.equal(index.program.feature_expansion, 'frozen_pending_field_acceptance');
assert.match(index.program.track_a_issue, /\/issues\/115$/);
assert.match(index.program.track_b_issue, /\/issues\/116$/);
assert.match(agentInstructions, /docs\/HBNF_SOURCE_INDEX\.json/);
assert.match(agentInstructions, /questions? (?:and|or) hypothes(?:es|is) (?:are|is) not/i);

const targets = new Set();
for (const source of index.sources) {
  assert.ok(!targets.has(source.id), 'duplicate source ID: ' + source.id);
  targets.add(source.id);
  assert.equal(source.repository, 'oookkkaaayyy/local-roots');
  assert.equal(source.repository_content_verified, true);
  assert.equal(source.production_parity, 'not_checked');
  assert.ok(source.paths.length > 0);
  for (const path of source.paths) {
    assert.match(path, /^[\w./-]+$/);
    assert.match(source.observed_github_blob_sha[path], sha1);
    if (source.ref === 'main') {
      assert.ok(existsSync(join(root, path)), 'main-branch indexed source missing: ' + path);
    }
  }
}

const deployments = new Set();
for (const target of index.deployments) {
  assert.ok(!deployments.has(target.id), 'duplicate deployment ID: ' + target.id);
  deployments.add(target.id);
  assert.ok(['verified', 'unverified'].includes(target.production_parity));
  if (target.ready_for_git_auto_deploy || target.production_parity === 'verified') {
    assert.equal(target.production_parity, 'verified');
    assert.match(target.editable_source_commit, sha1, 'missing exact source commit for ' + target.id);
    assert.match(target.artifact_sha256, sha256, 'missing immutable artifact digest for ' + target.id);
    assert.ok(target.provider_deployment_id, 'missing provider deployment identity for ' + target.id);
    assert.ok(target.rollback_identity, 'missing rollback identity for ' + target.id);
    assert.ok(target.verification_receipt, 'missing provider/source parity evidence for ' + target.id);
  } else {
    assert.equal(target.ready_for_git_auto_deploy, false);
  }
}
for (const id of ['hbnf_scoring_worker', 'hbnf_opal_cart_runtime', 'hbnf_supabase_schema']) {
  assert.ok(deployments.has(id), 'missing critical source target: ' + id);
}
const allText = JSON.stringify(index);
assert.doesNotMatch(allText, /gh[pousr]_[A-Za-z0-9]{20,}|Bearer\\s+[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA )?PRIVATE KEY-----/);
const required = process.argv.find(arg => arg.startsWith('--require-production-ready='));
if (required) {
  const id = required.split('=')[1];
  const target = index.deployments.find(target => target.id === id);
  assert.ok(target, 'unknown deployment target: ' + id);
  assert.equal(target.production_parity, 'verified', 'BLOCKED: cannot release ' + id + ' from unverified source');
  assert.equal(target.ready_for_git_auto_deploy, true, 'BLOCKED: auto-deploy not authorized for ' + id);
}
console.log('HBNF source index PASS (offline consistency only).');
const blockers = index.deployments.filter(t => t.production_parity !== 'verified').map(t => t.id);
if (blockers.length) console.log('Production source parity UNVERIFIED: ' + blockers.join(', '));
