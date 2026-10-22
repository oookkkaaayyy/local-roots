#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

assert(process.argv.includes("--verify-source-manifest"), "Expected --verify-source-manifest");
const root = path.resolve(arg("--cart-root"));
const manifestPath = path.resolve(arg("--manifest"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(manifest.sourceCommit, head, "Manifest source commit must match checkout HEAD");
assert.equal(manifest.releaseDisposition, "INSTALLABLE_REQUIRES_EXISTING_ADMISSION");
assert.ok(manifest.transactionId, "Installable package must be bound to a candidate transaction ID");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

for (const input of manifest.sourceInputs) {
  const file = path.resolve(root, input.path);
  assert.ok(file.startsWith(`${root}${path.sep}`), `Source path escapes checkout: ${input.path}`);
  assert.equal(fs.statSync(file).size, input.size, `Source size mismatch: ${input.path}`);
  assert.equal(sha256(file), input.sha256, `Source hash mismatch: ${input.path}`);
}
for (const asset of manifest.assets) {
  const file = path.resolve(path.dirname(manifestPath), "owner-pwa", asset.path);
  assert.equal(sha256(file), asset.sha256, `Packaged asset hash mismatch: ${asset.path}`);
}
assert.equal(manifest.rollbackBaseline.entries, 20, "Expected exact 20-file installed Owner PWA baseline");
assert.match(manifest.rollbackBaseline.sha256, /^[0-9a-f]{64}$/);
console.log(`PASS: source manifest bound to ${head}; ${manifest.sourceInputs.length} exact inputs checked`);
