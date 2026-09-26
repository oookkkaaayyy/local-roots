// @ts-nocheck
import mqtt from "npm:mqtt@5.10.4";
export const MQTT_HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim();
const MQTT_PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||"1883")||1883);
const MQTT_USER=Deno.env.get("HBNF_MQTT_USER")||"",MQTT_PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
export const MQTT_URL=`mqtt://${MQTT_HOST}:${MQTT_PORT}`;
export const DEVICE_TOPIC=(Deno.env.get("HBNF_MQTT_TOPIC")||"hbnf/cart/wled1").trim();
export const API_TOPIC=`${DEVICE_TOPIC}/api`,STATUS_TOPIC=`${DEVICE_TOPIC}/status`,G_TOPIC=`${DEVICE_TOPIC}/g`,V_TOPIC=`${DEVICE_TOPIC}/v`,FLOW_TOPIC=`${DEVICE_TOPIC}/flow`,WOW_TOPIC=`${DEVICE_TOPIC}/wow`;
export const SOURCE_LIBRARY_REVISION="hbnf-wow-2026-09-13-v2";
export const LIBRARY_REVISION="hbnf-native-organic-2026-09-19-v11";
export const FLOW_LIBRARY_REVISION="hbnf-flow-2026-09-19-v10";
export const AUDIO_INPUT_LEVEL=255;
export const TRANSITION_TENTHS=12,TRANSITION_STYLE=0;
export const LIBRARY_URL="https://hbnightflyers.com/matrix-show-library.json";
export const NIGHT_DEFAULT=24,NIGHT_MAX=72;
export const LOOKS=[10,11,12,13,14,20,21,22,23,24,30,31,32,33,34,40,41,42,43,44];
export const LOOK_META:any={
 10:{name:"PULSE GRID",fx:198,color:[180,0,80],bri:68,sx:170,ix:210},11:{name:"NOVA BEAT",fx:199,color:[0,120,200],bri:68,sx:178,ix:215},12:{name:"LIME PULSE",fx:198,color:[125,205,98],bri:66,sx:160,ix:205},13:{name:"BLUE NOVA",fx:199,color:[60,80,220],bri:68,sx:186,ix:220},14:{name:"MAGENTA PULSE",fx:198,color:[200,0,140],bri:66,sx:176,ix:210},
 20:{name:"JULIA DEEP",fx:168,color:[100,0,200],bri:64,sx:112,ix:165},21:{name:"POLAR FLOW",fx:174,color:[0,130,170],bri:64,sx:122,ix:170},22:{name:"HIPHOTIC",fx:180,color:[80,0,190],bri:66,sx:140,ix:180},23:{name:"BLACK HOLE",fx:183,color:[170,0,110],bri:64,sx:120,ix:165},24:{name:"GALAXY",fx:217,color:[40,90,220],bri:66,sx:118,ix:178},
 30:{name:"VOLCANO",fx:187,color:[220,50,0],bri:50,sx:150,ix:155},31:{name:"FIRE",fx:188,color:[220,30,0],bri:48,sx:145,ix:160},32:{name:"FIREWORKS",fx:189,color:[200,0,50],bri:52,sx:160,ix:170},33:{name:"VORTEX",fx:190,color:[240,80,0],bri:52,sx:135,ix:165},34:{name:"IMPACT",fx:195,color:[210,40,20],bri:50,sx:150,ix:165},
 40:{name:"HBNF DNA",fx:152,color:[125,205,98],bri:66,sx:125,ix:165},41:{name:"HBNF MATRIX",fx:153,color:[0,130,170],bri:64,sx:145,ix:175},42:{name:"HBNF METABALLS",fx:154,color:[180,0,80],bri:66,sx:120,ix:175},43:{name:"HBNF BURSTS",fx:167,color:[125,205,98],bri:64,sx:145,ix:178},44:{name:"HBNF SWIRL",fx:175,color:[0,110,180],bri:66,sx:135,ix:170}
};
export const ORGANIC_PRESET_START=100,ORGANIC_PRESET_COUNT=48;
export const ORGANIC_PRESETS=Array.from({length:ORGANIC_PRESET_COUNT},(_,i)=>ORGANIC_PRESET_START+i);
export const FIELD_ORGANIC_PRESETS=ORGANIC_PRESETS;
export const SHOWCASE_ORGANIC_PRESETS=ORGANIC_PRESETS;
const ORGANIC_PALETTES=[1,6,7,8,9,10,11,12,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58,61,64,67,70];
function organicSpec(id:number){
 const i=id-ORGANIC_PRESET_START;
 return{
  name:`ORGANIC ${String(i+1).padStart(2,"0")}`,
  fx:167,
  pal:ORGANIC_PALETTES[(i*11+Math.floor(i/7))%ORGANIC_PALETTES.length],
  sx:76+((i*37+17)%157),
  ix:76+((i*53+29)%165),
  c3:4+((i*17+9)%61),
  o1:(i%3)!==0,
  o2:((i>>1)&1)===1,
  o3:(i%5===0)||(i%7===0),
  color:COLORS[(i*7+3)%COLORS.length],
  dur:71+((i*47+13)%151)
 };
}
export const SHOWS:any={
 field:{name:"FIELD MIX",playlist:50,looks:FIELD_ORGANIC_PRESETS},
 showcase:{name:"SHOWCASE",playlist:51,looks:SHOWCASE_ORGANIC_PRESETS},
 audio:{name:"AUDIO REACTIVE",playlist:52,looks:[10,11,12,13,14]},
 cosmic:{name:"COSMIC",playlist:53,looks:[20,21,22,24]},
 pyro:{name:"PYRO",playlist:54,looks:[30,31,33]},
 signature:{name:"HBNF SIGNATURE",playlist:55,looks:[40,41,42,43,44]}
};
export const CURATED_PRESETS=new Set([...LOOKS,...ORGANIC_PRESETS,50,51,52,53,54,55,90]);
const COLORS:any=[[180,0,50],[0,90,200],[140,0,200],[220,60,0],[200,0,120],[30,0,160],[0,120,180],[120,0,180],[170,0,100],[0,140,100],[200,30,0],[170,0,60],[210,50,0],[160,0,80],[200,80,0],[0,120,160],[130,0,180],[0,150,100],[190,0,100],[60,80,200]];
const ALLOWED_ORIGINS=new Set(["https://hbnightflyers.com","https://www.hbnightflyers.com","http://localhost:8787","http://127.0.0.1:8787"]);
const mqttOpts=(clientId:string)=>({connectTimeout:6500,reconnectPeriod:0,clean:true,clientId,username:MQTT_USER||undefined,password:MQTT_PASS||undefined});
export function cors(req:Request){const origin=req.headers.get("origin")||"",allow=ALLOWED_ORIGINS.has(origin)?origin:"https://hbnightflyers.com";return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
export function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...cors(req)}});}
export function clamp(n:unknown,lo:number,hi:number,fallback:number){const v=Number(n);return Number.isFinite(v)?Math.max(lo,Math.min(hi,Math.round(v))):fallback;}
export function bool(v:unknown,fallback=false){return typeof v==="boolean"?v:fallback;}
export function cleanText(v:unknown,max=180){return String(v??"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim().slice(0,max);}
export function cleanHex(v:unknown,fallback="#FFFFFF"){const s=String(v??"").trim();return /^#[0-9a-fA-F]{6}$/.test(s)?s.toUpperCase():fallback;}
export function hexRgb(hex:string){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
export function safeEventBrightness(actual:any){const b=Number(actual);if(Number.isFinite(b)&&b>=1&&b<=NIGHT_MAX)return Math.round(b);return 8;}
export function anyBrightness(actual:any){const b=Number(actual);return Number.isFinite(b)?Math.max(1,Math.min(255,Math.round(b))):NIGHT_DEFAULT;}
export function flowReady(t:any){const f=t?.flow;return !!(f&&f.enabled===true&&f.matrixOk===true&&Number(f.pixels)===512&&typeof f.version==="string"&&f.version.length>0);}
export function expectedLibraryRevision(t:any){return flowReady(t)?FLOW_LIBRARY_REVISION:LIBRARY_REVISION;}
export function flowArm(ms=120){return {HBNFFlow:{armMs:Math.max(40,Math.min(500,Math.round(Number(ms)||120)))}};}
export function transformHostSafeLibrary(all:any){
 const out=structuredClone(all);
 out._meta={...(out._meta||{}),revision:LIBRARY_REVISION,build:"9.19.26_native_organic_v11",notes:"HBNF native-organic library: FIELD/SHOWCASE use shuffled same-engine Colored Bursts scene variants with irregular dwell timing; HBNFFlow is not required for normal transitions; overlay segment 3 reserved."};
 for(const id of LOOKS){
  const v=out[String(id)];if(!v)continue;const m=LOOK_META[id],segs=Array.isArray(v.seg)?v.seg:[],s0=segs.find((s:any)=>Number(s.id)===0)??{id:0,start:0,stop:32,startY:0,stopY:16},s1=segs.find((s:any)=>Number(s.id)===1)??{id:1,start:0,stop:32,startY:0,stopY:16};
  v.n=m.name;v.transition=TRANSITION_TENTHS;v.bs=TRANSITION_STYLE;v.mainseg=0;
  v.seg=[{...s0,id:0,on:true,sel:true,bri:m.bri,fx:m.fx,sx:m.sx,ix:m.ix,pal:0,c1:128,c2:128,c3:16,o1:false,o2:false,o3:false,col:[m.color,[0,0,0],[0,0,0]],frz:false},{...s1,id:1,on:true,sel:true,bri:1,fx:0,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false}];
 }
 for(const id of ORGANIC_PRESETS){
  const spec=organicSpec(id),v=structuredClone(out["43"]);
  if(!v)throw new Error("Organic scene base preset 43 missing.");
  const segs=Array.isArray(v.seg)?v.seg:[],s0=segs.find((x:any)=>Number(x.id)===0),s1=segs.find((x:any)=>Number(x.id)===1);
  if(!s0||!s1)throw new Error("Organic scene base segments missing.");
  v.n=spec.name;v.transition=TRANSITION_TENTHS;v.bs=TRANSITION_STYLE;v.mainseg=0;
  v.seg=[
   {...s0,id:0,on:true,sel:true,bri:64,fx:167,sx:spec.sx,ix:spec.ix,pal:spec.pal,c1:128,c2:128,c3:spec.c3,o1:spec.o1,o2:spec.o2,o3:spec.o3,col:[spec.color,[0,0,0],[0,0,0]],frz:false},
   {...s1,id:1,on:true,sel:true,bri:1,fx:0,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false}
  ];
  out[String(id)]=v;
 }
 const p90=out["90"];if(p90){const segs=Array.isArray(p90.seg)?p90.seg:[],s0=segs.find((s:any)=>Number(s.id)===0)??{id:0,start:0,stop:32,startY:0,stopY:16},s1=segs.find((s:any)=>Number(s.id)===1)??{id:1,start:0,stop:32,startY:0,stopY:16};p90.n="NIGHT SAFE";p90.transition=TRANSITION_TENTHS;p90.bs=TRANSITION_STYLE;p90.seg=[{...s0,id:0,on:true,sel:true,bri:60,fx:175,sx:128,ix:160,pal:0,c1:128,c2:128,c3:16,col:[[125,205,98],[0,0,0],[0,0,0]],frz:false},{...s1,id:1,on:true,sel:true,bri:1,fx:0,pal:0,bm:0,col:[[0,0,0],[0,0,0],[0,0,0]],frz:false}];}
 const durations:any={audio:85,cosmic:115,pyro:100,signature:105};
 for(const [family,show] of Object.entries(SHOWS) as any){const v=out[String(show.playlist)]??{},organic=family==="field"||family==="showcase",dur=organic?show.looks.map((id:number)=>{const i=id-ORGANIC_PRESET_START;return family==="field"?91+((i*67+23)%181):61+((i*53+17)%121);}):Array(show.looks.length).fill(durations[family]??100);v.n=show.name;v.o=true;v.playlist={ps:show.looks,dur,transition:Array(show.looks.length).fill(TRANSITION_TENTHS),repeat:0,...(organic?{r:true}:{})};delete v.seg;out[String(show.playlist)]=v;}
 return out;
}
export function transformFlowLibrary(all:any){
 const out=transformHostSafeLibrary(all);
 out._meta={...(out._meta||{}),revision:FLOW_LIBRARY_REVISION,build:"9.19.26_flow_v10",notes:"HBNF Flow + native fade library. WLED performs a 1.2s universal fade while HBNFFlow protects final-frame continuity and startup artifacts; SHOWCASE excludes memory-heavy Particle System effects."};
 for(const id of [...LOOKS,90]){const v=out[String(id)];if(!v)continue;v.transition=TRANSITION_TENTHS;v.bs=TRANSITION_STYLE;}
 for(const s of Object.values(SHOWS) as any){const v=out[String(s.playlist)];if(!v?.playlist)continue;v.playlist.transition=Array(s.looks.length).fill(TRANSITION_TENTHS);}
 return out;
}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function gracefulEnd(c:any){try{await new Promise<void>(resolve=>{let settled=false;const settle=()=>{if(settled)return;settled=true;resolve();};const timer=setTimeout(()=>{try{c.end(true)}catch{}settle();},600);try{c.end(false,{},()=>{clearTimeout(timer);settle();});}catch{clearTimeout(timer);try{c.end(true)}catch{}settle();}});}catch{try{c.end(true)}catch{}}}
function tag(xml:string,name:string){const m=xml.match(new RegExp(`<${name}>(.*?)<\\/${name}>`));return m?m[1]:null;}
function parseTelemetry(seen:Record<string,string>){const xml=seen[V_TOPIC]||"",num=(name:string)=>{const v=tag(xml,name);return v===null?null:Number(v)},cls=[...xml.matchAll(/<cl>(.*?)<\/cl>/g)].map(m=>Number(m[1])),css=[...xml.matchAll(/<cs>(.*?)<\/cs>/g)].map(m=>Number(m[1]));let flow:any=null,wow:any=null;try{flow=seen[FLOW_TOPIC]?JSON.parse(seen[FLOW_TOPIC]):null;}catch{}try{wow=seen[WOW_TOPIC]?JSON.parse(seen[WOW_TOPIC]):null;}catch{}return{status:seen[STATUS_TOPIC]||null,brightness:xml?num("ac"):(seen[G_TOPIC]!==undefined?Number(seen[G_TOPIC]):null),color:cls.length>=3?cls.slice(0,3):null,secondaryColor:css.length>=3?css.slice(0,3):null,effect:num("fx"),speed:num("sx"),intensity:num("ix"),palette:num("fp"),preset:num("ps"),playlistActive:num("cy"),description:tag(xml,"ds"),rawXml:xml||null,flow,wow};}
function expectedMatch(t:any,expected:any){if(!expected)return false;const checks:any[]=[];for(const[k,v]of Object.entries(expected)){if(v===undefined||v===null)continue;if(k==="brightness")checks.push(t.brightness===v);else if(k==="effect")checks.push(t.effect===v);else if(k==="speed")checks.push(t.speed===v);else if(k==="intensity")checks.push(t.intensity===v);else if(k==="palette")checks.push(t.palette===v);else if(k==="preset")checks.push(t.preset===v);else if(k==="playlistActive")checks.push(t.playlistActive===v);else if(k==="presetIn")checks.push(Array.isArray(v)&&v.includes(t.preset));else if(k==="effectIn")checks.push(Array.isArray(v)&&v.includes(t.effect));else if(k==="color")checks.push(Array.isArray(v)&&Array.isArray(t.color)&&v.length>=3&&t.color.length>=3&&Number(t.color[0])===Number(v[0])&&Number(t.color[1])===Number(v[1])&&Number(t.color[2])===Number(v[2]));}return checks.length>0&&checks.every(Boolean);}
export async function mqttRoundTrip(payload?:unknown,expected?:any,waitMs=2300){return await new Promise<any>((resolve)=>{const seen:Record<string,string>={},freshSeen:Record<string,string>={};let publishStarted=false,published=false,done=false,confirm=false,freshAck=false;const client=mqtt.connect(MQTT_URL,mqttOpts(`hbnf-ctl-${crypto.randomUUID().slice(0,10)}`));const finish=async(ok=true,error?:string)=>{if(done)return;done=true;clearTimeout(timer);const telemetry=parseTelemetry(seen),freshTelemetry=parseTelemetry(freshSeen);await gracefulEnd(client);resolve({ok,published,confirmed:confirm,freshAck,telemetry,freshTelemetry,error});};const timer=setTimeout(()=>finish(true),Math.max(700,waitMs));client.on("connect",()=>{client.subscribe([STATUS_TOPIC,G_TOPIC,V_TOPIC,FLOW_TOPIC,WOW_TOPIC],{qos:0},async(e?:Error)=>{if(e){finish(false,e.message);return;}if(payload!==undefined){await pause(180);publishStarted=true;client.publish(API_TOPIC,JSON.stringify(payload),{qos:1,retain:false},(pe?:Error)=>{if(pe){finish(false,pe.message);return;}published=true;});}});});client.on("message",(topic,p,packet:any)=>{const value=p.toString();seen[topic]=value;if(publishStarted&&packet?.retain!==true){freshSeen[topic]=value;freshAck=true;const freshTelemetry=parseTelemetry(freshSeen);if(expectedMatch(freshTelemetry,expected)){confirm=true;setTimeout(()=>finish(true),120);}}});client.on("error",(e:Error)=>finish(false,e.message));});}
export async function mqttRoundTripRetry(payload:unknown,expected:any,waitMs=2600,attempts=3){let last:any=null;for(let i=1;i<=Math.max(1,attempts);i++){last=await mqttRoundTrip(payload,expected,waitMs);last.attempts=i;if(last?.confirmed)return last;if(i<attempts)await pause(300);}return last??{ok:false,published:false,confirmed:false,freshAck:false,attempts:0};}
export async function mqttPublish(payload:unknown,repeats=1,gap=100){return await new Promise<void>((resolve,reject)=>{const c=mqtt.connect(MQTT_URL,mqttOpts(`hbnf-pub-${crypto.randomUUID().slice(0,8)}`)),timer=setTimeout(()=>{try{c.end(true)}catch{};reject(new Error("MQTT publish timeout"));},12000);c.on("connect",async()=>{try{for(let i=0;i<repeats;i++){await new Promise<void>((res,rej)=>c.publish(API_TOPIC,JSON.stringify(payload),{qos:1,retain:false},(e?:Error)=>e?rej(e):res()));if(i+1<repeats)await pause(gap);}await pause(120);clearTimeout(timer);await gracefulEnd(c);resolve();}catch(e){clearTimeout(timer);try{c.end(true)}catch{};reject(e);}});c.on("error",e=>{clearTimeout(timer);try{c.end(true)}catch{};reject(e);});});}
export async function mqttPublishFast(payload:unknown){return await new Promise<void>((resolve,reject)=>{const c=mqtt.connect(MQTT_URL,mqttOpts(`hbnf-fast-${crypto.randomUUID().slice(0,8)}`));let done=false;const finish=(e?:Error)=>{if(done)return;done=true;clearTimeout(timer);try{c.end(true)}catch{};e?reject(e):resolve();};const timer=setTimeout(()=>finish(new Error("MQTT fast publish timeout")),3500);c.on("connect",()=>{c.publish(API_TOPIC,JSON.stringify(payload),{qos:1,retain:false},(e?:Error)=>finish(e));});c.on("error",(e:Error)=>finish(e));});}
export async function mqttPublishSequence(steps:{payload:unknown,delayAfterMs?:number}[],timeout=35000){return await new Promise<void>((resolve,reject)=>{const c=mqtt.connect(MQTT_URL,mqttOpts(`hbnf-seq-${crypto.randomUUID().slice(0,8)}`)),timer=setTimeout(()=>{try{c.end(true)}catch{};reject(new Error("MQTT sequence timeout"));},timeout);c.on("connect",async()=>{try{for(const step of steps){await new Promise<void>((res,rej)=>c.publish(API_TOPIC,JSON.stringify(step.payload),{qos:1,retain:false},(e?:Error)=>e?rej(e):res()));if(step.delayAfterMs)await pause(step.delayAfterMs);}await pause(120);clearTimeout(timer);await gracefulEnd(c);resolve();}catch(e){clearTimeout(timer);try{c.end(true)}catch{};reject(e);}});c.on("error",e=>{clearTimeout(timer);try{c.end(true)}catch{};reject(e);});});}
export function holdMs(text:string){const n=Math.max(1,[...cleanText(text,63)].length);return Math.max(3800,Math.min(7000,3000+n*110));}
function safeTextSeg(text:string,color:number[]=[255,255,255]){const c=Array.isArray(color)&&color.length>=3?color.slice(0,3).map((v:any)=>clamp(v,0,255,255)):[255,255,255];return{id:3,start:0,stop:32,startY:0,stopY:16,on:true,bri:72,fx:122,sx:230,ix:128,c1:0,c2:0,c3:16,o1:false,o2:true,o3:false,bm:16,pal:0,col:[c,[0,0,0],[0,0,0]],sel:false,n:cleanText(text,63)};}
export async function mqttOverlayText(text:string,resumePreset:number|null=null,brightness:number|null=null,color:number[]=[255,255,255]){const hold=holdMs(text),b=brightness==null?NIGHT_DEFAULT:clamp(brightness,1,NIGHT_MAX,NIGHT_DEFAULT);await mqttPublishSequence([{payload:{on:true,bri:b,transition:0,seg:[{id:0,on:true,bri:0,sel:false},{id:1,on:true,bri:0,sel:false},{id:2,on:false,bri:0,sel:false},safeTextSeg(text,color),{id:4,on:false,bri:0,n:"",sel:false},{id:5,on:false,bri:0,n:"",sel:false}]}}],12000);await pause(hold);await mqttPublish({transition:0,seg:[{id:3,on:false,bri:0,n:"",sel:false}]});return hold;}