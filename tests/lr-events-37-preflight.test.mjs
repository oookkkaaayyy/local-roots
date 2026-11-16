import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const preflight = fileURLToPath(new URL("../scripts/review/lr-events-37/preflight.mjs", import.meta.url));
function run(asOf) {
  return spawnSync(process.execPath, [preflight, `--as-of=${asOf}`], {
    encoding: "utf8", timeout: 10000
  });
}

test("37 exact review candidates remain date-eligible on November 17 Pacific", () => {
  for (const day of ["2026-11-16", "2026-11-17"]) {
    const result = run(day);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /candidate: 37; eligible: 37; past: 0/);
    assert.match(result.stdout, /DATE CHECK PASS/);
  }
});

test("the three November 17 events block the unchanged 37-date release on November 18", () => {
  const result = run("2026-11-18");
  assert.equal(result.status, 2);
  assert.match(result.stdout, /candidate: 37; eligible: 34; past: 3/);
  for (const slug of [
    "dog-haus-tuesday-tags-2026-11-17",
    "tuesday-glow-at-truxtun-2026-11-17",
    "lake-forest-tuesday-dubs-2026-11-17"
  ]) assert.ok(result.stdout.includes(slug), slug);
  assert.match(result.stderr, /Re-scope and regrade/);
});

test("later passed dates require further explicit rescoping, not bypass", () => {
  const result = run("2026-11-24");
  assert.equal(result.status, 2);
  assert.match(result.stdout, /candidate: 37; eligible: 32; past: 5/);
});

test("an invalid date flag is rejected without changing files or production data", () => {
  const result = spawnSync(process.execPath, [preflight, "--as-of=not-a-date"], { encoding: "utf8", timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: node preflight.mjs/);
});

test("impossible calendar dates cannot produce a false eligibility PASS", () => {
  const result = run("2026-02-30");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid Pacific as-of date/);
});
