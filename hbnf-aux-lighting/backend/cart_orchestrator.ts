// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BASE=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const MATRIX=BASE+"/functions/v1/hbnf-matrix-control";
const AUX=BASE+"/functions/v1/hbnf-aux-control";
const TARGET_RELEASE="hbnf-wow-r3-max-2026-09-21-v3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
async function post(url:string,body:any,timeout=14000){const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});const t=await r.text();let j:any;try{j=JSON.parse(t)}catch{j={raw:t}}if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP ${r.status}`);return j;}
async function get(url:string,timeout=8000){const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});const t=await r.text();let j:any;try{j=JSON.parse(t)}catch{j={raw:t}}if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP ${r.status}`);return j;}
async function readiness(){const [m,a]=await Promise.allSettled([post(MATRIX,{action:"status"}),get(AUX)]);const matrix=m.status==="fulfilled"?m.value:null,aux=a.status==="fulfilled"?a.value:null;const release=matrix?.control?.library_revision??null,engine=matrix?.renderEngine??null;return{matrixOk:!!matrix&&matrix.online===true&&release===TARGET_RELEASE&&engine==="r3-wow-max",matrix,auxOk:!!aux,aux,auxEnabled:aux?.enabled===true,mixedLoadAccepted:aux?.mixedLoadAccepted===true,targetRelease:TARGET_RELEASE};}
function scenePlan(scene:string){const live=scene==="skins_live"||scene==="glow_live",auxMode=scene==="glow_live"?"glow_live":"music";return{scene,matrix:{action:"play_show",family:"r2",live,preserveCurrentBrightness:true,targetRelease:TARGET_RELEASE},aux:{action:"mode",mode:auxMode},startOrder:"matrix-then-aux",matrixRollbackOnAuxFailure:false};}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method==="GET"){const r=await readiness();return json({ok:true,service:"hbnf-cart-orchestrator",version:"v4-r3-dynamic-gate",architecture:"R3 Matrix is visual master; aux enablement is driven by physical commissioning state; global off has highest priority",safety:{globalOffAlwaysAttemptsBoth:true,startOrder:"matrix-then-aux",matrixRollbackOnAuxFailure:false,preserveMatrixBrightness:true,targetMatrixRelease:TARGET_RELEASE},readiness:r,scenes:{music:scenePlan("music"),skins_live:scenePlan("skins_live"),glow_live:scenePlan("glow_live"),showcase:scenePlan("showcase"),all_off:{matrix:"blackout",aux:"blackout"}}});}
 if(req.method!=="POST")return json({ok:false,error:"GET or POST required"},405);
 const b=await req.json().catch(()=>({})),scene=String(b?.scene||"").toLowerCase(),action=String(b?.action||"").toLowerCase();
 try{
  if(action==="readiness")return json({ok:true,action,readiness:await readiness()});
  if(action==="dry_run"){if(!["music","skins_live","glow_live","showcase","all_off"].includes(scene))return json({ok:false,error:"Unknown cart scene"},400);return json({ok:true,action,mutationIssued:false,plan:scene==="all_off"?{scene,matrix:{action:"blackout"},aux:{action:"blackout"}}:scenePlan(scene),readiness:await readiness()});}
  if(scene==="all_off"){const jobs=[post(MATRIX,{action:"blackout"}),post(AUX,{action:"blackout"})];const results=await Promise.allSettled(jobs),matrixOk=results[0].status==="fulfilled",auxOk=results[1].status==="fulfilled",ok=matrixOk&&auxOk;return json({ok,scene,results,safetyAction:true},ok?200:503);}
  if(!["music","skins_live","glow_live","showcase"].includes(scene))return json({ok:false,error:"Unknown cart scene"},400);
  const ready=await readiness();
  if(!ready.matrixOk)return json({ok:false,error:"R3 Matrix is not ready for unified cart control.",readiness:ready},409);
  if(!ready.auxEnabled)return json({ok:false,error:"Aux remains locked until physical commissioning is accepted.",readiness:ready},409);
  if(scene==="glow_live"&&!ready.mixedLoadAccepted)return json({ok:false,error:"GLOW LIVE remains locked until mixed-load physical acceptance passes.",readiness:ready},409);
  const plan=scenePlan(scene),m=await post(MATRIX,plan.matrix);
  try{const a=await post(AUX,plan.aux);return json({ok:true,scene,matrix:m,aux:a,startOrder:"matrix-then-aux",matrixRollbackOnAuxFailure:false});}
  catch(auxError){return json({ok:false,error:auxError instanceof Error?auxError.message:String(auxError),scene,matrix:m,aux:null,partial:{matrixApplied:true,auxApplied:false},matrixPreserved:true},503);}
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},503);}
});