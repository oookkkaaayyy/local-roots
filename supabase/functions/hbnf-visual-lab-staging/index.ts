// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import mqtt from "npm:mqtt@5.10.4";

const SCHEMA="hbnf-visual-lab-status-v1";
const ORIGIN=Deno.env.get("HBNF_CART_ALLOWED_ORIGIN") ?? "https://hbnightflyers.com";
const cors={
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-hbnf-device",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Cache-Control":"no-store",
};
const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,Number(n)));
const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim();
const PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||1883));
const USER=Deno.env.get("HBNF_MQTT_USER")||"",PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const MATRIX_TOPIC=(Deno.env.get("HBNF_MQTT_TOPIC")||"hbnf/cart/wled1").trim();
const AUX_TOPIC=(Deno.env.get("HBNF_AUX_MQTT_TOPIC")||"hbnf/cart/aux1").trim();

async function sha256Hex(value:string){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
}
async function authorized(req:Request,db:any){
  const token=req.headers.get("x-hbnf-device")||"";
  if(token){
    const {data,error}=await db.rpc("hbnf_cart_device_session_valid",{p_session_hash:await sha256Hex(token)});
    if(!error && data===true) return true;
  }
  const cookie=req.headers.get("Cookie")||"";
  const match=cookie.match(/(?:^|;\s*)hbnf_cart_device=([^;]+)/);
  if(match?.[1]){
    const {data,error}=await db.rpc("hbnf_cart_device_session_valid",{p_session_hash:await sha256Hex(decodeURIComponent(match[1]))});
    if(!error && data===true) return true;
  }
  return false;
}
function normalizeSemantic(input:any={}){
  return {
    energy:clamp(input.energy??50,0,100),
    audioResponse:clamp(input.audioResponse??60,0,100),
    motion:clamp(input.motion??50,0,100),
    variation:clamp(input.variation??85,0,100),
    couplingMode:["locked","related","independent"].includes(input.couplingMode)?input.couplingMode:"locked",
    ...(typeof input.paletteId==="string"&&input.paletteId.trim()?{paletteId:input.paletteId.trim()}:{})
  };
}
function energyToVibe(e:number){e=clamp(e,0,100);return e<25?"mellow":e<55?"moderate":e<82?"energetic":"peak"}
function compilePlan(input:any={}){
  const semantic=normalizeSemantic(input);
  const cartTune:any={
    vibe:energyToVibe(semantic.energy),
    speedBias:Number((0.5+semantic.motion/100).toFixed(2)),
    responseBoost:Number((1+semantic.audioResponse*.005).toFixed(3)),
  };
  if(semantic.paletteId) cartTune.paletteId=semantic.paletteId;
  const renderer={generator:{enabled:true,locked:false},tuning:{speedEnabled:true,speed:Math.round(64+semantic.motion*1.28)}};
  const unbound:string[]=[];
  if(semantic.variation!==85) unbound.push("variation");
  if(semantic.couplingMode!=="locked") unbound.push("couplingMode");
  return {schema:"hbnf-visual-semantic-v1",semantic,cartTune,renderer,unbound};
}
function seqDistance(a:any,b:any){
  if(!Number.isFinite(Number(a))||!Number.isFinite(Number(b))) return null;
  const aa=((Math.trunc(Number(a))%65536)+65536)%65536,bb=((Math.trunc(Number(b))%65536)+65536)%65536;
  const d=Math.abs(aa-bb); return Math.min(d,65536-d);
}
function assessSync(matrix:any,aux:any){
  const distance=seqDistance(matrix?.projectionSeq,aux?.projectionRxSeq);
  const age=Number(aux?.projectionRxAgeMs);
  const capable=matrix?.projectionLink==="frame-lock-v1"&&aux?.projectionLink==="frame-lock-v1"&&aux?.projectionRole==="receiver";
  const rxActive=aux?.projectionRxActive===true&&Number.isFinite(age)&&age<=350;
  return {capable,healthy:capable&&rxActive&&distance!==null&&distance<=4,seqDistance:distance,rxActive,rxAgeMs:Number.isFinite(age)?age:null};
}
async function probeMqtt(waitMs=1700){
  const topics=[`${MATRIX_TOPIC}/wow`,`${AUX_TOPIC}/auxwow`,`${MATRIX_TOPIC}/status`,`${AUX_TOPIC}/status`];
  return await new Promise<any>(resolve=>{
    const seen:any={}; let done=false;
    const client=mqtt.connect(`mqtt://${HOST}:${PORT}`,{
      clientId:`hbnf-visual-lab-${crypto.randomUUID().slice(0,8)}`,
      clean:true,reconnectPeriod:0,connectTimeout:1200,username:USER||undefined,password:PASS||undefined
    });
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);try{client.end(true)}catch{}
      const parse=(t:string)=>{try{return seen[t]?JSON.parse(seen[t]):null}catch{return null}};
      resolve({
        matrix:parse(`${MATRIX_TOPIC}/wow`),
        aux:parse(`${AUX_TOPIC}/auxwow`),
        online:{matrix:String(seen[`${MATRIX_TOPIC}/status`]||"").toLowerCase()==="online",aux:String(seen[`${AUX_TOPIC}/status`]||"").toLowerCase()==="online"},
        sampledAt:new Date().toISOString()
      });
    };
    const timer=setTimeout(finish,waitMs);
    client.on("connect",()=>client.subscribe(topics,{qos:0}));
    client.on("message",(topic,payload)=>{seen[topic]=payload.toString(); if(seen[topics[0]]&&seen[topics[1]]) setTimeout(finish,60)});
    client.on("error",finish);
  });
}
function deviceSummary(snapshot:any,id:string){
  const desired=snapshot?.desired, obs=(snapshot?.observed||[]).find((x:any)=>x.device_id===id);
  const rev=Number(desired?.revision);
  const confirmedRev=Number(obs?.reported?.cartRevision??obs?.desired_revision);
  return {
    deviceId:id,online:obs?.online===true,status:obs?.status??"unknown",
    desiredRevision:Number.isFinite(rev)?rev:null,confirmedRevision:Number.isFinite(confirmedRev)?confirmedRev:null,
    confirmed:Number.isFinite(rev)&&Number.isFinite(confirmedRev)&&rev===confirmedRev&&obs?.reported?.confirmed===true,
    confirmedAt:obs?.observed_at??null,buildWitness:obs?.reported?.buildWitness??null,
    appliedProjection:obs?.reported?.appliedProjection??null,tuningApplied:obs?.reported?.tuningApplied??null,
  };
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return reply({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!key) return reply({error:"server_config_missing"},500);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!await authorized(req,db)) return reply({error:"unauthorized"},401);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object") return reply({error:"invalid_json"},400);
  if(body.action==="plan") return reply({readOnly:true,plan:compilePlan(body.semantic||{})});
  if(body.action!=="status") return reply({error:"unsupported_action",allowed:["status","plan"]},400);
  const [{data:snapshot,error},telemetry]=await Promise.all([db.rpc("hbnf_cart_get_status",{p_cart_id:"hbnf-cart"}),probeMqtt()]);
  if(error||!snapshot) return reply({error:"state_read_failed"},500);
  const matrix=deviceSummary(snapshot,"matrix"),aux=deviceSummary(snapshot,"aux");
  return reply({
    schema:SCHEMA,readOnly:true,desired:snapshot.desired??null,devices:{matrix,aux},telemetry,sync:assessSync(telemetry.matrix,telemetry.aux),
    capabilities:{semanticPlan:true,hardwareWrites:false,requestedDesiredConfirmed:true,liveFrameLockTelemetry:true,
      matrixPreview:"renderer-telemetry/approximation until local-frame preview bridge is promoted",
      auxPreview:"Matrix 22-pixel projection is the physical source when frame-lock-v1 is active"}
  });
});
