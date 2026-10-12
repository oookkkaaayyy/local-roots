(function(){
  "use strict";
  var SUPABASE_URL="https://phcpbvuqibyarpfrftgx.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY="sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
  var endpoint=SUPABASE_URL+"/functions/v1/hbnf-cart-control";
  var path=window.location.pathname.replace(/\/+$/,"/").split("/").filter(Boolean);
  var cartId=path[1]||"";
  var revision=null,busy=false,enabled=false,vibeRuntimeReady=false,lastAction={},pendingRevision=null;
  var buttons=Array.prototype.slice.call(document.querySelectorAll("[data-guest-action]"));
  var status=document.getElementById("primaryStatus");
  var detail=document.getElementById("secondaryStatus");
  var live=document.getElementById("live");
  var deviceStatus=document.getElementById("deviceStatus");

  function announce(message,error){status.textContent=message;live.textContent=message;if(error)detail.textContent=error;}
  function deviceState(snapshot,id,wantedRevision){
    var observed=snapshot&&Array.isArray(snapshot.observed)?snapshot.observed:[];
    var report=observed.find(function(item){return item&&item.device_id===id;});
    if(!report)return "UNKNOWN";
    if(Number(report.desired_revision)===wantedRevision&&["online","off"].indexOf(String(report.status))!==-1&&report.reported&&report.reported.confirmed===true)return "CONFIRMED";
    if(report.status==="off"||report.status==="offline"||report.online===false)return "OFFLINE";
    if(report.status==="failed"||(report.reported&&report.reported.confirmed===false&&report.reported.error))return "FAILED";
    return Number.isFinite(Number(report.desired_revision))?"PENDING r"+report.desired_revision:"NO RECENT ACK";
  }
  function updateDeviceStatus(snapshot,wantedRevision){
    var matrix=deviceState(snapshot,"matrix",wantedRevision),aux=deviceState(snapshot,"aux",wantedRevision);
    deviceStatus.textContent="Matrix "+matrix+" · AUX "+aux+" · desired r"+wantedRevision;
    deviceStatus.className="device-status "+(matrix==="CONFIRMED"&&aux==="CONFIRMED"?"confirmed":"unconfirmed");
    return matrix==="CONFIRMED"&&aux==="CONFIRMED";
  }
  function controls(on){buttons.forEach(function(button){button.disabled=!on||(button.hasAttribute("data-vibe-control")&&!vibeRuntimeReady);});}
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
      vibeRuntimeReady=!!(snapshot&&snapshot.capabilities&&snapshot.capabilities.phase2VibeRuntimeV1===true);
      var desired=snapshot&&snapshot.desired;
      var cartState=desired&&desired.state;
      revision=desired&&Number.isSafeInteger(Number(desired.revision))?Number(desired.revision):null;
      enabled=!!(cartState&&cartState.guestMode===true&&revision!==null);
      document.getElementById("connectionBadge").textContent="BACKEND ONLINE";
      document.getElementById("connectionBadge").className="badge ready";
      document.getElementById("guestBadge").textContent=enabled?"OPEN":"CLOSED";
      document.getElementById("guestBadge").className="badge "+(enabled?"ready":"closed");
      var devicesConfirmed=revision!==null&&updateDeviceStatus(snapshot,revision);
      controls(enabled);
      if(pendingRevision!==null){
        if(revision>pendingRevision){pendingRevision=null;announce("Cart state changed before device confirmation.","Refresh and retry only if Guest Mode remains open.");}
        else if(revision===pendingRevision&&devicesConfirmed){pendingRevision=null;announce("Guest action applied on Matrix and AUX.","Both devices confirmed revision "+revision+".");}
        else announce("Guest action queued; device confirmation pending.","Backend accepted revision "+pendingRevision+". Matrix/AUX application is not yet confirmed.");
      }else if(enabled)announce("Guest Mode is open.",vibeRuntimeReady?"Choose a Vibe or use Next look and Cart Auto. The owner can close Guest Mode at any time.":"Vibe selection is unavailable until the matching Cart runtime is qualified. Use Next look or Cart Auto.");
      else announce("Guest Mode is closed.","Ask the Cart owner to switch Guest Mode on.");
    }).catch(function(error){
      enabled=false;revision=null;controls(false);
      document.getElementById("connectionBadge").textContent="OFFLINE";
      document.getElementById("connectionBadge").className="badge offline";
      deviceStatus.textContent="Matrix/AUX status unavailable";
      deviceStatus.className="device-status unconfirmed";
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
      .then(function(result){pendingRevision=Number.isSafeInteger(Number(result&&result.revision))?Number(result.revision):revision;announce("Guest action queued; device confirmation pending.","Backend accepted revision "+pendingRevision+". Matrix/AUX application is not yet confirmed.");})
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
  window.addEventListener("offline",function(){enabled=false;revision=null;controls(false);document.getElementById("connectionBadge").textContent="BACKEND OFFLINE";document.getElementById("connectionBadge").className="badge offline";deviceStatus.textContent="Matrix/AUX status unavailable";deviceStatus.className="device-status unconfirmed";announce("Offline. Guest controls are paused.","Reconnect and check Guest Mode again.");});
  refresh();
})();
