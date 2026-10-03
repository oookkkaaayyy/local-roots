(function(){
  "use strict";

  var BUILD="hbnf-guest-platform-v1-staging";
  var SESSION_STORAGE_KEY="hbnf_guest_session_v1";
  var installPrompt=null;
  var endpoint=(document.querySelector('meta[name="hbnf-guest-endpoint"]')||{}).content||"";
  var state={mode:"public",session:null,busy:false};

  function el(id){return document.getElementById(id);}
  function setText(id,value){var n=el(id);if(n)n.textContent=value;}
  function setBadge(mode,text){
    var n=el("connectionBadge"); if(!n)return;
    n.className="badge "+mode; n.textContent=text;
  }
  function controlsEnabled(enabled){
    var nodes=document.querySelectorAll("[data-vibe],#openGames,#openShuffle,#openPressure,#openSequence");
    for(var i=0;i<nodes.length;i++)nodes[i].disabled=!enabled;
  }
  function render(){
    var session=state.session;
    var open=!!(session&&session.open===true);
    controlsEnabled(open);
    var sb=el("sessionBadge");
    if(sb){sb.textContent=open?"OPEN":"CLOSED";sb.className="badge "+(open?"ready":"closed");}
    if(open){
      setBadge("ready","CONNECTED");
      setText("primaryStatus","Guest session is open.");
      setText("secondaryStatus","Only the controls allowed by the cart owner are enabled.");
      setText("sessionText",(session.playerName?"Playing as "+session.playerName+". ":"")+"Session expires automatically.");
    }else if(!navigator.onLine){
      setBadge("offline","OFFLINE");
      setText("primaryStatus","Guest app is available offline.");
      setText("secondaryStatus","Reconnect to HBNF-Cart or the internet, then tap Check again. No controls are sent while disconnected.");
      setText("sessionText","Guest controls are closed while connection is unavailable.");
    }else{
      setBadge("closed","GUEST CLOSED");
      setText("primaryStatus","Guest controls are currently closed.");
      setText("secondaryStatus","The cart owner must open a guest session before controls become active.");
      setText("sessionText","No active guest session.");
    }
  }

  function readSavedSession(){
    try{
      var raw=sessionStorage.getItem(SESSION_STORAGE_KEY);
      return raw?JSON.parse(raw):null;
    }catch(_){return null;}
  }
  function saveSession(value){
    state.session=value||null;
    try{
      if(value)sessionStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }catch(_){}
  }
  function fetchJson(url,opts,done){
    var xhr=new XMLHttpRequest();
    xhr.open((opts&&opts.method)||"GET",url,true);
    xhr.timeout=(opts&&opts.timeout)||3500;
    xhr.setRequestHeader("Accept","application/json");
    if(opts&&opts.body)xhr.setRequestHeader("Content-Type","application/json");
    xhr.onreadystatechange=function(){
      if(xhr.readyState!==4)return;
      var body=null;try{body=JSON.parse(xhr.responseText||"{}");}catch(_){}
      if(xhr.status>=200&&xhr.status<300)done(null,body||{});
      else done(new Error("HTTP "+xhr.status),body||{});
    };
    xhr.onerror=function(){done(new Error("network_error"));};
    xhr.ontimeout=function(){done(new Error("timeout"));};
    try{xhr.send(opts&&opts.body?JSON.stringify(opts.body):null);}catch(e){done(e);}
  }
  function refreshSession(){
    if(state.busy)return;
    state.busy=true;
    if(!endpoint){
      saveSession(null);
      state.busy=false;
      render();
      return;
    }
    var token="";
    try{
      var q=new URLSearchParams(location.search);token=q.get("s")||"";
    }catch(_){}
    var url=endpoint+(endpoint.indexOf("?")>=0?"&":"?")+"action=status"+(token?"&s="+encodeURIComponent(token):"");
    fetchJson(url,{timeout:3500},function(err,data){
      state.busy=false;
      if(err||!data||data.ok!==true||!data.session||data.session.open!==true){
        saveSession(null); render(); return;
      }
      saveSession({
        open:true,
        id:String(data.session.id||""),
        playerName:String(data.session.playerName||""),
        capabilities:data.session.capabilities||{}
      });
      applyCapabilities();
      render();
    });
  }
  function capability(name){
    var caps=state.session&&state.session.capabilities;
    return !!(caps&&caps[name]===true);
  }
  function applyCapabilities(){
    var map=[
      ["vibes","[data-vibe]"],
      ["games","#openGames"],
      ["shuffle","#openShuffle"],
      ["pressure","#openPressure"],
      ["sequence","#openSequence"]
    ];
    for(var i=0;i<map.length;i++){
      var nodes=document.querySelectorAll(map[i][1]);
      for(var j=0;j<nodes.length;j++)nodes[j].disabled=!capability(map[i][0]);
    }
  }
  function command(action,payload){
    if(!endpoint||!state.session||state.session.open!==true)return;
    state.busy=true;
    fetchJson(endpoint,{method:"POST",timeout:3500,body:{action:action,sessionId:state.session.id,payload:payload||{}}},function(err,data){
      state.busy=false;
      if(err||!data||data.ok!==true){
        setText("secondaryStatus","That guest action was not accepted. The session may have expired.");
        refreshSession(); return;
      }
      setText("secondaryStatus","Guest action accepted.");
    });
  }
  function bind(){
    var retry=el("retryConnection");if(retry)retry.onclick=refreshSession;
    var vibes=document.querySelectorAll("[data-vibe]");
    for(var i=0;i<vibes.length;i++)(function(node){
      node.onclick=function(){command("vibe",{vibe:node.getAttribute("data-vibe")});};
    })(vibes[i]);
    var game=el("openGames");if(game)game.onclick=function(){command("open_mode",{mode:"arcade"});};
    var sh=el("openShuffle");if(sh)sh.onclick=function(){command("open_mode",{mode:"shuffle"});};
    var pr=el("openPressure");if(pr)pr.onclick=function(){command("open_mode",{mode:"pressure"});};
    var sq=el("openSequence");if(sq)sq.onclick=function(){command("open_mode",{mode:"sequence"});};
    window.addEventListener("online",refreshSession);
    window.addEventListener("offline",render);
    window.addEventListener("beforeinstallprompt",function(e){
      e.preventDefault();installPrompt=e;
      var b=el("installApp");if(b)b.hidden=false;
    });
    var install=el("installApp");if(install)install.onclick=function(){
      if(installPrompt){installPrompt.prompt();installPrompt=null;install.hidden=true;}
    };
  }
  function boot(){
    setText("buildMarker",BUILD);
    state.session=readSavedSession();
    bind();
    render();
    refreshSession();
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("./hbnf-guest-sw.js").catch(function(){});
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();