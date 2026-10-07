(function(){
  "use strict";
  // Same-origin Cart API. Session continuity is an HttpOnly cookie owned by the backend.
  var path=window.location.pathname.replace(/\/+$/,'').split('/');
  var cartId=decodeURIComponent(path[path.length-1]||'');
  var api='/api/cart/'+encodeURIComponent(cartId)+'/guest';
  var enabled=false,busy=false;
  var status=document.getElementById('status'),detail=document.getElementById('detail'),live=document.getElementById('live');
  var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-action]'));
  function controls(on){buttons.forEach(function(b){b.disabled=!on;});}
  function announce(message,error){status.textContent=message;status.className='status'+(error?' error':'');live.textContent=message;}
  function json(url,options){
    return fetch(url,Object.assign({credentials:'same-origin',headers:{'Accept':'application/json'}},options||{}))
      .then(function(response){return response.json().catch(function(){return {};}).then(function(body){if(!response.ok)throw new Error(body.error||('HTTP '+response.status));return body;});});
  }
  function refresh(){
    if(busy||!cartId){announce('This QR link is incomplete.',true);controls(false);return;}
    busy=true;controls(false);
    json(api+'/session').then(function(data){
      if(data.enabled!==true){return {enabled:false,connected:false};}
      if(data.connected===true){return data;}
      return json(api+'/session',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:'{}'});
    }).then(function(data){
      enabled=data.enabled===true&&data.connected===true;
      controls(enabled);
      announce(enabled?'Guest Mode is open.':'Guest Mode is closed.',false);
      detail.textContent=enabled?'Choose a vibe or join a game. The cart owner remains in control.':'Ask the cart owner to switch Guest Mode on.';
    }).catch(function(error){enabled=false;controls(false);announce('Could not reconnect to the cart.',true);detail.textContent=error.message;})
      .finally(function(){busy=false;});
  }
  function act(button){
    if(busy||!enabled)return;
    busy=true;controls(false);
    json(api+'/actions',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({action:button.dataset.action,value:button.dataset.value})})
      .then(function(){announce('Sent to the cart.',false);})
      .catch(function(error){announce(error.message==='owner_override'?'The owner is controlling the cart right now.':'That action was not accepted.',true);})
      .finally(function(){busy=false;refresh();});
  }
  buttons.forEach(function(button){button.addEventListener('click',function(){act(button);});});
  document.getElementById('retry').addEventListener('click',refresh);
  window.addEventListener('online',refresh);
  window.addEventListener('offline',function(){enabled=false;controls(false);announce('Offline. Reconnect to the cart to continue.',true);});
  refresh();
})();
