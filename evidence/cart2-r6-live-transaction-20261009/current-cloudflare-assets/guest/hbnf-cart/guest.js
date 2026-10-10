(function(){
  "use strict";
  var SUPABASE_URL="https://phcpbvuqibyarpfrftgx.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY="sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
  var endpoint=SUPABASE_URL+"/functions/v1/hbnf-cart-control";
  var path=window.location.pathname.replace(/\/+$/,"/").split("/").filter(Boolean);
  var cartId=path[1]||"";
  var revision=null,busy=false,enabled=false,lastAction={};
  var buttons=Array.prototype.slice.call(document.querySelectorAll("[data-guest-action]"));
  var status=document.getElementById("primaryStatus");
  var detail=document.getElementById("secondaryStatus");
  var live=document.getElementById("live");

  function announce(message,error){status.textContent=message;live.textContent=message;if(error)detail.textContent=error;}
  function controls(on){buttons.forEach(function(button){button.disabled=!on;});}
  function id(){
    var bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    var hex=Array.prototype.map.call(bytes,function(value){return ("0"+value.toString(16)).slice(-2);}).join("");
    return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
  }
  function post(body){
    return fetch(endpoint,{method:"POST",mode:"cors",credentials:"omit",cache:"no-store",headers:{"Content-Type":"application/json","Accept":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(body)})
      .then(function(response){return response.json().catch(function(){return {};}).then(function(data){if(!response.ok){var error=new Error(data.error||("HTTP "+response.status));error.status=response.status;error.data=data;throw error;}return data;});});
  }
  function refresh(){
    if(busy)return Promise.resolve();
    if(cartId!=="hbnf-cart"){
      enabled=false;revision=null;controls(false);
      document.getElementById("connectionBadge").textContent="INVALID LINK";
      document.getElementById("guestBadge").textContent="CLOSED";
      announce("This Guest link is not for the current Cart.","Use the QR link shown in the Cart owner controls.");
      return Promise.resolve();
    }
    busy=true;controls(false);
    return post({action:"status"}).then(function(snapshot){
      var desired=snapshot&&snapshot.desired;
      var cartState=desired&&desired.state;
      revision=desired&&Number.isSafeInteger(Number(desired.revision))?Number(desired.revision):null;
      enabled=!!(cartState&&cartState.guestMode===true&&revision!==null);
      document.getElementById("connectionBadge").textContent="CONNECTED";
      document.getElementById("guestBadge").textContent=enabled?"OPEN":"CLOSED";
      document.getElementById("guestBadge").className="badge "+(enabled?"ready":"closed");
      controls(enabled);
      announce(enabled?"Guest Mode is open.":"Guest Mode is closed.",enabled?"Choose a Vibe or ask the Cart to advance its look.":"Ask the Cart owner to switch Guest Mode on.");
    }).catch(function(error){
      enabled=false;revision=null;controls(false);
      document.getElementById("connectionBadge").textContent="OFFLINE";
      document.getElementById("connectionBadge").className="badge offline";
      document.getElementById("guestBadge").textContent="CLOSED";
      document.getElementById("guestBadge").className="badge closed";
      announce("Could not read the Cart state.",error.message);
    }).finally(function(){busy=false;});
  }
  function act(button){
    if(busy||!enabled||revision===null)return;
    var action=button.getAttribute("data-guest-action");
    var value=button.getAttribute("data-value")||"";
    var now=Date.now();
    if(now-(lastAction[action]||0)<400)return;
    lastAction[action]=now;
    busy=true;controls(false);detail.textContent="Sending through the Cart command path…";
    post({action:"guest_command",commandId:id(),expectedRevision:revision,guestAction:action,value:value})
      .then(function(){announce("Guest action accepted.","The Cart owner can close Guest Mode at any time.");})
      .catch(function(error){
        if(error.status===409&&error.data&&error.data.error==="stale_revision"){
          announce("The Cart changed before that tap landed.","State refreshed. Try again if Guest Mode is still open.");
          return;
        }
        if(error.status===403&&error.data&&error.data.error==="guest_mode_closed"){
          announce("Guest Mode is closed.","The Cart owner has closed Guest Mode.");
          return;
        }
        announce("That action was not accepted.",error.message);
      }).finally(function(){busy=false;refresh();});
  }
  buttons.forEach(function(button){button.addEventListener("click",function(){act(button);});});
  document.getElementById("retry").addEventListener("click",refresh);
  window.addEventListener("online",refresh);
  window.addEventListener("offline",function(){enabled=false;revision=null;controls(false);document.getElementById("connectionBadge").textContent="OFFLINE";announce("Offline. Guest controls are paused.","Reconnect and check Guest Mode again.");});
  refresh();
})();
