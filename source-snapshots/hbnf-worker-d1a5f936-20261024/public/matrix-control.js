(()=>{'use strict';
const API='https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-matrix-control';
const NAMES={61:'Complex Kaleido',62:'Big Kaleido',63:'Parametric Water',64:'RGB Blobs',65:'Polar Waves',66:'Zoom 2',67:'Kaleido 4',68:'Kaleido 6',69:'Water',70:'RGB Blobs 4',71:'Kaleido 5',72:'Spiralus 2',73:'Hot Blob',74:'Kaleido 3',75:'Waves',76:'Chasing Spirals',77:'Rotating Blob',78:'Center Field',79:'Distance',80:'Lava',81:'Kaleido 2',82:'Yves',83:'Scale Demo',84:'Zoom',85:'Complex Kaleido',86:'RGB Blobs 3',87:'SM5',88:'Module Experiment'};
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
let busy=false,last=null,toastTimer=null,briTimer=null;
function toast(msg,bad=false){const e=$('#toast');e.textContent=msg;e.className='toast show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.className='toast',2300)}
function locked(c){const p=Number(c?.resume_preset);return c?.show_family==='r2'&&p>=61&&p<=88}
function setDisabled(v){$$('button').forEach(b=>b.disabled=v)}
function render(d){
 last=d;const t=d?.telemetry||{},c=d?.control||{},online=d?.online===true||String(t?.status||'').toLowerCase()==='online',off=c?.mode==='off',p=Number(t?.preset),isLock=locked(c),playing=Number(t?.playlistActive)===1;
 $('#dot').classList.toggle('online',online);$('#connection').textContent=online?'Controller online':'Controller offline';
 $('#scene').textContent=off?'Matrix Off':(isLock?(NAMES[p]||('Preset '+p)):(NAMES[p]||'Course Auto'));
 $('#sceneSub').textContent=off?'Tap Auto to start':isLock?'Locked until Auto or Next':(playing?'28 looks · shuffled · 12 sec each':'Course Auto ready');
 $('#modeBadge').textContent=off?'OFF':(isLock?'LOCKED':'AUTO');$('#modeBadge').classList.toggle('lock',isLock);
 $('#autoBtn').classList.toggle('primary',!isLock&&!off);$('#lockBtn').classList.toggle('locked',isLock);$('#lockBtn').textContent=isLock?'LOCKED':'LOCK THIS';
 const engine=(d?.r3Wow||String(d?.renderEngine||'').includes('r3'))?'WOW MAX':'MATRIX';$('#engine').textContent=engine;$('#diagEngine').textContent=engine;
 $('#preset').textContent='PRESET '+(Number.isFinite(p)?p:'—');$('#diagPreset').textContent=Number.isFinite(p)?String(p):'—';$('#diagPlaylist').textContent=playing?'AUTO':'STOPPED / LOCKED';
 const w=d?.wowRuntime||t?.wow||{};$('#diagAudio').textContent=String(Number(w?.energy??0));
 const b=Math.max(1,Math.min(72,Number(t?.brightness)||8));if(document.activeElement!==$('#bright'))$('#bright').value=String(b);$('#brightVal').textContent=b+'/72';
 $('#liveBtn').classList.toggle('active',!off&&c?.auto_live===true);$('#pureBtn').classList.toggle('active',!off&&c?.auto_live===false);
 const overlay=!!(c?.overlay_until&&Date.parse(c.overlay_until)>Date.now());if(!busy)setDisabled(overlay);if(overlay)toast('Event/card active');
}
async function call(action,payload={}){
 if(busy)return null;busy=true;setDisabled(true);
 try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'}),d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));toast(d.confirmed===false?'Accepted':'Done');setTimeout(status,240);return d}
 catch(e){toast(e.message||'Command failed',true);return null}
 finally{busy=false;setTimeout(()=>setDisabled(false),320)}
}
async function status(){if(busy)return;try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"status"}',cache:'no-store'}),d=await r.json();render(d)}catch{$('#dot').classList.remove('online');$('#connection').textContent='Controller unavailable'}}
function currentBrightness(){return Math.max(1,Math.min(72,Number(last?.telemetry?.brightness)||8))}
$('#autoBtn').onclick=()=>{const c=last?.control||{};if(c?.mode==='off')return call('play_show',{family:'r2',live:false,brightness:currentBrightness()});return call('resume_auto')};
$('#lockBtn').onclick=()=>locked(last?.control||{})?call('resume_auto'):call('lock_current');
$('#nextBtn').onclick=()=>call('next_look');
$('#scoreBtn').onclick=()=>call('scoreboard');$('#potBtn').onclick=()=>call('ace_pot');
$$('[data-event]').forEach(b=>b.onclick=()=>call('quick_event',{event:b.dataset.event}));
$('#pureBtn').onclick=()=>call('play_show',{family:'r2',live:false,brightness:currentBrightness()});
$('#liveBtn').onclick=()=>call('play_show',{family:'r2',live:true,brightness:currentBrightness()});
$('#blackoutBtn').onclick=$('#blackoutTop').onclick=()=>call('blackout');
$('#refreshBtn').onclick=status;
$('#sendText').onclick=()=>{const v=$('#text').value.trim();if(!v)return toast('Type a message first',true);call('text',{text:v,color:'#FFFFFF'}).then(x=>{if(x)$('#text').value=''})};
$('#text').onkeydown=e=>{if(e.key==='Enter')$('#sendText').click()};
$('#bright').oninput=e=>{$('#brightVal').textContent=e.target.value+'/72';clearTimeout(briTimer);briTimer=setTimeout(()=>call('brightness',{brightness:Number(e.target.value)}),220)};
$('#audioLevel').oninput=e=>$('#audioLevelVal').textContent=e.target.value;$('#applyAudio').onclick=()=>call('audio_sensitivity',{level:Number($('#audioLevel').value)});
$$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle('sel',x===b));$$('.page').forEach(p=>p.classList.toggle('sel',p.id===b.dataset.tab))});
status();setInterval(status,4000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)status()});
})();
