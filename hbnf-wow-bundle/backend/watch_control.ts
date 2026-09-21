// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN_SHA="b8443047fc85ec9d46c94113b0841c7ac6ea45d0746f33ebae806207b78dd8af";
const PROJECT="phcpbvuqibyarpfrftgx";
const MATRIX_URL="https://"+PROJECT+".supabase.co/functions/v1/hbnf-matrix-control";
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

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST") return json({ok:false,error:"POST required"},405);
 const body=await req.json().catch(()=>({}));
 const token=String(req.headers.get("x-hbnf-watch-token")||body?.token||"");
 if(!token||await sha(token)!==TOKEN_SHA) return json({ok:false,error:"Unauthorized"},401);
 const action=String(body?.action||"status").toLowerCase();
 try{
  if(action==="status"){
   const r=await matrix("status");
   return json({ok:true,online:r?.online===true,mode:r?.control?.auto_live?"LIVE":"PURE",show:r?.control?.show_family||null,preset:r?.telemetry?.preset??null,playlistActive:r?.telemetry?.playlistActive??null,brightness:r?.telemetry?.brightness??null,engine:r?.renderEngine||null,wow:r?.r3Wow||null,actions:["status","live","pure","next","scoreboard","ace_pot","ace","nice_shot","ctp","skins","text","blackout","brightness"]});
  }
  if(action==="r2"||action==="pure") return json(await matrix("play_show",{family:"r2",live:false}));
  if(action==="live") return json(await matrix("play_show",{family:"r2",live:true}));
  if(action==="next") return json(await matrix("next_look"));
  if(action==="scoreboard"||action==="scores") return json(await matrix("scores"));
  if(action==="ace_pot"||action==="acepot") return json(await matrix("ace_pot"));
  if(action==="ace") return json(await matrix("quick_event",{event:"ace"}));
  if(action==="nice_shot"||action==="niceshot") return json(await matrix("quick_event",{event:"nice_shot"}));
  if(action==="ctp") return json(await matrix("quick_event",{event:"ctp"}));
  if(action==="skins"||action==="skin") return json(await matrix("quick_event",{event:"skins"}));
  if(action==="text"){
   const text=String(body?.text||"").trim().replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").slice(0,63);
   if(!text) return json({ok:false,error:"Text is required."},400);
   const color=String(body?.color||"#FFFFFF");
   return json(await matrix("text",{text,color}));
  }
  if(action==="blackout") return json(await matrix("blackout"));
  if(action==="brightness"){
   const b=Number(body?.brightness);
   if(![8,16,24,40].includes(b)) return json({ok:false,error:"Watch brightness must be 8, 16, 24, or 40."},400);
   return json(await matrix("brightness",{brightness:b}));
  }
  return json({ok:false,error:"Unknown action"},400);
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},409);}
});