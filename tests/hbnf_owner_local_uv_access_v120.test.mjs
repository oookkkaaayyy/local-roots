import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=new URL("../",import.meta.url);const read=p=>readFile(new URL(p,root),"utf8");

test("only the exact Cart-local UV routes bypass pairing; public UV requests retain Owner auth",async()=>{
 const status=await read("staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua");
 const policy=await read("staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua");
 for(const src of [status,policy]){
  assert.match(src,/ngx\.var\.http_origin ~= "http:\/\/192\.168\.77\.1"/);
  assert.match(src,/auth\.owner_access\(false\) ~= true/);
 }
 assert.match(policy,/mode == "COMMISSIONING_TEST"/);
 assert.match(policy,/uv_commissioning_test_off_unconfirmed/);
 assert.match(policy,/runtime\.profile_ready\(\)/);
 assert.match(policy,/mode ~= "OFF"/);
});

test("local unpaired install package checks without sending a UV write",async()=>{
 const install=await read("staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.20/install.sh");
 const rollback=await read("staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.20/rollback.sh");
 assert.match(install,/sha256sum -c "\$PKG\/BASELINE_FILES\.SHA256SUMS"/);
 assert.match(install,/paired_owner_required/);
 assert.match(install,/unsupported_uv_mode/);
 assert.match(install,/Access-Control-Allow-Origin: http:\/\/192\.168\.77\.1/);
 assert.doesNotMatch(install,/--data .*COMMISSIONING_TEST|WLED.*POST|\/__aux_uv_apply/);
 assert.match(rollback,/Exact UV route rollback|uv_status_access\.lua/);
 for(const p of ["staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.20/install.sh","staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.20/rollback.sh"])
  execFileSync("sh",["-n",fileURLToPath(new URL("../"+p,import.meta.url))]);
});
