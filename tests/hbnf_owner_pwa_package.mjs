import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const controller = path.join(root, "hbnf-final-controller");
const guestRoute = path.join(controller, "guest/hbnf-cart");
const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(controller, "hbnf-cart-manifest.webmanifest"), "utf8"));
const installer = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/install_ui_v6.py"), "utf8");
const installerCommand = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/INSTALL_UI_V6.command"), "utf8");
const uiWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-cart-ui-v6-package.yml"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-coordinated-release-ci.yml"), "utf8");
const packageBuilderPath = path.join(root, "scripts/hbnf_build_owner_guest_package.py");
const packageBuilder = fs.readFileSync(packageBuilderPath, "utf8");
const candidateBuilder = fs.readFileSync(path.join(root, "scripts/hbnf_candidate_bundle.py"), "utf8");

assert.match(html, /hbnf-cart2-owner-control-guest-qr-v1-20261016/);
assert.match(html, /href="http:\/\/192\.168\.77\.1\/mission-control-local\/owner-pwa\/hbnf-cart\.html"/);
assert.match(html, /Local controls · Cart Wi-Fi/);
assert.doesNotMatch(html, /skins-owner-pwa-r1/);
assert.equal(manifest.id, "/hbnf-cart.html");
assert.equal(manifest.start_url, "/hbnf-cart.html?app=20261023-cart-ux-v5");
assert.equal(manifest.scope, "/hbnf-cart.html");
assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);

const referenced = new Set();
// Inspect resource-bearing elements. Anchor hrefs are navigation routes, not
// packaged static assets (for example /guest/hbnf-cart/).
for (const [, , attrs] of html.matchAll(/<(script|link|img|source|iframe)\b([^>]*)>/gi)) {
  for (const [, raw] of attrs.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const local = raw.split(/[?#]/, 1)[0];
    if (!local || /^(?:https?:|data:|#)/i.test(local)) continue;
    referenced.add(path.basename(local));
  }
}
for (const icon of manifest.icons) referenced.add(path.basename(icon.src));
for (const name of referenced) {
  assert.ok(fs.existsSync(path.join(controller, name)), `missing owner PWA asset: ${name}`);
}

for (const name of [
  "hbnf-cart-skins-score.mjs",
  "hbnf-cart-local.mjs",
  "hbnf-cart-net.mjs",
  "hbnf-cart-sw.js",
  "hbnf-cart-icon-180.png",
  "hbnf-cart-icon-192.png",
  "hbnf-cart-icon-512.png",
  "hbnf-guest-qr.png",
]) {
  assert.ok(installer.includes(`"${name}"`), `installer omits ${name}`);
  assert.ok(packageBuilder.includes(`"${name}"`), `Owner/Guest package builder omits ${name}`);
  assert.ok(
    candidateBuilder.includes(`("hbnf-final-controller/${name}", "controller/${name}")`),
    `candidate release bundle omits ${name}`,
  );
}
assert.match(releaseWorkflow, /scripts\/hbnf_candidate_bundle\.py/,
  "coordinated release workflow must use the checked candidate bundle builder");

assert.match(html, /navigator\.serviceWorker\.register/);
assert.match(html, /local-control-entry/);
assert.match(html, /id="featureFontIndex"[\s\S]*value="4" selected[\s\S]*>Compact<\/option>[\s\S]*>Console<\/option>[\s\S]*>Classic<\/option>/);
assert.doesNotMatch(html, /TinyUnicode/i, "unsupported UTF-8 font slot is not offered by the ASCII overlay adapter");
const featureModule = fs.readFileSync(path.join(controller, "hbnf-cart-features.mjs"), "utf8");
assert.match(featureModule, /nativeTextFontIndexV1===true/);
assert.match(featureModule, /if \(fontIndex\) fontIndex\.disabled=!fontIndexReady/);
assert.match(featureModule, /if \(canonicalCapabilities\(\)\.nativeTextFontIndexV1===true\) data\.fontIndex=/);
assert.doesNotMatch(featureModule, /\?\.value\s*\?\?/);
const sliders = [...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(([tag]) => tag);
assert.equal(sliders.length, 7, "all course/audio/brightness sliders are covered");
for (const tag of sliders) {
  const id = tag.match(/\bid="([^"]+)"/)?.[1];
  assert.ok(id, "each course slider has a stable identifier");
  if (/aria-label=/.test(tag)) continue;
  const inputAt = html.indexOf(tag);
  const labelStart = html.lastIndexOf("<label", inputAt);
  const labelEnd = html.indexOf("</label>", inputAt);
  assert.ok(labelStart >= 0 && labelEnd > inputAt, `${id} must have an accessible label`);
}
assert.match(css, /height:44px;min-height:44px/, "range hit area is at least 44px high");
assert.match(css, /width:100%/, "range hit area fills its control column");
assert.match(css, /min-width:44px/, "range hit area remains at least 44px wide");
assert.match(css, /::-webkit-slider-thumb[^}]*width:20px;height:20px/);
assert.match(css, /::-moz-range-thumb[^}]*width:16px;height:16px/);
assert.match(html, /:focus-visible/, "keyboard focus styling remains visible");
assert.ok(fs.existsSync(path.join(controller, "hbnf-cart-sw.js")), "owner PWA service worker missing");
assert.match(uiWorkflow, /HBNF-CART-OWNER-GUEST-CONTROLLER-ONLY-V1-20261016/);
assert.match(uiWorkflow, /type: boolean\n        default: false/);
assert.match(uiWorkflow, /EXPECTED_COMMIT_SHA.*inputs\.expected_commit_sha/);
assert.match(uiWorkflow, /ARTIFACT_CAPACITY_CONFIRMED.*inputs\.artifact_capacity_confirmed/);
assert.match(uiWorkflow, /github\.event_name == 'workflow_dispatch' && inputs\.publish_candidate/);
assert.match(uiWorkflow, /retention-days: 7/);
assert.doesNotMatch(uiWorkflow, /retention-days: 30/);
assert.match(installer, /BUILD_MARKER="hbnf-cart2-owner-control-guest-qr-v1-20261016"/);
assert.match(installer, /\?release="\+BUILD_MARKER\+/);
assert.match(installer, /HBNF_CART2_OWNER_GUEST_INSTALL=PASS/);
assert.match(installer, /if not verified:\s+raise RuntimeError\("Deploy finished but exact Cart 2.0 marker did not verify/);
assert.doesNotMatch(installer, /HBNF_CART_UI_V7_3_PHASE2_INTEGRATED_R1_20261006|HBNF_CART_UI_V7_3_PWA_R1_INSTALL/);
assert.match(installerCommand, /HBNF Cart 2.0 Owner Control Local V1/);
assert.doesNotMatch(installerCommand, /V7\.3|Phase 2 Integration R1|noisy live telemetry removed/i);
assert.match(packageBuilder, /hbnf-cart2-owner-guest-vibe-package-v2/);
assert.match(uiWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);
assert.match(releaseWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);

for (const name of ["index.html", "guest.js", "guest.css"]) {
  const rel = `guest/hbnf-cart/${name}`;
  assert.ok(fs.existsSync(path.join(controller, rel)), `Guest route asset missing: ${rel}`);
  assert.match(installer, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `installer omits ${rel}`);
  assert.ok(packageBuilder.includes(`"${rel}"`), `package builder omits ${rel}`);
}
assert.match(installer, /FILES\+GUEST_FILES/);
assert.match(packageBuilder, /guest\/hbnf-cart\/index\.html/);
assert.match(packageBuilder, /ZIP_STORED/);
assert.match(packageBuilder, /date_time=\(2020, 1, 1, 0, 0, 0\)/);
assert.match(packageBuilder, /for name in PACKAGE_FILES/);
assert.match(uiWorkflow, /hbnf_build_owner_guest_package\.py/);
assert.doesNotMatch(uiWorkflow, /\bzip -yr\b/, "workflow must not depend on host ZIP timestamps or traversal order");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hbnf-owner-guest-determinism-"));
try {
  const outputs = [path.join(temp, "a"), path.join(temp, "b")];
  for (const out of outputs) {
    execFileSync("python3", [packageBuilderPath, "--source-root", root, "--output-dir", out, "--source-commit", "0123456789abcdef"], { stdio: "pipe" });
  }
  const archiveName = "HBNF_CART_OWNER_GUEST_CONTROLS_V1_20261016.zip";
  const bytesA = fs.readFileSync(path.join(outputs[0], archiveName));
  const bytesB = fs.readFileSync(path.join(outputs[1], archiveName));
  assert.deepEqual(bytesA, bytesB, "same source commit must produce byte-identical archives in different output directories");
  const sha = crypto.createHash("sha256").update(bytesA).digest("hex");
  assert.match(fs.readFileSync(path.join(outputs[0], `${archiveName}.sha256`), "utf8"), new RegExp(`^${sha}  ${archiveName}\\n$`));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const guestHtml = fs.readFileSync(path.join(guestRoute, "index.html"), "utf8");
const guestJs = fs.readFileSync(path.join(guestRoute, "guest.js"), "utf8");
assert.match(guestHtml, /Use these controls on cellular when guest access is on/);
assert.match(guestHtml, /Skins scoring/);
assert.match(guestHtml, /Glow scoring/);
assert.match(guestHtml, /id="deviceStatus"/);
assert.match(guestJs, /Number\(report\.desired_revision\)===wantedRevision[\s\S]*?report\.reported\.confirmed===true/, "device acknowledgement must match the requested revision");
assert.match(guestJs, /Check that the lights changed/, "device acknowledgement must not claim physical illumination");
assert.match(guestJs, /Matrix: "\+matrix\+" · Underglow: "\+aux/);
assert.match(guestJs, /textContent="OFFLINE"/);
assert.match(guestJs, /Status unavailable/);
for (const vibe of ["chill", "groove", "heavy", "psychedelic", "cosmic"]) {
  assert.match(guestHtml, new RegExp(`data-value="${vibe}"`), `Guest page exposes approved ${vibe} name`);
}
assert.match(guestHtml, /data-guest-action="vibe_auto" data-vibe-control disabled/);
assert.match(guestJs, /phase2VibeRuntimeV1===true/);
assert.match(guestJs, /control\.hasAttribute\("data-vibe-control"\)/);
assert.match(guestHtml, /Vibes aren’t available right now/);
assert.doesNotMatch(guestHtml, /data-value="(?:mellow|moderate|energetic|peak)"/);

console.log("HBNF owner PWA package closure: PASS");
