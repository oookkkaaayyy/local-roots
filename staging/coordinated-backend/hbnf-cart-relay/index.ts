import {createClient} from "npm:@supabase/supabase-js@2.57.0";
import {buildWledProjection,checkDecision,MATRIX_CANDIDATE,MATRIX_MAC,normalizeReadback} from "./projection.ts";
import {relayTokenAuthorized} from "./relay-auth.ts";
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function auth(req:Request){return relayTokenAuthorized(req.headers.get("Authorization"),Deno.env.get("HBNF_MATRIX_RELAY_TOKEN")??"",Deno.env.get("HBNF_MATRIX_RELAY_ID")??"");}
function db(){const u=Deno.env.get("SUPABASE_URL"),k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!u||!k)throw Error("relay_backend_not_configured");return createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}});}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!auth(req))return reply({error:"unauthorized"},401);
 const relayId=Deno.env.get("HBNF_MATRIX_RELAY_ID")!,client=db(),ct=req.headers.get("content-type")??"";
 if(ct.includes("application/json")){
  const b=await req.json().catch(()=>null);
  if(b?.op!=="next"||b.relayId!==relayId||String(b.matrixMac??"").toLowerCase().replaceAll(":","")!==MATRIX_MAC.replaceAll(":","")||b.candidate!==MATRIX_CANDIDATE)return reply({error:"invalid_relay_request"},400);
  const {data:c,error:e}=await client.rpc("hbnf_cart_get_context",{p_cart_id:"hbnf-cart"}),d=c?.desired,f=c?.fence;
  if(e||!d||!f?.active||!Number.isSafeInteger(d.revision)||!Number.isSafeInteger(f.epoch)||typeof f.release_id!=="string")return reply({error:"canonical_state_or_fence_unavailable"},503);
  let built;try{built=await buildWledProjection(c,d.revision,f.epoch);}catch(err){return reply({error:(err as Error).message||"projection_invalid"},422);}
  const {data:id,error:ie}=await client.rpc("hbnf_cart_matrix_relay_issue",{p_relay_id:relayId,p_cart_id:"hbnf-cart",
   p_desired_revision:d.revision,p_fence_epoch:f.epoch,p_release_id:f.release_id,p_matrix_mac:MATRIX_MAC,
   p_candidate:MATRIX_CANDIDATE,p_expected_state:built.expectedState,p_wled_payload:built.wledPayload,p_ttl_seconds:20});
  if(ie||typeof id!=="string")return reply({error:"challenge_issue_failed"},503);
  return reply({challengeId:id,cartRevision:d.revision,fenceEpoch:f.epoch,releaseId:f.release_id,candidate:MATRIX_CANDIDATE,
   matrixMac:MATRIX_MAC,expiresInSeconds:20,expectedState:built.expectedState,wledPayload:built.wledPayload});
 }
 if(!ct.includes("multipart/form-data"))return reply({error:"invalid_content_type"},415);
 const form=await req.formData().catch(()=>null);
 if(!form||form.get("op")!=="check"||form.get("relayId")!==relayId)return reply({error:"invalid_relay_request"},400);
 const id=String(form.get("challengeId")??"");if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:"invalid_challenge"},400);
 const file=async(k:string)=>{const v=form.get(k);if(!(v instanceof File)||v.size>100000)throw Error("readback_missing_or_oversized");return JSON.parse(await v.text());};
 let info:any,state:any,actual:any;try{info=await file("info");state=await file("state");actual=normalizeReadback(info,state);}catch(err){return reply({error:(err as Error).message||"readback_invalid"},422);}
 if(actual.candidate!==MATRIX_CANDIDATE||actual.hbnf.candidate!==MATRIX_CANDIDATE)return reply({error:"candidate_identity_mismatch"},409);
 const {data:challenge,error:ge}=await client.rpc("hbnf_cart_matrix_relay_get",{p_challenge_id:id,p_relay_id:relayId});
 if(ge||!challenge)return reply({error:"challenge_expired_or_consumed"},409);
 const decision=checkDecision(challenge,actual,Date.now());
 if(decision==="stale")return reply({error:"challenge_expired_or_consumed"},409);
 if(decision==="confirm"){
  const report={protocol:"opal-wled-json-readback-v1",relayId,matrixMac:MATRIX_MAC,candidate:MATRIX_CANDIDATE,
   deviceUptimeSec:Number(state?.HBNF?.timing?.uptimeSec),wledVersion:String(info?.ver??""),readback:actual};
  const {data:ok,error:ce}=await client.rpc("hbnf_cart_matrix_relay_confirm",{p_challenge_id:id,p_relay_id:relayId,p_verified_state:actual,p_reported:report});
  if(ce||ok!==true)return reply({error:"revision_fence_or_readback_changed"},409);
  return reply({status:state.on===false?"off":"confirmed",confirmed:true,commandApplicationConfirmed:true,
   cartRevision:challenge.desired_revision,fenceEpoch:challenge.fence_epoch,releaseId:challenge.release_id,matrixMac:MATRIX_MAC,candidate:MATRIX_CANDIDATE});
 }
 if(decision==="mismatch_after_apply")return reply({error:"readback_mismatch_after_single_apply"},409);
 const {data:allowed,error:ae}=await client.rpc("hbnf_cart_matrix_relay_authorize_apply",{p_challenge_id:id,p_relay_id:relayId});
 if(ae||allowed!==true)return reply({error:"apply_not_authorized_or_stale"},409);
 return reply({status:"apply_required",wledPayload:challenge.wled_payload},409);
});