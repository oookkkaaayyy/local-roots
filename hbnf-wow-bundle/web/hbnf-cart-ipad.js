(function(){
'use strict';
var SUPABASE_URL='https://phcpbvuqibyarpfrftgx.supabase.co';
var SUPABASE_KEY='sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC';
var CONTROL=SUPABASE_URL+'/functions/v1/hbnf-cart-control';
var ACCESS_KEY='hbnf_ipad_access';
var REFRESH_KEY='hbnf_ipad_refresh';
var EXPIRES_KEY='hbnf_ipad_expires';
var CANONICAL_SESSION_KEY='sb-phcpbvuqibyarpfrftgx-auth-token';
var revision=0;
var commandBusy=false;
var statusNode=document.getElementById('status');
var authPanel=document.getElementById('authPanel');
var authStatus=document.getElementById('authStatus');

function text(nodeId,value){var n=document.getElementById(nodeId);if(n)n.textContent=String(value)}
function jsonParse(s){try{return JSON.parse(s||'{}')}catch(e){return {}}}
function xhr(method,url,body,headers,done){
 var x=new XMLHttpRequest(),k;
 x.open(method,url,true);
 x.timeout=7000;
 headers=headers||{};
 for(k in headers){if(headers.hasOwnProperty(k))x.setRequestHeader(k,headers[k])}
 x.onreadystatechange=function(){if(x.readyState===4)done(x.status,jsonParse(x.responseText),x.responseText)};
 x.ontimeout=function(){done(0,{error:'timeout'},'')};
 x.onerror=function(){done(0,{error:'network_error'},'')};
 x.send(body===null?null:JSON.stringify(body));
}
function parseHash(){
 var h=location.hash?location.hash.substring(1):'',parts=h.split('&'),o={},i,p;
 for(i=0;i<parts.length;i++){p=parts[i].split('=');if(p[0])o[decodeURIComponent(p[0])]=decodeURIComponent((p[1]||'').replace(/\+/g,' '))}
 if(o.access_token){
  localStorage.setItem(ACCESS_KEY,o.access_token);
  if(o.refresh_token)localStorage.setItem(REFRESH_KEY,o.refresh_token);
  localStorage.setItem(EXPIRES_KEY,String(Date.now()+(parseInt(o.expires_in||'3600',10)*1000)));
  history.replaceState(null,'',location.pathname+location.search);
 }
}
function importCanonicalSession(){
 var raw=localStorage.getItem(CANONICAL_SESSION_KEY),s=jsonParse(raw),expires=0;
 if(!s||!s.access_token)return null;
 localStorage.setItem(ACCESS_KEY,s.access_token);
 if(s.refresh_token)localStorage.setItem(REFRESH_KEY,s.refresh_token);
 if(s.expires_at)expires=parseInt(s.expires_at,10)*1000;
 else expires=Date.now()+(parseInt(s.expires_in||'3600',10)*1000);
 localStorage.setItem(EXPIRES_KEY,String(expires));
 return s.access_token;
}
function clearSession(){localStorage.removeItem(ACCESS_KEY);localStorage.removeItem(REFRESH_KEY);localStorage.removeItem(EXPIRES_KEY)}
function refreshToken(done){
 var r=localStorage.getItem(REFRESH_KEY);
 if(!r){done(null);return}
 xhr('POST',SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{refresh_token:r},{
  'Content-Type':'application/json','apikey':SUPABASE_KEY
 },function(code,data){
  if(code>=200&&code<300&&data.access_token){
   localStorage.setItem(ACCESS_KEY,data.access_token);
   if(data.refresh_token)localStorage.setItem(REFRESH_KEY,data.refresh_token);
   localStorage.setItem(EXPIRES_KEY,String(Date.now()+((parseInt(data.expires_in||'3600',10))*1000)));
   done(data.access_token);
  }else{clearSession();done(null)}
 });
}
function ensureToken(done){
 var a=localStorage.getItem(ACCESS_KEY),e=parseInt(localStorage.getItem(EXPIRES_KEY)||'0',10);
 if(a&&e>Date.now()+60000){done(a);return}
 a=importCanonicalSession();
 e=parseInt(localStorage.getItem(EXPIRES_KEY)||'0',10);
 if(a&&e>Date.now()+60000){done(a);return}
 refreshToken(done);
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
 ensureToken(function(token){
  if(!token){authPanel.hidden=false;done(401,{error:'sign_in_required'});return}
  xhr('POST',CONTROL,body,{
   'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+token
  },function(code,data){
   if(code===401){refreshToken(function(t){if(!t){authPanel.hidden=false;done(code,data);return}xhr('POST',CONTROL,body,{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+t},done)})}
   else done(code,data);
  });
 });
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
function sendMagicLink(){
 var email=document.getElementById('authEmail').value.replace(/^\s+|\s+$/g,'');
 if(!email){authStatus.textContent='Enter your email.';return}
 authStatus.textContent='Sending sign-in link…';
 var redirect=location.origin+'/hbnf-cart.html';
 xhr('POST',SUPABASE_URL+'/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),{email:email,create_user:false},{
  'Content-Type':'application/json','apikey':SUPABASE_KEY
 },function(code,data){authStatus.textContent=(code>=200&&code<300)?'Sign-in link sent. Open it on this iPad. After HBNF Cart signs in, return here; this controller reuses the same session.':'Sign-in failed: '+(data.msg||data.error||('HTTP '+code))});
}
function bind(){
 var buttons=document.querySelectorAll('[data-command]'),i,b;
 for(i=0;i<buttons.length;i++){b=buttons[i];b.onclick=(function(x){return function(){command(x)}})(b.getAttribute('data-command'))}
 document.getElementById('sendMagicLink').onclick=sendMagicLink;
 document.getElementById('setScene').onclick=function(){command('SCENE',{sceneId:document.getElementById('scene').value})};
 document.getElementById('setPalette').onclick=function(){command('PALETTE',{paletteId:document.getElementById('palette').value})};
 document.getElementById('setVibe').onclick=function(){command('VIBE',{vibe:document.getElementById('vibe').value})};
 var bright=document.querySelectorAll('[data-brightness]');
 for(i=0;i<bright.length;i++){bright[i].onclick=(function(id){return function(){var v=parseInt(document.getElementById(id+'Brightness').value,10);command('BRIGHTNESS',{deviceId:id,brightness:v})}})(bright[i].getAttribute('data-brightness'))}
 document.getElementById('matrixBrightness').oninput=function(){text('matrixValue',this.value)};
 document.getElementById('auxBrightness').oninput=function(){text('auxValue',this.value)};
 document.getElementById('refresh').onclick=function(){refresh()};
 document.getElementById('signOut').onclick=function(){clearSession();authPanel.hidden=false;statusNode.textContent='Signed out.'};
 document.getElementById('games').onclick=function(){location.href='http://192.168.8.30/'};
}
parseHash();
bind();
ensureToken(function(t){authPanel.hidden=!!t;if(t)refresh();else statusNode.textContent='Sign in to use cart controls.'});
setInterval(function(){if(!document.hidden&&!commandBusy&&localStorage.getItem(ACCESS_KEY))refresh()},1500);
})();
