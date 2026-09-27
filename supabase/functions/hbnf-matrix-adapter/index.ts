// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import mqtt from "npm:mqtt@5.10.4";

const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const SCENES:any={"course-flow":"r2","field-mix":"field","hbnf-signature":"signature","quiet-cosmos":"cosmic"};
const REQUIRED=["cartId","deviceId","cartRevision","fenceEpoch","release","enabled","brightness","brightnessProfileRevision","programMode","sceneId","paletteId","vibe","tempoMode","speedBias","sequenceCursor","audio","overlay","applyCompleteProjection"];
const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim();
const PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||1883));
const USER=Deno.env.get("HBNF_MQTT_USER")||"",PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const TOPIC=(Deno.env.get("HBNF_MQTT_TOPIC")||"hbnf/cart/wled1").trim(), API=`${TOPIC}/api`;

function valid(p:any){
 return !!p&&REQUIRED.every(k=>k in p)&&p.cartId==="hbnf-cart"&&p.deviceId==="matrix"&&
 Number.isSafeInteger(p.cartRevision)&&p.cartRevision>=0&&Number.isSafeInteger(p.fenceEpoch)&&p.fenceEpoch>=1&&
 typeof p.release==="string"&&p.release.length>0&&typeof p.enabled==="boolean"&&Number.isInteger(p.brightness)&&p.brightness>=0&&p.brightness<=255&&
 Number.isSafeInteger(p.brightnessProfileRevision)&&["auto","lock"].includes(String(p.programMode))&&SCENES[p.sceneId]&&
 ["music","manual"].includes(String(p.tempoMode))&&Number.isFinite(Number(p.speedBias))&&Number.isSafeInteger(p.sequenceCursor)&&p.applyCompleteProjection===true;
}
async function authorized(req:Request){
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 return !!key&&req.headers.get("Authorization")===`Bearer ${key}`;
}
async function lower(body:any){
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.functions.invoke("hbnf-matrix-control",{body});
 if(error||data?.ok===false)throw new Error(data?.error||error?.message||"matrix-control invoke failed");
 return data;
}
async function publish(payload:any){
 return await new Promise<void>((resolve,reject)=>{
  const client=mqtt.connect(`mqtt://${HOST}:${PORT}`,{clientId:`hbnf-matrix-adapter-${crypto.randomUUID().slice(0,8)}`,clean:true,reconnectPeriod:0,connectTimeout:5000,username:USER||undefined,password:PASS||undefined});
  const timer=setTimeout(()=>{try{client.end(true)}catch{};reject(new Error("matrix MQTT timeout"));},8000);
  client.on("connect",()=>client.publish(API,JSON.stringify(payload),{qos:1,retain:false},e=>{clearTimeout(timer);try{client.end(true)}catch{};e?reject(e):resolve();}));
  client.on("error",e=>{clearTimeout(timer);try{client.end(true)}catch{};reject(e);});
 });
}
async function previous(db:any){
 const {data,error}=await db.rpc("hbnf_cart_get_observed",{p_cart_id:"hbnf-cart",p_device_id:"matrix"});
 if(error)throw new Error("observed_state_read_failed");
 return data?.reported??null;
}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const speedSlider=(bias:any)=>Math.max(1,Math.min(255,Math.round(128*Number(bias||1))));
const vibeAmount=(v:any)=>({mellow:110,moderate:170,energetic:220,peak:255}[String(v)]??170);
const profileCode=(v:any)=>({bass:16,mid:56,balanced:96,treble:136,full:176,impact:216}[String(v)]??null);
const styleCode=(v:any)=>({clean:16,punch:56,ring:96,spark:136,chroma:176,hybrid:236}[String(v)]??null);

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 if(!await authorized(req))return json({error:"unauthorized"},401);
 const p=await req.json().catch(()=>null); if(!valid(p))return json({error:"invalid_projection"},400);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const prior=await previous(db), priorCursor=Number(prior?.sequenceCursor??p.sequenceCursor), priorScene=String(prior?.sceneId??"");
 try{
  if(!p.enabled){
   let off:any=null, blackoutError:string|null=null;
   try{off=await lower({action:"blackout"});}
   catch(e){blackoutError=e instanceof Error?e.message:String(e);}
   let verified=off?.confirmed===true||off?.failSafe?.safe===true;
   let status:any=null;
   if(!verified){
    await pause(250);
    status=await lower({action:"status"});
    verified=status?.online===true&&status?.control?.mode==="off";
   }
   if(!verified)throw new Error("matrix blackout not confirmed");
   return json({confirmed:true,deviceId:"matrix",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,brightness:p.brightness,enabled:false,sceneId:p.sceneId,programMode:p.programMode,tempoMode:p.tempoMode,sequenceCursor:p.sequenceCursor,appliedProjection:p,driver:"hbnf-matrix-control",verification:off?.confirmed===true||off?.failSafe?.safe===true?"blackout-ack":"post-blackout-status",legacyBlackoutError:blackoutError});
  }
  let status=await lower({action:"status"}), family=SCENES[p.sceneId], currentFamily=String(status?.control?.show_family??"");
  const sceneChanged=priorScene&&priorScene!==p.sceneId;
  const startedFromOff=status?.control?.mode==="off";
  let showStarted=false;
  if(startedFromOff||currentFamily!==family||sceneChanged){
   await lower({action:"play_show",family,live:false,brightness:Math.max(1,p.brightness)});
   showStarted=true;
  }
  const delta=Math.max(0,Math.min(8,p.sequenceCursor-priorCursor));
  for(let i=0;i<delta;i++){
   const n=await lower({action:"next_look",brightness:Math.max(1,p.brightness)});
   if(n?.brokerAccepted!==true&&n?.confirmed!==true&&n?.accepted!==true)throw new Error("NEXT was not accepted");
   await pause(220);
  }
  if(p.programMode==="lock"){
   status=await lower({action:"status"});
   if(family==="r2") await lower({action:"lock_current"});
   else {
    const ps=Number(status?.telemetry?.preset);
    if(!Number.isInteger(ps)||ps<1||ps>250)throw new Error("cannot identify current preset for lock");
    await lower({action:"preset",preset:ps});
   }
  } else if(family==="r2" && !showStarted) {
   status=await lower({action:"status"});
   if(status?.control?.mode==="off") {
    await lower({action:"play_show",family:"r2",live:false,brightness:Math.max(1,p.brightness)});
    showStarted=true;
   }
  }
  const priorProfileRevision=Number(prior?.appliedProjection?.brightnessProfileRevision??prior?.brightnessProfileRevision??0);
  let brightnessVerification:"not-needed"|"legacy-ack"|"post-brightness-online"="not-needed";
  let legacyBrightnessError:string|null=null;
  if(!showStarted && Number(p.brightnessProfileRevision)!==priorProfileRevision){
   if(p.brightness>0){
    try{
     await lower({action:"brightness",brightness:p.brightness,advanced:p.brightness>72,confirmHigh:true});
     brightnessVerification="legacy-ack";
    }catch(e){
     legacyBrightnessError=e instanceof Error?e.message:String(e);
     await pause(250);
     const brightnessStatus=await lower({action:"status"});
     if(brightnessStatus?.online!==true||brightnessStatus?.control?.mode==="off")throw e;
     brightnessVerification="post-brightness-online";
    }
   } else {
    await lower({action:"blackout"});
    brightnessVerification="legacy-ack";
   }
  }
  const tempoAuto=p.tempoMode==="music";
  const tune=p.tuning??{};
  const seg:any={id:0,c3:tempoAuto?255:0,c2:vibeAmount(p.vibe)};
  if(!tempoAuto)seg.sx=speedSlider(p.speedBias);
  const pc=profileCode(tune.audioProfile), sc=styleCode(tune.audioStyle);
  if(pc!==null)seg.ix=pc;
  if(sc!==null)seg.c1=sc;
  const mic=Math.max(64,Math.min(255,Math.round(Number(tune.micSensitivity??255))));
  await publish({on:true,AudioReactive:{inputLevel:mic},seg});
  await pause(120);
  status=await lower({action:"status"});
  if(status?.online!==true||status?.control?.mode==="off")throw new Error("matrix not online/visible after projection");
  return json({confirmed:true,deviceId:"matrix",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,brightness:p.brightness,enabled:true,sceneId:p.sceneId,programMode:p.programMode,tempoMode:p.tempoMode,sequenceCursor:p.sequenceCursor,buildWitness:status?.r3Wow?.diagnostics?.buildWitness??null,appliedProjection:p,driver:"hbnf-matrix-control+canonical-tuning",verification:"post-projection-online",showStarted,brightnessVerification,legacyBrightnessError,tuningApplied:{micSensitivity:Math.max(64,Math.min(255,Math.round(Number((p.tuning??{}).micSensitivity??255)))),audioProfile:(p.tuning??{}).audioProfile??"scene",audioStyle:(p.tuning??{}).audioStyle??"scene",vibe:p.vibe}});
 }catch(e){return json({error:e instanceof Error?e.message:String(e),deviceId:"matrix",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch},502);}
});