// @ts-nocheck
import mqtt from "npm:mqtt@5.10.4";

const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const HOST=(Deno.env.get("HBNF_MQTT_HOST")||"broker.emqx.io").trim();
const PORT=Math.max(1,Number(Deno.env.get("HBNF_MQTT_PORT")||1883));
const USER=Deno.env.get("HBNF_MQTT_USER")||"";
const PASS=Deno.env.get("HBNF_MQTT_PASS")||"";
const TOPIC=(Deno.env.get("HBNF_MQTT_TOPIC")||"hbnf/cart/wled1").trim();
const API=`${TOPIC}/api`, STATUS=`${TOPIC}/status`, MASTER=`${TOPIC}/g`;
const EFFECT_ID=142;

const clamp=(n:any,min:number,max:number,d:number)=> {
  const v=Number(n); return Math.max(min,Math.min(max,Math.round(Number.isFinite(v)?v:d)));
};
const opts=(id:string)=>({clientId:id,clean:true,reconnectPeriod:0,connectTimeout:4500,username:USER||undefined,password:PASS||undefined});

function paletteSpec(id:any){
  const value=String(id||"");
  const wled=value.match(/^wled-(\d{1,3})$/);
  if(wled){
    const index=Number(wled[1]);
    if(index>=0&&index<=255)return{mode:"wled",index};
    return null;
  }
  const solid=value.match(/^solid-([0-9A-Fa-f]{6})$/);
  if(solid){
    const h=solid[1].toUpperCase();
    return{mode:"solid",rgb:[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]};
  }
  if(["hbnf-balanced","copper","ocean"].includes(value))return{mode:"legacy",id:value};
  return null;
}
function overlaySpec(raw:any){
  if(!raw||typeof raw!=="object")return null;
  const id=String(raw.id||"").trim();
  const kind=String(raw.kind||"").trim();
  const expiresAt=Number(raw.expiresAt);
  if(!id||!["text","scoreboard"].includes(kind)||!Number.isFinite(expiresAt)||expiresAt<=Date.now())return null;
  const ttlMs=Math.max(250,Math.min(30000,Math.round(expiresAt-Date.now())));
  const data=raw.payload&&typeof raw.payload==="object"?raw.payload:{};
  if(kind==="text"){
    const text=String(data.text||"").trim().slice(0,63);
    const color=String(data.color||"#FFFFFF").toUpperCase();
    if(!text||!/^#[0-9A-F]{6}$/.test(color))return null;
    return{id,kind,ttlMs,text,color};
  }
  const entries=Array.isArray(data.entries)?data.entries.map((x:any)=>String(x).trim().slice(0,48)).filter(Boolean).slice(0,12):[];
  if(!entries.length)return null;
  return{id,kind,ttlMs,label:String(data.label||"SCORES").trim().slice(0,24),entries};
}

function service(req:Request){
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  return !!key && req.headers.get("Authorization")===`Bearer ${key}`;
}

async function publish(payload:any){
  return await new Promise<void>((resolve,reject)=>{
    const c=mqtt.connect(`mqtt://${HOST}:${PORT}`,opts(`hbnf-foundation-${crypto.randomUUID().slice(0,8)}`));
    let done=false;
    const finish=(err?:any)=>{ if(done)return; done=true; clearTimeout(t); try{c.end(true)}catch{}; err?reject(err):resolve(); };
    const t=setTimeout(()=>finish(new Error("mqtt_publish_timeout")),7000);
    c.on("connect",()=>c.publish(API,JSON.stringify(payload),{qos:1,retain:false},e=>finish(e||undefined)));
    c.on("error",e=>finish(e));
  });
}

async function confirmTransport(waitMs=1800){
  return await new Promise<any>(resolve=>{
    const c=mqtt.connect(`mqtt://${HOST}:${PORT}`,opts(`hbnf-foundation-ack-${crypto.randomUUID().slice(0,8)}`));
    let done=false,online=false,master:number|null=null;
    const finish=()=>{if(done)return;done=true;clearTimeout(t);try{c.end(true)}catch{};resolve({online,masterBrightness:master,transportConfirmed:online});};
    const t=setTimeout(finish,waitMs);
    c.on("connect",()=>c.subscribe([STATUS,MASTER],{qos:0}));
    c.on("message",(topic,payload)=>{
      if(topic===STATUS) online=String(payload).toLowerCase()==="online";
      if(topic===MASTER){const n=Number(String(payload));if(Number.isFinite(n))master=n;}
      if(online)setTimeout(finish,80);
    });
    c.on("error",finish);
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"method_not_allowed"},405);
  if(!service(req)) return json({error:"unauthorized"},401);
  const p=await req.json().catch(()=>null);
  if(!p||p.cartId!=="hbnf-cart"||p.deviceId!=="matrix"||!Number.isSafeInteger(p.cartRevision)||!Number.isSafeInteger(p.fenceEpoch)||typeof p.enabled!=="boolean"){
    return json({error:"invalid_projection"},400);
  }

  const t=p.tuning??{};
  const matrixBrightness=clamp(p.brightness,0,255,24);
  const auxBrightness=clamp(p.auxBrightness,0,255,24);
  const motion=clamp(t.motion,0,100,50);
  const audioResponse=clamp(t.audioResponse,0,100,50);
  const mic=clamp(t.micSensitivity,64,255,255);
  const scene=["course-flow","field-mix","hbnf-signature","quiet-cosmos"].includes(String(p.sceneId))?String(p.sceneId):"course-flow";
  const palette=paletteSpec(p.paletteId);
  if(!palette)return json({error:"unsupported_palette",paletteId:p.paletteId},400);
  const overlay=overlaySpec(p.overlay);

  if(!p.enabled){
    await publish({on:false,HBNF:{matrixBrightness:0,auxBrightness:0}});
    return json({
      confirmed:false,transportConfirmed:true,semanticConfirmed:false,
      deviceId:"matrix",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,
      brightness:matrixBrightness,auxBrightness,enabled:false,
      driver:"hbnf-matrix-adapter-foundation",adapterRoute:"foundation-ddp-off",
      requestedMatrixBrightness:matrixBrightness,requestedAuxBrightness:auxBrightness
    });
  }

  // Foundation contract: WLED master/segments stay at unity. HBNF owns both
  // visible brightness scales. Reassert the missing Companion segment on every
  // cloud command so a reboot cannot leave the DDP renderer with no segment.
  const payload:any={
    on:true,
    bri:255,
    AudioReactive:{on:true,inputLevel:mic},
    seg:[
      {id:0,on:true,bri:255,fx:EFFECT_ID},
      {id:1,start:512,stop:534,on:true,bri:255,fx:EFFECT_ID}
    ],
    HBNF:{
      scene,
      motion,
      audioResponse,
      matrixBrightness,
      auxBrightness,
      palette,
      overlay
    }
  };

  await publish(payload);
  const transport=await confirmTransport();

  return json({
    confirmed:false,
    transportConfirmed:transport.transportConfirmed===true,
    semanticConfirmed:false,
    deviceId:"matrix",cartRevision:p.cartRevision,fenceEpoch:p.fenceEpoch,
    brightness:matrixBrightness,auxBrightness,enabled:true,
    sceneId:scene,paletteId:p.paletteId,overlayId:overlay?.id??null,motion,audioResponse,
    driver:"hbnf-matrix-adapter-foundation",
    adapterRoute:"foundation-native-ddp",
    verification:"mqtt-online-plus-wled-master-unity",
    masterBrightness:transport.masterBrightness,
    requestedMatrixBrightness:matrixBrightness,
    requestedAuxBrightness:auxBrightness,
    appliedProjection:p
  }, transport.transportConfirmed===true?200:502);
});
