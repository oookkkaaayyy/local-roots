import test from "node:test";
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
const baseArchive = path.join(root, "staging/coordinated-backend/opal/hbnf-opal-mission-control-local-v1.0.2-ios12.zip");
function build(output) {
  execFileSync("python3", [packageBuilder, "--source-root", root, "--output-dir", output, "--source-commit", sourceCommit], { stdio: "pipe" });
}
try {
  build(buildA); build(buildB);
  const zipA = fs.readFileSync(path.join(buildA, "hbnf-owner-pwa-local-v1.0.0.zip"));
  const zipB = fs.readFileSync(path.join(buildB, "hbnf-owner-pwa-local-v1.0.0.zip"));
  assert.deepEqual(zipA, zipB, "identical source must produce byte-identical package");
  const packageSha = crypto.createHash("sha256").update(zipA).digest("hex");
  assert.match(fs.readFileSync(path.join(buildA, "PACKAGE.SHA256"), "utf8"), new RegExp(`^${packageSha}  hbnf-owner-pwa-local-v1\\.0\\.0\\.zip\\n$`));
  const archiveEntries = execFileSync("unzip", ["-Z1", path.join(buildA, "hbnf-owner-pwa-local-v1.0.0.zip")], { encoding: "utf8" }).trim().split("\n");
  assert.ok(archiveEntries.includes("install.sh"));
  assert.ok(archiveEntries.includes("rollback.sh"));
  assert.ok(archiveEntries.includes("owner-pwa/hbnf-cart.html"));

  const www = path.join(temp, "www");
  fs.mkdirSync(www);
  execFileSync("unzip", ["-q", baseArchive, "-d", www]);
  const mission = path.join(www, "mission-control-local");
  fs.writeFileSync(path.join(mission, ".hbnf-package-marker"), "hbnf-owner-mission-control-local-v1\n");
  fs.writeFileSync(path.join(mission, ".hbnf-package-version"), "1.0.2\n");
  const baseBefore = crypto.createHash("sha256").update(fs.readFileSync(path.join(mission, "index.html"))).digest("hex");

  const extracted = path.join(temp, "extracted");
  fs.mkdirSync(extracted);
  execFileSync("unzip", ["-q", path.join(buildA, "hbnf-owner-pwa-local-v1.0.0.zip"), "-d", extracted]);
  const fakeBin = path.join(temp, "fake-bin");
  fs.mkdirSync(fakeBin);
  const realPath = process.env.PATH;
  fs.writeFileSync(path.join(fakeBin, "id"), "#!/bin/sh\necho 0\n", { mode: 0o755 });
  const env = { ...process.env, PATH: `${fakeBin}:${realPath}`, HBNF_WWW_ROOT: www };
  execFileSync("sh", [path.join(extracted, "install.sh")], { env, stdio: "pipe" });
  const target = path.join(mission, "owner-pwa");
  assert.ok(fs.existsSync(path.join(target, "hbnf-cart.html")));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(mission, "index.html"))).digest("hex"), baseBefore);
  const second = spawnSync("sh", [path.join(extracted, "install.sh")], { env, encoding: "utf8" });
  assert.notEqual(second.status, 0, "reinstallation must fail closed instead of overwriting");
  execFileSync("sh", [path.join(target, ".hbnf-rollback.sh")], { env, stdio: "pipe" });
  assert.equal(fs.existsSync(target), false, "rollback removes only the additive subtree");
  assert.equal(fs.existsSync(path.join(mission, "index.html")), true, "existing Mission Control remains installed");

  const localHtml = fs.readFileSync(path.join(buildA, "owner-pwa/hbnf-cart.html"), "utf8");
  assert.doesNotMatch(localHtml, /navigator\.serviceWorker\.register/);
  assert.match(localHtml, /hbnf-cart-features\.mjs/);
  const localDir = path.join(buildA, "owner-pwa");
  for (const [, attrs] of localHtml.matchAll(/<(?:script|link|img|source|iframe)\b([^>]*)>/gi)) {
    for (const [, raw] of attrs.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:https?:|data:|#)/i.test(raw)) continue;
      assert.ok(fs.existsSync(path.join(localDir, raw.split(/[?#]/, 1)[0])), `local page asset is missing: ${raw}`);
    }
  }
  for (const file of fs.readdirSync(localDir).filter(name => /\.m?js$/.test(name))) {
    const source = fs.readFileSync(path.join(localDir, file), "utf8");
    for (const [, raw] of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      assert.ok(fs.existsSync(path.join(localDir, raw.split(/[?#]/, 1)[0])), `${file} import is missing: ${raw}`);
    }
  }
  const localFeatures = fs.readFileSync(path.join(localDir, "hbnf-cart-features.mjs"), "utf8");
  assert.match(localFeatures, /const out=await canonicalRead\("live_status",\{\}\);[\s\S]*?if \(!live \|\| !live\.active \|\| !Array\.isArray\(live\.entries\) \|\| !live\.entries\.length\) throw/);
  assert.match(localFeatures, /const cached=readLiveCache\(\);[\s\S]*?renderLive\(cached\.live,true/);
  const manifest = JSON.parse(fs.readFileSync(path.join(buildA, "owner-pwa/hbnf-cart-manifest.webmanifest"), "utf8"));
  assert.equal(manifest.scope, "./");
  assert.match(manifest.start_url, /^\.\/hbnf-cart\.html\?/);
  assert.ok(manifest.icons.every(icon => icon.src.startsWith("./")));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("PASS: deterministic local Owner PWA bundle, additive guarded install, refusal to overwrite, and exact subtree rollback");
