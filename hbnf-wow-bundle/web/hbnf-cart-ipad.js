(function(){
'use strict';
var SUPABASE_URL='https://phcpbvuqibyarpfrftgx.supabase.co';
var SUPABASE_KEY='sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC';
var CONTROL=SUPABASE_URL+'/functions/v1/hbnf-cart-control';
var revision=0;
var commandBusy=false;
var statusNode=document.getElementById('status');

function text(nodeId,value){var n=document.getElementById(nodeId);if(n)n.textContent=String(value)}
function jsonParse(s){try{return JSON.parse(s||'{}')}catch(e){return {}}}
function xhr(method,url,body,headers,done){
 var x=new XMLHttpRequest(),k,finished=false;
 function finish(code,data,raw){if(finished)return;finished=true;done(code,data,raw)}
 x.open(method,url,true);
 x.timeout=5000;
 headers=headers||{};
 for(k in headers){if(headers.hasOwnProperty(k))x.setRequestHeader(k,headers[k])}
 x.onreadystatechange=function(){if(x.readyState===4)finish(x.status,jsonParse(x.responseText),x.responseText)};
 x.ontimeout=function(){finish(0,{error:'timeout'},'')};
 x.onerror=function(){finish(0,{error:'network_error'},'')};
 x.send(body===null?null:JSON.stringify(body));
}

function randomId(){
 var a=[],i,v;
 if(window.crypto&&window.crypto.getRandomValues){
  var u=new Uint8Array(16);window.crypto.getRandomValues(u);
  for(i=0;i<u.length;i++){v=u[i].toString(16);a.push(v.length<2?'0'+v:v)}
  return a.join('');
 }
 return String(Date.now())+'-'+String(Math.random()).substring(2);
}
function api(body,done){
 xhr('POST',CONTROL,body,{
  'Content-Type':'application/json','apikey':SUPABASE_KEY
 },done);
}
function updateFromStatus(out){
 if(!out||!out.desired)return;
 revision=out.desired.revision||0;
 var s=out.desired.state||{},d=s.devices||{},m=d.matrix||{},a=d.aux||{};
 if(typeof m.brightness==='number'&&document.activeElement!==document.getElementById('matrixBrightness')){
  document.getElementById('matrixBrightness').value=m.brightness;text('matrixValue',m.brightness);
 }
 if(typeof a.brightness==='number'&&document.activeElement!==document.getElementById('auxBrightness')){
  document.getElementById('auxBrightness').value=a.brightness;text('auxValue',a.brightness);
 }
 var obs=out.observed||[],parts=[],i;
 for(i=0;i<obs.length;i++)parts.push(obs[i].device_id+': '+obs[i].status);
 statusNode.textContent='Revision '+revision+' · '+String(s.power||'').toUpperCase()+(parts.length?' · '+parts.join(' · '):'');
 authPanel.hidden=true;
}
function refresh(done){
 api({action:'status'},function(code,out){
  if(code>=200&&code<300){updateFromStatus(out);if(done)done(true)}
  else{if(code!==401)statusNode.textContent='Status unavailable: '+(out.error||('HTTP '+code));if(done)done(false)}
 });
}
function commandAttempt(commandId,type,payload,retried){
 commandBusy=true;
 api({action:'command',commandId:commandId,type:type,payload:payload||{},expectedRevision:revision},function(code,out){
  if(code===409&&out&&out.error==='stale_revision'&&!retried){
   refresh(function(ok){if(ok)commandAttempt(commandId,type,payload,true);else commandBusy=false});
   return;
  }
  if(code>=200&&code<300){
   revision=out.revision||revision;
   statusNode.textContent='Revision '+revision+' accepted';
   refresh(function(){commandBusy=false});
  }else{
   commandBusy=false;
   statusNode.textContent='No change confirmed: '+(out.error||('HTTP '+code));
  }
 });
}
function command(type,payload){if(commandBusy)return;commandAttempt(randomId(),type,payload||{},false)}
function bind(){
 var buttons=document.querySelectorAll('[data-command]'),i,b;
 for(i=0;i<buttons.length;i++){b=buttons[i];b.onclick=(function(x){return function(){command(x)}})(b.getAttribute('data-command'))}
 document.getElementById('setScene').onclick=function(){command('SCENE',{sceneId:document.getElementById('scene').value})};
 document.getElementById('setPalette').onclick=function(){command('PALETTE',{paletteId:document.getElementById('palette').value})};
 document.getElementById('setVibe').onclick=function(){command('VIBE',{vibe:document.getElementById('vibe').value})};
 var bright=document.querySelectorAll('[data-brightness]');
 for(i=0;i<bright.length;i++){bright[i].onclick=(function(id){return function(){var v=parseInt(document.getElementById(id+'Brightness').value,10);command('BRIGHTNESS',{deviceId:id,brightness:v})}})(bright[i].getAttribute('data-brightness'))}
 document.getElementById('matrixBrightness').oninput=function(){text('matrixValue',this.value)};
 document.getElementById('auxBrightness').oninput=function(){text('auxValue',this.value)};
 document.getElementById('refresh').onclick=function(){refresh()};
 document.getElementById('games').onclick=function(){location.href='http://192.168.8.30/'};
}
bind();
refresh();
setInterval(function(){if(!document.hidden&&!commandBusy)refresh()},5000);
})();
