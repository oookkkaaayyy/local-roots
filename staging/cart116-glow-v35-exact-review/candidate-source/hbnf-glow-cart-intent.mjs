// Review-only pure score-to-canonical-overlay planner. No DB, network or device writes.
// The caller must use the EXISTING authenticated Cart command bridge and Opal
// revision/release-fence/challenge/readback path; never POST WLED/MQTT directly.
const DATE=/^20\d{2}-\d{2}-\d{2}$/;
const SIG=/^[0-9a-f]{64}$/;
const fail=reason=>Object.freeze({kind:'no_command',reason});
export function planSavedGlowOverlay({liveStatus,week,binding,cartContext,at,priorDispatch}={}){
  const now=typeof at==='number'?at:Date.parse(at??'');
  if(!Number.isFinite(now))return fail('CLOCK_NOT_BOUND');
  const date=String(binding?.eventDate??'');
  const start=Date.parse(binding?.windowStart??'');
  const end=Date.parse(binding?.windowEnd??'');
  if(!DATE.test(date)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
     now<start||now>end||
     !/^(?:hb-glow-doubles-[A-Za-z0-9]{6}|hb-night-flyers-hb-glow-doubles(?:-[a-z0-9]+)*-[A-Za-z0-9]{6})$/.test(String(binding?.eventId??'')))
    return fail('EVENT_BINDING_NOT_ACTIVE');
  const live=liveStatus?.live;
  if(live?.active!==true||live.event!=='glow'||live.label!=='GLOW')
    return fail('NO_ACTIVE_GLOW_SCOREBOARD');
  if(binding?.persistedActiveWeek!==date)return fail('ACTIVE_GLOW_WEEK_MISMATCH');
  if(week?.date!==date||week?.scoresLocked===true||
     !Array.isArray(week?.cards)||week.cards.some(c=>c?.finalized===true))
    return fail('WEEK_NOT_ADMISSIBLE');
  const sync=week?.udiscSync;
  const lineage=week?.udiscLive;
  const signature=sync?.latest?.signature;
  const success=Date.parse(sync?.status?.lastSuccessAt??'');
  const updated=Date.parse(lineage?.sourceUpdatedAt??'');
  const revision=String(liveStatus?.updated_at??'');
  // A manual XLSX export is always a historical/fallback source, NEVER live Cart
  // actuation even if some other writer copied "fresh" into its status object.
  // Scoring's explicitly authorized delta adapter alone may persist this
  // source lineage after a trusted provider receipt, guarded CAS, and GET.
  // An old accepted hole is not proof that the LATEST provider snapshot
  // contained a scored-hole update. A results-only or roster-only cursor must
  // not renew automatic Cart eligibility, even if old holes remain stored.
  const scored=Object.values(lineage?.acceptedHoles||{}).some(holes=>
    holes&&typeof holes==='object'&&Object.values(holes).some(v=>
      v&&v.cursor===lineage?.cursor&&
      typeof v.strokes==='string'&&/^[0-9]{1,2}$/.test(v.strokes)&&
      Number(v.strokes)>=1&&Number(v.strokes)<=99));
  // Controls independently rechecks the saved lineage/event/permission reference,
  // timestamps, cursor, signature and revision; persisted flags by themselves
  // are not independent proof of UDisc permission or a native device release.
  if(sync?.source!=='UDisc explicitly authorized live source'||
     sync?.eventId!==binding.eventId||sync?.weekDate!==date||
     sync?.status?.state!=='fresh'||!SIG.test(signature??'')||
     sync?.latest?.liveSourceReceipt!==true||
     lineage?.schema!=='hbnf.udisc.live-lineage.v1'||
     lineage?.eventId!==binding.eventId||lineage?.weekDate!==date||
     lineage?.sourceIdentity!==binding.eventId||
     lineage?.sourceMode!=='EXPLICITLY_AUTHORIZED_IN_ROUND'||
     lineage?.sourceFreshness!=='VERIFIED_PROVIDER_RECENT'||
     !/^[A-Za-z0-9._:/-]{5,128}$/.test(String(lineage?.permissionReference??''))||
     !/^[A-Za-z0-9_-]{1,100}$/.test(String(lineage?.roundId??''))||
     !Number.isSafeInteger(lineage?.cursor)||lineage.cursor<1||
     sync?.latest?.sourceCursor!==lineage.cursor||
     sync?.latest?.sourceUpdatedAt!==lineage.sourceUpdatedAt||
     sync?.latest?.observedAt!==sync?.status?.lastSuccessAt||
     lineage?.receivedAt!==sync?.status?.lastSuccessAt||
     lineage?.envelopeDigest!==signature||!scored||
     !Number.isFinite(updated)||updated<start||updated>end||updated>now||now-updated>10*60_000||
     !Number.isFinite(success)||success>now||now-success>10*60_000||
     !revision||revision!==String(binding?.verifiedLeagueRevision??''))
    return fail('SAVED_SOURCE_REVISION_NOT_CONFIRMED');
  // Entries are supplied by the deployed v35 chooseLive selector. Never silently
  // truncate a team, reuse blank score rows, or derive scores from raw UDisc.
  const entries=live.entries;
  if(!Array.isArray(entries)||entries.length===0||entries.length>12||
     entries.some(s=>typeof s!=='string'||s.length===0||s.length>48||
       /[\u0000-\u001f\u007f]/.test(s)))
    return fail('SCOREBOARD_ENTRIES_UNSUPPORTED');
  const desired=cartContext?.desired;
  const fence=cartContext?.fence;
  if(!Number.isSafeInteger(desired?.revision)||desired.revision<0||
     fence?.active!==true||!Number.isSafeInteger(fence.epoch)||fence.epoch<0||
     typeof fence.release_id!=='string'||!fence.release_id||
     desired?.state?.power!=='on')
    return fail('CART_COMMAND_FENCE_UNAVAILABLE');
  const priority=20; // Below the existing normal Owner/public overlay default 60.
  if(Array.isArray(desired.state.overlays)&&desired.state.overlays.some(o=>
       Number(o?.expiresAt)>now&&Number(o?.priority??0)>=priority))
    return fail('MANUAL_OR_HIGHER_PRIORITY_OVERLAY_ACTIVE');
  const bucket=Math.floor(now/240000); // Existing four-minute redisplay cadence.
  const key=`glow-${date.replaceAll('-','')}-${signature.slice(0,20)}-${bucket}`;
  if(priorDispatch?.key===key&&priorDispatch?.sourceRevision===revision)
    return fail('SCORE_INTENT_ALREADY_DISPATCHED');
  const ttlMs=15000;
  return Object.freeze({
    kind:'canonical_command_candidate',
    authority:'backend_only_requires_Controls_admission',
    source:{eventId:binding.eventId,weekDate:date,leagueRevision:revision,signature},
    expectedRevision:desired.revision,
    requiredFence:{epoch:fence.epoch,releaseId:fence.release_id},
    key,commandId:key,type:'OVERLAY_START',
    payload:{overlayId:key,kind:'scoreboard',priority,ttlMs,data:{label:'GLOW',entries:[...entries]}},
    providerReceiptRequired:true,deviceReadbackRequired:true,fieldVisualRequired:true
  });
}
