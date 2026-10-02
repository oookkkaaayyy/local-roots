import assert from "node:assert/strict";
import {canonicalPaletteTarget,canonicalPaletteCommand,paletteReadbackMatches} from "../hbnf-cart-core/domain/palette-projection.mjs";

assert.deepEqual(canonicalPaletteTarget("wled-12"),{kind:"palette",palette:12});
assert.deepEqual(canonicalPaletteTarget("solid-a1b2c3"),{kind:"solid",palette:0,color:"#A1B2C3"});
assert.deepEqual(canonicalPaletteTarget("hbnf-balanced"),{kind:"legacy",palette:null});
assert.equal(canonicalPaletteTarget("wled-999"),null);
assert.equal(canonicalPaletteTarget("nonsense"),null);

assert.deepEqual(
  canonicalPaletteCommand("wled-7",{effect:220,speed:144,intensity:200}),
  {kind:"palette",command:{action:"effect",effect:220,speed:144,intensity:200,palette:7,loadDefaults:false}}
);
assert.deepEqual(
  canonicalPaletteCommand("solid-00ff7f",{effect:221,speed:100,intensity:110}),
  {kind:"solid",command:{action:"effect",effect:221,speed:100,intensity:110,palette:0,loadDefaults:false,primaryColor:"#00FF7F"}}
);
assert.equal(paletteReadbackMatches("wled-7",{palette:7}),true);
assert.equal(paletteReadbackMatches("wled-7",{palette:8}),false);
assert.equal(paletteReadbackMatches("solid-00ff7f",{palette:0,color:[0,255,127]}),true);
assert.equal(paletteReadbackMatches("solid-00ff7f",{palette:0,color:[0,254,127]}),false);

console.log("HBNF canonical palette projection: PASS");
