import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const source = read("firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp");
const ui = read("firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_local_ui.h");
const release = "hbnf-cart2-phase2-r6-vibe-first-ui-20261012";
const base = "hbnf-cart2-phase2-r6-incremental-controls-20261011";
const sha = "8afb21b9db6a03420fd6683507ee192168d8f6a13384e308f117911b5bdc6c5d";

assert.match(source, new RegExp(`HBNF_CANDIDATE[^\\n]*${release}`));
assert.match(source, new RegExp(`\\\\"candidate\\\\":\\\\"${release}\\\\"`));
assert.match(source, new RegExp(`\\\\"release_id\\\\":\\\\"${release}\\\\"`));
assert.match(source, new RegExp(`\\\\"basedOnReleaseId\\\\":\\\\"${base}\\\\"`));
assert.match(source, new RegExp(`\\\\"basedOnFirmwareSha256\\\\":\\\\"${sha}\\\\"`));
for (const feature of ["vibe-first-local-ui-v1", "foundation-vibe-audio-r5-unfrozen", "phase2-brightness-output-v1"]) {
  assert.ok(source.includes(feature), `embedded build identity lists ${feature}`);
}
for (const expected of ["<summary>System Info</summary>", "Animation Mix", "Balanced", "Upbeat", "Signature", "Ambient", 'data-vibe="chill"', 'id="matrix"', 'id="aux"']) {
  assert.ok(ui.includes(expected), `embedded local UI contains ${expected}`);
}
assert.match(ui, /Advanced palettes|Color options/);
assert.match(ui, /same 28 animation kernels/);
assert.match(source, /HBNF_LOCAL_UI/);
assert.doesNotMatch(source, /arcade-runtime|maze-chase|snake-game/i);

console.log("PASS: unique R6 UI candidate identity, exact installed base binding, and embedded Vibe-first UI source");
