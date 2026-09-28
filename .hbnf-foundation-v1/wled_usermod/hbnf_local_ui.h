#pragma once

static const char HBNF_LOCAL_UI[] PROGMEM = R"HBNFHTML(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#071018">
<title>HBNF Cart</title>
<style>
:root{color-scheme:dark;font:16px/1.35 system-ui,sans-serif;background:#071018;color:#eef6f7}
*{box-sizing:border-box}body{margin:0 auto;max-width:620px;padding:18px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
h1{font-size:1.35rem;margin:0}.badge{font-size:.75rem;font-weight:800;padding:6px 9px;border:1px solid #365967;border-radius:999px}
.ok{color:#8ce3ad}.bad{color:#ff9b9b}
.panel{background:#0d1d25;border:1px solid #24414c;border-radius:14px;padding:15px;margin:12px 0}
.scene{display:grid;grid-template-columns:1fr 1fr;gap:8px}
button{font:inherit;color:inherit;background:#142c36;border:1px solid #35606b;border-radius:10px;padding:12px}
button.active{outline:2px solid #65e2c1;background:#173b3b}
label{display:grid;gap:7px;margin:15px 0}.head{display:flex;justify-content:space-between;font-weight:750}
input[type=range]{width:100%}.sub{color:#9bb5bd;font-size:.82rem;margin:3px 0 0}
</style>
</head>
<body>
<header><h1>HBNF Cart</h1><span id="conn" class="badge bad">CONNECTING</span></header>

<section class="panel">
<div class="scene">
<button data-scene="course-flow">Course Flow</button>
<button data-scene="field-mix">Field Mix</button>
<button data-scene="hbnf-signature">HBNF Signature</button>
<button data-scene="quiet-cosmos">Quiet Cosmos</button>
</div>
</section>

<section class="panel">
<label><span class="head"><span>Motion</span><output id="motionOut">50</output></span>
<input id="motion" type="range" min="0" max="100" value="50"></label>
<label><span class="head"><span>Audio response</span><output id="audioOut">50</output></span>
<input id="audio" type="range" min="0" max="100" value="50"></label>
<p class="sub">Direct local controls. No cloud command path.</p>
</section>

<section class="panel">
<label><span class="head"><span>Matrix brightness</span><output id="matrixOut">24</output></span>
<input id="matrix" type="range" min="0" max="255" value="24"></label>
<label><span class="head"><span>Underglow brightness</span><output id="auxOut">180</output></span>
<input id="aux" type="range" min="0" max="255" value="180"></label>
</section>

<script>
const $=s=>document.querySelector(s);
let ws=null,fx=null,retry=null;
const state={scene:"course-flow",motion:50,audio:50};
const sceneName=n=>["course-flow","field-mix","hbnf-signature","quiet-cosmos"][Number(n)]||"course-flow";

function badge(ok){
 const e=$("#conn"); e.textContent=ok?"LOCAL · CONNECTED":"RECONNECTING"; e.className="badge "+(ok?"ok":"bad");
}
function send(obj){if(ws&&ws.readyState===1)ws.send(JSON.stringify(obj))}
function ensureFx(extra={}){
 const seg=fx==null?undefined:[{id:0,fx},{id:1,fx}];
 send(Object.assign({HBNF:{scene:state.scene,motion:state.motion,audioResponse:state.audio}},seg?{seg}:{},extra));
}
function hydrate(s){
 if(!s)return;
 const h=s.HBNF||{};
 if(h.effectId!=null)fx=Number(h.effectId);
 if(h.scene!=null)state.scene=typeof h.scene==="number"?sceneName(h.scene):h.scene;
 if(h.motion!=null)state.motion=Number(h.motion);
 if(h.audioResponse!=null)state.audio=Number(h.audioResponse);
 $("#motion").value=state.motion;$("#motionOut").value=state.motion;
 $("#audio").value=state.audio;$("#audioOut").value=state.audio;
 document.querySelectorAll("[data-scene]").forEach(b=>b.classList.toggle("active",b.dataset.scene===state.scene));
 const seg=Array.isArray(s.seg)?s.seg:[];
 const m=seg.find(x=>Number(x.id)===0),a=seg.find(x=>Number(x.id)===1);
 if(m&&m.bri!=null){$("#matrix").value=m.bri;$("#matrixOut").value=m.bri}
 if(a&&a.bri!=null){$("#aux").value=a.bri;$("#auxOut").value=a.bri}
}
function connect(){
 clearTimeout(retry);
 ws=new WebSocket("ws://"+location.host+"/ws");
 ws.onopen=()=>{badge(true);ws.send('{"v":true}')};
 ws.onclose=()=>{badge(false);retry=setTimeout(connect,500)};
 ws.onerror=()=>ws.close();
 ws.onmessage=e=>{
   if(typeof e.data!=="string"||e.data==="pong")return;
   try{const j=JSON.parse(e.data);if(j.state)hydrate(j.state)}catch(_){}
 };
}
connect();
setInterval(()=>{if(ws&&ws.readyState===1)ws.send("p")},5000);

document.querySelectorAll("[data-scene]").forEach(b=>b.onclick=()=>{
 state.scene=b.dataset.scene;
 document.querySelectorAll("[data-scene]").forEach(x=>x.classList.toggle("active",x===b));
 ensureFx();
});

function liveRange(id,out,apply){
 const el=$(id),o=$(out); let timer=null;
 el.oninput=()=>{o.value=el.value;clearTimeout(timer);timer=setTimeout(()=>apply(Number(el.value)),35)};
 el.onchange=()=>apply(Number(el.value));
}
liveRange("#motion","#motionOut",v=>{state.motion=v;ensureFx()});
liveRange("#audio","#audioOut",v=>{state.audio=v;ensureFx()});
liveRange("#matrix","#matrixOut",v=>send({seg:[{id:0,bri:v}]}));
liveRange("#aux","#auxOut",v=>send({seg:[{id:1,bri:v}]}));
</script>
</body>
</html>
)HBNFHTML";
