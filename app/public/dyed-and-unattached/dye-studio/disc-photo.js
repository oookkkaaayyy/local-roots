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
   pixelCount:samples.length};
}
async function analyzeImage(file){
 if(!file||!file.type.startsWith("image/"))throw Error("Choose a photo of your disc");
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(!ctx)throw Error("Photo processing unavailable in this browser");
 let img=null,url=null;
 try{
   // Some displayable photos cannot be decoded by createImageBitmap (notably
   // platform-specific phone formats). Retry with the browser's image element
   // before rejecting the original-disc color import.
   if(typeof createImageBitmap==="function"){
     try{img=await createImageBitmap(file)}
     catch{/* The image-element decoder gets a chance below. */}
   }
   if(!img){
     url=URL.createObjectURL(file);
     img=await new Promise((resolve,reject)=>{
       const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(Error("Unable to open photo"));element.src=url;
     });
   }
   const w=img.width||img.naturalWidth,h=img.height||img.naturalHeight;
   if(!w||!h)throw Error("Photo was empty");
   const scale=Math.min(1,460/Math.max(w,h));
   canvas.width=Math.max(80,Math.round(w*scale));canvas.height=Math.max(80,Math.round(h*scale));
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   return estimatePixels(ctx.getImageData(0,0,canvas.width,canvas.height));
 }finally{
   if(img&&typeof img.close==="function")img.close();
   if(url)URL.revokeObjectURL(url);
   canvas.width=0;canvas.height=0;
 }
}
function bind(){
 const camera=document.getElementById("discCameraInput"),library=document.getElementById("discPhotoInput"),
       status=document.getElementById("photoColorStatus");
 if(!camera||!library||!status)return;
 const rimPanel=document.getElementById("photoRimPanel"),rimOn=document.getElementById("photoRimEnabled"),
  rimColor=document.getElementById("photoRimColor"),rimWidth=document.getElementById("photoRimWidth"),
  rimSoftness=document.getElementById("photoRimSoftness"),applySuggestion=document.getElementById("applyPhotoSuggestion"),keepSuggestion=document.getElementById("keepPhotoCurrent"),suggestedColor=document.getElementById("photoSuggestedColor"),suggestedColorLabel=document.getElementById("photoSuggestedColorLabel");
 for(const [button,input] of [["takeDiscPhoto",camera],["chooseDiscPhoto",library]]){
   document.getElementById(button).addEventListener("click",()=>input.click());
 }
 function syncControls(){
  if(!rimPanel)return;
  const a=window.DUDiscAppearance?.get?.()||null;
  rimOn.checked=!!a;
  if(a){rimColor.value=a.rimHex;rimWidth.value=String(Math.round((1-a.boundary)*100));rimSoftness.value=String(Math.round(a.softness*100))}
  rimPanel.classList.toggle("has-rim",!!a);
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
 if(suggestedColor)suggestedColor.addEventListener("input",()=>{
  document.getElementById("photoColorChip").style.backgroundColor=suggestedColor.value;
  if(!pending)return;
  const changed=suggestedColor.value.toUpperCase()!==pending.hex.toUpperCase();
  if(applySuggestion)applySuggestion.textContent=changed?"Apply adjusted color":"Apply suggested color";
  status.textContent=changed?"Adjusted starting color "+suggestedColor.value.toUpperCase()+". The photo hue remains uncertain; your current work is unchanged until you apply this color.":"Uncertain photo color "+pending.hex+". Adjust the swatch to the known blank color before applying. Your current work is unchanged.";
 });
 let pending=null;
 if(keepSuggestion)keepSuggestion.addEventListener("click",()=>{
   pending=null;if(applySuggestion)applySuggestion.hidden=true;keepSuggestion.hidden=true;if(suggestedColorLabel)suggestedColorLabel.hidden=true;
   status.textContent="Kept your current disc appearance and edits.";status.className="photo-status";
 });
 if(applySuggestion)applySuggestion.addEventListener("click",()=>{
   if(!pending)return;
   const result=pending,acceptedHex=suggestedColor?.value||result.hex,color=document.getElementById("baseColor"),field=document.getElementById("baseHex");
   color.value=acceptedHex;field.value=acceptedHex;color.dispatchEvent(new Event("input",{bubbles:true}));
   window.DUDiscAppearance?.set?.(null,false,true);syncControls();
   document.getElementById("autoTransmission").click();
   status.textContent="Starting color applied: "+acceptedHex+". Review it against the blank disc; photo color is not calibrated.";
   status.className="photo-status photo-check";pending=null;applySuggestion.hidden=true;if(keepSuggestion)keepSuggestion.hidden=true;
   document.getElementById("photoColorChip").style.backgroundColor=acceptedHex;
 });
 async function apply(event){
   const input=event.currentTarget,file=input.files&&input.files[0];
   if(!file)return;
   pending=null;if(applySuggestion)applySuggestion.hidden=true;if(keepSuggestion)keepSuggestion.hidden=true;if(suggestedColorLabel)suggestedColorLabel.hidden=true;
   status.textContent="Reading disc color…";status.className="photo-status";
   try{
     const result=await analyzeImage(file);
     if(result.severeMixedColor)throw Error("Photo contains strongly mixed colors or multiple discs. Crop to a single undyed disc and retry; the selected color was not changed.");
     if(!result.edgeDetected)throw Error("Disc edge not found. Retake with the entire disc on a contrasting background.");
     pending=result;if(applySuggestion)applySuggestion.hidden=false;if(keepSuggestion)keepSuggestion.hidden=false;
     if(suggestedColor){suggestedColor.value=result.hex;if(suggestedColorLabel)suggestedColorLabel.hidden=false}
     if(applySuggestion)applySuggestion.textContent="Apply suggested color";
     if(result.appearance){rimColor.value=result.appearance.rimHex;rimWidth.value=String(Math.round((1-result.appearance.boundary)*100));rimSoftness.value=String(Math.round(result.appearance.softness*100))}
     const certainty=result.colorStatus==="uncertain"?"Hue is unclear in this photo; warm or colored light can hide a pale tint. Adjust the swatch to the known blank color before applying.":"Photo colors are uncalibrated; compare the estimate with the blank before applying.";
     const summary=(result.colorStatus==="uncertain"?"Uncertain photo color ":"Photo color estimate ")+result.hex+". "+certainty+" Your current work is unchanged. "+(result.appearance?"A possible rim is only a suggestion; select Different rim color to use it.":"No separate rim was confirmed.");
     status.textContent=summary;
     status.className="photo-status photo-check";
     document.getElementById("photoColorChip").style.backgroundColor=result.hex;
     document.getElementById("photoColorChip").hidden=false;
   }catch(error){
     pending=null;if(applySuggestion)applySuggestion.hidden=true;if(keepSuggestion)keepSuggestion.hidden=true;if(suggestedColorLabel)suggestedColorLabel.hidden=true;
     status.className="photo-status photo-check";
     status.textContent=error&&error.message?error.message:"Couldn't read the photo. Set color manually or try another photo.";
   }finally{input.value="";}
 }
 camera.addEventListener("change",apply);library.addEventListener("change",apply);
}
window.DUDiscPhoto={estimatePixels,analyzeImage,bind};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});
else bind();
})();
