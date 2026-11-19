const REFS:Record<string,Uint8Array>={};const RU:Record<string,string>={base:"stencil-ref-384.jpg",light:"stencil-ref-light-384.jpg",bold:"stencil-ref-bold-384.jpg"};async function ref(k:string){if(!REFS[k]){const r=await fetch("https://localrootsdg.com/dyed-and-unattached/ref/"+RU[k]);if(!r.ok)throw new Error("ref");REFS[k]=new Uint8Array(await r.arrayBuffer())}return REFS[k]}
const MODEL="gpt-image-2.6-sunburst";
const PER_IP_DAY=3, GLOBAL_MONTH=120, GLOBAL_HOUR=20, MAX_BYTES=3_000_000;
const PROMPT=`Image 1 is the photo of a pet. Image 2 is an example of the exact target style (a finished vinyl-cutter stencil of a different dog). Make one square stencil portrait of the pet in image 1 in that style: pure black ink on a solid pure white (#FFFFFF) background with nothing behind the subject, no shadows, no vignette, no gray, head and shoulders, background removed, flat two-tone only (no gray, no gradients, no halftone), bold clean shapes with deliberate eyes, nose, mouth and fur-direction strokes, face is the focal point, every white and black detail large enough to cut with a Cricut. Crop tight on the head with only a little neck and no wide chest or bust. Keep the photo's real head angle and the depth it shows (cheek planes, near and far side of the muzzle, overlapping ears); do not flatten it into a symmetrical front view. Eyes natural and realistic in size, not big round cartoon eyes. If an eye is squinted or half closed in the photo, draw it naturally open while keeping its real shape and gaze. No fine hatching or stippling.`;
const DIRS:Record<string,{p:string,r:string}>={light:{r:"light",p:" Match the lighter, more open style of image 2: thinner dark strokes, much more white space, only a few small black accents, no large solid black masses."},bold:{r:"bold",p:" Match the heavier style of image 2: large solid black masses with sharp white highlights and very high contrast, fewer but bigger shapes."},tight:{r:"light",p:" Crop much tighter: fill the whole frame with the face, ears and outer fur cut off by the frame edge, no neck or chest, bold large shapes."}};
const ORIGINS=["https://localrootsdg.com","https://www.localrootsdg.com"];
const cors=(o:string|null)=>({"access-control-allow-origin":o&&(ORIGINS.includes(o)||/^http:\/\/localhost(:\d+)?$/.test(o))?o:ORIGINS[0],"access-control-allow-headers":"content-type,x-vid,x-dir,x-retry,x-peek,apikey,authorization","access-control-allow-methods":"POST,OPTIONS","vary":"origin"});
const J=(b:unknown,s:number,h:Record<string,string>)=>new Response(JSON.stringify(b),{status:s,headers:{...h,"content-type":"application/json"}});
const SB=Deno.env.get("SUPABASE_URL")!,SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbh={apikey:SK,authorization:"Bearer "+SK,"content-type":"application/json"};
async function count(q:string){const r=await fetch(SB+"/rest/v1/du_stencil_gen_log?select=id&"+q,{headers:{...sbh,prefer:"count=exact",range:"0-0"}});const c=r.headers.get("content-range")||"";return parseInt(c.split("/")[1]||"0")||0}
async function sha(s:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].slice(0,12).map(b=>b.toString(16).padStart(2,"0")).join("")}
Deno.serve(async(req)=>{const h=cors(req.headers.get("origin"));
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method!=="POST")return J({error:"method"},405,h);
 const key=Deno.env.get("OPENAI_API_KEY");if(!key)return J({error:"cap"},503,h);
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"").split(",")[0].trim();
 const ih=await sha(ip+"|"+(req.headers.get("x-vid")||""));const ipOnly=await sha(ip);
 const since=new Date(Date.now()-864e5).toISOString();
 if(req.headers.get("x-peek")==="1"){const u=await count("ip_hash=eq."+ipOnly+"&ok=is.true&created_at=gte."+since);return J({left:Math.max(0,PER_IP_DAY-u)},200,h)}
 const retry=req.headers.get("x-retry")==="1",dd=DIRS[req.headers.get("x-dir")||""]||null,dir=dd?dd.p:"",rk=dd?dd.r:"base";
 const body=new Uint8Array(await req.arrayBuffer());
 if(body.length<2000||body.length>MAX_BYTES)return J({error:"size"},413,h);
 if(!(body[0]===0xff&&body[1]===0xd8))return J({error:"type"},415,h);
 const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
 const used=await count("ip_hash=eq."+ipOnly+"&ok=is.true&created_at=gte."+since);
 const ipR=await sha("r|"+ip);
 if(retry){if(await count("ip_hash=eq."+ipR+"&ok=is.true&created_at=gte."+since)>=PER_IP_DAY)return J({error:"limit",left:Math.max(0,PER_IP_DAY-used)},429,h)}
 else if(used>=PER_IP_DAY)return J({error:"limit",left:0},429,h);
 const g=await count("ok=is.true&created_at=gte."+month.toISOString());
 if(g>=GLOBAL_MONTH)return J({error:"cap"},503,h);
 if(await count("ok=is.true&created_at=gte."+new Date(Date.now()-36e5).toISOString())>=GLOBAL_HOUR)return J({error:"cap"},503,h);
 const ins=await fetch(SB+"/rest/v1/du_stencil_gen_log",{method:"POST",headers:{...sbh,prefer:"return=representation"},body:JSON.stringify({ip_hash:retry?ipR:ipOnly,vid_hash:ih,bytes:body.length,ok:true})});
 const row=(await ins.json())[0];
 const fd=new FormData();fd.append("model",MODEL);fd.append("quality","low");fd.append("size","1024x1024");fd.append("prompt",PROMPT+dir);
 fd.append("image[]",new Blob([body],{type:"image/jpeg"}),"photo.jpg");
 try{fd.append("image[]",new Blob([await ref(rk)],{type:"image/jpeg"}),"ref.jpg")}catch(_e){if(row?.id)await fetch(SB+"/rest/v1/du_stencil_gen_log?id=eq."+row.id,{method:"PATCH",headers:sbh,body:JSON.stringify({ok:false})});return J({error:"fail"},502,h)}
 let r:Response;try{r=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{authorization:"Bearer "+key},body:fd,signal:AbortSignal.timeout(140000)})}catch(_e){r=new Response("{}",{status:504})}
 const j=await r.json().catch(()=>({}));const png=j?.data?.[0]?.b64_json;
 if(!r.ok||!png){if(row?.id)await fetch(SB+"/rest/v1/du_stencil_gen_log?id=eq."+row.id,{method:"PATCH",headers:sbh,body:JSON.stringify({ok:false})});return J({error:"fail"},502,h)}
 return J({png,left:Math.max(0,PER_IP_DAY-used-(retry?0:1))},200,h)});
