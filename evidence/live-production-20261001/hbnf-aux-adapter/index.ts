// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import mqtt from "npm:mqtt@5.10.4";

const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const REQUIRED=["cartId","deviceId","cartRevision","fenceEpoch","release","enabled","brightness","brightnessProfileRevision","programMode","sceneId","paletteId","vibe","tempoMode","speedBias","sequenceCursor","audio","overlay","applyCompleteProjection"];
const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim(),PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||1883));
const USER=Deno.env.get("HBNF_MQTT_USER")||"",PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const TOPIC=(Deno.env.get("HBNF_AUX_MQTT_TOPIC")||"hbnf/cart/aux1").trim(),API=`${TOPIC}/api`,STATUS=`${TOPIC}/status`,AUXWOW=`${TOPIC}/auxwow`,BRI_STATE=`${TOPIC}/g`;
function valid(p:any){return !!p&&REQUIRED.every(k=>k in p)&&p.cartId==="hbnf-cart"&&p.deviceId==="aux"&&Number.isSafeInteger(p.cartRevision)&&p.cartRevision>=0&&Number.isSafeInteger(p.fenceEpoch)&&p.fenceEpoch>=1&&typeof p.release==="string"&&p.release.length>0&&typeof p.enabled==="boolean"&&Number.isInteger(p.brightness)&&p.brightness>=0&&p.brightness<=255&&Number.isSafeInteger(p.brightnessProfileRevision)&&["auto","lock"].includes(String(p.programMode))&&["music","manual"].includes(String(p.tempoMode))&&Number.isFinite(Number(p.speedBias))&&Number.isSafeInteger(p.sequenceCursor)&&p.applyCompleteProjection===true}
async function authorized(req:Request){const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";return !!key&&req.headers.get("Authorization")===`Bearer ${key}`}
const opts=(id:string)=>({clientId:id,clean:true,reconnectPeriod:0,connectTimeout:5000,username:USER||undefined,password:PASS||undefined});
async function publishOps(ops:{topic:string,payload:string,retain?:boolean}[]){return await new Promise<void>((resolve,reject)=>{const c=mqtt.connect(`mqtt://${HOST}:${PORT}`,opts(`hbnf-aux-adapter-${crypto.randomUUID().slice(0,8)}`));const t=setTimeout(()=>{try{c.end(true)}catch{};reject(new Error("aux MQTT timeout"));},8000);let i=0;const next=()=>{if(i>=ops.length){clearTimeout(t);try{c.end(true)}catch{};resolve();return;}const op=ops[i++];c.publish(op.topic,op.payload,{qos:1,retain:op.retain===true},e=>{if(e){clearTimeout(t);try{c.end(true)}catch{};reject(e);}else setTimeout(next,5);});};c.on("connect",next);c.on("error",e=>{clearTimeout(t);try{c.end(true)}catch{};reject(e);});})}
const api=(payload:any,retain=false)=>({topic:API,payload:JSON.stringify(payload),retain});
const bri=(value:number,retain=false)=>({topic:TOPIC,payload:String(value),retain});
async function confirmBrightness(expected:number,wait=1000){
 return await new Promise<any>((resolve,reject)=>{
  let done=false,online=false,reported:number|null=null;
  const c=mqtt.connect(`mqtt://${HOST}:${PORT}`,opts(`hbnf-aux-ack-${crypto.randomUUID().slice(0,8)}`));
  const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};ok?resolve({online,brightness:reported}):reject(new Error(`aux brightness ack timeout expected=${expected} got=${reported}`));};
  const t=setTimeout(()=>finish(false),wait);
  c.on("connect",()=>c.subscribe([STATUS,BRI_STATE],{qos:0},e=>{
   if(e)return finish(false);
   c.publish(TOPIC,String(expected),{qos:1,retain:true},pe=>{if(pe)finish(false);});
  }));
  c.on("message",(topic,p)=>{
   if(topic===STATUS)online=String(p).toLowerCase()==="online";
   if(topic===BRI_STATE){const n=Number(String(p));if(Number.isFinite(n))reported=n;}
   if(online&&reported===expected)finish(true);
  });
  c.on("error",()=>finish(false));
 });
}
const speedSlider=(bias:any)=>Math.max(1,Math.min(255,Math.round(128*Number(bias||1))));
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 if(!await authorized(req))return json({error:"unauthorized"},401);
 const p=await req.json().catch(()=>null);if(!valid(p))return json({error:"invalid_projection"},400);
 try{
  if(!p.enabled){
   await publishOps([
     bri(1,false),
     api({live:false,on:false,bri:0,mainseg:0},false),
     api({lor:2,on:false,bri:0,mainseg:0},false),
     api({live:false,on:false,bri:0,mainseg:0},false),
     api({lor:2,on:false,bri:0,mainseg:0},true),
     bri(0,true)
   ]);
   const ack=await confirmBrightness(0,1100);
   return json({confirmed:true,deviceId:"aux",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,brightness:ack.brightness,enabled:false,sceneId:p.sceneId,programMode:p.programMode,tempoMode:p.tempoMode,sequenceCursor:p.sequenceCursor,appliedProjection:p,driver:"mqtt-aux",verification:"device-brightness-ack"});
  }
  const tempoAuto=p.tempoMode==="music";
  const seg:any={id:0,on:true,sel:true,bri:255,c3:tempoAuto?255:0};
  if(!tempoAuto)seg.sx=speedSlider(p.speedBias);
  if(p.brightness===0){
    // Hard-off sequence: exit realtime first so WLED cannot discard the
    // realtime override for main-segment mode, then arm ALWAYS override at 0.
    // Subsequent projection frames are ignored until brightness rises again.
    await publishOps([
      // Make WLED remember 1/255 as its emergency realtime fallback.
      bri(1,false),
      api({live:false,on:false,bri:0,mainseg:0},false),
      api({lor:2,on:false,bri:0,mainseg:0},false),
      api({live:false,on:false,bri:0,mainseg:0},false),
      api({lor:2,on:false,bri:0,mainseg:0},true),
      bri(0,true)
    ]);
  }else{
    // Clear hard-off override, exit any stale realtime session at the requested
    // global brightness, then let the next local projection frame resume.
    await publishOps([
      api({lor:0,live:false,on:true,bri:p.brightness,mainseg:0,seg},true),
      bri(p.brightness,true)
    ]);
  }
  const ack=await confirmBrightness(p.brightness,1100);
  return json({confirmed:true,deviceId:"aux",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,brightness:ack.brightness,enabled:true,sceneId:p.sceneId,programMode:p.programMode,tempoMode:p.tempoMode,sequenceCursor:p.sequenceCursor,appliedProjection:p,driver:"mqtt-aux",verification:"device-brightness-ack"});
 }catch(e){return json({error:e instanceof Error?e.message:String(e),deviceId:"aux",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch},502);}
});