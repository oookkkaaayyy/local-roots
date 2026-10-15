import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { AUX_IP, MATRIX_IP, MATRIX_MAC, SUPPORTED_RELEASE, LOCAL_PAGE_URL, LocalMatrixTransport, controlsEnabled, auxStatus, buildPatch, stateMatches, getJson } from "../local-transport.js";
const state=(HBNF={},seg=[])=>({HBNF:{candidate:SUPPORTED_RELEASE,...HBNF},seg});
test("fixed LAN target and installed release are explicit",()=>{assert.equal(MATRIX_IP,"192.168.77.10");assert.equal(AUX_IP,"192.168.77.11");assert.equal(SUPPORTED_RELEASE,"hbnf-cart2-phase2-r6-skins-readable-20261014")});
test("Mission Control actions map to existing local HBNF fields",()=>{assert.deepEqual(buildPatch("TUNE",{matrixBrightness:69}),{matrixBrightness:69});assert.deepEqual(buildPatch("TUNE",{auxBrightness:255}),{auxBrightness:255});assert.deepEqual(buildPatch("TUNE",{motion:50,audioResponse:50}),{motion:50,audioResponse:50});assert.deepEqual(buildPatch("SCENE",{sceneId:"quiet-cosmos"}),{scene:"quiet-cosmos"});assert.deepEqual(buildPatch("VIBE",{vibe:"auto"}),{vibe:5});assert.deepEqual(buildPatch("PALETTE",{paletteId:"wled-25"}),{palette:{mode:"wled",index:25}});assert.deepEqual(buildPatch("PALETTE",{paletteId:"solid-12a0ff"}),{palette:{mode:"solid",rgb:[18,160,255]}});assert.deepEqual(buildPatch("OVERLAY_START",{overlayId:"safe-id",kind:"text",ttlMs:8000,data:{text:"Hello",color:"#ffffff"}}),{overlay:{id:"safe-id",kind:"text",ttlMs:8000,text:"Hello",color:"#FFFFFF"}});assert.deepEqual(buildPatch("TUNE",{matrixBrightness:0,auxBrightness:0}),{matrixBrightness:0,auxBrightness:0})});
test("unknown commands and invalid values fail closed",()=>{for(const[type,p]of[["OFF",{}],["NEXT",{}],["GUEST_MODE",{}],["TUNE",{auxBrightness:256}],["TUNE",{motion:101}],["VIBE",{vibe:"nope"}],["PALETTE",{paletteId:"wled-999"}],["OVERLAY_START",{overlayId:"id",kind:"scoreboard",ttlMs:8000}]])assert.throws(()=>buildPatch(type,p))});
test("readback is exact, fresh state must match WLED palette segment too",()=>{assert.equal(stateMatches(state({matrixBrightness:69}),{matrixBrightness:69}),true);assert.equal(stateMatches(state({matrixBrightness:68}),{matrixBrightness:69}),false);const p={mode:"wled",index:25};assert.equal(stateMatches(state({palette:p},[{id:0,pal:25}]),{palette:p}),true);assert.equal(stateMatches(state({palette:p},[{id:0,pal:24}]),{palette:p}),false);assert.equal(stateMatches(state({overlayId:"safe-id"}),{overlay:{id:"safe-id"}}),true);assert.equal(stateMatches(state({}),{overlay:null}),true)});
test("AUX DDP readback is distinct from physical illumination",()=>{const a=auxStatus({mac:"8c94df55c34c",live:true,lm:"DDP",lip:MATRIX_IP},{bri:255,on:true});assert.equal(a.reachable,true);assert.equal(a.ddp,true);assert.equal(a.brightness,255);assert.equal(a.physical,"unverified");assert.equal(auxStatus({mac:"8c94df55c34c",live:false},{bri:255,on:true}).ddp,false);assert.equal(auxStatus(null,null).reachable,false)});
class FakeSocket{constructor(){this.readyState=0;this.sent=[]}send(v){this.sent.push(v)}open(){this.readyState=1;this.onopen?.()}update(v){this.onmessage?.({data:JSON.stringify({state:v})})}close(){this.readyState=3;this.onclose?.()}}
test("command-to-state path waits for matching Matrix readback",async()=>{const socket=new FakeSocket(),t=new LocalMatrixTransport({socketFactory:()=>socket,timeoutMs:80});t.connect();socket.open();socket.update(state({matrixBrightness:69}));t.verifyIdentity({mac:MATRIX_MAC});const p=t.command("TUNE",{matrixBrightness:70});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(JSON.parse(socket.sent.at(-2)),{HBNF:{matrixBrightness:70}});assert.equal(socket.sent.at(-1),'{"v":true}');let done=false;p.finally(()=>done=true);socket.update(state({matrixBrightness:69}));await new Promise(r=>setTimeout(r,5));assert.equal(done,false);socket.update(state({matrixBrightness:70}));assert.equal((await p).HBNF.matrixBrightness,70)});
test("unsupported runtime identity sends no command",async()=>{const socket=new FakeSocket(),t=new LocalMatrixTransport({socketFactory:()=>socket,timeoutMs:30});t.connect();socket.open();socket.update(state({candidate:"other-release"}));await assert.rejects(t.command("TUNE",{matrixBrightness:1}),/Fresh Matrix release/);assert.equal(socket.sent.some(v=>v.includes('"matrixBrightness":1')),false)});

test("wrong Matrix MAC is never command-ready",()=>{const socket=new FakeSocket(),t=new LocalMatrixTransport({socketFactory:()=>socket});t.connect();socket.open();socket.update(state({matrixBrightness:69}));assert.equal(t.verifyIdentity({mac:"001122334455"}),false);assert.equal(t.controlReady(),false);assert.equal(t.verifyIdentity({mac:MATRIX_MAC}),true);assert.equal(t.controlReady(),true)});

test("app verifies the expected MAC before its state can enable controls",async()=>{const app=await readFile(new URL("../app.js",import.meta.url),"utf8");assert.match(app,/matrixInfo=await getJson\(matrixUrl\+"\/json\/info"\);if\(String\(matrixInfo\.mac\|\|""\)\.toLowerCase\(\)!==MATRIX_MAC\)throw Error\("Unexpected Matrix identity\."\);if\(!transport\|\|!transport\.verifyIdentity\(matrixInfo\)\)/)});

test("UI control gate enables only with valid release, identity, and fresh connection",()=>{const socket=new FakeSocket(),t=new LocalMatrixTransport({socketFactory:()=>socket});t.connect();socket.open();socket.update(state({matrixBrightness:69}));assert.equal(controlsEnabled(true,t.snapshot.HBNF.candidate===SUPPORTED_RELEASE,t.controlReady()),false);assert.equal(t.verifyIdentity({mac:MATRIX_MAC}),true);assert.equal(controlsEnabled(true,t.snapshot.HBNF.candidate===SUPPORTED_RELEASE,t.controlReady()),true);assert.equal(t.verifyIdentity({mac:"001122334455"}),false);assert.equal(controlsEnabled(true,t.snapshot.HBNF.candidate===SUPPORTED_RELEASE,t.controlReady()),false)});

test("UI control gate disables stale/disconnected state and recovers after reconnect",()=>{const sockets=[],t=new LocalMatrixTransport({socketFactory:()=>{const s=new FakeSocket();sockets.push(s);return s}});t.connect();sockets[0].open();sockets[0].update(state({matrixBrightness:69}));t.verifyIdentity({mac:MATRIX_MAC});assert.equal(controlsEnabled(true,true,t.controlReady()),true);t.snapshotAt=Date.now()-15001;assert.equal(controlsEnabled(true,true,t.controlReady()),false);sockets[0].close();assert.equal(controlsEnabled(true,true,t.controlReady()),false);t.connect();sockets[1].open();sockets[1].update(state({matrixBrightness:69}));t.verifyIdentity({mac:MATRIX_MAC});assert.equal(controlsEnabled(true,true,t.controlReady()),true)});

test("local package has no cloud, scoring, or OTA runtime imports", async () => {
  const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
  const installer=await readFile(new URL("../install.sh",import.meta.url),"utf8");
  assert.match(html,/\.\/app\.js/);
  assert.equal(LOCAL_PAGE_URL,"http://192.168.77.1/mission-control-local/index.html");
  assert.match(installer,/Open http:\/\/192\.168\.77\.1\/mission-control-local\/index\.html/);
  assert.match(app,/if\(String\(matrixInfo\.mac\|\|""\)\.toLowerCase\(\)!==MATRIX_MAC\)throw Error\("Unexpected Matrix identity\."\);if\(!transport\|\|!transport\.verifyIdentity\(matrixInfo\)\)/);
  assert.doesNotMatch(html,/hbnf-cart-(?:skins-score|features)|supabase\.co|serviceWorker/);
  assert.doesNotMatch(app,/supabase\.co|league_state|functions\/v1|OTA/);
});

class FakeXhr {
  constructor(){this.calls=[];this.status=0;this.responseText="";}
  open(method,url,async){this.calls.push({method,url,async});}
  send(){this.sent=true;}
  respond(status,value){this.status=status;this.responseText=JSON.stringify(value);this.onload();}
}
test("local JSON reads are credential-free GETs with native bounded XHR timeout",async()=>{
  const xhr=new FakeXhr(),promise=getJson("http://192.168.77.10/json/info",2500,()=>xhr);
  assert.deepEqual(xhr.calls,[{method:"GET",url:"http://192.168.77.10/json/info",async:true}]);
  assert.equal(xhr.timeout,2500);assert.equal(xhr.withCredentials,false);assert.equal(xhr.sent,true);
  xhr.respond(200,{mac:MATRIX_MAC});assert.deepEqual(await promise,{mac:MATRIX_MAC});
});
test("local JSON reads fail closed on HTTP, timeout, and malformed JSON",async()=>{
  const http=new FakeXhr(),httpPromise=getJson("http://opal.invalid/status",50,()=>http);http.respond(503,{});await assert.rejects(httpPromise,/HTTP 503/);
  const timeout=new FakeXhr(),timeoutPromise=getJson("http://opal.invalid/status",50,()=>timeout);timeout.ontimeout();await assert.rejects(timeoutPromise,/timed out after 50 ms/);
  const malformed=new FakeXhr(),malformedPromise=getJson("http://opal.invalid/status",50,()=>malformed);malformed.status=200;malformed.responseText="not json";malformed.onload();await assert.rejects(malformedPromise,/Invalid JSON response/);
});

const ios12ForbiddenFeatures=[
  ["optional chaining",/\?\./],
  ["nullish coalescing",/\?\?/],
  ["private class element",/(?:^|[;{}])\s*#[A-Za-z_$][\w$]*\s*(?:\(|=|;)/m],
  ["private element access",/\.\s*#[A-Za-z_$][\w$]*/],
  ["globalThis",/\bglobalThis\b/],
  ["Element.replaceChildren",/\breplaceChildren\b/],
  ["AbortController fetch timeout",/\bAbortController\b/],
  ["crypto.randomUUID",/\bcrypto\.randomUUID\b/],
  ["Array.prototype.at",/\.\s*at\s*\(/],
  ["newer Array methods",/\.(?:findLast|findLastIndex|toSorted|toReversed)\s*\(/],
  ["Promise.allSettled",/\bPromise\.allSettled\b/],
  ["Object.fromEntries",/\bObject\.fromEntries\b/],
  ["Object.hasOwn",/\bObject\.hasOwn\b/],
  ["String.replaceAll",/\.replaceAll\s*\(/],
  ["structuredClone",/\bstructuredClone\b/]
];
function ios12CompatibilityIssues(source){return ios12ForbiddenFeatures.filter(([,pattern])=>pattern.test(source)).map(([name])=>name);}
test("iOS 12 Safari compatibility gate covers the actual browser module path",async()=>{
  const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
  const transport=await readFile(new URL("../local-transport.js",import.meta.url),"utf8");
  const html=await readFile(new URL("../tests/browser-regression.html",import.meta.url),"utf8");
  const entry=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const inline=(html.match(/<script type="module">([\s\S]*?)<\/script>/)||[])[1];
  assert.ok(inline,"iOS 12 browser regression module must be present");
  assert.match(entry,/<script type="module" src="\.\/app\.js"><\/script>/);
  for(const [name,source] of [["app.js",app],["local-transport.js",transport],["browser regression module",inline]])assert.deepEqual(ios12CompatibilityIssues(source),[],name+" uses unsupported iOS 12 syntax/API");
});
test("iOS 12 compatibility gate catches the previously escaping syntax and API",()=>{
  for(const source of ["const x = value?.child;","const x = value ?? fallback;","class C { #run() {} }","element.replaceChildren();","globalThis.crypto;","new AbortController();","items.at(-1);","Promise.allSettled([]);","Object.fromEntries([]);","crypto.randomUUID();"]){assert.ok(ios12CompatibilityIssues(source).length>0,"gate missed: "+source)}
});

test("static-file update and exact v1.0.0 rollback rehearse without touching /www",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"hbnf-mission-control-update-"));
  try{
    const packageSource=fileURLToPath(new URL("..",import.meta.url));
    const oldArchive=fileURLToPath(new URL("../../hbnf-opal-mission-control-local-v1.0.0.zip",import.meta.url));
    const packageCopy=join(temp,"package","mission-control-local"),www=join(temp,"www"),root=join(temp,"root"),target=join(www,"mission-control-local"),backup=join(root,"hbnf-mission-control-local.rollback-v1.0.0"),bin=join(temp,"bin");
    await cp(packageSource,packageCopy,{recursive:true});await mkdir(target,{recursive:true});await mkdir(root);await mkdir(bin);
    for(const name of ["index.html","styles.css","app.js","local-transport.js","rollback.sh"]){const bytes=execFileSync("unzip",["-p",oldArchive,"mission-control-local/"+name]);await writeFile(join(target,name),bytes)}
    await writeFile(join(target,".hbnf-package-marker"),"hbnf-owner-mission-control-local-v1\n");
    const shim="#!/bin/sh\nif [ \"$1\" = \"-c\" ]; then failed=0; while read expected name; do actual=$(shasum -a 256 \"$name\" | awk '{print $1}'); if [ \"$actual\" != \"$expected\" ]; then echo \"$name: FAILED\"; failed=1; fi; done < \"$2\"; exit \"$failed\"; fi\nshasum -a 256 \"$1\"\n";
    await writeFile(join(bin,"sha256sum"),shim,{mode:0o755});
    const scriptEnv={...process.env,PATH:bin+":"+process.env.PATH};
    const patchInstaller=async(name)=>{let source=await readFile(join(packageCopy,name),"utf8");source=source.replace("ROOT=/www","ROOT="+www).replace("BACKUP=/root/hbnf-mission-control-local.rollback-v1.0.0","BACKUP="+backup).replace('[ "$(id -u)" = 0 ]','[ "0" = 0 ]');await writeFile(join(packageCopy,name),source)};
    await patchInstaller("update.sh");
    const sums=execFileSync("shasum",["-a","256","app.js","index.html","install.sh","local-transport.js","manifest.json","rollback.sh","rollback-update.sh","styles.css","tests/local-transport.test.mjs","tests/browser-regression.html","update.sh"],{cwd:packageCopy,encoding:"utf8"});
    await writeFile(join(packageCopy,"SHA256SUMS"),sums);
    execFileSync("sh",[join(packageCopy,"update.sh")],{cwd:packageCopy,env:scriptEnv,encoding:"utf8"});
    assert.equal((await readFile(join(target,".hbnf-package-version"),"utf8")).trim(),"1.0.1");
    assert.equal(await readFile(join(target,"app.js"),"utf8"),await readFile(join(packageCopy,"app.js"),"utf8"));
    assert.equal(await readFile(join(backup,"app.js"),"utf8"),execFileSync("unzip",["-p",oldArchive,"mission-control-local/app.js"],{encoding:"utf8"}));
    await patchInstaller("rollback-update.sh");
    execFileSync("sh",[join(packageCopy,"rollback-update.sh")],{cwd:packageCopy,env:scriptEnv,encoding:"utf8"});
    assert.equal(await readFile(join(target,"app.js"),"utf8"),execFileSync("unzip",["-p",oldArchive,"mission-control-local/app.js"],{encoding:"utf8"}));
    await assert.rejects(readFile(backup));
  }finally{await rm(temp,{recursive:true,force:true})}
});
