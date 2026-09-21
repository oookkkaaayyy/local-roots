// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_SHA="b8443047fc85ec9d46c94113b0841c7ac6ea45d0746f33ebae806207b78dd8af";
const PROJECT="phcpbvuqibyarpfrftgx";
const SYNC_URL="https://"+PROJECT+".supabase.co/functions/v1/hbnf-matrix-sync3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-hbnf-watch-token","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const clean=(v:any)=>String(v??"").trim().replace(/\s*\/\s*/g," / ").replace(/\s+/g," ");
const laDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const blankScores=()=>Array.from({length:18},()=>'');

function teamName(p:any){const a=clean(p?.partner1),b=clean(p?.partner2);return clean(a&&b?`${a} / ${b}`:(p?.name||a||b));}
function rebuildPlayers(w:any){
 const existing=new Map((Array.isArray(w?.players)?w.players:[]).map((p:any)=>[String(p?.id||""),p]));
 const next:any[]=[];
 for(const card of (Array.isArray(w?.cards)?w.cards:[])){
  for(const e of (Array.isArray(card?.players)?card.players:[])){
   const name=teamName(e); if(!name) continue;
   const id=String(e?.id||"").trim()||`${String(card?.id||"C")}_${next.length+1}`;
   const prev=existing.get(id)||{};
   next.push({id,name,partner1:clean(e?.partner1),partner2:clean(e?.partner2),cardId:String(card?.id||prev?.cardId||""),scores:Array.from({length:18},(_,i)=>String((Array.isArray(prev?.scores)?prev.scores:[])[i]??"")),removed:false});
  }
 }
 if(!next.length){
  for(const p of (Array.isArray(w?.players)?w.players:[])){
   if(p?.removed||!teamName(p)) continue;
   next.push({...p,name:teamName(p),scores:Array.from({length:18},(_,i)=>String((Array.isArray(p?.scores)?p.scores:[])[i]??""))});
  }
 }
 return next;
}
function hasTeams(w:any){return rebuildPlayers(w).length>0;}
function pickRound(root:any,requested?:string){
 const weeks=root?.glow?.weeks||{}, today=laDate();
 if(requested) return String(requested);
 return today;
}
function cardLocked(w:any,p:any){
 if(w?.scoresLocked) return true;
 const card=(Array.isArray(w?.cards)?w.cards:[]).find((c:any)=>String(c?.id||"")===String(p?.cardId||""));
 return !!card?.finalized;
}
function teamSummary(w:any,p:any){
 const s=Array.from({length:18},(_,i)=>String((p?.scores||[])[i]??""));
 const nextIdx=s.findIndex(v=>v.trim()==="");
 let last=-1; for(let i=17;i>=0;i--) if(s[i].trim()!==""){last=i;break;}
 const next=nextIdx<0?null:nextIdx+1,locked=cardLocked(w,p),name=teamName(p);return {id:String(p.id),name,card:String(p.cardId||""),next_hole:next,completed:s.filter(v=>v.trim()!=="").length,last_hole:last<0?null:last+1,last_score:last<0?null:Number(s[last]),locked,choice:locked?`LOCKED · ${name}`:next===null?`DONE · ${name}`:`H${next} · ${name}`};
}
function validateMutationAnchor(w:any,p:any,body:any,action:string){
 const suppliedChoice=String(body?.choice||"");
 const current=teamSummary(w,p);
 if(suppliedChoice && current.choice!==suppliedChoice) throw new Error("That Watch selection is stale. Refresh the team list before changing a score.");
 const explicitHole=Number(body?.hole)||0;
 if(action==="clear"&&!explicitHole) throw new Error("Clear requires an explicit hole.");
 if((action==="score"||action==="set")&&!explicitHole&&!suppliedChoice) throw new Error("A current Watch team choice is required when scoring the next hole.");
 if(action==="undo"&&!suppliedChoice&&!explicitHole) throw new Error("A current Watch team choice or explicit hole is required for undo.");
 if(explicitHole&&(explicitHole<1||explicitHole>18)) throw new Error("Hole must be 1-18.");
 return current;
}

async function saveWithRetry(sb:any,mutate:(root:any)=>any){
 for(let attempt=0;attempt<4;attempt++){
  const {data,error}=await sb.from("league_state").select("state_json,updated_at").eq("id",1).single();
  if(error) throw error;
  const root=structuredClone(data?.state_json||{});
  const result=mutate(root);
  const now=new Date().toISOString();
  const q=await sb.from("league_state").update({state_json:root,updated_at:now}).eq("id",1).eq("updated_at",data.updated_at).select("updated_at").maybeSingle();
  if(q.error) throw q.error;
  if(q.data) return result;
  await new Promise(r=>setTimeout(r,80*(attempt+1)));
 }
 throw new Error("Score update conflicted with another device. Try once more.");
}
declare const EdgeRuntime:{waitUntil(p:Promise<unknown>):void};

Deno.serve(async(req)=>{
 if(req.method==="GET") return json({ok:true,service:"hbnf-watch-score",version:"wow-max-v3-safe-score",actions:["state","score","set","undo","clear"]});
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST") return json({ok:false,error:"POST required"},405);
 const body=await req.json().catch(()=>({}));
 const token=String(req.headers.get("x-hbnf-watch-token")||body?.token||"");
 if(!token || await sha(token)!==TOKEN_SHA) return json({ok:false,error:"Unauthorized"},401);
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const action=String(body?.action||"state").toLowerCase();
 try{
  if(action==="state"){
   const {data,error}=await sb.from("league_state").select("state_json,updated_at").eq("id",1).single(); if(error)throw error;
   const root=data?.state_json||{}, round=pickRound(root,body?.round_date), w=root?.glow?.weeks?.[round]||null;
   if(!w) return json({ok:false,error:"No Glow round found.",round_date:round,teams:[]},404);
   const teams=rebuildPlayers(w).map((p:any)=>teamSummary(w,p));
   return json({ok:true,round_date:round,active_week:root?.glow?.activeWeek||null,teams,choices:teams.filter((t:any)=>!t.locked&&t.next_hole!==null).map((t:any)=>t.choice),all_locked:!!w?.scoresLocked,updated_at:data.updated_at});
  }
  if(action==="score"||action==="set"||action==="undo"||action==="clear"){
   const result=await saveWithRetry(sb,(root:any)=>{
    root.glow=root.glow||{}; root.glow.weeks=root.glow.weeks||{};
    const round=pickRound(root,body?.round_date), w=root.glow.weeks[round];
    if(!w) throw new Error("No Glow round found.");
    w.players=rebuildPlayers(w);
    const teamId=String(body?.team_id||""),choice=String(body?.choice||"");
    let p=teamId?w.players.find((x:any)=>String(x?.id||"")===teamId):null;
    if(!p&&choice){const matches=w.players.filter((x:any)=>teamSummary(w,x).choice===choice);if(matches.length===1)p=matches[0];}
    if(!p&&body?.team_name){const n=clean(body.team_name);const matches=w.players.filter((x:any)=>teamName(x)===n);if(matches.length===1)p=matches[0];}
    if(!p) throw new Error("Team not found.");
    if(cardLocked(w,p)) throw new Error("That team/card is finalized.");
    const anchored=validateMutationAnchor(w,p,body,action);
    p.scores=Array.from({length:18},(_,i)=>String((p.scores||[])[i]??""));
    let hole:number;
    if(action==="undo"){
      const explicit=Number(body?.hole)||0;
      if(explicit){
        hole=explicit;
        if(String(p.scores[hole-1]).trim()==="") throw new Error("That hole has no score to undo.");
      }else{
        let i=-1; for(let j=17;j>=0;j--) if(String(p.scores[j]).trim()!==""){i=j;break;}
        if(i<0) throw new Error("No score to undo.");
        hole=i+1;
      }
      p.scores[hole-1]="";
    }else{
      hole=Number(body?.hole)||0;
      if(!hole){
        const anchoredHole=Number(anchored?.next_hole)||0;
        if(!anchoredHole) throw new Error("Round already complete for this team.");
        hole=anchoredHole;
      }
      if(action==="clear"){p.scores[hole-1]="";}
      else{
        const n=Number(body?.score);
        if(!Number.isInteger(n)||n<1||n>20) throw new Error("Score must be a whole number from 1-20.");
        p.scores[hole-1]=String(n);
      }
    }
    if(round===laDate())root.glow.activeWeek=round;
    const summary=teamSummary(w,p);
    return {ok:true,action,round_date:round,team_id:p.id,team:teamName(p),hole,score:p.scores[hole-1]===""?null:Number(p.scores[hole-1]),next_hole:summary.next_hole,completed:summary.completed,message:p.scores[hole-1]===""?`Cleared H${hole} · ${teamName(p)}`:`H${hole} · ${teamName(p)} = ${p.scores[hole-1]}`};
   });
   try{EdgeRuntime.waitUntil(fetch(SYNC_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:"apple-watch-score"})}).catch(()=>null));}catch{}
   return json(result);
  }
  return json({ok:false,error:"Unknown action"},400);
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},409);}
});