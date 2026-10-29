import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs",import.meta.url),"utf8");
const start=source.indexOf("function paletteCommandId(");
const end=source.indexOf("function readSavedLooks()",start);
assert.ok(start>=0&&end>start,"palette action implementation must be present");
const paletteActions=source.slice(start,end);

function fixture(){
  let current="legacy";
  let sendCount=0;
  const commands=[];
  const feedback=[];
  const bridge={
    refresh:async()=>({desired:{state:{paletteId:current}}}),
    command:async(name,payload)=>{
      commands.push([name,payload]);
      sendCount++;
      current=sendCount===1?"wled-unexpected":payload.paletteId==="hbnf-balanced"?"legacy":payload.paletteId;
    },
  };
  const context={
    canonicalBridge:()=>bridge,
    canonicalCapabilities:()=>({canonicalPaletteIntentV1:true}),
    paletteIdFromControls:()=>"wled-7",
    desiredState:snapshot=>snapshot&&snapshot.desired&&snapshot.desired.state?snapshot.desired.state:null,
    renderPaletteStatus:message=>feedback.push(message),
    setFeatureStatus:message=>feedback.push(message),
  };
  vm.runInNewContext(paletteActions,context);
  return {context,commands,feedback};
}

test("documented legacy palette alias is used for rollback and read back as legacy",async()=>{
  const f=fixture();
  await assert.rejects(f.context.applyPalette(),/Palette was not confirmed/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)),[
    ["PALETTE",{paletteId:"wled-7"}],
    ["PALETTE",{paletteId:"hbnf-balanced"}],
  ]);
  assert.match(f.feedback.at(-1),/Previous palette restored and read back/);
});

test("legacy rollback alias does not rewrite explicit palette IDs",()=>{
  const f=fixture();
  assert.equal(f.context.paletteCommandId("legacy"),"hbnf-balanced");
  assert.equal(f.context.paletteCommandId("wled-17"),"wled-17");
});
