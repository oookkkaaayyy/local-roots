import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/hbnf-sp803e-aux-r3-build.yml", "utf8");
const PRIVATE = "refs/heads/codex/cart-uv-local-policy-scaffold-20261026";
const REVIEW = "refs/heads/review/cart-uv-pwm-no-pulse-guard-20261101";
const OTHER = "refs/heads/codex/cart-order2-cumulative-20261024";

function getStep(name) {
  const marker = "      - name: " + name + "\n";
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, "missing workflow step: " + name);
  const end = workflow.indexOf("\n      - name: ", start + marker.length);
  return workflow.slice(start, end < 0 ? undefined : end);
}
function refGate(step) {
  const line = step.match(/^        if: (.+)$/m)?.[1];
  const match = line?.match(/^github\.ref (==|!=) '([^']+)'$/);
  assert.ok(match, "must use a single auditable github.ref equality check");
  return ref => match[1] === "==" ? ref === match[2] : ref !== match[2];
}
const publish = getStep("Preserve exact commissioning ZIP in a private run branch");
const upload = getStep("Upload artifacts for other workflow refs");

test("UV review dispatch uploads a labeled REVIEW_ONLY package without publishing a branch", () => {
  assert.equal(refGate(publish)(REVIEW), false);
  assert.equal(refGate(upload)(REVIEW), true);
  assert.match(upload, /uses: actions\/upload-artifact@v4/);
  assert.match(upload, /name: \$\{\{ env\.HBNF_UV_BUILD_FLAG == '1' && 'HBNF-SP803E-AUX-R3-REVIEW-ONLY' \|\| 'HBNF-SP803E-AUX-R3' \}\}/);
  assert.match(upload, /path: \/tmp\/artifacts/);
  assert.match(upload, /if-no-files-found: error/);
  assert.match(upload, /retention-days: 30/);
});

test("default-off artifacts remain preserved on the existing non-private refs", () => {
  assert.equal(refGate(publish)(REVIEW), false);
  assert.equal(refGate(upload)(REVIEW), true);
  assert.equal(refGate(publish)(OTHER), false);
  assert.equal(refGate(upload)(OTHER), true);
  assert.match(upload, /'HBNF-SP803E-AUX-R3' \}\}/);
});

test("existing private run-branch preservation path is unchanged", () => {
  assert.equal(refGate(publish)(PRIVATE), true);
  assert.equal(refGate(upload)(PRIVATE), false);
  assert.match(publish, /git -C "\$temp_repo" push origin/);
  assert.equal((workflow.match(/git -C "\$temp_repo" push origin/g) || []).length, 1);
});

test("commissioning package remains non-installable until separate admission", () => {
  const gate = getStep("Verify exact commissioning package");
  const distribution = getStep("Build permission-safe commissioning ZIP");
  assert.match(gate, /assert r\['releaseAdmission'\]\['status'\]=='REVIEW_ONLY'/);
  assert.match(gate, /assert not r\['installAdmissible'\]/);
  assert.match(distribution, /assert admission\['status'\]=='REVIEW_ONLY'/);
  assert.match(distribution, /assert receipt\['status'\]=='INCOMPLETE'/);
  assert.match(distribution, /assert metrics\['UV_ACTIVATION_GATES'\]=='CLOSED'/);
  assert.match(distribution, /assert metrics\['UV_DIRECT_WLED_ACCESS'\]=='NOT_CHECKED'/);
});
