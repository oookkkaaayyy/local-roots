import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectGlowAutoDisplayAcceptance} from '../scripts/hbnf-auto-display-provider-compat-gate.mjs';
const observed=JSON.parse(await readFile(new URL('./fixtures/hbnf-auto-display-installed-20261102.json',import.meta.url),'utf8'));
const copy=x=>structuredClone(x);
test('installed Nov2 evidence proves v42 Edge/RPC library intersection empty; auto_live cannot fix it',()=>{
 const result=inspectGlowAutoDisplayAcceptance(observed);
 assert.equal(result.status,'REVIEW_ONLY_NOT_FIELD_ACCEPTED');
 assert.equal(result.noCommonLibraryRevision,true);
 assert.ok(result.providerBlockers.includes('NO_COMMON_LIBRARY_REVISION_LIVE_CYCLE_VS_CLAIM_RPC'));
 assert.ok(result.providerBlockers.includes('AUTO_LIVE_OFF'));
 assert.ok(result.providerBlockers.includes('MATRIX_NOT_IN_EVENT_MODE'));
 assert.ok(result.providerBlockers.includes('LEGACY_RESUME_PRESET_UNSUPPORTED_UNLESS_NATIVE_FLOW_PROVEN'));
 const switched=copy(observed);
 switched.control.mode='event';switched.control.auto_live=true;
 assert.equal(inspectGlowAutoDisplayAcceptance(switched).noCommonLibraryRevision,true);
 for(const rev of [...switched.liveCycle.supportedLibraryRevisions,switched.claimRpc.requiredLibraryRevision]){
   switched.control.library_revision=rev;
   const gate=inspectGlowAutoDisplayAcceptance(switched);
   assert.ok(gate.providerBlockers.includes('NO_COMMON_LIBRARY_REVISION_LIVE_CYCLE_VS_CLAIM_RPC'));
 }
});
test('queue pending, scheduled cron and async HTTP success cannot substitute for Cart/Opal/device receipt',()=>{
 const x=copy(observed);
 x.claimRpc.requiredLibraryRevision=x.liveCycle.supportedLibraryRevisions[0];
 x.control.library_revision=x.claimRpc.requiredLibraryRevision;
 x.control.mode='event';x.control.auto_live=true;x.control.resume_preset=52;
 x.queue.consumerProviderVerified=true;
 const g=inspectGlowAutoDisplayAcceptance(x);
 assert.equal(g.noCommonLibraryRevision,false);
 assert.ok(g.providerBlockers.includes('MQTT_TO_CART_RELAY_TRANSPORT_UNPROVEN'));
 assert.ok(g.fieldBlockers.includes('actualScheduledMQTTToCartReadback'));
 assert.ok(g.fieldBlockers.includes('ownerVisualScoreboard'));
 assert.equal(g.proofBoundaries.asyncHandlerHttp200IsNotPhysicalAcceptance,true);
 assert.equal(g.proofBoundaries.pendingQueueIsNotDelivered,true);
});
test('legacy non-native resume rejects installed preset 60 even if revision and claim were aligned',()=>{
 const x=copy(observed);
 x.claimRpc.requiredLibraryRevision=x.liveCycle.nonNativeResumeLibrary;
 x.control.library_revision=x.claimRpc.requiredLibraryRevision;
 x.control.mode='event';x.control.auto_live=true;
 const g=inspectGlowAutoDisplayAcceptance(x);
 assert.ok(g.providerBlockers.includes('LEGACY_RESUME_PRESET_UNSUPPORTED_UNLESS_NATIVE_FLOW_PROVEN'));
});
test('only hypothetical compatible source plus independent real provider, temporary-card, reconnect and restoration receipts could pass',()=>{
 const x=copy(observed);
 x.claimRpc.requiredLibraryRevision=x.liveCycle.supportedLibraryRevisions[0];
 x.control.library_revision=x.claimRpc.requiredLibraryRevision;
 x.control.mode='event';x.control.auto_live=true;x.control.resume_preset=52;
 x.cartRelay.installedMqttToRelayBridgeVerified=true;
 x.queue.consumerProviderVerified=true;
 for(const name of Object.keys(x.acceptance)) x.acceptance[name]={
   verified:true,weekDate:'2026-11-03',sha256:'a'.repeat(64),
   sourceRef:'synthetic-only-'+name
 };
 const g=inspectGlowAutoDisplayAcceptance(x);
 assert.equal(g.noCommonLibraryRevision,false);
 assert.equal(g.status,'EVIDENCE_PRESENT_REQUIRES_INDEPENDENT_ACCEPTANCE');
 assert.deepEqual(g.providerBlockers,[]);
 assert.deepEqual(g.fieldBlockers,[]);
 x.acceptance.restoredPermanentStats=false;
 assert.equal(inspectGlowAutoDisplayAcceptance(x).status,'REVIEW_ONLY_NOT_FIELD_ACCEPTED');
});
test('missing source identity, unknown claim RPC, malformed evidence fail closed',()=>{
 const x=copy(observed);delete x.claimRpc;
 assert.throws(()=>inspectGlowAutoDisplayAcceptance(x),/provider evidence missing/);
 const y=copy(observed);y.liveCycle.bundleSha256='unverified';
 assert.throws(()=>inspectGlowAutoDisplayAcceptance(y),/provider identity absent/);
});
