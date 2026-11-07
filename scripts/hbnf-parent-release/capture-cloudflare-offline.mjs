// Existing Wrangler-auth Mac: authenticated Cloudflare GETs only, no Drive token.
// Pin is a *read-only extraction* from controlling rev7 Drive manifest.
// It is NOT a replacement manifest or evidence of rollback qualification.
// Usage:
// CLOUDFLARE_API_TOKEN="$(wrangler auth token)" node scripts/hbnf-parent-release/capture-cloudflare-offline.mjs ./hbnf-v348-recovery.json
import {open} from 'node:fs/promises';
import {captureCurrentWorkerForOfflineTransfer} from './cloudflare-recovery.mjs';
const manifest={
 status:'PENDING_NOT_ADMITTED',productionMutationAuthorized:false,
 targets:[{
  id:'cloudflare-worker',accountId:'e3bc6b78f1104fa0c2a01245084594cf',
  worker:'hbnf',
  lastAuthenticatedVersionId:'48ffa87e-3c83-46d0-a6ca-db7bf0b064e6',
  lastAuthenticatedScriptEtag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
  sourceMultipart:{bytes:194486,sha256:'fd45197dc2bcf23505490c0d64b3b622ad1d7e782a06907be59cc0081ff4eefc'}
 }]
};
const exactRev7='5bbc217abc4c5bb1732ed21af97bd22c383ca6ba60433d3e46d6faf4a643f36a';
const out=process.argv[2];
if(process.argv.length!==3||!out||!out.endsWith('.json')){
 process.stderr.write('Usage: capture-cloudflare-offline.mjs /private/path/unique-name.json\n');
 process.exitCode=2;
}else{
 try{
  const result=await captureCurrentWorkerForOfflineTransfer({manifest,manifestSha256:exactRev7});
  const file=await open(out,'wx',0o600);
  try{await file.writeFile(JSON.stringify(result)+'\n');await file.sync();}
  finally{await file.close();}
  process.stdout.write('SOURCE_CAPTURE_LOCAL_ONLY_NOT_DURABLE_OR_ADMITTED '+out+'\n');
 }catch(error){
  const safe=/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'CLOUDFLARE_READ_ONLY_CAPTURE_BLOCKED';
  process.stderr.write(safe+'\n');process.exitCode=1;
 }
}
