// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import mqtt from "npm:mqtt@5.10.4";

const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const REQUIRED=["cartId","deviceId","cartRevision","fenceEpoch","release","enabled","brightness","brightnessProfileRevision","programMode","sceneId","paletteId","vibe","tempoMode","speedBias","sequenceCursor","audio","overlay","applyCompleteProjection"];
const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim(),PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||1883));
const USER=Deno.env.get("HBNF_MQTT_USER")||"",PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const TOPIC=(Deno.env.get("HBNF_AUX_MQTT_TOPIC")||"hbnf/cart/aux1").trim(),API=`${TOPIC}/api`,STATUS=`${TOPIC}/status`,AUXWOW=`${TOPIC}/auxwow`;
function valid(p:any){return !!p&&REQUIRED.every(k=>k in p)&&p.cartId==="hbnf-cart"&&p.deviceId==="aux"&&Number.isSafeInteger(p.cartRevision)&&p.cartRevision>=0&&Number.isSafeInteger(p.fenceEpoch)&&p.fenceEpoch>=1&&typeof p.release==="string"&&p.release.length>0&&typeof p.enabled==="boolean"&&Number.isInteger(p.brightness)&&p.brightness>=0&&p.brightness<=255&&Number.isSafeInteger(p.brightnessProfileRevision)&&["auto","lock"].includes(String(p.programMode))&&["music","manual"].includes(String(p.tempoMode))&&Number.isFinite(Number(p.speedBias))&&Number.isSafeInteger(p.sequenceCursor)&&p.applyCompleteProjection===true}
async function authorized(req:Request){const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";return !!key&&req.headers.get("Authorization")===`Bearer ${key}`}
const opts=(id:string)=>({clientId:id,clean:true,reconnectPeriod:0,connectTimeout:5000,username:USER||undefined,password:PASS||undefined});
async function publish(payload:any){return await new Promise<void>((resolve,reject)=>{const c=mqtt.connect(`mqtt://${HOST}:${PORT}`,opts(`hbnf-aux-adapter-${crypto.randomUUID().slice(0,8)}`));const t=setTimeout(()=>{try{c.end(true)}catch{};reject(new Error("aux MQTT timeout"));},8000);c.on("connect",()=>c.publish(API,JSON.stringify(payload),{qos:1,retain:false},e=>{clearTimeout(t);try{c.end(true)}catch{};e?reject(e):resolve();}));c.on("error",e=>{clearTimeout(t);try{c.end(true)}catch{};reject(e);});})}
async function probe(wait=1100){return await new Promise<any>(resolve=>{const seen:any={};let done=false;const c=mqtt.connect(`mqtt://${HOST}:${PORT}`,opts(`hbnf-aux-adapter-probe-${crypto.randomUUID().slice(0,8)}`));const finish=()=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};let wow:any=null;try{wow=seen[AUXWOW]?JSON.parse(seen[AUXWOW]):null}catch{}resolve({online:String(seen[STATUS]||"").toLowerCase()==="online",wow});};const t=setTimeout(finish,wait);c.on("connect",()=>c.subscribe([STATUS,AUXWOW],{qos:0}));c.on("message",(topic,p)=>seen[topic]=p.toString());c.on("error",finish);})}
const speedSlider=(bias:any)=>Math.max(1,Math.min(255,Math.round(128*Number(bias||1))));
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 if(!await authorized(req))return json({error:"unauthorized"},401);
 const p=await req.json().catch(()=>null);if(!valid(p))return json({error:"invalid_projection"},400);
 try{
  if(!p.enabled){
   await publish({on:false});
   return json({confirmed:true,deviceId:"aux",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,brightness:p.brightness,enabled:false,sceneId:p.sceneId,programMode:p.programMode,tempoMode:p.tempoMode,sequenceCursor:p.sequenceCursor,appliedProjection:p,driver:"mqtt-aux"});
  }
  const tempoAuto=p.tempoMode==="music";
  const seg:any={id:0,on:true,sel:true,bri:p.brightness,c3:tempoAuto?255:0};
  if(!tempoAuto)seg.sx=speedSlider(p.speedBias);
  await publish({on:true,bri:255,mainseg:0,seg});
  const st=await probe();
  if(!st.online)throw new Error("aux not online after projection");
  return json({confirmed:true,deviceId:"aux",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,brightness:p.brightness,enabled:true,sceneId:p.sceneId,programMode:p.programMode,tempoMode:p.tempoMode,sequenceCursor:p.sequenceCursor,buildWitness:st?.wow?.buildWitness??null,appliedProjection:p,driver:"mqtt-aux"});
 }catch(e){return json({error:e instanceof Error?e.message:String(e),deviceId:"aux",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch},502);}
});