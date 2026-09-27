#pragma once
#include <Arduino.h>

static const char HBNF_GAME_CONTROLLER_PAGE[] PROGMEM = R"HTML(
<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover">
<title>HBNF Cart</title>
<style>
html,body{margin:0;background:#071018;color:#eef7fa;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;height:100%;overflow:hidden}
*{-webkit-box-sizing:border-box;box-sizing:border-box;-webkit-user-select:none;user-select:none}
body{padding:10px}#wrap{max-width:760px;margin:0 auto;height:100%;display:flex;flex-direction:column;gap:8px}
h1{font-size:22px;margin:0}.sub{font-size:13px;color:#a9c1c9}.tabs{display:flex;gap:8px}
button{background:#15313c;color:#fff;border:1px solid #3e6976;border-radius:12px;font-size:18px;min-height:48px;padding:8px 14px}
button.on,.tab.active{background:#245364}.danger{border-color:#b34f62}.primary{border-color:#58cbb0}
.hidden{display:none!important}.screen{flex:1;min-height:0}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#cart .big{min-width:105px;min-height:62px;font-size:20px}#cartStatus,#gameStatus{min-height:20px;font-size:14px;margin:8px 0}
.slider{display:grid;grid-template-columns:100px 1fr 44px;gap:8px;align-items:center;margin:10px 0}
input[type=range]{width:100%}select{font-size:17px;background:#15313c;color:#fff;border:1px solid #3e6976;border-radius:10px;padding:9px}
#pad{display:flex;height:calc(100% - 78px);min-height:220px;gap:10px}
#dpad{width:54%;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:7px}
#actions{width:46%;display:grid;grid-template:repeat(2,1fr)/repeat(2,1fr);gap:10px;align-content:center}
.ctrl{touch-action:none;-webkit-touch-callout:none;font-size:30px;padding:0}
#up{grid-column:2}#left{grid-row:2;grid-column:1}#right{grid-row:2;grid-column:3}#down{grid-row:3;grid-column:2}
#a,#b{border-radius:50%;min-height:88px;font-weight:700}#a{font-size:32px}#b{font-size:27px}
.good{color:#7be7a0}.warn{color:#ffd479}.bad{color:#ff8796}#lat{font-variant-numeric:tabular-nums}
@media(max-width:520px){body{padding:7px}button{font-size:16px}#cart .big{min-width:90px}.slider{grid-template-columns:82px 1fr 38px}}
</style></head><body><div id="wrap">
<div><h1>HBNF CART</h1><div class="sub">You’re connected. Pick what you want to do.</div></div>
<div class="tabs"><button class="tab active" id="cartTab">LIGHTS</button><button class="tab" id="gameTab">PLAY</button><div style="flex:1"></div><div id="lat" class="sub"></div></div>

<div id="cart" class="screen">
 <div class="row">
  <button class="big danger" data-cart="OFF">OFF</button><button class="big primary" data-cart="ON">ON</button>
  <button class="big" data-cart="NEXT">NEXT</button><button class="big" data-cart="AUTO">AUTO</button>
 </div>
 <div class="slider"><span>Matrix</span><input id="mb" type="range" min="0" max="255" value="8"><span id="mbv">8</span></div>
 <div class="slider"><span>Underglow</span><input id="ab" type="range" min="0" max="255" value="64"><span id="abv">64</span></div>
 <div class="row">
  <select id="vibe"><option value="mellow">Mellow</option><option value="moderate">Moderate</option><option value="energetic">Energetic</option><option value="peak">Peak</option></select>
  <button id="vibeGo">SET VIBE</button><button data-cart="VIBE_AUTO">VIBE AUTO</button>
 </div>
 <div class="slider"><span>Speed</span><input id="speed" type="range" min="0.5" max="2" step="0.05" value="1"><span id="speedv">1.00</span></div>
 <div id="cartStatus">Connecting…</div>
</div>

<div id="game" class="screen hidden">
 <div class="row"><div id="gameStatus">Tap PLAY to grab the next open player slot.</div><div style="flex:1"></div><button id="claim" class="primary">PLAY</button><button id="end">END</button></div>
 <div id="pad">
  <div id="dpad">
   <button class="ctrl" id="up" data-bit="1">▲</button><button class="ctrl" id="left" data-bit="4">◀</button>
   <button class="ctrl" id="right" data-bit="8">▶</button><button class="ctrl" id="down" data-bit="2">▼</button>
  </div>
  <div id="actions">
   <button class="ctrl" id="a" data-bit="16">A</button><button class="ctrl" id="b" data-bit="32">B</button>
   <button class="ctrl" id="menu" data-bit="192">MENU</button><button id="release">LEAVE</button>
  </div>
 </div>
</div>
</div>
<script>
(function(){
var ws=null,slot=0,mask=0,held={},cartReady=false,reconnectTimer=null,samples=[],pings={},pingSeq=1;
var cs=document.getElementById('cartStatus'),gs=document.getElementById('gameStatus'),lat=document.getElementById('lat');
function send(s){if(ws&&ws.readyState===1)ws.send(s)}
function connect(){
 var host=location.hostname||'192.168.4.1';
 ws=new WebSocket('ws://'+host+':81/');
 ws.onopen=function(){cs.textContent='Connected';beginLatency()};
 ws.onclose=function(){cs.textContent='Reconnecting…';slot=0;if(!reconnectTimer)reconnectTimer=setTimeout(function(){reconnectTimer=null;connect()},800)};
 ws.onmessage=function(e){
  var a=String(e.data).split(',');
  if(a[0]==='HELLO'){cartReady=a[4]==='1';cs.textContent=cartReady?'Cart controls ready':'Cart controls are finishing setup';return}
  if(a[0]==='CLAIMED'){slot=parseInt(a[1],10);gs.textContent='Player '+slot+' ready';document.getElementById('claim').textContent='P'+slot+' READY';return}
  if(a[0]==='RELEASED'||a[0]==='PREEMPTED'){slot=0;mask=0;held={};gs.textContent=a[0]==='PREEMPTED'?'A dedicated controller took this slot. Tap PLAY for another.':'Tap PLAY to rejoin.';document.getElementById('claim').textContent='PLAY';return}
  if(a[0]==='CARTOK'){cs.textContent='Applied';cs.className='good';return}
  if(a[0]==='CARTERR'){cs.textContent='Could not apply: '+a.slice(1).join(' ').replace(/_/g,' ');cs.className='bad';return}
  if(a[0]==='ERR'){gs.textContent=a.slice(1).join(' ').replace(/_/g,' ');return}
  if(a[0]==='PONG'){var n=parseInt(a[1],10),t=pings[n];if(t){samples.push(Date.now()-t);delete pings[n];updateLatency()}}
 };
}
function tab(which){
 document.getElementById('cart').className='screen'+(which==='cart'?'':' hidden');
 document.getElementById('game').className='screen'+(which==='game'?'':' hidden');
 document.getElementById('cartTab').className='tab'+(which==='cart'?' active':'');
 document.getElementById('gameTab').className='tab'+(which==='game'?' active':'');
}
function cart(cmd){if(!cartReady){cs.textContent='Cart controls are finishing setup';return}cs.textContent='Applying…';cs.className='';send('CART,'+cmd)}
function push(){if(slot)send('I,'+slot+','+mask)}
function setBit(bit,on){if(on)mask|=bit;else mask&=~bit;push()}
function bind(id){var b=document.getElementById(id),bit=parseInt(b.getAttribute('data-bit'),10);
 function on(e){if(e)e.preventDefault();if(!slot){send('CLAIM_AUTO');return}if(held[id])return;held[id]=1;b.className+=' on';setBit(bit,true)}
 function off(e){if(e)e.preventDefault();if(!held[id])return;delete held[id];b.className=b.className.replace(/ ?on/g,'');setBit(bit,false)}
 b.addEventListener('touchstart',on,false);b.addEventListener('touchend',off,false);b.addEventListener('touchcancel',off,false);
 b.addEventListener('mousedown',on,false);b.addEventListener('mouseup',off,false);b.addEventListener('mouseleave',off,false)}
function percentile(a,p){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y});return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
function updateLatency(){if(samples.length<5)return;var p50=percentile(samples,.5),p95=percentile(samples,.95);lat.textContent=p50+'ms / '+p95+'ms p95';lat.className=p95<=80&&p50<=50?'good':(p95<=120?'warn':'bad')}
function beginLatency(){samples=[];pings={};var sent=0,t=setInterval(function(){if(!ws||ws.readyState!==1||sent>=30){clearInterval(t);return}var n=pingSeq++;pings[n]=Date.now();send('PING,'+n);sent++},100)}
document.getElementById('cartTab').onclick=function(){tab('cart')};document.getElementById('gameTab').onclick=function(){tab('game')};
var bc=document.querySelectorAll('[data-cart]'),i;for(i=0;i<bc.length;i++)bc[i].onclick=(function(x){return function(){cart(x)}})(bc[i].getAttribute('data-cart'));
document.getElementById('mb').oninput=function(){document.getElementById('mbv').textContent=this.value};
document.getElementById('mb').onchange=function(){cart('BRIGHTNESS,matrix,'+this.value)};
document.getElementById('ab').oninput=function(){document.getElementById('abv').textContent=this.value};
document.getElementById('ab').onchange=function(){cart('BRIGHTNESS,aux,'+this.value)};
document.getElementById('vibeGo').onclick=function(){cart('VIBE,'+document.getElementById('vibe').value)};
document.getElementById('speed').oninput=function(){document.getElementById('speedv').textContent=Number(this.value).toFixed(2)};
document.getElementById('speed').onchange=function(){cart('SPEED,'+this.value)};
document.getElementById('claim').onclick=function(){send('CLAIM_AUTO')};
document.getElementById('end').onclick=function(){send('SESSION,END')};
document.getElementById('release').onclick=function(){send('RELEASE');slot=0;mask=0;held={};document.getElementById('claim').textContent='PLAY'};
['up','down','left','right','a','b','menu'].forEach(bind);
setInterval(function(){if(slot)push()},750);
document.addEventListener('touchmove',function(e){if(e.target&&e.target.className.indexOf('ctrl')>=0)e.preventDefault()},false);
connect();
})();
</script></body></html>
)HTML";
