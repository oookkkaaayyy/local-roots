import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGitHubExecutionLockAdapter,createGoogleDriveEvidenceStore,createHbnfPublicAssetVerifier,createSupabaseMcpAdapter,createWranglerAdapter,normalizeCloudflareInjectedHtml,resolvePinnedWrangler,verifyWritableCapacity} from '../scripts/hbnf-two-target-provider-adapters.mjs';

test('existing pinned Wrangler and writable scratch/log paths are discovered',async()=>{
 const bin=await resolvePinnedWrangler();assert.match(bin,/wrangler\.js$/);
 const cap=await verifyWritableCapacity();assert.equal(cap.scratchWriteVerified,true);assert.equal(cap.wranglerLogWriteVerified,true);
});

test('GitHub fixed-path create is exclusive and its fetched bytes must match',async()=>{
 let claimed=false,body,readRef;
 const lock=createGitHubExecutionLockAdapter({
  createFile:async x=>{if(claimed)throw new Error('422 already exists');claimed=true;body=x.content;return{structuredContent:{commit_sha:'a'.repeat(40)}}},
  fetchFile:async args=>{readRef=args.ref;return{structuredContent:{content:Buffer.from(body).toString('base64')}}},
 });
 const bytes=Buffer.from('{"release":"fixed"}\n');
 const claim=await lock.createExclusive('ignored',bytes);assert.equal(claim.created,true);assert.match(claim.id,/@[0-9a-f]{40}:/);assert.equal(readRef,claim.commit);
 assert.deepEqual(await lock.read(),bytes);
 assert.equal((await lock.createExclusive('ignored',bytes)).created,false);
});

test('Drive evidence store requires provider-download byte equality',async()=>{
 let stored;const store=createGoogleDriveEvidenceStore({
  writeLocal:async(name,bytes)=>{stored={name,bytes:Buffer.from(bytes)};return'/tmp/receipt.json'},
  uploadFile:async args=>{assert.equal(args.parent_folder_id,'1mZWMyzLIKnSjBTP82-EfGOqktld17X84');return{structuredContent:{id:'drive1'}}},
  fetchFile:async id=>({structuredContent:{b64_string:Buffer.from(id==='drive1'?stored.bytes:Buffer.from('bad')).toString('base64')}}),
 });
 const receipt=Buffer.from('receipt');const result=await store.putOnce('one.json',receipt);
 assert.equal(result.id,'drive1');assert.deepEqual(await store.download('drive1'),receipt);
 const corrupt=createGoogleDriveEvidenceStore({writeLocal:async()=>'/tmp/receipt.json',uploadFile:async()=>({structuredContent:{id:'drive2'}}),fetchFile:async()=>({structuredContent:{b64_string:Buffer.from('bad').toString('base64')}})});
 await assert.rejects(()=>corrupt.putOnce('bad.json',receipt),/download-back failed/);
});

test('Supabase MCP reader is fixed to the admitted project and interprets exact evidence',async()=>{
 const state={tableExists:true,rlsEnabled:true,migrations:[],candidateFunctions:[],triggers:['hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync'],stateFingerprint:'deadbeef',grants:{anon:{SELECT:true,INSERT:true,UPDATE:true},authenticated:{SELECT:true,INSERT:true,UPDATE:true}}};
 let args;
 const adapter=createSupabaseMcpAdapter({executeSql:async a=>{args=a;return{content:[{type:'text',text:JSON.stringify({result:`<untrusted-data-test>\n${JSON.stringify([{state}])}\n</untrusted-data-test>`})}]};},applyMigration:async()=>{throw new Error('not used in adapter unit test')}});
 assert.deepEqual(await adapter.read(),{projectId:'phcpbvuqibyarpfrftgx',...state});
 assert.equal(args.project_id,'phcpbvuqibyarpfrftgx');
 await assert.rejects(()=>createSupabaseMcpAdapter({executeSql:async()=>({}),applyMigration:async()=>{},projectId:'wrong'}).read(),/project ID mismatch/);
 let applied=false;const scoped=createSupabaseMcpAdapter({executeSql:async()=>({content:[{type:'text',text:JSON.stringify({result:`<untrusted-data-test>\n${JSON.stringify([{state}])}\n</untrusted-data-test>`})}]}),applyMigration:async()=>{applied=true;}});
 await assert.rejects(()=>scoped.applyExactMigration({name:'20261030021038_hbnf_league_state_anon_cas_rpc.sql',sha256:'460a8bee8961ebd78968678d1690b7c4565f6a8785347e6c08f6cba4903739b7',sql:Buffer.from('wrong bytes')}),/refusing unapproved\/out-of-order migration/);
 assert.equal(applied,false);
});

test('Wrangler reader requires a single 100% active version and disabled access secret',async()=>{
 const items=[{id:'d',created_on:'2026-10-28',versions:[{version_id:'3b019c24-0288-4c0d-bcc2-46cb6028d0f6',percentage:100}]}];
 const token='a'.repeat(93);const run=async args=>({code:0,stdout:args[0]==='deployments'?JSON.stringify(items):args[0]==='versions'?'{}':args[0]==='secret'?'[]':token,stderr:''});
 const fakeApi=(routeList,domainList=[])=>async url=>({ok:true,json:async()=>({success:true,result:String(url).includes('/workers/routes')?routeList:String(url).includes('/workers/domains')?domainList:String(url).includes('/zones?')?[{id:'zone'}]:{schedules:[]}})});
 const fetchImpl=fakeApi([{pattern:'hbnightflyers.com/*',script:'hbnf'}]);
 const adapter=createWranglerAdapter({run,fetchImpl,verifyRoutes:async()=>({passed:true})});
 const state=await adapter.read();assert.equal(state.versionId,'3b019c24-0288-4c0d-bcc2-46cb6028d0f6');assert.equal(state.pollingDisabled,true);assert.equal(state.rollbackRetained,true);assert.equal(state.cronRemoved,true);assert.equal(state.glowRouteCovered,true);
 const rootOnly=createWranglerAdapter({run,fetchImpl:fakeApi([{pattern:'hbnightflyers.com',script:'hbnf'}]),verifyRoutes:async()=>({passed:true})});
 assert.equal((await rootOnly.read()).glowRouteCovered,false);
 const enabledDomain=[{id:'existing-domain-id',hostname:'hbnightflyers.com',service:'hbnf',enabled:true}];
 const customDomain=createWranglerAdapter({run,fetchImpl:fakeApi([{pattern:'hbnightflyers.com',script:'hbnf'}],enabledDomain),verifyRoutes:async()=>({passed:true})});
 assert.equal((await customDomain.read()).activeCustomDomain,true);
 assert.equal((await customDomain.read()).glowRouteCovered,true);
 const disabledDomain=createWranglerAdapter({run,fetchImpl:fakeApi([{pattern:'hbnightflyers.com',script:'hbnf'}],[{...enabledDomain[0],enabled:false}]),verifyRoutes:async()=>({passed:true})});
 assert.equal((await disabledDomain.read()).glowRouteCovered,false);
 const intercepted=createWranglerAdapter({run,fetchImpl:fakeApi([{pattern:'hbnightflyers.com',script:'hbnf'},{pattern:'hbnightflyers.com/glow.html*',script:'other-worker'}],enabledDomain),verifyRoutes:async()=>({passed:true})});
 assert.equal((await intercepted.read()).glowRouteCovered,false);
 const unsafe=createWranglerAdapter({run:async args=>({code:0,stdout:args[0]==='deployments'?JSON.stringify(items):args[0]==='versions'?'{}':args[0]==='secret'?'UDISC_GLOW_ACCESS_APPROVED':token,stderr:''}),fetchImpl,verifyRoutes:async()=>({passed:true})});
 await assert.rejects(()=>unsafe.read(),/cannot be proven disabled/);
});

test('public asset verification normalizes only the injected Cloudflare challenge and excludes assets routed to Cart',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'hbnf-asset-verifier-'));
 try{
  const pub=path.join(dir,'public');await mkdir(pub);
  const lineage={};const bodies=new Map();
  for(let i=0;i<43;i++){
   const name=i===0?'hbnf-cart.js':`asset-${String(i).padStart(2,'0')}.bin`;
   const relative=`public/${name}`,bytes=Buffer.from(`baseline-${i}`);
   await writeFile(path.join(pub,name),bytes);bodies.set(name,bytes);lineage[relative]={source:'v343:3b019c24-0288-4c0d-bcc2-46cb6028d0f6',sha256:(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')};
  }
  const glow=Buffer.from('<!doctype html><title>Glow</title>');await writeFile(path.join(pub,'glow.html'),glow);bodies.set('glow.html',glow);lineage['public/glow.html']={source:'candidate',sha256:(await import('node:crypto')).createHash('sha256').update(glow).digest('hex'),change:'intentional Glow integration'};
  for(const name of ['glow-save-sync.mjs','league-state-cas.mjs']){const bytes=Buffer.from(`new-${name}`);await writeFile(path.join(pub,name),bytes);bodies.set(name,bytes);lineage[`public/${name}`]={source:'candidate',sha256:(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),change:'required new Glow helper'};}
  await writeFile(path.join(dir,'PACKAGE_MANIFEST.json'),JSON.stringify({assetLineage:lineage}));
  const zip=path.join(dir,'candidate.zip');execFileSync('zip',['-q','-r',zip,'PACKAGE_MANIFEST.json','public'],{cwd:dir});
  const verifier=createHbnfPublicAssetVerifier({candidatePath:zip,fetchImpl:async url=>{
   const route=new URL(url).pathname.slice(1);let bytes=bodies.get(route);assert(bytes,`unexpected external fetch for ${route}`);
   if(route.endsWith('.html'))bytes=Buffer.concat([bytes,Buffer.from("<script>(function(){function c(){window.__CF$cv$params={r:'ray'};var u='/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray=ray';}c();})();</script>")]);
   return new Response(bytes,{status:200});
  }});
  const proof=await verifier({expectedAssetDelta:{same:43,modified:['glow.html'],added:['glow-save-sync.mjs','league-state-cas.mjs']},routeOwners:[{pattern:'hbnightflyers.com/hbnf-cart*',script:'hbnf-cart2'}],activeCustomDomain:true});
  assert.equal(proof.passed,true);assert.equal(proof.assetCount,45);assert.equal(proof.externallyRoutedAssetCount,1);
  const noDomain=createHbnfPublicAssetVerifier({candidatePath:zip,fetchImpl:async()=>new Response('unused')});
  await assert.rejects(()=>noDomain({expectedAssetDelta:{same:43,modified:['glow.html'],added:['glow-save-sync.mjs','league-state-cas.mjs']},routeOwners:[]}),/Custom Domain ownership is unavailable/);
  const ambiguous=normalizeCloudflareInjectedHtml(Buffer.from(`<html><script>(function(){function c(){window.__CF$cv$params={r:'x'};var u='/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray=x';}c();})();</script></html>`));
  assert.equal(ambiguous.toString(),' <html></html>'.trim());
 } finally {await rm(dir,{recursive:true,force:true});}
});
