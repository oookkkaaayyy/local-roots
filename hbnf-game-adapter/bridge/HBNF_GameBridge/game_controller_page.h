#pragma once
#include <Arduino.h>

static const char HBNF_GAME_CONTROLLER_PAGE[] PROGMEM = R"HTML(
<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover">
<title>HBNF Play</title>
<style>
html,body{margin:0;background:#071018;color:#eef7fa;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;height:100%;overflow:hidden}
*{-webkit-box-sizing:border-box;box-sizing:border-box;-webkit-user-select:none;user-select:none}
body{padding:12px}
#wrap{max-width:760px;margin:0 auto;height:100%;display:flex;flex-direction:column;gap:8px}
h1{font-size:22px;margin:0}.sub{font-size:13px;color:#a9c1c9}.bar{display:flex;gap:8px;flex-wrap:wrap}
button{background:#15313c;color:#fff;border:1px solid #3e6976;border-radius:12px;font-size:18px;min-height:48px;padding:8px 14px}
button.on{background:#245364}.danger{border-color:#b34f62}.grow{flex:1}.hidden{display:none!important}
#status{font-size:14px;min-height:20px}#lat{font-variant-numeric:tabular-nums}
#pad{display:flex;flex:1;min-height:0;gap:12px}
#dpad{width:54%;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:7px;min-height:220px}
#actions{width:46%;display:grid;grid-template:repeat(2,1fr)/repeat(2,1fr);gap:10px;align-content:center}
.ctrl{touch-action:none;-webkit-touch-callout:none;font-size:30px;padding:0}
#up{grid-column:2}#left{grid-row:2;grid-column:1}#right{grid-row:2;grid-column:3}#down{grid-row:3;grid-column:2}
#a,#b{border-radius:50%;min-height:92px;font-weight:700}#a{font-size:32px}#b{font-size:27px}
#host{border-top:1px solid #28444d;padding-top:8px}
.good{color:#7be7a0}.warn{color:#ffd479}.bad{color:#ff8796}
@media(max-width:520px){body{padding:8px}#pad{gap:8px}button{font-size:16px}#a,#b{min-height:78px}}
</style></head><body><div id="wrap">
<div><h1>HBNF PLAY</h1><div class="sub" id="role">Connecting…</div></div>
<div class="bar"><button id="p1">P1</button><button id="p2">P2</button><button id="release">Release</button><div class="grow"></div><div id="lat">Latency: testing…</div></div>
<div id="status">Connecting to game bridge…</div>
<div id="pad">
 <div id="dpad">
  <button class="ctrl" id="up" data-bit="1">▲</button>
  <button class="ctrl" id="left" data-bit="4">◀</button>
  <button class="ctrl" id="right" data-bit="8">▶</button>
  <button class="ctrl" id="down" data-bit="2">▼</button>
 </div>
 <div id="actions">
  <button class="ctrl" id="a" data-bit="16">A</button>
  <button class="ctrl" id="b" data-bit="32">B</button>
  <button class="ctrl hostonly" id="menu" data-bit="192">MENU</button>
  <button class="hostonly" id="startGame">START GAME</button>
 </div>
</div>
<div id="host" class="hidden">
 <div class="bar"><button id="guestToggle">OPEN GUEST PLAY</button><button id="endGame" class="danger">END GAME</button></div>
 <div class="sub">Guest phones can control games only. Cart lighting stays on the canonical controller.</div>
</div>
</div>
<script>
(function(){
var ws=null, role='GUEST', slot=0, mask=0, held={}, guestOpen=false, session=false;
var samples=[], pings={}, pingSeq=1, reconnectTimer=null;
var st=document.getElementById('status'), roleEl=document.getElementById('role'), lat=document.getElementById('lat');

function setStatus(s){st.textContent=s}
function send(s){if(ws&&ws.readyState===1)ws.send(s)}
function isHost(){return role==='HOST'}
function connect(){
 var host=location.hostname||'192.168.4.1';
 ws=new WebSocket('ws://'+host+':81/');
 ws.onopen=function(){setStatus('Connected. Choose P1 or P2.');beginLatency()};
 ws.onclose=function(){setStatus('Disconnected. Reconnecting…');slot=0;mask=0;if(!reconnectTimer)reconnectTimer=setTimeout(function(){reconnectTimer=null;connect()},900)};
 ws.onerror=function(){};
 ws.onmessage=function(e){
  var a=String(e.data).split(',');
  if(a[0]==='HELLO'){role=a[1];guestOpen=a[2]==='1';session=a[3]==='1';renderRole();return}
  if(a[0]==='STATE'){guestOpen=a[1]==='1';session=a[2]==='1';renderRole();return}
  if(a[0]==='CLAIMED'){slot=parseInt(a[1],10);setStatus('Player '+slot+' connected.');renderClaim();return}
  if(a[0]==='RELEASED'){slot=0;mask=0;held={};setStatus('Controller released.');renderClaim();return}
  if(a[0]==='PREEMPTED'){slot=0;mask=0;held={};setStatus('Dedicated controller took this player slot.');renderClaim();return}
  if(a[0]==='ERR'){setStatus(a.slice(1).join(' ').replace(/_/g,' '));return}
  if(a[0]==='PONG'){
   var n=parseInt(a[1],10), t=pings[n]; if(t){samples.push(Date.now()-t);delete pings[n];updateLatency()}
  }
 };
}
function renderRole(){
 roleEl.textContent=isHost()?'Owner controller on HBNF-Cart':'Guest controller on isolated HBNF-Play';
 document.getElementById('host').className=isHost()?'':'hidden';
 var hs=document.querySelectorAll('.hostonly'),i;
 for(i=0;i<hs.length;i++)hs[i].className=hs[i].className.replace(/ ?hidden/g,'')+(isHost()?'':' hidden');
 document.getElementById('guestToggle').textContent=guestOpen?'CLOSE GUEST PLAY':'OPEN GUEST PLAY';
 document.getElementById('startGame').textContent=session?'GAME RUNNING':'START GAME';
}
function renderClaim(){
 document.getElementById('p1').className=slot===1?'on':'';
 document.getElementById('p2').className=slot===2?'on':'';
}
function claim(n){send('CLAIM,'+n)}
function push(){if(slot)send('I,'+slot+','+mask)}
function setBit(bit,on){
 if(on)mask|=bit;else mask&=~bit;
 if(!isHost())mask&=63;
 push();
}
function bind(id){
 var b=document.getElementById(id),bit=parseInt(b.getAttribute('data-bit'),10);
 function on(e){if(e){e.preventDefault()}if(held[id])return;held[id]=1;b.className+=' on';setBit(bit,true)}
 function off(e){if(e){e.preventDefault()}if(!held[id])return;delete held[id];b.className=b.className.replace(/ ?on/g,'');setBit(bit,false)}
 b.addEventListener('touchstart',on,false);b.addEventListener('touchend',off,false);b.addEventListener('touchcancel',off,false);
 b.addEventListener('mousedown',on,false);b.addEventListener('mouseup',off,false);b.addEventListener('mouseleave',off,false);
}
function percentile(a,p){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y});return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
function updateLatency(){
 if(samples.length<5)return;
 var p50=percentile(samples,.5),p95=percentile(samples,.95),cls=p95<=80&&p50<=50?'good':(p95<=120?'warn':'bad');
 lat.className=cls;lat.textContent='Latency: '+p50+' ms / '+p95+' ms p95'+(cls==='bad'?' · use Stadia':'');
}
function beginLatency(){
 samples=[];pings={};var sent=0;
 var timer=setInterval(function(){
  if(!ws||ws.readyState!==1||sent>=30){clearInterval(timer);return}
  var n=pingSeq++;pings[n]=Date.now();send('PING,'+n);sent++;
 },100);
}
document.getElementById('p1').onclick=function(){claim(1)};
document.getElementById('p2').onclick=function(){claim(2)};
document.getElementById('release').onclick=function(){send('RELEASE');slot=0;mask=0;held={};renderClaim()};
document.getElementById('guestToggle').onclick=function(){if(isHost())send('GUEST,'+(guestOpen?'0':'1'))};
document.getElementById('startGame').onclick=function(){if(isHost())send('SESSION,START')};
document.getElementById('endGame').onclick=function(){if(isHost())send('SESSION,END')};
['up','down','left','right','a','b','menu'].forEach(bind);
setInterval(function(){if(slot)push()},750);
document.addEventListener('touchmove',function(e){if(e.target&&e.target.className.indexOf('ctrl')>=0)e.preventDefault()},false);
connect();
})();
</script></body></html>
)HTML";
