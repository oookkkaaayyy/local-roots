import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {LocalMatrixTransport,MATRIX_MAC,SUPPORTED_RELEASE,REVIEW_OWNER_SAFE_RELEASE,acceptedDirectRelease} from "../opal/owner-v1201-7target/mission-control-local/local-transport.js";
// The seven staged Owner release assets omit unchanged hbnf-cart-net.js.
// Evaluate the actual staged adapter after replacing only that unavailable import;
// the full production adapter source and all release/command methods remain unchanged.
const adapterSource=readFileSync(new URL("../opal/owner-v1201-7target/owner-pwa/hbnf-cart-local.js",import.meta.url),"utf8");
const dependency='import { fetchWithDeadline, HBNF_API_TIMEOUT_MS } from "./hbnf-cart-net.js?v=20261015-local-owner-v3";';
assert.equal(adapterSource.split(dependency).length,2,"exact static dependency boundary");
const adapterForTest=adapterSource.replace(dependency,'const fetchWithDeadline = () => { throw new Error("not in isolated C9 test"); }; const HBNF_API_TIMEOUT_MS=5000;');
const {LocalOwnerControl,LOCAL_MATRIX_RELEASE,LOCAL_MATRIX_OWNER_SAFE_REVIEW_RELEASE,acceptedOpalDirectRelease}=await import("data:text/javascript;base64,"+Buffer.from(adapterForTest,"utf8").toString("base64"));
const OLD="hbnf-cart2-phase2-r6-skins-readable-20261014", NEXT="hbnf-cart2-r6-owner-safe-tuning-persist-review-20261104";
test("C9 paired markers allow exactly old/new and never arbitrary firmware",()=>{
 assert.equal(SUPPORTED_RELEASE,OLD);assert.equal(LOCAL_MATRIX_RELEASE,OLD);
 assert.equal(REVIEW_OWNER_SAFE_RELEASE,NEXT);assert.equal(LOCAL_MATRIX_OWNER_SAFE_REVIEW_RELEASE,NEXT);
 for(const v of [OLD,NEXT]){assert.equal(acceptedDirectRelease(v),true);assert.equal(acceptedOpalDirectRelease(v),true);}
 for(const v of ["",null,undefined,NEXT+"-bad",OLD+"-bad","unapproved"]){assert.equal(acceptedDirectRelease(v),false);assert.equal(acceptedOpalDirectRelease(v),false);}
});
test("C9 no command until exact MAC+fresh WS release; accepts matching ACK; clears stale state",async()=>{
 const sockets=[];
 const tr=new LocalMatrixTransport({timeoutMs:220,socketFactory:url=>{const w={url,readyState:0,sent:[],send(s){this.sent.push(s)},close(){this.readyState=3;this.onclose?.()}};sockets.push(w);return w;}});
 tr.connect();const w=sockets[0];w.readyState=1;w.onopen();
 const frame=(rel,b)=>w.onmessage({data:JSON.stringify({state:{HBNF:{candidate:rel,matrixBrightness:b},seg:[]}})});
 assert.equal(tr.controlReady(),false);assert.equal(tr.verifyIdentity({mac:"bad"}),false);
 frame(NEXT,40);assert.equal(tr.controlReady(),false);
 await assert.rejects(tr.command("TUNE",{matrixBrightness:42}),/Fresh Matrix|not connected/);
 tr.verifyIdentity({mac:MATRIX_MAC});frame("unapproved",40);assert.equal(tr.controlReady(),false);
 frame(NEXT,40);assert.equal(tr.controlReady(),true);
 const p=tr.command("TUNE",{matrixBrightness:42});await new Promise(r=>setImmediate(r));
 assert.equal(w.sent.filter(s=>s.includes('"matrixBrightness":42')).length,1);
 frame(NEXT,42);assert.equal((await p).HBNF.matrixBrightness,42);
 w.close();assert.equal(tr.controlReady(),false);
});
test("OFF/ON same-device AND same-firmware; reject old/new release replay",()=>{
 let saved=null;
 const storage={getItem(){return saved===null?null:JSON.stringify(saved)},setItem(k,v){saved=JSON.parse(v)},removeItem(){saved=null}};
 const owner=new LocalOwnerControl({opalDirect:true,storage});
 saved={mac:MATRIX_MAC,release:NEXT,matrixBrightness:55,auxBrightness:70};
 owner.transport={snapshot:{HBNF:{candidate:NEXT}}};assert.deepEqual(owner.directPowerRecord(),saved);
 saved={...saved,release:OLD};assert.equal(owner.directPowerRecord(),null);
 saved={...saved,release:"unknown"};assert.equal(owner.directPowerRecord(),null);
 owner.transport={snapshot:{HBNF:{candidate:OLD}}};saved={mac:MATRIX_MAC,release:OLD,matrixBrightness:55,auxBrightness:70};
 assert.deepEqual(owner.directPowerRecord(),saved);
});
test("paired session remains OLD-only; Opal direct accepts exact pair and ACK actual marker",()=>{
 const src=readFileSync(new URL("../opal/owner-v1201-7target/owner-pwa/hbnf-cart-local.js",import.meta.url),"utf8");
 assert.match(src,/async waitForState[\s\S]*?if \(release && release !== LOCAL_MATRIX_RELEASE\)/);
 assert.match(src,/async waitForFreshState[\s\S]*?if \(release && !acceptedOpalDirectRelease\(release\)\)/);
 assert.match(src,/async connect\(token[\s\S]*?if \(candidate !== LOCAL_MATRIX_RELEASE\)/);
 assert.match(src,/async connectOpalDirect[\s\S]*?if \(!acceptedOpalDirectRelease\(candidate\)\)/);
 assert.match(src,/release: h\.candidate/);assert.match(src,/release: state\.HBNF\.candidate/);
});
test("C9 same manifest holds exact 6 targets, original rollback and all live gates false",()=>{
 const m=JSON.parse(readFileSync(new URL("../admission/ADMISSION.PENDING.json",import.meta.url),"utf8"));
 const p=m.dora_c9_paired_owner_release_20261105;
 assert.equal(p.status,"SOURCE_INTEGRATED_REVIEW_ONLY_NOT_INSTALLABLE");
 assert.equal(p.changed_targets.length,6);
 assert.equal(p.existing_c8_11target_archive_installable_for_c9,false);
 assert.equal(p.firmware_sha256,"429f7f00d1da72fcd926935f10140c0048f78a2aa7340a7cd748029941b1f0fa");
 assert.equal(p.rollback_firmware_sha256,"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d");
 assert.equal(m.firmware.matrix_flash,false);assert.equal(m.transaction.source_gate_change_admitted,false);
 for(const t of p.changed_targets){assert.equal(t.actual_installed_preimage_sha256,m.opal_c9_current_authenticated_inventory_20261105.six_current_preimage_sha256_by_path[t.target]);assert.equal(t.prechange_live_verified,false);}
});

test("C9 six approved on-disk candidate byte hashes and exact /www boundary agree with SAME manifest",()=>{

 const m=JSON.parse(readFileSync(new URL("../admission/ADMISSION.PENDING.json",import.meta.url),"utf8"));
 const lane=m.dora_c9_paired_owner_release_20261105;
 const expected=[
  "/www/mission-control-local/local-transport.js",
  "/www/mission-control-local/owner-pwa/hbnf-cart-local.js",
  "/www/mission-control-local/owner-pwa/hbnf-cart.js",
  "/www/mission-control-local/owner-pwa/hbnf-cart.html",
  "/www/mission-control-local/owner-pwa/.hbnf-payload.sha256",
  "/www/mission-control-local/owner-pwa/.hbnf-package-version"
 ];
 assert.deepEqual(lane.changed_targets.map(t=>t.target),expected);
 const prefix="staging/cart116-glow-v35-exact-review/";
 const seen=new Set();
 for(const t of lane.changed_targets){
  assert.equal(seen.has(t.source_path),false,"duplicate source path");
  seen.add(t.source_path);
  assert.ok(t.source_path.startsWith(prefix+"opal/owner-v1201-7target/"),"source outside exact staged Owner tree");
  const source=readFileSync(new URL("../"+t.source_path.slice(prefix.length),import.meta.url));
  const actual=createHash("sha256").update(source).digest("hex");
  assert.equal(actual,t.candidate_sha256,"manifest candidate SHA does not match raw staged bytes: "+t.target);
  assert.equal(t.actual_installed_preimage_sha256,m.opal_c9_current_authenticated_inventory_20261105.six_current_preimage_sha256_by_path[t.target],"current preimage digest must match authenticated SSH witness");
  assert.match(t.actual_installed_preimage_mode_owner,/0644 uid=0 gid=0/,"current owner/mode evidence missing");
  assert.notEqual(t.staged_prechange_sha256,t.actual_installed_preimage_sha256,"historical staged source is not actual installed rollback");
  assert.equal(t.independent_installed_preimage_downloadback,true,"actual 6/6 preimages must match independently downloaded Drive backup bytes");
  assert.equal(t.prechange_live_verified,false,"no live prechange equality claim");
 }
 assert.equal(lane.guards.opal_www_write,false);
 assert.equal(lane.guards.firmware_flash,false);
 assert.equal(lane.guards.source_gate_change_admitted,false);
 assert.equal(m.firmware.matrix_flash,false);
 assert.equal(m.transaction.source_gate_change_admitted,false);
});
