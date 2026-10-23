(function(){
  "use strict";
  var SUPABASE_URL="https://phcpbvuqibyarpfrftgx.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY="sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
  var endpoint=SUPABASE_URL+"/functions/v1/hbnf-cart-control";
  var path=window.location.pathname.replace(/\/+$/,"/").split("/").filter(Boolean);
  var cartId=path[1]||"";
  var revision=null,busy=false,enabled=false,vibeRuntimeReady=false,autoVibeReady=false,lastAction={},pendingRevision=null;
  var controlsList=Array.prototype.slice.call(document.querySelectorAll("[data-guest-action],[data-guest-input]"));
  var buttons=Array.prototype.slice.call(document.querySelectorAll("button[data-guest-action]"));
  var status=document.getElementById("primaryStatus");
  var detail=document.getElementById("secondaryStatus");
  var live=document.getElementById("live");
  var deviceStatus=document.getElementById("deviceStatus");

  function announce(message,error){status.textContent=message;live.textContent=message;if(error)detail.textContent=error;}
  function deviceState(snapshot,id,wantedRevision){
    var observed=snapshot&&Array.isArray(snapshot.observed)?snapshot.observed:[];
    var report=observed.find(function(item){return item&&item.device_id===id;});
    if(!report)return "Unknown";
    if(Number(report.desired_revision)===wantedRevision&&["online","off"].indexOf(String(report.status))!==-1&&report.reported&&report.reported.confirmed===true)return "Responding";
    if(report.status==="off"||report.status==="offline"||report.online===false)return "Offline";
    if(report.status==="failed"||(report.reported&&report.reported.confirmed===false&&report.reported.error))return "Needs attention";
    return Number.isFinite(Number(report.desired_revision))?"Waiting":"No recent update";
  }
  function updateDeviceStatus(snapshot,wantedRevision){
    var matrix=deviceState(snapshot,"matrix",wantedRevision),aux=deviceState(snapshot,"aux",wantedRevision);
    deviceStatus.textContent="Matrix: "+matrix+" · Underglow: "+aux;
    deviceStatus.className="device-status "+(matrix==="Responding"&&aux==="Responding"?"acknowledged":"unconfirmed");
    return matrix==="Responding"&&aux==="Responding";
  }
  function controls(on){controlsList.forEach(function(control){control.disabled=!on||(control.hasAttribute("data-vibe-control")&&!vibeRuntimeReady)||(control.getAttribute("data-guest-action")==="vibe_auto"&&!autoVibeReady);});var options=document.getElementById("vibeOptions"),availability=document.getElementById("vibeAvailability"),auto=document.getElementById("guestAutoVibe");if(options)options.hidden=!vibeRuntimeReady;if(availability)availability.hidden=vibeRuntimeReady;if(auto)auto.hidden=!autoVibeReady;}
  function renderControlState(cartState){
    var devices=cartState&&cartState.devices||{},matrix=devices.matrix||{},aux=devices.aux||{},tuning=cartState&&cartState.tuning||{};
    var values=[["matrixBrightness","matrixBrightnessValue",matrix.brightness],["auxBrightness","auxBrightnessValue",aux.brightness],["guestMotion","guestMotionValue",tuning.motion],["guestAudio","guestAudioValue",tuning.audioResponse]];
    values.forEach(function(row){var input=document.getElementById(row[0]),output=document.getElementById(row[1]);if(input&&Number.isFinite(Number(row[2]))){input.value=String(row[2]);if(output)output.value=String(row[2]);}});
    var scene=document.getElementById("guestScene"),palette=document.getElementById("guestPalette");
    if(scene&&cartState.sceneId)scene.value=String(cartState.sceneId);
    if(palette&&cartState.paletteId&&Array.prototype.some.call(palette.options,function(option){return option.value===String(cartState.paletteId);}))palette.value=String(cartState.paletteId);
    var selected=String(cartState&&cartState.selectedVibe||"");
    document.querySelectorAll('[data-guest-action="vibe"]').forEach(function(button){button.setAttribute("aria-pressed",button.getAttribute("data-value")===selected?"true":"false");});
  }
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
      document.getElementById("connectionBadge").textContent="LINK UNAVAILABLE";
      document.getElementById("guestBadge").textContent="CLOSED";
      announce("This link doesn’t match the Cart.","Scan the QR code shown in the owner controls.");
      return Promise.resolve();
    }
    busy=true;controls(false);
    return post({action:"status"}).then(function(snapshot){
      vibeRuntimeReady=!!(snapshot&&snapshot.capabilities&&snapshot.capabilities.phase2VibeRuntimeV1===true);
      autoVibeReady=!!(snapshot&&snapshot.capabilities&&snapshot.capabilities.autoVibeControlV1===true);
      var desired=snapshot&&snapshot.desired;
      var cartState=desired&&desired.state;
      revision=desired&&Number.isSafeInteger(Number(desired.revision))?Number(desired.revision):null;
      enabled=!!(cartState&&cartState.guestMode===true&&revision!==null);
      renderControlState(cartState||{});
      document.getElementById("connectionBadge").textContent="CART ONLINE";
      document.getElementById("connectionBadge").className="badge ready";
      document.getElementById("guestBadge").textContent=enabled?"OPEN":"CLOSED";
      document.getElementById("guestBadge").className="badge "+(enabled?"ready":"closed");
      var devicesConfirmed=revision!==null&&updateDeviceStatus(snapshot,revision);
      controls(enabled);
      if(pendingRevision!==null){
        if(revision>pendingRevision){pendingRevision=null;announce("The Cart changed before your choice was applied.","Check the current status and try again if Guest Mode is still on.");}
        else if(revision===pendingRevision&&devicesConfirmed){pendingRevision=null;announce("Change applied.","Matrix and underglow confirmed the setting. Check the lights to confirm the visible result.");}
        else announce("Choice sent. Waiting for the Cart.","Status will update shortly.");
      }else if(enabled)announce("Guest Mode is on.","Choose a Vibe, or tap Next look or Cart Auto.");
      else announce("Guest Mode is off.","Ask the owner to turn it on before trying again.");
    }).catch(function(error){
      enabled=false;revision=null;controls(false);
      document.getElementById("connectionBadge").textContent="CART OFFLINE";
      document.getElementById("connectionBadge").className="badge offline";
      deviceStatus.textContent="Status unavailable";
      deviceStatus.className="device-status unconfirmed";
      document.getElementById("guestBadge").textContent="CLOSED";
      document.getElementById("guestBadge").className="badge closed";
      announce("Can't reach the Cart right now.","Check your connection and try again.");
    }).finally(function(){busy=false;});
  }
  function act(button){
    if(busy||!enabled||revision===null)return;
    var action=button.getAttribute("data-guest-action");
    var value=(button.tagName==="INPUT"||button.tagName==="SELECT"||button.tagName==="TEXTAREA")?button.value:(button.getAttribute("data-value")||"");
    if(action==="text"){var textField=document.getElementById("guestText");value=textField?textField.value.trim():"";if(!value){announce("Enter a short message first.");return;}}
    var now=Date.now();
    if(now-(lastAction[action]||0)<400)return;
    lastAction[action]=now;
    busy=true;controls(false);detail.textContent="Sending your choice…";
    post({action:"guest_command",commandId:id(),expectedRevision:revision,guestAction:action,value:value})
      .then(function(result){pendingRevision=Number.isSafeInteger(Number(result&&result.revision))?Number(result.revision):revision;announce("Choice sent. Waiting for the Cart.","Status will update shortly.");})
      .catch(function(error){
        if(error.status===409&&error.data&&error.data.error==="stale_revision"){
          announce("The Cart changed before your choice was applied.","Status refreshed. Try again if Guest Mode is still on.");
          return;
        }
        if(error.status===403&&error.data&&error.data.error==="guest_mode_closed"){
          announce("Guest Mode is off.","Ask the owner to turn it on before trying again.");
          return;
        }
        announce("That choice couldn’t be sent.","Check your connection and try again.");
      }).finally(function(){busy=false;refresh();});
  }
  buttons.forEach(function(button){button.addEventListener("click",function(){act(button);});});
  controlsList.forEach(function(control){if(control.tagName==="INPUT"||control.tagName==="SELECT"||control.tagName==="TEXTAREA"){
    control.addEventListener("input",function(){var output=document.getElementById(control.id+"Value");if(output)output.value=control.value;});
    if(control.hasAttribute("data-guest-action"))control.addEventListener("change",function(){act(control);});
  }});
  document.getElementById("retry").addEventListener("click",refresh);
  window.addEventListener("online",refresh);
  window.addEventListener("offline",function(){enabled=false;revision=null;controls(false);document.getElementById("connectionBadge").textContent="CART OFFLINE";document.getElementById("connectionBadge").className="badge offline";deviceStatus.textContent="Status unavailable";deviceStatus.className="device-status unconfirmed";announce("You're offline.","Reconnect to try again.");});
  window.setInterval(refresh,10000);
  refresh();
})();
