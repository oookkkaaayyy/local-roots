import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {patchedFiles, changedFileNames} from "../release/c9-parity-paired-tune-next.REVIEW_ONLY.mjs";

const patched=patchedFiles();
test("next increment is isolated from immutable six-asset C9 source",()=>{
 assert.deepEqual(changedFileNames, ["hbnf-cart.js","hbnf-cart-local.js"]);
 const unchanged=readFileSync(new URL("../opal/owner-v1201-7target/owner-pwa/hbnf-cart-local.js",import.meta.url),"utf8");
 assert.notEqual(patched["hbnf-cart-local.js"],unchanged);
 assert.match(unchanged,/if \(this\.opalDirect && type === "TUNE"/);
 assert.match(patched["hbnf-cart.js"],/changedFields: changedFields,/);
 assert.match(patched["hbnf-cart.js"],/supports\(body\.type, body\.payload, body\.changedFields\)/);
 assert.match(patched["hbnf-cart.js"],/command\(token, body\.type, body\.payload, body\.changedFields\)/);
});

const dependency='import { fetchWithDeadline, HBNF_API_TIMEOUT_MS } from "./hbnf-cart-net.js?v=20261015-local-owner-v3";';
assert.equal(patched["hbnf-cart-local.js"].split(dependency).length,2);
const forTest=patched["hbnf-cart-local.js"].replace(dependency,
  'const fetchWithDeadline = () => { throw Error("stub"); }; const HBNF_API_TIMEOUT_MS=5000;');
const {LocalOwnerControl}=await import("data:text/javascript;base64,"+Buffer.from(forTest).toString("base64"));
const supported=new Set(["matrixBrightness","auxBrightness","motion","audioResponse"]);
const owner=new LocalOwnerControl({opalDirect:false});
owner.module={buildPatch:(type,payload)=>{
 assert.equal(type,"TUNE");
 const values=Object.fromEntries(Object.entries(payload).filter(([key])=>supported.has(key)));
 if(!Object.keys(values).length)throw Error("no supported field");
 return values;
}};
test("unsupported semantic field never gets acknowledged by partial paired-local transport",()=>{
 const p={motion:64,audioResponse:75,energy:98,variation:100,micSensitivity:255};
 assert.equal(owner.supports("TUNE",p,["energy"]),false);
 assert.equal(owner.supports("TUNE",p,["variation"]),false);
 assert.equal(owner.supports("TUNE",p,["micSensitivity"]),false);
 assert.equal(owner.supports("TUNE",p,["motion","variation"]),false);
 assert.equal(owner.supports("TUNE",p),false,"full composite payload may not silently drop semantics");
 assert.equal(owner.supports("TUNE",p,["motion"]),true);
 assert.equal(owner.supports("TUNE",p,["audioResponse"]),true);
 assert.equal(owner.supports("TUNE",{motion:12}),true);
 assert.equal(owner.supports("TUNE",p,["unrecognized"]),false);
 assert.equal(owner.supports("TUNE",p,["auxBrightness"]),false,"field must exist in payload");
});
test("paired-local command sends only changed supported fields, never stale companion sliders",async()=>{
 const calls=[];
 owner.token="paired-token";
 owner.transport={
  controlReady:()=>true,
  snapshotVersion:33,
  snapshot:{HBNF:{matrixBrightness:19,auxBrightness:35}},
  command:async(type,payload)=>{
   calls.push({type,payload});
   return {HBNF:{matrixBrightness:19,auxBrightness:35,motion:payload.motion||60}};
  }
 };
 owner.ensureSession=async()=>{};
 owner.readAux=async()=>{owner.auxInfo={live:true,lm:"DDP",lip:"192.168.77.10"};owner.auxState={bri:35,on:true};};
 owner.scheduleLocalReconciliation=()=>{};
 owner.auxInfo={live:true,lm:"DDP",lip:"192.168.77.10"};
 owner.auxState={bri:35,on:true};
 const full={energy:95,variation:90,micSensitivity:210,auxBrightness:80,matrixBrightness:40,motion:65,audioResponse:33};
 const result=await owner.commandNow("paired-token","TUNE",full,["motion"]);
 assert.equal(result.accepted,true);
 assert.deepEqual(calls,[{type:"TUNE",payload:{motion:65}}]);
 await assert.rejects(owner.commandNow("paired-token","TUNE",full,["variation"]),/not yet available/);
 assert.equal(calls.length,1,"unsupported semantic did not reach device");
});
