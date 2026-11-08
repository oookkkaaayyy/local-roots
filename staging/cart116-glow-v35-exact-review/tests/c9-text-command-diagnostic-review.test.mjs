import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";

const root=new URL(".",import.meta.url);
const base="../opal/owner-v1201-7target/";
const transportRel=base+"mission-control-local/local-transport.js";
const appRel=base+"owner-pwa/hbnf-cart.js";
const localRel=base+"owner-pwa/hbnf-cart-local.js";
const featuresRel=base+"owner-pwa/hbnf-cart-features.js";
const patchPath=new URL("./fixtures/c9-text-command-diagnostic.REVIEW_ONLY.patch",import.meta.url);
const inTree=rel=>"staging/cart116-glow-v35-exact-review/"+rel.replace(/^\.\.\//,"");

test("Safari 12 text feature module keeps its click handler parseable",()=>{
 const features=readFileSync(new URL(featuresRel,import.meta.url),"utf8");
 const start=features.indexOf("function setUvCommissioningTestReady(");
 const end=features.indexOf("\nfunction ",start+1);
 assert.ok(start>=0&&end>start,"UV readiness helper must remain present");
 const helper=features.slice(start,end);
 assert.match(helper,/const slider = \$\(sliderId\);[\s\S]*Number\(slider\.value\)/);
 assert.doesNotMatch(helper,/\?\./,"optional chaining breaks the whole module on the supported Safari 12 iPad");
 assert.match(features,/bind\("featureSendText",sendText\);/);
});

test("review-only diagnostics locate text failures without retaining message or credentials",async()=>{
 const scratch=mkdtempSync(join(tmpdir(),"c9-text-diag-"));
 try{
  writeFileSync(join(scratch,"package.json"),JSON.stringify({type:"module"}));
  for(const rel of [transportRel,appRel,localRel]){
   const source=new URL(rel,import.meta.url);
   const target=join(scratch,inTree(rel));
   mkdirSync(dirname(target),{recursive:true});
   copyFileSync(source,target);
  }
  execFileSync("patch",["-p1","-i",patchPath.pathname],{cwd:scratch,stdio:"pipe"});
  const app=readFileSync(join(scratch,inTree(appRel)),"utf8");
  assert.match(app,/noteTextCommandDiagnostic\("button-click"/);
  assert.match(app,/noteTextCommandDiagnostic\("handler-entered"/);
  assert.match(app,/noteTextCommandDiagnostic\("input-validation-failed"/);
  assert.match(app,/noteTextCommandDiagnostic\("opal-direct-selected"/);
  assert.match(app,/onTextDiagnostic: phase => noteTextCommandDiagnostic/);
  assert.match(app,/getLastTextCommandDiagnostic/);
  const traceHelper=app.slice(app.indexOf("function noteTextCommandDiagnostic"),app.indexOf('const statusNode = $("#status")'));
  assert.ok(traceHelper.length>0);
  assert.doesNotMatch(traceHelper,/error\.message|payload|featureText\.value\s*[,}]/);
  execFileSync(process.execPath,["--check",join(scratch,inTree(appRel))],{cwd:scratch,stdio:"pipe"});
  const local=readFileSync(join(scratch,inTree(localRel)),"utf8");
  for(const phase of ["local-connect-started","local-connect-rejected","local-control-preflight-rejected","local-control-preflight-passed","local-payload-rejected","matrix-command-started","matrix-readback-confirmed","aux-readback-rejected","local-command-complete"]){
   assert.ok(local.includes(`note("${phase}")`),`missing local stage ${phase}`);
  }
  assert.doesNotMatch(local,/onTextDiagnostic\([^)]*(payload|text|token|error\.message)/i);
  execFileSync(process.execPath,["--check",join(scratch,inTree(localRel))],{cwd:scratch,stdio:"pipe"});

  const module=await import(pathToFileURL(join(scratch,inTree(transportRel))).href+"?review=1");
  const {LocalMatrixTransport,MATRIX_MAC,SUPPORTED_RELEASE,buildPatch}=module;
  const id="c9-owner-text-001";
  const payload={overlayId:id,kind:"text",ttlMs:8000,data:{text:"PRIVATE-TEST-MESSAGE",color:"#FFFFFF"}};
  const expected={overlay:{id,kind:"text",ttlMs:8000,text:"PRIVATE-TEST-MESSAGE",color:"#FFFFFF"}};
  assert.deepEqual(buildPatch("OVERLAY_START",payload),expected);

  const beforeSocket=new LocalMatrixTransport();
  await assert.rejects(beforeSocket.command("OVERLAY_START",payload),/WebSocket is not connected/);
  assert.equal(beforeSocket.lastTextCommandDiagnostic.phase,"socket-not-open");
  assert.doesNotMatch(JSON.stringify(beforeSocket.lastTextCommandDiagnostic),/PRIVATE-TEST-MESSAGE|c9-owner-text-001/);

  const sent=[];
  const socket={readyState:0,send(raw){sent.push(raw)},close(){this.readyState=3;this.onclose?.()}};
  const transport=new LocalMatrixTransport({timeoutMs:250,socketFactory:()=>socket});
  transport.connect();socket.readyState=1;socket.onopen();
  const state=overlayId=>({state:{HBNF:{candidate:SUPPORTED_RELEASE,overlayId}}});
  socket.onmessage({data:JSON.stringify(state(null))});
  assert.equal(transport.verifyIdentity({mac:MATRIX_MAC}),true);
  const pending=transport.command("OVERLAY_START",payload);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(sent.find(raw=>raw.includes('"overlay"'))),{HBNF:expected});
  assert.equal(transport.lastTextCommandDiagnostic.phase,"awaiting-state");
  socket.onmessage({data:JSON.stringify(state(null))});
  assert.equal(transport.lastTextCommandDiagnostic.phase,"awaiting-state");
  socket.onmessage({data:JSON.stringify(state(id))});
  assert.equal((await pending).HBNF.overlayId,id);
  assert.equal(transport.lastTextCommandDiagnostic.phase,"matching-readback");
  assert.doesNotMatch(JSON.stringify(transport.lastTextCommandDiagnostic),/PRIVATE-TEST-MESSAGE|c9-owner-text-001/);
 }finally{rmSync(scratch,{recursive:true,force:true});}
});
