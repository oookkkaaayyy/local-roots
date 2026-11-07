/**
 * REVIEW_ONLY. Protected private HTTP transport for the accepted Scoring P0
 * organizer XLSX adapter. No public UI, no UDisc fetch, no Cart actuation.
 * Installation requires the existing single Scoring release admission.
 */
import {validateGlowEventBinding} from './udisc-glow-event-bindings.mjs';
import {importOrganizerGlowXlsx} from './udisc-glow-organizer-import.review.mjs';
import {NOV10_MAIN_LAYOUT,qualifyNov10MainWeek} from './udisc-nov10-main-layout.review.mjs';

export const ORGANIZER_IMPORT_PATH='/internal/udisc-glow-organizer-import';
const MAX_FILE_BYTES=12*1024*1024;
const MAX_REQUEST_BYTES=16*1024*1024;
const text=v=>String(v??'');
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{
  'Cache-Control':'private, no-store, max-age=0',
  'Content-Type':'application/json; charset=utf-8',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
}});

async function secretMatches(given,expected){
  if(typeof expected!=='string'||expected.length<32||typeof given!=='string'||!given.startsWith('Bearer '))return false;
  const candidate=given.slice(7);
  if(candidate.length>1024||candidate.length<32)return false;
  // Compare fixed-length digests instead of short-circuiting token characters.
  const enc=new TextEncoder();
  const [a,b]=await Promise.all([
    crypto.subtle.digest('SHA-256',enc.encode(candidate)),
    crypto.subtle.digest('SHA-256',enc.encode(expected))
  ]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
  for(let i=0;i<x.length;i++)diff |= x[i]^y[i];
  return diff===0;
}

function qualifiedConfig(env){
  if(env?.HBNF_UDISC_OPERATOR_IMPORT_ENABLED!=='true')return null;
  const url=text(env.SUPABASE_URL).replace(/\/$/,'');
  const key=text(env.SUPABASE_SERVICE_ROLE_KEY);
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')return null;
  }catch{return null;}
  if(key.length<32)return null;
  return {url,key};
}

function providerAdapters(config,fetchImpl,now){
  const headers={apikey:config.key,Authorization:`Bearer ${config.key}`,
    Accept:'application/json','Cache-Control':'no-store'};
  async function readState(){
    const res=await fetchImpl(config.url+'/rest/v1/league_state?id=eq.1&select=state_json,updated_at',
      {headers,cache:'no-store',redirect:'manual'});
    if(res.status!==200)throw Error('Provider scoring state unavailable');
    const rows=await res.json();
    if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.updated_at||!rows[0]?.state_json?.glow)
      throw Error('Invalid authoritative scoring state');
    return rows[0];
  }
  async function readBinding({eventId,weekDate}){
    const url=new URL(config.url+'/rest/v1/hbnf_udisc_glow_event_bindings');
    url.searchParams.set('select','event_id,event_date,window_start,window_end');
    url.searchParams.set('event_id',`eq.${eventId}`);
    url.searchParams.set('event_date',`eq.${weekDate}`);
    url.searchParams.set('limit','2');
    const res=await fetchImpl(url.toString(),{headers,cache:'no-store',redirect:'manual'});
    if(res.status!==200)throw Error('Provider binding unavailable');
    const rows=await res.json();
    if(!Array.isArray(rows)||rows.length!==1)throw Error('Missing/ambiguous event binding');
    return rows;
  }
  async function applyWeek(payload){
    const res=await fetchImpl(config.url+'/rest/v1/rpc/hbnf_apply_udisc_glow_week',{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},redirect:'manual',cache:'no-store',
      body:JSON.stringify(payload),
    });
    // Any missing/failed RPC acknowledgment is ambiguous and never retried.
    if(res.status!==200)throw Error('Guarded scoring commit not acknowledged');
    const result=await res.json();
    if(!result||typeof result!=='object'||typeof result.applied!=='boolean')
      throw Error('Guarded scoring acknowledgment invalid');
    return result;
  }
  return {readBinding,readState,applyWeek,receiptTime:()=>now().toISOString()};
}

function validateSelection(eventId,weekDate){
  return /^hb-glow-doubles-[A-Za-z0-9]{6}$/.test(eventId)&&
    /^20\d{2}-\d\d-\d\d$/.test(weekDate);
}

function readiness({row,binding,weekDate}){
  const glow=row.state_json.glow;
  const week=glow.weeks?.[weekDate];
  const pars=week?.scorecardText?.holePars;
  const parEntries=Array.from({length:18},(_,i)=>text(pars?.[String(i+1)]).trim());
  const parsQualified=parEntries.every(s=>/^[1-9]$/.test(s));
  const mainLayoutRequired=binding.eventId===NOV10_MAIN_LAYOUT.eventId&&weekDate===NOV10_MAIN_LAYOUT.date;
  const layoutQualified=!mainLayoutRequired||qualifyNov10MainWeek({eventId:binding.eventId,weekDate,week});
  const locked=week?.scoresLocked===true||week?.cards?.some(c=>c?.finalized===true)===true;
  const active=glow.activeWeek===weekDate;
  const sourceEventMatched=!week?.udiscSync?.eventId||week.udiscSync.eventId===binding.eventId;
  const operatorActions=[];
  if(!week)operatorActions.push('INITIALIZE_EVENT_WEEK_THROUGH_EXISTING_SCORING_ADMIN');
  if(week&&!active)operatorActions.push('SELECT_BOUND_EVENT_WEEK_THROUGH_EXISTING_SCORING_ADMIN');
  if(week&&!parsQualified)operatorActions.push('VERIFY_ALL_18_EVENT_HOLE_PARS');
  if(week&&!layoutQualified)operatorActions.push('INITIALIZE_NOV10_WITH_AUTHORIZED_MAIN_LAYOUT_WITNESS');
  if(locked)operatorActions.push('RESOLVE_WEEK_LOCK_WITH_EXISTING_SCORING_AUTHORITY');
  if(!sourceEventMatched)operatorActions.push('RESOLVE_EVENT_SOURCE_MISMATCH_WITH_SCORING_AUTHORITY');
  if(week&&active&&parsQualified&&layoutQualified&&!locked&&sourceEventMatched)
    operatorActions.push('UPLOAD_ORGANIZER_AUTHORIZED_OFFICIAL_XLSX');
  return {
    source:'AUTHENTICATED_PERSISTED_PROVIDER',eventId:binding.eventId,weekDate:binding.weekDate,
    windowStart:binding.windowStart,windowEnd:binding.windowEnd,
    stateRevision:row.updated_at,activeWeek:glow.activeWeek,
    weekInitialized:!!week,weekActive:active,parCount:parEntries.filter(s=>/^[1-9]$/.test(s)).length,
    parsQualified,layoutQualified,locked,sourceEventMatched,teamCount:Array.isArray(week?.players)?week.players.length:0,
    uploaderEligible:!!week&&active&&parsQualified&&layoutQualified&&!locked&&sourceEventMatched,
    sourceFreshness:'NOT_ASSERTED',cartIntent:'NOT_REQUESTED',operatorActions
  };
}

export async function handleOrganizerImportRequest(request,env,{fetchImpl=fetch,now=()=>new Date()}={}){
  const url=new URL(request.url);
  if(url.pathname!==ORGANIZER_IMPORT_PATH)return json(404,{disposition:'NOT_FOUND'});
  const config=qualifiedConfig(env);
  if(!config)return json(404,{disposition:'IMPORT_NOT_ADMITTED'});
  if(request.method!=='GET'&&request.method!=='POST')return json(405,{disposition:'METHOD_NOT_ALLOWED'});
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return json(403,{disposition:'ORIGIN_REJECTED'});
  if(!await secretMatches(request.headers.get('Authorization'),env.HBNF_UDISC_ORGANIZER_IMPORT_TOKEN))
    return json(403,{disposition:'OPERATOR_NOT_AUTHORIZED'});
  const provider=providerAdapters(config,fetchImpl,now);
  if(request.method==='GET'){
    if([...url.searchParams.keys()].some(k=>k!=='eventId'&&k!=='weekDate'))
      return json(400,{disposition:'INVALID_READINESS_QUERY'});
    const eventId=text(url.searchParams.get('eventId')),weekDate=text(url.searchParams.get('weekDate'));
    if(!validateSelection(eventId,weekDate))return json(400,{disposition:'INVALID_EVENT_SELECTION'});
    try{
      const rows=await provider.readBinding({eventId,weekDate});
      const binding=validateGlowEventBinding(rows[0]);
      if(binding.eventId!==eventId||binding.weekDate!==weekDate)throw Error('Bound identity mismatch');
      const row=await provider.readState();
      return json(200,{disposition:'READINESS_READ_ONLY',...readiness({row,binding,weekDate})});
    }catch{return json(409,{disposition:'BINDING_OR_SOURCE_NOT_READY'});}
  }
  if(url.search)return json(400,{disposition:'INVALID_UPLOAD_URL'});
  const len=Number(request.headers.get('Content-Length')||'0');
  if(len>MAX_REQUEST_BYTES)return json(413,{disposition:'UPLOAD_TOO_LARGE'});
  if(!/multipart\/form-data;\s*boundary=/i.test(request.headers.get('Content-Type')||''))
    return json(415,{disposition:'MULTIPART_XLSX_REQUIRED'});
  let form;
  try{form=await request.formData();}catch{return json(400,{disposition:'UPLOAD_FORM_INVALID'});}
  if([...form.keys()].some(k=>!['eventId','weekDate','xlsx','reviewedDecisions','officialExportConfirmed'].includes(k)))
    return json(400,{disposition:'UNKNOWN_UPLOAD_FIELD'});
  const eventId=text(form.get('eventId')),weekDate=text(form.get('weekDate'));
  if(!validateSelection(eventId,weekDate)||form.get('officialExportConfirmed')!=='yes')
    return json(400,{disposition:'EVENT_OR_ORGANIZER_ATTESTATION_MISSING'});
  const file=form.get('xlsx');
  if(!file||typeof file.arrayBuffer!=='function'||
      !String(file.name||'').toLowerCase().endsWith('.xlsx')||file.size<22||file.size>MAX_FILE_BYTES)
    return json(400,{disposition:'OFFICIAL_XLSX_FILE_REQUIRED'});
  let reviewedDecisions={};
  try{
    const raw=form.get('reviewedDecisions');
    if(raw){if(typeof raw!=='string'||raw.length>32768)throw Error();reviewedDecisions=JSON.parse(raw);}
    if(!reviewedDecisions||Array.isArray(reviewedDecisions)||typeof reviewedDecisions!=='object')throw Error();
  }catch{return json(400,{disposition:'REVIEWED_ALIAS_DECISIONS_INVALID'});}
  // These bytes originate from an operator download, never a Worker request to UDisc.
  const bytes=new Uint8Array(await file.arrayBuffer());
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
  const result=await importOrganizerGlowXlsx({upload:{eventId,weekDate,xlsx:bytes,sha256,reviewedDecisions},
    adapters:{...provider,authorize:()=>true,
      // There is deliberately NO upload-controlled correction authorization.
      authorizeCorrection:()=>false,
    }});
  let status=200;
  if(result.wrote===null||result.wrote===true&&!result.readbackVerified)status=503;
  else if(result.disposition!=='SAVED_AND_READBACK_VERIFIED'&&result.disposition!=='DUPLICATE_VERIFIED')status=409;
  return json(status,result);
}
