import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hbnf-owner-pwa-opal-"));
const buildA = path.join(temp, "build-a"), buildB = path.join(temp, "build-b");
const packageBuilder = path.join(root, "scripts/hbnf_build_local_owner_pwa.py");
const missionArchive = path.join(root, "staging/coordinated-backend/opal/hbnf-opal-mission-control-local-v1.0.2-ios12.zip");
const baselineArchive = path.join(root, "staging/coordinated-backend/opal/hbnf-owner-pwa-local-v1.0.1/hbnf-owner-pwa-local-v1.0.1.zip");
const baselineSha = "ed9619687dd2305070500eb3d8b54d1fb28237a0ab0714155d40304bd5a5f284";
function build(output) {
  execFileSync("python3", [packageBuilder, "--source-root", root, "--output-dir", output, "--source-commit", sourceCommit], { stdio: "pipe" });
}
try {
  build(buildA); build(buildB);
  const candidateName = "hbnf-owner-pwa-local-v1.0.2.zip";
  const zipA = fs.readFileSync(path.join(buildA, candidateName));
  const zipB = fs.readFileSync(path.join(buildB, candidateName));
  assert.deepEqual(zipA, zipB, "identical source must produce byte-identical v1.0.2 packages");
  const packageSha = crypto.createHash("sha256").update(zipA).digest("hex");
  assert.match(fs.readFileSync(path.join(buildA, "PACKAGE.SHA256"), "utf8"), new RegExp(`^${packageSha}  ${candidateName.replaceAll(".", "\\.")}\\n$`));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(baselineArchive)).digest("hex"), baselineSha, "accepted v1.0.1 rollback baseline remains exact");

  const www = path.join(temp, "www"); fs.mkdirSync(www);
  execFileSync("unzip", ["-q", missionArchive, "-d", www]);
  const mission = path.join(www, "mission-control-local");
  fs.writeFileSync(path.join(mission, ".hbnf-package-marker"), "hbnf-owner-mission-control-local-v1\n");
  fs.writeFileSync(path.join(mission, ".hbnf-package-version"), "1.0.2\n");
  const baseBefore = crypto.createHash("sha256").update(fs.readFileSync(path.join(mission, "index.html"))).digest("hex");

  // Recreate the recorded v1.0.1 installed state from its exact package.
  const baselineExtract = path.join(temp, "baseline"); fs.mkdirSync(baselineExtract);
  execFileSync("unzip", ["-q", baselineArchive, "-d", baselineExtract]);
  const oldPackage = path.join(baselineExtract, "owner-pwa");
  const target = path.join(mission, "owner-pwa"); fs.mkdirSync(target);
  for (const name of fs.readdirSync(oldPackage)) fs.copyFileSync(path.join(oldPackage, name), path.join(target, name));
  const oldChecksums = fs.readFileSync(path.join(baselineExtract, "PAYLOAD.SHA256SUMS"), "utf8");
  fs.writeFileSync(path.join(target, ".hbnf-payload.sha256"), oldChecksums.replaceAll("owner-pwa/", ""));
  fs.writeFileSync(path.join(target, ".hbnf-package-marker"), "hbnf-owner-pwa-local-v1\n");
  fs.writeFileSync(path.join(target, ".hbnf-package-version"), "1.0.1\n");
  fs.copyFileSync(path.join(baselineExtract, "rollback.sh"), path.join(target, ".hbnf-rollback.sh"));
  const baselineFileCount = Number(execFileSync("find", [target, "-type", "f"], { encoding: "utf8" }).trim().split("\n").length);
  assert.equal(baselineFileCount, 17, "test fixture must match the exact installed v1.0.1 file count");
  const backupRoot = path.join(temp, "backup-root"); fs.mkdirSync(backupRoot);

  const extracted = path.join(temp, "candidate"); fs.mkdirSync(extracted);
  execFileSync("unzip", ["-q", path.join(buildA, candidateName), "-d", extracted]);
  const packageDir = extracted;
  const fakeBin = path.join(temp, "fake-bin"); fs.mkdirSync(fakeBin);
  const realPath = process.env.PATH;
  fs.writeFileSync(path.join(fakeBin, "id"), "#!/bin/sh\necho 0\n", { mode: 0o755 });
  const env = { ...process.env, PATH: `${fakeBin}:${realPath}`, HBNF_WWW_ROOT: www, HBNF_BACKUP_ROOT: backupRoot };
  execFileSync("sh", [path.join(packageDir, "install.sh")], { env, stdio: "pipe" });
  assert.equal(fs.readFileSync(path.join(target, ".hbnf-package-version"), "utf8").trim(), "1.0.2");
  assert.ok(fs.existsSync(path.join(target, "hbnf-guest-qr.png")), "QR is installed with the Owner PWA assets");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(mission, "index.html"))).digest("hex"), baseBefore, "Mission Control is unchanged");
  const second = spawnSync("sh", [path.join(packageDir, "install.sh")], { env, encoding: "utf8" });
  assert.notEqual(second.status, 0, "reinstall must fail closed rather than overwrite the recovery copy");
  execFileSync("sh", [path.join(target, ".hbnf-rollback.sh")], { env, stdio: "pipe" });
  assert.equal(fs.readFileSync(path.join(target, ".hbnf-package-version"), "utf8").trim(), "1.0.1");
  assert.equal(fs.readFileSync(path.join(target, ".hbnf-payload.sha256"), "utf8"), oldChecksums.replaceAll("owner-pwa/", ""), "rollback restores exact v1.0.1 payload");
  assert.ok(fs.existsSync(path.join(mission, ".owner-pwa.failed-v1.0.2")), "superseded candidate remains available for inspection");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(mission, "index.html"))).digest("hex"), baseBefore, "Mission Control remains unchanged after rollback");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("PASS: deterministic Owner PWA v1.0.2 build, QR installation from exact v1.0.1 baseline, refusal to overwrite, and exact additive rollback");
