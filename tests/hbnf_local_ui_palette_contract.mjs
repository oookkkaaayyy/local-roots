import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ui=readFileSync(new URL("../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_local_ui.h",import.meta.url),"utf8");
assert.match(ui,/<select id="paletteSelect" disabled>/);
assert.doesNotMatch(ui,/id="paletteIndex"/);
assert.match(ui,/fetch\("\/json\/pal"/);
assert.match(ui,/fetch\("\/json\/palx\?page="/);
assert.match(ui,/canonicalCommand\("PALETTE"/);
assert.match(ui,/paletteSegmentsMatch\(state,Number\(\$\("#paletteSelect"\)\.value\)\)/);
assert.match(ui,/Matrix state confirmed/);
assert.match(ui,/min-height:44px;touch-action:manipulation/);
assert.match(ui,/<header><h1>HBNF Cart<\/h1><span id="conn" class="badge bad">MATRIX LOCAL/);
assert.match(ui,/<details class="panel wide-panel system-panel" id="cartStatus">[\s\S]*?<summary>System Info<\/summary>/);
assert.doesNotMatch(ui,/NOT REPORTED|WAN \/ LIVE DATA UNAVAILABLE/);
assert.match(ui,/AUX physical illumination<\/span><span id="auxTruth" class="status-value unknown">Not verified here/);
assert.match(ui,/DDP or a command acknowledgement does not confirm physical AUX illumination/);
assert.match(ui,/<details class="panel scene-panel">[\s\S]*?<summary><span class="details-title">Animation Mix<\/span><\/summary>/);
for(const [id,label] of [["course-flow","Balanced"],["field-mix","Upbeat"],["hbnf-signature","Signature"],["quiet-cosmos","Ambient"]]){
  assert.match(ui,new RegExp(`data-scene="${id}"[^>]*>${label}`));
}
assert.match(ui,/same 28 animation kernels/);
assert.match(ui,/45–90s between variants/);
assert.match(ui,/40–80s holds/);
assert.match(ui,/50–100s holds/);
assert.match(ui,/60–120s holds/);
assert.match(ui,/const defaults=\{scene:"course-flow"/);
assert.match(ui,/const state=Object\.assign\(\{\},defaults,stored\)/,"saved mix selection overrides new-user Balanced default");
assert.match(ui,/Automatic · cart color/);
assert.match(ui,/Existing saved color settings are preserved/);
assert.match(ui,/\.palette-panel"\)\.addEventListener\("toggle"/,"palette list is loaded only when its advanced disclosure is opened");
assert.doesNotMatch(ui,/^loadNamedPalettes\(\);/m);
assert.match(ui,/data-vibe="chill"[\s\S]*data-vibe="auto"/);
assert.match(ui,/id="matrix" type="range"/);
assert.match(ui,/id="aux" type="range"/);
assert.match(ui,/id="motion" type="range"[\s\S]*id="audio" type="range"/);
assert.match(ui,/id="sendOverlayText"/);

console.log("HBNF local UX hierarchy, preserved palette path, device-status truth, and control mapping: PASS");
