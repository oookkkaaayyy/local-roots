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

console.log("HBNF local named palette, readback, and touch control contract: PASS");
