import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

test('UV command serialization has a dedicated shared-memory zone', () => {
  const policy = read('staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua');
  const nginx = read('staging/coordinated-backend/opal/owner-local-control/nginx.conf.example');
  assert.equal((policy.match(/ngx\.shared\.hbnf_uv_policy_lock/g) || []).length, 2);
  assert.doesNotMatch(policy, /ngx\.shared\.hbnf_owner_rate/);
  assert.match(nginx, /lua_shared_dict hbnf_uv_policy_lock 64k;/);
  assert.match(policy, /uv_commissioning_test_in_progress/);
  assert.match(policy, /uv_policy_lock_storage_failed/);
  assert.match(policy, /lock_error ~= "exists"/);
  assert.match(policy, /outputOffConfirmed/);
  assert.match(policy, /uv_commissioning_gates_incomplete/);
});

test('v1.0.23 transaction snapshots, validates, and restores the config change', () => {
  const dir = 'staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.23/';
  const install = read(dir + 'install.sh');
  const rollback = read(dir + 'rollback.sh');
  const builder = read('scripts/hbnf_build_owner_local_uv_lock_v123.py');
  for (const s of [install, rollback]) assert.match(s, /nginx-server\.conf/);
  assert.match(install, /nginx -t -c \/etc\/hbnf-local-control\/nginx.conf/);
  assert.match(install, /kill -HUP/);
  assert.match(install, /commissioningTestAvailable/);
  assert.match(install, /@\.schemaVersion/);
  assert.match(install, /@\.releaseId/);
  assert.match(install, /@\.package\.sha256/);
  assert.match(install, /@\.baseline\.rollbackSha256/);
  assert.match(install, /HBNF-OPAL-UV-LOCK-V123-20261028-02/);
  assert.match(install, /unsupported_uv_mode/);
  assert.match(builder, /exact v1\.0\.22 baseline/);
  assert.match(builder, /hbnf_uv_policy_lock 8k/);
  assert.match(builder, /releaseDisposition/);
});


test('v1.0.24 distinguishes a real busy lock from lock storage failure', () => {
  const dir = 'staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.24/';
  const policy = read('staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua');
  const install = read(dir + 'install.sh');
  const builder = read('scripts/hbnf_build_owner_local_uv_lock_v124.py');
  assert.equal((policy.match(/uv_policy_lock_storage_failed/g) || []).length, 2);
  assert.equal((policy.match(/lock_error ~= "exists"/g) || []).length, 2);
  assert.match(builder, /hbnf_uv_policy_lock 64k/);
  assert.match(builder, /exact v1\.0\.23 baseline/);
  assert.match(install, /HBNF-OPAL-UV-LOCK-V124-20261028-01/);
  assert.match(install, /@\.package\.sha256/);
});
