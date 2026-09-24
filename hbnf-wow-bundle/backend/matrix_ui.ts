import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const HTML=String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050706">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="HBNF Matrix">
<title>HBNF Matrix</title>
<style>
:root{--bg:#050706;--panel:#101411;--panel2:#171c18;--line:#2b342d;--txt:#f7faf7;--mut:#98a49b;--lime:#b9f377;--red:#ff8f9b;--blue:#9ed8ff;--shadow:0 14px 40px rgba(0,0,0,.28)}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}body{padding:calc(env(safe-area-inset-top) + 8px) 14px calc(86px + env(safe-area-inset-bottom));min-height:100vh}
.app{max-width:620px;margin:auto}.top{display:flex;align-items:center;justify-content:space-between;padding:8px 2px 12px}.device{display:flex;gap:9px;align-items:center}.dot{width:10px;height:10px;border-radius:50%;background:#6b726d;box-shadow:0 0 0 4px rgba(255,255,255,.04)}.dot.online{background:var(--lime);box-shadow:0 0 0 4px rgba(185,243,119,.12)}.name{font-weight:900;font-size:18px}.mini{font-size:12px;color:var(--mut);margin-top:2px}.power{border:1px solid var(--line);background:var(--panel);color:var(--txt);border-radius:14px;padding:10px 14px;font-weight:800}
.hero{background:linear-gradient(150deg,#131a15,#0d110e);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow)}.eyebrow{font-size:11px;font-weight:850;letter-spacing:.12em;color:var(--mut)}.heroRow{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-top:6px}.scene{font-size:25px;font-weight:950;line-height:1.02;letter-spacing:-.035em}.badge{font-size:11px;font-weight:900;padding:7px 10px;border-radius:999px;border:1px solid #466037;background:#182219;color:var(--lime);white-space:nowrap}.badge.lock{border-color:#735c28;background:#241e10;color:#ffd66c}.facts{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px}.fact{font-size:11px;color:var(--mut);background:#090c0a;border:1px solid #232a24;padding:7px 9px;border-radius:999px}
.transport{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:9px;margin-top:14px}.transport button{min-height:60px}.primary{background:var(--lime)!important;color:#14200e!important;border-color:var(--lime)!important}.locked{background:#2b2413!important;color:#ffe08b!important;border-color:#79632e!important}
.card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:15px;margin-top:12px}.label{font-size:12px;font-weight:900;letter-spacing:.08em;color:var(--mut);margin-bottom:11px}.brightHead{display:flex;justify-content:space-between;align-items:center}.brightVal{font-size:13px;font-weight:900;color:var(--lime)}input[type=range]{width:100%;accent-color:var(--lime);height:34px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}button{appearance:none;border:1px solid var(--line);background:var(--panel2);color:var(--txt);border-radius:15px;min-height:52px;padding:10px;font-weight:850;font-size:13px}button:active{transform:scale(.98)}button:disabled{opacity:.42}.danger{color:#ffc1c7;border-color:#62363c}.subtle{color:var(--mut)}
.tabs{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom));width:min(590px,calc(100% - 24px));display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:rgba(15,19,16,.94);backdrop-filter:blur(18px);border:1px solid var(--line);padding:5px;border-radius:18px;box-shadow:var(--shadow)}.tabs button{min-height:46px;border:0;background:transparent;color:var(--mut)}.tabs button.sel{background:#202720;color:var(--txt)}
.page{display:none}.page.sel{display:block}.event button{min-height:58px}.textrow{display:grid;grid-template-columns:1fr 88px;gap:8px}input[type=text]{width:100%;min-height:50px;background:#090c0a;color:var(--txt);border:1px solid var(--line);border-radius:14px;padding:0 12px;font-size:16px}
.toast{position:fixed;left:50%;transform:translateX(-50%) translateY(12px);bottom:calc(78px + env(safe-area-inset-bottom));max-width:min(560px,calc(100% - 30px));background:#202720;border:1px solid #384139;border-radius:14px;padding:11px 14px;font-size:13px;color:var(--txt);opacity:0;pointer-events:none;transition:.2s;box-shadow:var(--shadow);z-index:10}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast.bad{border-color:#6d3a40;color:#ffd5d9}.note{font-size:12px;color:var(--mut);line-height:1.4;margin-top:10px}
@media(max-width:380px){.scene{font-size:22px}.transport{grid-template-columns:1fr 1fr}.transport .primary{grid-column:1/-1}.grid3{grid-template-columns:1fr 1fr}}
</style></head><body>
<div class="app">
<header class="top"><div class="device"><span id="dot" class="dot"></span><div><div class="name">HBNF Matrix</div><div id="connection" class="mini">Checking controller…</div></div></div><button class="power danger" id="blackoutTop">OFF</button></header>

<section id="control" class="page sel">
 <div class="hero">
  <div class="eyebrow">NOW PLAYING</div>
  <div class="heroRow"><div><div id="scene" class="scene">Course Auto</div><div id="sceneSub" class="mini">28-scene shuffled playlist</div></div><div id="modeBadge" class="badge">AUTO</div></div>
  <div class="facts"><span id="engine" class="fact">WOW MAX</span><span id="audio" class="fact">AUDIO —</span><span id="preset" class="fact">PRESET —</span></div>
  <div class="transport">
   <button id="autoBtn" class="primary">AUTO</button>
   <button id="lockBtn">LOCK THIS</button>
   <button id="nextBtn">NEXT</button>
  </div>
 </div>
 <div class="card">
  <div class="brightHead"><div class="label" style="margin:0">BRIGHTNESS</div><div id="brightVal" class="brightVal">—</div></div>
  <input id="bright" type="range" min="1" max="72" step="1" value="8">
 </div>
 <div class="card">
  <div class="label">QUICK ACCESS</div>
  <div class="grid2"><button id="scoreBtn">SCOREBOARD</button><button id="potBtn">ACE POT</button></div>
 </div>
 <div class="note">Auto is the default: shuffled Course looks rotate continuously. Lock freezes the current look until Auto or Next is tapped.</div>
</section>

<section id="events" class="page">
 <div class="card">
  <div class="label">ROUND EVENTS</div>
  <div class="grid3 event">
   <button data-event="ace">ACE</button><button data-event="ctp">CTP</button><button data-event="nice_shot">NICE SHOT</button>
   <button data-event="nice_putt">NICE PUTT</button><button data-event="skins">SKINS</button><button data-event="glow">GLOW</button>
  </div>
  <div class="note">Events temporarily take over the full Matrix on a clean black background, then return to Course automatically.</div>
 </div>
</section>

<section id="more" class="page">
 <div class="card"><div class="label">COURSE DATA</div><div class="grid2"><button id="pureBtn">VISUALS ONLY</button><button id="liveBtn">LIVE DATA</button></div></div>
 <div class="card"><div class="label">MESSAGE</div><div class="textrow"><input id="text" type="text" maxlength="63" placeholder="Type message"><button id="sendText">SEND</button></div><div class="note">Text is shown by itself on black, never over the active effect.</div></div>
 <div class="card"><div class="label">SYSTEM</div><div class="grid2"><button id="refreshBtn">REFRESH</button><button id="blackoutBtn" class="danger">BLACKOUT</button></div></div>
</section>
</div>
<nav class="tabs"><button class="sel" data-tab="control">CONTROL</button><button data-tab="events">EVENTS</button><button data-tab="more">MORE</button></nav>
<div id="toast" class="toast">Ready.</div>
<script>
(()=>{'use strict';
const API='https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-matrix-control';
const NAMES={61:'Complex Kaleido',62:'Big Kaleido',63:'Parametric Water',64:'RGB Blobs',65:'Polar Waves',66:'Zoom 2',67:'Kaleido 4',68:'Kaleido 6',69:'Water',70:'RGB Blobs 4',71:'Kaleido 5',72:'Spiralus 2',73:'Hot Blob',74:'Kaleido 3',75:'Waves',76:'Chasing Spirals',77:'Rotating Blob',78:'Center Field',79:'Distance',80:'Lava',81:'Kaleido 2',82:'Yves',83:'Scale Demo',84:'Zoom',85:'Complex Kaleido',86:'RGB Blobs 3',87:'SM5',88:'Module Experiment'};
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
let busy=false,last=null,toastTimer=null,briTimer=null;
function toast(msg,bad=false){const e=$('#toast');e.textContent=msg;e.className='toast show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.className='toast',2400)}
function locked(c){const p=Number(c?.resume_preset);return c?.show_family==='r2'&&p>=61&&p<=88}
function render(d){
 last=d;const t=d?.telemetry||{},c=d?.control||{},on=d?.online===true||String(t?.status||'').toLowerCase()==='online',off=c?.mode==='off',p=Number(t?.preset),isLock=locked(c);
 $('#dot').classList.toggle('online',on);$('#connection').textContent=on?'Controller online':'Controller offline';
 $('#scene').textContent=off?'Matrix Off':(NAMES[p]||'Course Auto');
 $('#sceneSub').textContent=isLock?'Locked until you resume Auto':(Number(t?.playlistActive)===1?'Shuffling 28 Course looks':'Course controls ready');
 $('#modeBadge').textContent=off?'OFF':(isLock?'LOCKED':'AUTO');$('#modeBadge').classList.toggle('lock',isLock);
 $('#autoBtn').classList.toggle('primary',!isLock&&!off);$('#lockBtn').classList.toggle('locked',isLock);$('#lockBtn').textContent=isLock?'LOCKED':'LOCK THIS';
 $('#engine').textContent=(d?.r3Wow||String(d?.renderEngine||'').includes('r3'))?'WOW MAX':'MATRIX';
 const w=d?.wowRuntime||t?.wow||{};$('#audio').textContent='AUDIO '+Number(w?.energy||0);$('#preset').textContent='PRESET '+(Number.isFinite(p)?p:'—');
 const b=Math.max(1,Math.min(72,Number(t?.brightness)||8));$('#bright').value=String(b);$('#brightVal').textContent=b+'/72';
 $('#liveBtn').classList.toggle('primary',!off&&c?.auto_live===true);$('#pureBtn').classList.toggle('primary',!off&&c?.auto_live===false);
 }
async function call(action,payload={}){
 if(busy)return null;busy=true;$$('button').forEach(b=>b.disabled=true);
 try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'}),d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));toast('Done');setTimeout(status,250);return d}
 catch(e){toast(e.message||'Command failed',true);return null}
 finally{busy=false;setTimeout(()=>$$('button').forEach(b=>b.disabled=false),300)}
}
async function status(){if(busy)return;try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"status"}',cache:'no-store'}),d=await r.json();render(d)}catch{$('#dot').classList.remove('online');$('#connection').textContent='Controller unavailable'}}
$('#autoBtn').onclick=()=>{const c=last?.control||{};locked(c)?call('resume_auto'):call('play_show',{family:'r2',live:false,brightness:Number(last?.telemetry?.brightness)||8})};
$('#lockBtn').onclick=()=>locked(last?.control||{})?call('resume_auto'):call('lock_current');
$('#nextBtn').onclick=()=>call('next_look');
$('#scoreBtn').onclick=()=>call('scoreboard');$('#potBtn').onclick=()=>call('ace_pot');
$$('[data-event]').forEach(b=>b.onclick=()=>call('quick_event',{event:b.dataset.event}));
$('#pureBtn').onclick=()=>call('play_show',{family:'r2',live:false,brightness:Number(last?.telemetry?.brightness)||8});
$('#liveBtn').onclick=()=>call('play_show',{family:'r2',live:true,brightness:Number(last?.telemetry?.brightness)||8});
$('#blackoutBtn').onclick=$('#blackoutTop').onclick=()=>call('blackout');
$('#refreshBtn').onclick=status;
$('#sendText').onclick=()=>{const v=$('#text').value.trim();if(!v)return toast('Type a message first',true);call('text',{text:v,color:'#FFFFFF'}).then(x=>{if(x)$('#text').value=''})};
$('#text').onkeydown=e=>{if(e.key==='Enter')$('#sendText').click()};
$('#bright').oninput=e=>{$('#brightVal').textContent=e.target.value+'/72';clearTimeout(briTimer);briTimer=setTimeout(()=>call('brightness',{brightness:Number(e.target.value)}),180)};
$$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle('sel',x===b));$$('.page').forEach(p=>p.classList.toggle('sel',p.id===b.dataset.tab))});
status();setInterval(status,3500);
})();
</script></body></html>`;

Deno.serve(req=>{
 if(req.method!=="GET"&&req.method!=="HEAD")return new Response("GET required",{status:405});
 return new Response(req.method==="HEAD"?null:HTML,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, no-cache, must-revalidate","X-Content-Type-Options":"nosniff"}});
});