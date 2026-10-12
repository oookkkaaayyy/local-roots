const MATRIX_CANDIDATE="hbnf-cart2-phase2-r6-incremental-controls-20261011";
const MATRIX_MAC="70:4b:ca:5b:34:5c";
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function service(req:Request){const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";return !!k&&req.headers.get("Authorization")===`Bearer ${k}`;}
// Compatibility endpoint only. It is no longer a command writer. Matrix writes are owned by the authenticated Opal relay.
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 if(!service(req))return json({error:"unauthorized"},401);
 const p=await req.json().catch(()=>null);
 if(!p||p.deviceId!=="matrix"||!Number.isSafeInteger(p.cartRevision)||!Number.isSafeInteger(p.fenceEpoch)||typeof p.release!=="string")return json({error:"invalid_projection"},400);
 return json({confirmed:false,commandApplicationConfirmed:false,transportConfirmed:false,status:"pending_relay",
  failureCode:"matrix_writer_moved_to_opal_relay",deviceId:"matrix",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,
  candidate:MATRIX_CANDIDATE,matrixMac:MATRIX_MAC},409);
});
