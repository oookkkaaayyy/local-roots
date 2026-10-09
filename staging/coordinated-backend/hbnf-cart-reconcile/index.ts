import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const DEVICES=["matrix","aux"] as const;
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key||(req.headers.get("Authorization")??"")!==`Bearer ${key}`)return reply({error:"unauthorized"},401);
 const body=await req.json().catch(()=>null);
 if(!body||body.cartId!=="hbnf-cart"||!Number.isSafeInteger(body.revision)||!Number.isSafeInteger(body.fenceEpoch)||typeof body.releaseId!=="string")return reply({error:"invalid_request"},400);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:c,error}=await db.rpc("hbnf_cart_get_context",{p_cart_id:"hbnf-cart"}),d=c?.desired,f=c?.fence;
 if(error||!d||!f?.active||d.revision!==body.revision||f.epoch!==body.fenceEpoch||f.release_id!==body.releaseId)return reply({error:"stale_fence_or_state"},409);
 const requested=Array.isArray(body.targetDevices)?body.targetDevices.filter((x:any)=>DEVICES.includes(x)):["matrix","aux"];
 const targets=[...new Set(requested)];
 const effective=new Set(targets);if(effective.has("aux"))effective.add("matrix");
 return reply({cartRevision:d.revision,fenceEpoch:f.epoch,releaseId:f.release_id,targetDevices:targets,
  effectiveTargets:[...effective],architecture:"single-opal-wled-json-writer",status:"pending_relay",
  results:[...effective].map(deviceId=>({deviceId,status:deviceId==="matrix"?"pending_relay":"matrix_ddp_owned_unconfirmed",
   confirmed:false,commandApplicationConfirmed:false}))},202);
});
