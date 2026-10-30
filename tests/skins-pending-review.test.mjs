import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Extract the actual shipped sync helper code. This is a narrow source harness,
// not a substitute for native Supabase/PostgREST or physical iPhone acceptance.
const html=fs.readFileSync(new URL('../public/skins.html', import.meta.url),'utf8');
const start=html.indexOf('function getConfiguredSupabase()');
const end=html.indexOf('const qs=s=>');
assert(start>0&&end>start);
const extra=html.indexOf('const ctx={',end);const extraEnd=html.indexOf('function preserveStaleLocalSkinsDraft',extra);assert(extra>0&&extraEnd>extra);const pushStart=html.indexOf('function push(){',extraEnd);const pushEnd=html.indexOf('function parseLines',pushStart);assert(pushStart>0&&pushEnd>pushStart);const source=html.slice(start,end)+'\n'+html.slice(extra,extraEnd)+'\n'+html.slice(pushStart,pushEnd);
const state=(winner='')=>({activeWeek:'2099-01-06',weeks:{'2099-01-06':{front:{cards:[{id:'card_1',name:'Card 1',playersText:'A\nB',winners:winner?{'1':winner}:{}}],aceWinner:''},back:{cards:[{id:'card_1',name:'Card 1',teamsText:'',winners:{}}],aceWinner:''},finalized:false,tagExchangeExceptions:{}}},deletedWeeks:{},restoredWeeks:{}});
const clone=v=>structuredClone(v);
function storage(previous){const data=previous??new Map();return {data,failKey:null,getItem:k=>data.has(k)?data.get(k):null,setItem(k,v){if(k===this.failKey)throw new Error('quota');data.set(k,String(v))},removeItem(k){data.delete(k)}}}
function backend(){return {row:{id:1,state_json:{skins:state()},updated_at:'rev-1'},writes:0,readError:false,readbackError:false,readbackErrorOnce:false,reads:0,interceptWrite:null,select(){this.reads++;if(this.readError)return {error:{code:'NETWORK',message:'503'}};if(this.readbackError&&this.writes>0)return {error:{code:'NETWORK',message:'522'}};if(this.readbackErrorOnce&&this.writes>0){this.readbackErrorOnce=false;return {error:{code:'NETWORK',message:'522'}}}return {data:clone(this.row),error:null}}}
}
function client(b){return {from(name){assert.equal(name,'league_state');return {select(){return this},eq(){return this},single(){return Promise.resolve(b.select())}}},async rpc(name,args){assert.equal(name,'hbnf_save_league_state_v1');if(b.interceptWrite)b.interceptWrite(b);if(args.p_expected_updated_at!==b.row.updated_at)return {data:[],error:null};b.row={id:1,state_json:clone(args.p_state_json),updated_at:`rev-${++b.writes+1}`};return {data:[clone(b.row)],error:null}},channel(){return {on(){return this},subscribe(){return this}}}}}
function open(b,s){const label={textContent:''},alert={textContent:'',hidden:true};const context=vm.createContext({console:{error(){}},window:{APP_CONFIG:{SUPABASE_URL:'https://isolated.example',SUPABASE_ANON_KEY:'synthetic'},supabase:{createClient(){return client(b)}}},document:{querySelector(selector){return selector==='#syncAlert'?alert:label}},localStorage:s,setTimeout(fn){/* test drives scheduled writes explicitly */},clearTimeout(){},Date,JSON,Object,Array,String,Number,Boolean,Promise,Set});vm.runInContext(source,context);vm.runInContext(`ctx.normalize=(s)=>s;function saveLocal(){try{localStorage.setItem(ctx.localKey,JSON.stringify(ctx.state));ctx.localDraftStored=true;return true}catch(e){ctx.localDraftStored=false;return false}};function loadLocal(){try{return JSON.parse(localStorage.getItem(ctx.localKey)||'null')}catch{return null}};function renderAll(){}`,context);
return {label,alert,s,async init(){vm.runInContext(`ctx.state=loadLocal()||${JSON.stringify(state())};const pending=hbnfReadPendingDraft();if(pending){ctx.state=JSON.parse(JSON.stringify(pending.branchState));ctx.pendingBaseHash=pending.baseHash||'';ctx.localDirty=true;ctx.localEditedBeforeBaseline=true}`,context);await vm.runInContext('ctx.initSync()',context)},get:x=>vm.runInContext(x,context),set:(x,v)=>{context.testValue=clone(v);vm.runInContext(`${x}=testValue`,context)},exec:async x=>vm.runInContext(x,context)}
}
const PENDING='hbnf-sync-skins-pending-v1';
async function queuedDraft(b,s){const app=open(b,s);await app.init();app.set('ctx.state',state('card_1_p_0'));app.set('ctx.localDirty',true);app.get('hbnfWritePendingDraft()');app.get('saveLocal()');return app}

test('cold reopen preserves a pending winner when cloud is blank',async()=>{const b=backend(),s=storage();await queuedDraft(b,s);const next=open(b,s);await next.init();assert.equal(next.get("ctx.state.weeks['2099-01-06'].front.cards[0].winners['1']"),'card_1_p_0');assert.equal(next.get('ctx.localDirty'),true);assert.equal(b.writes,0);await next.exec('ctx.pushRoot()');assert.equal(b.row.state_json.skins.weeks['2099-01-06'].front.cards[0].winners['1'],'card_1_p_0');assert.equal(s.getItem(PENDING),null);assert.match(next.label.textContent,/Saved to cloud/)});
test('cloud outage leaves draft and pending marker after restart',async()=>{const b=backend(),s=storage();await queuedDraft(b,s);b.readError=true;const next=open(b,s);await next.init();assert(next.get('ctx.localDirty'));assert(s.getItem(PENDING));assert.equal(next.get("ctx.state.weeks['2099-01-06'].front.cards[0].winners['1']"),'card_1_p_0');assert.equal(b.writes,0);assert.doesNotMatch(next.label.textContent,/Saved to cloud/)});
test('conflicting cloud branch blocks overwrite but retains draft',async()=>{const b=backend(),s=storage();await queuedDraft(b,s);b.row.state_json.skins=state('card_1_p_1');b.row.updated_at='rev-external';const next=open(b,s);await next.init();assert(next.get('ctx.remoteConflictPending'));assert.equal(next.get("ctx.state.weeks['2099-01-06'].front.cards[0].winners['1']"),'card_1_p_0');await next.exec('ctx.pushRoot()');assert.equal(b.writes,0);assert(s.getItem(PENDING))});
test('zero-row CAS rejection keeps draft and does not overwrite competing write',async()=>{const b=backend(),s=storage();await queuedDraft(b,s);b.interceptWrite=b=>{b.row.updated_at='rev-other';b.interceptWrite=null};const app=open(b,s);await app.init();await app.exec('ctx.pushRoot()');assert(app.get('ctx.remoteConflictPending'));assert(s.getItem(PENDING));assert.equal(b.writes,0)});
test('successful update but failed independent readback is not Saved; later reopen confirms safely',async()=>{const b=backend(),s=storage();await queuedDraft(b,s);b.readbackErrorOnce=true;const app=open(b,s);await app.init();await app.exec('ctx.pushRoot()');assert.equal(b.writes,1);assert(s.getItem(PENDING));assert.doesNotMatch(app.label.textContent,/Saved to cloud/);const next=open(b,s);await next.init();assert.equal(next.get('ctx.localDirty'),false);assert.equal(s.getItem(PENDING),null);assert.equal(b.writes,1)});
test('two consecutive acknowledged edits persist, with pending cleared after each independent readback',async()=>{const b=backend(),s=storage();const app=open(b,s);await app.init();app.set('ctx.state',state('card_1_p_0'));app.get('hbnfWritePendingDraft()');app.get('saveLocal()');app.set('ctx.localDirty',true);await app.exec('ctx.pushRoot()');assert.equal(b.writes,1);assert.equal(s.getItem(PENDING),null);const second=state('card_1_p_0');second.weeks['2099-01-06'].front.cards[0].winners['2']='card_1_p_1';app.set('ctx.state',second);app.get('hbnfWritePendingDraft()');app.get('saveLocal()');app.set('ctx.localDirty',true);await app.exec('ctx.pushRoot()');assert.equal(b.writes,2);assert.equal(s.getItem(PENDING),null);assert.equal(Object.keys(b.row.state_json.skins.weeks['2099-01-06'].front.cards[0].winners).length,2)});
test('failed device pending marker write cannot masquerade as safe device backup',async()=>{const b=backend(),s=storage();s.failKey=PENDING;const app=open(b,s);await app.init();app.set('ctx.state',state('card_1_p_0'));app.get('push()');assert.equal(app.get('ctx.pendingMarkerStored'),false);assert.match(app.alert.textContent,/recovery draft unavailable/);assert.equal(s.getItem(PENDING),null)});

test('legacy unmarked scorecard is quarantined, not silently erased or auto-uploaded',async()=>{
 const b=backend(),s=storage();s.setItem('hbnf-sync-skins',JSON.stringify(state('card_1_p_0')));
 const app=open(b,s);await app.init();
 assert.equal(app.get("ctx.state.weeks['2099-01-06'].front.cards[0].winners['1']"),'card_1_p_0');
 assert.equal(app.get('ctx.remoteConflictPending'),true);
 assert.equal(app.get('ctx.pendingBaseHash'),'LEGACY-UNVERIFIED');
 assert.match(app.label.textContent,/Review needed/);
 assert(s.getItem(PENDING));
 await app.exec('ctx.pushRoot()');assert.equal(b.writes,0);
});
test('pending/error sync state is accessible outside closed More options menu',async()=>{
 const b=backend(),s=storage();await queuedDraft(b,s);b.readError=true;const app=open(b,s);await app.init();
 assert.equal(app.alert.hidden,false);assert.match(app.alert.textContent,/Cloud unavailable/);
});

test('protected legacy draft remains in conflict after repeated cold reopens',async()=>{
 const b=backend(),s=storage();s.setItem('hbnf-sync-skins',JSON.stringify(state('card_1_p_0')));
 const first=open(b,s);await first.init();
 const second=open(b,s);await second.init();
 assert.equal(second.get('ctx.pendingBaseHash'),'LEGACY-UNVERIFIED');assert(second.get('ctx.remoteConflictPending'));
 assert.equal(second.get("ctx.state.weeks['2099-01-06'].front.cards[0].winners['1']"),'card_1_p_0');
 assert.equal(b.writes,0);
});
test('independent readback preserves an unrelated back card and history fields',async()=>{
 const b=backend(),s=storage();b.row.state_json.skins.weeks['2099-01-06'].back.cards[0].teamsText='C / D';b.row.state_json.bagTags={manual:{Existing:4}};
 const app=open(b,s);await app.init();const edited=clone(b.row.state_json.skins);edited.weeks['2099-01-06'].front.cards[0].winners['1']='card_1_p_0';app.set('ctx.state',edited);app.get('push()');await app.exec('ctx.pushRoot()');
 assert.equal(b.row.state_json.skins.weeks['2099-01-06'].back.cards[0].teamsText,'C / D');
 assert.equal(b.row.state_json.bagTags.manual.Existing,4);assert.equal(s.getItem(PENDING),null);
});
