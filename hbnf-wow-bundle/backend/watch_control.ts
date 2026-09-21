// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN_SHA="b8443047fc85ec9d46c94113b0841c7ac6ea45d0746f33ebae806207b78dd8af";
const PROJECT="phcpbvuqibyarpfrftgx";
const MATRIX_URL="https://"+PROJECT+".supabase.co/functions/v1/hbnf-matrix-control";
const AUX_URL="https://"+PROJECT+".supabase.co/functions/v1/hbnf-aux-control-staging";
const CART_URL="https://"+PROJECT+".supabase.co/functions/v1/hbnf-cart-orchestrator-staging";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-hbnf-watch-token","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");

async function matrix(action:string,payload:any={}){
 const r=await fetch(MATRIX_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(10000)});
 const t=await r.text();
 let body:any;try{body=JSON.parse(t)}catch{body={raw:t}}
 if(!r.ok||body?.ok===false) throw new Error(body?.error||("Matrix HTTP "+r.status));
 return body;
}
async function service(url:string,body:any){
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const t=await r.text();let j:any;try{j=JSON.parse(t)}catch{j={raw:t}}
 if(!r.ok||j?.ok===false) throw new Error(j?.error||("Service HTTP "+r.status));
 return j;
}
async function auxMeta(){try{const r=await fetch(AUX_URL,{signal:AbortSignal.timeout(3500)});return await r.json()}catch{return {ok:false,enabled:false}}}


Deno.serve(async(req)=>{
 if(req.method==="GET") return json({ok:true,service:"hbnf-watch-control",version:"wow-max-v3-aux-ready",actions:["status","live","pure","next","scoreboard","ace_pot","ace","nice_shot","nice_putt","ctp","skins","glow","text","blackout","brightness","aux_status","uv_full","uv_main","uv_short","uv_off","cart_music","cart_skins_live","cart_glow_live","cart_all_off"]});
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST") return json({ok:false,error:"POST required"},405);
 const body=await req.json().catch(()=>({}));
 const token=String(req.headers.get("x-hbnf-watch-token")||body?.token||"");
 if(!token||await sha(token)!==TOKEN_SHA) return json({ok:false,error:"Unauthorized"},401);
 const action=String(body?.action||"status").toLowerCase();
 try{
  if(action==="status"){
   const [r,a]=await Promise.all([matrix("status"),auxMeta()]);
   return json({ok:true,online:r?.online===true,mode:r?.control?.auto_live?"LIVE":"PURE",show:r?.control?.show_family||null,preset:r?.telemetry?.preset??null,playlistActive:r?.telemetry?.playlistActive??null,brightness:r?.telemetry?.brightness??null,engine:r?.renderEngine||null,wow:r?.r3Wow||null,auxPrepared:a?.ok===true,auxEnabled:a?.enabled===true,actions:["status","live","pure","next","scoreboard","ace_pot","ace","nice_shot","nice_putt","ctp","skins","glow","text","blackout","brightness","aux_status","uv_full","uv_main","uv_short","uv_off","cart_music","cart_skins_live","cart_glow_live","cart_all_off"]});
  }
  if(action==="r2"||action==="pure") return json(await matrix("play_show",{family:"r2",live:false}));
  if(action==="live") return json(await matrix("play_show",{family:"r2",live:true}));
  if(action==="next") return json(await matrix("next_look"));
  if(action==="scoreboard"||action==="scores") return json(await matrix("scores"));
  if(action==="ace_pot"||action==="acepot") return json(await matrix("ace_pot"));
  if(action==="ace") return json(await matrix("quick_event",{event:"ace"}));
  if(action==="nice_shot"||action==="niceshot") return json(await matrix("quick_event",{event:"nice_shot"}));
  if(action==="nice_putt"||action==="niceputt") return json(await matrix("quick_event",{event:"nice_putt"}));
  if(action==="glow") return json(await matrix("quick_event",{event:"glow"}));
  if(action==="ctp") return json(await matrix("quick_event",{event:"ctp"}));
  if(action==="skins"||action==="skin") return json(await matrix("quick_event",{event:"skins"}));
  if(action==="text"){
   const text=String(body?.text||"").trim().replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").slice(0,63);
   if(!text) return json({ok:false,error:"Text is required."},400);
   const color=String(body?.color||"#FFFFFF");
   return json(await matrix("text",{text,color}));
  }
  if(action==="aux_status") return json(await service(AUX_URL,{action:"status"}));
  if(action==="uv_full") return json(await service(AUX_URL,{action:"uv",mode:"full"}));
  if(action==="uv_main") return json(await service(AUX_URL,{action:"uv",mode:"main"}));
  if(action==="uv_short") return json(await service(AUX_URL,{action:"uv",mode:"short"}));
  if(action==="uv_off") return json(await service(AUX_URL,{action:"uv",mode:"off"}));
  if(action==="cart_music") return json(await service(CART_URL,{scene:"music"}));
  if(action==="cart_skins_live") return json(await service(CART_URL,{scene:"skins_live"}));
  if(action==="cart_glow_live") return json(await service(CART_URL,{scene:"glow_live"}));
  if(action==="cart_all_off") return json(await service(CART_URL,{scene:"all_off"}));
  if(action==="blackout") return json(await matrix("blackout"));
  if(action==="brightness"){
   const b=Number(body?.brightness);
   if(![8,16,24,40].includes(b)) return json({ok:false,error:"Watch brightness must be 8, 16, 24, or 40."},400);
   return json(await matrix("brightness",{brightness:b}));
  }
  return json({ok:false,error:"Unknown action"},400);
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},409);}
});