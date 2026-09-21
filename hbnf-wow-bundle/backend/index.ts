// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors,json,cleanText,clamp,bool,cleanHex,hexRgb,mqttRoundTrip,mqttRoundTripRetry,mqttPublish,mqttPublishFast,mqttPublishSequence,mqttOverlayText,holdMs,CURATED_PRESETS,SHOWS,LOOKS,ORGANIC_PRESETS,LOOK_META,LIBRARY_REVISION,FLOW_LIBRARY_REVISION,SOURCE_LIBRARY_REVISION,LIBRARY_URL,MQTT_HOST,NIGHT_DEFAULT,NIGHT_MAX,AUDIO_INPUT_LEVEL,TRANSITION_TENTHS,TRANSITION_STYLE,safeEventBrightness,anyBrightness,transformHostSafeLibrary,transformFlowLibrary,flowReady,expectedLibraryRevision,flowArm } from "./shared.ts";
import { chooseLive,packScores } from "./live.ts";
import { scoreboardPages,scoreboardHoldMs,blendFrames } from "./scoreboard.ts";
import { getTeaserOption } from "./teaser.ts";
import { getWowEvent,wowEventSelfTest } from "./wow_events.ts";
declare const EdgeRuntime:{waitUntil(p:Promise<unknown>):void};
const DB_READ_TIMEOUT_MS=7000;
const R2_COURSE_LIBRARY_REVISION="hbnf-r2-course-2026-09-20-v1",R3_WOW_LIBRARY_REVISION="hbnf-wow-r3-max-2026-09-21-v2",R2_COURSE_PLAYLIST=60,R2_COURSE_SCENES=[61,62,63,64,65,66,67,68],R3_WOW_SCENES=[61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88];
const R3_WOW_PROFILE_IX:Record<number,number>={61:96,62:216,63:56,64:16,65:176,66:216,67:136,68:176,69:56,70:16,71:136,72:176,73:16,74:216,75:56,76:176,77:16,78:136,79:216,80:16,81:176,82:136,83:56,84:176,85:216,86:16,87:136,88:176};
function courseScenes(control:any){return control?.library_revision===R3_WOW_LIBRARY_REVISION?R3_WOW_SCENES:R2_COURSE_SCENES;}
function courseRevision(control:any){return control?.library_revision===R3_WOW_LIBRARY_REVISION?R3_WOW_LIBRARY_REVISION:R2_COURSE_LIBRARY_REVISION;}
const boundedFetch=async(input:any,init:any={})=>{const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),DB_READ_TIMEOUT_MS);try{return await fetch(input,{...init,signal:ac.signal});}finally{clearTimeout(timer);}};
async function getSb(){const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});}
const fields="mode,auto_live,resume_preset,updated_at,last_auto_takeover_at,min_live_interval_seconds,library_revision,show_family,show_preset,last_live_overlay_kind,live_score_cursor,overlay_until,auto_cinematics,score_fingerprint,score_changed_at";
async function getControlState(sb:any){const{data,error}=await sb.from("hbnf_matrix_control_state").select(fields).eq("id",1).maybeSingle();if(error)throw error;return data??{mode:"event",auto_live:false,resume_preset:50,show_family:"field",show_preset:50,library_revision:null,last_live_overlay_kind:"ace",live_score_cursor:0,overlay_until:null,min_live_interval_seconds:240,auto_cinematics:true};}
async function setControlState(sb:any,patch:any){const body={...patch,updated_at:new Date().toISOString()};const{data,error}=await sb.from("hbnf_matrix_control_state").update(body).eq("id",1).select(fields).single();if(error)throw error;return data;}
async function liveInfo(sb:any){const{data,error}=await sb.from("league_state").select("state_json").eq("id",1).single();if(error)throw error;return chooseLive(data?.state_json??{});}
function setupRequired(control:any,telemetry:any=null){if([R2_COURSE_LIBRARY_REVISION,R3_WOW_LIBRARY_REVISION].includes(String(control?.library_revision??"")))return false;return control?.library_revision!==expectedLibraryRevision(telemetry);}
function visualResume(control:any){if(control?.mode==="off")return null;const p=Number(control?.resume_preset??control?.show_preset??0);return((p>=10&&p<=44)||(p>=50&&p<=55)||p===R2_COURSE_PLAYLIST||(p>=220&&p<=254))?p:null;}
function overlayBusy(control:any){return !!(control?.overlay_until&&new Date(control.overlay_until).getTime()>Date.now());}
async function currentBrightness(safe=true){const rt=await mqttRoundTrip(undefined,null,1400);const raw=rt?.telemetry?.brightness;return safe?safeEventBrightness(raw):anyBrightness(raw);}
function baseLayer(){return{id:1,start:0,stop:32,startY:0,stopY:16,on:true,sel:true,bri:1,fx:0,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false};}
function flowLookSeg(preset:number){
 const m=LOOK_META[preset];if(!m)throw new Error(`Unknown Flow look ${preset}.`);
 return{id:0,start:0,stop:32,startY:0,stopY:16,on:true,sel:true,bri:m.bri,fx:m.fx,sx:m.sx,ix:m.ix,pal:0,c1:128,c2:128,c3:16,o1:false,o2:false,o3:false,bm:0,col:[m.color,[0,0,0],[0,0,0]],frz:false};
}
async function flowPrimeShow(s:any){
 const first=Number(s?.looks?.[0]);if(!LOOK_META[first])throw new Error("Show has no valid first look.");
 return await mqttRoundTripRetry({on:false,seg:[{id:3,stop:0},{id:2,stop:0},flowLookSeg(first),baseLayer()]},{brightness:0,effect:LOOK_META[first].fx,playlistActive:0,color:LOOK_META[first].color},2600,3);
}
function cardPixelSeg(bri=1){return{id:3,start:0,stop:32,startY:0,stopY:16,on:true,sel:false,bri,fx:0,pal:0,bm:2,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false,n:""};}
function cardTextSeg(text:string,color:number[],bri=1){return{id:3,start:0,stop:32,startY:0,stopY:16,on:true,sel:false,bri,fx:122,sx:230,ix:128,c1:0,c2:0,c3:16,o1:false,o2:true,o3:false,bm:2,pal:0,col:[color,[0,0,0],[0,0,0]],frz:false,n:cleanText(text,63)};}
const BLANK_FRAME=Array(512).fill("000000"),CARD_TT=3;
async function resumeVisualDirect(sb:any,fallbackPreset:number|null,brightness:number){
 const latest=await getControlState(sb);if(latest?.mode==="off")return false;const rp=visualResume(latest)??fallbackPreset;if(rp===null)return false;const b=Math.max(1,Math.min(NIGHT_MAX,Math.round(brightness||8)));
 if(rp>=220){await mqttPublishSequence([{payload:{on:true,bri:b,tt:0,bs:0,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},seg:[{id:0,on:true,sel:true,bri:64,fx:rp,sx:128,ix:128,pal:0},baseLayer()]},delayAfterMs:140}],5000);return true;} await mqttPublishSequence([{payload:{on:true,bri:b,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps:rp,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}},delayAfterMs:TRANSITION_TENTHS*110}],5000);return true;
}
async function resumeUnderCard(sb:any,fallbackPreset:number|null,brightness:number){
 const latest=await getControlState(sb);if(latest?.mode==="off"){await mqttPublish({seg:{id:3,on:false,bri:0,n:"",sel:false}}).catch(()=>{});return false;}
 const rp=visualResume(latest)??fallbackPreset;if(rp===null)return false;const b=Math.max(1,Math.min(NIGHT_MAX,Math.round(brightness||8)));
 if(rp>=220){await mqttPublishSequence([
  {payload:{seg:{id:3,bm:0,bri:255}},delayAfterMs:40},
  {payload:{on:true,bri:b,tt:0,bs:0,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},seg:[{id:0,on:true,sel:true,bri:64,fx:rp,sx:128,ix:128,pal:0},baseLayer()]},delayAfterMs:120},
  {payload:{tt:0,bs:0,seg:{id:3,bm:2,bri:255}},delayAfterMs:30},
  {payload:{tt:CARD_TT,bs:0,seg:[{id:0,on:true,bri:64},{id:3,bri:1,bm:2}]},delayAfterMs:CARD_TT*110},
  {payload:{seg:{id:3,on:false,bri:0,n:"",sel:false}},delayAfterMs:60}
 ],5000);return true;}
 const fam=String(latest?.show_family??""),look=rp>=50&&rp<=55?Number(SHOWS[fam]?.looks?.[0]??40):rp,target=Math.max(1,Math.min(255,Number(LOOK_META[look]?.bri??64)));
 await mqttPublishSequence([
  {payload:{seg:{id:3,bm:0,bri:255}},delayAfterMs:40},
  {payload:{on:true,bri:b,tt:0,bs:0,ps:rp,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}},delayAfterMs:120},
  {payload:{tt:0,bs:0,seg:{id:0,on:true,bri:1}},delayAfterMs:40},
  {payload:{tt:0,bs:0,seg:{id:3,bm:2,bri:255}},delayAfterMs:30},
  {payload:{tt:CARD_TT,bs:0,seg:[{id:0,on:true,bri:target},{id:3,bri:1,bm:2}]},delayAfterMs:CARD_TT*110},
  {payload:{seg:{id:3,on:false,bri:0,n:"",sel:false}},delayAfterMs:60}
 ],5000);return true;
}
async function coordinatedOverlay(sb:any,text:string,resumePreset:number|null,color:number[]=[255,255,255]){
 const hold=holdMs(text),seconds=Math.ceil((hold+4500)/1000),until=new Date(Date.now()+seconds*1000).toISOString(),b=await currentBrightness(true);
 const{error}=await sb.from("hbnf_matrix_control_state").update({overlay_until:until}).eq("id",1);if(error)throw error;
 EdgeRuntime.waitUntil((async()=>{try{
  await mqttPublishSequence([
   {payload:{on:true,bri:b,tt:0,bs:0,seg:cardTextSeg(text,color,1)},delayAfterMs:100},
   {payload:{tt:CARD_TT,bs:0,seg:[{id:0,on:false},{id:3,bri:255,bm:2}]},delayAfterMs:CARD_TT*110},
   {payload:{tt:0,bs:0,seg:{id:0,on:false,bri:0,fx:0}},delayAfterMs:60}
  ],3500);
  await wait(hold);
  await resumeUnderCard(sb,resumePreset,b);
 }catch(e){console.error("card overlay failed",e);try{await resumeUnderCard(sb,resumePreset,b);}catch{}}
 finally{try{await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);}catch{}}
 })());return{until,seconds};
}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const SAFE_DARK_PAYLOAD={on:false,"HBNFFlow":{"enabled":false},seg:[{id:3,stop:0},{id:2,stop:0},{id:0,on:true,bri:64,fx:0,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false},{id:1,on:true,bri:1,fx:0,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false}]};
function safeDarkTelemetry(t:any){const online=String(t?.status??"").toLowerCase()==="online"||(String(t?.status??"")===""&&!!t?.rawXml);return online&&Number(t?.brightness)===0&&Number(t?.playlistActive)===0&&Number(t?.effect)===0&&Array.isArray(t?.color)&&t.color.length>=3&&Number(t.color[0])===0&&Number(t.color[1])===0&&Number(t.color[2])===0;}
async function forceSafeDark(sb:any,reason:string){
 let first:any=null,final:any=null,probe:any=null,control:any=null;
 try{control=await setControlState(sb,{mode:"off",auto_live:false,overlay_until:null});}catch(e){console.error("fail-safe control-state preemption failed",reason,e);}
 try{first=await mqttRoundTripRetry(SAFE_DARK_PAYLOAD,{brightness:0,playlistActive:0,effect:0,color:[0,0,0]},2400,2);}catch(e){first={ok:false,confirmed:false,error:e instanceof Error?e.message:String(e)};}
 await wait(450);
 try{final=await mqttRoundTripRetry(SAFE_DARK_PAYLOAD,{brightness:0,playlistActive:0,effect:0,color:[0,0,0]},2400,2);}catch(e){final={ok:false,confirmed:false,error:e instanceof Error?e.message:String(e)};}
 let deviceSafe=safeDarkTelemetry(final?.freshTelemetry)||safeDarkTelemetry(final?.telemetry);
 if(!deviceSafe){
  try{await mqttPublish(SAFE_DARK_PAYLOAD,2,100);}catch{}
  try{probe=await mqttRoundTrip(undefined,null,1800);deviceSafe=safeDarkTelemetry(probe?.telemetry);}catch{}
 }
 return{reason,safe:deviceSafe&&!!control,deviceSafe,controlUpdated:!!control,first,final,probe,control};
}
async function commitVisibleControl(sb:any,patch:any,reason:string){
 try{return{ok:true,control:await setControlState(sb,patch),failSafe:null,error:null};}
 catch(e){console.error("visible control commit failed",reason,e);const failSafe=await forceSafeDark(sb,reason);return{ok:false,control:failSafe.control,failSafe,error:e instanceof Error?e.message:String(e)};}
}
async function scoreboardOwned(sb:any){const c=await getControlState(sb);return c?.mode!=="off"&&!!(c?.overlay_until&&new Date(c.overlay_until).getTime()>Date.now());}
async function crossfadeFrames(from:string[],to:string[]){const bridge=blendFrames(from,to,1)[0];await mqttPublishSequence([{payload:{seg:{id:3,i:[0,...bridge]}},delayAfterMs:35},{payload:{seg:{id:3,i:[0,...to]}},delayAfterMs:25}],2500);}
async function coordinatedScoreboard(sb:any,live:any,resumePreset:number|null,repeats=1){
 const pages=scoreboardPages(live?.entries??[]);if(!pages.length)throw new Error("No scores are available yet.");
 const reps=Math.max(1,Math.min(3,Math.round(Number(repeats)||1))),seconds=Math.max(22,10+pages.length*4*reps),until=new Date(Date.now()+seconds*1000).toISOString(),b=await currentBrightness(true);
 const{error}=await sb.from("hbnf_matrix_control_state").update({overlay_until:until}).eq("id",1);if(error)throw error;
 EdgeRuntime.waitUntil((async()=>{try{
  if(!await scoreboardOwned(sb))return;
  const first=pages[0].pixels;
  await mqttPublishSequence([
   {payload:{on:true,bri:b,tt:0,bs:0,seg:cardPixelSeg(1)},delayAfterMs:80},
   {payload:{seg:{id:3,i:[0,...first]}},delayAfterMs:70},
   {payload:{tt:CARD_TT,bs:0,seg:[{id:0,on:false},{id:3,bri:255,bm:2}]},delayAfterMs:CARD_TT*110},
   {payload:{tt:0,bs:0,seg:{id:0,on:false,bri:0,fx:0}},delayAfterMs:50}
  ],3500);
  let current=first;await wait(2500);
  for(let cycle=0;cycle<reps;cycle++){
   const startIndex=cycle===0?1:0;
   for(let i=startIndex;i<pages.length;i++){
    if(!await scoreboardOwned(sb))return;const next=pages[i].pixels;await crossfadeFrames(current,next);current=next;await wait(2500);
   }
  }
  if(!await scoreboardOwned(sb))return;
  await resumeUnderCard(sb,resumePreset,b);
 }catch(e){console.error("scoreboard card sequence failed",e);try{await resumeUnderCard(sb,resumePreset,b);}catch{}}
 finally{try{await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);}catch{}}
 })());
 return{until,seconds,pages:pages.length,repeats:reps,layout:pages.map((p:any)=>p.items.map((x:any)=>({code:x.code,score:x.score,name:x.name})))};
}

async function coordinatedWowEvent(sb:any,kind:string,resumePreset:number|null){
 const event=getWowEvent(kind);if(!event)throw new Error("Unknown WOW event.");
 const seconds=Math.ceil((event.frames.length*event.frameMs+event.holdMs+5000)/1000),until=new Date(Date.now()+seconds*1000).toISOString(),b=await currentBrightness(true);
 const{error}=await sb.from("hbnf_matrix_control_state").update({overlay_until:until}).eq("id",1);if(error)throw error;
 EdgeRuntime.waitUntil((async()=>{try{
  if(!await scoreboardOwned(sb))return;
  const first=event.frames[0];
  await mqttPublishSequence([
   {payload:{on:true,bri:b,tt:0,bs:0,seg:cardPixelSeg(1)},delayAfterMs:70},
   {payload:{seg:{id:3,i:[0,...first]}},delayAfterMs:event.frameMs},
   {payload:{tt:CARD_TT,bs:0,seg:[{id:0,on:false},{id:3,bri:255,bm:2}]},delayAfterMs:CARD_TT*110},
   {payload:{tt:0,bs:0,seg:{id:0,on:false,bri:0,fx:0}},delayAfterMs:35}
  ],3500);
  for(let i=1;i<event.frames.length;i++){if(!await scoreboardOwned(sb))return;await mqttPublish({seg:{id:3,i:[0,...event.frames[i]]}},1,0);await wait(event.frameMs);}
  if(!await scoreboardOwned(sb))return;
  await mqttPublish({seg:cardTextSeg(event.text,event.color,255)},1,0);await wait(110+event.holdMs);
  if(!await scoreboardOwned(sb))return;
  await resumeUnderCard(sb,resumePreset,b);
 }catch(e){console.error("WOW event sequence failed",e);try{await resumeUnderCard(sb,resumePreset,b);}catch{}}
 finally{try{await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);}catch{}}
 })());
 return{until,seconds,kind:event.kind,text:event.text,frames:event.frames.length};
}

async function flowRuntime(){const rt=await mqttRoundTrip(undefined,null,1800);return{rt,ready:flowReady(rt?.telemetry)};}
const FLOW_EPHEMERAL_SEG=2;
function flowTextSeg(text:string,color:number[]=[255,255,255]){return{id:FLOW_EPHEMERAL_SEG,start:0,stop:32,startY:0,stopY:16,on:true,bri:255,fx:122,sx:230,ix:128,c1:0,c2:0,c3:16,o1:false,o2:true,o3:false,bm:0,pal:0,col:[color,[0,0,0],[0,0,0]],sel:false,n:cleanText(text,63),frz:false};}
function flowPixelSeg(){return{id:FLOW_EPHEMERAL_SEG,start:0,stop:32,startY:0,stopY:16,on:true,bri:255,fx:0,sx:128,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],sel:false,frz:false};}
async function flowClearEphemeral(armMs=0){
 const seg=[{id:3,stop:0},{id:2,stop:0}],first=armMs>0?{...flowArm(armMs),seg}:{seg};
 await mqttPublish(first,1,0);await wait(80);await mqttPublish({seg},1,0);
}
async function flowResumeOwnedShow(sb:any,brightness:number){
 for(let attempt=1;attempt<=3;attempt++){
  const latest=await getControlState(sb);if(latest?.mode==="off")return false;
  const rp=visualResume(latest);if(rp===null)return false;
  const b=Math.max(1,Math.min(NIGHT_MAX,Math.round(brightness||8))),fam=String(latest?.show_family??""),show=SHOWS[fam];
  let payload:any,expected:any;
  if(show&&rp===show.playlist){payload={on:true,bri:b,ps:rp,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,...flowArm(500)};expected={playlistActive:1,brightness:b};}
  else{payload={on:true,bri:b,ps:rp,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,...flowArm(500)};expected={preset:rp,brightness:b};}
  const rt=await mqttRoundTrip(payload,expected,3400);
  if(rt.confirmed)return true;
  if(attempt<3)await wait(120);
 }
 return false;
}
async function flowOverlay(sb:any,text:string,color:number[]=[255,255,255],armMs=120){
 const hold=holdMs(text),seconds=Math.ceil((hold+12000)/1000),until=new Date(Date.now()+seconds*1000).toISOString(),b=await currentBrightness(true);
 const{error}=await sb.from("hbnf_matrix_control_state").update({overlay_until:until}).eq("id",1);if(error)throw error;
 try{
  await flowClearEphemeral();await wait(50);
  const started=await mqttRoundTripRetry({...flowArm(armMs),seg:flowTextSeg(text,color)},{playlistActive:0,brightness:b},2800,3);
  if(!started.confirmed)throw new Error("Text overlay publish was not freshly confirmed by WLED.");
 }catch(e){
  console.error("flow overlay start failed",e);
  const fs=await forceSafeDark(sb,"flow_overlay_start_failed");
  throw new Error(`Flow text start failed; fail-safe dark ${fs.safe?"confirmed":"could not be fully confirmed"}.`);
 }
 EdgeRuntime.waitUntil((async()=>{try{
  await wait(hold);
  if(!await scoreboardOwned(sb))return;
  const resumed=await flowResumeOwnedShow(sb,b);
  if(!resumed){const latest=await getControlState(sb).catch(()=>null);if(latest?.mode!=="off")await forceSafeDark(sb,"flow_overlay_resume_unconfirmed");return;}
  if(!await scoreboardOwned(sb))return;
  await flowClearEphemeral(150);
 }catch(e){console.error("flow overlay continuation failed",e);await forceSafeDark(sb,"flow_overlay_continuation_failed");}
 finally{try{await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);}catch{}}
 })());
 return{until,seconds};
}
async function flowScoreboard(sb:any,live:any,repeats=1){
 const pages=scoreboardPages(live?.entries??[]);if(!pages.length)throw new Error("No scores are available yet.");
 const reps=Math.max(1,Math.min(3,Math.round(Number(repeats)||1))),seconds=Math.max(18,5+pages.length*3*reps),until=new Date(Date.now()+seconds*1000).toISOString(),b=await currentBrightness(true);
 const{error}=await sb.from("hbnf_matrix_control_state").update({overlay_until:until}).eq("id",1);if(error)throw error;
 const first=pages[0].pixels;
 try{
  if(!await scoreboardOwned(sb))throw new Error("Scoreboard ownership was lost before first page.");
  await flowClearEphemeral();await wait(50);
  const setup=await mqttRoundTripRetry({...flowArm(120),seg:flowPixelSeg()},{playlistActive:0,brightness:b},2800,3);
  if(!setup.confirmed)throw new Error("Scoreboard pixel-host setup was not freshly confirmed by WLED.");
  await wait(40);
  const page1=await mqttRoundTripRetry({seg:{id:FLOW_EPHEMERAL_SEG,sx:129,i:[0,...first]}},{playlistActive:0,brightness:b},2400,3);
  if(!page1.confirmed)throw new Error("Scoreboard page 1 was not freshly acknowledged by WLED.");
 }catch(e){
  console.error("flow scoreboard start failed",e);
  const fs=await forceSafeDark(sb,"flow_scoreboard_start_failed");
  throw new Error(`Flow scoreboard start failed; fail-safe dark ${fs.safe?"confirmed":"could not be fully confirmed"}.`);
 }
 EdgeRuntime.waitUntil((async()=>{try{
  await wait(2500);
  for(let cycle=0;cycle<reps;cycle++){
   const startIndex=cycle===0?1:0;
   for(let i=startIndex;i<pages.length;i++){
    if(!await scoreboardOwned(sb))return;
    const next=pages[i].pixels,ordinal=cycle*pages.length+i,marker=ordinal%2===0?129:128;
    const page=await mqttRoundTripRetry({...flowArm(70),seg:{id:FLOW_EPHEMERAL_SEG,sx:marker,i:[0,...next]}},{playlistActive:0,brightness:b},2400,3);
    if(!page.confirmed)throw new Error(`Scoreboard page ${i+1} was not freshly acknowledged by WLED.`);
    await wait(2500);
   }
  }
  if(!await scoreboardOwned(sb))return;
  const resumed=await flowResumeOwnedShow(sb,b);
  if(!resumed){const latest=await getControlState(sb).catch(()=>null);if(latest?.mode!=="off")await forceSafeDark(sb,"flow_scoreboard_resume_unconfirmed");return;}
  if(!await scoreboardOwned(sb))return;
  await flowClearEphemeral(150);
 }catch(e){console.error("flow scoreboard continuation failed",e);await forceSafeDark(sb,"flow_scoreboard_continuation_failed");}
 finally{try{await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);}catch{}}
 })());
 return{until,seconds,pages:pages.length,repeats:reps,layout:pages.map((p:any)=>p.items.map((x:any)=>({code:x.code,score:x.score,name:x.name})))};
}
async function flowShowCommand(payload:any,expected:any,waitMs=3200){return await mqttRoundTripRetry({...payload,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,...flowArm(500)},expected,waitMs,3);}

async function installLibrary(sb:any,flow=false){
 const before=await getControlState(sb),pre=await mqttRoundTrip(undefined,null,1800),rawB=Number(pre?.telemetry?.brightness),wasOff=!Number.isFinite(rawB)||rawB<=0,installB=wasOff?1:safeEventBrightness(rawB),maintenanceB=wasOff?1:Math.min(2,installB);
 const libRes=await fetch(`${LIBRARY_URL}?rev=${encodeURIComponent(SOURCE_LIBRARY_REVISION)}&t=${Date.now()}`,{headers:{"Cache-Control":"no-cache"}});if(!libRes.ok)throw new Error(`Show library unavailable (${libRes.status}).`);
 const source=await libRes.json(),sourceRevision=String(source?._meta?.revision??"");if(![SOURCE_LIBRARY_REVISION,"hbnf-host-safe-2026-09-15-v3","hbnf-flow-2026-09-17-v9",LIBRARY_REVISION,FLOW_LIBRARY_REVISION].includes(sourceRevision))throw new Error(`Deployed show library source revision is unexpected (${sourceRevision||"missing"}).`);
 const all=flow?(sourceRevision===FLOW_LIBRARY_REVISION?source:transformFlowLibrary(source)):(sourceRevision===LIBRARY_REVISION?source:transformHostSafeLibrary(source));
 if(!wasOff)await mqttPublishSequence([{payload:{on:true,bri:maintenanceB,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE},delayAfterMs:TRANSITION_TENTHS*110}],4000);
 await mqttPublishSequence(Array.from({length:13},(_,i)=>({payload:{seg:{id:2+i,on:false,bri:0}},delayAfterMs:0})),12000);
 const visualIds=[...LOOKS,...ORGANIC_PRESETS,90],playlistIds=Object.values(SHOWS).map((x:any)=>x.playlist),steps:any[]=[],forbiddenTopLevel=new Set(["hw","if","wifi","led","nw","ap","mqtt"]);
 for(const id of visualIds){const base=structuredClone(all[String(id)]);if(!base)throw new Error(`Show library missing preset ${id}.`);if([...forbiddenTopLevel].some(k=>Object.prototype.hasOwnProperty.call(base,k)))throw new Error(`Preset ${id} contains forbidden configuration state.`);const segs=Array.isArray(base?.seg)?base.seg:[],segIds=segs.map((x:any)=>Number(x?.id)).sort((a:number,b:number)=>a-b);if(segIds.length!==2||segIds[0]!==0||segIds[1]!==1||segs.some((x:any)=>x?.sel!==true))throw new Error(`Preset ${id} is not LIVE-overlay-safe.`);steps.push({payload:{...base,on:true,bri:maintenanceB,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,psave:id,sb:true,ib:false,sc:true},delayAfterMs:220});}
 for(const id of playlistIds){const base=structuredClone(all[String(id)]);if(!base?.playlist||base?.o!==true||Array.isArray(base?.seg))throw new Error(`Show library playlist ${id} is not save-safe.`);steps.push({payload:{...base,psave:id},delayAfterMs:220});}
 await mqttPublishSequence(steps,38000);
 const family=SHOWS[String(before?.show_family)]?String(before.show_family):"field",show=SHOWS[family];
 await mqttPublishSequence([{payload:{on:true,bri:maintenanceB,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,seg:[{id:0,on:true,bri:1,fx:15,sx:164,ix:112,frz:false},baseLayer()]},delayAfterMs:TRANSITION_TENTHS*110}],4000);
 const verify=await mqttRoundTripRetry({on:true,bri:maintenanceB,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps:show.looks[0],"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}},{preset:show.looks[0],brightness:maintenanceB},4800,3);if(!verify.confirmed)throw new Error("WLED did not freshly confirm continuous preset after library install.");
 if(wasOff)await mqttPublish({on:false},2,100);else await mqttPublishSequence([{payload:{on:true,bri:maintenanceB,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps:show.playlist,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}},delayAfterMs:TRANSITION_TENTHS*110},{payload:{on:true,bri:installB,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE},delayAfterMs:TRANSITION_TENTHS*110}],6000);
 const control=await setControlState(sb,{library_revision:flow?FLOW_LIBRARY_REVISION:LIBRARY_REVISION,overlay_until:null});
 return{control,verify,installed:visualIds.length+playlistIds.length,preserved:{brightness:wasOff?0:installB,wasOff,family,playlist:show.playlist,mode:before?.mode,auto_live:before?.auto_live}};
}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method!=="POST")return json(req,{ok:false,error:"POST required"},405);try{const body=await req.json().catch(()=>({})),action=cleanText(body?.action,40).toLowerCase();let sb:any;try{sb=await getSb();}catch(e){return json(req,{ok:false,error:"Supabase client initialization failed",diagnostic:"The application could not initialize its bounded Supabase REST client.",service:"supabase-client",serverTime:new Date().toISOString()},503);}let control:any=null;
if(action==="status"){try{control=await getControlState(sb);}catch(e){return json(req,{ok:false,error:"control-state database read timed out or failed",diagnostic:"Supabase REST read for hbnf_matrix_control_state did not complete within the bounded application timeout.",service:"supabase-rest",serverTime:new Date().toISOString()},503);}const rt=await mqttRoundTrip(undefined,null,3000),lwt=String(rt.telemetry?.status??"").toLowerCase(),online=lwt==="online"||(lwt===""&&!!rt.telemetry?.rawXml),flow=flowReady(rt.telemetry),r3=control?.library_revision===R3_WOW_LIBRARY_REVISION,r2=control?.library_revision===R2_COURSE_LIBRARY_REVISION,expected=r3?R3_WOW_LIBRARY_REVISION:(r2?R2_COURSE_LIBRARY_REVISION:expectedLibraryRevision(rt.telemetry));return json(req,{...rt,control,online,onlineSignal:lwt?`lwt_${lwt}`:(online?"telemetry":"none"),freshVerified:false,broker:MQTT_HOST,flowReady:flow,renderEngine:r3?"r3-wow-max":(r2?"r2-animartrix-vibe":(flow?"local-flow":"legacy")),setupRequired:setupRequired(control,rt.telemetry),expectedLibraryRevision:expected,nightSafeMax:NIGHT_MAX,r2AudioStandard:AUDIO_INPUT_LEVEL,r2ScenePresetHardeningRequired:false,r3Wow:r3?{sceneCount:R3_WOW_SCENES.length,profiles:["bass","mid","balanced","treble","full","impact"],styles:["clean","punch","ring","spark","chroma","hybrid"],eventAnimations:["ace","ctp","nice_shot","nice_putt","skins","glow"],dropAccents:true}:null,serverTime:new Date().toISOString()});}
try{control=await getControlState(sb);}catch(e){return json(req,{ok:false,error:"control-state database read timed out or failed",diagnostic:"Supabase REST read for hbnf_matrix_control_state did not complete within the bounded application timeout.",service:"supabase-rest",serverTime:new Date().toISOString()},503);}
if(action==="r2_persist_audio255"){
 return json(req,{ok:false,error:"Deprecated: WLED playlist serialization does not persist AudioReactive.inputLevel or HBNFFlow state in preset60. Use the hardened R2 scene-preset release path instead.",inputLevelStandard:255,durable:false,control,action},409);
}
if(action==="r2_repair_playlist60"){
 return json(req,{ok:false,error:"Deprecated: playlist60 is now release-managed from the atomic R2/R3 filesystem bundle; remote preset saves are intentionally disabled.",control,action},409);
}
if(action==="release_preflight"){
 const rt=await mqttRoundTrip(undefined,null,2600),t=rt?.telemetry??{},statusText=String(t?.status??"").toLowerCase(),deviceOnline=statusText==="online";
 const currentRevision=String(control?.library_revision??"");
 const revisionRecognized=[R2_COURSE_LIBRARY_REVISION,R3_WOW_LIBRARY_REVISION].includes(currentRevision);
 const pixels=Number(t?.flow?.pixels),matrixOk=t?.flow?.matrixOk===true,brightness=Number(t?.brightness),playlistActive=Number(t?.playlistActive),preset=Number(t?.preset);
 const blockers:string[]=[];
 if(!revisionRecognized)blockers.push("backend_revision_unrecognized");
 if(!deviceOnline)blockers.push("mqtt_lwt_not_online");
 if(Number.isFinite(pixels)&&pixels!==512)blockers.push("telemetry_pixel_count_not_512");
 if(t?.flow&&t.flow.matrixOk===false)blockers.push("telemetry_matrix_not_ok");
 if(Number.isFinite(brightness)&&brightness>NIGHT_MAX)blockers.push("telemetry_brightness_above_night_cap");
 const ready=revisionRecognized&&deviceOnline&&blockers.length===0;
 return json(req,{ok:true,ready,blockers,action,mutationIssued:false,targetRelease:R3_WOW_LIBRARY_REVISION,targetSceneCount:R3_WOW_SCENES.length,supportedRevisions:[R2_COURSE_LIBRARY_REVISION,R3_WOW_LIBRARY_REVISION],currentRevision,revisionRecognized,canAdoptR3:true,deviceOnline,broker:MQTT_HOST,control,telemetryReadOnly:{status:t?.status??null,brightness:Number.isFinite(brightness)?brightness:null,playlistActive:Number.isFinite(playlistActive)?playlistActive:null,preset:Number.isFinite(preset)?preset:null,intensity:t?.intensity??null,pixels:Number.isFinite(pixels)?pixels:null,matrixOk:t?.flow?.matrixOk??null}});
}
if(action==="r3_adopt"){
 const rt=await mqttRoundTrip(undefined,null,3400),t=rt?.telemetry??{},online=String(t?.status??"").toLowerCase()==="online";
 const preset=Number(t?.preset),playlistActive=Number(t?.playlistActive),brightness=Number(t?.brightness);
 const intensity=Number(t?.intensity),deviceReady=online&&playlistActive===1&&R3_WOW_SCENES.includes(preset)&&R3_WOW_PROFILE_IX[preset]===intensity&&Number.isFinite(brightness)&&brightness>=1&&brightness<=NIGHT_MAX;
 if(!deviceReady)return json(req,{ok:false,error:"Controller is not presently running the verified WOW R3 playlist state; adoption refused.",deviceReady,telemetry:t,action},409);
 control=await setControlState(sb,{mode:bool(body?.live,false)?"event":"showcase",auto_live:bool(body?.live,false),resume_preset:R2_COURSE_PLAYLIST,show_family:"r2",show_preset:R2_COURSE_PLAYLIST,library_revision:R3_WOW_LIBRARY_REVISION,overlay_until:null,last_auto_takeover_at:null,live_score_cursor:0,last_live_overlay_kind:"ace"});
 return json(req,{ok:true,confirmed:true,adopted:true,deviceReady,control,telemetry:t,action,renderEngine:"r3-wow-max",sceneCount:R3_WOW_SCENES.length});
}
if(action==="r2_adopt"){
 const rt=await mqttRoundTrip(undefined,null,3400),t=rt?.telemetry??{},online=String(t?.status??"").toLowerCase()==="online";
 const preset=Number(t?.preset),playlistActive=Number(t?.playlistActive),brightness=Number(t?.brightness);
 const deviceReady=online&&playlistActive===1&&R2_COURSE_SCENES.includes(preset)&&Number.isFinite(brightness)&&brightness>=1&&brightness<=NIGHT_MAX;
 if(!deviceReady)return json(req,{ok:false,error:"Controller is not presently running the verified R2 Course playlist state; adoption refused.",deviceReady,telemetry:t,action},409);
 control=await setControlState(sb,{mode:bool(body?.live,false)?"event":"showcase",auto_live:bool(body?.live,false),resume_preset:R2_COURSE_PLAYLIST,show_family:"r2",show_preset:R2_COURSE_PLAYLIST,library_revision:R2_COURSE_LIBRARY_REVISION,overlay_until:null,last_auto_takeover_at:null,live_score_cursor:0,last_live_overlay_kind:"ace"});
 return json(req,{ok:true,confirmed:true,adopted:true,deviceReady,control,telemetry:t,action,renderEngine:control?.library_revision===R3_WOW_LIBRARY_REVISION?"r3-wow-max":"r2-animartrix-vibe"});
}
if(action==="health_check"||action==="field_test"){const before={mode:control?.mode,auto_live:control?.auto_live,resume_preset:control?.resume_preset,show_family:control?.show_family,show_preset:control?.show_preset};const status=await mqttRoundTrip(undefined,null,1800),base=anyBrightness(status?.telemetry?.brightness),test=Math.max(1,base===1?2:base-1);const down=await mqttRoundTripRetry({on:true,bri:test,tt:6,bs:TRANSITION_STYLE},{brightness:test},2600,3),up=await mqttRoundTripRetry({on:true,bri:base,tt:6,bs:TRANSITION_STYLE},{brightness:base},2600,3),after=await getControlState(sb),controlUnchanged=Object.entries(before).every(([k,v])=>after?.[k]===v),healthy=!!(down.ok&&down.published&&down.freshAck&&down.confirmed&&up.ok&&up.published&&up.freshAck&&up.confirmed&&controlUnchanged);return json(req,{ok:healthy,healthy,action,broker:MQTT_HOST,baseBrightness:base,testBrightness:test,down:{attempts:down.attempts,published:down.published,freshAck:down.freshAck,confirmed:down.confirmed,freshTelemetry:down.freshTelemetry},restore:{attempts:up.attempts,published:up.published,freshAck:up.freshAck,confirmed:up.confirmed,freshTelemetry:up.freshTelemetry},controlUnchanged,control:after},healthy?200:503);}
if(action==="install_library"){if(String(control?.show_family??"")==="r2"&&body?.forceLegacy!==true)return json(req,{ok:false,error:"R2 Course is active. Legacy show-library refresh is blocked unless forceLegacy=true.",action},409);const online=await mqttRoundTrip(undefined,null,2200);if(online.telemetry?.status!=="online"&&!online.telemetry?.rawXml)return json(req,{ok:false,error:"Matrix must be online before installing the HBNF show library."},409);const flow=flowReady(online.telemetry),out=await installLibrary(sb,flow),revision=flow?FLOW_LIBRARY_REVISION:LIBRARY_REVISION;return json(req,{...out.verify,control:out.control,action,installed:out.installed,libraryRevision:revision,flowReady:flow,renderEngine:flow?"local-flow":"legacy",setupRequired:false});}
if(action==="stable_fallback"){
 if(control?.mode!=="off"){const dark=await forceSafeDark(sb,"stable_fallback_precondition");control=dark.control??control;if(!dark.deviceSafe)return json(req,{ok:false,error:"Could not establish safe dark before stable fallback.",failSafe:dark,control,action},503);}
 await mqttPublish({"HBNFFlow":{"enabled":false}},2,100);
 await wait(300);
 const out=await installLibrary(sb,false);
 const dark=await forceSafeDark(sb,"stable_fallback_complete");
 if(!dark.deviceSafe)return json(req,{ok:false,error:"Organic library installed but final safe-dark cleanup was not confirmed.",installed:out.installed,verify:out.verify,failSafe:dark,action},503);
 control=await setControlState(sb,{mode:"off",auto_live:false,overlay_until:null,library_revision:LIBRARY_REVISION,show_family:"field",show_preset:50,resume_preset:50});
 return json(req,{ok:true,action,mode:"native-organic",flowDisabledForRuntime:true,libraryRevision:LIBRARY_REVISION,installed:out.installed,verify:out.verify,finalDark:{deviceSafe:dark.deviceSafe},control});
}



const TEASER_TEXT_HOLD_MS=1800,TEASER_COUNTDOWN_HOLD_MS=400,TEASER_EFFECT_HOLD_MS=1200,TEASER_OPTION_LABEL_HOLD_MS=1400;
const TEASER_COPY=["GLOW DUBS","7PM"];
const TEASER_FONT_PROOF={
 "GLOW DUBS":{layout:"two centered native lines",lines:["GLOW","DUBS"],font:"WLED built-in console 6x8",fontControl:128,maxLineWidthPx:27},
 "7PM":{layout:"one centered native line",font:"WLED built-in 5x12",fontControl:255,maxLineWidthPx:17}
};
function nativeTextSeg(id:number,text:string,startY:number,stopY:number,fontControl:number,color:number[]=[255,255,255]){
 return{id,start:0,stop:32,startY,stopY,on:true,sel:false,bri:255,fx:122,sx:128,ix:128,pal:0,c1:0,c2:fontControl,c3:16,o1:false,o2:false,o3:false,bm:0,col:[color,[0,0,0],[0,0,0]],frz:false,n:text};
}
function teaserBlackBase(){return{id:0,start:0,stop:32,startY:0,stopY:16,on:true,sel:true,bri:255,fx:0,sx:128,ix:128,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false,n:""};}
function teaserTextSegments(text:string,color:number[]=[255,255,255]){
 if(text==="GLOW DUBS")return[teaserBlackBase(),{id:1,stop:0},nativeTextSeg(2,"GLOW",0,8,128,color),nativeTextSeg(3,"DUBS",8,16,128,color)];
 if(text==="7PM")return[teaserBlackBase(),{id:1,stop:0},nativeTextSeg(2,text,0,16,255,color),{id:3,stop:0}];
 if(/^OPTION [123]$/.test(text))return[teaserBlackBase(),{id:1,stop:0},nativeTextSeg(2,text,0,16,0,color),{id:3,stop:0}];
 throw new Error("Forbidden teaser copy: "+text);
}
function teaserCountdownSegments(text:string){return[teaserBlackBase(),{id:1,stop:0},nativeTextSeg(2,text,0,16,255,[255,255,255]),{id:3,stop:0}];}
function teaserLookSeg(look:number){
 const m=LOOK_META[look];if(!m)throw new Error("Unknown teaser look "+look);
 const paint:any={
  20:{pal:11,color:[215,0,255]},22:{pal:11,color:[255,0,190]},23:{pal:11,color:[255,30,150]},
  30:{pal:1,color:[255,75,0]},31:{pal:1,color:[255,30,0]},32:{pal:11,color:[255,0,110]},33:{pal:11,color:[255,70,0]},34:{pal:11,color:[255,220,0]},
  40:{pal:11,color:[145,255,0]},42:{pal:11,color:[255,0,210]},43:{pal:11,color:[255,40,130]}
 };
 const p=paint[look]||{pal:11,color:[255,0,180]};
 return{id:0,start:0,stop:32,startY:0,stopY:16,on:true,sel:true,bri:255,fx:m.fx,sx:m.sx,ix:m.ix,pal:p.pal,c1:128,c2:128,c3:16,o1:false,o2:false,o3:false,bm:0,col:[p.color,[0,0,0],[255,255,255]],frz:false,n:""};
}
function validateTeaserOption(o:any){const looks=[...o.visualA.looks,...o.visualB.looks];if(looks.length!==10||new Set(looks).size!==looks.length)throw new Error("Teaser variety invalid.");if(looks.some((n:number)=>n>=10&&n<=14))throw new Error("Audio-dependent teaser look.");if(looks.some((n:number)=>[21,24,41,44].includes(n)))throw new Error("Blue-dominant teaser look.");if(looks.some((n:number)=>!LOOK_META[n]))throw new Error("Unknown teaser look.");return looks.map((n:number)=>({look:n,name:LOOK_META[n].name,fx:LOOK_META[n].fx,holdMs:TEASER_EFFECT_HOLD_MS}));}
function teaserSnapshot(control:any){return{mode:control.mode,auto_live:control.auto_live,resume_preset:control.resume_preset,show_family:control.show_family,show_preset:control.show_preset,library_revision:control.library_revision,last_auto_takeover_at:control.last_auto_takeover_at,min_live_interval_seconds:control.min_live_interval_seconds,last_live_overlay_kind:control.last_live_overlay_kind,live_score_cursor:control.live_score_cursor,auto_cinematics:control.auto_cinematics,score_fingerprint:control.score_fingerprint,score_changed_at:control.score_changed_at};}

if(action==="teaser_validate"){
 const options=[1,2,3].map(id=>{const o=getTeaserOption(id);return{id:o.id,slug:o.slug,name:o.name,style:o.style,sequence:validateTeaserOption(o),visualA:o.visualA,visualB:o.visualB};});
 return json(req,{ok:true,action,renderPath:"native-wled-static-text + zero-transition blue-free direct native effects",timing:{effectHoldMs:TEASER_EFFECT_HOLD_MS,uniformEffects:true,textHoldMs:TEASER_TEXT_HOLD_MS,optionLabelHoldMs:TEASER_OPTION_LABEL_HOLD_MS,targetOptionRuntimeMs:3*TEASER_COUNTDOWN_HOLD_MS+2*TEASER_TEXT_HOLD_MS+10*TEASER_EFFECT_HOLD_MS},text:{copy:TEASER_COPY,holdMs:TEASER_TEXT_HOLD_MS,allEqual:true,background:"pure black",static:true,centered:true,fontProof:TEASER_FONT_PROOF,wledFirmwareBasis:"16.0.1 / 29b389df1c1aaec6ff53aea742d17063b985906c"},forbidden:{disc:true,basket:true,aceCopy:true,scrollingText:true,customBitmapFont:true,extraCopy:true,busyTextBackground:true,audioDependentInterstitials:true},options,productionLibraryUntouched:true});
}
if(["teaser_install_local","teaser_preview_cached","teaser_preview_local","teaser_preview","teaser_review_all","text_legibility_test"].includes(action)){
 return json(req,{ok:false,action,error:"Retired teaser path. Native-only teaser_preview_native is the sole visible teaser action.",replacement:"teaser_preview_native"},410);
}
if(action==="teaser_preview_native"){
 if(control?.mode!=="off"||overlayBusy(control))return json(req,{ok:false,error:"Native teaser preview requires clean OFF state.",control,action},409);
 const id=Math.max(1,Math.min(3,Math.round(Number(body?.option)||1))),b=clamp(body?.brightness,1,NIGHT_MAX,42),o=getTeaserOption(id),sequence=validateTeaserOption(o);
 const totalMs=3*TEASER_COUNTDOWN_HOLD_MS+2*TEASER_TEXT_HOLD_MS+10*TEASER_EFFECT_HOLD_MS+500;
 const until=new Date(Date.now()+totalMs+5000).toISOString(),snapshot=teaserSnapshot(control);
 const probe=await mqttRoundTrip(undefined,null,1800);
 if(!safeDarkTelemetry(probe?.telemetry)){
  const dark=await forceSafeDark(sb,"teaser_native_preflight_not_dark");
  if(!dark.deviceSafe)return json(req,{ok:false,error:"Teaser preflight could not confirm safe-dark Matrix.",action,failSafe:dark},503);
 }
 control=await setControlState(sb,{mode:"manual",auto_live:false,overlay_until:until});
 const apply=async(payload:any)=>{let last:any=null;for(let a=0;a<2;a++){try{await mqttPublishFast(payload);return;}catch(e){last=e;if(a===0)await wait(90);}}throw last??new Error("Teaser publish failed.");};
 const showText=async(text:string,color:number[])=>apply({on:true,bri:b,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:teaserTextSegments(text,color)});
 const showCountdown=async(text:string)=>apply({on:true,bri:b,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:teaserCountdownSegments(text)});
 const showVisual=async(look:number)=>apply({on:true,bri:b,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:[teaserLookSeg(look),{id:1,stop:0},{id:2,stop:0},{id:3,stop:0}]});
 const runVisual=async(v:any)=>{for(const look of v.looks){await showVisual(look);await wait(TEASER_EFFECT_HOLD_MS);}};
 EdgeRuntime.waitUntil((async()=>{let err:any=null;try{
  for(const n of ["3","2","1"]){await showCountdown(n);await wait(TEASER_COUNTDOWN_HOLD_MS);}
  await showText("GLOW DUBS",[255,255,255]);await wait(TEASER_TEXT_HOLD_MS);
  await runVisual(o.visualA);
  await showText("7PM",[38,230,255]);await wait(TEASER_TEXT_HOLD_MS);
  await runVisual(o.visualB);
 }catch(e){err=e;console.error("native teaser failed",e);}
 finally{try{await forceSafeDark(sb,err?"teaser_native_failed":"teaser_native_complete");}catch{}try{await setControlState(sb,{...snapshot,overlay_until:null});}catch{}}
 })());
 return json(req,{ok:true,action,option:{id:o.id,slug:o.slug,name:o.name,style:o.style},brightness:b,totalMs,endsAt:until,textHoldMs:TEASER_TEXT_HOLD_MS,textCards:TEASER_COPY,effectCount:sequence.length,effects:sequence,visualA:o.visualA,visualB:o.visualB,renderPath:"native-wled-static-centered-text + zero-transition-blue-free-effect-montage",safeRestore:"forced safe-dark then exact OFF snapshot restore"});
}

if(action==="teaser_review_native"){
 if(control?.mode!=="off"||overlayBusy(control))return json(req,{ok:false,error:"Teaser review requires clean OFF state.",control,action},409);
 const brightness=clamp(body?.brightness,1,NIGHT_MAX,42),opts=[1,2,3].map(getTeaserOption);
 opts.forEach(validateTeaserOption);
 const oneMs=3*TEASER_COUNTDOWN_HOLD_MS+2*TEASER_TEXT_HOLD_MS+10*TEASER_EFFECT_HOLD_MS;
 const totalMs=opts.length*(TEASER_OPTION_LABEL_HOLD_MS+oneMs)+700;
 const until=new Date(Date.now()+totalMs+5000).toISOString(),snapshot=teaserSnapshot(control);
 const probe=await mqttRoundTrip(undefined,null,1800);
 if(!safeDarkTelemetry(probe?.telemetry)){const dark=await forceSafeDark(sb,"teaser_review_preflight_not_dark");if(!dark.deviceSafe)return json(req,{ok:false,error:"Review preflight could not confirm safe-dark Matrix.",action,failSafe:dark},503);}
 control=await setControlState(sb,{mode:"manual",auto_live:false,overlay_until:until});
 const apply=async(payload:any)=>{let last:any=null;for(let a=0;a<2;a++){try{await mqttPublishFast(payload);return;}catch(e){last=e;if(a===0)await wait(80);}}throw last??new Error("Teaser review publish failed.");};
 const showText=async(text:string,color:number[])=>apply({on:true,bri:brightness,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:teaserTextSegments(text,color)});
 const showCountdown=async(text:string)=>apply({on:true,bri:brightness,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:teaserCountdownSegments(text)});
 const showLabel=async(n:number)=>apply({on:true,bri:brightness,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:teaserTextSegments("OPTION "+n,[255,255,255])});
 const showVisual=async(look:number)=>apply({on:true,bri:brightness,tt:0,bs:0,"HBNFFlow":{"enabled":false},seg:[teaserLookSeg(look),{id:1,stop:0},{id:2,stop:0},{id:3,stop:0}]});
 const runVisual=async(v:any)=>{for(const look of v.looks){await showVisual(look);await wait(TEASER_EFFECT_HOLD_MS);}};
 EdgeRuntime.waitUntil((async()=>{let err:any=null;try{
  for(let k=0;k<opts.length;k++){const o=opts[k];
   await showLabel(k+1);await wait(TEASER_OPTION_LABEL_HOLD_MS);
   for(const n of ["3","2","1"]){await showCountdown(n);await wait(TEASER_COUNTDOWN_HOLD_MS);}
   await showText("GLOW DUBS",[255,255,255]);await wait(TEASER_TEXT_HOLD_MS);
   await runVisual(o.visualA);
   await showText("7PM",[38,230,255]);await wait(TEASER_TEXT_HOLD_MS);
   await runVisual(o.visualB);
  }
 }catch(e){err=e;console.error("teaser review failed",e);}
 finally{try{await forceSafeDark(sb,err?"teaser_review_failed":"teaser_review_complete");}catch{}try{await setControlState(sb,{...snapshot,overlay_until:null});}catch{}}
 })());
 return json(req,{ok:true,action,brightness,totalMs,endsAt:until,optionLabelHoldMs:TEASER_OPTION_LABEL_HOLD_MS,effectHoldMs:TEASER_EFFECT_HOLD_MS,uniformEffects:true,options:opts.map((o:any)=>({id:o.id,name:o.name,effects:validateTeaserOption(o)})),safeRestore:"forced safe-dark then exact OFF snapshot restore"});
}
if(![LIBRARY_REVISION,FLOW_LIBRARY_REVISION,R2_COURSE_LIBRARY_REVISION,R3_WOW_LIBRARY_REVISION].includes(String(control?.library_revision??""))&&!["brightness","blackout","effect","night_safe","status","health_check","field_test","install_library","audio_profile","audio_sensitivity"].includes(action))return json(req,{ok:false,error:"HBNF show library setup required.",setupRequired:true,expectedLibraryRevision:LIBRARY_REVISION},409);
if(action==="night_safe"){
 if(control?.mode==="off")return json(req,{ok:true,confirmed:true,idempotent:true,control,action,requested:{enabled:true},note:"Matrix is already OFF; night_safe did not turn it on."});
 if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; night-safe brightness is locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 const current=await currentBrightness(false),next=current<=NIGHT_MAX?current:NIGHT_DEFAULT,rt=await mqttRoundTripRetry({on:true,bri:next,tt:6,bs:TRANSITION_STYLE},{brightness:next},2400,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"night_safe_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Night-safe brightness was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
 return json(req,{...rt,ok:true,control,action,requested:{enabled:true,brightness:next}});
}
if(action==="round_ready"){
 if(control?.mode!=="off"&&overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; Round Ready is locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 if(String(control?.show_family??"")==="r2"){
  const live=await liveInfo(sb),status=await mqttRoundTrip(undefined,null,1800),b=safeEventBrightness(status?.telemetry?.brightness);
  const rt=await mqttRoundTripRetry({on:true,bri:b,tt:0,bs:0,ps:R2_COURSE_PLAYLIST,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},"HBNFFlow":{"enabled":false}},{playlistActive:1,presetIn:courseScenes(control),brightness:b},4200,3);
  if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"r2_course_round_ready_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,ready:false,error:"R2 Course Round Ready was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
  const committed=await commitVisibleControl(sb,{mode:"event",auto_live:true,resume_preset:R2_COURSE_PLAYLIST,show_family:"r2",show_preset:R2_COURSE_PLAYLIST,library_revision:courseRevision(control),last_auto_takeover_at:null,overlay_until:null,live_score_cursor:0,last_live_overlay_kind:"ace",min_live_interval_seconds:240},"r2_course_round_ready_commit_failed");
  if(!committed.ok){control=committed.control??control;return json(req,{...rt,ok:false,ready:false,error:"R2 Course Round Ready confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action},503);}
  control=committed.control;const intro=live.active?("HBNF LIVE | "+live.label):"HBNF LIVE | READY";let introOverlay=null;if(body?.intro!==false)introOverlay=await coordinatedOverlay(sb,intro,R2_COURSE_PLAYLIST);
  return json(req,{ok:true,ready:true,action,broker:MQTT_HOST,healthVerified:true,showVerified:true,roundActive:live.active,event:live.event??null,phase:live.label||null,scoreEntries:live.entries?.length??0,acePot:live.acePot??null,intro,introOverlay,control,renderEngine:"r2-animartrix-vibe"});
 }
 const before=control,wasOff=control?.mode==="off",live=await liveInfo(sb),family=SHOWS[String(control?.show_family)]?String(control.show_family):"field",s=SHOWS[family],runtime=await flowRuntime(),telemetry=runtime?.rt?.telemetry??{},safeBase=safeEventBrightness(telemetry?.brightness),native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION;
 if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_round_ready");control=failSafe.control??control;return json(req,{ok:false,ready:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}
 let prime:any=null;
 if(wasOff){try{control=await setControlState(sb,{mode:"manual",auto_live:false,overlay_until:null});}catch(e){return json(req,{ok:false,ready:false,error:"Could not claim Matrix startup ownership.",action},503);}}
 if(native&&(wasOff||Number(telemetry?.brightness)===0)){
  prime=await flowPrimeShow(s);
  if(!prime?.confirmed){const failSafe=await forceSafeDark(sb,"round_ready_dark_prime_unconfirmed");control=failSafe.control??control;return json(req,{...prime,ok:false,ready:false,error:"Dark LIVE staging was not freshly confirmed; fail-safe dark was issued and visible start was not attempted.",failSafe,control,action},503);}
 }
 const rt=native?await flowShowCommand({on:true,bri:safeBase,ps:s.playlist,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}},{playlistActive:1,brightness:safeBase},3400):await mqttRoundTripRetry({on:true,bri:safeBase,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps:s.playlist,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},"HBNFFlow":{"enabled":false}},{playlistActive:1,brightness:safeBase},3400,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"round_ready_show_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,ready:false,error:"LIVE show was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
 const committed=await commitVisibleControl(sb,{mode:"event",auto_live:true,resume_preset:s.playlist,show_family:family,show_preset:s.playlist,last_auto_takeover_at:null,overlay_until:null,live_score_cursor:0,last_live_overlay_kind:"ace",min_live_interval_seconds:240},"round_ready_control_commit_failed");
 if(!committed.ok){control=committed.control??before;return json(req,{...rt,ok:false,ready:false,error:"LIVE show confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action},503);}
 control=committed.control;
 const intro=live.active?`HBNF LIVE | ${live.label}`:"HBNF LIVE | READY";let introOverlay=null;
 if(body?.intro!==false)introOverlay=native?await flowOverlay(sb,intro):await coordinatedOverlay(sb,intro,s.playlist);
 return json(req,{ok:true,ready:true,action,broker:MQTT_HOST,healthVerified:true,showVerified:true,roundActive:live.active,event:live.event??null,phase:live.label||null,scoreEntries:live.entries?.length??0,acePot:live.acePot??null,intro,introOverlay,control,renderEngine:native?"local-flow":"legacy"});
}
if(action==="play_show"&&cleanText(body?.family,20).toLowerCase()==="r2"){
 if(control?.mode!=="off"&&overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; R2 show change is locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 const live=bool(body?.live,false),b=body?.brightness==null?8:clamp(body?.brightness,1,NIGHT_MAX,8),before=control;
 if(control?.mode==="off"){try{control=await setControlState(sb,{mode:"manual",auto_live:false,overlay_until:null});}catch(e){return json(req,{ok:false,error:"Could not claim Matrix startup ownership.",action,family:"r2"},503);}}
 const rt=await mqttRoundTripRetry({on:true,bri:b,tt:0,bs:0,ps:R2_COURSE_PLAYLIST,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},"HBNFFlow":{"enabled":false}},{playlistActive:1,presetIn:courseScenes(control),brightness:b},4200,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"r2_course_start_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"R2 Course playlist was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action,family:"r2"},503);}
 const committed=await commitVisibleControl(sb,{mode:live?"event":"showcase",auto_live:live,resume_preset:R2_COURSE_PLAYLIST,show_family:"r2",show_preset:R2_COURSE_PLAYLIST,library_revision:courseRevision(control),last_auto_takeover_at:null,overlay_until:null,live_score_cursor:0,last_live_overlay_kind:"ace",...(live?{min_live_interval_seconds:240}:{})},"r2_course_control_commit_failed");
 if(!committed.ok){control=committed.control??before;return json(req,{...rt,ok:false,error:"R2 Course confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action,family:"r2"},503);}
 control=committed.control;return json(req,{...rt,ok:true,confirmed:true,control,action,family:"r2",show:"R2 COURSE",live,requested:{preset:R2_COURSE_PLAYLIST,brightness:b},renderEngine:"r2-animartrix-vibe"});
}
if(action==="play_show"){const family=cleanText(body?.family,20).toLowerCase(),s=SHOWS[family];if(!s)return json(req,{ok:false,error:"Unknown show family."},400);if(control?.mode!=="off"&&overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; show changes are locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);const live=bool(body?.live,false),ps=s.playlist,wasOff=control?.mode==="off",runtime=await flowRuntime(),telemetry=runtime?.rt?.telemetry??{},explicitB=body?.brightness==null?null:clamp(body?.brightness,1,NIGHT_MAX,NIGHT_DEFAULT),b=explicitB??safeEventBrightness(telemetry?.brightness),native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION;if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_play_show");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}const statusOnline=String(telemetry?.status??"").toLowerCase()==="online",alreadyActive=control?.mode!=="off"&&String(control?.show_family??"")===family&&Number(control?.show_preset)===ps&&statusOnline&&Number(telemetry?.playlistActive)===1&&(Number(telemetry?.preset)===ps||s.looks.includes(Number(telemetry?.preset)))&&Number(telemetry?.brightness)===b;if(alreadyActive){control=await setControlState(sb,{mode:live?"event":"showcase",auto_live:live,resume_preset:ps,show_family:family,show_preset:ps,last_auto_takeover_at:null,overlay_until:null,live_score_cursor:0,last_live_overlay_kind:"ace",...(live?{min_live_interval_seconds:240}:{})});return json(req,{...runtime.rt,ok:true,confirmed:true,idempotent:true,control,action,family,show:s.name,live,requested:{preset:ps,brightness:b},acceptedAsPlaylist:true,renderEngine:native?"local-flow":"legacy"});}let prime:any=null;
if(wasOff){try{control=await setControlState(sb,{mode:"manual",auto_live:false,overlay_until:null});}catch(e){return json(req,{ok:false,error:"Could not claim Matrix startup ownership.",action,family,show:s.name,live},503);}}
if(native&&(wasOff||Number(telemetry?.brightness)===0)){
 prime=await flowPrimeShow(s);
 if(!prime?.confirmed){const failSafe=await forceSafeDark(sb,"play_show_dark_prime_unconfirmed");control=failSafe.control??control;return json(req,{...prime,ok:false,error:"Dark show staging was not freshly confirmed; fail-safe dark was issued and visible start was not attempted.",failSafe,control,action,family,show:s.name,live,requested:{preset:ps,brightness:b}},503);}
}
const rt=native?await flowShowCommand({on:true,bri:b,ps,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}},{playlistActive:1,brightness:b},3400):await mqttRoundTripRetry({on:true,bri:b,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},"HBNFFlow":{"enabled":false}},{playlistActive:1,brightness:b},3400,3);if(!rt.confirmed){
 const failSafe=await forceSafeDark(sb,"play_show_start_unconfirmed");control=failSafe.control??control;
 return json(req,{...rt,prime,ok:false,error:"Show command was not freshly confirmed; fail-safe dark was issued and mode was set OFF.",failSafe,control,action,family,show:s.name,live,requested:{preset:ps,brightness:b}},503);
}const committed=await commitVisibleControl(sb,{mode:live?"event":"showcase",auto_live:live,resume_preset:ps,show_family:family,show_preset:ps,last_auto_takeover_at:null,overlay_until:null,live_score_cursor:0,last_live_overlay_kind:"ace",...(live?{min_live_interval_seconds:240}:{})},"play_show_control_commit_failed");if(!committed.ok){control=committed.control??control;return json(req,{...rt,prime,ok:false,error:"Show confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action,family,show:s.name,live},503);}control=committed.control;return json(req,{...rt,prime,control,action,family,show:s.name,live,requested:{preset:ps,brightness:b},acceptedAsPlaylist:true,renderEngine:native?"local-flow":"legacy"});}
if(action==="next_look"){
 if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before advancing looks.",control,action},409);
 if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; Next Look is locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 const runtime=await flowRuntime();
 if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_next_look");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}
 const family=String(control?.show_family??"field"),b=await currentBrightness(true);
 if(family==="r2"){
  const rt=await mqttRoundTripRetry({np:true,bri:b,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},"HBNFFlow":{"enabled":false}},{playlistActive:1,presetIn:courseScenes(control),brightness:b},3800,3);
  if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"r2_course_next_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"R2 Next Look was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
  return json(req,{...rt,ok:true,confirmed:true,control,action,advancedPlaylist:true,renderEngine:"r2-animartrix-vibe"});
 }
 if(SHOWS[family]){
  const rt=await mqttRoundTripRetry({np:true,bri:b},{playlistActive:1,presetIn:SHOWS[family].looks,brightness:b},3500,3);
  if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"next_look_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Next Look was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
  return json(req,{...rt,control,action,advancedPlaylist:true});
 }
 const sequence=LOOKS,current=Number(control?.show_preset??0),idx=sequence.indexOf(current),next=idx<0?sequence[0]:sequence[(idx+1)%sequence.length],rt=await mqttRoundTripRetry({on:true,bri:b,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps:next},{preset:next,brightness:b},2800,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"next_manual_look_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Next look was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
 const committed=await commitVisibleControl(sb,{mode:"manual",auto_live:false,resume_preset:next,show_preset:next,show_family:"manual"},"next_look_control_commit_failed");if(!committed.ok){control=committed.control??control;return json(req,{...rt,ok:false,error:"Next look confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action},503);}control=committed.control;return json(req,{...rt,control,action,requested:{preset:next}});
}
if(action==="sanitize_overlay"){
 if(control?.mode!=="off")return json(req,{ok:false,error:"sanitize_overlay requires Matrix OFF.",control,action},409);
 const failSafe=await forceSafeDark(sb,"sanitize_overlay");control=failSafe.control??control;
 return json(req,{ok:failSafe.safe,confirmed:failSafe.safe,control,action,failSafe},failSafe.safe?200:503);
}
if(action==="blackout"){
 const failSafe=await forceSafeDark(sb,"blackout");control=failSafe.control??control;
 return json(req,{ok:failSafe.safe,confirmed:failSafe.safe,control,action,failSafe},failSafe.safe?200:503);
}
if(action==="brightness"){
 const advanced=bool(body?.advanced,false),hi=advanced?255:NIGHT_MAX,bri=clamp(body?.brightness,1,hi,NIGHT_DEFAULT);
 if(advanced&&bri>NIGHT_MAX&&body?.confirmHigh!==true)return json(req,{ok:false,error:"Brightness above 72 requires explicit confirmation.",confirmationRequired:true,requestedBrightness:bri},409);
 if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before changing brightness.",control,action},409);
 if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; brightness is locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 const family=String(control?.show_family??""),s=SHOWS[family],status=await mqttRoundTrip(undefined,null,1500);
 if(control?.library_revision===FLOW_LIBRARY_REVISION&&!flowReady(status?.telemetry)){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_brightness");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}
 let payload:any={on:true,bri,tt:6,bs:TRANSITION_STYLE},expected:any={brightness:bri},restoredShow=false;
 if(family==="r2"&&control?.mode!=="off"){const curPs=Number(status?.telemetry?.preset),curPlaylist=Number(status?.telemetry?.playlistActive),lost=curPlaylist!==1||!courseScenes(control).includes(curPs);if(lost){payload={on:true,bri,tt:0,bs:0,ps:R2_COURSE_PLAYLIST,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL},"HBNFFlow":{"enabled":false}};expected={playlistActive:1,presetIn:courseScenes(control),brightness:bri};restoredShow=true;}}
 if(s&&control?.mode!=="off"){const curPs=Number(status?.telemetry?.preset),curPlaylist=Number(status?.telemetry?.playlistActive),lost=curPlaylist!==1||!s.looks.includes(curPs);if(lost){payload={on:true,bri,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,...flowArm(500),ps:s.playlist,"AudioReactive":{"inputLevel":AUDIO_INPUT_LEVEL}};expected={playlistActive:1,presetIn:s.looks,brightness:bri};restoredShow=true;}}
 const rt=await mqttRoundTripRetry(payload,expected,3000,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"brightness_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Brightness change was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action,requested:{brightness:bri,advanced},restoredShow},503);}
 return json(req,{...rt,ok:true,control,action,requested:{brightness:bri,advanced},restoredShow});
}
if(action==="audio_profile"){const name=cleanText(body?.profile,20).toLowerCase(),profiles:any={quiet:255,course:255,loud:170};if(!(name in profiles))return json(req,{ok:false,error:"Unknown audio profile."},400);const level=profiles[name];await mqttPublish({"AudioReactive":{"inputLevel":level}},2,100);return json(req,{ok:true,control,action,profile:name,inputLevel:level,published:true});}
if(action==="audio_sensitivity"){const level=clamp(body?.level,64,255,AUDIO_INPUT_LEVEL);await mqttPublish({"AudioReactive":{"inputLevel":level}},2,100);return json(req,{ok:true,control,action,requested:{inputLevel:level},published:true});}
if(action==="preset"){
 if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before selecting a look.",control,action},409);
 if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; preset changes are locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 const ps=clamp(body?.preset,0,250,40);if(!CURATED_PRESETS.has(ps)||ps>=50)return json(req,{ok:false,error:"Preset is not an individual HBNF look."},400);
 const b=await currentBrightness(true),runtime=await flowRuntime(),native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION;
 if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_preset");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}
 const rt=native?await flowShowCommand({on:true,bri:b,ps},{preset:ps,brightness:b},2800):await mqttRoundTripRetry({on:true,bri:b,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps},{preset:ps,brightness:b},2800,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"preset_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Preset was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action,requested:{preset:ps}},503);}
 const committed=await commitVisibleControl(sb,{mode:"manual",auto_live:false,resume_preset:ps,show_preset:ps,show_family:"manual"},"preset_control_commit_failed");if(!committed.ok){control=committed.control??control;return json(req,{...rt,ok:false,error:"Preset confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action},503);}control=committed.control;return json(req,{...rt,control,action,requested:{preset:ps}});
}
if(action==="random_showcase"){
 if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before selecting a random look.",control,action},409);
 if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; visual changes are locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);
 const next=LOOKS[Math.floor(Math.random()*LOOKS.length)],b=await currentBrightness(true),runtime=await flowRuntime(),native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION;
 if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_random_showcase");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}
 const rt=native?await flowShowCommand({on:true,bri:b,ps:next},{preset:next,brightness:b},2800):await mqttRoundTripRetry({on:true,bri:b,tt:TRANSITION_TENTHS,bs:TRANSITION_STYLE,ps:next},{preset:next,brightness:b},2800,3);
 if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"random_showcase_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Random look was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}
 const committed=await commitVisibleControl(sb,{mode:"manual",auto_live:false,resume_preset:next,show_preset:next,show_family:"manual"},"random_showcase_control_commit_failed");
 if(!committed.ok){control=committed.control??control;return json(req,{...rt,ok:false,error:"Random look confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action},503);}
 control=committed.control;return json(req,{...rt,control,action,requested:{preset:next},renderEngine:native?"local-flow":"legacy"});
}
if(action==="effect"){if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before changing effects.",control,action},409);if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; effect changes are locked until it finishes or BLACKOUT is used.",overlayUntil:control.overlay_until},409);const fx=clamp(body?.effect,0,254,198),sx=clamp(body?.speed,0,255,128),ix=clamp(body?.intensity,0,255,128),pal=clamp(body?.palette,0,255,0),seg:any={id:0,on:true,sel:true,fx,fxdef:bool(body?.loadDefaults,false),sx,ix,pal};for(const key of["c1","c2"]){if(body?.[key]!==undefined)seg[key]=clamp(body[key],0,255,128);}if(body?.c3!==undefined)seg.c3=clamp(body.c3,0,31,16);for(const key of["o1","o2","o3","rev","mi","rY","mY","tp"]){if(body?.[key]!==undefined)seg[key]=bool(body[key],false);}if(body?.m12!==undefined)seg.m12=clamp(body.m12,0,4,0);if(body?.bm!==undefined)seg.bm=clamp(body.bm,0,16,0);if(body?.si!==undefined)seg.si=clamp(body.si,0,3,0);if(body?.primaryColor)seg.col=[hexRgb(cleanHex(body.primaryColor)),hexRgb(cleanHex(body.secondaryColor,"#000000")),hexRgb(cleanHex(body.tertiaryColor,"#000000"))];const b=await currentBrightness(false),runtime=await flowRuntime();if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_effect");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}const native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION,rt=await mqttRoundTripRetry(native?{on:true,bri:b,tt:0,bs:0,...flowArm(150),seg:[seg,baseLayer()]}:{on:true,bri:b,tt:Math.max(TRANSITION_TENTHS,clamp(body?.transition,0,30,TRANSITION_TENTHS)),bs:TRANSITION_STYLE,seg:[seg,baseLayer()]},{effect:fx,speed:sx,intensity:ix,palette:pal,brightness:b},3600,3);if(!rt.confirmed){const failSafe=await forceSafeDark(sb,"effect_unconfirmed");control=failSafe.control??control;return json(req,{...rt,ok:false,error:"Effect was not freshly confirmed; fail-safe dark was issued.",failSafe,control,action},503);}const committed=await commitVisibleControl(sb,{mode:"manual",auto_live:false,show_family:"manual"},"effect_control_commit_failed");if(!committed.ok){control=committed.control??control;return json(req,{...rt,ok:false,error:"Effect confirmed but backend ownership commit failed; fail-safe dark was issued.",failSafe:committed.failSafe,control,action},503);}control=committed.control;return json(req,{...rt,control,action,requested:{effect:fx,speed:sx,intensity:ix,palette:pal}});}
if(action==="cinematic"){const type=cleanText(body?.eventType,40).toLowerCase(),allowed=new Set(["ace","skin_win","compound_ace_skin","round_phase","skins_results","glow_results","manual_cinematic"]);if(!allowed.has(type))return json(req,{ok:false,error:"Unknown cinematic type."},400);const key=cleanText(body?.idempotencyKey,160)||crypto.randomUUID(),out=await sb.rpc("hbnf_request_cinematic",{p_idempotency_key:key,p_event_type:type,p_payload:body?.payload??{},p_priority:clamp(body?.priority,1,100,40),p_ttl_seconds:clamp(body?.ttlSeconds,1,600,90)});if(out.error)throw out.error;return json(req,{ok:true,control,action,event:out.data});}
if(action==="wow_event_selftest"){return json(req,{ok:true,action,...wowEventSelfTest()});}
if(action==="quick_event"||action==="ace"||action==="nice_shot"||action==="nice_putt"||action==="ctp"||action==="skins"||action==="glow"){
 const kind=action==="quick_event"?cleanText(body?.event,24).toLowerCase():action;
 if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before sending an event.",control,action},409);
 if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; try again shortly.",overlayUntil:control.overlay_until},409);
 const event=getWowEvent(kind);if(!event)return json(req,{ok:false,error:"Unknown WOW event."},400);
 const resumePreset=visualResume(control),scheduled=await coordinatedWowEvent(sb,event.kind,resumePreset);
 return json(req,{ok:true,control,action:"quick_event",event:event.kind,text:event.text,overlayStarted:true,resumePreset,overlayUntil:scheduled.until,frames:scheduled.frames,render:"wow-pixel-event",renderEngine:control?.library_revision===R3_WOW_LIBRARY_REVISION?"r3-wow-max":(control?.library_revision===R2_COURSE_LIBRARY_REVISION?"r2-animartrix-vibe":"legacy")});
}
if(action==="text"){const text=cleanText(body?.text,63);if(!text)return json(req,{ok:false,error:"Text is required."},400);if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show before sending text.",control,action},409);if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; try again shortly.",overlayUntil:control.overlay_until},409);const colorHex=cleanHex(body?.color,"#FFFFFF"),color=hexRgb(colorHex),resumePreset=visualResume(control),runtime=await flowRuntime();if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_overlay");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}const native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION,scheduled=native?await flowOverlay(sb,text,color):await coordinatedOverlay(sb,text,resumePreset,color);return json(req,{ok:true,control,action,text,color:colorHex,overlayStarted:true,resumePreset,overlayUntil:scheduled.until,render:native?"flow-local-text":"dark-text",renderEngine:native?"local-flow":"legacy"});}
if(action==="scoreboard_preview"){if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show first.",control,action},409);if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; try again shortly.",overlayUntil:control.overlay_until},409);const entries=Array.isArray(body?.entries)?body.entries.map((x:any)=>cleanText(x,48)).filter(Boolean).slice(0,12):["Andrew -2","Matt +1","Jason E","Fox +3","Carlos -1","Karl +4"];const repeats=Math.max(1,Math.min(3,Math.round(Number(body?.repeats)||1))),resumePreset=visualResume(control),runtime=await flowRuntime();if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_overlay");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}const native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION,scheduled=native?await flowScoreboard(sb,{label:"SCOREBOARD PREVIEW",entries},repeats):await coordinatedScoreboard(sb,{label:"SCOREBOARD PREVIEW",entries},resumePreset,repeats);return json(req,{ok:true,control,action,overlayStarted:true,resumePreset,overlayUntil:scheduled.until,scoreboardPages:scheduled.pages,repeats:scheduled.repeats,layout:scheduled.layout,render:native?"flow-local-scoreboard":"static-32x16-scoreboard-preview",renderEngine:native?"local-flow":"legacy"});}
if(action==="scores"||action==="scoreboard"||action==="ace_pot"){if(control?.mode==="off")return json(req,{ok:false,error:"Matrix is OFF. Start an HBNF show first.",control,action},409);if(overlayBusy(control))return json(req,{ok:false,error:"Another Matrix overlay is active; try again shortly.",overlayUntil:control.overlay_until},409);const live=await liveInfo(sb);if(!live.active&&action!=="ace_pot")return json(req,{ok:false,error:"No active Skins or Glow round for today."},409);const resumePreset=visualResume(control),runtime=await flowRuntime();if(control?.library_revision===FLOW_LIBRARY_REVISION&&!runtime.ready){const failSafe=await forceSafeDark(sb,"flow_runtime_not_ready_live_overlay");control=failSafe.control??control;return json(req,{ok:false,error:"HBNF Flow runtime is not ready; fail-safe dark was issued.",failSafe,control,action},503);}const native=runtime.ready&&control?.library_revision===FLOW_LIBRARY_REVISION;if(action==="ace_pot"){const text=`ACE POT $${Number(live.acePot??0).toFixed(0)}`,scheduled=native?await flowOverlay(sb,text):await coordinatedOverlay(sb,text,resumePreset);return json(req,{ok:true,control,action,text,overlayStarted:true,resumePreset,overlayUntil:scheduled.until,render:native?"flow-local-text":"dark-white-text",renderEngine:native?"local-flow":"legacy"});}const scheduled=native?await flowScoreboard(sb,live):await coordinatedScoreboard(sb,live,resumePreset);return json(req,{ok:true,control,action:"scoreboard",phase:live.label,overlayStarted:true,resumePreset,overlayUntil:scheduled.until,scoreboardPages:scheduled.pages,layout:scheduled.layout,render:native?"flow-local-scoreboard":"static-32x16-scoreboard",renderEngine:native?"local-flow":"legacy"});}
return json(req,{ok:false,error:"Unknown action."},400);}catch(e){return json(req,{ok:false,error:e instanceof Error?e.message:String(e)},500);}});