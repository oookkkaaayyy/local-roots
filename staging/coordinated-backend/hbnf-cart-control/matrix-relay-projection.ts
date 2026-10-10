export const MATRIX_MAC="70:4b:ca:5b:34:5c";
// Runtime readback can prove this embedded release ID. The installed binary SHA is
// independently bound by the control-state reconciliation receipt and is not
// exposed by WLED as a runtime measurement.
export const MATRIX_CANDIDATE="hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010";
const vibes:Record<string,number>={chill:0,groove:1,heavy:2,psychedelic:3,cosmic:4,auto:5};
const scenes:Record<string,number>={"course-flow":0,"field-mix":1,"hbnf-signature":2,"quiet-cosmos":3};
const clamp=(v:any,a:number,b:number,d:number)=>{const n=Number(v);return Math.max(a,Math.min(b,Math.round(Number.isFinite(n)?n:d)));};
function palette(id:any){
 const s=String(id??"");
 const w=s.match(/^wled-(\d{1,3})$/);if(w&&+w[1]<=255)return{mode:"wled",index:+w[1]};
 const c=s.match(/^solid-([0-9a-f]{6})$/i);if(c)return{mode:"solid",rgb:[0,2,4].map(i=>parseInt(c[1].slice(i,i+2),16))};
 if(["hbnf-balanced","copper","ocean"].includes(s))return{mode:"legacy"};
 throw Error("unsupported_palette");
}
async function normalizedOverlay(raw:any,rev:number,fence:number,now:number){
 if(!raw||Number(raw.expiresAt)<=now)return null;
 const kind=String(raw.kind??""),data=raw.payload&&typeof raw.payload==="object"?raw.payload:{};
 const ttlMs=Math.max(250,Math.min(30000,Math.round(Number(raw.expiresAt)-now)));
 let content:any;
 if(kind==="text"){
   const text=String(data.text??"").trim().slice(0,63),color=String(data.color??"#FFFFFF").toUpperCase(),fontIndex=data.fontIndex===undefined?4:data.fontIndex;
   if(!text||!/^#[0-9A-F]{6}$/.test(color)||!Number.isInteger(fontIndex)||![0,2,3,4].includes(fontIndex))throw Error("invalid_text_overlay");
   content={kind,ttlMs,text,color,fontIndex};
 } else if(kind==="scoreboard"){
   const entries=Array.isArray(data.entries)?data.entries.map((x:any)=>String(x).trim().slice(0,48)).filter(Boolean).slice(0,12):[];
   const label=String(data.label??"SCORES").trim().slice(0,15);
   if(!entries.length||!["F9","B9","GLOW","SCORES"].includes(label))throw Error("invalid_scoreboard_overlay");
   content={kind,ttlMs,label,entries};
 } else throw Error("unsupported_overlay_kind");
 const bytes=new TextEncoder().encode(JSON.stringify({rev,fence,content}));
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 const id="hbnf-"+Array.from(digest.slice(0,16),x=>x.toString(16).padStart(2,"0")).join("");
 return {id,...content};
}
export async function buildWledProjection(context:any,revision:number,fenceEpoch:number,now=Date.now()){
 const s=context?.desired?.state,d=s?.devices;if(!s||!d?.matrix||!d?.aux)throw Error("canonical_state_missing");
 const enabled=s.power==="on"&&d.matrix.enabled!==false;
 const bri=enabled?clamp(d.matrix.brightness,0,255,24):0;
 const auxBri=enabled?clamp(d.aux.brightness,0,255,24):0;
 const sceneId=String(s.sceneId??"course-flow");if(!(sceneId in scenes))throw Error("unsupported_scene");
 const vibe=vibes[String(s.selectedVibe??"")];if(vibe===undefined)throw Error("unsupported_vibe");
 const t=s.tuning??{},motion=clamp(t.motion,0,100,60),audioResponse=clamp(t.audioResponse,0,100,75);
 const overlays=Array.isArray(s.overlays)?s.overlays:[];
 const selected=overlays.filter((x:any)=>Number(x?.expiresAt)>now).sort((a:any,b:any)=>Number(b?.priority??0)-Number(a?.priority??0))[0]??null;
 const overlay=enabled?await normalizedOverlay(selected,revision,fenceEpoch,now):null;
 const pal=palette(s.paletteId);
 const wledPayload={on:enabled,bri:255,AudioReactive:{on:true,inputLevel:clamp(t.micSensitivity,64,255,255)},seg:[
  {id:0,on:enabled,bri:255,fx:142},{id:1,start:512,stop:534,on:enabled,bri:255,fx:142}],
  HBNF:{scene:scenes[sceneId],vibe,motion,audioResponse,matrixBrightness:bri,auxBrightness:auxBri,palette:pal,overlay}};
 const expectedState={matrixMac:MATRIX_MAC,candidate:MATRIX_CANDIDATE,on:enabled,bri:255,segments:[
  {id:0,on:enabled,bri:255,fx:142},{id:1,start:512,stop:534,on:enabled,bri:255,fx:142}],
  hbnf:{schema:"foundation-v1",candidate:MATRIX_CANDIDATE,scene:scenes[sceneId],vibe,motion,audioResponse,
  matrixBrightness:bri,auxBrightness:auxBri,palette:pal,overlayId:overlay?.id??null}};
 return {wledPayload,expectedState};
}
const canon=(v:any):string=>Array.isArray(v)?"["+v.map(canon).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canon(v[k])).join(",")+"}":JSON.stringify(v);
export function readbackMatches(a:any,b:any){return canon(a)===canon(b);}
export function normalizeReadback(info:any,state:any){
 const h=state?.HBNF,mac=String(info?.mac??"").toLowerCase().replaceAll(":","");
 if(mac!==MATRIX_MAC.replaceAll(":",""))throw Error("matrix_identity_mismatch");
 if(Number(info?.leds?.count)!==534)throw Error("matrix_led_topology_mismatch");
 if(!h||!Array.isArray(state?.seg))throw Error("readback_shape_invalid");
 const segments=[0,1].map(id=>{const x=state.seg.find((s:any)=>Number(s?.id)===id);if(!x)throw Error("matrix_segment_missing");
 return id===0?{id,on:x.on===true,bri:Number(x.bri),fx:Number(x.fx)}:{id,start:Number(x.start),stop:Number(x.stop),on:x.on===true,bri:Number(x.bri),fx:Number(x.fx)};});
 const p=h.palette;if(!p||!["legacy","wled","solid"].includes(String(p.mode)))throw Error("palette_readback_invalid");
 const palette:any={mode:String(p.mode)};if(p.mode==="wled")palette.index=Number(p.index);if(p.mode==="solid")palette.rgb=Array.isArray(p.rgb)?p.rgb.map(Number):null;
 return {matrixMac:MATRIX_MAC,candidate:String(h.candidate??""),on:state.on===true,bri:Number(state.bri),segments,
 hbnf:{schema:String(h.schema??""),candidate:String(h.candidate??""),scene:Number(h.scene),vibe:Number(h.vibe),motion:Number(h.motion),
 audioResponse:Number(h.audioResponse),matrixBrightness:Number(h.matrixBrightness),auxBrightness:Number(h.auxBrightness),
 palette,overlayId:h.overlayId==null?null:String(h.overlayId)}};
}
export function checkDecision(challenge:any,actual:any,now:number){
 const expires=Date.parse(challenge?.expires_at??"");
 if(!challenge||!Number.isFinite(expires)||expires<=now||challenge.consumed_at)return "stale";
 if(readbackMatches(actual,challenge.expected_state))return "confirm";
 return challenge.apply_authorized_at?"mismatch_after_apply":"apply_once";
}
