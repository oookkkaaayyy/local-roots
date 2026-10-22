import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs",import.meta.url),"utf8");
assert.doesNotMatch(source,/\?\./,"Owner PWA feature path must parse in supported iOS 12 Safari");
assert.doesNotMatch(source,/\?\?/,"Owner PWA feature path must not use nullish coalescing on iOS 12");
const start=source.indexOf("async function showAcePot()");
const end=source.indexOf("function renderOta(j)",start);
assert.ok(start>=0&&end>start,"Show Ace Pot handler should be present");
const handler=source.slice(start,end);
const cacheStart=source.indexOf("function readLiveCache()");
const cacheEnd=source.indexOf("function updateDisplayedLiveSnapshot(response)",cacheStart);
assert.ok(cacheStart>=0&&cacheEnd>cacheStart,"bounded live-score cache reader should be present");
const cacheReader=source.slice(cacheStart,cacheEnd);
const revision="2026-10-21T18:30:00.000Z";

function fixture({read,cached}) {
  const calls=[];
  const feedback={feature:[],path:[],action:[],live:[]};
  const context={
    setFeatureStatus:value=>feedback.feature.push(value),
    canonicalRead:read,
    updateScoreNetworkTruth:(value,failed)=>calls.push(["truth",value,failed]),
    updateDisplayedLiveSnapshot:value=>{calls.push(["display",value]);return "Source row updated_at "+value.updated_at+".";},
    localStorage:{getItem:key=>key==="hbnf_cart_live_cache_v1"&&cached?JSON.stringify(cached):null},
    LIVE_CACHE_KEY:"hbnf_cart_live_cache_v1",
    LIVE_CACHE_MAX_MS:12*60*60*1000,
    renderLive:(...args)=>feedback.live.push(args),
    formatAcePotDisplay:()=>"ACE POT $5",
    canonicalOverlayBridge:()=>({overlay:async(...args)=>{calls.push(["overlay",...args]);}}),
    liveSourceRevisionText:value=>value?"Source row updated_at "+value+" (whole league_state row).":"Source row revision unverified.",
    renderScorePathStatus:value=>feedback.path.push(value),
    renderScoreActionStatus:value=>feedback.action.push(value),
  };
  vm.runInNewContext(cacheReader,context);
  vm.runInNewContext(handler,context);
  return {context,calls,feedback};
}

test("Show Ace Pot uses bounded cached live data offline and labels the Matrix text CACHED",async()=>{
  const cached={savedAt:new Date().toISOString(),updated_at:revision,live:{active:true,event:"glow",label:"Week 4",acePot:5,entries:[]}};
  const f=fixture({read:async()=>{throw new Error("WAN unavailable");},cached});
  await f.context.showAcePot();

  assert.equal(JSON.stringify(f.calls.find(x=>x[0]==="overlay")),JSON.stringify(["overlay","text",{text:"CACHED ACE POT $5",color:"#FFFFFF"},7000]));
  assert.equal(JSON.stringify(f.feedback.live[0]),JSON.stringify([cached.live,true,revision]));
  assert.match(f.feedback.path[0],/cloud: unavailable; using locally cached scores/);
  assert.match(f.feedback.path[0],new RegExp(revision));
  assert.match(f.feedback.path[0],/may be out of date/);
  assert.match(f.feedback.path[0],/physical display is not verified/);
  assert.match(f.feedback.feature[1],/Cached ace pot sent/);
});

test("Show Ace Pot refuses to send when cloud and bounded cache are both unavailable",async()=>{
  const f=fixture({read:async()=>{throw new Error("WAN unavailable");},cached:null});
  await assert.rejects(f.context.showAcePot(),/WAN unavailable/);
  assert.equal(f.calls.some(x=>x[0]==="overlay"),false);
  assert.match(f.feedback.path[0],/no cached live score snapshot is available/);
  assert.match(f.feedback.action[0],/No ace-pot command was sent/);
});

test("Show Ace Pot does not use an expired local snapshot",async()=>{
  const expired={savedAt:new Date(Date.now()-13*60*60*1000).toISOString(),updated_at:revision,live:{active:true,event:"glow",label:"Week 4",acePot:5,entries:[]}};
  const f=fixture({read:async()=>{throw new Error("WAN unavailable");},cached:expired});
  await assert.rejects(f.context.showAcePot(),/WAN unavailable/);
  assert.equal(f.calls.some(x=>x[0]==="overlay"),false);
  assert.match(f.feedback.path[0],/no cached live score snapshot is available/);
});

test("Show Ace Pot keeps the fresh online label and reports the exact source row revision",async()=>{
  const live={active:true,event:"glow",label:"Week 4",acePot:5,entries:[]};
  const f=fixture({read:async()=>({live,updated_at:revision}),cached:null});
  await f.context.showAcePot();
  assert.equal(JSON.stringify(f.calls.find(x=>x[0]==="overlay")),JSON.stringify(["overlay","text",{text:"ACE POT $5",color:"#FFFFFF"},7000]));
  assert.match(f.feedback.path[0],new RegExp(revision));
  assert.doesNotMatch(f.feedback.path[0],/CACHED/);
});
