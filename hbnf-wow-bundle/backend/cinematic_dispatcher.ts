// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import mqtt from "npm:mqtt@5.10.4";

const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim();
const PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||"1883")||1883);
const USER=Deno.env.get("HBNF_MQTT_USER")||"", PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const DEV=(Deno.env.get("HBNF_MQTT_TOPIC")||"hbnf/cart/wled1").trim();
const API=`${DEV}/api`, G=`${DEV}/g`, FLOW=`${DEV}/flow`, URL=`mqtt://${HOST}:${PORT}`, FLOW_LIBRARY_REVISION="hbnf-flow-2026-09-19-v10", R2_REV="hbnf-r2-course-2026-09-20-v1", WOW_REV="hbnf-wow-r3-max-2026-09-21-v2";\nconst CONTROL_URL=(Deno.env.get("SUPABASE_URL")||"").replace(/\\/$/,"")+"/functions/v1/hbnf-matrix-control";
const opts=(id:string)=>({connectTimeout:6500,reconnectPeriod:0,clean:true,clientId:id,username:USER||undefined,password:PASS||undefined});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const clean=(v:any)=>String(v??"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim().slice(0,63);
const short=(v:any,max=28)=>{const s=clean(v);return s.length<=max?s:s.slice(0,Math.max(1,max-1))+"…";};
const db=()=>createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});

async function readBrightness(){return await new Promise<number>((resolve)=>{const c=mqtt.connect(URL,opts(`hbnf-cb-${crypto.randomUUID().slice(0,8)}`));let done=false;const finish=(v:any)=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};const n=Number(v);resolve(Number.isFinite(n)&&n>=1&&n<=72?Math.round(n):8);};const t=setTimeout(()=>finish(8),1600);c.on("connect",()=>c.subscribe(G,{qos:0},e=>{if(e)finish(8)}));c.on("message",(_t,p)=>finish(p.toString()));c.on("error",()=>finish(8));});}
async function readRuntime(){return await new Promise<any>((resolve)=>{const c=mqtt.connect(URL,opts(`hbnf-cr-${crypto.randomUUID().slice(0,8)}`));let brightness:any=null,flow:any=null,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};const n=Number(brightness);resolve({brightness:Number.isFinite(n)&&n>=1&&n<=72?Math.round(n):8,flow});};const t=setTimeout(finish,1900);c.on("connect",()=>c.subscribe([G,FLOW],{qos:0},e=>{if(e)finish()}));c.on("message",(topic,p)=>{if(topic===G)brightness=p.toString();if(topic===FLOW){try{flow=JSON.parse(p.toString());}catch{flow=null;}}if(brightness!==null&&flow!==null)finish();});c.on("error",finish);});}
function flowReadyRuntime(r:any){const f=r?.flow;return !!(f&&f.enabled===true&&f.matrixOk===true&&Number(f.pixels)===512&&typeof f.version==="string"&&f.version.length>0);}
function flowArm(ms=120){return{HBNFFlow:{armMs:Math.max(40,Math.min(500,Math.round(Number(ms)||120)))}};}
function flowTextSeg(text:string){return{id:3,start:0,stop:32,startY:0,stopY:16,on:true,bri:255,fx:122,sx:230,ix:128,c1:0,c2:0,c3:16,o1:false,o2:true,o3:false,bm:0,pal:0,col:[[255,255,255],[0,0,0],[0,0,0]],sel:false,n:clean(text),frz:false};}
async function pub(p:any){return await new Promise<void>((res,rej)=>{const c=mqtt.connect(URL,opts(`hbnf-cine-${crypto.randomUUID().slice(0,8)}`));let done=false;const finish=(e?:Error)=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};e?rej(e):res();};const t=setTimeout(()=>finish(new Error("MQTT timeout")),10000);c.on("connect",()=>c.publish(API,JSON.stringify(p),{qos:1,retain:false},async e=>{if(e)return finish(e);await sleep(220);finish();}));c.on("error",e=>finish(e));});}
function eventText(e:any){const p=e.payload??{},type=e.event_type,skins=Math.max(1,Number(p.skins??1)||1),winner=short(p.winner,26),hole=Number(p.hole??0)||0,skinLabel=`${skins} SKIN${skins===1?"":"S"}`;if(type==="ace")return clean(`ACE!${winner?` | ${winner}`:""}`);if(type==="skin_win")return clean(`${p.tiebreaker?"TB":hole?`H${hole}`:"SKINS"} | ${skinLabel}${winner?` | ${winner}`:""}`);if(type==="compound_ace_skin")return clean(`ACE + ${skinLabel}${hole?` | H${hole}`:""}${winner?` | ${winner}`:""}`);if(type==="round_phase")return clean(p.text??(p.section==="back"?"BACK 9 | DOUBLES":"FRONT 9 | SINGLES"));if(type==="skins_results"||type==="glow_results")return clean(p.text??"FINAL RESULTS");return clean(p.text??String(type||"").toUpperCase());}
function holdMs(text:string){const n=[...clean(text)].length;return Math.max(3800,Math.min(7500,3200+n*115));}
function textSeg(text:string,bri=1){return {id:3,start:0,stop:32,startY:0,stopY:16,on:true,bri,fx:122,sx:230,ix:128,c1:0,c2:0,c3:16,o1:false,o2:true,o3:false,bm:2,pal:0,col:[[255,255,255],[0,0,0],[0,0,0]],sel:false,n:clean(text)};}
const TRANSITION_TENTHS=12,TRANSITION_STYLE=0,CARD_TT=3;
function resumeTargetBri(ps:number){return ps===52?68:ps===53?64:ps===54?50:ps===55?66:64;}\nfunction quickKind(e:any){const t=String(e?.event_type??"").toLowerCase();if(t==="ace"||t==="compound_ace_skin")return "ace";if(t==="skin_win")return "skins";return null;}\nasync function controlQuick(kind:string){const r=await fetch(CONTROL_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"quick_event",event:kind})});const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(`semantic quick event failed ${r.status}: ${j?.error??"unknown"}`);return j;}
async function currentControl(sb:any){const{data,error}=await sb.from("hbnf_matrix_control_state").select("mode,auto_live,auto_cinematics,show_family,show_preset,resume_preset,library_revision").eq("id",1).single();if(error)throw error;return data;}
async function playSafe(sb:any,e:any,resumePreset:number|null,brightness:number,text=eventText(e),native=false){
  const b=Math.max(1,Math.min(72,Math.round(brightness||8)));
  if(native){
    try{
      await pub({...flowArm(120),seg:flowTextSeg(text)});
      await sleep(holdMs(text));
    }finally{
      await pub({...flowArm(120),seg:{id:3,on:false,bri:0,n:"",sel:false}}).catch(()=>{});
    }
    return;
  }
  try{
    await pub({on:true,bri:b,tt:0,bs:0,seg:textSeg(text,1)});await sleep(100);
    await pub({tt:CARD_TT,bs:0,seg:[{id:0,on:false},{id:3,bri:255,bm:2}]});await sleep(CARD_TT*110);
    await pub({tt:0,bs:0,seg:{id:0,on:false,bri:0,fx:0}});await sleep(60);
    await sleep(holdMs(text));
  }finally{
    const ctl=await currentControl(sb).catch(()=>null);
    if(ctl?.mode!=="off"&&ctl?.auto_live===true&&resumePreset!==null&&((resumePreset>=50&&resumePreset<=55)||resumePreset===60)){
      const target=resumeTargetBri(resumePreset);
      await pub({seg:{id:3,bm:0,bri:255}});await sleep(40);
      await pub({on:true,bri:b,tt:0,bs:0,ps:resumePreset,"AudioReactive":{"inputLevel":255},"HBNFFlow":{"enabled":false}});await sleep(120);
      await pub({tt:0,bs:0,seg:{id:0,on:true,bri:1}});await sleep(40);
      await pub({tt:0,bs:0,seg:{id:3,bm:2,bri:255}});await sleep(30);
      await pub({tt:CARD_TT,bs:0,seg:[{id:0,on:true,bri:target},{id:3,bri:1,bm:2}]});await sleep(CARD_TT*110);
    }
    await pub({seg:{id:3,on:false,bri:0,n:"",sel:false}}).catch(()=>{});await sleep(60);
  }
}
function transient(err:unknown){return /(mqtt|timeout|timed out|socket|connect|network|econn|dns|broker|overlay|busy|semantic quick)/i.test(String(err));}

Deno.serve(async(req)=>{if(req.method==="GET")return new Response(JSON.stringify({ok:true,service:"hbnf-cinematic-dispatcher",version:"wow-max-v1",semanticQuick:true,revisions:[R2_REV,WOW_REV]}),{headers:{"Content-Type":"application/json"}});const expected=Deno.env.get("HBNF_CINEMATIC_DISPATCH_SECRET")||"",provided=req.headers.get("x-hbnf-dispatch-secret")||"";if(!expected||provided!==expected)return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:{"Content-Type":"application/json"}});const sb=db();let overlayTouched=false,retryQueued:any=null;try{const b=await req.json().catch(()=>({})),worker="dispatcher-"+crypto.randomUUID().slice(0,8);if(b.event_type){const ttl=["skin_win","ace","compound_ace_skin","round_phase"].includes(b.event_type)?120:b.event_type==="manual_cinematic"?30:300;await sb.rpc("hbnf_enqueue_cinematic_event",{p_idempotency_key:clean(b.idempotency_key||crypto.randomUUID()),p_event_type:clean(b.event_type),p_payload:b.payload??{},p_priority:Number(b.priority??40),p_ttl_seconds:ttl});}
let ctl=await currentControl(sb);if(ctl?.mode==="off"||ctl?.auto_live!==true||ctl?.auto_cinematics===false)return new Response(JSON.stringify({ok:true,skipped:true,reason:ctl?.mode==="off"?"matrix_off":"auto_live_or_cinematics_off"}),{headers:{"Content-Type":"application/json"}});
let sawNative=false,sawPixel=false;const fam=String(ctl?.show_family??""),playlistFamily=new Set(["field","showcase","audio","cosmic","pyro","signature","r2"]).has(fam),rp=playlistFamily?Number(ctl?.resume_preset??ctl?.show_preset??50):null,resumePreset=rp!==null&&((rp>=50&&rp<=55)||rp===60)?rp:null;const completed:any[]=[];
for(let i=0;i<5;i++){ctl=await currentControl(sb);if(ctl?.mode==="off"||ctl?.auto_live!==true||ctl?.auto_cinematics===false)break;const {data:e,error}=await sb.rpc("hbnf_claim_cinematic_event",{p_worker:worker});if(error)throw error;if(!e)break;const text=eventText(e),busyMs=holdMs(text)+3600,runtime=await readRuntime(),brightness=runtime.brightness,native=flowReadyRuntime(runtime)&&ctl?.library_revision===FLOW_LIBRARY_REVISION,qkind=[R2_REV,WOW_REV].includes(String(ctl?.library_revision??""))?quickKind(e):null;if(native)sawNative=true;try{await sb.rpc("hbnf_finish_cinematic_event",{p_id:e.id,p_state:"playing",p_error:null});if(qkind){const q=await controlQuick(qkind);sawPixel=true;const end=Date.parse(String(q?.overlayUntil??""));const waitMs=Number.isFinite(end)?Math.max(500,Math.min(15000,end-Date.now()+700)):7000;await sleep(waitMs);}else{await sb.from("hbnf_matrix_control_state").update({overlay_until:new Date(Date.now()+busyMs).toISOString()}).eq("id",1);overlayTouched=true;await playSafe(sb,e,resumePreset,brightness,text,native);}const {data:done}=await sb.rpc("hbnf_finish_cinematic_event",{p_id:e.id,p_state:"completed",p_error:null});completed.push(done??e);}catch(err){const canRetry=transient(err)&&Number(e.attempt_count??0)<3&&new Date(e.expires_at??0).getTime()>Date.now()+5000;if(canRetry){await sb.from("hbnf_cinematic_events").update({state:"pending",claimed_by:null,claimed_at:null,last_error:`transient retry: ${String(err).slice(0,180)}`}).eq("id",e.id);retryQueued=e.id;break;}await sb.rpc("hbnf_finish_cinematic_event",{p_id:e.id,p_state:"failed",p_error:String(err)});throw err;}}
if(overlayTouched)await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);return new Response(JSON.stringify({ok:true,empty:completed.length===0&&!retryQueued,completed:completed.length,events:completed,retryQueued,resumePreset,broker:HOST,render:sawPixel?"wow-pixel-event":(sawNative?"flow-local-text":"dark-single-color-no-white"),renderEngine:sawPixel?(ctl?.library_revision===WOW_REV?"r3-wow-max":"r2-animartrix-vibe"):(sawNative?"local-flow":"legacy")}),{headers:{"Content-Type":"application/json"}});}catch(err){if(overlayTouched)try{await sb.from("hbnf_matrix_control_state").update({overlay_until:null}).eq("id",1);}catch{}return new Response(JSON.stringify({ok:false,error:String(err)}),{status:500,headers:{"Content-Type":"application/json"}})}});