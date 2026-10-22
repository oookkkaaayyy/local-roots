import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs",import.meta.url),"utf8");
assert.doesNotMatch(source,/\?\./,"live score UI must parse in the supported iOS 12 Safari target");
assert.doesNotMatch(source,/\?\?/,"live score UI must not use nullish coalescing on the iOS 12 target");
const displayStart=source.indexOf("function liveSourceRevisionText(updatedAt)");
const refreshStart=source.indexOf("async function refreshLive(silent)");
const refreshEnd=source.indexOf("async function showScoreboard()",refreshStart);
assert.ok(displayStart>=0&&refreshStart>displayStart&&refreshEnd>refreshStart,"live snapshot and refresh functions should be present");
const display=source.slice(displayStart,refreshStart);
const refresh=source.slice(refreshStart,refreshEnd);
const revision="2026-10-21T18:30:00.000Z";

function createContext(response) {
  const elements={featureLive:{textContent:""},scorePathStatus:{textContent:""},scoreActionStatus:{textContent:""}};
  const storage={};
  const statuses=[];
  const context={
    $:id=>elements[id],
    localStorage:{setItem:(key,value)=>storage[key]=value,getItem:key=>storage[key]||null},
    LIVE_CACHE_KEY:"hbnf-test-live-cache",
    LIVE_CACHE_MAX_MS:12*60*60*1000,
    formatAcePotDisplay:() => "ACE POT $5",
    matrixLocal:()=>true,
    matrixApiUrl:path=>path,
    fetchJson:async()=>({state:{HBNF:{liveSourceRevision:revision}}}),
    canonicalRead:async()=>response,
    updateScoreNetworkTruth:()=>{},
    setFeatureStatus:value=>statuses.push(value),
    renderScoreActionStatus:value=>elements.scoreActionStatus.textContent=value,
    liveRefreshInFlight:false,
    liveRefreshPending:false,
    liveRefreshPendingSilent:true,
    flushPendingLiveRefresh:()=>{},
  };
  vm.runInNewContext(display,context);
  return {context,elements,storage,statuses};
}

test("Refresh live keeps and reports the source row revision beside the displayed snapshot",async()=>{
  const response={live:{active:true,event:"skins",label:"Week 4",acePot:5,entries:["A / J +1"]},updated_at:revision};
  const {context,elements,storage}=createContext(response);
  vm.runInNewContext(refresh,context);
  await context.refreshLive(false);

  assert.match(elements.featureLive.textContent,new RegExp(revision));
  assert.match(elements.featureLive.textContent,/whole league_state row/);
  assert.match(elements.scorePathStatus.textContent,new RegExp(revision));
  assert.match(elements.scoreActionStatus.textContent,new RegExp(revision));
  assert.equal(JSON.parse(storage["hbnf-test-live-cache"]).updated_at,revision);
  assert.match(elements.scorePathStatus.textContent,/physical display is unverified/i);
});

test("source and locally reported Matrix revisions distinguish aligned, stale, and unknown",()=>{
  const start=source.indexOf("function compareLiveSourceRevision(");
  const end=source.indexOf("async function matrixLiveSourceRevisionStatus",start);
  const context={};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.compareLiveSourceRevision(revision,revision),"aligned");
  assert.equal(context.compareLiveSourceRevision(revision,"2026-10-21T18:29:59.000Z"),"stale");
  assert.equal(context.compareLiveSourceRevision(revision,null),"unknown");
  assert.equal(context.compareLiveSourceRevision(revision,"2026-10-21T18:30:01.000Z"),"unknown");
  assert.equal(context.compareLiveSourceRevision("2026-10-21T18:30:00.000001Z","2026-10-21T18:30:00.000999Z"),"unknown","sub-millisecond revisions are never falsely reported as aligned");
});

test("local Matrix readback reports matching, older, and unavailable source revisions truthfully",async()=>{
  const start=source.indexOf("async function matrixLiveSourceRevisionStatus(");
  const end=source.indexOf("function renderLive(",start);
  const context={matrixLocal:()=>true,matrixApiUrl:path=>path,fetchJson:async()=>({state:{HBNF:{liveSourceRevision:revision}}}),compareLiveSourceRevision:(a,b)=>a===b?"aligned":!b?"unknown":Date.parse(b)<Date.parse(a)?"stale":"unknown"};
  vm.runInNewContext(source.slice(start,end),context);
  assert.match(await context.matrixLiveSourceRevisionStatus(revision),/same source row revision/);
  context.fetchJson=async()=>({state:{HBNF:{liveSourceRevision:"2026-10-21T18:29:00.000Z"}}});
  assert.match(await context.matrixLiveSourceRevisionStatus(revision),/older source row revision/);
  context.fetchJson=async()=>({state:{HBNF:{}}});
  assert.match(await context.matrixLiveSourceRevisionStatus(revision),/readback is unknown/);
  context.fetchJson=async()=>{throw new Error("offline")};
  assert.match(await context.matrixLiveSourceRevisionStatus(revision),/readback is unavailable/);
});

test("missing or invalid updated_at remains explicitly unverified in the displayed/cache snapshot",()=>{
  const {context,elements,storage}=createContext({live:{active:true,event:"glow",label:"Week 5",acePot:5,entries:[]},updated_at:null});
  context.updateDisplayedLiveSnapshot({live:{active:true,event:"glow",label:"Week 5",acePot:5,entries:[]},updated_at:null});
  assert.match(elements.featureLive.textContent,/Source row revision unverified/);
  assert.equal(JSON.parse(storage["hbnf-test-live-cache"]).updated_at,null);

  context.renderLive({active:true,event:"glow",label:"Week 5",acePot:5,entries:[]},false,"not-a-timestamp");
  assert.match(elements.featureLive.textContent,/Source row revision unverified/);
});

test("Show Scores and Show Ace Pot associate their source read with the visible snapshot",()=>{
  const scoreboardStart=source.indexOf("async function showScoreboard()");
  const scoreboardEnd=source.indexOf("async function showManualScoreboard()",scoreboardStart);
  const aceStart=source.indexOf("async function showAcePot()");
  const aceEnd=source.indexOf("function renderOta(j)",aceStart);
  assert.match(source.slice(scoreboardStart,scoreboardEnd),/sourceRevision=updateDisplayedLiveSnapshot\(out\)/);
  assert.match(source.slice(aceStart,aceEnd),/updateDisplayedLiveSnapshot\(out\)/);
  assert.match(source.slice(aceStart,aceEnd),/liveSourceRevisionText\(out && out\.updated_at\)/);
});
