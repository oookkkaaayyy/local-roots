// Review-only source/provider and physical acceptance guard. No live commands.
const required = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label+' provider evidence missing');
  return value;
};
export function inspectGlowAutoDisplayAcceptance(source) {
  const s=required(source,'source'),ctl=required(s.control,'Matrix control');
  const edge=required(s.liveCycle,'installed live cycle');
  const rpc=required(s.claimRpc,'claim RPC'),cron=required(s.cron,'cron');
  const queue=required(s.queue,'Matrix queue'),relay=required(s.cartRelay,'Cart relay');
  const poller=required(s.poller,'UDisc poller'),acc=required(s.acceptance,'acceptance receipts');
  if(!Array.isArray(edge.supportedLibraryRevisions) || edge.supportedLibraryRevisions.length<1 ||
      edge.supportedLibraryRevisions.some(x=>typeof x!=='string'||!x)) throw Error('live-cycle library contract absent');
  if(!/^[a-f0-9]{64}$/.test(edge.bundleSha256||'')||!edge.slug||!rpc.requiredLibraryRevision||!relay.slug)
    throw Error('exact installed provider identity absent');
  const providerBlockers=[],fieldBlockers=[];
  const noIntersection=!edge.supportedLibraryRevisions.includes(rpc.requiredLibraryRevision);
  if(noIntersection)providerBlockers.push('NO_COMMON_LIBRARY_REVISION_LIVE_CYCLE_VS_CLAIM_RPC');
  if(!edge.supportedLibraryRevisions.includes(ctl.library_revision))
    providerBlockers.push('INSTALLED_LIBRARY_NOT_ACCEPTED_BY_LIVE_CYCLE');
  if(ctl.library_revision!==rpc.requiredLibraryRevision)
    providerBlockers.push('INSTALLED_LIBRARY_NOT_ACCEPTED_BY_CLAIM_RPC');
  if(ctl.mode!=='event')providerBlockers.push('MATRIX_NOT_IN_EVENT_MODE');
  if(ctl.auto_live!==true)providerBlockers.push('AUTO_LIVE_OFF');
  if(cron.active!==true||cron.invokes!==edge.slug||
     cron.requiresMode!=='event'||cron.requiresAutoLive!==true)
    providerBlockers.push('SCHEDULED_CYCLE_NOT_VERIFIED');
  // Flow-native status is not established by this provider readback. The
  // deployed legacy resume branch accepts only 50..55; preset 60 cannot be
  // presumed restorable by changing only library_revision.
  if(!Number.isInteger(ctl.resume_preset)||ctl.resume_preset<edge.nonNativeResumePresetMin||
     ctl.resume_preset>edge.nonNativeResumePresetMax)
    providerBlockers.push('LEGACY_RESUME_PRESET_UNSUPPORTED_UNLESS_NATIVE_FLOW_PROVEN');
  if(edge.publishTransport!==relay.transport&&relay.installedMqttToRelayBridgeVerified!==true)
    providerBlockers.push('MQTT_TO_CART_RELAY_TRANSPORT_UNPROVEN');
  if(queue.readbackMatchesLeagueState!==true||queue.consumerProviderVerified!==true)
    providerBlockers.push('MATRIX_QUEUE_CONSUMPTION_UNVERIFIED');
  if(poller.eligibleInWindow!==true)providerBlockers.push('UDISC_POLLER_NOT_PROVEN_ELIGIBLE');
  for(const name of ['temporaryScorecardConfirmed','providerEndToEndScoreWriteReadback',
    'actualScheduledMQTTToCartReadback','ownerVisualScoreboard','refreshReconnect',
    'restoredPermanentStats','restoredMatrixVibe','restoredLiveConfiguration']){
    const receipt=acc[name];
    if(!receipt||receipt.verified!==true||receipt.weekDate!=='2026-11-03'||
       !/^[0-9a-f]{64}$/.test(receipt.sha256||'')||
       typeof receipt.sourceRef!=='string'||!receipt.sourceRef.trim())
      fieldBlockers.push(name);
  }
  return Object.freeze({
    status:providerBlockers.length||fieldBlockers.length?
      'REVIEW_ONLY_NOT_FIELD_ACCEPTED':'EVIDENCE_PRESENT_REQUIRES_INDEPENDENT_ACCEPTANCE',
    noCommonLibraryRevision:noIntersection,
    providerBlockers,fieldBlockers,
    snapshotVersion:edge.slug+'/v'+String(edge.version??'?'),
    immutableSourceDigest:edge.bundleSha256,
    proofBoundaries:{
      cronScheduledIsNotFrameDelivered:true,pendingQueueIsNotDelivered:true,
      mqttPublishAckIsNotWledReadback:true,
      asyncHandlerHttp200IsNotPhysicalAcceptance:true,
      sourceFixtureIsNotDeployedCorrection:true
    }
  });
}
