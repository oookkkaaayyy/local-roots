// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"")+"/functions/v1";
const PWA_BASE="https://hbnightflyers.com";
const EXPECTED={
  release:"hbnf-wow-r3-max-2026-09-21-v3",
  sceneCount:28,
  matrixUiMarker:"hbnf-fallback-wow-max-v3.1",
  fullPwaMarker:"hbnf-build-9.21.26-wow-max-v3-full",
  fullPwaAssetVersion:"9.21.26-wow-max-v3-full",
  fullPwaManifestName:"HBNF Matrix WOW MAX Course Console",
  watchControlVersion:"wow-max-v3-audio-aux-ready",
  watchScoreVersion:"wow-max-v3-compatible-score",
  dispatcherVersion:"wow-max-v1"
};
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
async function get(path:string){const r=await fetch(BASE+"/"+path,{signal:AbortSignal.timeout(9000),cache:"no-store"});const t=await r.text();return{ok:r.ok,status:r.status,text:t,json:(()=>{try{return JSON.parse(t)}catch{return null}})()};}
async function getExternal(path:string){const sep=path.includes("?")?"&":"?";const r=await fetch(PWA_BASE+path+sep+"release_doctor="+Date.now(),{signal:AbortSignal.timeout(9000),cache:"no-store",headers:{"Cache-Control":"no-cache"}});const t=await r.text();return{ok:r.ok,status:r.status,text:t,json:(()=>{try{return JSON.parse(t)}catch{return null}})()};}
async function post(path:string,body:any){const r=await fetch(BASE+"/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:"no-store"});const t=await r.text();return{ok:r.ok,status:r.status,text:t,json:(()=>{try{return JSON.parse(t)}catch{return null}})()};}
function hasAll(have:any,need:string[]){const s=new Set(Array.isArray(have)?have:[]);return need.every(x=>s.has(x));}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET"&&req.method!=="POST")return json({ok:false,error:"GET or POST required"},405);

 const [pre,status,eventTest,watchCtl,watchScore,dispatcher,ui,aux,cart,pwaHtml,pwaJs,pwaManifest]=await Promise.all([
  post("hbnf-matrix-control",{action:"release_preflight"}),
  post("hbnf-matrix-control",{action:"status"}),
  post("hbnf-matrix-control",{action:"wow_event_selftest"}),
  get("hbnf-watch-control"),
  get("hbnf-watch-score"),
  get("hbnf-cinematic-dispatcher"),
  get("hbnf-matrix-ui"),
  get("hbnf-aux-control"),
  get("hbnf-cart-orchestrator"),
  getExternal("/matrix.html"),
  getExternal("/matrix-control.js"),
  getExternal("/matrix-manifest.webmanifest")
 ]);

 const pwaVersion=EXPECTED.fullPwaAssetVersion;
 const checks:any={
  matrixControlReachable:pre.ok&&status.ok,
  releaseContract:pre.json?.targetRelease===EXPECTED.release&&Number(pre.json?.targetSceneCount)===EXPECTED.sceneCount,
  semanticEvents:eventTest.ok&&eventTest.json?.ok===true&&Array.isArray(eventTest.json?.events)&&eventTest.json.events.length>=6,
  watchControl:watchCtl.ok&&watchCtl.json?.service==="hbnf-watch-control"&&watchCtl.json?.version===EXPECTED.watchControlVersion&&hasAll(watchCtl.json?.actions,["status","next","scoreboard","ace_pot","ace","nice_shot","nice_putt","ctp","skins","glow","text","blackout","brightness","aux_status","uv_full","uv_off","cart_showcase","cart_all_off"]),
  watchScore:watchScore.ok&&watchScore.json?.service==="hbnf-watch-score"&&watchScore.json?.version===EXPECTED.watchScoreVersion&&hasAll(watchScore.json?.actions,["state","score","set","undo","clear"]),
  cinematicDispatcher:dispatcher.ok&&dispatcher.json?.service==="hbnf-cinematic-dispatcher"&&dispatcher.json?.version===EXPECTED.dispatcherVersion&&Array.isArray(dispatcher.json?.revisions)&&dispatcher.json.revisions.includes(EXPECTED.release),
  fallbackUi:ui.ok&&ui.text.includes(EXPECTED.matrixUiMarker),
  fallbackUiSelectors:ui.ok&&ui.text.includes("data-bri=")&&ui.text.includes("data-cart=")&&ui.text.includes("data-uv=")&&ui.text.includes("busy=true")&&ui.text.includes("data-cart=\"showcase\""),
  fullPwaHtml:pwaHtml.ok&&pwaHtml.text.includes(EXPECTED.fullPwaMarker)&&pwaHtml.text.includes("matrix-control.js?v="+pwaVersion)&&pwaHtml.text.includes("matrix-manifest.webmanifest?v="+pwaVersion)&&!pwaHtml.text.includes("v=9.17.26_3"),
  fullPwaJs:pwaJs.ok&&pwaJs.text.includes(EXPECTED.fullPwaMarker)&&pwaJs.text.includes(EXPECTED.release)&&pwaJs.text.includes("quick_event")&&pwaJs.text.includes("Math.min(255")&&pwaJs.text.includes("confirmHigh"),
  fullPwaManifest:pwaManifest.ok&&pwaManifest.json?.name===EXPECTED.fullPwaManifestName&&pwaManifest.json?.id==="/matrix.html"&&pwaManifest.json?.start_url==="/matrix.html"&&pwaManifest.json?.display==="standalone",
  auxStaging:aux.ok&&aux.json?.service==="hbnf-aux-control"&&aux.json?.enabled===false&&aux.json?.policy?.mixedLoadAccepted===false&&aux.json?.selfTest?.ok===true&&Number(aux.json?.selfTest?.globalOffPreset)===223&&Number(aux.json?.selfTest?.uvOffReturnsToPreset)===200,
  cartStaging:cart.ok&&cart.json?.service==="hbnf-cart-orchestrator"&&cart.json?.auxEnabled===false&&cart.json?.mixedLoadAccepted===false&&cart.json?.safety?.globalOffAvailableWhenAuxDisabled===true&&cart.json?.safety?.startOrder==="matrix-then-aux"
 };
 const cloudReady=Object.values(checks).every(Boolean);
 const blockers=Array.isArray(pre.json?.blockers)?pre.json.blockers:[];
 const matrixOnline=pre.json?.deviceOnline===true;
 const physicalOnlyBlockers=blockers.every((x:string)=>x==="mqtt_lwt_not_online");
 const awaitingPhysicalOnly=cloudReady&&!matrixOnline&&physicalOnlyBlockers;
 const goLiveReady=cloudReady&&pre.json?.ready===true;
 return json({
  ok:cloudReady,
  service:"hbnf-release-doctor",
  version:"wow-v3-doctor-6-current-ui-contract",
  expected:EXPECTED,
  cloudReady,
  matrixOnline,
  goLiveReady,
  awaitingPhysicalOnly,
  blockers,
  checks,
  fullPwa:{htmlStatus:pwaHtml.status,jsStatus:pwaJs.status,manifestStatus:pwaManifest.status},
  matrix:{preflight:pre.json,status:status.json},
  aux:{prepared:aux.json?.ok===true,enabled:aux.json?.enabled===true,mixedLoadAccepted:aux.json?.policy?.mixedLoadAccepted===true},
  next:goLiveReady?"run-go-live":(awaitingPhysicalOnly?"power-matrix-and-run-go-live":"repair-cloud-contract")
 },cloudReady?200:503);
});
