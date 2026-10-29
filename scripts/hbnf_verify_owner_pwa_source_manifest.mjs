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
const reviewOnly = manifest.releaseDisposition === "REVIEW_ONLY_NOT_ADMITTED_NOT_UPLOADED_NOT_INSTALLED";
assert.ok(
  reviewOnly || manifest.releaseDisposition === "INSTALLABLE_REQUIRES_EXISTING_ADMISSION",
  "Manifest must declare a supported review-only or installable disposition",
);
if (reviewOnly) {
  assert.equal(manifest.transactionId, null, "Review-only package must not carry an install transaction ID");
  const packageTools = manifest.packageTools ?? [];
  const tools = new Map(packageTools.map((tool) => [tool.path, tool]));
  assert.equal(packageTools.length, tools.size, "Review-only package tool paths must be unique");
  assert.deepEqual([...tools.keys()].sort(), ["REVIEW_ONLY.txt", "install.sh", "rollback.sh"]);
  const expectedReviewContent = {
    "install.sh": "#!/bin/sh\necho 'REVIEW ONLY: installation is disabled' >&2\nexit 64\n",
    "rollback.sh": "#!/bin/sh\necho 'REVIEW ONLY: rollback is disabled' >&2\nexit 64\n",
    "REVIEW_ONLY.txt": "Review artifact only. No installation or rollback is enabled.\n",
  };
  for (const [name, tool] of tools) {
    const file = path.resolve(path.dirname(manifestPath), name);
    assert.ok(file.startsWith(`${path.dirname(manifestPath)}${path.sep}`), `Review tool escapes package: ${name}`);
    assert.equal(sha256(file), tool.sha256, `Review tool hash mismatch: ${name}`);
    assert.equal(fs.readFileSync(file, "utf8"), expectedReviewContent[name], `Unexpected review tool content: ${name}`);
    if (name === "install.sh" || name === "rollback.sh") {
      assert.equal(tool.mode, "disabled-review-stub", `${name} must remain disabled`);
    }
  }
} else {
  assert.ok(manifest.transactionId, "Installable package must be bound to a candidate transaction ID");
}

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
const expectedBaselineEntries = manifest.assets.length + 4;
const rollbackArchive = manifest.rollbackBaseline.packageArchive;
const baselineUnavailable = manifest.rollbackBaseline.entries === null && manifest.rollbackBaseline.sha256 === null;
if (baselineUnavailable) {
  assert.ok(reviewOnly, "Installable package requires an exact installed Owner PWA baseline");
  assert.equal(rollbackArchive, null, "Unavailable installed baseline cannot claim a rollback archive");
} else {
  assert.equal(manifest.rollbackBaseline.entries, expectedBaselineEntries, `Expected exact ${expectedBaselineEntries}-file installed Owner PWA baseline`);
  assert.match(manifest.rollbackBaseline.sha256, /^[0-9a-f]{64}$/);
}
if (["cart-owner-pwa-ui-v1.0.13", "cart-owner-pwa-uv-v1.0.14", "cart-owner-pwa-gateway-port-v1.0.15", "cart-owner-pwa-uv-readiness-v1.0.16"].includes(manifest.releaseSlice?.id)) {
  assert.ok(rollbackArchive, "Owner PWA release slice requires its exact retained baseline package");
}
if (rollbackArchive) {
  assert.equal(rollbackArchive.path, "ROLLBACK_BASELINE.zip");
  assert.match(rollbackArchive.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(rollbackArchive.size) && rollbackArchive.size > 0);
  if (rollbackArchive.driveFileId) {
    assert.match(rollbackArchive.driveFileId, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal(rollbackArchive.sourcePath, `drive:${rollbackArchive.driveFileId}`);
  }
  const exactArchive = path.resolve(path.dirname(manifestPath), rollbackArchive.path);
  assert.equal(fs.statSync(exactArchive).size, rollbackArchive.size, "Nested baseline package size mismatch");
  assert.equal(sha256(exactArchive), rollbackArchive.sha256, "Nested baseline package hash mismatch");
}
console.log(`PASS: source manifest bound to ${head}; ${manifest.sourceInputs.length} exact inputs checked`);
