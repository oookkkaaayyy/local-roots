/*
 * HB Night Flyers — Round Tags
 * Build: 9.15.26_2
 *
 * Fast, literal, non-blocking live-round tag recorder.
 * - One Supabase row per player; scorecard writes cannot overwrite tags.
 * - Exact duplicate tag numbers are accepted and only create passive warnings.
 * - No swap prompts, no hidden inference, no automatic reassignment.
 * - Focus, keyboard, and scroll position are preserved during row saves.
 * - Revision checks keep newer server edits when stale clients reconnect.
 * - Draft changes after finalization require an explicit re-finalization.
 */
(function(){
  'use strict';

  const BUILD='9.15.26_2';
  const ENTRY_TABLE='hbnf_round_tag_entries';
  const AVAILABLE_TABLE='hbnf_round_available_tags';
  const CURRENT_TABLE='hbnf_current_tag_entries';
  const CURRENT_AVAILABLE_TABLE='hbnf_current_available_tags';
  const FINAL_TABLE='hbnf_round_tag_finalizations';
  const MODAL_ID='hbnfRoundTagsModal';
  const STYLE_ID='hbnfRoundTagsStyles';
  const OPEN_ATTR='data-open-round-tags';
  const PENDING_KEY='hbnf-round-tags-pending-v1';
  const CACHE_PREFIX='hbnf-round-tags-cache-v1:';
  const TABS=['confirm','all','holders','available','final'];

  const state={
    client:null,
    roundDate:'',
    eventType:'skins',
    authorityRevision:0,
    latestFinalizedEventType:'',
    latestFinalizationOrder:0,
    entries:new Map(),
    available:new Map(),
    cloudEntryKeys:new Set(),
    cloudAvailableTags:new Set(),
    cloudSnapshotReady:false,
    current:new Map(),
    currentAvailable:new Map(),
    currentLoaded:false,
    sync:new Map(),
    timers:new Map(),
    availableTimers:new Map(),
    realtime:null,
    loading:false,
    loaded:false,
    finalized:null,
    latestFinalizedDate:'',
    finalizedDirty:false,
    finalizing:false,
    finalizeArmedUntil:0,
    renderQueued:false,
    activeTab:'confirm',
    expandedKey:null,
    warningsOpen:false,
    handoffMode:false,
    closeoutMode:false,
    online:navigator.onLine!==false,
    lastToastTimer:null
  };

  const originalIncoming=typeof window.HBNFIncomingTagMap==='function'?window.HBNFIncomingTagMap:null;
  const originalBefore=typeof window.bagTagMapBeforeDate==='function'?window.bagTagMapBeforeDate:null;
  const originalSelected=typeof window.selectedWeekTagMap==='function'?window.selectedWeekTagMap:null;

  function q(sel,root){return (root||document).querySelector(sel)}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel))}
  function text(v){return String(v==null?'':v)}
  function clean(v){return text(v).trim()}
  function esc(v){return text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function keyFor(name){return clean(name).toLocaleLowerCase('en-US')}
  function uuid(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)})}
  function nowIso(){return new Date().toISOString()}
  function ctxSafe(){try{if(typeof ctx!=='undefined'&&ctx)return ctx}catch(_e){};try{if(window.HBNFGlowRoundTagAdapter&&typeof window.HBNFGlowRoundTagAdapter.context==='function')return window.HBNFGlowRoundTagAdapter.context()}catch(_e){};return window.ctx||null}
  function activeWeek(){const c=ctxSafe();return text(c&&c.state&&c.state.activeWeek)||text(q('#weekSelect')&&q('#weekSelect').value)}
  function eventType(){const c=ctxSafe();return c&&c.branch==='glow'?'glow':'skins'}
  function getWeekSafe(){try{if(window.HBNFGlowRoundTagAdapter&&ctxSafe()&&ctxSafe().branch==='glow')return window.HBNFGlowRoundTagAdapter.week()}catch(_e){};try{return typeof getWeek==='function'?getWeek():null}catch(_e){return null}}
  function cacheKey(date,event){return CACHE_PREFIX+(event||state.eventType)+'|'+date}
  function isOpen(){return !!q('#'+MODAL_ID+'.open')}
  function exchangeExceptionMap(){const week=getWeekSafe();return week&&week.tagExchangeExceptions&&typeof week.tagExchangeExceptions==='object'?week.tagExchangeExceptions:{}}
  function exchangeExceptionFor(key){return exchangeExceptionMap()[keyFor(key)]||null}
  function isExchangeExcluded(key){const row=exchangeExceptionFor(key);return !!(row&&row.excluded)}
  function noTagOnFile(row){return !!(row&&row.status==='unknown'&&!Number(row.tag_number||0)&&!Number(currentOfficialTag(row.player_key)||0))}
  function isUnresolved(row){if(!row)return true;if(isExchangeExcluded(row.player_key))return false;if(noTagOnFile(row))return false;return row.status==='unconfirmed'||row.status==='unknown'}
  function fmtDate(value){
    const parts=text(value).split('-').map(Number);
    if(parts.length!==3||!parts[0])return text(value);
    try{return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(parts[0],parts[1]-1,parts[2]))}catch(_e){return text(value)}
  }

  function getClient(){
    if(testTagFixture())return null;
    if(state.client)return state.client;
    const c=ctxSafe();
    if(c&&c.supabaseClient){state.client=c.supabaseClient;return state.client}
    const cfg=window.APP_CONFIG||window.HBNF_SUPABASE_FALLBACK||{};
    if(window.supabase&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY){
      state.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    }
    return state.client;
  }

  function testTagFixture(){const fixture=window.HBNFTestTagFixture;return !!(fixture&&fixture.testOnly===true&&typeof fixture.loadRound==='function'&&location.protocol==='http:'&&location.search.includes('hbnf-test-fixture=1'))?fixture:null}
  function syncTestFixtureParticipants(){const fixture=testTagFixture();if(!fixture||!state.loaded)return;try{const data=fixture.syncParticipants(state.roundDate,state.eventType,participants())||{};if(Array.isArray(data.currentEntries))applyCurrentSnapshot(data.currentEntries,[]);(data.entries||[]).forEach(row=>{row=normalizeEntry(row);if(row.player_key&&!state.entries.has(row.player_key))state.entries.set(row.player_key,row)})}catch(err){console.error('Test tag fixture participant sync failed',err)}}

  function participants(){
    const week=getWeekSafe(),out=[],seen=new Set();
    function add(name){name=clean(name);const key=keyFor(name);if(name&&!seen.has(key)){seen.add(key);out.push({key,name})}}
    if(typeof window.HBNFGlowRoundTagAdapter==='object'&&window.HBNFGlowRoundTagAdapter&&ctxSafe()&&ctxSafe().branch==='glow'){
      try{(window.HBNFGlowRoundTagAdapter.participants()||[]).forEach(add)}catch(err){console.error('Glow Round Tags participant read failed',err)}
      return out;
    }
    if(!week)return out;
    try{
      ((week.front&&week.front.cards)||[]).forEach(card=>{
        if(typeof frontRows==='function')(frontRows(card)||[]).forEach(row=>add(row.name));
        else text(card&&card.playersText).split('\n').forEach(add);
      });
      ((week.back&&week.back.cards)||[]).forEach(card=>{
        if(typeof backRows==='function')(backRows(card)||[]).forEach(row=>(row.players&&row.players.length?row.players:[row.name]).forEach(add));
        else text(card&&card.teamsText).split('\n').forEach(line=>line.split('/').forEach(add));
      });
    }catch(err){console.error('Round Tags participant read failed',err)}
    return out;
  }

  function legacyMasterMap(){
    const out=new Map(),c=ctxSafe(),root=(c&&c.rootState)||{};
    const players=(root.bagTags&&Array.isArray(root.bagTags.players))?root.bagTags.players:[];
    players.forEach(row=>{const name=clean(row&&row.name),tag=Number(row&&row.tag)||0;if(name&&tag>0)out.set(keyFor(name),{player_key:keyFor(name),player_name:name,tag_number:tag})});
    return out;
  }

  function normalizeCurrent(row){
    const name=clean(row&&row.player_name),key=keyFor((row&&row.player_key)||name),tag=Number(row&&row.tag_number)||0;
    return{player_key:key,player_name:name||key,tag_number:tag>0?tag:null,updated_at:row&&row.updated_at||null};
  }

  function allTagHolderRows(){
    const rows=new Map(),participantMap=new Map(participants().map(p=>[p.key,p.name]));
    if(!state.currentLoaded)legacyMasterMap().forEach((row,key)=>rows.set(key,normalizeCurrent(row)));
    state.current.forEach((row,key)=>rows.set(keyFor(key),normalizeCurrent(row)));
    participantMap.forEach((name,key)=>{if(!rows.has(key))rows.set(key,normalizeCurrent({player_key:key,player_name:name,tag_number:null}))});
    return Array.from(rows.values()).map(row=>Object.assign({},row,{in_round:participantMap.has(row.player_key)})).sort((a,b)=>(Number(a.tag_number)||2147483647)-(Number(b.tag_number)||2147483647)||a.player_name.localeCompare(b.player_name));
  }

  function currentDuplicateNames(key,tag){
    tag=Number(tag)||0;if(!tag)return[];
    return allTagHolderRows().filter(row=>row.player_key!==key&&Number(row.tag_number)===tag).map(row=>row.player_name);
  }

  function applyBagTagsFromServer(bagTags){
    if(!bagTags||typeof bagTags!=='object')return;
    const c=ctxSafe();if(c&&c.rootState)c.rootState.bagTags=bagTags;
    try{if(typeof btSaveLocalConfig==='function')btSaveLocalConfig(bagTags);else localStorage.setItem('hbnf-bag-tags',JSON.stringify(bagTags))}catch(_e){}
  }

  function applyCurrentSnapshot(entries,availableTags){
    if(Array.isArray(entries)){
      state.current.clear();
      entries.forEach(row=>{row=normalizeCurrent(row);if(row.player_key)state.current.set(row.player_key,row)});
      state.currentLoaded=true;
    }
    if(Array.isArray(availableTags)){
      state.currentAvailable.clear();
      availableTags.forEach(row=>{const tag=Number(row&&row.tag_number)||0;if(tag>0)state.currentAvailable.set(tag,row)});
    }
  }

  function currentMap(){
    const out={};
    const source=state.currentLoaded?state.current:legacyMasterMap();
    const counts=new Map();source.forEach(row=>{row=normalizeCurrent(row);const tag=Number(row.tag_number)||0;if(tag)counts.set(tag,(counts.get(tag)||0)+1)});
    source.forEach(row=>{row=normalizeCurrent(row);const tag=Number(row.tag_number)||0;if(row.player_name&&tag&&counts.get(tag)===1)out[row.player_name]=tag});
    return out;
  }

  function verifiedCurrentTag(key){
    key=keyFor(key);const source=state.currentLoaded?state.current:legacyMasterMap(),row=source.get(key);if(!row)return null;
    const tag=Number(row.tag_number)||0;if(!tag)return null;
    let owners=0;source.forEach(item=>{if(Number(item.tag_number)===tag)owners++});return owners===1?tag:null;
  }

  function currentOwnershipSnapshot(){
    return Array.from(state.current.values()).map(row=>({player_key:keyFor(row.player_key||row.player_name),tag_number:row.tag_number==null?null:(Number(row.tag_number)||null)})).filter(row=>row.player_key).sort((a,b)=>a.player_key.localeCompare(b.player_key));
  }
  function currentAvailableSnapshot(){return Array.from(state.currentAvailable.keys()).map(Number).filter(tag=>tag>0).sort((a,b)=>a-b)}

  async function refreshCurrentOwnership(){
    const client=getClient();if(!client)return{ok:false,reason:'client-unavailable'};
    let snapshot=null;
    for(let attempt=0;attempt<2;attempt++){
      const before=await client.from('hbnf_tag_authority_state').select('revision').eq('id',1).maybeSingle();
      if(before.error)throw before.error;
      const [entries,available,after]=await Promise.all([
        client.from(CURRENT_TABLE).select('*').order('tag_number'),
        client.from(CURRENT_AVAILABLE_TABLE).select('*').order('tag_number'),
        client.from('hbnf_tag_authority_state').select('revision,latest_finalized_round').eq('id',1).maybeSingle()
      ]);
      if(entries.error)throw entries.error;if(available.error)throw available.error;if(after.error)throw after.error;
      snapshot={entries:entries.data||[],available:available.data||[],authority:after.data};
      if(Number(before.data&&before.data.revision)===Number(after.data&&after.data.revision))break;
    }
    const snapshotRevision=Number(snapshot&&snapshot.authority&&snapshot.authority.revision)||0;
    if(!state.currentLoaded||snapshotRevision>=state.authorityRevision){
      applyCurrentSnapshot(snapshot.entries,snapshot.available);
      state.authorityRevision=snapshotRevision;
    }
    return{ok:true,current:currentMap(),available:currentAvailableSnapshot(),revision:state.authorityRevision};
  }

  async function saveManualAssignments(changes,expectedRevision){
    const client=getClient();if(!client)return{ok:false,reason:'client-unavailable'};
    const payload=(changes||[]).map(row=>({player_name:clean(row.player_name),tag_number:Number(row.tag_number)||0}));
    const baseline=new Map(payload.map(row=>{const key=keyFor(row.player_name),current=state.current.get(key);return[key,current?{tag_number:Number(current.tag_number)||null,updated_at:current.updated_at||null}:null]}));
    let {data,error}=await client.rpc('hbnf_set_current_tag_assignments_v1',{p_changes:payload,p_expected_authority_revision:Number(expectedRevision)});
    if(error)throw error;
    if(!data||data.status!=='saved'){
      if(data&&data.status==='conflict'){
        await refreshCurrentOwnership();
        const unchanged=payload.every(row=>{
          const key=keyFor(row.player_name),before=baseline.get(key),after=state.current.get(key);
          return before===null?!after:!!after&&Number(after.tag_number||0)===Number(before.tag_number||0)&&(after.updated_at||null)===before.updated_at;
        });
        if(unchanged){const retry=await client.rpc('hbnf_set_current_tag_assignments_v1',{p_changes:payload,p_expected_authority_revision:Number(state.authorityRevision)});if(retry.error)throw retry.error;data=retry.data||data}
      }
      if(!data||data.status!=='saved')return{ok:false,reason:data&&data.reason||'unexpected-response',data};
    }
    applyCurrentSnapshot(data.current_entries||[],data.current_available_tags||[]);
    state.authorityRevision=Number(data.current_revision)||state.authorityRevision;
    applyBagTagsFromServer(data.bag_tags);
    payload.forEach(change=>{const winner=keyFor(change.player_name),tag=Number(change.tag_number);state.entries.forEach((entry,key)=>{if(key!==winner&&Number(entry.tag_number)===tag)state.entries.set(key,normalizeEntry(Object.assign({},entry,{tag_number:null,status:'unknown'})))})});
    notifyOfficialCurrentChanged();
    document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date:state.roundDate}}));
    return{ok:true,data,current:currentMap(),available:currentAvailableSnapshot(),revision:state.authorityRevision};
  }

  function finalizedMap(){
    if(!state.finalized||state.finalized.handoff_pending||!finalizationIsCurrent())return null;
    const assignments=Array.isArray(state.finalized.assignments)?state.finalized.assignments:[];
    const out={};
    assignments.forEach(row=>{const name=clean(row&&row.player_name),tag=Number(row&&row.tag_number)||0;if(name&&tag>0)out[name]=tag});
    return Object.keys(out).length?out:null;
  }

  function notifyOfficialCurrentChanged(){
    document.dispatchEvent(new CustomEvent('hbnf:official-tags-changed',{detail:{date:state.roundDate}}));
  }

  function readPending(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'{"entries":{},"available":{}}')}catch(_e){return{entries:{},available:{}}}}
  function writePending(data){try{localStorage.setItem(PENDING_KEY,JSON.stringify(data))}catch(_e){}}
  function pendingId(type,date,key,event){return type+'|'+(event||state.eventType)+'|'+date+'|'+key}
  function setPending(type,key,payload){const p=readPending(),bucket=type==='entry'?'entries':'available';p[bucket][pendingId(type,state.roundDate,key,state.eventType)]=payload;writePending(p)}
  function clearPending(type,key,clientEditId,date,event){const p=readPending(),bucket=type==='entry'?'entries':'available',scope=event||state.eventType,ids=[pendingId(type,date||state.roundDate,key,scope)];if(scope==='skins')ids.push(type+'|'+(date||state.roundDate)+'|'+key);ids.forEach(id=>{if(p[bucket][id]&&p[bucket][id].client_edit_id===clientEditId)delete p[bucket][id]});writePending(p)}
  function pendingForRound(type,date,event){const p=readPending(),bucket=type==='entry'?'entries':'available',scope=event||state.eventType,prefix=type+'|'+scope+'|'+date+'|',rows=Object.entries(p[bucket]).filter(([id])=>id.startsWith(prefix)).map(([,v])=>v);if(scope==='skins')rows.push(...Object.entries(p[bucket]).filter(([id])=>id.startsWith(type+'|'+date+'|')).map(([,v])=>v));return rows}

  function writeCache(){
    try{localStorage.setItem(cacheKey(state.roundDate,state.eventType),JSON.stringify({entries:Array.from(state.entries.values()),available:Array.from(state.available.values()),savedAt:nowIso()}))}catch(_e){}
  }
  function readCache(date,event){try{return JSON.parse(localStorage.getItem(cacheKey(date,event))||'null')}catch(_e){return null}}

  function normalizeEntry(row){
    return{
      round_date:text(row.round_date||state.roundDate),
      event_type:text(row.event_type||state.eventType),
      player_key:keyFor(row.player_key||row.player_name),
      player_name:clean(row.player_name),
      tag_number:row.tag_number==null?null:(Number(row.tag_number)||null),
      status:['confirmed','unconfirmed','unknown','untagged'].includes(row.status)?row.status:'unconfirmed',
      client_edit_id:row.client_edit_id||uuid(),
      revision:Number(row.revision)||1,
      updated_at:row.updated_at||nowIso()
    };
  }

  function normalizeAvailable(row){
    return{
      round_date:text(row.round_date||state.roundDate),
      event_type:text(row.event_type||state.eventType),
      tag_number:Number(row.tag_number)||0,
      source:clean(row.source),
      notes:clean(row.notes),
      client_edit_id:row.client_edit_id||uuid(),
      revision:Number(row.revision)||1,
      updated_at:row.updated_at||nowIso()
    };
  }

  function entryMap(){
    const out={};
    state.entries.forEach(row=>{
      const tag=Number(row.tag_number)||0;
      if(tag>0&&(row.status==='confirmed'||row.status==='unconfirmed'))out[row.player_name]=tag;
    });
    return out;
  }
  function availableNumbers(){return Array.from(state.available.values()).map(r=>Number(r.tag_number)||0).filter(Boolean).sort((a,b)=>a-b)}

  function statusCounts(){
    let confirmed=0,unconfirmed=0,unknown=0,untagged=0;
    participants().forEach(p=>{
      const r=state.entries.get(p.key);
      if(!r){unknown++;return}
      if(r.status==='confirmed')confirmed++;
      else if(r.status==='untagged')untagged++;
      else if(r.status==='unknown')unknown++;
      else unconfirmed++;
    });
    return{confirmed,unconfirmed,unknown,untagged,total:participants().length};
  }

  function rowWarnings(){
    const byTag=new Map(),warnings=[];
    state.entries.forEach(row=>{
      const tag=Number(row.tag_number)||0;
      if(tag>0&&(row.status==='confirmed'||row.status==='unconfirmed')){
        if(!byTag.has(tag))byTag.set(tag,[]);
        byTag.get(tag).push(row.player_name);
      }
    });
    byTag.forEach((names,tag)=>{if(names.length>1)warnings.push({type:'duplicate',tag,text:'#'+tag+' is recorded for '+names.join(' and ')+'.'})});
    state.available.forEach(row=>{
      const names=byTag.get(Number(row.tag_number));
      if(names&&names.length)warnings.push({type:'assigned-available',tag:Number(row.tag_number),text:'#'+row.tag_number+' is assigned to '+names.join(' / ')+' and also listed as available.'});
    });
    return warnings;
  }

  function overallSync(){
    let saving=0,error=0;
    state.sync.forEach(value=>{if(value==='saving')saving++;else if(value==='error')error++});
    if(!state.online)return{kind:'offline',label:'Offline — changes are queued'};
    if(error)return{kind:'error',label:error+' change'+(error===1?'':'s')+' waiting to sync'};
    if(saving)return{kind:'saving',label:'Saving '+saving+' change'+(saving===1?'':'s')+'…'};
    return{kind:'saved',label:'All changes saved'};
  }

  function scheduleRender(full){
    if(full===false){patchChrome();return}
    if(state.renderQueued)return;
    state.renderQueued=true;
    requestAnimationFrame(()=>{state.renderQueued=false;renderShell();updateOpenButton()});
  }

  function showToast(message,kind){
    const modal=q('#'+MODAL_ID);if(!modal)return;
    let toast=q('[data-rt-toast]',modal);
    if(!toast){toast=document.createElement('div');toast.className='rt-toast';toast.setAttribute('data-rt-toast','1');modal.appendChild(toast)}
    toast.className='rt-toast '+(kind||'');toast.textContent=message;toast.classList.add('show');
    clearTimeout(state.lastToastTimer);state.lastToastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
  }

  function ensureParticipantRowsLocal(){
    participants().forEach(p=>{
      if(state.entries.has(p.key))return;
      const cur=verifiedCurrentTag(p.key);
      state.entries.set(p.key,normalizeEntry({round_date:state.roundDate,player_key:p.key,player_name:p.name,tag_number:cur,status:cur?'unconfirmed':'unknown'}));
    });
  }

  function hideAmbiguousDraftTags(){
    if(state.finalized)return;
    const byTag=new Map();state.entries.forEach(row=>{const tag=Number(row.tag_number)||0;if(tag){if(!byTag.has(tag))byTag.set(tag,[]);byTag.get(tag).push(row)}});
    byTag.forEach(rows=>{if(rows.length>1)rows.forEach(row=>state.entries.set(row.player_key,normalizeEntry(Object.assign({},row,{tag_number:null,status:'unknown'}))));});
  }

  async function ensureMissingParticipants(client,date,event){
    const missing=[];
    participants().forEach(p=>{
      if(state.cloudEntryKeys.has(p.key))return;
      const current=verifiedCurrentTag(p.key);
      missing.push({round_date:date,event_type:event,player_key:p.key,player_name:p.name,tag_number:current,status:current?'unconfirmed':'unknown',client_edit_id:uuid()});
    });
    if(!missing.length)return[];
    const {error}=await client.from(ENTRY_TABLE).upsert(missing,{onConflict:'round_date,event_type,player_key',ignoreDuplicates:true});
    if(error)throw error;
    missing.forEach(row=>state.cloudEntryKeys.add(row.player_key));
    return missing;
  }

  async function ensureMissingAvailableTags(client,date,event){
    if(state.cloudAvailableTags.size||!state.currentAvailable.size)return[];
    const missing=Array.from(state.currentAvailable.values()).map(row=>({round_date:date,event_type:event,tag_number:Number(row.tag_number),source:row.source||'Unassigned from prior round',notes:row.notes||'',client_edit_id:uuid()}));
    if(!missing.length)return[];
    const {error}=await client.from(AVAILABLE_TABLE).upsert(missing,{onConflict:'round_date,event_type,tag_number',ignoreDuplicates:true});
    if(error)throw error;
    missing.forEach(row=>state.cloudAvailableTags.add(row.tag_number));
    return missing;
  }

  function missingRoundRecords(){
    const participantsMissing=participants().filter(p=>!state.cloudEntryKeys.has(p.key));
    const availableMissing=!state.cloudAvailableTags.size?Array.from(state.currentAvailable.values()):[];
    return{participants:participantsMissing,available:availableMissing};
  }

  function canInitializeRoundRecords(){
    const context=ctxSafe();
    return !!(state.loaded&&state.cloudSnapshotReady&&state.online&&!state.finalized&&state.roundDate===activeWeek()&&state.eventType===eventType()&&canSeedRoundFromSkinsContext(context));
  }

  async function initializeMissingRoundRecords(){
    if(!canInitializeRoundRecords()){showToast('Round records need a fresh, matching cloud baseline before initialization.','error');return{ok:false,reason:'baseline-unavailable'}}
    let missing=missingRoundRecords();
    if(!missing.participants.length&&!missing.available.length){showToast('There are no missing round records.','success');return{ok:true,unchanged:true}}
    const date=state.roundDate,event=state.eventType,authorityRevision=state.authorityRevision;
    const beforeCurrent=JSON.stringify(currentOwnershipSnapshot()),beforeAvailable=JSON.stringify(currentAvailableSnapshot());
    const description=[missing.participants.length+' participant row'+(missing.participants.length===1?'':'s'),missing.available.length+' available-tag row'+(missing.available.length===1?'':'s')].filter((_,index)=>index===0?missing.participants.length:missing.available.length).join(' and ');
    if(!window.confirm('Initialize '+description+' for '+fmtDate(date)+'? Existing round scores and tag holders will not be changed.'))return{ok:false,reason:'cancelled'};
    if(!canInitializeRoundRecords())return{ok:false,reason:'baseline-changed'};
    try{
      const refreshed=await refreshCurrentOwnership();
      if(!refreshed.ok||state.authorityRevision!==authorityRevision||JSON.stringify(currentOwnershipSnapshot())!==beforeCurrent||JSON.stringify(currentAvailableSnapshot())!==beforeAvailable){showToast('Tag ownership changed. Reload and review the current tags before initializing.','error');return{ok:false,reason:'ownership-changed'}}
      const client=getClient();if(!client)throw new Error('Cloud client unavailable');
      const addedParticipants=await ensureMissingParticipants(client,date,event);
      const addedAvailable=await ensureMissingAvailableTags(client,date,event);
      await loadRound(true);
      showToast('Missing round records initialized. Existing scores and tag holders were not changed.','success');
      return{ok:true,participants:addedParticipants.length,available:addedAvailable.length};
    }catch(error){console.error('Round Tags explicit initialization failed',error);showToast('Could not initialize round records. No existing scores or tag holders were changed.','error');return{ok:false,reason:'write-failed'}}
  }

  function canSeedRoundFromSkinsContext(context){
    return !!(context&&context.syncBaselineReady&&!context.localSyncNeedsConfirmation&&!context.remoteConflictPending);
  }

  async function loadRound(force){
    const date=activeWeek(),event=eventType();if(!date)return;
    if(!force&&state.loading)return;
    if(!force&&state.loaded&&state.roundDate===date&&state.eventType===event){scheduleRender(true);return}
    state.loading=true;state.loaded=false;state.cloudSnapshotReady=false;state.cloudEntryKeys.clear();state.cloudAvailableTags.clear();state.roundDate=date;state.eventType=event;state.entries.clear();state.available.clear();state.sync.clear();state.finalized=null;state.latestFinalizedDate='';state.latestFinalizedEventType='';state.latestFinalizationOrder=0;state.finalizedDirty=false;state.activeTab='confirm';state.expandedKey=null;state.warningsOpen=false;state.handoffMode=false;state.closeoutMode=false;
    const fixture=testTagFixture();
    if(fixture){
      try{
        const data=fixture.loadRound(date,event,participants())||{};
        (data.entries||[]).forEach(r=>{r=normalizeEntry(r);if(r.player_key)state.entries.set(r.player_key,r)});
        (data.available||[]).forEach(r=>{r=normalizeAvailable(r);if(r.tag_number)state.available.set(r.tag_number,r)});
        applyCurrentSnapshot(data.currentEntries||[],data.currentAvailable||[]);hideAmbiguousDraftTags();state.authorityRevision=0;state.loaded=true;state.loading=false;state.activeTab='confirm';
        state.sync.clear();scheduleRender(true);fixture.setStatus&&fixture.setStatus('Synthetic tags loaded for this device only.');
        document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date,testFixture:true}}));notifyOfficialCurrentChanged();return;
      }catch(err){console.error('Test tag fixture could not load',err);state.loading=false;scheduleRender(true);return}
    }
    const cached=readCache(date,event);
    if(cached){(cached.entries||[]).forEach(r=>{r=normalizeEntry(r);if(r.player_key)state.entries.set(r.player_key,r)});(cached.available||[]).forEach(r=>{r=normalizeAvailable(r);if(r.tag_number)state.available.set(r.tag_number,r)})}
    scheduleRender(true);
    const client=getClient();
    if(!client){state.loading=false;scheduleRender(true);return}
    try{
      const [entriesRes,availableRes,currentRes,currentAvailableRes,finalRes,latestFinalRes]=await Promise.all([
        client.from(ENTRY_TABLE).select('*').eq('round_date',date).eq('event_type',event),
        client.from(AVAILABLE_TABLE).select('*').eq('round_date',date).eq('event_type',event),
        client.from(CURRENT_TABLE).select('*'),
        client.from(CURRENT_AVAILABLE_TABLE).select('*'),
        client.from(FINAL_TABLE).select('*').eq('round_date',date).eq('event_type',event).maybeSingle(),
        client.from('hbnf_tag_authority_state').select('revision,latest_finalized_round,latest_finalized_event_type,latest_finalization_order').eq('id',1).maybeSingle()
      ]);
      if(entriesRes.error)throw entriesRes.error;if(availableRes.error)throw availableRes.error;if(currentRes.error)throw currentRes.error;if(currentAvailableRes.error)throw currentAvailableRes.error;
      state.cloudEntryKeys=new Set((entriesRes.data||[]).map(r=>keyFor(r.player_key||r.player_name)).filter(Boolean));
      state.cloudAvailableTags=new Set((availableRes.data||[]).map(r=>Number(r.tag_number)||0).filter(Boolean));
      state.entries.clear();(entriesRes.data||[]).forEach(r=>{r=normalizeEntry(r);state.entries.set(r.player_key,r)});
      state.available.clear();(availableRes.data||[]).forEach(r=>{r=normalizeAvailable(r);state.available.set(r.tag_number,r)});
      if(finalRes&&finalRes.error)throw finalRes.error;
      state.finalized=finalRes&&finalRes.data||null;
      if(latestFinalRes.error)throw latestFinalRes.error;
      const responseAuthorityRevision=Number(latestFinalRes&&latestFinalRes.data&&latestFinalRes.data.revision)||0;
      if(!state.currentLoaded||responseAuthorityRevision>=state.authorityRevision){applyCurrentSnapshot(currentRes.data||[],currentAvailableRes.data||[]);state.authorityRevision=responseAuthorityRevision}
      state.latestFinalizedDate=latestFinalRes&&latestFinalRes.data&&latestFinalRes.data.latest_finalized_round||'';state.latestFinalizedEventType=latestFinalRes&&latestFinalRes.data&&latestFinalRes.data.latest_finalized_event_type||'';state.latestFinalizationOrder=Number(latestFinalRes&&latestFinalRes.data&&latestFinalRes.data.latest_finalization_order)||0;
      // Skins' cloud baseline is required before the operator may initialize
      // missing rows. Page startup itself never writes Round Tags records.
      const skinsContext=ctxSafe();
      if(skinsContext&&skinsContext.syncBaselinePromise)await skinsContext.syncBaselinePromise;
      const canSeedRoundFromSkins=canSeedRoundFromSkinsContext(skinsContext);
      const refresh=await client.from(ENTRY_TABLE).select('*').eq('round_date',date).eq('event_type',event);
      if(refresh.error)throw refresh.error;
      state.cloudEntryKeys=new Set((refresh.data||[]).map(r=>keyFor(r.player_key||r.player_name)).filter(Boolean));
      state.entries.clear();(refresh.data||[]).forEach(r=>{r=normalizeEntry(r);state.entries.set(r.player_key,r)});hideAmbiguousDraftTags();
      state.cloudSnapshotReady=canSeedRoundFromSkins;
      pendingForRound('entry',date).forEach(r=>{r=normalizeEntry(r);state.entries.set(r.player_key,r);state.sync.set('entry:'+r.player_key,'error')});
      pendingForRound('available',date).forEach(r=>{r=normalizeAvailable(r);state.available.set(r.tag_number,r);state.sync.set('available:'+r.tag_number,'error')});
      state.activeTab=defaultTabForRound();
      state.loaded=true;writeCache();subscribeRealtime();
      document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date}}));
      notifyOfficialCurrentChanged();
    }catch(err){console.error('Round Tags load failed',err);showToast('Could not refresh tags. Cached entries remain available.','error')}
    finally{state.loading=false;scheduleRender(true)}
  }

  function subscribeRealtime(){
    const client=getClient();if(!client||!state.roundDate)return;
    if(state.realtime){try{client.removeChannel(state.realtime)}catch(_e){}state.realtime=null}
    const date=state.roundDate,event=state.eventType;
    state.realtime=client.channel('hbnf-round-tags-'+event+'-'+date+'-'+Math.random().toString(36).slice(2))
      .on('postgres_changes',{event:'*',schema:'public',table:ENTRY_TABLE,filter:'round_date=eq.'+date},payload=>{
        if(state.roundDate!==date)return;
        const old=payload.old||{},fresh=payload.new||{},key=keyFor(fresh.player_key||old.player_key);if((fresh.event_type||old.event_type||'skins')!==event||!key)return;
        const pending=pendingForRound('entry',date).find(r=>keyFor(r.player_key)===key);if(pending)return;
        if(payload.eventType==='DELETE'){state.entries.delete(key);state.cloudEntryKeys.delete(key)}else{state.entries.set(key,normalizeEntry(fresh));state.cloudEntryKeys.add(key)}
        writeCache();patchEntry(key,true);patchChrome();document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date}}));
      })
      .on('postgres_changes',{event:'*',schema:'public',table:AVAILABLE_TABLE,filter:'round_date=eq.'+date},payload=>{
        if(state.roundDate!==date)return;
        const old=payload.old||{},fresh=payload.new||{},tag=Number(fresh.tag_number||old.tag_number)||0;if((fresh.event_type||old.event_type||'skins')!==event||!tag)return;
        const pending=pendingForRound('available',date).find(r=>Number(r.tag_number)===tag);if(pending)return;
        if(payload.eventType==='DELETE'){state.available.delete(tag);state.cloudAvailableTags.delete(tag)}else{state.available.set(tag,normalizeAvailable(fresh));state.cloudAvailableTags.add(tag)}
        writeCache();patchAvailable(tag,true);patchChrome(true);document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date}}));
      })
      .on('postgres_changes',{event:'*',schema:'public',table:CURRENT_TABLE},payload=>{
        const old=payload.old||{},fresh=payload.new||{},key=keyFor(fresh.player_key||fresh.player_name||old.player_key||old.player_name);if(!key)return;
        if(payload.eventType==='DELETE')state.current.delete(key);else state.current.set(key,normalizeCurrent(fresh));
        if(isOpen()&&state.activeTab==='holders'){
          const body=q('[data-rt-body]'),existing=body&&q('[data-rt-holder-row="'+CSS.escape(key)+'"]',body),row=allTagHolderRows().find(item=>item.player_key===key);
          if(existing&&row)existing.outerHTML=holderRowHtml(row);else if(body){const scrollTop=body.scrollTop;body.innerHTML=holdersTabHtml();body.scrollTop=scrollTop}
        }
        document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date}}));
        notifyOfficialCurrentChanged();
      }).subscribe();
  }

  function markEntry(row,immediate,structural){
    row=normalizeEntry(row);row.client_edit_id=uuid();row.updated_at=nowIso();
    const oldRow=state.entries.get(row.player_key),wasUnresolved=isUnresolved(oldRow),willUnresolved=isUnresolved(row);
    state.entries.set(row.player_key,row);state.finalizedDirty=true;
    const fixture=testTagFixture();if(fixture){try{fixture.saveEntry(row);state.sync.set('entry:'+row.player_key,'saved');patchEntry(row.player_key,!!structural||wasUnresolved!==willUnresolved);patchChrome(!!structural||wasUnresolved!==willUnresolved);fixture.setStatus&&fixture.setStatus('Test edit saved on this device only.');document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date:state.roundDate,testFixture:true}}));return}catch(err){console.error('Test tag fixture save failed',err);state.sync.set('entry:'+row.player_key,'error');fixture.setStatus&&fixture.setStatus('Test-only save failed; this edit was not stored.');patchEntry(row.player_key,false);patchChrome(false);return}}
    state.sync.set('entry:'+row.player_key,'saving');setPending('entry',row.player_key,row);writeCache();
    const old=state.timers.get(row.player_key);if(old)clearTimeout(old);
    state.timers.set(row.player_key,setTimeout(()=>saveEntry(row.player_key,row.client_edit_id),immediate?0:450));
    patchEntry(row.player_key,!!structural||wasUnresolved!==willUnresolved);patchChrome(!!structural||wasUnresolved!==willUnresolved);
    document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date:state.roundDate}}));
  }

  async function saveEntry(key,clientEditId){
    const row=state.entries.get(key),client=getClient();if(!row||row.client_edit_id!==clientEditId||!client)return;
    const date=text(row.round_date||state.roundDate),event=text(row.event_type||state.eventType);
    state.sync.set('entry:'+key,'saving');patchEntry(key,false);patchChrome(false);
    const payload={round_date:date,event_type:event,player_key:row.player_key,player_name:row.player_name,tag_number:row.tag_number,status:row.status,client_edit_id:row.client_edit_id};
    try{
      const expectedRevision=Number(row.revision)||0;
      let data=null;
      if(expectedRevision>0){
        const result=await client.from(ENTRY_TABLE).update(payload).eq('round_date',date).eq('event_type',event).eq('player_key',row.player_key).eq('revision',expectedRevision).select().maybeSingle();
        if(result.error)throw result.error;
        data=result.data||null;
        if(!data){
          const fresh=await client.from(ENTRY_TABLE).select('*').eq('round_date',date).eq('event_type',event).eq('player_key',row.player_key).maybeSingle();
          if(fresh.error)throw fresh.error;
          if(fresh.data){
            if(state.roundDate!==date||state.eventType!==event){clearPending('entry',key,clientEditId,date,event);return}
            const current=state.entries.get(key);
            if(current&&current.client_edit_id===clientEditId){state.entries.set(key,normalizeEntry(fresh.data));state.sync.set('entry:'+key,'saved');clearPending('entry',key,clientEditId,date,event);writeCache();patchEntry(key,true);patchChrome(true);showToast('A newer saved tag for '+row.player_name+' was kept. Review the row.','error')}
            return;
          }
        }
      }
      if(!data){
        const inserted=await client.from(ENTRY_TABLE).insert(payload).select().single();
        if(inserted.error)throw inserted.error;
        data=inserted.data;
      }
      if(state.roundDate!==date||state.eventType!==event){clearPending('entry',key,clientEditId,date,event);return}
      state.cloudEntryKeys.add(key);
      const current=state.entries.get(key);
      if(current&&current.client_edit_id===clientEditId){state.entries.set(key,normalizeEntry(data));state.sync.set('entry:'+key,'saved');clearPending('entry',key,clientEditId,date,event);writeCache();patchEntry(key,false);patchChrome(false)}
    }catch(err){
      if(err&&String(err.code||'')==='23505'){
        try{
          const fresh=await client.from(ENTRY_TABLE).select('*').eq('round_date',date).eq('event_type',event).eq('player_key',row.player_key).maybeSingle();
          if(fresh.error)throw fresh.error;
          if(state.roundDate!==date||state.eventType!==event){clearPending('entry',key,clientEditId,date,event);return}
          const current=state.entries.get(key);
          if(fresh.data&&current&&current.client_edit_id===clientEditId){state.entries.set(key,normalizeEntry(fresh.data));state.sync.set('entry:'+key,'saved');clearPending('entry',key,clientEditId,date,event);writeCache();patchEntry(key,true);patchChrome(true);showToast('A newer saved tag for '+row.player_name+' was kept. Review the row.','error');return}
        }catch(fetchErr){console.error('Round Tags conflict refresh failed',fetchErr)}
      }
      if(state.roundDate!==date||state.eventType!==event){console.error('Round Tags row save failed after event changed',err);return}
      console.error('Round Tags row save failed',err);state.sync.set('entry:'+key,'error');patchEntry(key,false);patchChrome(false);
    }
  }

  function markAvailable(row,immediate){
    row=normalizeAvailable(row);if(!row.tag_number)return;row.client_edit_id=uuid();row.updated_at=nowIso();
    state.available.set(row.tag_number,row);state.finalizedDirty=true;state.sync.set('available:'+row.tag_number,'saving');setPending('available',String(row.tag_number),row);writeCache();
    const old=state.availableTimers.get(row.tag_number);if(old)clearTimeout(old);
    state.availableTimers.set(row.tag_number,setTimeout(()=>saveAvailable(row.tag_number,row.client_edit_id),immediate?0:450));
    patchAvailable(row.tag_number,false);patchChrome(false);document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date:state.roundDate}}));
  }

  async function saveAvailable(tag,clientEditId){
    const row=state.available.get(tag),client=getClient();if(!row||row.client_edit_id!==clientEditId||!client)return;
    const date=text(row.round_date||state.roundDate),event=text(row.event_type||state.eventType);
    try{
      const payload={round_date:date,event_type:event,tag_number:row.tag_number,source:row.source,notes:row.notes,client_edit_id:row.client_edit_id};
      const expectedRevision=Number(row.revision)||0;
      let data=null;
      if(expectedRevision>0){
        const result=await client.from(AVAILABLE_TABLE).update(payload).eq('round_date',date).eq('event_type',event).eq('tag_number',row.tag_number).eq('revision',expectedRevision).select().maybeSingle();
        if(result.error)throw result.error;
        data=result.data||null;
        if(!data){
          const fresh=await client.from(AVAILABLE_TABLE).select('*').eq('round_date',date).eq('event_type',event).eq('tag_number',row.tag_number).maybeSingle();
          if(fresh.error)throw fresh.error;
          if(fresh.data){
            if(state.roundDate!==date||state.eventType!==event){clearPending('available',String(tag),clientEditId,date,event);return}
            const current=state.available.get(tag);
            if(current&&current.client_edit_id===clientEditId){state.available.set(tag,normalizeAvailable(fresh.data));state.sync.set('available:'+tag,'saved');clearPending('available',String(tag),clientEditId,date,event);writeCache();patchAvailable(tag,true);patchChrome(true);showToast('A newer saved note for #'+tag+' was kept. Review it.','error')}
            return;
          }
        }
      }
      if(!data){
        const inserted=await client.from(AVAILABLE_TABLE).insert(payload).select().single();
        if(inserted.error)throw inserted.error;
        data=inserted.data;
      }
      if(state.roundDate!==date||state.eventType!==event){clearPending('available',String(tag),clientEditId,date,event);return}
      state.cloudAvailableTags.add(Number(tag));
      const current=state.available.get(tag);if(current&&current.client_edit_id===clientEditId){state.available.set(tag,normalizeAvailable(data));state.sync.set('available:'+tag,'saved');clearPending('available',String(tag),clientEditId,date,event);writeCache();patchAvailable(tag,false);patchChrome(false)}
    }catch(err){
      if(err&&String(err.code||'')==='23505'){
        try{
          const fresh=await client.from(AVAILABLE_TABLE).select('*').eq('round_date',date).eq('event_type',event).eq('tag_number',row.tag_number).maybeSingle();
          if(fresh.error)throw fresh.error;
          if(state.roundDate!==date||state.eventType!==event){clearPending('available',String(tag),clientEditId,date,event);return}
          const current=state.available.get(tag);
          if(fresh.data&&current&&current.client_edit_id===clientEditId){state.available.set(tag,normalizeAvailable(fresh.data));state.sync.set('available:'+tag,'saved');clearPending('available',String(tag),clientEditId,date,event);writeCache();patchAvailable(tag,true);patchChrome(true);showToast('A newer saved note for #'+tag+' was kept. Review it.','error');return}
        }catch(fetchErr){console.error('Round Tags available conflict refresh failed',fetchErr)}
      }
      if(state.roundDate!==date||state.eventType!==event){console.error('Round Tags available-tag save failed after event changed',err);return}
      console.error('Round Tags available-tag save failed',err);state.sync.set('available:'+tag,'error');patchAvailable(tag,false);patchChrome(false)
    }
  }

  async function saveCurrentTag(key){
    key=keyFor(key);const row=allTagHolderRows().find(item=>item.player_key===key),client=getClient(),modal=q('#'+MODAL_ID);
    if(!row||row.in_round){showToast('Use the round-player editor for someone playing today.','');return}
    const input=modal&&q('[data-rt-current-tag="'+CSS.escape(key)+'"]',modal),tag=Number(clean(input&&input.value))||0;
    if(!(tag>0)){showToast('Enter a valid tag number.','error');if(input)input.focus();return}
    if(!client){showToast('Connect before saving a current tag.','error');return}
    const syncKey='current:'+key;state.sync.set(syncKey,'saving');renderShell();
    try{
      const {data,error}=await client.rpc('hbnf_set_current_tag_holder',{p_player_name:row.player_name,p_tag_number:tag,p_expected_updated_at:row.updated_at||null});
      if(error)throw error;
      const result=data||{};
      if(result.status==='conflict'){
        if(result.row){const fresh=normalizeCurrent(result.row);state.current.set(fresh.player_key,fresh);notifyOfficialCurrentChanged()}
        state.sync.set(syncKey,'error');renderShell();showToast('A newer saved tag for '+row.player_name+' was kept. Review the row.','error');return;
      }
      if(result.status!=='saved'||!result.row)throw new Error('Unexpected current-tag save response');
      const saved=normalizeCurrent(result.row);state.current.set(saved.player_key,saved);state.authorityRevision=Number(result.current_revision)||state.authorityRevision;applyBagTagsFromServer(result.bag_tags);state.sync.set(syncKey,'saved');renderShell();notifyOfficialCurrentChanged();
      (result.displaced_player_keys||[]).forEach(displaced=>{const displacedKey=keyFor(displaced);state.current.delete(displacedKey);const entry=state.entries.get(displacedKey);if(entry&&Number(entry.tag_number)===tag)state.entries.set(displacedKey,normalizeEntry(Object.assign({},entry,{tag_number:null,status:'unknown'})))});
      document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date:state.roundDate}}));showToast(saved.player_name+' is now #'+saved.tag_number+'.','success');
    }catch(err){console.error('Round Tags current-tag save failed',err);state.sync.set(syncKey,'error');renderShell();showToast('Could not save '+row.player_name+'’s current tag.','error')}
  }

  async function removeAvailable(tag){
    tag=Number(tag)||0;if(!tag)return;
    const row=state.available.get(tag),client=getClient();if(!row)return;
    if(!client){showToast('Connect before removing an available tag.','error');return}
    const date=text(row.round_date||state.roundDate),event=text(row.event_type||state.eventType),expectedRevision=Number(row.revision)||0;
    state.sync.set('available:'+tag,'saving');patchAvailable(tag,false);patchChrome(false);
    try{
      let request=client.from(AVAILABLE_TABLE).delete().eq('round_date',date).eq('event_type',event).eq('tag_number',tag);
      if(expectedRevision>0)request=request.eq('revision',expectedRevision);
      const result=await request.select().maybeSingle();
      if(result.error)throw result.error;
      if(!result.data&&expectedRevision>0){
        const fresh=await client.from(AVAILABLE_TABLE).select('*').eq('round_date',date).eq('event_type',event).eq('tag_number',tag).maybeSingle();
        if(fresh.error)throw fresh.error;
        if(fresh.data){
          if(state.roundDate===date&&state.eventType===event){state.available.set(tag,normalizeAvailable(fresh.data));state.sync.set('available:'+tag,'saved');writeCache();patchAvailable(tag,true);patchChrome(true);showToast('A newer saved version of #'+tag+' was kept. Review it.','error')}
          return;
        }
      }
      if(state.roundDate!==date||state.eventType!==event)return;
      state.available.delete(tag);state.finalizedDirty=true;state.sync.delete('available:'+tag);writeCache();patchAvailable(tag,true);patchChrome(true);document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date}}));
    }catch(error){
      console.error('Round Tags available-tag delete failed',error);
      if(state.roundDate===date&&state.eventType===event){state.sync.set('available:'+tag,'saved');patchAvailable(tag,false);patchChrome(false);showToast('Could not remove #'+tag+'. It was kept.','error')}
    }
  }

  function collectRound(round,type,startHole,lastHole){
    const records=new Map();
    function get(name){const key=keyFor(name);if(!key)return null;if(!records.has(key))records.set(key,{name:clean(name),score:0});return records.get(key)}
    if(!round||!Array.isArray(round.cards))return[];
    round.cards.forEach(card=>{
      let rows=[];try{rows=type==='front'?(typeof frontRows==='function'?frontRows(card):[]):(typeof backRows==='function'?backRows(card):[])}catch(_e){}
      rows.forEach(row=>(type==='front'?[row.name]:(row.players&&row.players.length?row.players:[row.name])).forEach(get));
      let carry=1;
      for(let hole=startHole;hole<=lastHole;hole++){
        const winnerId=card&&card.winners&&card.winners[String(hole)],winner=rows.find(r=>r.id===winnerId);
        if(winner){(type==='front'?[winner.name]:(winner.players&&winner.players.length?winner.players:[winner.name])).forEach(name=>{const rec=get(name);if(rec)rec.score+=carry});carry=1}else carry++;
      }
      const end=startHole+8;
      if(lastHole>=end){const tieId=card&&card.winners&&card.winners.tb,tie=rows.find(r=>r.id===tieId);if(tie&&carry>1)(type==='front'?[tie.name]:(tie.players&&tie.players.length?tie.players:[tie.name])).forEach(name=>{const rec=get(name);if(rec)rec.score+=(carry-1)})}
    });
    return Array.from(records.values());
  }

  function redistribute(current,available,rows){
    const out=Object.assign({},current||{}),tagFor=name=>{const k=keyFor(name),entry=Object.entries(out).find(([n])=>keyFor(n)===k);return entry?Number(entry[1])||0:0};
    const eligible=(rows||[]).filter(r=>tagFor(r.name)>0&&!isExchangeExcluded(r.name));
    const pool=eligible.map(r=>tagFor(r.name)).concat((available||[]).map(Number).filter(n=>n>0)).sort((a,b)=>a-b);
    eligible.sort((a,b)=>(Number(b.score||0)-Number(a.score||0))||(tagFor(a.name)-tagFor(b.name))||clean(a.name).localeCompare(clean(b.name)));
    eligible.forEach((r,i)=>{if(pool[i]){const existing=Object.keys(out).find(n=>keyFor(n)===keyFor(r.name));if(existing&&existing!==r.name)delete out[existing];out[r.name]=pool[i]}});
    return{map:out,available:pool.slice(eligible.length),rows:eligible};
  }

  function projectThrough(week,through){
    through=Math.max(0,Math.min(18,Number(through)||0));
    const initial=entryMap(),initialAvailable=availableNumbers();
    if(ctxSafe()&&ctxSafe().branch==='glow'&&window.HBNFGlowRoundTagAdapter&&typeof window.HBNFGlowRoundTagAdapter.project==='function'){
      return window.HBNFGlowRoundTagAdapter.project(initial,initialAvailable,week||getWeekSafe());
    }
    if(!week)return{initial,checkpointIncoming:initial,projected:initial,available:initialAvailable,rows:[]};
    if(through<=9){const rows=collectRound(week.front,'front',1,through),result=redistribute(initial,initialAvailable,rows);return{initial,checkpointIncoming:initial,projected:result.map,available:result.available,rows}}
    const frontRowsResult=collectRound(week.front,'front',1,9),afterFront=redistribute(initial,initialAvailable,frontRowsResult);
    const backRowsResult=collectRound(week.back,'back',10,through),afterBack=redistribute(afterFront.map,afterFront.available,backRowsResult);
    return{initial,checkpointIncoming:afterFront.map,projected:afterBack.map,available:afterBack.available,rows:backRowsResult,frontProjected:afterFront.map};
  }

  function finalPreview(){return projectThrough(getWeekSafe(),18)}

  function finalizationIsCurrent(){
    if(!state.finalized||state.finalizedDirty||state.finalized.handoff_pending)return false;
    const finalizedAt=Date.parse(state.finalized.finalized_at||'');
    if(!Number.isFinite(finalizedAt))return true;
    let latest=0;
    state.entries.forEach(row=>{const t=Date.parse(row&&row.updated_at||'');if(Number.isFinite(t))latest=Math.max(latest,t)});
    state.available.forEach(row=>{const t=Date.parse(row&&row.updated_at||'');if(Number.isFinite(t))latest=Math.max(latest,t)});
    return latest<=finalizedAt;
  }

  function defaultTabForRound(){return state.finalized?'final':'confirm'}
  function finalizedStartMode(){return !!state.finalized}

  async function waitForPendingSaves(timeoutMs){
    timeoutMs=Math.max(1000,Number(timeoutMs)||6000);
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      const sync=overallSync();
      if(sync.kind!=='saving')return sync.kind==='saved';
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return overallSync().kind==='saved';
  }

  async function finalizeRound(options){
    options=options||{};
    if(state.finalizing)return{ok:false,reason:'busy'};
    if(!state.online){showToast('Connect to the internet before finalizing tags.','error');return{ok:false,reason:'offline'}}
    if(state.finalized&&finalizationIsCurrent())return{ok:true,alreadyFinalized:true,finalized:state.finalized};
    if(!(await waitForPendingSaves(6000))){showToast('Tag changes are still waiting to sync. Retry finalization after they save.','error');return{ok:false,reason:'sync'}}
    const warnings=rowWarnings(),unresolved=unresolvedRows().length;
    if((warnings.length||unresolved)&&!options.skipArm&&Date.now()>state.finalizeArmedUntil){state.finalizeArmedUntil=Date.now()+7000;patchChrome(true);refreshFinal();return{ok:false,reason:'review',warnings:warnings.length,unresolved}}
    state.finalizing=true;patchChrome(true);refreshFinal();
    const projection=finalPreview(),finalMap=projection.projected||{},assignments=[];
    participants().forEach(p=>{
      const row=state.entries.get(p.key)||{},pair=Object.entries(finalMap).find(([name])=>keyFor(name)===p.key);
      assignments.push({player_key:p.key,player_name:p.name,tag_number:pair?Number(pair[1]):null,status:row.status||'unknown',exchange_excluded:isExchangeExcluded(p.key)});
    });
    const available=(projection.available||[]).map(tag=>{const row=state.available.get(Number(tag));return{tag_number:Number(tag),source:row&&row.source||('Unassigned after '+state.roundDate),notes:row&&row.notes||''}});
    try{
      const client=getClient();if(!client)throw new Error('Supabase client unavailable');
      const {data,error}=await client.rpc('hbnf_finalize_round_tags_v3',{p_round_date:state.roundDate,p_event_type:state.eventType,p_assignments:assignments,p_available_tags:available,p_client_edit_id:uuid(),p_expected_round_revision:Number(state.finalized&&state.finalized.revision)||0,p_expected_authority_revision:state.authorityRevision});
      if(error)throw error;
      if(!data||data.status!=='saved'){
        if(data&&data.status==='conflict'){state.finalizedDirty=true;showToast('Tag ownership changed elsewhere. Reload Round Tags and review before continuing.','error');return{ok:false,reason:'conflict',data}}
        throw new Error('Unexpected authoritative tag finalization response');
      }
      state.finalized={round_date:state.roundDate,event_type:state.eventType,assignments:data.assignments||assignments,available_tags:data.available_tags||available,pending_assignments:data.pending_assignments||null,pending_available_tags:data.pending_available_tags||null,handoff_pending:!!data.handoff_pending,finalized_at:data.finalized_at||nowIso(),revision:Number(data.revision)||1};
      state.authorityRevision=Number(data.current_revision)||state.authorityRevision;state.latestFinalizedDate=data.latest_finalized_round||state.latestFinalizedDate;state.latestFinalizedEventType=data.latest_finalized_event_type||state.latestFinalizedEventType;state.latestFinalizationOrder=Number(data.latest_finalization_order)||state.latestFinalizationOrder;state.finalizedDirty=false;state.finalizeArmedUntil=0;
      applyCurrentSnapshot(data.current_entries,data.current_available_tags);
      if(state.finalized.handoff_pending)showToast('Correction saved. Complete the physical exchange, then confirm it here.','success');
      else showToast(data.applied_current===false?'Round saved. Later official holders were preserved.':'Final tags saved.','success');
      notifyOfficialCurrentChanged();
      return{ok:true,finalized:state.finalized,data};
    }catch(err){console.error('Round Tags finalization failed',err);state.finalizeArmedUntil=Date.now()+7000;if(err&&String(err.code||'')==='40001'){state.finalizedDirty=true;showToast('Official tags or event order changed elsewhere. Reload Round Tags, review the saved state, and try again.','error');return{ok:false,reason:'conflict',error:err}}showToast('Finalization failed. Tap again to retry.','error');return{ok:false,reason:'error',error:err}}
    finally{state.finalizing=false;patchChrome(true);refreshFinal()}
  }

  async function confirmPhysicalHandoff(){
    if(!state.finalized||!state.finalized.handoff_pending)return{ok:false,reason:'no-pending-handoff'};
    const client=getClient();if(!client){showToast('Connect before confirming the physical exchange.','error');return{ok:false,reason:'offline'}}
    try{
      const {data,error}=await client.rpc('hbnf_confirm_round_tag_handoff_v1',{p_round_date:state.roundDate,p_event_type:state.eventType,p_client_edit_id:uuid(),p_expected_round_revision:Number(state.finalized.revision)||0,p_expected_authority_revision:state.authorityRevision});
      if(error)throw error;
      if(!data||data.status!=='saved'){state.finalizedDirty=true;showToast('The handoff changed elsewhere. Reload and verify official tags.','error');return{ok:false,reason:'conflict',data}}
      state.finalized={round_date:state.roundDate,event_type:state.eventType,assignments:data.assignments||state.finalized.pending_assignments||state.finalized.assignments,available_tags:data.available_tags||state.finalized.pending_available_tags||state.finalized.available_tags,handoff_pending:false,finalized_at:data.finalized_at||nowIso(),revision:Number(data.revision)||state.finalized.revision};
      state.authorityRevision=Number(data.current_revision)||state.authorityRevision;
      applyCurrentSnapshot(data.current_entries,data.current_available_tags);
      notifyOfficialCurrentChanged();
      showToast(data.applied_current===false?'Historical correction recorded. Later official holders were preserved.':'Physical exchange confirmed; official holders updated.','success');
      return{ok:true,data};
    }catch(err){console.error('Round Tags handoff confirmation failed',err);showToast('Could not confirm the physical exchange. Official holders were preserved.','error');return{ok:false,reason:'error',error:err}}
    finally{refreshFinal();patchChrome(true)}
  }

  async function finalizeForWeek(date){
    const wanted=text(date||activeWeek());
    if(!wanted)return{ok:false,reason:'date'};
    if(!state.loaded||state.roundDate!==wanted)await loadRound(true);
    if(!state.loaded||state.roundDate!==wanted){openModal();showToast('Round Tags could not load for this week. Reload and try again.','error');return{ok:false,reason:'load'}}
    if(state.finalized&&finalizationIsCurrent())return{ok:true,alreadyFinalized:true,finalized:state.finalized};
    const counts=statusCounts(),warnings=rowWarnings(),unresolved=unresolvedRows().length;
    if(warnings.length||unresolved){
      const parts=[];
      if(unresolved)parts.push(unresolved+' unresolved player'+(unresolved===1?'':'s'));
      if(warnings.length)parts.push(warnings.length+' tag warning'+(warnings.length===1?'':'s'));
      const proceed=window.confirm('Round Tags has '+parts.join(' and ')+'. Finalize the week and tags anyway?');
      if(!proceed){openModal();state.activeTab=unresolved?'confirm':'final';renderShell();showToast('Review Round Tags, then finalize the week again.','error');return{ok:false,reason:'review'}}
    }
    return finalizeRound({skipArm:true});
  }

  function statusLabel(row){
    if(!row)return'Unknown*';
    const n=Number(row.tag_number)||0;
    if(isExchangeExcluded(row.player_key))return n?('#'+n+' · keep'):'Out of exchange';
    if(row.status==='untagged')return'Untagged';
    if(noTagOnFile(row))return'No tag';
    if(row.status==='unknown')return'Unknown*';
    return n?('#'+n+(row.status==='confirmed'?'':'*')):'Unknown*';
  }

  function syncIcon(key,interactive){
    const s=state.sync.get(key)||'saved';
    if(interactive===false)return'<span class="rt-row-sync '+s+'" aria-hidden="true" title="'+(s==='saving'?'Saving':s==='error'?'Not synced — open the row to retry':'Saved')+'">'+(s==='saving'?'●':s==='error'?'!':'✓')+'</span>';
    if(s==='saving')return'<button class="rt-row-sync saving" type="button" tabindex="-1" disabled title="Saving">●</button>';
    if(s==='error')return'<button class="rt-row-sync error" type="button" data-rt-retry="'+esc(key)+'" title="Not synced — tap to retry">!</button>';
    return'<button class="rt-row-sync saved" type="button" tabindex="-1" disabled title="Saved">✓</button>';
  }

  function updateSyncElement(el,key){
    if(!el)return;const s=state.sync.get(key)||'saved';
    el.className='rt-row-sync '+s;el.textContent=s==='saving'?'●':s==='error'?'!':'✓';el.title=s==='saving'?'Saving':s==='error'?'Not synced — tap to retry':'Saved';
    if(s==='error'){el.disabled=false;el.removeAttribute('tabindex');el.setAttribute('data-rt-retry',key)}else{el.disabled=true;el.setAttribute('tabindex','-1');el.removeAttribute('data-rt-retry')}
  }

  function editorRowHtml(row){
    const unresolved=isUnresolved(row),tag=row.tag_number||'',excluded=isExchangeExcluded(row.player_key),canExchange=Number(tag||currentOfficialTag(row.player_key)||0)>0;
    return`<article class="rt-editor-row ${unresolved?'is-unresolved':'is-resolved'} ${excluded?'is-excluded':''}" data-rt-row="${esc(row.player_key)}">
      <div class="rt-row-identity"><span class="rt-row-name">${esc(row.player_name)}${unresolved?' <b class="rt-star">*</b>':''}</span><span class="rt-row-status">${esc(statusLabel(row))}</span></div>
      <div class="rt-row-input-wrap"><span>#</span><input class="rt-tag-input" data-rt-tag="${esc(row.player_key)}" inputmode="numeric" type="number" min="1" step="1" value="${tag}" placeholder="—" aria-label="Tag number for ${esc(row.player_name)}"></div>
      <button class="rt-primary-action" type="button" data-rt-confirm="${esc(row.player_key)}" ${tag?'':'disabled'}>${row.status==='confirmed'?'Confirmed':'Confirm'}</button>
      <div class="rt-row-secondary">${canExchange?`<button class="rt-exchange-toggle ${excluded?'is-excluded':''}" type="button" data-rt-exchange-exclude="${esc(row.player_key)}">${excluded?'Re-include in exchange':'Keep current tag today'}</button>`:''}<button type="button" data-rt-unknown="${esc(row.player_key)}">Unknown</button><button type="button" data-rt-untagged="${esc(row.player_key)}">Untagged</button></div>
      ${syncIcon('entry:'+row.player_key)}
    </article>`;
  }

  function compactRowHtml(row){
    const unresolved=isUnresolved(row),tag=statusLabel(row);
    return`<button class="rt-compact-row ${unresolved?'is-unresolved':''}" type="button" data-rt-edit="${esc(row.player_key)}" data-rt-row="${esc(row.player_key)}"><span class="rt-compact-check">${isExchangeExcluded(row.player_key)?'↔':row.status==='confirmed'?'✓':(row.status==='untagged'||noTagOnFile(row))?'—':'*'}</span><span class="rt-compact-name">${esc(row.player_name)}</span><strong class="rt-compact-tag">${esc(tag)}</strong>${syncIcon('entry:'+row.player_key,false)}<span class="rt-chevron">›</span></button>`;
  }

  function historicalStartRowHtml(row){
    const tag=statusLabel(row);
    return`<div class="rt-compact-row rt-history-row" data-rt-row="${esc(row.player_key)}"><span class="rt-compact-check">${isExchangeExcluded(row.player_key)?'↔':row.status==='confirmed'?'✓':(row.status==='untagged'||noTagOnFile(row))?'—':'*'}</span><span class="rt-compact-name">${esc(row.player_name)}</span><strong class="rt-compact-tag">${esc(tag)}</strong>${syncIcon('entry:'+row.player_key,false)}<span class="rt-history-label">START</span></div>`;
  }

  function availableRowHtml(row){
    return`<article class="rt-available-row" data-rt-available-row="${row.tag_number}"><strong>#${row.tag_number}</strong><input type="text" data-rt-available-source="${row.tag_number}" value="${esc(row.source)}" placeholder="Why is it available?"><button type="button" data-rt-remove-available="${row.tag_number}">Remove</button>${syncIcon('available:'+row.tag_number)}</article>`;
  }

  function allRows(){return participants().map(p=>state.entries.get(p.key)).filter(Boolean)}
  function unresolvedRows(){return allRows().filter(isUnresolved)}

  function confirmTabHtml(){
    const needs=unresolvedRows();
    const rows=allRows();
    if(finalizedStartMode())return`<div class="rt-view-head"><div><h3>Starting tags — historical</h3><p>This is the start-of-round snapshot used to calculate the handoff. It is intentionally preserved and is not the current tag list.</p></div><button type="button" class="rt-text-button" data-rt-tab="final">View final tags</button></div>
      <div class="rt-confirm-shortcuts"><span>The official result for this round is in <strong>Final</strong>. Use All players only if the starting snapshot itself needs correction.</span></div>
      <div data-rt-confirm-list>${rows.length?rows.map(historicalStartRowHtml).join(''):'<div class="rt-empty-state"><strong>No starting tags recorded.</strong></div>'}</div>`;
    const missing=missingRoundRecords(),initialize=canInitializeRoundRecords()&&(missing.participants.length||missing.available.length)?'<button type="button" data-rt-initialize-round aria-label="Initialize missing Round Tags participant and available-tag rows">Initialize missing rows</button>':'';
    return`<div class="rt-view-head"><div><h3>Tag exceptions</h3><p>Current master tags are the default. Only touch a row if its number is wrong or that player is not exchanging a physical tag today.</p></div>${needs.length?'<button type="button" class="rt-text-button" data-rt-next-unresolved>Next unresolved ↓</button>':''}</div>
      <div class="rt-confirm-shortcuts"><button type="button" data-rt-confirm-unchanged>Use current tags</button>${initialize}<span>Resolves all unchanged master tags at once. Players with no tag on file are automatically outside the exchange.</span></div>
      <div data-rt-confirm-list>${rows.length?rows.map(editorRowHtml).join(''):'<div class="rt-empty-state"><strong>No players entered.</strong><span>Add the round participants in Setup first.</span></div>'}</div>`;
  }

  function allTabHtml(){
    const rows=allRows();
    return`<div class="rt-view-head"><div><h3>All players</h3><p>Tap any row to edit it. Confirmed rows stay compact.</p></div></div><div data-rt-all-list>${rows.length?rows.map(row=>state.expandedKey===row.player_key?editorRowHtml(row):compactRowHtml(row)).join(''):'<div class="rt-empty-state">No players are entered for this round.</div>'}</div>`;
  }

  function holderRowHtml(row){
    const tag=Number(row.tag_number)||'',duplicates=currentDuplicateNames(row.player_key,tag),syncKey='current:'+row.player_key,sync=state.sync.get(syncKey)||'saved';
    const shown=duplicates.length?'?':(tag?'#'+tag:'—');
    if(row.in_round)return`<article class="rt-holder-row is-round" data-rt-holder-row="${esc(row.player_key)}"><div class="rt-holder-identity"><strong>${esc(row.player_name)}</strong><span>In this round</span></div><div class="rt-holder-number">${shown}</div><button type="button" data-rt-edit-round-holder="${esc(row.player_key)}">Edit round</button></article>`;
    return`<article class="rt-holder-row" data-rt-holder-row="${esc(row.player_key)}"><div class="rt-holder-identity"><strong>${esc(row.player_name)}</strong><span>${duplicates.length?'Unverified — enter the physically checked tag':'Not playing this round'}</span></div><label class="rt-holder-input"><span>#</span><input type="number" inputmode="numeric" min="1" step="1" value="${duplicates.length?'':tag}" data-rt-current-tag="${esc(row.player_key)}" aria-label="Current tag number for ${esc(row.player_name)}"></label><button type="button" data-rt-save-current="${esc(row.player_key)}" ${sync==='saving'?'disabled':''}>${sync==='saving'?'Saving…':sync==='error'?'Retry':'Save'}</button><div class="rt-holder-duplicate ${duplicates.length?'show':''}" data-rt-current-duplicate="${esc(row.player_key)}">${duplicates.length?'Current tag: ? — physically verify before saving.':''}</div></article>`;
  }

  function holdersTabHtml(){
    const rows=allTagHolderRows();
    return`<div class="rt-view-head"><div><h3>All tags</h3><p>Update current tags for players who are not in this round. Players in the selected round stay in the round editor so the historical start-of-round baseline is preserved.</p></div></div><div data-rt-holder-list>${rows.length?rows.map(holderRowHtml).join(''):'<div class="rt-empty-state">No current tag holders are recorded.</div>'}</div>`;
  }

  function availableTabHtml(){
    const rows=Array.from(state.available.values()).sort((a,b)=>a.tag_number-b.tag_number);
    return`<div class="rt-view-head"><div><h3>Available tags</h3><p>Add only tags that are physically available to enter this round’s pool.</p></div></div>
      <div class="rt-add-available"><label><span>Tag</span><input type="number" inputmode="numeric" min="1" step="1" data-rt-new-available placeholder="#"></label><label><span>Reminder</span><input type="text" data-rt-new-source placeholder="Surrendered by Marc"></label><button type="button" data-rt-add-available>Add tag</button></div>
      <div data-rt-available-list>${rows.length?rows.map(availableRowHtml).join(''):'<div class="rt-empty-state"><strong>No available tags recorded.</strong><span>Player edits never change this list automatically.</span></div>'}</div>`;
  }

  function finalRows(){
    const official=finalizedMap();
    if(official)return Object.entries(official).sort((a,b)=>Number(a[1])-Number(b[1]));
    if(state.finalized&&state.finalized.handoff_pending){const staged=Array.isArray(state.finalized.pending_assignments)?state.finalized.pending_assignments:[];return staged.filter(row=>Number(row.tag_number)>0).map(row=>[row.player_name,Number(row.tag_number)]).sort((a,b)=>a[1]-b[1])}
    const source=finalPreview().projected||{};
    return Object.entries(source).filter(([name])=>participants().some(p=>p.key===keyFor(name))).sort((a,b)=>Number(a[1])-Number(b[1]));
  }

  function finalAvailableNumbers(){
    if(state.finalized&&state.finalized.handoff_pending&&Array.isArray(state.finalized.pending_available_tags))return state.finalized.pending_available_tags.map(row=>Number(row&&row.tag_number!=null?row.tag_number:row)||0).filter(Boolean).sort((a,b)=>a-b);
    if(finalizedMap()&&state.finalized&&Array.isArray(state.finalized.available_tags))return state.finalized.available_tags.map(row=>Number(row&&row.tag_number!=null?row.tag_number:row)||0).filter(Boolean).sort((a,b)=>a-b);
    return(finalPreview().available||[]).map(Number).filter(n=>n>0).sort((a,b)=>a-b);
  }

  function finalListHtml(rows,handoff){
    const start=entryMap(),official=finalizedMap(),pending=!!(state.finalized&&state.finalized.handoff_pending),savedAssignments=pending?state.finalized.pending_assignments:state.finalized&&state.finalized.assignments,savedExcluded=new Set((Array.isArray(savedAssignments)?savedAssignments:[]).filter(row=>row&&row.exchange_excluded).map(row=>keyFor(row.player_key||row.player_name)));
    return`<div class="rt-final-list ${handoff?'is-handoff':''}">${rows.map(([name,tag])=>{const key=keyFor(name),from=Object.entries(start).find(([n])=>keyFor(n)===key),startTag=from?Number(from[1])||0:0,excluded=official||pending?savedExcluded.has(key):isExchangeExcluded(key),transition=startTag&&startTag!==Number(tag)?('#'+startTag+' → #'+Number(tag)):(startTag?'Keep #'+startTag:'#'+Number(tag));return`<div class="rt-final-item ${excluded?'is-excluded':''}"><strong>#${Number(tag)}</strong><div class="rt-final-person"><span>${esc(name)}</span><small>${excluded?'No exchange today · keeps current tag':esc(transition)}</small></div>${!official&&!pending&&!handoff&&startTag?`<button type="button" class="rt-final-exchange-toggle ${excluded?'is-excluded':''}" data-rt-exchange-exclude="${esc(key)}">${excluded?'Re-include':'Keep current'}</button>`:''}</div>`}).join('')}</div>`;
  }

  function finalTabHtml(){
    const warnings=rowWarnings(),counts=statusCounts(),rows=finalRows(),available=finalAvailableNumbers(),armed=Date.now()<state.finalizeArmedUntil,unresolved=unresolvedRows().length,finalizedCurrent=finalizationIsCurrent(),finalizeLabel=state.closeoutMode?(state.finalized?'Re-finalize round + tags':'Finalize round + tags'):(state.finalized?'Re-finalize tags':'Finalize tags');
    const pendingNote=state.finalized&&state.finalized.handoff_pending;
    if(state.handoffMode){
      return`<div class="rt-handoff-head"><div><span>FINAL TAGS</span><strong>${fmtDate(state.roundDate)}</strong></div><button type="button" data-rt-exit-handoff>Exit</button></div>${pendingNote?'<p class="rt-pending-handoff">Correction saved. Complete the physical exchange before confirming.</p>':''}${rows.length?finalListHtml(rows,true):'<div class="rt-empty-state">No tagged players are available.</div>'}<div class="rt-handoff-actions"><button type="button" data-rt-share-final>Copy / Share</button>${pendingNote?'<button type="button" class="rt-finalize-button" data-rt-confirm-handoff>Confirm physical exchange</button>':finalizedCurrent?'<span class="rt-finalized-pill">✓ Finalized</span>':'<button type="button" class="rt-finalize-button" data-rt-finalize>'+(state.finalizing?'Finalizing…':armed?'Tap again to finalize anyway':finalizeLabel)+'</button>'}</div>`;
    }
    const reviewCount=warnings.length+unresolved;
    const warningDetails=[...(unresolved?[{text:unresolved+' player'+(unresolved===1?'':'s')+' still need confirmation.'}]:[]),...warnings];
    return`<div class="rt-view-head"><div><h3>${pendingNote?'Physical exchange awaiting confirmation':finalizedCurrent?'Official final tags':'Final handoff'}</h3><p>${pendingNote?'Saved correction is staged; official holders remain unchanged until the physical exchange is confirmed.':finalizedCurrent?'Saved authoritative handoff for this round.':'Current tags are assumed correct. Use Keep current only for someone who is not physically exchanging a tag today.'}</p></div><button type="button" class="rt-text-button" data-rt-handoff-mode>Full-screen handoff</button></div>
      <button type="button" class="rt-review-banner ${reviewCount?'has-items':''}" data-rt-toggle-warnings><span>${reviewCount?'⚠':'✓'}</span><strong>${reviewCount?reviewCount+' item'+(reviewCount===1?'':'s')+' to review':'No conflicts detected'}</strong><em>${state.warningsOpen?'Hide':'View'}</em></button>
      <div class="rt-warning-details ${state.warningsOpen?'open':''}">${warningDetails.map(w=>'<div>'+esc(w.text)+'</div>').join('')}</div>
      ${rows.length?finalListHtml(rows,false):'<div class="rt-empty-state"><strong>No projected assignments yet.</strong><span>Enter players and scores to generate the handoff list.</span></div>'}
      ${available.length?'<div class="rt-unassigned"><span>Unassigned after this round</span><strong>'+available.map(n=>'#'+n).join(', ')+'</strong></div>':''}
      <div class="rt-final-actions"><button type="button" data-rt-share-final>Copy / Share</button>${pendingNote?'<button type="button" class="rt-finalize-button" data-rt-confirm-handoff>Confirm physical exchange</button>':finalizedCurrent?'<div class="rt-finalized-card"><strong>✓ Finalized</strong><span>'+esc(new Date(state.finalized.finalized_at||Date.now()).toLocaleString())+'</span></div>':'<button type="button" class="rt-finalize-button" data-rt-finalize>'+(state.finalizing?'Finalizing…':armed?'Warnings remain — tap again to finalize anyway':finalizeLabel)+'</button>'}</div>`;
  }

  function tabHtml(tab){if(tab==='all')return allTabHtml();if(tab==='holders')return holdersTabHtml();if(tab==='available')return availableTabHtml();if(tab==='final')return finalTabHtml();return confirmTabHtml()}

  function ensureStyles(){
    if(q('#'+STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
[${OPEN_ATTR}]{position:relative;border-color:rgba(168,219,115,.58)!important;background:linear-gradient(180deg,rgba(125,205,98,.24),rgba(125,205,98,.08))!important}
[${OPEN_ATTR}] .rt-button-badge{display:inline-flex;align-items:center;justify-content:center;min-width:1.35rem;height:1.35rem;margin-left:.4rem;padding:0 .35rem;border-radius:999px;background:#ffd46f;color:#17200c;font-size:.72rem;font-weight:900}
#${MODAL_ID}{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.76);backdrop-filter:blur(10px)}
#${MODAL_ID}.open{display:flex}
#${MODAL_ID} *{box-sizing:border-box}
#${MODAL_ID} button,#${MODAL_ID} input{font:inherit}
#${MODAL_ID} .rt-sheet{width:min(760px,100%);height:min(860px,94vh);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;border:1px solid rgba(168,219,115,.30);border-radius:28px;background:linear-gradient(180deg,#151d1b,#080d0c);box-shadow:0 34px 120px rgba(0,0,0,.72)}
#${MODAL_ID} .rt-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px 18px 13px;border-bottom:1px solid rgba(168,219,115,.12)}
#${MODAL_ID} .rt-head h2{margin:0;color:#f4f7ef;font-size:1.45rem;letter-spacing:-.035em}#${MODAL_ID} .rt-head p{margin:.25rem 0 0;color:rgba(244,247,239,.58);font-size:.84rem}
#${MODAL_ID} .rt-close{width:44px;height:44px;border-radius:14px;border:1px solid rgba(168,219,115,.22);background:#101715;color:#f4f7ef;font-size:1.1rem}
#${MODAL_ID} .rt-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;padding:8px;border-bottom:1px solid rgba(168,219,115,.10);background:rgba(255,255,255,.015)}
#${MODAL_ID} .rt-tab{min-height:42px;border:0;border-radius:12px;background:transparent;color:rgba(244,247,239,.58);font-size:.79rem;font-weight:800}#${MODAL_ID} .rt-tab.active{background:rgba(125,205,98,.13);color:#d9ffb1;box-shadow:inset 0 0 0 1px rgba(168,219,115,.18)}
#${MODAL_ID} .rt-tab b{display:inline-flex;min-width:1.2rem;height:1.2rem;align-items:center;justify-content:center;margin-left:.22rem;border-radius:999px;background:#ffd46f;color:#18210d;font-size:.68rem}
#${MODAL_ID} .rt-body{overflow:auto;padding:14px 16px 24px;overscroll-behavior:contain}
#${MODAL_ID} .rt-view-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}#${MODAL_ID} .rt-view-head h3{margin:0;color:#f4f7ef;font-size:1.12rem}#${MODAL_ID} .rt-view-head p{margin:.25rem 0 0;color:rgba(244,247,239,.56);font-size:.86rem;line-height:1.4}
#${MODAL_ID} .rt-text-button{border:0;background:transparent;color:#bff48c;font-weight:800;white-space:nowrap;padding:6px 0}
#${MODAL_ID} .rt-confirm-shortcuts{display:flex;align-items:center;gap:10px;padding:10px 11px;margin-bottom:10px;border-radius:15px;background:rgba(125,205,98,.06);border:1px solid rgba(125,205,98,.14)}#${MODAL_ID} .rt-confirm-shortcuts button{min-height:38px;padding:0 12px;border-radius:11px;border:1px solid rgba(168,219,115,.30);background:rgba(125,205,98,.12);color:#e8ffd0;font-weight:850}#${MODAL_ID} .rt-confirm-shortcuts span{font-size:.78rem;color:rgba(244,247,239,.54);line-height:1.3}
#${MODAL_ID} .rt-editor-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 82px 94px;gap:8px;align-items:center;padding:12px;margin:8px 0;border-radius:16px;border:1px solid rgba(168,219,115,.14);background:rgba(255,255,255,.025)}
#${MODAL_ID} .rt-editor-row:focus-within{border-color:rgba(168,219,115,.48);box-shadow:0 0 0 3px rgba(125,205,98,.09)}
#${MODAL_ID} .rt-row-identity{min-width:0;display:flex;flex-direction:column;gap:2px}#${MODAL_ID} .rt-row-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f7ef;font-weight:850}#${MODAL_ID} .rt-row-status{color:rgba(244,247,239,.55);font-size:.78rem}#${MODAL_ID} .rt-star{color:#ffd46f}
#${MODAL_ID} .rt-row-input-wrap{height:46px;display:flex;align-items:center;border:1px solid rgba(168,219,115,.20);border-radius:12px;background:#080d0c;overflow:hidden}#${MODAL_ID} .rt-row-input-wrap span{padding-left:10px;color:rgba(244,247,239,.44);font-weight:850}#${MODAL_ID} .rt-tag-input{width:100%;height:100%;padding:0 8px 0 3px;border:0!important;background:transparent!important;text-align:center;color:#f4f7ef!important;font-weight:900;font-size:1.08rem;box-shadow:none!important}
#${MODAL_ID} .rt-primary-action{height:46px;border-radius:12px;border:1px solid rgba(168,219,115,.34);background:linear-gradient(180deg,rgba(125,205,98,.22),rgba(125,205,98,.09));color:#e7ffd1;font-weight:900}#${MODAL_ID} .rt-primary-action:disabled{opacity:.35}
#${MODAL_ID} .rt-row-secondary{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}#${MODAL_ID} .rt-row-secondary button{flex:1 1 120px;min-height:38px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.025);color:rgba(244,247,239,.66);font-weight:750}#${MODAL_ID} .rt-row-secondary .rt-exchange-toggle{flex-basis:100%;border-color:rgba(168,219,115,.22);color:#dfffc0;background:rgba(125,205,98,.08)}#${MODAL_ID} .rt-row-secondary .rt-exchange-toggle.is-excluded{border-color:rgba(255,212,111,.34);background:rgba(255,212,111,.08);color:#ffe4a6}#${MODAL_ID} .rt-editor-row.is-excluded{border-color:rgba(255,212,111,.28);background:rgba(255,212,111,.035)}
#${MODAL_ID} .rt-row-sync{position:absolute;top:8px;right:8px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;font-size:.7rem;font-weight:900}.rt-row-sync.saved{color:#90dc7c}.rt-row-sync.saving{color:#ffd46f;animation:rtPulse 1s infinite}.rt-row-sync.error{border-radius:999px;background:#7b2936;color:white;cursor:pointer}
@keyframes rtPulse{50%{opacity:.35}}
#${MODAL_ID} .rt-compact-row{position:relative;width:100%;display:grid;grid-template-columns:26px minmax(0,1fr) auto 18px 14px;gap:8px;align-items:center;min-height:52px;margin:6px 0;padding:9px 10px;border:1px solid rgba(168,219,115,.10);border-radius:14px;background:rgba(255,255,255,.02);color:#f4f7ef;text-align:left}#${MODAL_ID} .rt-compact-row.is-unresolved{border-color:rgba(255,212,111,.26)}#${MODAL_ID} .rt-compact-check{color:#8ddd79;font-weight:900}#${MODAL_ID} .rt-compact-row.is-unresolved .rt-compact-check{color:#ffd46f}#${MODAL_ID} .rt-compact-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800}#${MODAL_ID} .rt-compact-tag{color:#d5fca9}#${MODAL_ID} .rt-chevron{color:rgba(244,247,239,.36);font-size:1.35rem}#${MODAL_ID} .rt-history-row{cursor:default}#${MODAL_ID} .rt-history-label{color:rgba(244,247,239,.34);font-size:.56rem;font-weight:900;letter-spacing:.08em}
#${MODAL_ID} .rt-holder-row{display:grid;grid-template-columns:minmax(0,1fr) 90px 86px;gap:8px;align-items:center;padding:11px;margin:7px 0;border:1px solid rgba(168,219,115,.12);border-radius:15px;background:rgba(255,255,255,.022)}#${MODAL_ID} .rt-holder-row.is-round{border-color:rgba(125,205,98,.24);background:rgba(125,205,98,.055)}#${MODAL_ID} .rt-holder-identity{min-width:0;display:flex;flex-direction:column;gap:2px}#${MODAL_ID} .rt-holder-identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f7ef}#${MODAL_ID} .rt-holder-identity span{color:rgba(244,247,239,.50);font-size:.75rem}#${MODAL_ID} .rt-holder-number{color:#d7ffa8;text-align:center;font-size:1.08rem;font-weight:900}#${MODAL_ID} .rt-holder-input{height:44px;display:flex;align-items:center;border:1px solid rgba(168,219,115,.20);border-radius:11px;background:#080d0c;overflow:hidden}#${MODAL_ID} .rt-holder-input span{padding-left:9px;color:rgba(244,247,239,.44);font-weight:850}#${MODAL_ID} .rt-holder-input input{width:100%;height:100%;padding:0 7px 0 2px;border:0;background:transparent;color:#f4f7ef;text-align:center;font-weight:900;box-shadow:none}#${MODAL_ID} .rt-holder-row>button{min-height:44px;border-radius:11px;border:1px solid rgba(168,219,115,.28);background:rgba(125,205,98,.11);color:#e4ffca;font-weight:850}#${MODAL_ID} .rt-holder-row>button:disabled{opacity:.55}#${MODAL_ID} .rt-holder-duplicate{display:none;grid-column:1/-1;padding:3px 2px 0;color:#ffd990;font-size:.76rem;line-height:1.35}#${MODAL_ID} .rt-holder-duplicate.show{display:block}
#${MODAL_ID} .rt-add-available{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:8px;align-items:end;padding:11px;margin-bottom:12px;border-radius:16px;background:rgba(125,205,98,.05);border:1px solid rgba(125,205,98,.13)}#${MODAL_ID} .rt-add-available label{display:flex;flex-direction:column;gap:5px;color:rgba(244,247,239,.54);font-size:.75rem;font-weight:800}#${MODAL_ID} .rt-add-available input{width:100%;min-height:42px;border-radius:11px;border:1px solid rgba(168,219,115,.18);background:#080d0c;color:#f4f7ef;padding:0 10px}#${MODAL_ID} .rt-add-available button{min-height:42px;border-radius:11px;border:1px solid rgba(168,219,115,.30);background:rgba(125,205,98,.13);color:#e8ffd0;font-weight:850}
#${MODAL_ID} .rt-available-row{position:relative;display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 28px 10px 10px;margin:7px 0;border-radius:14px;border:1px solid rgba(168,219,115,.11);background:rgba(255,255,255,.02)}#${MODAL_ID} .rt-available-row strong{color:#d7ffa8}#${MODAL_ID} .rt-available-row input{min-width:0;min-height:40px;border-radius:10px;border:1px solid rgba(168,219,115,.16);background:#080d0c;color:#f4f7ef;padding:0 10px}#${MODAL_ID} .rt-available-row>button{min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.025);color:rgba(244,247,239,.66)}
#${MODAL_ID} .rt-review-banner{width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:50px;margin:8px 0 5px;padding:0 12px;border:1px solid rgba(125,205,98,.15);border-radius:14px;background:rgba(125,205,98,.05);color:#dfffc0;text-align:left}#${MODAL_ID} .rt-review-banner.has-items{border-color:rgba(255,212,111,.30);background:rgba(255,212,111,.06);color:#ffe3a1}#${MODAL_ID} .rt-review-banner em{font-style:normal;font-size:.78rem;opacity:.68}
#${MODAL_ID} .rt-warning-details{display:none;padding:7px 10px;margin-bottom:10px;border-left:2px solid rgba(255,212,111,.45);color:#ffe1a0;font-size:.83rem;line-height:1.42}#${MODAL_ID} .rt-warning-details.open{display:block}#${MODAL_ID} .rt-warning-details div{padding:4px 0}
#${MODAL_ID} .rt-final-list{display:grid;gap:7px;margin:10px 0}#${MODAL_ID} .rt-final-item{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:9px;align-items:center;min-height:58px;padding:8px 10px;border-radius:14px;border:1px solid rgba(168,219,115,.12);background:rgba(255,255,255,.022)}#${MODAL_ID} .rt-final-item.is-excluded{border-color:rgba(255,212,111,.30);background:rgba(255,212,111,.045)}#${MODAL_ID} .rt-final-item>strong{color:#d8ffa8;font-size:1.15rem}#${MODAL_ID} .rt-final-person{min-width:0;display:flex;flex-direction:column;gap:2px}#${MODAL_ID} .rt-final-person span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f7ef;font-weight:800}#${MODAL_ID} .rt-final-person small{color:rgba(244,247,239,.48);font-size:.72rem}#${MODAL_ID} .rt-final-exchange-toggle{min-height:38px;padding:0 9px;border-radius:10px;border:1px solid rgba(168,219,115,.22);background:rgba(125,205,98,.07);color:#dfffc0;font-size:.72rem;font-weight:850;white-space:nowrap}#${MODAL_ID} .rt-final-exchange-toggle.is-excluded{border-color:rgba(255,212,111,.34);background:rgba(255,212,111,.08);color:#ffe4a6}
#${MODAL_ID} .rt-unassigned{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:13px;background:rgba(255,255,255,.02);color:rgba(244,247,239,.58);font-size:.82rem}#${MODAL_ID} .rt-unassigned strong{color:#f4f7ef}
#${MODAL_ID} .rt-final-actions{display:grid;grid-template-columns:auto minmax(180px,1fr);gap:8px;margin-top:10px}#${MODAL_ID} .rt-final-actions>button{min-height:46px;border-radius:12px;border:1px solid rgba(168,219,115,.24);background:rgba(255,255,255,.025);color:#f4f7ef;font-weight:850}#${MODAL_ID} .rt-finalize-button{background:linear-gradient(180deg,rgba(125,205,98,.25),rgba(125,205,98,.10))!important;color:#e9ffd3!important}
#${MODAL_ID} .rt-finalized-card{display:flex;flex-direction:column;justify-content:center;padding:8px 12px;border-radius:12px;border:1px solid rgba(125,205,98,.30);background:rgba(125,205,98,.08);color:#d9ffb3}#${MODAL_ID} .rt-finalized-card span{font-size:.74rem;opacity:.65}
#${MODAL_ID} .rt-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:120px;padding:20px;border:1px dashed rgba(168,219,115,.17);border-radius:16px;color:rgba(244,247,239,.52);text-align:center}#${MODAL_ID} .rt-empty-state strong{color:#dfffc0}
#${MODAL_ID} .rt-footer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:64px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(168,219,115,.11);background:rgba(8,13,12,.96)}#${MODAL_ID} .rt-sync-summary{display:flex;align-items:center;gap:8px;min-width:0;color:rgba(244,247,239,.58);font-size:.78rem}#${MODAL_ID} .rt-sync-dot{width:9px;height:9px;border-radius:999px;background:#8ddd79;flex:0 0 auto}.rt-sync-summary.saving .rt-sync-dot{background:#ffd46f;animation:rtPulse 1s infinite}.rt-sync-summary.error .rt-sync-dot,.rt-sync-summary.offline .rt-sync-dot{background:#ff7f8d}.rt-sync-summary span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${MODAL_ID} .rt-footer-actions{display:flex;gap:7px}#${MODAL_ID} .rt-footer-actions button{min-height:42px;border-radius:11px;border:1px solid rgba(168,219,115,.20);background:rgba(255,255,255,.025);color:#f4f7ef;font-weight:800;padding:0 11px}#${MODAL_ID} .rt-footer-actions .primary{background:rgba(125,205,98,.14);color:#dfffc0}
#${MODAL_ID} .rt-handoff-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}#${MODAL_ID} .rt-handoff-head div{display:flex;flex-direction:column}#${MODAL_ID} .rt-handoff-head span{color:#d7ffa8;font-size:1.35rem;font-weight:950;letter-spacing:.08em}#${MODAL_ID} .rt-handoff-head strong{color:rgba(244,247,239,.58)}#${MODAL_ID} .rt-handoff-head button{min-height:40px;border-radius:11px;border:1px solid rgba(168,219,115,.18);background:rgba(255,255,255,.02);color:#f4f7ef}
#${MODAL_ID} .rt-final-list.is-handoff .rt-final-item{grid-template-columns:110px minmax(0,1fr);min-height:68px;padding:8px 16px}#${MODAL_ID} .rt-final-list.is-handoff .rt-final-item strong{font-size:1.65rem}#${MODAL_ID} .rt-final-list.is-handoff .rt-final-item span{font-size:1.18rem}#${MODAL_ID} .rt-final-list.is-handoff .rt-final-person small{font-size:.78rem}
#${MODAL_ID} .rt-handoff-actions{position:sticky;bottom:-24px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;padding:12px 0 0;background:linear-gradient(180deg,transparent,#080d0c 28%)}#${MODAL_ID} .rt-handoff-actions button,#${MODAL_ID} .rt-finalized-pill{display:flex;align-items:center;justify-content:center;min-height:50px;border-radius:13px;border:1px solid rgba(168,219,115,.23);background:rgba(255,255,255,.03);color:#f4f7ef;font-weight:900}#${MODAL_ID} .rt-handoff-actions .rt-finalize-button,#${MODAL_ID} .rt-finalized-pill{background:rgba(125,205,98,.13);color:#ddffbd}
#${MODAL_ID} .rt-toast{position:fixed;left:50%;bottom:88px;transform:translate(-50%,18px);z-index:5;opacity:0;pointer-events:none;padding:10px 14px;border-radius:999px;background:#1b2421;color:#f4f7ef;box-shadow:0 14px 44px rgba(0,0,0,.45);transition:.18s ease;font-size:.84rem;font-weight:800}#${MODAL_ID} .rt-toast.show{opacity:1;transform:translate(-50%,0)}#${MODAL_ID} .rt-toast.error{background:#6e2732}#${MODAL_ID} .rt-toast.success{background:#244b26}
@media(max-width:700px){#${MODAL_ID}{padding:0;align-items:flex-end}#${MODAL_ID} .rt-sheet{width:100%;height:min(96vh,920px);border-radius:24px 24px 0 0}#${MODAL_ID} .rt-head{padding:14px 14px 11px}#${MODAL_ID} .rt-head h2{font-size:1.28rem}#${MODAL_ID} .rt-tabs{padding:7px 8px;gap:2px}#${MODAL_ID} .rt-tab{font-size:.68rem;padding:0 3px}#${MODAL_ID} .rt-body{padding:12px 12px 20px}#${MODAL_ID} .rt-editor-row{grid-template-columns:minmax(0,1fr) 78px 84px;padding:10px}#${MODAL_ID} .rt-row-secondary{gap:6px}#${MODAL_ID} .rt-holder-row{grid-template-columns:minmax(0,1fr) 76px 76px;padding:9px;gap:6px}#${MODAL_ID} .rt-holder-row>button{font-size:.76rem}#${MODAL_ID} .rt-confirm-shortcuts{align-items:flex-start;flex-direction:column}#${MODAL_ID} .rt-add-available{grid-template-columns:76px minmax(0,1fr)}#${MODAL_ID} .rt-add-available button{grid-column:1/-1}#${MODAL_ID} .rt-final-actions{grid-template-columns:1fr}#${MODAL_ID} .rt-final-item{grid-template-columns:58px minmax(0,1fr) auto}#${MODAL_ID} .rt-final-exchange-toggle{padding:0 7px;font-size:.66rem}#${MODAL_ID} .rt-footer{padding-left:12px;padding-right:12px}#${MODAL_ID} .rt-footer-actions .secondary-label{display:none}}
@media(max-width:390px){#${MODAL_ID} .rt-editor-row{grid-template-columns:minmax(0,1fr) 72px 78px;gap:6px}#${MODAL_ID} .rt-primary-action{font-size:.78rem}#${MODAL_ID} .rt-tab{padding:0 1px;font-size:.62rem}#${MODAL_ID} .rt-holder-row{grid-template-columns:minmax(0,1fr) 70px 68px}#${MODAL_ID} .rt-footer-actions button{padding:0 9px}}
`;
    document.head.appendChild(style);
  }

  function ensureModal(){
    ensureStyles();let modal=q('#'+MODAL_ID);if(modal)return modal;
    modal=document.createElement('div');modal.id=MODAL_ID;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Round Tags');
    modal.innerHTML='<div class="rt-sheet"><header class="rt-head"><div><h2>Round Tags</h2><p data-rt-subtitle></p></div><button class="rt-close" type="button" data-close-round-tags aria-label="Close">✕</button></header><nav class="rt-tabs" data-rt-tabs></nav><main class="rt-body" data-rt-body></main><footer class="rt-footer"><div class="rt-sync-summary" data-rt-sync-summary><i class="rt-sync-dot"></i><span></span></div><div class="rt-footer-actions" data-rt-footer-actions></div></footer></div>';
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.body.appendChild(modal);return modal;
  }

  function renderTabs(){
    const modal=ensureModal(),counts=statusCounts(),hasFinalization=!!state.finalized,finalizedCurrent=finalizationIsCurrent(),needs=hasFinalization?0:unresolvedRows().length;
    const labels={confirm:hasFinalization?'Start':'Confirm',all:'All players',holders:'All tags',available:'Available',final:finalizedCurrent?'Final ✓':'Final'};
    q('[data-rt-tabs]',modal).innerHTML=TABS.map(tab=>`<button type="button" class="rt-tab ${state.activeTab===tab?'active':''}" data-rt-tab="${tab}">${labels[tab]}${tab==='confirm'&&needs?'<b>'+needs+'</b>':''}</button>`).join('');
  }

  function renderFooter(){
    const modal=ensureModal(),sync=overallSync(),counts=statusCounts(),hasFinalization=!!state.finalized,finalizedCurrent=finalizationIsCurrent(),needs=hasFinalization?0:unresolvedRows().length;
    const summary=q('[data-rt-sync-summary]',modal);summary.className='rt-sync-summary '+sync.kind;q('span',summary).textContent=sync.label;
    const actions=q('[data-rt-footer-actions]',modal);
    if(state.activeTab==='confirm'&&hasFinalization)actions.innerHTML='<button type="button" data-rt-close-footer>Close</button><button type="button" class="primary" data-rt-tab="final">View final</button>';
    else if(state.activeTab==='confirm')actions.innerHTML=`<button type="button" data-rt-close-footer><span class="secondary-label">Close</span><span class="secondary-label"> </span>Done</button>${needs?'<button type="button" class="primary" data-rt-next-unresolved>Next unresolved</button>':'<button type="button" class="primary" data-rt-tab="final">Review final</button>'}`;
    else if(state.activeTab==='final')actions.innerHTML='<button type="button" data-rt-close-footer>Close</button><button type="button" class="primary" data-rt-handoff-mode>Handoff</button>';
    else actions.innerHTML='<button type="button" data-rt-close-footer>Close</button><button type="button" class="primary" data-rt-tab="'+(hasFinalization?'final':'confirm')+'">'+(hasFinalization?'View final':'Confirm tags')+'</button>';
  }

  function renderShell(){
    ensureParticipantRowsLocal();const modal=ensureModal();
    const body=q('[data-rt-body]',modal),subtitle=q('[data-rt-subtitle]',modal),active=document.activeElement,roundFocus=active&&active.matches&&active.matches('[data-rt-tag]')?active.dataset.rtTag:null,currentFocus=active&&active.matches&&active.matches('[data-rt-current-tag]')?active.dataset.rtCurrentTag:null,focusKey=roundFocus||currentFocus,focusSelector=roundFocus?'data-rt-tag':'data-rt-current-tag',selStart=focusKey?active.selectionStart:null,selEnd=focusKey?active.selectionEnd:null,scrollTop=body.scrollTop;
    subtitle.textContent=fmtDate(state.roundDate||activeWeek())+(state.finalized?(finalizationIsCurrent()?' · Final tags saved':' · Review changes and re-finalize'):' · Changes save automatically');
    renderTabs();body.innerHTML=tabHtml(state.activeTab);renderFooter();updateOpenButton();
    if(focusKey){const input=q('['+focusSelector+'="'+CSS.escape(focusKey)+'"]',body);if(input){input.focus({preventScroll:true});try{input.setSelectionRange(selStart,selEnd)}catch(_e){}}}
    body.scrollTop=scrollTop;
  }

  function patchChrome(structural){
    if(!isOpen()){updateOpenButton();return}
    const modal=q('#'+MODAL_ID),counts=statusCounts(),needs=state.finalized?0:unresolvedRows().length;
    qa('[data-rt-tab]',modal).forEach(button=>{
      const tab=button.dataset.rtTab;button.classList.toggle('active',tab===state.activeTab);
      if(tab==='confirm'){
        let badge=q('b',button);
        if(needs&&!badge){badge=document.createElement('b');button.appendChild(badge)}
        if(badge){if(needs)badge.textContent=String(needs);else badge.remove()}
      }
    });
    const sync=overallSync(),summary=q('[data-rt-sync-summary]',modal);
    if(summary){summary.className='rt-sync-summary '+sync.kind;const label=q('span',summary);if(label)label.textContent=sync.label}
    if(structural)renderFooter();
    updateOpenButton();
    if(state.activeTab==='final')refreshFinal();
  }

  function updateEditorElement(el,row,allowInputUpdate){
    if(!el||!row)return;
    const unresolved=isUnresolved(row),name=q('.rt-row-name',el),status=q('.rt-row-status',el),input=q('[data-rt-tag]',el),confirm=q('[data-rt-confirm]',el),oldSync=q('.rt-row-sync',el);
    el.classList.toggle('is-unresolved',unresolved);el.classList.toggle('is-resolved',!unresolved);
    if(name)name.innerHTML=esc(row.player_name)+(unresolved?' <b class="rt-star">*</b>':'');if(status)status.textContent=statusLabel(row);
    if(input&&allowInputUpdate&&document.activeElement!==input)input.value=row.tag_number||'';
    if(confirm){confirm.disabled=!row.tag_number;confirm.textContent=row.status==='confirmed'?'Confirmed':'Confirm'}
    if(oldSync)updateSyncElement(oldSync,'entry:'+row.player_key);
  }

  function patchEntry(key,structural){
    if(!isOpen())return;
    const body=q('[data-rt-body]'),row=state.entries.get(key),existing=q('[data-rt-row="'+CSS.escape(key)+'"]',body);
    if(state.activeTab==='confirm'){
      if(!row){if(existing)existing.remove();return}
      const list=q('[data-rt-confirm-list]',body);if(!existing&&list){(function(el){if(el)el.remove()})(q('.rt-empty-state',list));list.insertAdjacentHTML('beforeend',editorRowHtml(row));return}
      updateEditorElement(existing,row,false);return;
    }
    if(state.activeTab==='all'){
      if(!existing){const bodyScroll=body.scrollTop;body.innerHTML=allTabHtml();body.scrollTop=bodyScroll;return}
      if(existing.matches('.rt-editor-row'))updateEditorElement(existing,row,false);else existing.outerHTML=compactRowHtml(row);return;
    }
    if(state.activeTab==='final')refreshFinal();
  }

  function patchAvailable(tag,structural){
    if(!isOpen())return;
    if(state.activeTab==='available'){
      const body=q('[data-rt-body]'),list=q('[data-rt-available-list]',body),existing=q('[data-rt-available-row="'+Number(tag)+'"]',body),row=state.available.get(Number(tag));
      if(!row){if(existing)existing.remove();if(list&&!q('.rt-available-row',list))list.innerHTML='<div class="rt-empty-state"><strong>No available tags recorded.</strong><span>Player edits never change this list automatically.</span></div>';return}
      if(!existing){(function(el){if(el)el.remove()})(q('.rt-empty-state',list));list.insertAdjacentHTML('beforeend',availableRowHtml(row));return}
      const input=q('[data-rt-available-source]',existing);if(input&&document.activeElement!==input)input.value=row.source||'';const sync=q('.rt-row-sync',existing);if(sync)updateSyncElement(sync,'available:'+tag);
    }
    if(state.activeTab==='final')refreshFinal();
  }

  function refreshFinal(){
    if(!isOpen()||state.activeTab!=='final')return;
    const body=q('[data-rt-body]'),scrollTop=body.scrollTop;body.innerHTML=finalTabHtml();body.scrollTop=scrollTop;
  }

  function ensureButton(){
    const tools=q('#scorecards .panel:first-child .inline-tools')||q('#scoringPage > .panel:first-child .header-actions');if(!tools)return;
    qa('[data-open-incoming-tags]').forEach(btn=>{btn.style.display='none';btn.setAttribute('aria-hidden','true')});
    const old=q('#hbnfIncomingTagModal');if(old)old.remove();
    let button=q('['+OPEN_ATTR+']',tools);if(!button){button=document.createElement('button');button.type='button';button.className='btn';button.setAttribute(OPEN_ATTR,'1');tools.insertBefore(button,tools.firstChild)}
    updateOpenButton();
  }

  function updateOpenButton(){
    const button=q('['+OPEN_ATTR+']');if(!button)return;const hasFinalization=!!state.finalized,finalizedCurrent=finalizationIsCurrent(),c=statusCounts(),n=hasFinalization?0:(c.unconfirmed+c.unknown);button.innerHTML='Round Tags'+(n?'<span class="rt-button-badge">'+n+'</span>':'');button.title=hasFinalization?(finalizedCurrent?'Final tags saved for this round':'Round changed — review and re-finalize tags'):n?(n+' player'+(n===1?'':'s')+' need tag confirmation'):'All player tags confirmed';
  }

  function setTab(tab){if(!TABS.includes(tab))return;state.activeTab=tab;state.handoffMode=false;renderShell()}

  function currentOfficialTag(key){return verifiedCurrentTag(key)}

  function setExchangeExcluded(key,excluded){
    key=keyFor(key);const week=getWeekSafe(),participant=participants().find(p=>p.key===key),row=state.entries.get(key);if(!week||!participant||!Number((row&&row.tag_number)||currentOfficialTag(key)||0))return false;
    week.tagExchangeExceptions=week.tagExchangeExceptions&&typeof week.tagExchangeExceptions==='object'?week.tagExchangeExceptions:{};
    week.tagExchangeExceptions[key]={excluded:!!excluded,player_name:participant.name,updated_at:nowIso()};
    state.finalizedDirty=true;
    try{
      const c=ctxSafe();
      if(c&&typeof c.pushRoot==='function'){if(typeof c.saveLocal==='function')c.saveLocal();c.pushRoot()}
      else if(typeof push==='function')push();
    }catch(err){console.error('Round Tags exchange exception sync failed',err)}
    scheduleRender(true);
    showToast(excluded?participant.name+' keeps their current tag and is out of today’s exchange.':participant.name+' is back in today’s exchange.','success');
    return true;
  }

  function confirmAllUnchanged(){
    if(finalizedStartMode()){state.activeTab='final';renderShell();return}
    const rows=unresolvedRows().filter(row=>row.status==='unconfirmed'&&Number(row.tag_number)>0&&Number(row.tag_number)===Number(currentOfficialTag(row.player_key)));
    if(!rows.length){showToast('No unchanged tags are waiting for confirmation.','');return}
    rows.forEach(row=>markEntry(Object.assign({},row,{status:'confirmed'}),true,true));showToast(rows.length+' unchanged tag'+(rows.length===1?'':'s')+' confirmed.','success');
  }

  function autoResolveCurrentTags(){
    const rows=allRows().filter(row=>!isExchangeExcluded(row.player_key)&&row.status==='unconfirmed'&&Number(row.tag_number)>0&&Number(row.tag_number)===Number(currentOfficialTag(row.player_key)));
    rows.forEach(row=>state.entries.set(row.player_key,Object.assign({},row,{status:'confirmed'})));
    return rows.length;
  }

  async function prepareCloseoutForWeek(date){
    const wanted=text(date||activeWeek());if(!wanted)return{ok:false,reason:'date'};
    if(!state.loaded||state.roundDate!==wanted)await loadRound(true);
    if(!state.loaded||state.roundDate!==wanted){openModal();showToast('Round Tags could not load for this week. Reload and try again.','error');return{ok:false,reason:'load'}}
    state.closeoutMode=true;autoResolveCurrentTags();state.activeTab='final';state.handoffMode=false;ensureModal().classList.add('open');document.body.style.overflow='hidden';renderShell();
    return{ok:true};
  }

  async function finishCloseout(){
    const result=await finalizeRound();if(!result||result.ok!==true)return result;
    const week=getWeekSafe();if(week&&!week.finalized){week.finalized=true;try{if(typeof push==='function')push()}catch(err){console.error('Skins week finalization sync failed',err);showToast('Tags finalized, but week status needs a sync retry.','error');return{ok:false,reason:'week-sync',error:err}}}
    state.closeoutMode=false;state.activeTab='final';state.handoffMode=true;renderShell();showToast('Round finalized. Hand off the tags and head home.','success');return result;
  }

  function focusNextUnresolved(){
    if(finalizedStartMode()){state.activeTab='final';renderShell();return}
    if(state.activeTab!=='confirm'){state.activeTab='confirm';renderShell()}
    const body=q('[data-rt-body]'),row=q('.rt-editor-row',body);if(!row){showToast('All participating players are resolved.','success');return}
    row.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{const input=q('[data-rt-tag]',row);if(input)input.focus({preventScroll:true})},260);
  }

  function rowFromDom(key){
    const row=state.entries.get(key);if(!row)return null;const input=q('[data-rt-tag="'+CSS.escape(key)+'"]'),raw=clean(input&&input.value),tag=raw===''?null:(Number(raw)||null);return Object.assign({},row,{tag_number:tag,status:tag?(row.status==='confirmed'&&Number(row.tag_number)===tag?'confirmed':'unconfirmed'):'unknown'});
  }

  function finalShareText(){
    const rows=finalRows(),available=finalAvailableNumbers();
    const lines=['HB Night Flyers — Final Tags',fmtDate(state.roundDate),''];rows.forEach(([name,tag])=>lines.push('#'+Number(tag)+' — '+name));
    if(available.length)lines.push('','Unassigned: '+available.map(n=>'#'+n).join(', '));
    return lines.join('\n');
  }

  async function shareFinal(){
    const value=finalShareText();
    try{
      if(navigator.share){await navigator.share({title:'HB Night Flyers Final Tags',text:value});return}
      await navigator.clipboard.writeText(value);showToast('Final tag list copied.','success');
    }catch(err){if(err&&err.name!=='AbortError'){try{await navigator.clipboard.writeText(value);showToast('Final tag list copied.','success')}catch(_e){showToast('Could not copy the list.','error')}}}
  }

  function openModal(){ensureButton();state.closeoutMode=false;ensureModal().classList.add('open');document.body.style.overflow='hidden';loadRound(false);renderShell()}
  function closeModal(){const modal=q('#'+MODAL_ID);if(modal)modal.classList.remove('open');document.body.style.overflow='';state.handoffMode=false;state.closeoutMode=false}

  document.addEventListener('click',event=>{
    const target=event.target&&event.target.closest?event.target.closest('button,['+OPEN_ATTR+']'):null;if(!target)return;
    if(target.hasAttribute(OPEN_ATTR)){event.preventDefault();openModal();return}
    if(target.hasAttribute('data-close-round-tags')||target.hasAttribute('data-rt-close-footer')){event.preventDefault();closeModal();return}
    if(target.dataset.rtTab!==undefined){event.preventDefault();setTab(target.dataset.rtTab);return}
    if(target.hasAttribute('data-rt-initialize-round')){event.preventDefault();initializeMissingRoundRecords();return}
    if(target.hasAttribute('data-rt-confirm-unchanged')){event.preventDefault();confirmAllUnchanged();return}
    if(target.hasAttribute('data-rt-next-unresolved')){event.preventDefault();focusNextUnresolved();return}
    if(target.dataset.rtEdit!==undefined){event.preventDefault();state.expandedKey=state.expandedKey===target.dataset.rtEdit?null:target.dataset.rtEdit;renderShell();return}
    if(target.dataset.rtEditRoundHolder!==undefined){event.preventDefault();state.activeTab='all';state.expandedKey=target.dataset.rtEditRoundHolder;renderShell();setTimeout(()=>{const row=q('[data-rt-row="'+CSS.escape(state.expandedKey)+'"]');if(row){row.scrollIntoView({behavior:'smooth',block:'center'});const input=q('[data-rt-tag]',row);if(input)input.focus({preventScroll:true})}},80);return}
    if(target.dataset.rtSaveCurrent!==undefined){event.preventDefault();saveCurrentTag(target.dataset.rtSaveCurrent);return}
    if(target.dataset.rtExchangeExclude!==undefined){event.preventDefault();const key=target.dataset.rtExchangeExclude;setExchangeExcluded(key,!isExchangeExcluded(key));return}
    if(target.dataset.rtConfirm!==undefined){event.preventDefault();const key=target.dataset.rtConfirm,row=rowFromDom(key);if(row&&row.tag_number){row.status='confirmed';markEntry(row,true,true);state.expandedKey=null}return}
    if(target.dataset.rtUnknown!==undefined){event.preventDefault();const row=state.entries.get(target.dataset.rtUnknown);if(row){const tag=Number(row.tag_number)||0;if(tag&&!window.confirm('Mark '+row.player_name+' as Unknown and remove #'+tag+' from this round?'))return;markEntry(Object.assign({},row,{tag_number:null,status:'unknown'}),true,true);state.expandedKey=null}return}
    if(target.dataset.rtUntagged!==undefined){event.preventDefault();const row=state.entries.get(target.dataset.rtUntagged);if(row){const tag=Number(row.tag_number)||0;if(tag&&!window.confirm('Mark '+row.player_name+' as Untagged and remove #'+tag+' from this round?'))return;markEntry(Object.assign({},row,{tag_number:null,status:'untagged'}),true,true);state.expandedKey=null}return}
    if(target.dataset.rtRetry!==undefined){event.preventDefault();const raw=target.dataset.rtRetry;if(raw.startsWith('entry:')){const key=raw.slice(6),row=state.entries.get(key);if(row)saveEntry(key,row.client_edit_id)}else if(raw.startsWith('available:')){const tag=Number(raw.slice(10)),row=state.available.get(tag);if(row)saveAvailable(tag,row.client_edit_id)}else if(raw.startsWith('current:'))saveCurrentTag(raw.slice(8));return}
    if(target.hasAttribute('data-rt-add-available')){event.preventDefault();const modal=q('#'+MODAL_ID),tag=Number(q('[data-rt-new-available]',modal)&&q('[data-rt-new-available]',modal).value)||0,source=clean(q('[data-rt-new-source]',modal)&&q('[data-rt-new-source]',modal).value);if(tag>0){markAvailable({round_date:state.roundDate,tag_number:tag,source,notes:''},true);q('[data-rt-new-available]',modal).value='';q('[data-rt-new-source]',modal).value='';showToast('#'+tag+' added to the available pool.','success')}return}
    if(target.dataset.rtRemoveAvailable!==undefined){event.preventDefault();removeAvailable(target.dataset.rtRemoveAvailable);return}
    if(target.hasAttribute('data-rt-toggle-warnings')){event.preventDefault();state.warningsOpen=!state.warningsOpen;refreshFinal();return}
    if(target.hasAttribute('data-rt-handoff-mode')){event.preventDefault();state.activeTab='final';state.handoffMode=true;renderShell();return}
    if(target.hasAttribute('data-rt-exit-handoff')){event.preventDefault();state.handoffMode=false;renderShell();return}
    if(target.hasAttribute('data-rt-share-final')){event.preventDefault();shareFinal();return}
    if(target.hasAttribute('data-rt-confirm-handoff')){event.preventDefault();confirmPhysicalHandoff();return}
    if(target.hasAttribute('data-rt-finalize')){event.preventDefault();if(state.closeoutMode)finishCloseout();else finalizeRound();return}
  });

  document.addEventListener('input',event=>{
    const t=event.target;if(!t)return;
    if(t.matches('[data-rt-current-tag]')){const key=t.dataset.rtCurrentTag,duplicates=currentDuplicateNames(key,Number(clean(t.value))||0),hint=q('[data-rt-current-duplicate="'+CSS.escape(key)+'"]',t.closest('.rt-holder-row'));if(hint){hint.classList.toggle('show',!!duplicates.length);hint.textContent=duplicates.length?'#'+Number(clean(t.value))+' is also recorded for '+duplicates.join(', ')+'. Saving will make this player the verified holder and the others ?.':''}return}
    if(!t.matches('[data-rt-tag]'))return;
    const key=t.dataset.rtTag,row=state.entries.get(key);if(!row)return;
    const raw=clean(t.value),tag=raw===''?null:(Number(raw)||null),changed=Number(row.tag_number||0)!==Number(tag||0);
    markEntry(Object.assign({},row,{tag_number:tag,status:tag?(changed?'unconfirmed':row.status):'unknown'}),false,false);
    const el=t.closest('.rt-editor-row');if(el){const status=q('.rt-row-status',el),confirm=q('[data-rt-confirm]',el),name=q('.rt-row-name',el);if(status)status.textContent=tag?('#'+tag+'*'):'Unknown*';if(confirm){confirm.disabled=!tag;confirm.textContent='Confirm'}if(name)name.innerHTML=esc(row.player_name)+' <b class="rt-star">*</b>'}
  });

  document.addEventListener('change',event=>{
    const t=event.target;if(!t)return;
    if(t.matches('[data-rt-tag]')){const key=t.dataset.rtTag,row=state.entries.get(key);if(!row)return;const raw=clean(t.value),tag=raw===''?null:(Number(raw)||null),changed=Number(row.tag_number||0)!==Number(tag||0);markEntry(Object.assign({},row,{tag_number:tag,status:tag?(changed?'unconfirmed':row.status):'unknown'}),true,false);return}
    if(t.matches('[data-rt-available-source]')){const tag=Number(t.dataset.rtAvailableSource)||0,row=state.available.get(tag);if(row)markAvailable(Object.assign({},row,{source:t.value}),true);return}
    if(t.id==='weekSelect')setTimeout(()=>loadRound(true),0);
  });

  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isOpen())closeModal()});
  // Pending local tag drafts are shown for review; they are retried only by
  // the row's explicit retry control, never on reload, reconnect, or tab return.
  window.addEventListener('online',()=>{state.online=true;patchChrome(false)});
  window.addEventListener('offline',()=>{state.online=false;patchChrome(false)});
  document.addEventListener('hbnf:score-state-changed',()=>{if(state.finalized)state.finalizedDirty=true;patchChrome(true);if(state.activeTab==='final')refreshFinal()});

  window.HBNFRoundTags={
    build:BUILD,
    getLoadedDate:function(){return state.loaded?state.roundDate:''},
    ensureRound:function(date){const wanted=text(date||activeWeek());if(!wanted||state.loading||state.roundDate===wanted&&state.loaded)return Promise.resolve({ok:true,unchanged:true});return loadRound(true).then(()=>({ok:state.loaded&&state.roundDate===wanted}))},
    getMap:function(date){return state.loaded&&text(date)===state.roundDate?entryMap():null},
    getCurrentMap:function(){syncTestFixtureParticipants();return state.currentLoaded?currentMap():null},
    getCurrentHolders:function(){syncTestFixtureParticipants();if(!state.currentLoaded)return null;const rows=allTagHolderRows(),counts=new Map();rows.forEach(row=>{const tag=Number(row.tag_number)||0;if(tag)counts.set(tag,(counts.get(tag)||0)+1)});return rows.map(row=>Object.assign({},row,{tag_number:counts.get(Number(row.tag_number)||0)>1?null:row.tag_number}))},
    isTagUnknown:function(name){const key=keyFor(name),entry=state.entries.get(key);if(entry){if(entry.status==='untagged')return false;if(entry.status==='unknown'&&!Number(entry.tag_number||0))return true}return !verifiedCurrentTag(key)},
    getAuthorityRevision:function(){return state.authorityRevision},
    getCurrentAvailable:function(){return state.currentLoaded?currentAvailableSnapshot():null},
    refreshCurrentOwnership:refreshCurrentOwnership,
    saveManualAssignments:saveManualAssignments,
    getFinalMap:function(date){return state.loaded&&text(date)===state.roundDate?finalizedMap():null},
    getAvailable:function(date){return state.loaded&&text(date)===state.roundDate?availableNumbers():null},
    getDraftMap:function(date){syncTestFixtureParticipants();return state.loaded&&text(date||activeWeek())===state.roundDate?entryMap():null},
    setDraftTag:function(name,tag){
      syncTestFixtureParticipants();
      if(!state.loaded||text(activeWeek())!==state.roundDate)return{ok:false,reason:'round-not-loaded'};
      const key=keyFor(name),participant=participants().find(p=>p.key===key);
      if(!participant)return{ok:false,reason:'not-a-round-participant'};
      const old=state.entries.get(key)||normalizeEntry({round_date:state.roundDate,player_key:key,player_name:participant.name,status:'unknown'}),number=Number(tag)||0;
      if(!(number>0)){markEntry(Object.assign({},old,{tag_number:null,status:'unknown'}),true,false);return{ok:true}}
      const fixture=testTagFixture();
      if(fixture){markEntry(Object.assign({},old,{tag_number:number,status:'confirmed'}),true,false);return{ok:true}}
      const client=getClient();if(!client)return{ok:false,reason:'client-unavailable'};
      const editId=uuid(),date=state.roundDate,event=state.eventType,authorityRevision=Number(state.authorityRevision)||0,entryRevision=Number(old.revision)||0;
      const optimistic=normalizeEntry(Object.assign({},old,{tag_number:number,status:'confirmed',client_edit_id:editId,updated_at:nowIso()}));
      state.entries.set(key,optimistic);state.sync.set('entry:'+key,'saving');state.finalizedDirty=true;writeCache();patchEntry(key,true);patchChrome(true);
      client.rpc('hbnf_verify_round_tag_v1',{p_round_date:date,p_event_type:event,p_player_name:participant.name,p_tag_number:number,p_expected_authority_revision:authorityRevision,p_expected_entry_revision:entryRevision,p_client_edit_id:editId}).then(async response=>{
        if(state.roundDate!==date||state.eventType!==event)return;
        if(response.error)throw response.error;const data=response.data||{};
        if(data.status!=='saved'){
          state.sync.set('entry:'+key,'error');await refreshCurrentOwnership();await loadRound(true);
          showToast(data.reason==='handoff_required'?'This finalized round requires its physical handoff workflow.':'Tag changed elsewhere. Reloaded the latest ownership; enter the verified tag again.','error');return;
        }
        state.entries.set(key,normalizeEntry(data.entry||Object.assign({},optimistic,{revision:Number(data.entry_revision)||optimistic.revision,updated_at:nowIso()})));
        state.sync.set('entry:'+key,'saved');if(data.row&&data.row.player_key)state.current.set(key,normalizeCurrent(data.row));if(data.idempotent)await refreshCurrentOwnership();
        (data.displaced_player_keys||[]).forEach(displaced=>{state.current.delete(keyFor(displaced));const row=state.entries.get(keyFor(displaced));if(row&&Number(row.tag_number)===number)state.entries.set(keyFor(displaced),normalizeEntry(Object.assign({},row,{tag_number:null,status:'unknown'})))});
        state.authorityRevision=Number(data.current_revision)||state.authorityRevision;applyBagTagsFromServer(data.bag_tags);writeCache();patchEntry(key,true);patchChrome(true);notifyOfficialCurrentChanged();
        document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date}}));
      }).catch(error=>{console.error('Verified round-tag save failed',error);if(state.roundDate===date&&state.eventType===event){state.sync.set('entry:'+key,'error');patchEntry(key,false);patchChrome(false);showToast('Tag was not saved. Check the connection and enter it again.','error')}});
      return{ok:true};
    },
    projectThrough:function(week,through){return state.loaded?projectThrough(week,through):null},
    reload:function(){return loadRound(true)},
    finalizeForWeek:finalizeForWeek,
    prepareCloseoutForWeek:prepareCloseoutForWeek,
    open:openModal,
    setTab:setTab
  };

  window.HBNFIncomingTagMap=function(root,date){const map=window.HBNFRoundTags.getMap(date);return map||((originalIncoming&&originalIncoming(root,date))||(originalBefore&&originalBefore(root,date))||{})};
  window.bagTagMapBeforeDate=function(root,date){const map=window.HBNFRoundTags.getMap(date);return map||((originalBefore&&originalBefore(root,date))||{})};
  window.selectedWeekTagMap=function(root,date){if(state.loaded&&text(date)===state.roundDate){const official=finalizedMap();if(official)return official;const p=projectThrough(getWeekSafe(),18);return p.projected||entryMap()}return originalSelected?originalSelected(root,date):{}};

  function init(){ensureStyles();ensureModal();ensureButton();loadRound(false);setInterval(ensureButton,1800)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
