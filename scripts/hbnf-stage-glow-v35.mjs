// Deterministic, NO DEPLOYMENT, review-only stage from authenticated deployed v35 source.
// Does not fetch/modify a provider or alter the exact v35 Owner/Guest/relay code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha256 = b=>crypto.createHash('sha256').update(b).digest('hex');
const BASELINE='377945d8c9c930420ac36febd304d2a4d5f632cbcc4c9e3467c8f440aaa04e73';
const PLANNER_BLOB='509dbe62229d48579594cdd378217e4476ad13e7';
const files=['index.ts','guest-command.ts','runtime-vibe.ts','live.ts','skins_scoring.ts','matrix-relay.ts','matrix-relay-projection.ts','matrix-relay-auth.ts','pairing-expiry.mjs','deno.json'];
const unique=(s,x)=>{if(s.split(x).length!==2)throw Error(`unexpected_v35_anchor:${x.slice(0,45)}`);};
export function patchIndex(source){
  const importAnchor='import { handleMatrixRelay } from "./matrix-relay.ts";';
  const actionAnchor='  const action = String(request.action ?? "");';
  unique(source,importAnchor);unique(source,actionAnchor);
  if(!source.includes('if (req.headers.has("x-hbnf-relay-id")) return await handleMatrixRelay(req);') ||
     !source.includes('runGuestCommand(request') ||
     !source.includes('reduceCartCommand(row.state'))throw Error('deployed_relay_or_canonical_reducer_unknown');
  const handler=`  if (action === "glow_scoreboard_intent") {
    // Service-role-only backend. No Guest/Owner token reuse and no direct device sender.
    const result = await runGlowIntentAction({
      body: request, authorization: req.headers.get("Authorization") ?? "", serviceKey,
      deps: {
        nativeOverlayAdmitted:false, // REVIEW_ONLY: do not commit until Track C native pair admitted
        source: async weekDate => {
          const { data, error } = await service.rpc("hbnf_cart_glow_source_snapshot", { p_week_date: weekDate });
          if (error) throw Error("glow_source_unavailable"); return data;
        },
        cart: async () => {
          const { data, error } = await service.rpc("hbnf_cart_get_context", { p_cart_id: "hbnf-cart" });
          if (error) throw Error("cart_context_unavailable"); return data;
        },
        chooseLive, reduceCartCommand,
        commit: async args => {
          const { data, error } = await service.rpc("hbnf_cart_commit_glow_intent", args);
          if (error) throw Error("glow_commit_failed"); return data;
        }
      }
    });
    return response(result.body, result.status);
  }
`;
  return source.replace(importAnchor,importAnchor+'\nimport { runGlowIntentAction } from "./glow-intent-service.mjs";')
    .replace(actionAnchor,actionAnchor+'\n'+handler);
}

export function patchRelay(source){
  const unique=(s,a)=>{if(s.split(a).length!==2)throw Error('unexpected_relay_anchor');};
  const importAnchor='import {relayTokenAuthorized} from "./matrix-relay-auth.ts";';
  const nextAnchor='  let built;try{built=await buildWledProjection(c,d.revision,f.epoch);}catch(err){return reply({error:(err as Error).message||"projection_invalid"},422);}';
  const checkAnchor=' if(ge||!challenge)return reply({error:"challenge_expired_or_consumed"},409);';
  for(const a of [importAnchor,nextAnchor,checkAnchor])unique(source,a);
  return source.replace(importAnchor,importAnchor+'\nimport {enforcePreservedGlowRelay,GLOW_PROJECTION_BLOCK_REASON} from "./glow-relay-preservation.mjs";')
    .replace(nextAnchor,nextAnchor+'\n  try{enforcePreservedGlowRelay({context:c,wledPayload:built.wledPayload});}catch{return reply({error:GLOW_PROJECTION_BLOCK_REASON},422);}')
    .replace(checkAnchor,checkAnchor+'\n try{enforcePreservedGlowRelay({wledPayload:challenge.wled_payload});}catch{return reply({error:GLOW_PROJECTION_BLOCK_REASON},409);}');
}

export function stageV35({sourceDir,destinationDir,sourceReceipt,plannerFile,adapterFile,guardFile}){
  if(fs.existsSync(destinationDir))throw Error('target_exists_no_overwrite');
  if(sourceReceipt?.slug!=='hbnf-cart-control'||sourceReceipt.version!==35||
     sourceReceipt.ezbr_sha256!==BASELINE || sourceReceipt.providerAuthenticated!==true)
    throw Error('unverified_provider_baseline');
  const available=fs.readdirSync(sourceDir).sort();
  if(JSON.stringify(available)!==JSON.stringify([...files].sort()))throw Error('unexpected_deployed_files');
  const planner=fs.readFileSync(plannerFile);
  const gitBlob=crypto.createHash('sha1').update(`blob ${planner.length}\0`).update(planner).digest('hex');
  if(gitBlob!==PLANNER_BLOB)throw Error('planner_not_exact_11of11_source');
  const adapter=fs.readFileSync(adapterFile);
  if(!guardFile||!fs.existsSync(guardFile))throw Error('glow_relay_guard_missing');
  const guard=fs.readFileSync(guardFile);
  if(!guard.toString('utf8').includes('export function enforcePreservedGlowRelay'))throw Error('glow_relay_guard_invalid');
  const index=fs.readFileSync(path.join(sourceDir,'index.ts'),'utf8');
  const patched=patchIndex(index);
  fs.mkdirSync(destinationDir,{recursive:true});
  const hashes=[];
  for(const f of files){
    const before=fs.readFileSync(path.join(sourceDir,f));
    const after=f==='index.ts'?Buffer.from(patched):f==='matrix-relay.ts'?Buffer.from(patchRelay(before.toString('utf8'))):before;
    fs.writeFileSync(path.join(destinationDir,f),after);
    hashes.push({path:f,installedSha256:sha256(before),candidateSha256:sha256(after),modified:f==='index.ts'||f==='matrix-relay.ts'});
  }
  fs.writeFileSync(path.join(destinationDir,'hbnf-glow-cart-intent.mjs'),planner);
  fs.writeFileSync(path.join(destinationDir,'glow-intent-service.mjs'),adapter);
  fs.writeFileSync(path.join(destinationDir,'glow-relay-preservation.mjs'),guard);
  hashes.push({path:'hbnf-glow-cart-intent.mjs',installedSha256:null,candidateSha256:sha256(planner),modified:true});
  hashes.push({path:'glow-intent-service.mjs',installedSha256:null,candidateSha256:sha256(adapter),modified:true});
  hashes.push({path:'glow-relay-preservation.mjs',installedSha256:null,candidateSha256:sha256(guard),modified:true});
  const receipt={schema:'cart116-glow-v35-source-candidate-v2',status:'REVIEW_ONLY',installedBaseline:BASELINE,
    providerReceiptIsCallerSupplied:true,sourceFiles:hashes};
  fs.writeFileSync(path.join(destinationDir,'SOURCE_REVIEW_ONLY.json'),JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
if(process.argv[1]&&process.argv[1].endsWith('hbnf-stage-glow-v35.mjs')){
  if(process.argv.length!==8){console.error('Usage: node hbnf-stage-glow-v35.mjs <exact-provider-source-dir> <new-candidate-dir> <provider-readback.json> <exact-planner> <adapter> <glow-relay-guard>');process.exitCode=2;}
  else try {const r=stageV35({sourceDir:path.resolve(process.argv[2]),destinationDir:path.resolve(process.argv[3]),
    sourceReceipt:JSON.parse(fs.readFileSync(process.argv[4],'utf8')),
    plannerFile:path.resolve(process.argv[5]),adapterFile:path.resolve(process.argv[6]),guardFile:path.resolve(process.argv[7])});console.log(JSON.stringify({status:r.status,files:r.sourceFiles.length}));}
  catch(e){console.error(String(e));process.exitCode=2;}
}
