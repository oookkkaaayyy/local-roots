#pragma once

static const char HBNF_LOCAL_UI[] PROGMEM = R"HBNFHTML(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#071018">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#071018">
<meta name="apple-mobile-web-app-title" content="HBNF Matrix">
<link rel="icon" type="image/png" sizes="16x16" href="/hbnf/favicon-16.png?v=20260930-1">
<link rel="icon" type="image/png" sizes="32x32" href="/hbnf/favicon-32.png?v=20260930-1">
<link rel="icon" type="image/png" sizes="48x48" href="/hbnf/favicon-48.png?v=20260930-1">
<link rel="apple-touch-icon" sizes="180x180" href="/hbnf/icon.png?v=20260930-1">
<title>HBNF Matrix Controller</title>
<style>
:root{color-scheme:dark;font:16px/1.35 system-ui,sans-serif;background:#071018;color:#eef6f7}
*{box-sizing:border-box}html{min-height:100%;background:#071018}body{margin:0 auto;max-width:960px;min-height:100vh;min-height:100svh;padding:calc(14px + env(safe-area-inset-top,0px)) calc(14px + env(safe-area-inset-right,0px)) calc(18px + env(safe-area-inset-bottom,0px)) calc(14px + env(safe-area-inset-left,0px))}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px}
h1{font-size:1.35rem;margin:0}.badge{font-size:.75rem;font-weight:800;padding:6px 9px;border:1px solid #365967;border-radius:999px}
.ok{color:#8ce3ad}.bad{color:#ff9b9b}
.panel{background:#0d1d25;border:1px solid #24414c;border-radius:14px;padding:15px;margin:12px 0}
.controller-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:0;align-items:start}
.status-grid{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center}.status-value{font-size:.78rem;font-weight:800;text-align:right}.status-value.ok{color:#8ce3ad}.status-value.bad{color:#ff9b9b}.status-value.unknown{color:#9bb5bd}
.scene{display:grid;grid-template-columns:1fr 1fr;gap:8px}
button{font:inherit;color:inherit;background:#142c36;border:1px solid #35606b;border-radius:10px;padding:12px}
button.active{outline:2px solid #65e2c1;background:#173b3b}
button,input,select,textarea{min-height:44px;touch-action:manipulation}
label{display:grid;gap:7px;margin:15px 0}.head{display:flex;justify-content:space-between;font-weight:750}
input[type=range]{width:100%;height:44px}.sub{color:#9bb5bd;font-size:.82rem;margin:3px 0 0}
.palette-preview{height:28px;border:1px solid #365967;border-radius:8px;background:repeating-conic-gradient(#24343a 0% 25%,#132128 0% 50%) 50%/14px 14px}
details.panel{padding:0;overflow:hidden}details.panel>summary{min-height:48px;display:flex;align-items:center;padding:12px 15px;font-weight:800;cursor:pointer;touch-action:manipulation}details.panel[open]>summary{border-bottom:1px solid #24414c}details.panel>.details-body{padding:0 15px 15px}details.panel>summary:focus-visible{outline:3px solid #65e2c1;outline-offset:-3px;border-radius:14px}
.vibe-panel{border-color:#35606b;background:linear-gradient(145deg,#10262d,#0d1d25)}.details-title{font-size:1rem}
@media(min-width:760px){body{padding-left:22px;padding-right:22px}.controller-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}.controller-grid>.panel{margin:8px 0}.controller-grid>.wide-panel{grid-column:1/-1}}
@media(max-width:420px){body{padding-left:12px;padding-right:12px}.panel{padding:13px}.scene{gap:7px}button{padding:11px 9px}header{flex-wrap:wrap}.badge{font-size:.68rem}}
</style>
</head>
<body>
<header><h1>HBNF Cart</h1><span id="conn" class="badge bad">MATRIX LOCAL · CONNECTING</span></header>

<main class="controller-grid">
<section class="panel vibe-panel" aria-label="Vibe selection">
<div class="head"><span>Vibe</span><span id="activeVibe" class="sub">CHILL</span></div>
<div class="scene">
<button data-vibe="chill">Chill</button><button data-vibe="groove">Groove</button>
<button data-vibe="psychedelic">Psychedelic</button><button data-vibe="heavy">Heavy</button>
<button data-vibe="cosmic">Cosmic</button><button data-vibe="auto">Auto</button>
</div>
<p class="sub">Local Matrix selection. Auto follows broad audio features with a long dwell; appearance remains owner-reviewable.</p>
</section>

<section class="panel">
<label><span class="head"><span>Matrix brightness</span><output id="matrixOut">24</output></span>
<input id="matrix" type="range" min="0" max="255" value="24"></label>
<label><span class="head"><span>Underglow brightness</span><output id="auxOut">24</output></span>
<input id="aux" type="range" min="0" max="255" value="24"></label>
</section>

<section class="panel">
<label><span class="head"><span>Motion</span><output id="motionOut">50</output></span>
<input id="motion" type="range" min="0" max="100" value="50"></label>
<label><span class="head"><span>Audio response</span><output id="audioOut">50</output></span>
<input id="audio" type="range" min="0" max="100" value="50"></label>
<p class="sub">Direct local controls. No cloud command path.</p>
</section>

<section class="panel" aria-label="Matrix overlay">
<div class="head"><span>Matrix overlay</span><span class="sub">AUX keeps the base visual</span></div>
<label>Text<input id="overlayText" type="text" maxlength="63" autocomplete="off"></label>
<label>Text color<input id="overlayColor" type="color" value="#ffffff"></label>
<button id="sendOverlayText" type="button">Show text · 8 seconds</button>
<label>Scoreboard label<select id="scoreLabel"><option>F9</option><option>B9</option><option>GLOW</option><option>SCORES</option></select></label>
<label>Entries · one per line<textarea id="scoreEntries" rows="4" maxlength="767"></textarea></label>
<button id="sendScoreboard" type="button">Show scoreboard · 22 seconds</button>
<button id="clearOverlay" type="button">Clear overlay</button>
</section>

<details class="panel palette-panel">
<summary>Color options</summary>
<div class="details-body">
<p class="sub">Automatic cart color is the default for new selections. Existing saved color settings are preserved. Palette and solid-color controls remain available here.</p>
<label>Color source<select id="paletteMode"><option value="legacy">Automatic · cart color</option><option value="wled">WLED palette</option><option value="solid">Solid color</option></select></label>
<label>WLED palette<select id="paletteSelect" disabled><option value="">Loading named palettes…</option></select></label>
<div id="palettePreview" class="palette-preview" role="img" aria-label="Palette preview unavailable"></div>
<p id="paletteStatus" class="sub" role="status" aria-live="polite">Choose a named palette; application is confirmed by Matrix state.</p>
<label>Solid color<input id="solidColor" type="color" value="#ffffff"></label>
<button id="applyPalette" type="button">Apply color source</button>
<p class="sub">Color source only. Motion, audio response, effects, phase, and independent brightness stay unchanged.</p>
</div>
</details>

<details class="panel scene-panel">
<summary><span class="details-title">Animation Mix</span></summary>
<div class="details-body">
<p class="sub">All mixes draw from the same 28 animation kernels. They change pacing and variation, not the kernel family. Vibe is the main appearance control.</p>
<div class="scene">
<button data-scene="course-flow">Balanced <span class="sub">Course Flow · 45–90s between variants; broad speed range.</span></button>
<button data-scene="field-mix">Upbeat <span class="sub">Field Mix · faster speed range; 40–80s holds.</span></button>
<button data-scene="hbnf-signature">Signature <span class="sub">HBNF Signature · mid-to-fast range; 50–100s holds.</span></button>
<button data-scene="quiet-cosmos">Ambient <span class="sub">Quiet Cosmos · slower range; 60–120s holds.</span></button>
</div>
</div>
</details>

<details class="panel wide-panel system-panel" id="cartStatus">
<summary>System Info</summary>
<div class="details-body">
<div class="head"><span>Local device status</span><span id="statusUpdated" class="sub">Waiting for Matrix</span></div>
<div class="status-grid">
<span>Matrix local link</span><span id="localTruth" class="status-value unknown">CONNECTING</span>
<span>Matrix response</span><span id="matrixTruth" class="status-value unknown">CHECKING</span>
<span>AUX physical illumination</span><span id="auxTruth" class="status-value unknown">Not verified here</span>
<span>Firmware build</span><a href="/hbnf/build.json">View identity</a>
</div>
<p class="sub">This page can confirm its Matrix connection. AUX brightness is a command value; DDP or a command acknowledgement does not confirm physical AUX illumination.</p>
</div>
</details>

<details class="panel live-panel" id="livePanel">
<summary>Skins Live Data <span id="liveAvailability" class="sub">Requires internet</span></summary>
<div class="details-body" aria-live="polite">
<div class="head"><span>Current round</span><span id="liveStatus" class="sub">Checking</span></div>
<p class="sub" id="liveRound">No current Skins round</p>
<div class="sub" id="livePlayers"></div>
<p class="sub" id="livePot"></p>
</div>
</details>
</main>

<script>
const $=s=>document.querySelector(s);
const defaults={scene:"course-flow",vibe:"chill",motion:50,audio:50,matrixBrightness:24,auxBrightness:24};
const stored=(()=>{try{return JSON.parse(localStorage.getItem("hbnf.foundation.v1")||"{}")}catch(_){return {}}})();
const state=Object.assign({},defaults,stored),pending={};
let ws=null,fx=null,retry=null,retryDelay=500,fxInitSent=false,brightnessTimers={},everConnected=false,connectStarted=0,lastPongAt=0,pendingAt={},wledPaletteNames=[],palettesLoaded=false;
let canonicalDeviceState=null,canonicalRevision=0,canonicalWaiters=[];
// AI: below section was generated by an AI
const LIVE_CONFIG_URL="https://hbnightflyers.com/config.js";
const LIVE_TIMEOUT_MS=3000,LIVE_CACHE_TTL_MS=120000,LIVE_MAX_BYTES=524288,LIVE_POLL_MS=15000,LIVE_CACHE_KEY="hbnf.skins.live.v1";
let liveConfig=null,liveSnapshot=null,liveRequest=null,liveTimer=null,liveRetry=LIVE_POLL_MS,lastPublishedLiveKey="";
const laDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const cleanLiveText=v=>String(v==null?"":v).trim().replace(/\s*\/\s*/g," / ").replace(/\s+/g," ");
function skinsCards(section){return section&&Array.isArray(section.cards)?section.cards:[]}
function skinsHasNames(section,team){return skinsCards(section).some(function(c){return String(c?(team?(c.teamsText==null?"":c.teamsText):(c.playersText==null?"":c.playersText)):"").trim()})}
function skinsSectionLocked(section){const list=skinsCards(section);return !!(section&&section.scoresLocked)||(list.length>0&&list.every(function(card){return !!(card&&(card.scoresLocked||card.finalized))}))}
function skinsWinnerIndex(card,hole,team){const winners=card&&card.winners,raw=String(winners&&winners[String(hole)]!=null?winners[String(hole)]:"");const m=raw.match(team?/_team_(\d+)$/:/_p_(\d+)$/);return m?Number(m[1]):null}
function skinsSectionEntries(section,team,start){const out=[];for(const c of skinsCards(section)){const names=String(team?(c&&c.teamsText!=null?c.teamsText:""):(c&&c.playersText!=null?c.playersText:"")).split(/\r?\n/).map(cleanLiveText).filter(Boolean),counts=new Array(names.length).fill(0);let carry=1;for(let h=start;h<start+9;h++){const i=skinsWinnerIndex(c,h,team);if(i!==null&&i>=0&&i<names.length){counts[i]+=carry;carry=1}else carry++}const winners=c&&c.winners,tb=String(winners&&winners.tb!=null?winners.tb:"");if(carry>1&&tb){const m=tb.match(team?/_team_(\d+)$/:/_p_(\d+)$/);if(m){const i=Number(m[1]);if(i>=0&&i<names.length)counts[i]+=carry-1}}names.forEach(function(name,i){out.push(name+" "+(counts[i]==null?0:counts[i]))})}return out}
function skinsPlayerCount(section,team){let n=0;for(const c of skinsCards(section)){const names=String(team?(c&&c.teamsText!=null?c.teamsText:""):(c&&c.playersText!=null?c.playersText:"")).split(/\r?\n/).map(cleanLiveText).filter(Boolean);n+=team?names.reduce(function(s,name){return s+Math.max(1,name.split("/").map(cleanLiveText).filter(Boolean).length)},0):names.length}return n}
function skinsAcePot(root){let pot=0;const skins=root&&root.skins,weeks=skins&&skins.weeks;for(const date of Object.keys(weeks==null?{}:weeks).sort()){const w=weeks[date]==null?{}:weeks[date],front=skinsPlayerCount(w.front,false),frontData=w.front,frontWinner=frontData!=null?frontData.aceWinner:null;if(front)pot+=front;if(front&&String(frontWinner==null?"":frontWinner).trim())pot=0;const back=skinsPlayerCount(w.back,true),backData=w.back,backWinner=backData!=null?backData.aceWinner:null;if(back)pot+=back;if(back&&String(backWinner==null?"":backWinner).trim())pot=0}return pot}
function buildSkinsSnapshot(root,updatedAt){const date=laDate(),skins=root&&root.skins,weeks=skins&&skins.weeks,week=weeks&&weeks[date];let label="",entries=[];if(week&&(skinsHasNames(week.front,false)||skinsHasNames(week.back,true))){if(skinsHasNames(week.back,true)&&skinsSectionLocked(week.front)){label="B9";entries=skinsSectionEntries(week.back,true,10)}else if(skinsHasNames(week.front,false)){label="F9";entries=skinsSectionEntries(week.front,false,1)}}return{schema:"hbnf-live-v1",updatedAt:updatedAt,active:!!(label&&entries.length),label:label,acePot:skinsAcePot(root),entries:entries}}
function validateLiveSnapshot(root,updatedAt){if(!root||typeof root!=="object"||Array.isArray(root)||!Number.isFinite(Date.parse(updatedAt)))return null;const skins=root.skins,weeks=skins&&skins.weeks;if(!skins||typeof skins!=="object"||Array.isArray(skins)||!weeks||typeof weeks!=="object"||Array.isArray(weeks))return null;const today=weeks[laDate()];if(today!=null){if(typeof today!=="object"||Array.isArray(today))return null;for(const side of ["front","back"]){const part=today[side];if(part!=null&&(typeof part!=="object"||Array.isArray(part)))return null;if(part&&part.cards!=null&&!Array.isArray(part.cards))return null}}const raw=buildSkinsSnapshot(root,updatedAt);if(!Number.isInteger(raw.acePot)||raw.acePot<0||raw.acePot>9999||raw.entries.length>20||raw.entries.some(function(x){return typeof x!=="string"||!x.trim()||x.length>128}))return null;const result=Object.assign({},raw);result.entries=Object.freeze(raw.entries.slice());return Object.freeze(result)}
function liveDisplayKey(s){return s?JSON.stringify([s.active,s.label,s.acePot,s.entries]):"stale"}
function commitLiveSnapshot(data,revision,receivedAt){receivedAt=receivedAt===undefined?Date.now():receivedAt;const stamp=Date.parse(revision),oldStamp=liveSnapshot?Date.parse(liveSnapshot.revision):NaN;if(!data||!Number.isFinite(stamp)||(Number.isFinite(oldStamp)&&stamp<oldStamp))return false;const changed=!liveSnapshot||liveDisplayKey(data)!==liveDisplayKey(liveSnapshot.data);liveSnapshot={data:data,revision:revision,receivedAt:receivedAt};try{localStorage.setItem(LIVE_CACHE_KEY,JSON.stringify(liveSnapshot))}catch(_){}return changed}
function restoreLiveSnapshot(now){now=now===undefined?Date.now():now;try{const saved=JSON.parse(localStorage.getItem(LIVE_CACHE_KEY)||"null"),s=saved&&saved.data;if(!saved||!Number.isFinite(saved.receivedAt)||now<saved.receivedAt||now-saved.receivedAt>=LIVE_CACHE_TTL_MS||!Number.isFinite(Date.parse(saved.revision))||!s||s.schema!=="hbnf-live-v1"||typeof s.active!=="boolean"||!Number.isInteger(s.acePot)||s.acePot<0||s.acePot>9999||!Array.isArray(s.entries)||s.entries.length>20||(s.active?(s.label!=="F9"&&s.label!=="B9")||s.entries.length===0:s.entries.length!==0)||s.entries.some(function(x){return typeof x!=="string"||!x.trim()||x.length>128}))throw new Error("invalid cache");const data=Object.assign({},s);data.entries=Object.freeze(s.entries.slice());Object.freeze(data);liveSnapshot={data:data,revision:saved.revision,receivedAt:saved.receivedAt};return true}catch(_){try{localStorage.removeItem(LIVE_CACHE_KEY)}catch(__){}return false}}
function freshLiveSnapshot(now=Date.now()){return liveSnapshot&&now>=liveSnapshot.receivedAt&&now-liveSnapshot.receivedAt<LIVE_CACHE_TTL_MS?liveSnapshot.data:null}
async function readLiveRow(cfg,fetcher=fetch,timeoutMs=LIVE_TIMEOUT_MS){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);try{const base=String(cfg.SUPABASE_URL||"").replace(/\/$/,"");const r=await fetcher(`${base}/rest/v1/league_state?select=state_json,updated_at&id=eq.1`,{headers:{apikey:cfg.SUPABASE_ANON_KEY,Authorization:`Bearer ${cfg.SUPABASE_ANON_KEY}`,Accept:"application/json"},cache:"no-store",signal:abort.signal});if(!r.ok)throw new Error("read failed");const text=await r.text();if(new TextEncoder().encode(text).length>LIVE_MAX_BYTES)throw new Error("snapshot too large");const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length!==1)throw new Error("snapshot missing");return rows[0]}finally{clearTimeout(timer)}}
function liveDisplay(s,status){$("#liveStatus").textContent=status;if(!s||!s.active){$("#liveRound").textContent="No current Skins round";$("#livePlayers").textContent="";$("#livePot").textContent=s?"Ace pot amount unavailable":"";return}$("#liveRound").textContent=`${s.label==="B9"?"Back 9":"Front 9"} · ${s.entries.length} players`;
 const names=s.entries.map(matrixLiveEntry);$("#livePlayers").textContent=names.every(Boolean)?names.join("  ·  "):"Standings name format unsupported";$("#livePot").textContent="Ace pot amount unavailable"}
function loadLiveConfig(){const current=window.APP_CONFIG;if(current&&current.SUPABASE_URL&&current.SUPABASE_ANON_KEY){liveConfig=current;setWanStatus("checking");return Promise.resolve(liveConfig)}setWanStatus("checking");return new Promise(resolve=>{const script=document.createElement("script");let settled=false;const finish=(config,available)=>{if(settled)return;settled=true;clearTimeout(timer);if(config)liveConfig=config;setWanStatus(available?"checking":"offline");resolve(liveConfig)};const timer=setTimeout(()=>finish(null,false),3500);script.async=true;script.src=LIVE_CONFIG_URL;script.onload=()=>{const c=window.APP_CONFIG,available=!!(c&&c.SUPABASE_URL&&c.SUPABASE_ANON_KEY);finish(available?c:null,available)};script.onerror=()=>finish(null,false);document.head.appendChild(script)})}
function matrixLiveEntry(line){const m=String(line).match(/^(.*?)\s+(\d+)$/);if(!m||m[2].length>4)return null;const name=m[1].trim().replace(/\s*\/\s*/g,"/").replace(/\s+/g," ");return name&&name.length<=58&&/^[A-Za-z0-9 .\-/?$']+$/.test(name)?`${name} ${m[2]}`:null}
async function publishLive(force=false){if(!liveSnapshot)return;const fresh=Date.now()-liveSnapshot.receivedAt<LIVE_CACHE_TTL_MS;const data=liveSnapshot.data;const entries=fresh&&data.active?data.entries.map(matrixLiveEntry):[];if(fresh&&data.active&&(!entries.length||entries.some(x=>!x)))return;const payload={schema:"hbnf-live-v1",revision:liveSnapshot.revision,active:fresh&&data.active,label:fresh&&data.active?data.label:"",acePot:data.acePot,entries:entries};const key=JSON.stringify([payload.active,payload.label,payload.acePot,payload.entries]);if(!force&&key===lastPublishedLiveKey)return;try{const r=await fetch("/hbnf/live",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});if(r.ok)lastPublishedLiveKey=key}catch(_){}}
async function refreshLive(){if(document.visibilityState==="hidden")return;if(liveRequest)return liveRequest;liveRequest=(async()=>{const cfg=await loadLiveConfig();if(!cfg){liveRetry=Math.min(60000,Math.max(LIVE_POLL_MS,liveRetry*2));liveRequest=null;clearTimeout(liveTimer);liveTimer=document.visibilityState==="visible"?setTimeout(refreshLive,liveRetry):null;return}try{const row=await readLiveRow(cfg),updatedAt=String(row.updated_at==null?"":row.updated_at),stamp=Date.parse(updatedAt);if(liveSnapshot&&stamp<Date.parse(liveSnapshot.revision))throw new Error("older revision");const data=validateLiveSnapshot(row.state_json,updatedAt);if(!data)throw new Error("snapshot invalid");commitLiveSnapshot(data,updatedAt);liveRetry=LIVE_POLL_MS;setWanStatus("online");liveDisplay(liveSnapshot.data,liveSnapshot.data.active?"LIVE":"READY");await publishLive(true)}catch(_){const cached=freshLiveSnapshot();if(cached){setWanStatus("offline");liveDisplay(cached,"CACHED");await publishLive(true)}else{setWanStatus("offline");liveDisplay(null,"OFFLINE");if(lastPublishedLiveKey!=="stale"){try{const staleRevision=liveSnapshot?liveSnapshot.revision:"stale",cachedPot=liveSnapshot&&liveSnapshot.data?liveSnapshot.data.acePot:0;const r=await fetch("/hbnf/live",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({schema:"hbnf-live-v1",revision:staleRevision,active:false,label:"",acePot:cachedPot,entries:[]}),cache:"no-store"});if(r.ok)lastPublishedLiveKey="stale"}catch(_){}}liveRetry=Math.min(60000,Math.max(LIVE_POLL_MS,liveRetry*2))}}finally{liveRequest=null;clearTimeout(liveTimer);liveTimer=document.visibilityState==="visible"?setTimeout(refreshLive,liveRetry):null}})();return liveRequest}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){publishLive(true);clearTimeout(liveTimer);liveTimer=setTimeout(refreshLive,150)}});window.addEventListener("online",()=>{setWanStatus("checking");clearTimeout(liveTimer);liveTimer=setTimeout(refreshLive,150)});window.addEventListener("offline",()=>{setWanStatus("offline");if(liveSnapshot&&Date.now()-liveSnapshot.receivedAt<LIVE_CACHE_TTL_MS)liveDisplay(liveSnapshot.data,"CACHED")});if(restoreLiveSnapshot()){liveDisplay(liveSnapshot.data,"CACHED");publishLive(true)}refreshLive();
// AI: end
const sceneName=n=>["course-flow","field-mix","hbnf-signature","quiet-cosmos"][Number(n)]||"course-flow";
const vibeNames=["chill","groove","heavy","psychedelic","cosmic","auto"];
const vibeIndex=v=>typeof v==="number"?((v>=0&&v<6)?v:0):Math.max(0,vibeNames.indexOf(String(v).toLowerCase()));
function saveLocal(){try{localStorage.setItem("hbnf.foundation.v1",JSON.stringify(state))}catch(_){}}
function setStatus(id,text,kind){const el=$(id);if(el){el.textContent=text;el.className="status-value "+kind}}
function setWanStatus(value){const status=$("#liveStatus"),summary=$("#liveAvailability");if(!status)return;const label=value==="online"?"Connected":value==="offline"?(liveSnapshot&&freshLiveSnapshot()?"Cached":"Unavailable"):"Checking";status.textContent=label; if(summary)summary.textContent="Internet · "+label.toLowerCase()}
function renderLocalStatus(matrixOnline,label){const local=matrixOnline?"Connected":label||"Not connected";const badge=$("#conn");badge.textContent=matrixOnline?"MATRIX LOCAL · CONNECTED":(label||"MATRIX LOCAL · CONNECTING");badge.className="badge "+(matrixOnline?"ok":"bad");setStatus("#localTruth",local,matrixOnline?"ok":"bad");setStatus("#matrixTruth",matrixOnline?"Responding":"No response",matrixOnline?"ok":"bad");setStatus("#auxTruth","Not verified by this page","unknown");$("#statusUpdated").textContent=matrixOnline?(label||"Matrix connection checked"):"Waiting for Matrix"}
function send(obj){if(ws&&ws.readyState===1){try{ws.send(JSON.stringify(obj));return true}catch(_){return false}}return false}
function newOverlayId(){return "local-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1000000000).toString(36)}
function hexRgb(hex){const s=String(hex||"").replace(/^#/ ,"");if(!/^[0-9a-f]{6}$/i.test(s))return[255,255,255];return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]}
function ensureFx(){const seg=fx==null?undefined:[{id:0,fx:fx},{id:1,fx:fx}];const command={HBNF:{scene:state.scene}};if(seg)command.seg=seg;send(command)}
function setSlider(id,out,value){$(id).value=value;$(out).value=value}
function hydrate(s){
 if(!s)return;
 canonicalDeviceState=s;canonicalRevision++;
 const h=s.HBNF||{};
 if(h.effectId!=null)fx=Number(h.effectId);
 if(h.scene!=null&&!pending.scene)state.scene=typeof h.scene==="number"?sceneName(h.scene):h.scene;
 if(h.vibe!=null){if(pending.vibe!=null&&(Number(h.vibe)===pending.vibe||Date.now()-pendingAt.vibe>2000)){delete pending.vibe;delete pendingAt.vibe}if(!pending.vibe)state.vibe=vibeNames[vibeIndex(h.vibe)]};
 if(h.activeVibe!=null)$("#activeVibe").textContent=vibeNames[vibeIndex(h.activeVibe)].toUpperCase()+(state.vibe==="auto"?" · AUTO":"");
 if(h.motion!=null&&!pending.motion)state.motion=Number(h.motion);
 if(h.audioResponse!=null&&!pending.audio)state.audio=Number(h.audioResponse);
 if(h.palette&&h.palette.mode){$("#paletteMode").value=h.palette.mode;if(h.palette.mode==="wled"&&h.palette.index!=null){$("#paletteSelect").value=String(h.palette.index);showPalettePreview(Number(h.palette.index))}if(h.palette.mode==="solid"&&Array.isArray(h.palette.rgb))$("#solidColor").value="#"+h.palette.rgb.map(v=>Number(v).toString(16).padStart(2,"0")).join("")}
 for(const [field,key] of [["matrixBrightness","matrixBrightness"],["auxBrightness","auxBrightness"]]){
   if(h[key]==null)continue;
   const reported=Number(h[key]);
   if(pending[field]!=null){if(reported===pending[field]||Date.now()-pendingAt[field]>2000){delete pending[field];delete pendingAt[field];state[field]=reported}}
   else state[field]=reported;
 }
 setSlider("#motion","#motionOut",state.motion);setSlider("#audio","#audioOut",state.audio);
 setSlider("#matrix","#matrixOut",state.matrixBrightness);setSlider("#aux","#auxOut",state.auxBrightness);
 document.querySelectorAll("[data-scene]").forEach(b=>b.classList.toggle("active",b.dataset.scene===state.scene));
 document.querySelectorAll("[data-vibe]").forEach(b=>b.classList.toggle("active",b.dataset.vibe===state.vibe));$("#activeVibe").textContent=vibeNames[vibeIndex(h.activeVibe==null?h.vibe:h.activeVibe)].toUpperCase()+(state.vibe==="auto"?" · AUTO":"");
 renderLocalStatus(true);
 const seg=Array.isArray(s.seg)?s.seg:[],m=seg.find(x=>Number(x.id)===0),a=seg.find(x=>Number(x.id)===1);
 if(fx!=null&&!fxInitSent&&(!m||Number(m.fx)!==fx||!a||Number(a.fx)!==fx)){fxInitSent=true;ensureFx()}
 saveLocal();notifyCanonicalWaiters();
}
const canonicalCaps={canonicalPaletteIntentV1:true,canonicalOverlayIntentV1:true,localWebSocketV1:true,localVibeSelectionV1:true};
const canonicalScenes={"course-flow":0,"field-mix":1,"hbnf-signature":2,"quiet-cosmos":3};
function canonicalPaletteId(h){const p=h&&h.palette;if(!p)return "";if(p.mode==="legacy")return "hbnf-balanced";if(p.mode==="wled")return "wled-"+Number(p.index);if(p.mode==="solid"&&Array.isArray(p.rgb)&&p.rgb.length===3)return "solid-"+p.rgb.map(v=>Number(v).toString(16).padStart(2,"0")).join("").toUpperCase();return ""}
function canonicalSnapshot(){const s=canonicalDeviceState||{},h=s.HBNF||{},scene=typeof h.scene==="string"?h.scene:sceneName(h.scene||0),vibe=vibeNames[vibeIndex(h.vibe)];return {capabilities:canonicalCaps,desired:{revision:canonicalRevision,state:{sceneId:scene,vibe:vibe,paletteId:canonicalPaletteId(h),tuning:{motion:Number(h.motion==null?50:h.motion),audioResponse:Number(h.audioResponse==null?50:h.audioResponse)},devices:{matrix:{brightness:Number(h.matrixBrightness==null?24:h.matrixBrightness)},aux:{brightness:Number(h.auxBrightness==null?24:h.auxBrightness)}}}},observed:[],localState:s}}
function notifyCanonicalWaiters(){for(let i=canonicalWaiters.length-1;i>=0;i--){const w=canonicalWaiters[i];if(canonicalRevision<=w.after)continue;let ok=false;try{ok=w.test(canonicalDeviceState||{})}catch(_){}if(ok){canonicalWaiters.splice(i,1);clearTimeout(w.timer);w.resolve(canonicalSnapshot())}}}
function waitCanonical(test,after){return new Promise((resolve,reject)=>{const waiter={test:test,after:after,resolve:resolve,reject:reject,timer:null};waiter.timer=setTimeout(()=>{const i=canonicalWaiters.indexOf(waiter);if(i>=0)canonicalWaiters.splice(i,1);reject(new Error("Local Matrix did not confirm the requested state."))},2500);canonicalWaiters.push(waiter);if(ws&&ws.readyState===1)try{ws.send('{"v":true}')}catch(_){}})}
function canonicalPatch(type,p){p=p||{};const h={};if(type==="SCENE"){if(!Object.prototype.hasOwnProperty.call(canonicalScenes,String(p.sceneId||"")))throw new Error("Unsupported local scene.");h.scene=String(p.sceneId)}else if(type==="VIBE"){const v=String(p.vibe||"").toLowerCase(),n=vibeNames.indexOf(v);if(n<0)throw new Error("Unsupported local Vibe.");h.vibe=n}else if(type==="PALETTE"){const id=String(p.paletteId||"");let m=/^wled-(\d{1,3})$/.exec(id);if(m){const index=Number(m[1]);if(index<0||index>255)throw new Error("Invalid palette index.");h.palette={mode:"wled",index:index}}else if((m=/^solid-([0-9A-Fa-f]{6})$/.exec(id))){const hex=m[1];h.palette={mode:"solid",rgb:[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]}}else if(["hbnf-balanced","copper","ocean"].indexOf(id)>=0)h.palette={mode:"legacy",id:id};else throw new Error("Unsupported local palette selection.")}else if(type==="TUNE"){if(p.sceneId!=null){if(!Object.prototype.hasOwnProperty.call(canonicalScenes,String(p.sceneId)))throw new Error("Unsupported local scene.");h.scene=String(p.sceneId)}for(const pair of [["vibe","vibe",0,5],["motion","motion",0,100],["audioResponse","audioResponse",0,100],["matrixBrightness","matrixBrightness",0,255],["auxBrightness","auxBrightness",0,255]])if(p[pair[0]]!=null){const n=Number(p[pair[0]]);if(!Number.isInteger(n)||n<pair[2]||n>pair[3])throw new Error("Invalid local "+pair[0]+".");h[pair[1]]=n}if(!Object.keys(h).length)throw new Error("No supported local tuning values were supplied.")}else if(type==="OVERLAY_START"){const d=p.data||{},id=String(p.overlayId||""),ttl=Number(p.ttlMs),kind=String(p.kind||"");if(!id||id.length>39||!Number.isInteger(ttl)||ttl<250||ttl>30000)throw new Error("Invalid local overlay identity or TTL.");if(kind==="text"){const text=String(d.text||"").trim(),color=String(d.color||"#FFFFFF");if(!text||text.length>63||!/^#[0-9A-Fa-f]{6}$/.test(color))throw new Error("Invalid local text overlay.");h.overlay={id:id,kind:kind,ttlMs:ttl,text:text,color:color.toUpperCase()}}else if(kind==="scoreboard"){const label=String(d.label||"SCORES"),entries=Array.isArray(d.entries)?d.entries.slice(0,12).map(x=>String(x).trim()):[];if(["F9","B9","GLOW","SCORES"].indexOf(label)<0||!entries.length||entries.some(x=>!x||x.length>63))throw new Error("Invalid local scoreboard overlay.");h.overlay={id:id,kind:kind,ttlMs:ttl,label:label,entries:entries}}else throw new Error("Unsupported local overlay kind.")}else if(type==="OVERLAY_CLEAR"||type==="OVERLAY_EXPIRE")h.overlay=null;else throw new Error("Unsupported local canonical command: "+String(type));return {HBNF:h}}
function canonicalCommand(type,payload){if(!ws||ws.readyState!==1)return Promise.reject(new Error("Local Matrix WebSocket is unavailable."));const message=canonicalPatch(type,payload),expected=message.HBNF,before=canonicalRevision;const confirmed=waitCanonical(next=>Object.keys(expected).every(key=>{const h=next.HBNF||{};if(key==="overlay"&&expected.overlay===null)return !h.overlayId;if(key==="overlay"&&expected.overlay)return h.overlayId===expected.overlay.id;if(key==="palette"){const actual=h.palette||{},want=expected.palette||{};return actual.mode===want.mode&&(want.mode==="legacy"||want.mode==="wled"&&Number(actual.index)===Number(want.index)||want.mode==="solid"&&Array.isArray(actual.rgb)&&actual.rgb.every((v,i)=>Number(v)===Number(want.rgb[i])))}return h[key]===expected[key]}),before);if(!send(message))return Promise.reject(new Error("Local Matrix WebSocket is unavailable."));return confirmed.then(out=>({revision:out.desired.revision,accepted:true,state:out}))}
function canonicalOverlay(kind,data,ttlMs){const ttl=Number.isFinite(Number(ttlMs))?Math.max(1000,Math.min(30000,Math.round(Number(ttlMs)) )):(kind==="scoreboard"?22000:8000);return canonicalCommand("OVERLAY_START",{overlayId:newOverlayId(),kind:kind,priority:60,ttlMs:ttl,data:data||{}})}
function canonicalRefresh(){if(!ws||ws.readyState!==1)return Promise.reject(new Error("Local Matrix WebSocket is unavailable."));const before=canonicalRevision;try{ws.send('{"v":true}')}catch(error){return Promise.reject(error)}return waitCanonical(next=>!!next.HBNF,before)}
window.HBNFCanonical={command:canonicalCommand,refresh:canonicalRefresh,getRevision:()=>canonicalRevision,getCapabilities:()=>canonicalCaps,read:(action)=>{if(action==="status")return canonicalRefresh();if(action==="state")return Promise.resolve(canonicalDeviceState);if(action==="live_status")return Promise.resolve({live:liveSnapshot});return Promise.reject(new Error("Unsupported local HBNF read: "+String(action)))},overlay:canonicalOverlay};
function scheduleReconnect(){if(retry!==null||document.visibilityState==="hidden")return;retry=setTimeout(()=>{retry=null;connect()},retryDelay);retryDelay=Math.min(5000,retryDelay*2)}
function dropSocket(){clearTimeout(retry);retry=null;const old=ws;ws=null;if(old&&(old.readyState===0||old.readyState===1))try{old.close()}catch(_){}}
function connect(){
 if(document.visibilityState==="hidden")return;
 if(ws&&(ws.readyState===0||ws.readyState===1)){
  if(ws.readyState===0&&Date.now()-connectStarted>10000)dropSocket();
  else {if(ws.readyState===1)try{ws.send('{"v":true}')}catch(_){};return}
 }
 renderLocalStatus(false,everConnected?"RECONNECTING":"CONNECTING");connectStarted=Date.now();let socket;
 try{socket=new WebSocket("ws://"+location.host+"/ws")}catch(_){scheduleReconnect();return}
 ws=socket;
 socket.onopen=()=>{if(ws!==socket)return;everConnected=true;retryDelay=500;lastPongAt=Date.now();renderLocalStatus(false,"CONNECTED · READING STATE");fxInitSent=false;socket.send('{"v":true}')};
 socket.onclose=()=>{if(ws!==socket)return;ws=null;renderLocalStatus(false,everConnected?"RECONNECTING":"CONNECTING");scheduleReconnect()};
 socket.onerror=()=>{if(ws===socket)try{socket.close()}catch(_){}};
 socket.onmessage=e=>{if(ws!==socket||typeof e.data!=="string")return;if(e.data==="pong"){lastPongAt=Date.now();renderLocalStatus(true,"Matrix link verified");return}try{const j=JSON.parse(e.data);if(j.state){lastPongAt=Date.now();hydrate(j.state);renderLocalStatus(true,"Matrix state received")}}catch(_){}};
}
function resumeConnection(){if(document.visibilityState==="hidden")return;if(ws&&ws.readyState===1){try{ws.send('{"v":true}')}catch(_){dropSocket();connect()}return}connect()}
function suspendConnection(){clearTimeout(retry);retry=null;const old=ws;ws=null;if(old&&(old.readyState===0||old.readyState===1))try{old.close()}catch(_){}}
document.addEventListener("visibilitychange",()=>document.visibilityState==="hidden"?suspendConnection():resumeConnection());
window.addEventListener("pagehide",suspendConnection);window.addEventListener("pageshow",resumeConnection);window.addEventListener("focus",resumeConnection);
window.addEventListener("online",()=>{clearTimeout(liveTimer);liveTimer=setTimeout(refreshLive,150);resumeConnection()});
connect();setInterval(()=>{if(ws&&ws.readyState===1){if(lastPongAt&&Date.now()-lastPongAt>15000){dropSocket();renderLocalStatus(false,"MATRIX STATUS STALE · RECONNECTING");scheduleReconnect();return}try{ws.send("p")}catch(_){dropSocket();scheduleReconnect()}}},5000);
document.querySelectorAll("[data-scene]").forEach(b=>b.onclick=()=>{state.scene=b.dataset.scene;saveLocal();document.querySelectorAll("[data-scene]").forEach(x=>x.classList.toggle("active",x===b));send({HBNF:{scene:state.scene}})});
document.querySelectorAll("[data-vibe]").forEach(b=>b.onclick=()=>{const i=vibeNames.indexOf(b.dataset.vibe);if(i<0)return;state.vibe=b.dataset.vibe;saveLocal();document.querySelectorAll("[data-vibe]").forEach(x=>x.classList.toggle("active",x===b));$("#activeVibe").textContent=state.vibe.toUpperCase();pending.vibe=i;pendingAt.vibe=Date.now();send({HBNF:{vibe:i}})});
function liveRange(id,out,field){const el=$(id),o=$(out);let timer=null;function commit(){const v=Number(el.value);state[field]=v;saveLocal();const update={};update[field]=v;if(send({HBNF:update})){pending[field]=v;pendingAt[field]=Date.now()}else{delete pending[field];delete pendingAt[field]}}
 el.oninput=()=>{const v=Number(el.value);o.value=v;state[field]=v;saveLocal();clearTimeout(timer);timer=setTimeout(commit,90)};
 el.onchange=()=>{clearTimeout(timer);commit()};}
function regularRange(id,out,key,field){const el=$(id),o=$(out);let timer=null;function commit(){state[key]=Number(el.value);saveLocal();const update={};update[field]=state[key];const command={HBNF:update};send(command)}el.oninput=()=>{o.value=el.value;clearTimeout(timer);timer=setTimeout(commit,60)};el.onchange=()=>{clearTimeout(timer);commit()}}
regularRange("#motion","#motionOut","motion","motion");regularRange("#audio","#audioOut","audio","audioResponse");
liveRange("#matrix","#matrixOut","matrixBrightness");liveRange("#aux","#auxOut","auxBrightness");
function paletteSegmentsMatch(state,index){const segs=Array.isArray(state.seg)?state.seg:[],matrix=segs.find(x=>Number(x.id)===0);return !!matrix&&Number(matrix.pal)===Number(index)}
async function applyPaletteSelection(){const mode=$("#paletteMode").value;let id="hbnf-balanced",name="Accepted legacy color";if(mode==="wled"){const index=Number($("#paletteSelect").value);if(!Number.isInteger(index)||index<0||index>=wledPaletteNames.length)throw new Error("Choose a named WLED palette.");id="wled-"+index;name=wledPaletteNames[index]}else if(mode==="solid"){id="solid-"+cleanPaletteHex($("#solidColor").value);name="Solid color"}$("#applyPalette").disabled=true;$("#paletteStatus").textContent="Applying "+name+"…";try{const result=await canonicalCommand("PALETTE",{paletteId:id}),state=result.state.localState;if(mode==="wled"&&!paletteSegmentsMatch(state,Number($("#paletteSelect").value)))throw new Error("Matrix did not report the selected WLED segment palette.");$("#paletteStatus").textContent="Applied: "+name+" · Matrix state confirmed"}catch(error){$("#paletteStatus").textContent="Not confirmed: "+(error.message||String(error));throw error}finally{$("#applyPalette").disabled=false}}
function cleanPaletteHex(value){const hex=String(value||"").replace("#","").toUpperCase();if(!/^[0-9A-F]{6}$/.test(hex))throw new Error("Choose a valid solid color.");return hex}
async function loadNamedPalettes(){const select=$("#paletteSelect");if(palettesLoaded)return;try{const names=await (await fetch("/json/pal",{cache:"no-store"})).json();if(!Array.isArray(names))throw new Error("Palette names unavailable.");wledPaletteNames=names;while(select.options.length)select.remove(0);names.forEach((name,index)=>{if(!name||name==="RSVD"||name==="-")return;const option=document.createElement("option");option.value=String(index);option.textContent=String(name);select.appendChild(option)});select.disabled=false;palettesLoaded=true;if(select.options.length)select.value=String(canonicalDeviceState&&canonicalDeviceState.HBNF&&canonicalDeviceState.HBNF.palette&&canonicalDeviceState.HBNF.palette.mode==="wled"?canonicalDeviceState.HBNF.palette.index:0);showPalettePreview(Number(select.value))}catch(error){select.disabled=true;select.innerHTML="<option value=\"\">Named palettes unavailable</option>";$("#paletteStatus").textContent="Could not load palette names: "+(error.message||String(error))}}
async function showPalettePreview(index){const preview=$("#palettePreview"),name=wledPaletteNames[index];if(!$(".palette-panel").open)return;if(!Number.isInteger(index)||index<0||!name){preview.style.background="";preview.setAttribute("aria-label","Palette preview unavailable");return}preview.setAttribute("aria-label",name+" palette preview");try{const page=Math.floor(index/8),data=await (await fetch("/json/palx?page="+page,{cache:"no-store"})).json(),stops=data&&data.p&&data.p[String(index)];if(!Array.isArray(stops))throw new Error("palette preview unavailable");const colors=stops.map(stop=>{if(!Array.isArray(stop)||stop.length<4||!stop.slice(1,4).every(Number.isFinite))return null;return "rgb("+stop.slice(1,4).map(Number).join(",")+") "+Math.max(0,Math.min(100,Number(stop[0])/255*100))+"%"}).filter(Boolean);if(!colors.length)throw new Error("dynamic palette preview unavailable");preview.style.background="linear-gradient(90deg,"+colors.join(",")+")"}catch(_){preview.style.background="repeating-conic-gradient(#24343a 0% 25%,#132128 0% 50%) 50%/14px 14px"}}
$("#paletteSelect").addEventListener("change",()=>showPalettePreview(Number($("#paletteSelect").value)));
$("#applyPalette").onclick=()=>applyPaletteSelection().catch(()=>{});
$(".palette-panel").addEventListener("toggle",()=>{if($(".palette-panel").open)loadNamedPalettes()});
$("#sendOverlayText").onclick=()=>{const text=$("#overlayText").value;if(!text||text.length>63)return;send({HBNF:{overlay:{id:newOverlayId(),kind:"text",ttlMs:8000,text:text,color:$("#overlayColor").value}}})};
$("#sendScoreboard").onclick=()=>{const entries=$("#scoreEntries").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!entries.length||entries.length>12||entries.some(x=>x.length>63))return;send({HBNF:{overlay:{id:newOverlayId(),kind:"scoreboard",ttlMs:22000,label:$("#scoreLabel").value,entries:entries}}})};
$("#clearOverlay").onclick=()=>send({HBNF:{overlay:null}});
</script>
</body>
</html>
)HBNFHTML";
