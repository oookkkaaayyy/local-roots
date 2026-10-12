import {createAuthorizedArcadeGame,applyAuthenticatedArcadeAction,tickArcadeGame,rgb888ToRgb565LE} from "./modules/arcade-controller.mjs";

const byId=(id)=>document.getElementById(id),$=async(body)=>{
  const response=await fetch("/hbnf/game",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({ok:false,error:"invalid_response"}));
  if(!response.ok||!result.ok)throw new Error(result.error||"request_rejected");
  return result;
};
const randomHex=(n)=>{const bytes=crypto.getRandomValues(new Uint8Array(n));return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")};
let role="",session=null,client=null,sequence=0,frameSequence=0,pollTimer=0,tickTimer=0,frameTimer=0,heartbeatTimer=0;
let tickRemainder=0,lastTick=0,ownerState=null,frameBusy=false;
function status(message,error=false){byId("status").textContent=message;byId("status").style.color=error?"#ff9b9b":"#8ce3ad"}
function showPlay(){byId("ownerSetup").classList.add("hidden");byId("guestSetup").classList.add("hidden");byId("play").classList.remove("hidden");byId("ownerControls").classList.toggle("hidden",role!=="owner");byId("guestControls").classList.toggle("hidden",role!=="guest");byId("invitePanel").classList.toggle("hidden",role!=="owner")}
function setGameName(name){byId("gameName").textContent=name==="maze-chase"?"Maze Chase":"Snake"}
function stopLoops(){for(const id of [pollTimer,tickTimer,frameTimer,heartbeatTimer])clearInterval(id);pollTimer=tickTimer=frameTimer=heartbeatTimer=0}
function finish(message){stopLoops();role="";session=client=null;ownerState=null;byId("play").classList.add("hidden");byId("ownerSetup").classList.remove("hidden");byId("guestSetup").classList.remove("hidden");status(message)}
async function sendAction(action){if(!session||!client)return;await $( {op:"input",sid:session.id,token:client.token,controller:client.controller,seq:++sequence,action} );}
async function ownerStart(){
  status("Authorizing owner session…");
  const ownerController=randomHex(16),game=byId("game").value;
  const result=await $( {op:"start",game,pin:byId("pin").value,controller:ownerController} );
  byId("pin").value="";role="owner";session={id:result.sid,game};client={token:result.token,controller:ownerController};sequence=0;frameSequence=0;
  ownerState=createAuthorizedArcadeGame({gameId:game,sessionId:session.id,controller:{active:true,paired:true,role:"owner",controllerId:ownerController},snapshot:{},seed:Date.now()>>>0});
  setGameName(game);showPlay();status("Owner session active. Use touch arrows, or share a guest invite.");await publishFrame();
  pollTimer=setInterval(pollActions,90);tickTimer=setInterval(tick,50);frameTimer=setInterval(publishFrame,100);heartbeatTimer=setInterval(()=>$( {op:"heartbeat",sid:session.id,token:client.token,controller:client.controller} ).catch(()=>status("Owner connection lost; game will time out",true)),500);
}
async function joinGuest(){
  const parts=byId("guestCode").value.trim().split(".");if(parts.length!==4||parts[0]!=="G2")throw new Error("Invalid invite code");
  const [_,sid,token,controller]=parts;const result=await $( {op:"guest_check",sid,token,controller} );
  role="guest";session={id:sid,game:result.game};client={token,controller};sequence=0;setGameName(result.game);showPlay();status("Connected as guest. Direction controls only.");
}
async function pollActions(){
  try{const result=await $( {op:"poll",sid:session.id,token:client.token,controller:client.controller} );
    for(const item of result.actions||[]){const event={...item,sessionId:session.id};const applied=applyAuthenticatedArcadeAction(ownerState,event,Date.now());if(applied.ok){ownerState=applied.state;if(item.action==="EXIT"){await $( {op:"exit",sid:session.id,token:client.token,controller:client.controller} );finish("Game ended. Normal animation is active.");return}}}
  }catch(e){status(`Game connection lost: ${e.message}. Normal animation resumes after timeout.`,true);stopLoops()}
}
function tick(){if(role!=="owner"||!ownerState)return;const now=performance.now();if(!lastTick){lastTick=now;return}tickRemainder+=now-lastTick;lastTick=now;while(tickRemainder>=180){ownerState=tickArcadeGame(ownerState);tickRemainder-=180}}
function toBase64(bytes){let binary="";for(let i=0;i<bytes.length;i+=0x4000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x4000));return btoa(binary)}
async function publishFrame(){if(role!=="owner"||!ownerState||frameBusy)return;frameBusy=true;try{await $( {op:"frame",sid:session.id,token:client.token,controller:client.controller,seq:++frameSequence,frame:toBase64(rgb888ToRgb565LE(ownerState.frame))} );
  const game=ownerState.game;byId("score").textContent=session.game==="snake"?`Score ${game.score}`:`Score ${game.score} · Lives ${game.lives}`;
}catch(e){status(`Frame delivery stopped: ${e.message}`,true);stopLoops()}finally{frameBusy=false}}
function padAction(action){if(role==="owner")sendAction(action).catch(e=>status(e.message,true));else if(role==="guest")$( {op:"input",sid:session.id,token:client.token,controller:client.controller,seq:++sequence,action} ).catch(e=>status(e.message,true))}
byId("start").addEventListener("click",()=>ownerStart().catch(e=>status(e.message,true)));
byId("join").addEventListener("click",()=>joinGuest().catch(e=>status(e.message,true)));
document.querySelectorAll("[data-dir]").forEach(button=>{
  const action=button.dataset.dir;button.addEventListener("pointerdown",event=>{event.preventDefault();padAction(action)});button.addEventListener("keydown",event=>{if(event.key===" "){event.preventDefault();padAction(action)}});
});
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",async()=>{const action=button.dataset.action;if(action==="EXIT"){try{await sendAction(action);await $( {op:"exit",sid:session.id,token:client.token,controller:client.controller} );finish("Game ended. Normal animation is active.")}catch(e){status(e.message,true)}}else padAction(action)}));
byId("leaveGuest").addEventListener("click",()=>finish("Left game session."));
byId("grant").addEventListener("click",async()=>{try{const result=await $( {op:"grant_guest",sid:session.id,token:client.token,controller:client.controller} );byId("invite").textContent=`G2.${session.id}.${result.guestToken}.${result.guestController}`;byId("invite").classList.remove("hidden");byId("copyInvite").classList.remove("hidden");byId("revoke").classList.remove("hidden");status("One guest invited; their controls are direction-only") }catch(e){status(e.message,true)}});
byId("copyInvite").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(byId("invite").textContent);status("Guest invite copied") }catch(_){status("Select and copy the invite code",true)}});
byId("revoke").addEventListener("click",async()=>{try{await $( {op:"revoke_guest",sid:session.id,token:client.token,controller:client.controller} );byId("invite").textContent="Guest access revoked";status("Guest access revoked") }catch(e){status(e.message,true)}});
document.addEventListener("keydown",event=>{const key={ArrowUp:"UP",ArrowDown:"DOWN",ArrowLeft:"LEFT",ArrowRight:"RIGHT"}[event.key];if(key){event.preventDefault();padAction(key)}});
window.addEventListener("pagehide",()=>{if(role==="owner"&&session&&client){const body=JSON.stringify({op:"exit",sid:session.id,token:client.token,controller:client.controller});navigator.sendBeacon("/hbnf/game",new Blob([body],{type:"application/json"}))}stopLoops()});
