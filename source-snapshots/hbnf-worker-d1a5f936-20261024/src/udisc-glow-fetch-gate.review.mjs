/**
 * Scoring P0's EXISTING cron fetch gate. No timer, queue, second Worker,
 * provider cursor or client-side scoring writer.
 * Requires the separately admitted and readback-verified SQL gate. A missing
 * RPC or failed readback fails CLOSED before any UDisc request.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function headers(key) {
  return {apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'};
}
async function post(fetchImpl,config,name,body) {
  const response=await fetchImpl(config.supabaseUrl+'/rest/v1/rpc/'+name,{
    method:'POST',cache:'no-store',redirect:'manual',
    headers:headers(config.serviceKey),body:JSON.stringify(body),
    signal:AbortSignal.timeout(6000),
  });
  if(!response.ok)throw Error('HBNF_UDISC_FETCH_GATE_RPC_UNAVAILABLE');
  return response.json();
}
async function readGate(fetchImpl,config,eventId) {
  const url=new URL(config.supabaseUrl+'/rest/v1/hbnf_udisc_glow_fetch_gate');
  url.searchParams.set('select','event_id,week_date,attempt_token,next_eligible_at,last_outcome');
  url.searchParams.set('event_id','eq.'+eventId);
  const response=await fetchImpl(url.toString(),{
    headers:headers(config.serviceKey),cache:'no-store',redirect:'manual',
    signal:AbortSignal.timeout(6000)
  });
  if(!response.ok)throw Error('HBNF_UDISC_FETCH_GATE_READBACK_UNAVAILABLE');
  const rows=await response.json();
  if(!Array.isArray(rows)||rows.length!==1)throw Error('HBNF_UDISC_FETCH_GATE_READBACK_AMBIGUOUS');
  return rows[0];
}

/** Valid HTTP Retry-After seconds or HTTP-date, bounded by this event window.
 * A Retry-After beyond the event blocks its entire remaining window. If the
 * header is malformed the durable SQL gate enforces a conservative 15m hold.
 */
export function providerRetryAfterAt(header,now,windowEnd) {
  const raw=String(header??'').trim();
  if(!raw||raw.length>100||!(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
  const cutoff=Date.parse(windowEnd)+60_000;
  if(!Number.isFinite(cutoff))return null;
  let ms;
  if(/^[0-9]{1,12}$/.test(raw)){
    const seconds=Number(raw);
    ms=Number.isSafeInteger(seconds)?now.getTime()+seconds*1000:NaN;
  }else if(/^[A-Za-z]{3}, [0-9]{1,2} [A-Za-z]{3} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(raw)){
    ms=Date.parse(raw);
  }else return null;
  if(!Number.isFinite(ms))return null;
  return new Date(Math.min(cutoff,Math.max(now.getTime(),ms))).toISOString();
}

export async function claimUdiscEventFetch(fetchImpl,config,binding) {
  const result=await post(fetchImpl,config,'hbnf_claim_udisc_glow_fetch',{
    p_event_id:binding.eventId,p_week_date:binding.weekDate
  });
  if(result?.allowed!==true)return {allowed:false,reason:'event_cadence_or_window'};
  const token=result.attemptToken;
  if(!UUID.test(String(token||''))||result.eventId!==binding.eventId||
     result.weekDate!==binding.weekDate||!Number.isFinite(Date.parse(result.failClosedUntil))){
    throw Error('HBNF_UDISC_FETCH_GATE_CLAIM_INVALID');
  }
  // Independent provider readback: the claim is durable and held beyond the
  // current event before any outbound UDisc request can occur.
  const row=await readGate(fetchImpl,config,binding.eventId);
  if(row.event_id!==binding.eventId||row.week_date!==binding.weekDate||
     row.attempt_token!==token||
     Date.parse(row.next_eligible_at)<=Date.parse(binding.windowEnd))
    throw Error('HBNF_UDISC_FETCH_GATE_CLAIM_NOT_DURABLE');
  return {allowed:true,token};
}

export async function completeUdiscEventFetch(fetchImpl,config,binding,token,outcome,httpStatus=null,retryAfterAt=null) {
  if(!UUID.test(String(token||''))||!['SUCCESS','SOURCE_FAILED','RATE_LIMITED'].includes(outcome))
    throw Error('HBNF_UDISC_FETCH_GATE_COMPLETION_INVALID');
  const result=await post(fetchImpl,config,'hbnf_finish_udisc_glow_fetch',{
    p_event_id:binding.eventId,p_week_date:binding.weekDate,
    p_attempt_token:token,p_outcome:outcome,
    p_http_status:httpStatus,p_retry_after_at:retryAfterAt
  });
  if(result?.recorded!==true||result.eventId!==binding.eventId||
     result.weekDate!==binding.weekDate||result.outcome!==outcome)
    throw Error('HBNF_UDISC_FETCH_GATE_COMPLETION_REJECTED');
  const row=await readGate(fetchImpl,config,binding.eventId);
  if(row.event_id!==binding.eventId||row.week_date!==binding.weekDate||
     row.attempt_token!==null||row.last_outcome!==outcome||
     Date.parse(row.next_eligible_at)!==Date.parse(result.nextEligibleAt))
    throw Error('HBNF_UDISC_FETCH_GATE_COMPLETION_NOT_DURABLE');
  return {confirmed:true,nextEligibleAt:result.nextEligibleAt};
}
