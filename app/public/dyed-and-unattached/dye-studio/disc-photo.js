/* Local-only photo color estimate. No file upload and no photo persistence. */
(function(){
"use strict";
function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x))}
function getPixel(data,width,height,x,y){
 const ix=clamp(Math.round(x),0,width-1),iy=clamp(Math.round(y),0,height-1),idx=(iy*width+ix)*4;
 return [data[idx],data[idx+1],data[idx+2]];
}
function distance(a,b){const x=a[0]-b[0],y=a[1]-b[1],z=a[2]-b[2];return Math.sqrt(x*x+y*y+z*z)}
function median(v){v.sort((a,b)=>a-b);const i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2}
function hex(rgb){return "#"+rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase()}
function locateDisc(data,w,h){
 // Include a disc that occupies only ~36-48% of the shortest photo side;
 // otherwise an enlarged off-center partial edge can masquerade as a rim.
 const m=Math.min(w,h),radii=[.18,.21,.24,.27,.30,.33,.36,.39,.42,.45,.48];
 const offsets=[-.12,-.06,0,.06,.12];
 let best={score:-Infinity,x:w/2,y:h/2,r:.39*m,edge:0,valid:0,support:0};
 for(const ox of offsets)for(const oy of offsets)for(const factor of radii){
   const x=w/2+ox*m,y=h/2+oy*m,r=m*factor;
   let sum=0,valid=0,innerSum=0,edgeSupport=0;
   for(let i=0;i<40;i++){
     const a=i*2*Math.PI/40,c=Math.cos(a),s=Math.sin(a);
     const ix=x+c*r*.94,iy=y+s*r*.94,ex=x+c*r*1.06,ey=y+s*r*1.06;
     if(ix<1||iy<1||ex<1||ey<1||ix>=w-1||ex>=w-1||iy>=h-1||ey>=h-1)continue;
     const inner=getPixel(data,w,h,ix,iy),outer=getPixel(data,w,h,ex,ey);
     // A two-tone disc has an additional concentric rim/plate boundary.
   // Reward outer-disc hypotheses that enclose that boundary, rather
   // than mistaking the inner color boundary for the disc's exterior.
   const ringA=getPixel(data,w,h,x+c*r*.79,y+s*r*.79);
   const ringB=getPixel(data,w,h,x+c*r*.88,y+s*r*.88);
   innerSum+=distance(ringA,ringB);
   const stepDistance=distance(inner,outer);
   sum+=stepDistance;
   if(stepDistance>=18)edgeSupport++;
   valid++;
   }
   if(valid<28)continue;
   const edge=sum/valid;
   // Favor long circular boundaries near the image center rather than printed motifs.
   const score=(edge+Math.min(edge,innerSum/valid)*.55)*(valid/40)*(0.78+factor*0.55)-magnitudeOffset(ox,oy)*7;
   if(score>best.score)best={score,x,y,r,edge,valid,support:edgeSupport/valid};
 }
 return best;
}
function magnitudeOffset(x,y){return Math.hypot(x,y)}

function ringMedian(data,w,h,disc,r){
 const px=[];for(let i=0;i<96;i++){
  const a=i*Math.PI*2/96,x=Math.round(disc.x+Math.cos(a)*disc.r*r),y=Math.round(disc.y+Math.sin(a)*disc.r*r);
  if(x<1||y<1||x>=w-1||y>=h-1)continue;
  const o=(y*w+x)*4;if(data[o+3]>=240)px.push([data[o],data[o+1],data[o+2]]);
 }
 return px.length<64?null:[0,1,2].map(k=>median(px.map(q=>q[k])));
}
function estimateRim(data,w,h,disc){
 const rings=[];
 for(let i=0;i<=26;i++){const r=.50+i*.018,col=ringMedian(data,w,h,disc,r);if(col)rings.push({r,col})}
 const center=rings.filter(x=>x.r>=.53&&x.r<=.65).map(x=>x.col),edge=rings.filter(x=>x.r>=.905&&x.r<=.968).map(x=>x.col);
 if(center.length<4||edge.length<3)return null;
 const med=rows=>[0,1,2].map(k=>median(rows.map(v=>v[k])));
 const plate=med(center),rim=med(edge),contrast=distance(plate,rim);
 if(contrast<35)return null;
 const delta=plate.map((v,i)=>rim[i]-v),power=delta.reduce((a,v)=>a+v*v,0);
 if(power<1)return null;
 const dataPoints=rings.map(x=>({r:x.r,t:clamp(x.col.reduce((sum,v,i)=>sum+(v-plate[i])*delta[i],0)/power,0,1)}));
 function cross(level){
  const xs=dataPoints.filter(x=>x.r>=.64);
  for(let i=1;i<xs.length;i++){
   if(xs[i].t<level||xs.slice(i,i+3).filter(x=>x.t>=level).length<2)continue;
   const prev=xs[i-1],den=xs[i].t-prev.t;
   return clamp(prev.r+(Math.abs(den)>1e-5?(level-prev.t)/den:0)*.018,.55,.97);
  }
  return null;
 }
 const half=cross(.5),a=cross(.2),b=cross(.8);
 if(half===null||dataPoints.filter(x=>x.r>.91&&x.t>.65).length<2)return null;
 const softness=clamp(a!==null&&b!==null?Math.abs(b-a)*1.4:.036,.01,.18);
 // Detect *photographed* angle-dependent border shape; never synthesize
 // a brand-specific Halo ring. Reject print/stamp anomalies and sparsely seen edges.
 const offsets=Array.from({length:48},(_,sector)=>{
  const angle=(sector+.5)*Math.PI*2/48,c=Math.cos(angle),sn=Math.sin(angle);
  let previous=-1;
  for(let r=.64;r<.975;r+=.008){
   const x=Math.round(disc.x+c*disc.r*r),y=Math.round(disc.y+sn*disc.r*r);
   if(x<1||y<1||x>=w-1||y>=h-1)break;
   const o=(y*w+x)*4,point=[data[o],data[o+1],data[o+2]];
   const t=clamp(point.reduce((sum,v,i)=>sum+(v-plate[i])*delta[i],0)/power,0,1);
   if(t>.56&&previous>.45&&Math.abs(r-half)<=.085)return +clamp(r-half,-.08,.08).toFixed(3);
   previous=t;
  }
  return null;
 });
 const reliable=offsets.filter(Number.isFinite).length;
 const edgeOffsets=reliable>=31?offsets.map((value,i)=>{
  if(value===null)return 0;
  const prev=offsets[(i+47)%48],next=offsets[(i+1)%48];
  const neighbors=[value,prev,next].filter(Number.isFinite);
  return +(neighbors.reduce((a,v)=>a+v,0)/neighbors.length).toFixed(3);
 }):null;
 return{edgeOffsets,rimHex:hex(rim),plateHex:hex(plate),boundary:+clamp(half,.56,.95).toFixed(3),
  softness:+softness.toFixed(3),kind:softness>.047?"soft":"hard",
  confidence:contrast>=55?"good":"check",contrast:Math.round(contrast)};
}
function estimatePixels(imageData,options={}){
 const {data,width:w,height:h}=imageData||{};
 if(!data||!w||!h||data.length<w*h*4)throw Error("Invalid photo pixels");
 const disc=locateDisc(data,w,h),samples=[];
 // Sample a broad plate area, excluding the center graphic and physical rim.
 const step=Math.max(1,Math.floor(Math.min(w,h)/105));
 for(let y=Math.max(0,Math.floor(disc.y-disc.r*.79));y<Math.min(h,Math.ceil(disc.y+disc.r*.79));y+=step)
 for(let x=Math.max(0,Math.floor(disc.x-disc.r*.79));x<Math.min(w,Math.ceil(disc.x+disc.r*.79));x+=step){
   const radius=Math.hypot(x-disc.x,y-disc.y)/disc.r;
   if(radius<.42||radius>.77)continue;
   const index=(y*w+x)*4;
   if(data[index+3]<240)continue;
   const rgb=[data[index],data[index+1],data[index+2]];
   samples.push(rgb);
 }
 if(samples.length<40)throw Error("The disc was too small to estimate its color");
 // Red/pink stamp ink is a common minority foreground. Exclude it only when
 // enough non-red plate pixels remain, so a genuinely red disc is preserved.
 const redPrint=rgb=>rgb[0]>rgb[1]*1.22&&rgb[0]>rgb[2]*1.12&&rgb[0]-Math.min(rgb[1],rgb[2])>38;
 const nonPrint=samples.filter(rgb=>!redPrint(rgb));
 const clean=nonPrint.length>=samples.length*.58?nonPrint:samples;
 const med=[0,1,2].map(c=>median(clean.map(v=>v[c])));
 const ranked=clean.map(rgb=>({rgb,d:distance(rgb,med)})).sort((a,b)=>a.d-b.d);
 const core=ranked.slice(0,Math.ceil(ranked.length*.64));
 const rgb=[0,1,2].map(ch=>core.reduce((s,x)=>s+x.rgb[ch],0)/core.length);
 const rawMedian=[0,1,2].map(c=>median(samples.map(v=>v[c])));
 const rawRanked=samples.map(rgb=>({rgb,d:distance(rgb,rawMedian)})).sort((a,b)=>a.d-b.d);
 const q=(i)=>rawRanked[clamp(Math.floor(rawRanked.length*i),0,rawRanked.length-1)].d;
 const spread=q(.75),outliers=rawRanked.filter(x=>x.d>48).length/rawRanked.length;
 // A few bright boundaries must not count as a whole circular disc edge.
 // Require coherent contrast across at least 70% of sampled circumference.
 // This is an image-geometry validation gate, not a physical pigment fit.
 const edgeFound=disc.edge>=15&&disc.valid>=28&&disc.support>=.70;
 // Two side-by-side discs (or a pre-dyed multicolor disc) can fool the
 // center-biased circle detector into finding a non-disc 'edge'. This severe
 // annular color mismatch is a conservative fail-closed flag, NOT a general
 // proof that any accepted photograph contains exactly one disc.
 const severeMixedColor=spread>70&&outliers>.50;
 const consistent=spread<34&&outliers<.35;
 const confidence=edgeFound&&consistent?"good":"check";
 const appearance=edgeFound?estimateRim(data,w,h,disc):null;
 const plateHex=hex(rgb);
 // A stable median can still have no recoverable hue when camera white
 // balance or warm illumination has collapsed a pastel toward neutral.
 // This is a visibility check, not color accuracy or a calibrated confidence.
 const channelRange=Math.max(...rgb)-Math.min(...rgb);
 const hueConfidence=channelRange>=18?"visible":"insufficient";
 const colorStatus=!edgeFound||severeMixedColor?"unreliable":(!consistent||hueConfidence==="insufficient"?"uncertain":"estimate");
 return {hex:plateHex,rgb:rgb.map(x=>Math.round(x)),confidence:severeMixedColor?"check":confidence,appearance,severeMixedColor,
   localizationConfidence:edgeFound?(disc.support>=.85&&disc.edge>=30?"good":"check"):"low",plateConfidence:severeMixedColor?"low":confidence,rimConfidence:appearance?"check":"low",hueConfidence,colorStatus,
   edgeDetected:edgeFound,spread:Math.round(spread),outlierFraction:+outliers.toFixed(2),
   pixelCount:samples.length,disc:{x:disc.x/w,y:disc.y/h,r:disc.r/Math.min(w,h)}};
}
function photoFile(file){return !!file&&(String(file.type||"").startsWith("image/")||/\.(heic|heif)$/i.test(file.name||""))}
function loadPhotoImage(file){
 if(!photoFile(file))return Promise.reject(Error("Choose a JPEG, PNG, WebP, or browser-supported HEIC photo."));
 const url=URL.createObjectURL(file);
 return new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>resolve({url,image});
   image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("This browser couldn't decode the photo. Try a JPEG, PNG, or WebP image."))};
   image.src=url;
 });
}
function analysisCanvas(image,maxSide){
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(!ctx)throw Error("Photo processing unavailable in this browser");
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 if(!width||!height)throw Error("Photo was empty");
 const scale=Math.min(1,maxSide/Math.max(width,height));
 canvas.width=Math.max(80,Math.round(width*scale));canvas.height=Math.max(80,Math.round(height*scale));
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return{canvas,ctx,data:ctx.getImageData(0,0,canvas.width,canvas.height),width:canvas.width,height:canvas.height};
}
function releasePhotoSession(session){
 if(!session)return;
 if(session.url)URL.revokeObjectURL(session.url);
 if(session.sampleCanvas){session.sampleCanvas.width=0;session.sampleCanvas.height=0}
 if(session.analysisCanvas){session.analysisCanvas.width=0;session.analysisCanvas.height=0}
 session.image=null;session.imageData=null;
}
async function createPhotoSession(file){
 const loaded=await loadPhotoImage(file);
 let sampled=null,analysis=null;
 try{
   sampled=analysisCanvas(loaded.image,900);analysis=analysisCanvas(loaded.image,460);
   const result=estimatePixels(analysis.data);
   if(!result.edgeDetected)throw Error("Disc edge not found. Retake with the entire disc on a contrasting background.");
   if(result.severeMixedColor)throw Error("Photo contains strongly mixed colors or multiple discs. Choose one undyed disc and retry.");
   return{url:loaded.url,image:loaded.image,sampleCanvas:sampled.canvas,imageData:sampled.data,analysisCanvas:analysis.canvas,result,
     disc:{x:result.disc.x*sampled.width,y:result.disc.y*sampled.height,r:result.disc.r*Math.min(sampled.width,sampled.height)},width:sampled.width,height:sampled.height};
 }catch(error){
   if(sampled?.canvas){sampled.canvas.width=0;sampled.canvas.height=0}
   if(analysis?.canvas){analysis.canvas.width=0;analysis.canvas.height=0}
   URL.revokeObjectURL(loaded.url);throw error
 }
}
async function analyzeImage(file){
 const session=await createPhotoSession(file);
 try{return session.result}finally{releasePhotoSession(session)}
}
function distanceRgb(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function samplePhotoPatch(imageData,x,y,disc,overall,radius=8){
 const {data,width,height}=imageData||{};
 if(!data||!width||!height||!disc)throw Error("Photo sample is unavailable");
 const nx=(x-disc.x)/disc.r,ny=(y-disc.y)/disc.r,radial=Math.hypot(nx,ny);
 if(radial<.20||radial>.80)throw Error("Choose plastic inside the flight plate, away from the edge.");
 const pixels=[];
 for(let py=Math.max(0,Math.floor(y-radius));py<=Math.min(height-1,Math.ceil(y+radius));py++)
 for(let px=Math.max(0,Math.floor(x-radius));px<=Math.min(width-1,Math.ceil(x+radius));px++){
   if((px-x)**2+(py-y)**2>radius*radius)continue;
   const dx=(px-disc.x)/disc.r,dy=(py-disc.y)/disc.r,r=Math.hypot(dx,dy);
   if(r<.18||r>.82)continue;
   const i=(py*width+px)*4;if(data[i+3]<240)continue;
   pixels.push([data[i],data[i+1],data[i+2]]);
 }
 if(pixels.length<12)throw Error("Not enough clear plastic in that spot. Tap a larger unstamped area.");
 const med=channel=>{const v=pixels.map(p=>p[channel]).sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2};
 const rgb=[0,1,2].map(med),base=Array.isArray(overall)?overall:(overall?.rgb||[0,0,0]);
 const redInk=c=>c[0]>c[1]*1.22&&c[0]>c[2]*1.12&&c[0]-Math.min(c[1],c[2])>38;
 if(redInk(rgb)&&!redInk(base)&&distanceRgb(rgb,base)>30)throw Error("That spot looks like printed stamp ink. Tap nearby clean plastic.");
 if(Math.min(...rgb)>247&&Math.max(...base)<225)throw Error("That spot may be glare. Tap a softly lit plastic area.");
 return{rgb,hex:hex(rgb),pixelCount:pixels.length,normalized:{x:x/width,y:y/height}};
}
function rgbToHsl(rgb){let[r,g,b]=rgb.map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0,s=0,l=(mx+mn)/2;if(d){s=d/(1-Math.abs(2*l-1));if(mx===r)h=60*(((g-b)/d)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}if(h<0)h+=360;return[h,s,l]}
function hslHex(h,s,l){h=((h%360)+360)%360;s=clamp(s,0,1);l=clamp(l,0,1);const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return hex([(r+m)*255,(g+m)*255,(b+m)*255])}
function bind(){
 const camera=document.getElementById("discCameraInput"),library=document.getElementById("discPhotoInput"),
       status=document.getElementById("photoColorStatus");
 if(!camera||!library||!status)return;
 const rimPanel=document.getElementById("photoRimPanel"),rimOn=document.getElementById("photoRimEnabled"),
  rimColor=document.getElementById("photoRimColor"),rimWidth=document.getElementById("photoRimWidth"),
  rimSoftness=document.getElementById("photoRimSoftness"),workspace=document.getElementById("photoColorWorkspace"),
  applySuggestion=document.getElementById("applyPhotoSuggestion"),keepSuggestion=document.getElementById("keepPhotoCurrent"),
  photoImage=document.getElementById("photoReferenceImage"),photoStage=document.getElementById("photoReferenceStage"),
  marker=document.getElementById("photoSampleMarker"),loupe=document.getElementById("photoSampleLoupe"),
  sampleReadout=document.getElementById("photoSampleReadout"),sampleHelp=document.getElementById("photoSampleHelp"),
  sampleButton=document.getElementById("photoUseSample"),draftDisc=document.getElementById("photoDraftDisc"),draftHex=document.getElementById("photoDraftHex"),
  draftHexInput=document.getElementById("photoDraftHexInput"),
  hueInput=document.getElementById("photoHue"),satInput=document.getElementById("photoSaturation"),lightInput=document.getElementById("photoLightness");
 const byId=id=>document.getElementById(id),chip=byId("photoColorChip");
 for(const [button,input] of [["takeDiscPhoto",camera],["chooseDiscPhoto",library]]){
   document.getElementById(button).addEventListener("click",()=>input.click());
 }
 let pending=null,session=null,draftHexValue=null,target={x:.5,y:.45},dragging=false,loadToken=0;
 function syncControls(){
  if(!rimPanel)return;
  const a=window.DUDiscAppearance?.get?.()||null;
  rimOn.checked=!!a;
  if(a){rimColor.value=a.rimHex;rimWidth.value=String(Math.round((1-a.boundary)*100));rimSoftness.value=String(Math.round(a.softness*100))}
  rimPanel.classList.toggle("has-rim",!!a);
  syncBlankMockup();
 }
 function syncBlankMockup(){
  if(!draftDisc||!draftHexValue)return;
  const base=draftHexValue;
  if(rimOn?.checked){const boundary=100-(+rimWidth.value||15),edge=rimColor.value||"#333333";draftDisc.style.background=`radial-gradient(circle, ${base} 0 ${Math.max(50,boundary-2)}%, ${edge} ${Math.min(98,boundary+3)}% 100%)`}
  else draftDisc.style.background=base;
  draftHex.textContent=base.toUpperCase();
 }
 function changedRim(){
  if(!rimOn.checked){window.DUDiscAppearance?.set?.(null,true);syncControls();return}
  window.DUDiscAppearance?.set?.({rimHex:rimColor.value,boundary:1-(+rimWidth.value/100),
   softness:(+rimSoftness.value/100)||.01,kind:+rimSoftness.value>5?"soft":"hard"},true);
  syncControls();
 }
 if(rimPanel){
  for(const el of [rimOn,rimColor,rimWidth,rimSoftness])el.addEventListener("change",changedRim);
  syncControls();
 }
 window.DUDiscPhoto.syncControls=syncControls;
 function setTarget(x,y){target={x:clamp(x,0,1),y:clamp(y,0,1)};if(marker){marker.hidden=false;marker.style.left=(target.x*100)+"%";marker.style.top=(target.y*100)+"%"}}
 function updateLoupe(x,y){
  if(!session||!loupe)return;
  const c=loupe.getContext("2d");if(!c)return;
  const size=Math.max(10,Math.round(Math.min(session.width,session.height)*.035)),sx=clamp(Math.round(x-size/2),0,session.width-size),sy=clamp(Math.round(y-size/2),0,session.height-size);
  c.clearRect(0,0,loupe.width,loupe.height);c.imageSmoothingEnabled=false;c.drawImage(session.sampleCanvas,sx,sy,size,size,0,0,loupe.width,loupe.height);
 }
 function setHslControls(hexColor){
  const rgb=[parseInt(hexColor.slice(1,3),16),parseInt(hexColor.slice(3,5),16),parseInt(hexColor.slice(5,7),16)],hsl=rgbToHsl(rgb);
  hueInput.value=String(Math.round(hsl[0]));satInput.value=String(Math.round(hsl[1]*100));lightInput.value=String(Math.round(hsl[2]*100));
  byId("photoHueValue").textContent=hueInput.value+"°";byId("photoSaturationValue").textContent=satInput.value+"%";byId("photoLightnessValue").textContent=lightInput.value+"%";
 }
 function setDraftColor(hexColor,{syncSliders=true,source="adjustment"}={}){
  if(!/^#[0-9a-f]{6}$/i.test(hexColor||""))return;
  draftHexValue=hexColor.toUpperCase();
  if(draftHexInput)draftHexInput.value=draftHexValue;
  if(syncSliders)setHslControls(draftHexValue);
  if(chip){chip.hidden=false;chip.style.backgroundColor=draftHexValue}
  syncBlankMockup();window.DUPhotoColor?.preview?.(draftHexValue);
  if(pending&&source!=="sample")status.textContent=(pending.result.colorStatus==="uncertain"?"Photo hue is uncertain. ":"Photo colors are not calibrated. ")+"Draft "+draftHexValue+" is previewed; current project stays unchanged until Apply.";
 }
 function sampleAt(x,y){
  if(!session||!pending)return;
  const radius=clamp(Math.round(Math.min(session.width,session.height)*.013),6,17);
  try{
   const sample=samplePhotoPatch(session.imageData,x,y,session.disc,pending.result,radius);
   pending.sample=sample;setDraftColor(sample.hex,{source:"sample"});
   sampleReadout.textContent="Sample "+sample.hex+" · "+sample.pixelCount+" nearby pixels";
   sampleHelp.textContent="This is a robust local photo sample, not calibrated physical color. Adjust while comparing both panels; Apply accepts it.";
   status.textContent="Local sample "+sample.hex+" shown as a draft. Your accepted project is unchanged until Apply.";
  }catch(error){sampleHelp.textContent=error.message||"Choose a clean plastic area."}
 }
 function samplePointer(event){
  if(!session||!photoImage)return;
  const rect=photoImage.getBoundingClientRect(),x=clamp((event.clientX-rect.left)/rect.width,0,1),y=clamp((event.clientY-rect.top)/rect.height,0,1);
  setTarget(x,y);updateLoupe(x*session.width,y*session.height);
  if(dragging)sampleAt(x*session.width,y*session.height);
 }
 function sampleTarget(){if(session)sampleAt(target.x*session.width,target.y*session.height)}
 function resetPhotoSession(){
  pending=null;draftHexValue=null;dragging=false;
  if(session){releasePhotoSession(session);session=null}
  if(photoImage)photoImage.removeAttribute("src");if(marker)marker.hidden=true;
  if(workspace)workspace.hidden=true;
  window.DUPhotoColor?.cancel?.();
 }
 function beginDraft(nextSession){
  resetPhotoSession();session=nextSession;pending={result:nextSession.result,sample:null};
  photoImage.src=nextSession.url;workspace.hidden=false;setTarget(.5,.45);updateLoupe(target.x*session.width,target.y*session.height);
  sampleReadout.textContent="Tap unstamped plastic to sample";
  const uncertain=nextSession.result.colorStatus==="uncertain"||nextSession.result.hueConfidence==="insufficient";
  sampleHelp.textContent=uncertain?"The photo's hue is uncertain. Tap a clean area of the flight plate; lighting can shift sampled colors.":"Tap or drag across clean, unstamped plastic to sample a starting color.";
  status.className="photo-status photo-check";
  status.textContent=(uncertain?"Uncertain starting suggestion ":"Photo starting suggestion ")+nextSession.result.hex+". Original photo and draft preview stay visible; nothing is applied until you confirm.";
  setDraftColor(nextSession.result.hex,{source:"suggestion"});
  if(nextSession.result.appearance){rimColor.value=nextSession.result.appearance.rimHex;rimWidth.value=String(Math.round((1-nextSession.result.appearance.boundary)*100));rimSoftness.value=String(Math.round(nextSession.result.appearance.softness*100));syncBlankMockup()}
 }
 if(photoImage){
  photoImage.addEventListener("pointerdown",event=>{if(!session)return;event.preventDefault();dragging=true;try{photoImage.setPointerCapture(event.pointerId)}catch{}samplePointer(event)});
  photoImage.addEventListener("pointermove",samplePointer);
  photoImage.addEventListener("pointerup",event=>{dragging=false;try{photoImage.releasePointerCapture(event.pointerId)}catch{}});
  photoImage.addEventListener("pointercancel",()=>{dragging=false});
  photoImage.addEventListener("keydown",event=>{if(!session)return;const step=event.shiftKey?0.05:0.01;let moved=false;if(event.key==="ArrowLeft"){target.x-=step;moved=true}else if(event.key==="ArrowRight"){target.x+=step;moved=true}else if(event.key==="ArrowUp"){target.y-=step;moved=true}else if(event.key==="ArrowDown"){target.y+=step;moved=true}else if(event.key==="Enter"){sampleTarget();event.preventDefault();return}if(moved){event.preventDefault();setTarget(target.x,target.y);updateLoupe(target.x*session.width,target.y*session.height)}});
 }
 sampleButton?.addEventListener("click",sampleTarget);
 for(const [input,output,suffix] of [[hueInput,"photoHueValue","°"],[satInput,"photoSaturationValue","%"],[lightInput,"photoLightnessValue","%"]])input?.addEventListener("input",()=>{
  byId(output).textContent=input.value+suffix;
  setDraftColor(hslHex(+hueInput.value,+satInput.value/100,+lightInput.value/100),{syncSliders:false});
 });
 draftHexInput?.addEventListener("input",()=>{const value=draftHexInput.value.trim();if(/^#[0-9a-f]{6}$/i.test(value))setDraftColor(value,{source:"hex"})});
 keepSuggestion?.addEventListener("click",()=>{
  resetPhotoSession();if(chip){chip.hidden=false;chip.style.backgroundColor=byId("baseHex").value}status.textContent="Canceled photo color draft. Your accepted color and project edits were kept.";status.className="photo-status";
 });
 applySuggestion?.addEventListener("click",()=>{
  if(!pending||!draftHexValue)return;
  const accepted=draftHexValue;
  if(!window.DUPhotoColor?.apply?.(accepted)){status.textContent="The color could not be applied. Your project was not changed.";return}
  resetPhotoSession();if(chip){chip.hidden=false;chip.style.backgroundColor=accepted}
  status.textContent="Starting color applied: "+accepted+". Photo samples are not calibrated; review the simulated result.";status.className="photo-status photo-check";
 });
 async function apply(event){
   const input=event.currentTarget,file=input.files&&input.files[0];
   if(!file)return;
   const token=++loadToken;
   status.textContent="Reading disc color…";status.className="photo-status";
   try{
     const nextSession=await createPhotoSession(file);
     if(token!==loadToken){releasePhotoSession(nextSession);return}
     beginDraft(nextSession);
   }catch(error){
     if(token!==loadToken)return;
     status.className="photo-status photo-check";
     status.textContent=error&&error.message?error.message:"Couldn't read the photo. Choose a supported image and try again.";
   }finally{input.value="";}
 }
 camera.addEventListener("change",apply);library.addEventListener("change",apply);
 window.addEventListener("pagehide",()=>{loadToken++;resetPhotoSession()},{once:true});
}
window.DUDiscPhoto={estimatePixels,analyzeImage,samplePhotoPatch,bind};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});
else bind();
})();
