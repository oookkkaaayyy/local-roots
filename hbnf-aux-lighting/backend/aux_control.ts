// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import mqtt from "npm:mqtt@5.10.4";
import { createClient } from "npm:@supabase/supabase-js@2";

const ENV_ENABLED=(Deno.env.get("HBNF_AUX_ENABLED")||"").toLowerCase()==="true";
const ENV_MIXED=(Deno.env.get("HBNF_AUX_MIXED_LOAD_ENABLED")||"").toLowerCase()==="true";
const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim();
const PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||1883));
const USER=Deno.env.get("HBNF_MQTT_USER")||"",PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const TOPIC=(Deno.env.get("HBNF_AUX_MQTT_TOPIC")||"hbnf/cart/aux1").trim();
const API=`${TOPIC}/api`,STATUS=`${TOPIC}/status`,G=`${TOPIC}/g`,V=`${TOPIC}/v`,AUXWOW=`${TOPIC}/auxwow`;
const URL=`mqtt://${HOST}:${PORT}`;
const MODES:any={music:200,glow_live:210,uv_full:220,uv_main:221,uv_short:222,off:223};
const UV_ACTION_PRESETS:any={full:220,main:221,short:222,off:200};
const MIRROR_BRI_MAX=128;
const HW={digital:{gpio:16,type:"WS2811",volts:12},uvMain:{gpio:25,type:"PWM White"},uvShort:{gpio:26,type:"PWM White"},sparePwm:27,micFallback:{gpio:36,type:"Analog",commissioningDefault:"unused"},audioMaster:{node:"matrix",transport:"AudioReactive UDP Sound Sync",port:11988}};
const MIRROR_POLICY={visualMaster:"matrix",underglowRole:"matrix-slave",syncFields:["effect","speed","intensity","palette","primaryColor","secondaryColor","tertiaryColor","on"],preserveUv:true,brightnessIndependent:true,brightnessMax:MIRROR_BRI_MAX};
const SYNC_POLICY={transport:"WLED UDP Sync",group:1,matrix:{send:true,sendBrightness:true,sendColor:true,sendEffects:true,sendPalette:true},aux:{receive:true,receiveBrightness:false,receiveColor:true,receiveEffects:true,receivePalette:true,receiveSegmentOptions:false,receiveSegmentBounds:false,mainSegment:0,underglowSegment:0,uvSegments:[1,2],selectedSegments:[0],unselectedSegments:[1,2]},audio:{transport:"AudioReactive UDP Sound Sync",port:11988,matrixMode:"send",auxMode:"receive",localAuxMic:"fallback-only"},rule:"Matrix is the sole visual and audio master; underglow follows Matrix; UV remains independently controllable."};
const R3={matrixRelease:"hbnf-wow-r3-max-2026-09-21-v3",playlistPreset:60,effectIdRange:[220,247],sceneCount:28,softwarePrepared:true,physicalAcceptanceRequired:true,auxRelease:"hbnf-wow-aux-r3-2026-09-22-v1",auxEngine:"aux-r3-wow-1d",auxBuildWitness:"registry28-fixed-1d-v1",projection:"fold2-1d-v1",audioSync:{source:"matrix",mode:"receive",port:11988}};
const ORDER=[
 ["hardware_wired","Finish physical SP803E/strip/UV wiring and power it."],
 ["power_verified","Verify supply voltage, polarity, common ground and fused/current-safe feed."],
 ["gpio_verified","Verify GPIO16 underglow, GPIO25 UV main, GPIO26 UV short and GPIO36 mic assignments."],
 ["current_limit_verified","Set addressable underglow current limit to <=900 mA for initial commissioning."],
 ["segments_verified","Verify Segment 0 underglow is selected and UV segments 1/2 are unselected."],
 ["audio_input_verified","Verify AudioReactive UDP Sound Sync from Matrix on port 11988; local GPIO36 mic remains fallback only."],
 ["udp_sync_verified","Configure UDP sync group 1 with Matrix send and aux receive; do not receive segment options/bounds."],
 ["underglow_sync_verified","Verify underglow follows Matrix look changes."],
 ["uv_main_verified","Verify UV main independently."],
 ["uv_short_verified","Verify UV short independently."],
 ["uv_full_verified","Verify full UV independently."],
 ["thermal_verified","Verify wiring/controller/strip temperatures are acceptable under sustained individual loads."],
 ["mixed_load_verified","Verify mixed underglow + UV load without resets, interference or unsafe heating."]
];
const COMMISSIONING={order:ORDER.map(x=>x[1]),requiresMixedLoadAcceptance:true,globalOffPreset:223,uvOffReturnsToPreset:200,visualMaster:"matrix",underglowIndependentStylingAllowed:false,syncGroup:1,r3Integration:R3};
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const opts=(id:string)=>({clientId:id,clean:true,reconnectPeriod:0,connectTimeout:5000,username:USER||undefined,password:PASS||undefined});
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const sb=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false}});
const CLOSED={id:1,hardware_wired:false,power_verified:false,gpio_verified:false,current_limit_verified:false,segments_verified:false,audio_input_verified:false,udp_sync_verified:false,underglow_sync_verified:false,uv_main_verified:false,uv_short_verified:false,uv_full_verified:false,thermal_verified:false,mixed_load_verified:false,aux_enabled:false,accepted_at:null,notes:null,updated_at:null};
async function gate(){try{const {data,error}=await sb.from("hbnf_aux_commissioning_state").select("*").eq("id",1).maybeSingle();if(error||!data)return {...CLOSED,readError:error?.message||"state missing"};return data;}catch(e){return {...CLOSED,readError:e instanceof Error?e.message:String(e)};}}
function nextStep(c:any,online:boolean){if(!c.hardware_wired)return ORDER[0][1];if(!online)return "Power the wired SP803E and connect it to Wi-Fi/MQTT; passive probe is waiting.";for(const [k,label] of ORDER){if(!c[k])return label;}if(!c.aux_enabled)return "Physical acceptance is complete; enable the aux control gate.";return "Commissioning complete.";}
function tag(xml:string,name:string){const m=String(xml||"").match(new RegExp(`<${name}>(.*?)<\\/${name}>`));return m?m[1]:null;}
function parsed(raw:any){const xml=raw?.[V]||"";const n=(x:string)=>{const v=tag(xml,x);return v===null?null:Number(v)};return{brightness:raw?.[G]!=null?Number(raw[G]):n("ac"),effect:n("fx"),speed:n("sx"),intensity:n("ix"),palette:n("fp"),preset:n("ps"),playlistActive:n("cy"),description:tag(xml,"ds")};}
async function passiveStatus(wait=1500){return await new Promise<any>((resolve)=>{const seen:any={};let done=false;const c=mqtt.connect(URL,opts(`hbnf-aux-probe-${crypto.randomUUID().slice(0,8)}`));const finish=()=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};const online=String(seen[STATUS]||"").toLowerCase()==="online";let runtime:any=null;try{runtime=seen[AUXWOW]?JSON.parse(seen[AUXWOW]):null}catch{}const runtimeTrusted=!!(online&&runtime?.release===R3.auxRelease&&runtime?.engine===R3.auxEngine&&runtime?.buildWitness===R3.auxBuildWitness&&Number(runtime?.fxRegistered)===28&&Number(runtime?.fxFailed)===0&&Number(runtime?.modeCount)===248&&Number(runtime?.fxFirst)===220&&Number(runtime?.fxLast)===247&&runtime?.projection==="fold2-1d-v1");resolve({online,telemetry:parsed(seen),auxRuntime:runtime,runtimeTrusted,raw:seen});};const t=setTimeout(finish,wait);c.on("connect",()=>c.subscribe([STATUS,G,V,AUXWOW],{qos:0}));c.on("message",(topic,p)=>seen[topic]=p.toString());c.on("error",finish);});}
async function publish(payload:any,allowed:boolean){if(!allowed)throw new Error("Aux actuation is locked until physical commissioning is accepted.");return await new Promise<void>((resolve,reject)=>{const c=mqtt.connect(URL,opts(`hbnf-aux-${crypto.randomUUID().slice(0,8)}`));const t=setTimeout(()=>{try{c.end(true)}catch{};reject(new Error("MQTT timeout"));},9000);c.on("connect",()=>c.publish(API,JSON.stringify(payload),{qos:1,retain:false},async(e)=>{clearTimeout(t);if(e){c.end(true);reject(e);return;}await pause(80);c.end(true);resolve();}));c.on("error",e=>{clearTimeout(t);try{c.end(true)}catch{};reject(e);});});}
const clamp8=(n:any,d=0)=>Math.max(0,Math.min(255,Math.round(Number.isFinite(Number(n))?Number(n):d)));
const rgb=(x:any,d:number[])=>Array.isArray(x)&&x.length>=3?x.slice(0,3).map((n:any,i:number)=>clamp8(n,d[i]??0)):d;
function mirrorPayload(v:any){const on=v?.on!==false,requested=Math.round(Number(v?.brightness??v?.bri??96)),bri=Math.max(1,Math.min(MIRROR_BRI_MAX,Number.isFinite(requested)?requested:96));const seg:any={id:0,on,bri,fx:clamp8(v?.effect??v?.fx,0),sx:clamp8(v?.speed??v?.sx,128),ix:clamp8(v?.intensity??v?.ix,128),pal:clamp8(v?.palette??v?.pal,0),col:[rgb(v?.primaryColor??v?.color,[255,255,255]),rgb(v?.secondaryColor,[0,0,0]),rgb(v?.tertiaryColor,[0,0,0])]};return{payload:{on:true,seg},requested,bri,seg};}
function uvPayload(mode:string){const main=mode==="full"||mode==="main",short=mode==="full"||mode==="short";return{payload:{on:true,mainseg:0,seg:[{id:0,sel:true},{id:1,on:main,bri:255,sel:false,col:[[255,255,255]]},{id:2,on:short,bri:255,sel:false,col:[[255,255,255]]}]},main,short};}
function modePayload(mode:string){if(mode==="off")return{payload:{on:false},uv:"off"};const uvOn=mode==="glow_live";return{payload:{on:true,mainseg:0,seg:[{id:0,on:true,sel:true},{id:1,on:uvOn,bri:255,sel:false,col:[[255,255,255]]},{id:2,on:uvOn,bri:255,sel:false,col:[[255,255,255]]}]},uv:uvOn?"full":"off"};}
function dryRun(b:any){const op=String(b?.operation||b?.targetAction||"sync_arm").toLowerCase();if(op==="sync_arm")return{operation:op,payload:{on:true,mainseg:0,seg:[{id:0,on:true,sel:true},{id:1,sel:false},{id:2,sel:false}]}};if(op==="uv"){const mode=String(b?.mode||"off").toLowerCase();if(!(mode in UV_ACTION_PRESETS))throw new Error("UV mode must be full/main/short/off");return{operation:op,mode,...uvPayload(mode)};}if(op==="mode"){const mode=String(b?.mode||"music").toLowerCase();if(!(mode in MODES))throw new Error("Unknown aux mode");return{operation:op,mode,...modePayload(mode)};}if(op==="mirror_visual"){const m=mirrorPayload(b?.visual??b);return{operation:op,...m};}throw new Error("dry_run operation must be sync_arm/mode/uv/mirror_visual");}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const c=await gate(),enabled=ENV_ENABLED||c.aux_enabled===true,mixed=ENV_MIXED||c.mixed_load_verified===true;
 if(req.method==="GET")return json({ok:true,service:"hbnf-aux-control",version:"sp803e-v11-fold2-r3-gate",enabled,mixedLoadAccepted:mixed,envGate:ENV_ENABLED,databaseGate:c.aux_enabled===true,topic:TOPIC,modes:MODES,uvActions:UV_ACTION_PRESETS,selfTest:{ok:MODES.off===223&&UV_ACTION_PRESETS.off===MODES.music,globalOffPreset:MODES.off,uvOffReturnsToPreset:UV_ACTION_PRESETS.off,safeDefaultClosed:!ENV_ENABLED,databaseGateAccepted:c.aux_enabled===true,mixedLoadAccepted:mixed},commissioning:COMMISSIONING,commissioningState:c,hardware:HW,policy:{underglowMaxMilliamps:900,uvPriority:true,mixedLoadAccepted:mixed,matrixSlave:true,visualMaster:"matrix",mirrorBrightnessMax:MIRROR_BRI_MAX},mirrorPolicy:MIRROR_POLICY,syncPolicy:SYNC_POLICY,r3Integration:R3});
 if(req.method!=="POST")return json({ok:false,error:"GET or POST required"},405);
 const b=await req.json().catch(()=>({})),action=String(b?.action||"status").toLowerCase();
 if(action==="status"||action==="passive_probe"){const st=await passiveStatus();return json({ok:true,action,enabled,mixedLoadAccepted:mixed,...st,commissioningState:c,nextAction:nextStep(c,st.online)});}
 if(action==="commissioning_plan"||action==="selftest"){const st=await passiveStatus(900);return json({ok:true,action,enabled,mixedLoadAccepted:mixed,selfTest:{ok:MODES.off===223&&UV_ACTION_PRESETS.off===MODES.music,globalOffPreset:MODES.off,uvOffReturnsToPreset:UV_ACTION_PRESETS.off,safeDefaultClosed:!(ENV_ENABLED||c.aux_enabled===true)},commissioning:COMMISSIONING,commissioningState:c,passiveProbe:st,nextAction:nextStep(c,st.online),modes:MODES,uvActions:UV_ACTION_PRESETS});}
 if(action==="dry_run"){try{return json({ok:true,action,mutationIssued:false,enabled,mixedLoadAccepted:mixed,wouldPublish:dryRun(b),syncPolicy:SYNC_POLICY,mirrorPolicy:MIRROR_POLICY});}catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},400);}}
 // Safety exception: a blackout is non-energizing and may be issued even before acceptance.
 if(action==="blackout"||action==="off"){try{await publish({on:false},true);return json({ok:true,mode:"off",safetyAction:true});}catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},503);}}
 if(!enabled)return json({ok:false,error:"Aux hardware actions are feature-gated off until physical commissioning is accepted.",commissioningState:c,nextAction:nextStep(c,false)},409);
 try{
  if(action==="sync_arm"){const payload={on:true,mainseg:0,seg:[{id:0,on:true,sel:true},{id:1,sel:false},{id:2,sel:false}]};await publish(payload,enabled);return json({ok:true,action,matrixSlave:true,syncPolicy:SYNC_POLICY,payload});}
  if(action==="mirror_visual"){const m=mirrorPayload(b?.visual??b);await publish(m.payload,enabled);return json({ok:true,action,matrixSlave:true,segment:0,applied:m.seg,uvPreserved:true,brightnessClamped:m.requested!==m.bri,mirrorPolicy:MIRROR_POLICY});}
  if(action==="mode"){const mode=String(b?.mode||"").toLowerCase();if(!(mode in MODES))return json({ok:false,error:"Unknown aux mode"},400);if(mode==="glow_live"&&!mixed)return json({ok:false,error:"Mixed underglow + UV is locked until physical mixed-load acceptance passes."},409);const m=modePayload(mode);await publish(m.payload,enabled);return json({ok:true,mode,matrixSlave:true,visualMaster:"matrix",uv:m.uv,syncPolicy:SYNC_POLICY});}
  if(action==="underglow_brightness"){const bri=Math.max(1,Math.min(MIRROR_BRI_MAX,Math.round(Number(b?.brightness)||96)));const payload={on:true,bri:255,seg:{id:0,on:true,bri}};await publish(payload,enabled);return json({ok:true,brightness:bri,max:MIRROR_BRI_MAX});}
  if(action==="uv"){const mode=String(b?.mode||"off").toLowerCase();if(!(mode in UV_ACTION_PRESETS))return json({ok:false,error:"UV mode must be full/main/short/off"},400);const u=uvPayload(mode);await publish(u.payload,enabled);return json({ok:true,uv:mode,matrixSlavePreserved:true,main:u.main,short:u.short,syncPolicy:SYNC_POLICY});}
  return json({ok:false,error:"Unknown action"},400);
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},503);}
});