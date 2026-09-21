import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const HTML=String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#030705">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="HBNF Matrix">
<title>HBNF Matrix Course Console</title>
<style>
:root{--bg:#030705;--p:#0d1711;--p2:#111d15;--line:#294d31;--txt:#f6fff3;--mut:#9bb09d;--g:#9ae46f;--r:#ff9aa8;--a:#d7ff74}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:calc(env(safe-area-inset-top) + 8px) 12px calc(env(safe-area-inset-bottom) + 28px)}
.wrap{max-width:680px;margin:auto}.head,.card{border:1px solid var(--line);background:var(--p);border-radius:18px;padding:14px;margin:10px 0}.head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.title{font-weight:950;font-size:1.12rem}.sub{font-size:.68rem;color:var(--g);font-weight:850;letter-spacing:.1em;margin-top:2px}.status{font-weight:950}.on{color:var(--g)}.off{color:var(--r)}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.pill{padding:8px 5px;border:1px solid var(--line);border-radius:12px;text-align:center;font-size:.68rem;font-weight:850;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
h2{font-size:.86rem;letter-spacing:.04em;margin:0 0 10px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
button{min-height:54px;border-radius:15px;border:1px solid var(--line);background:var(--p2);color:var(--txt);font:900 .82rem -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:10px}
button.active{border-color:#6ca95a;background:#1b3b21;box-shadow:inset 0 0 0 1px rgba(154,228,111,.22)}button.danger{border-color:#8b4651;color:#ffd9df}button:active{transform:scale(.98)}
.event button{min-height:50px}input{width:100%;min-height:48px;border-radius:13px;border:1px solid var(--line);background:#07100a;color:var(--txt);padding:10px 12px;font-size:16px}
.textrow{display:grid;grid-template-columns:1fr 112px;gap:8px}.note{font-size:.74rem;color:var(--mut);line-height:1.35;margin-top:8px}
#feedback{margin-top:10px;border:1px solid var(--line);border-radius:12px;padding:11px;min-height:42px;color:var(--mut);font-size:.8rem;line-height:1.3}#feedback.good{color:var(--g)}#feedback.bad{color:var(--r)}
.engine{color:var(--a)}@media(max-width:430px){.meta{grid-template-columns:1fr 1fr}.grid3{grid-template-columns:1fr 1fr}.grid4{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="wrap">
<div class="head"><div><div class="title">Matrix Course Console</div><div class="sub">HB NIGHT FLYERS · WOW MAX READY</div></div><div id="online" class="status">CHECKING</div></div>
<div class="meta"><div id="mode" class="pill">MODE —</div><div id="engine" class="pill engine">ENGINE —</div><div id="bri" class="pill">BRI —</div><div id="preset" class="pill">P —</div><div id="audio" class="pill">AUDIO —</div><div id="aux" class="pill">AUX PREP</div></div>

<div class="card"><h2>COURSE MODE</h2><div class="grid2"><button id="pureBtn">VISUALS ONLY</button><button id="liveBtn">LIVE DATA</button></div><div class="note">Uses the installed Course engine automatically: proven R2 now, WOW MAX after adoption. It never selects the old legacy show families.</div></div>

<div class="card"><h2>QUICK EVENTS</h2><div class="grid3 event">
<button data-event="ace">ACE</button><button data-event="nice_shot">NICE SHOT</button><button data-event="nice_putt">NICE PUTT</button>
<button data-event="ctp">CTP</button><button data-event="skins">SKINS</button><button data-event="glow">GLOW</button>
</div></div>

<div class="card"><h2>ROUND CONTROLS</h2><div class="grid2">
<button data-action="scores">SCOREBOARD</button><button data-action="ace_pot">ACE POT</button>
<button data-action="next_look">NEXT LOOK</button><button class="danger" data-action="blackout">BLACKOUT</button>
</div></div>

<div class="card"><h2>TEXT</h2><div class="textrow"><input id="text" maxlength="63" autocomplete="off" placeholder="Message"><button id="sendText">SEND</button></div></div>

<div class="card"><h2>BRIGHTNESS</h2><div class="grid4"><button data-bri="8">8</button><button data-bri="16">16</button><button data-bri="24">24</button><button data-bri="40">40</button></div></div>
<div id="auxCard" class="card" hidden><h2>CART LIGHTING</h2><div class="grid3">
<button data-cart="music">MUSIC</button><button data-cart="skins_live">SKINS LIVE</button><button data-cart="glow_live">GLOW LIVE</button>
<button data-uv="full">UV FULL</button><button data-uv="main">UV MAIN</button><button data-uv="short">UV SHORT</button>
<button data-uv="off">UV OFF</button><button class="danger" data-cart="all_off">ALL OFF</button>
</div><div class="note">Only appears after the SP803E passes hardware acceptance. Mixed GLOW LIVE remains locked until the mixed-load test passes.</div></div>

<div id="feedback">Ready.</div>
<div class="note">Status refreshes every 4 seconds. Controls lock while an overlay is active. Build: hbnf-fallback-wow-max-v3.</div>
</div><script>
(()=>{'use strict';
const API='https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-matrix-control';
const AUX='https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-aux-control';
const CART='https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-orchestrator';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let busy=false,last=null;
function fb(t,k=''){const e=$('#feedback');e.textContent=t;e.className=k}
function engineName(r){if(r?.r3Wow)return 'WOW MAX';const x=String(r?.renderEngine||'');return x==='r3-wow-max'?'WOW MAX':x==='r2-animartrix-vibe'?'R2':'LEGACY'}
function render(r){
 last=r;const t=r?.telemetry||{},c=r?.control||{},on=r?.online===true||String(t?.status||'').toLowerCase()==='online',off=c.mode==='off',eng=engineName(r);
 $('#online').textContent=on?'● ONLINE':'● OFFLINE';$('#online').className='status '+(on?'on':'off');
 $('#mode').textContent='MODE '+(off?'OFF':(c.auto_live?'LIVE':'PURE'));
 $('#engine').textContent='ENGINE '+eng;
 $('#bri').textContent='BRI '+(t.brightness??'—');
 $('#preset').textContent='P '+(t.preset??'—')+(Number(t.playlistActive)===1?' · PLAY':'');
 const wr=r?.wowRuntime||t?.wow||null;
 $('#audio').textContent=wr?'E '+(wr.energy??0)+' · P '+(wr.pulse??0):'AUDIO —';
 $('#liveBtn').classList.toggle('active',!off&&c.auto_live===true);
 $('#pureBtn').classList.toggle('active',!off&&c.auto_live===false);
 const bri=Number(t.brightness);$$('[data-bri]').forEach(b=>b.classList.toggle('active',Number(b.dataset.bri)===Math.round(bri)));
 const overlay=!!(c.overlay_until&&Date.parse(c.overlay_until)>Date.now());
 $$('button').forEach(b=>{if(!b.classList.contains('danger'))b.disabled=busy||overlay});
 if(overlay)fb('OVERLAY ACTIVE · controls resume automatically');
}
async function request(action,payload={}){
 if(busy)return null;busy=true;$$('button').forEach(b=>b.disabled=true);fb('SENDING '+action.replaceAll('_',' ').toUpperCase()+'…');
 try{
  const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const d=await res.json();if(!res.ok||d.ok===false)throw new Error(d.error||('HTTP '+res.status));
  fb('✓ '+(d.confirmed?'CONFIRMED':'ACCEPTED'),'good');setTimeout(status,250);return d;
 }catch(e){fb('ERROR: '+e.message,'bad');return null}
 finally{busy=false;setTimeout(()=>{$$('button').forEach(b=>b.disabled=false)},350)}
}
async function auxStatus(){
 try{
  const res=await fetch(AUX,{cache:'no-store'}),d=await res.json();
  const enabled=d?.enabled===true,mixed=d?.policy?.mixedLoadAccepted===true;
  $('#aux').textContent=enabled?(mixed?'AUX LIVE':'AUX SAFE'):'AUX PREP';
  $('#auxCard').hidden=!enabled;
  const glow=$('[data-cart="glow_live"]');if(glow)glow.disabled=!enabled||!mixed||busy;
 }catch{$('#aux').textContent='AUX —';$('#auxCard').hidden=true}
}
async function status(){
 if(busy)return;
 try{const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"status"}',cache:'no-store'});const d=await res.json();render(d);auxStatus()}
 catch(e){$('#online').textContent='● UNAVAILABLE';$('#online').className='status off'}
}
async function service(url,payload){
 if(busy)return null;busy=true;$('button').forEach(b=>b.disabled=true);fb('SENDING…');
 try{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});const d=await res.json();if(!res.ok||d.ok===false)throw new Error(d.error||('HTTP '+res.status));fb('✓ ACCEPTED','good');setTimeout(status,250);return d}
 catch(e){fb('ERROR: '+e.message,'bad');return null}
 finally{busy=false;setTimeout(()=>{$('button').forEach(b=>b.disabled=false);auxStatus()},350)}
}
$('#pureBtn').onclick=()=>request('play_show',{family:'r2',live:false,brightness:8});
$('#liveBtn').onclick=()=>request('play_show',{family:'r2',live:true,brightness:8});
$$('[data-event]').forEach(b=>b.onclick=()=>request('quick_event',{event:b.dataset.event}));
$$('[data-action]').forEach(b=>b.onclick=()=>request(b.dataset.action));
$('[data-bri]').forEach(b=>b.onclick=()=>request('brightness',{brightness:Number(b.dataset.bri)}));
$('[data-cart]').forEach(b=>b.onclick=()=>service(CART,{scene:b.dataset.cart}));
$('[data-uv]').forEach(b=>b.onclick=()=>service(AUX,{action:'uv',mode:b.dataset.uv}));
$('#sendText').onclick=()=>{const v=$('#text').value.trim();if(!v){fb('Enter a message.','bad');return}request('text',{text:v,color:'#FFFFFF'}).then(x=>{if(x)$('#text').value=''})};
$('#text').addEventListener('keydown',e=>{if(e.key==='Enter')$('#sendText').click()});
status();setInterval(status,4000);
})();
</script></body></html>`;

Deno.serve((req)=>{
 if(req.method!=="GET"&&req.method!=="HEAD")return new Response("GET required",{status:405});
 const headers={"Content-Type":"text/html; charset=UTF-8","Cache-Control":"no-store, no-cache, must-revalidate","Content-Disposition":"inline","X-Content-Type-Options":"nosniff"};
 return new Response(req.method==="HEAD"?null:new Blob([HTML],{type:"text/html;charset=UTF-8"}),{status:200,headers});
});
