import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(root, "firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp");
const patch = path.join(root, "firmware/phase2/brightness-r1/usermod_hbnf_foundation_v1.patch");
const helper = path.join(root, "firmware/phase2/brightness-r1/hbnf_brightness_output.h");
const manifest = JSON.parse(readFileSync(path.join(root, "firmware/phase2/brightness-r1/SOURCE_BINDING.json"), "utf8"));
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
assert.equal(hash(base), manifest.base_source_sha256);
assert.equal(hash(patch), manifest.patch_sha256);
assert.equal(hash(helper), manifest.helper_sha256);
const temp = mkdtempSync(path.join(os.tmpdir(), "hbnf-brightness-source-"));
try {
  const staged = path.join(temp, "usermod_hbnf_foundation_v1.cpp");
  copyFileSync(base, staged);
  execFileSync("patch", ["-s", "-p0", "-i", patch], { cwd: temp, stdio: "pipe" });
  copyFileSync(helper, path.join(temp, "hbnf_brightness_output.h"));
  const source = readFileSync(staged, "utf8");
  const brightness = readFileSync(helper, "utf8");
  assert.match(brightness, /always_inline[^\n]*scaleChannel/);
  assert.match(brightness, /always_inline[^\n]*scaleOutputPixel/);
  assert.match(source, /canonicalMatrixPixels\[ty\*32u\+tx\]=rendered;[\s\S]*?hbnfScaleMatrixOutput\(rendered,outputScale_\)/);
  assert.match(source, /canonicalMatrixPixels\[i\]=blend[\s\S]*?hbnfScaleMatrixOutput\(canonicalMatrixPixels\[i\],outputScale_\)/);
  assert.match(source, /const Rgb8 gammaCorrected=SEGMENT\.check2\?Rgb8\(gamma8\(canonical\.r\),gamma8\(canonical\.g\),gamma8\(canonical\.b\)\):canonical/);
  assert.doesNotMatch(source, /applyMatrixBrightness/);
  assert.equal(manifest.base_source_sha256.length, 64);
  assert.equal(manifest.base_firmware_sha256, "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c");

  const binary = path.join(temp, "brightness-test");
  execFileSync("c++", ["-std=c++11", path.join(root, "tests/hbnf_matrix_brightness_output.cpp"), "-o", binary], { stdio: "pipe" });
  execFileSync(binary, [], { stdio: "pipe" });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Matrix brightness output contract: PASS (canonical fixture unchanged at 0/1/8/20/64/128/255; patched R4 source applies brightness after canonical generation)");
