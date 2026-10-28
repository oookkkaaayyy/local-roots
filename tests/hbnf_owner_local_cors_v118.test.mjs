import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("Opal local CORS release allows only the exact public and Cart-local origins", async () => {
  const nginx = await read("staging/coordinated-backend/opal/owner-local-control/nginx.conf.example");
  assert.match(nginx, /map \$http_origin \$hbnf_owner_cors_origin \{[\s\S]*?default "";[\s\S]*?"https:\/\/hbnightflyers\.com" "https:\/\/hbnightflyers\.com";[\s\S]*?"http:\/\/192\.168\.77\.1" "http:\/\/192\.168\.77\.1";[\s\S]*?\}/);
  assert.doesNotMatch(nginx, /if \(\$http_origin !=/);
  assert.match(nginx, /if \(\$hbnf_owner_cors_origin = ""\) \{ return 403; \}/);
  assert.match(nginx, /add_header Access-Control-Allow-Origin \$hbnf_owner_cors_origin always;/);
  assert.match(nginx, /location = \/api\/aux\/uv-status[\s\S]*?auth_owner\.lua[\s\S]*?uv_status_access\.lua/);
  assert.match(nginx, /location = \/api\/aux\/uv-policy[\s\S]*?auth_owner\.lua[\s\S]*?uv_policy_access\.lua/);
});

test("v1.0.18 install is baseline-bound, changes only the gateway server config, and checks both allowed origins plus denial", async () => {
  const install = await read("staging/coordinated-backend/opal/owner-local-control-cors-v1.0.18/install.sh");
  const rollback = await read("staging/coordinated-backend/opal/owner-local-control-cors-v1.0.18/rollback.sh");
  assert.match(install, /sha256sum -c "\$PKG\/BASELINE_FILES\.SHA256SUMS"/);
  assert.match(install, /sha256sum -c SHA256SUMS/);
  assert.match(install, /TARGET=\/etc\/hbnf-local-control\/nginx-server\.conf/);
  assert.match(install, /Cart-local PWA preflight/);
  assert.match(install, /public PWA preflight/);
  assert.match(install, /untrusted-origin preflight/);
  assert.match(rollback, /Exact gateway rollback is missing/);
  assert.doesNotMatch(install, /\/etc\/init\.d\/nginx reload|nginx\.conf\.example/);
});
