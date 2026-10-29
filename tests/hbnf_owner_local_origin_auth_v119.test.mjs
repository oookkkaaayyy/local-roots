import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("Owner auth accepts only public and exact Cart-local origins without weakening token checks",async()=>{
 const auth=await read("staging/coordinated-backend/opal/owner-local-control/auth.lua");
 assert.match(auth,/local ORIGIN = "https:\/\/hbnightflyers\.com"/);
 assert.match(auth,/local LOCAL_ORIGIN = "http:\/\/192\.168\.77\.1"/);
 assert.match(auth,/headers\.origin ~= ORIGIN and headers\.origin ~= LOCAL_ORIGIN/);
 assert.match(auth,/paired_owner_required/);
 assert.match(auth,/owner_session_expired_or_revoked/);
 assert.match(auth,/revoked/);
});

test("v1.0.19 is a baseline-bound auth.lua-only change with read-only owner-gate acceptance",async()=>{
 const install=await read("staging/coordinated-backend/opal/owner-local-control-origin-auth-v1.0.19/install.sh");
 const rollback=await read("staging/coordinated-backend/opal/owner-local-control-origin-auth-v1.0.19/rollback.sh");
 assert.match(install,/sha256sum -c "\$PKG\/BASELINE_FILES\.SHA256SUMS"/);
 assert.match(install,/sha256sum -c SHA256SUMS/);
 assert.match(install,/TARGET=\/etc\/hbnf-local-control\/lua\/auth\.lua/);
 assert.match(install,/paired_owner_required/);
 assert.match(install,/https:\/\/untrusted\.invalid/);
 assert.match(rollback,/Exact local-auth rollback missing/);
 assert.doesNotMatch(install,/\/etc\/init\.d\/nginx reload|WLED|\/api\/aux\/control/);
 for(const path of ["staging/coordinated-backend/opal/owner-local-control-origin-auth-v1.0.19/install.sh","staging/coordinated-backend/opal/owner-local-control-origin-auth-v1.0.19/rollback.sh"]){
  execFileSync("sh",["-n",fileURLToPath(new URL("../"+path,import.meta.url))]);
 }
});
