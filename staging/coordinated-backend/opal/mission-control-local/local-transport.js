export const MATRIX_IP = "192.168.77.10";
export const AUX_IP = "192.168.77.11";
export const MATRIX_MAC = "704bca5b345c";
export const SUPPORTED_RELEASE = "hbnf-cart2-phase2-r6-skins-readable-20261014";
export const SCENES = ["course-flow", "field-mix", "hbnf-signature", "quiet-cosmos"];
export const VIBES = ["chill", "groove", "heavy", "psychedelic", "cosmic", "auto"];
const intIn = (value, min, max, label) => { const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${label}.`); return n; };
export function buildPatch(type, payload = {}) {
 const h = {};
 if (type === "SCENE") { if (!SCENES.includes(String(payload.sceneId))) throw new Error("Unsupported local scene."); h.scene = String(payload.sceneId); }
 else if (type === "VIBE") { const n = VIBES.indexOf(String(payload.vibe || "").toLowerCase()); if (n < 0) throw new Error("Unsupported local Vibe."); h.vibe = n; }
 else if (type === "TUNE") { for (const [key,min,max] of [["matrixBrightness",0,255],["auxBrightness",0,255],["motion",0,100],["audioResponse",0,100]]) if (payload[key] !== undefined) h[key] = intIn(payload[key],min,max,key); if (!Object.keys(h).length) throw new Error("No supported local tuning values were supplied."); }
 else if (type === "PALETTE") { const id = String(payload.paletteId || ""); let m = /^wled-(\d{1,3})$/.exec(id); if (m) h.palette = {mode:"wled",index:intIn(m[1],0,255,"palette index")}; else if ((m=/^solid-([0-9a-f]{6})$/i.exec(id))) h.palette={mode:"solid",rgb:[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16))}; else if (["hbnf-balanced","copper","ocean"].includes(id)) h.palette={mode:"legacy",id}; else throw new Error("Unsupported local palette selection."); }
 else if (type === "OVERLAY_START") { const id=String(payload.overlayId||""),ttl=intIn(payload.ttlMs,1000,30000,"overlay duration"),d=payload.data||{}; if(!/^[a-zA-Z0-9_-]{1,39}$/.test(id))throw new Error("Invalid local overlay identity."); if(payload.kind!=="text")throw new Error("Only text overlays are available in this local package."); const text=String(d.text||"").trim(),color=String(d.color||"#FFFFFF"); if(!text||text.length>63||!/^#[0-9a-f]{6}$/i.test(color))throw new Error("Invalid local text overlay."); h.overlay={id,kind:"text",ttlMs:ttl,text,color:color.toUpperCase()}; }
 else if (type === "OVERLAY_CLEAR") h.overlay=null;
 else throw new Error(`Unsupported local command: ${String(type)}`);
 return h;
}
function sceneName(value) { if(Number.isInteger(Number(value))&&String(value).trim()!=="")return SCENES[Number(value)]||"";return String(value||""); }
export function stateMatches(state,patch) {
 const h=state&&state.HBNF;if(!h||!patch||typeof patch!=="object")return false;
 return Object.entries(patch).every(([key,want])=>{
  if(key==="scene")return sceneName(h.scene)===String(want);
  if(key==="palette"){const got=h.palette||{};if(got.mode!==want.mode)return false;if(want.mode==="wled"){const seg=Array.isArray(state.seg)?state.seg.find(x=>Number(x.id)===0):null;return Number(got.index)===Number(want.index)&&!!seg&&Number(seg.pal)===Number(want.index)}if(want.mode==="solid")return Array.isArray(got.rgb)&&got.rgb.length===3&&got.rgb.every((v,i)=>Number(v)===Number(want.rgb[i]));return got.mode==="legacy";}
  if(key==="overlay")return want===null?!h.overlayId:h.overlayId===want.id;
  return Number.isFinite(Number(want))?Number(h[key])===Number(want):h[key]===want;
 });
}
export function auxStatus(info,state){if(!info||!state||!info.mac||!Number.isFinite(Number(state.bri)))return{reachable:false,label:"AUX state not verified",ddp:false,physical:"unverified"};const ddp=info.live===true&&info.lm==="DDP"&&info.lip===MATRIX_IP;return{reachable:true,mac:String(info.mac).toLowerCase(),brightness:Number(state.bri),on:state.on===true,ddp,label:ddp?`WLED reachable · brightness ${Number(state.bri)}`:`WLED reachable · brightness ${Number(state.bri)} · DDP source not confirmed`,physical:"unverified"};}
export class LocalMatrixTransport {
 constructor({url=`ws://${MATRIX_IP}/ws`,socketFactory=url=>new WebSocket(url),onState=()=>{},onConnection=()=>{},timeoutMs=2500}={}){this.url=url;this.socketFactory=socketFactory;this.onState=onState;this.onConnection=onConnection;this.timeoutMs=timeoutMs;this.socket=null;this.snapshot=null;this.snapshotVersion=0;this.snapshotAt=0;this.identityVerifiedAt=0;this.waiters=new Set();this.queue=Promise.resolve();}
 connect(){if(this.socket&&(this.socket.readyState===0||this.socket.readyState===1))return;const socket=this.socketFactory(this.url);this.socket=socket;socket.onopen=()=>{if(this.socket!==socket)return;this.onConnection(true);this.requestState();};socket.onmessage=event=>{if(this.socket!==socket||typeof event.data!=="string")return;let msg;try{msg=JSON.parse(event.data)}catch{return}if(!msg||!msg.state||typeof msg.state!=="object")return;this.snapshot=msg.state;this.snapshotVersion++;this.snapshotAt=Date.now();this.onState(this.snapshot);for(const w of [...this.waiters])if(this.snapshotVersion>w.after&&stateMatches(this.snapshot,w.patch)){this.waiters.delete(w);clearTimeout(w.timer);w.resolve(this.snapshot);}};socket.onerror=()=>{try{socket.close()}catch{}};socket.onclose=()=>{if(this.socket!==socket)return;this.socket=null;this.identityVerifiedAt=0;this.onConnection(false);for(const w of [...this.waiters]){this.waiters.delete(w);clearTimeout(w.timer);w.reject(new Error("Matrix WebSocket disconnected before state confirmation."));}};}
 verifyIdentity(info){const mac=String(info?.mac||"").toLowerCase();this.identityVerifiedAt=mac===MATRIX_MAC?Date.now():0;return this.identityVerifiedAt>0;}
 clearIdentity(){this.identityVerifiedAt=0;}
 controlReady(){return !!(this.socket?.readyState===1&&this.snapshot?.HBNF?.candidate===SUPPORTED_RELEASE&&this.snapshotAt&&Date.now()-this.snapshotAt<=15000&&this.identityVerifiedAt&&Date.now()-this.identityVerifiedAt<=30000);}
 requestState(){if(!this.socket||this.socket.readyState!==1)throw new Error("Matrix WebSocket is not connected.");this.socket.send('{"v":true}');}
 command(type,payload={}){const run=()=>this.#commandOnce(type,payload),result=this.queue.then(run,run);this.queue=result.catch(()=>{});return result;}
 #commandOnce(type,payload){if(!this.socket||this.socket.readyState!==1)return Promise.reject(new Error("Matrix WebSocket is not connected."));if(!this.controlReady())return Promise.reject(new Error("Fresh Matrix release, device identity, and state are required; no control was sent."));const patch=buildPatch(type,payload),after=this.snapshotVersion;return new Promise((resolve,reject)=>{const w={patch,after,resolve,reject,timer:null};w.timer=setTimeout(()=>{this.waiters.delete(w);reject(new Error("Matrix did not return matching state readback."));},this.timeoutMs);this.waiters.add(w);try{this.socket.send(JSON.stringify({HBNF:patch}));this.requestState();}catch(error){this.waiters.delete(w);clearTimeout(w.timer);reject(error);}});}
}
