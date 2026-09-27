/* HBNF_CART_UI_V6_OBSERVABLE */
const STATUS_URL="https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-visual-status";
const PUBLISHABLE_KEY="sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
const STORAGE_KEY="hbnf_cart_device_v1";
const COOKIE_KEY="hbnf_cart_device";
const $=id=>document.getElementById(id);

let timer=null;
let stopped=false;

function cookieToken(){
  for(const part of (document.cookie||"").split(/;\s*/)){
    const i=part.indexOf("=");
    if(i<0||part.slice(0,i)!==COOKIE_KEY) continue;
    try{return decodeURIComponent(part.slice(i+1))}catch{return part.slice(i+1)}
  }
  return "";
}
function deviceToken(){
  const local=localStorage.getItem(STORAGE_KEY)||"";
  return /^[a-f0-9]{64}$/i.test(local)?local:cookieToken();
}
function authHeaders(){
  return {"Content-Type":"application/json",apikey:PUBLISHABLE_KEY};
}
function clamp01(v){
  let n=Number(v);
  if(!Number.isFinite(n)) return 0;
  if(n>1) n=n/255;
  return Math.max(0,Math.min(1,n));
}
function setBand(id,value){
  const fill=$(id+"Fill"),out=$(id+"Out");
  if(!fill||!out)return;
  const n=clamp01(value);
  fill.style.width=(n*100).toFixed(0)+"%";
  out.textContent=(n*100).toFixed(0);
}
function setTruth(id,text,state){
  const el=$(id); if(!el)return;
  el.textContent=text;
  el.className=state||"";
}
function sceneButtons(){
  const select=$("scene"),host=$("sceneButtons");
  if(!select||!host||host.dataset.ready==="1") return;
  host.dataset.ready="1";
  const labels={
    "course-flow":"Course Flow",
    "field-mix":"Field Mix",
    "hbnf-signature":"HBNF Signature",
    "quiet-cosmos":"Quiet Cosmos"
  };
  for(const entry of Object.entries(labels)){
    const value=entry[0],label=entry[1];
    const b=document.createElement("button");
    b.type="button";
    b.className="scene-button";
    b.dataset.scene=value;
    b.textContent=label;
    b.addEventListener("click",()=>{
      if(select.value===value)return;
      select.value=value;
      select.dispatchEvent(new Event("change",{bubbles:true}));
      syncSceneButtons(value);
    });
    host.appendChild(b);
  }
  syncSceneButtons(select.value);
}
function syncSceneButtons(value){
  document.querySelectorAll(".scene-button").forEach(b=>b.classList.toggle("active",b.dataset.scene===value));
}
function render(s){
  if(!s)return;
  const matrix=s.devices?.matrix||{},aux=s.devices?.aux||{},sync=s.sync||{},r=s.renderer||{};
  const matrixOk=matrix.confirmed===true;
  const auxOk=aux.confirmed===true;
  const syncOk=sync.healthy===true;
  const rendererOk=r.generator==="anti-repeat-v4"&&r.audioGeometry==="source-coupled-v4";

  setTruth("matrixTruth",matrixOk?("CONFIRMED r"+matrix.confirmedRevision):"PENDING",matrixOk?"ok":"degraded");
  setTruth("auxTruth",auxOk?("CONFIRMED r"+aux.confirmedRevision):"PENDING",auxOk?"ok":"degraded");
  setTruth("syncTruth",syncOk?("LOCKED · Δ"+(sync.seqDistance??0)):(sync.capable?"DEGRADED":"OFFLINE"),syncOk?"ok":"degraded");
  setTruth("rendererTruth",rendererOk?("V4 · #"+(r.variantSequence??"—")):"CHECK",rendererOk?"ok":"degraded");

  const badge=$("truthBadge");
  if(badge){
    if(matrixOk&&auxOk&&syncOk&&rendererOk){badge.textContent="LIVE · CONFIRMED";badge.className="truth-badge good"}
    else if(matrixOk&&auxOk&&rendererOk){badge.textContent="LIVE · SYNC CHECK";badge.className="truth-badge warn"}
    else {badge.textContent="CHECKING HARDWARE";badge.className="truth-badge warn"}
  }

  const mt=s.telemetry?.matrix||{};
  setBand("bass",mt.bass??mt.bassIntensity);
  setBand("mid",mt.mid??mt.mids??mt.midsIntensity);
  setBand("treble",mt.treble??mt.trebleIntensity);
  setBand("impact",mt.impact??mt.pulse??mt.onset);

  const liveMeta=$("liveAudioMeta");
  if(liveMeta){
    const age=Number(sync.rxAgeMs);
    const ageText=Number.isFinite(age)?(age+"ms"):"—";
    liveMeta.textContent="AUX "+(sync.rxActive?"receiving":"waiting")+" · "+ageText;
  }

  const desiredScene=s.desired?.state?.sceneId;
  if(desiredScene) syncSceneButtons(desiredScene);

  const note=$("hardwareNote");
  if(note){
    const family=r.variantFamily??"—",variation=r.variation??"—";
    note.textContent="Family "+family+" · variation "+variation+" · source frame "+(s.telemetry?.matrix?.projectionSeq??"—")+" → AUX "+(s.telemetry?.aux?.projectionRxSeq??"—");
  }
}
async function poll(){
  if(stopped||document.visibilityState==="hidden")return;
  const headers=authHeaders();
  if(!headers)return;
  try{
    const res=await fetch(STATUS_URL,{method:"POST",headers,body:JSON.stringify({action:"status"}),cache:"no-store"});
    if(res.ok)render(await res.json());
  }catch{}
}
function schedule(){
  clearInterval(timer);
  timer=setInterval(poll,1500);
}
sceneButtons();
poll();
schedule();
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")poll()});
window.addEventListener("beforeunload",()=>{stopped=true;clearInterval(timer)});
