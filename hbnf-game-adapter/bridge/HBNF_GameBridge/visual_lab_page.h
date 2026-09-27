#pragma once
#include <Arduino.h>

static const char HBNF_VISUAL_LAB_PAGE[] PROGMEM = R"VISUAL(
<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07110d"><title>HBNF Visual Lab</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark}*{box-sizing:border-box}
body{margin:0;background:#050806;color:#f3f7f5;padding:12px}main{max-width:820px;margin:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:4px 0 12px}h1{margin:0;font-size:28px}.sub{color:#91a99d;font-size:12px}
.badge{padding:7px 9px;border:1px solid #315344;border-radius:999px;font-size:11px;font-weight:800}.ok{color:#8ef0ba}.warn{color:#ffd479}.bad{color:#ff9292}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{background:#0a1510;border:1px solid #20372c;border-radius:15px;padding:12px;margin-bottom:10px}
.title{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:800;letter-spacing:.09em;margin-bottom:8px}
canvas{width:100%;background:#010201;border-radius:9px;image-rendering:pixelated;display:block}.meta{font-size:11px;color:#8ca096;margin-top:7px}
.ctrl{display:grid;grid-template-columns:130px 1fr 42px;gap:8px;align-items:center;margin:12px 0}.ctrl label{font-size:12px;font-weight:750}input[type=range]{width:100%}
button{font:inherit;background:#143026;color:#fff;border:1px solid #3d6754;border-radius:10px;padding:11px 14px;font-weight:750}.row{display:flex;gap:8px;flex-wrap:wrap}
.fact{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #17271f;font-size:12px}.fact:first-child{border-top:0}
#status{font-size:12px;font-weight:750;min-height:18px;margin-top:8px}@media(max-width:680px){.grid{grid-template-columns:1fr}.ctrl{grid-template-columns:92px 1fr 38px}}
</style></head><body><main>
<header><div><div class="sub">HBNF CART · OWNER</div><h1>Visual Lab</h1></div><div id="lock" class="badge warn">FRAME LOCK WAITING</div></header>

<div class="grid">
<section class="card"><div class="title"><span>MATRIX · EXACT PEEK</span><span id="matrixState">WAITING</span></div><canvas id="matrix" width="640" height="320"></canvas><div id="matrixMeta" class="meta">Direct WLED live-pixel stream</div></section>
<section class="card"><div class="title"><span>UNDERGLOW · EXACT SOURCE</span><span id="auxState">WAITING</span></div><canvas id="aux" width="640" height="120"></canvas><div id="auxMeta" class="meta">Exact 22-pixel frame sent from Matrix to AUX</div></section>
</div>

<section class="card">
<div class="title"><span>SEMANTIC CONTROL</span><span>NO WLED PARAMETER GUESSING</span></div>
<div class="ctrl"><label>ENERGY</label><input id="energy" type="range" min="0" max="100" value="50"><output id="energyV">50</output></div>
<div class="ctrl"><label>AUDIO RESPONSE</label><input id="audio" type="range" min="0" max="100" value="60"><output id="audioV">60</output></div>
<div class="ctrl"><label>MOTION</label><input id="motion" type="range" min="0" max="100" value="50"><output id="motionV">50</output></div>
<div class="fact"><span>VARIATION</span><b>AUTO · ANTI-REPEAT V4</b></div>
<div class="fact"><span>MATRIX → AUX</span><b>FRAME-LOCKED</b></div>
<div id="status">Connecting…</div>
</section>

<section class="card">
<div class="title"><span>FIELD ACTIONS</span><span id="confirmed">NOT CONFIRMED</span></div>
<div class="row"><button data-cart="ON">ON</button><button data-cart="NEXT">NEXT</button><button data-cart="AUTO">AUTO</button><button data-cart="OFF">OFF</button></div>
<div class="ctrl"><label>MATRIX</label><input id="mb" type="range" min="0" max="255" value="10"><output id="mbv">10</output></div>
<div class="ctrl"><label>UNDERGLOW</label><input id="ab" type="range" min="0" max="255" value="255"><output id="abv">255</output></div>
</section>
</main>
<script>
(function(){
var ws,projAt=0,matrixAt=0;
var mc=document.getElementById('matrix').getContext('2d'),ac=document.getElementById('aux').getContext('2d');
var status=document.getElementById('status'),lock=document.getElementById('lock'),confirmed=document.getElementById('confirmed');
function send(x){if(ws&&ws.readyState===1)ws.send(x)}
function rgb(data,i){return 'rgb('+data[i]+','+data[i+1]+','+data[i+2]+')'}
function drawMatrix(buf){
 var b=new Uint8Array(buf); if(b.length<7||b[0]!==72||b[1]!==86||b[2]!==1)return;
 var w=b[3],h=b[4]; if(w!==32||h!==16||b.length<7+w*h*3)return;
 var cw=640/w,ch=320/h,p=7;mc.clearRect(0,0,640,320);
 for(var y=0;y<h;y++)for(var x=0;x<w;x++,p+=3){mc.fillStyle=rgb(b,p);mc.fillRect(x*cw,y*ch,cw,ch)}
 matrixAt=Date.now();document.getElementById('matrixState').textContent='LIVE';
}
function drawProjection(hex){
 if(hex.length<132)return;ac.clearRect(0,0,640,120);var w=640/22;
 for(var i=0;i<22;i++){var p=i*6,r=parseInt(hex.slice(p,p+2),16),g=parseInt(hex.slice(p+2,p+4),16),b=parseInt(hex.slice(p+4,p+6),16);ac.fillStyle='rgb('+r+','+g+','+b+')';ac.fillRect(i*w,0,w+1,120)}
 projAt=Date.now();document.getElementById('auxState').textContent='SOURCE LIVE';
}
function connect(){
 ws=new WebSocket('ws://'+location.hostname+':81/');ws.binaryType='arraybuffer';
 ws.onopen=function(){status.textContent='Connected to cart';send('VISUAL_SUBSCRIBE')};
 ws.onclose=function(){status.textContent='Reconnecting…';setTimeout(connect,800)};
 ws.onmessage=function(e){
  if(e.data instanceof ArrayBuffer){drawMatrix(e.data);return}
  var a=String(e.data).split(',');
  if(a[0]==='PROJ'){drawProjection(a[2]||'');return}
  if(a[0]==='SYNC'){var ok=a[1]==='1';lock.textContent=ok?'FRAME LOCK LIVE':'FRAME LOCK NOT CONFIRMED';lock.className='badge '+(ok?'ok':'warn');document.getElementById('auxMeta').textContent='Matrix seq '+a[2]+' · AUX seq '+a[3]+' · RX age '+a[4]+'ms';return}
  if(a[0]==='CARTQUEUED'){status.textContent='Applying to hardware…';confirmed.textContent='WAITING';return}
  if(a[0]==='CARTOK'){status.textContent='Hardware confirmed';confirmed.textContent=a[2]?'REV '+a[2]:'CONFIRMED';confirmed.className='ok';return}
  if(a[0]==='CARTERR'){status.textContent='Not confirmed: '+a.slice(1).join(' ').replace(/_/g,' ');confirmed.textContent='NOT CONFIRMED';confirmed.className='bad';return}
  if(a[0]==='ERR'){status.textContent=a.slice(1).join(' ').replace(/_/g,' ')}
 };
}
['energy','audio','motion'].forEach(function(id){var el=document.getElementById(id),out=document.getElementById(id+'V');el.oninput=function(){out.value=el.value};el.onchange=applyTune});
function applyTune(){send('VISUAL_TUNE,'+document.getElementById('energy').value+','+document.getElementById('audio').value+','+document.getElementById('motion').value)}
document.querySelectorAll('[data-cart]').forEach(function(b){b.onclick=function(){send('CART,'+b.getAttribute('data-cart'))}});
document.getElementById('mb').oninput=function(){document.getElementById('mbv').value=this.value};document.getElementById('mb').onchange=function(){send('CART,BRIGHTNESS,matrix,'+this.value)};
document.getElementById('ab').oninput=function(){document.getElementById('abv').value=this.value};document.getElementById('ab').onchange=function(){send('CART,BRIGHTNESS,aux,'+this.value)};
setInterval(function(){if(Date.now()-matrixAt>1200)document.getElementById('matrixState').textContent='STALE';if(Date.now()-projAt>800)document.getElementById('auxState').textContent='STALE'},500);
connect();
})();
</script></body></html>
)VISUAL";
