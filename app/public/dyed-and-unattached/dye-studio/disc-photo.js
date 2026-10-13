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
 const m=Math.min(w,h),radii=[.27,.30,.33,.36,.39,.42,.45,.48];
 const offsets=[-.12,-.06,0,.06,.12];
 let best={score:-Infinity,x:w/2,y:h/2,r:.39*m,edge:0,valid:0};
 for(const ox of offsets)for(const oy of offsets)for(const factor of radii){
   const x=w/2+ox*m,y=h/2+oy*m,r=m*factor;
   let sum=0,valid=0;
   for(let i=0;i<40;i++){
     const a=i*2*Math.PI/40,c=Math.cos(a),s=Math.sin(a);
     const ix=x+c*r*.94,iy=y+s*r*.94,ex=x+c*r*1.06,ey=y+s*r*1.06;
     if(ix<1||iy<1||ex<1||ey<1||ix>=w-1||ex>=w-1||iy>=h-1||ey>=h-1)continue;
     const inner=getPixel(data,w,h,ix,iy),outer=getPixel(data,w,h,ex,ey);
     sum+=distance(inner,outer);valid++;
   }
   if(valid<28)continue;
   const edge=sum/valid;
   // Favor long circular boundaries near the image center rather than printed motifs.
   const score=edge*(valid/40)*(0.78+factor*0.55)-magnitudeOffset(ox,oy)*7;
   if(score>best.score)best={score,x,y,r,edge,valid};
 }
 return best;
}
function magnitudeOffset(x,y){return Math.hypot(x,y)}
function estimatePixels(imageData,options={}){
 const {data,width:w,height:h}=imageData||{};
 if(!data||!w||!h||data.length<w*h*4)throw Error("Invalid photo pixels");
 const disc=locateDisc(data,w,h),samples=[];
 // The mid-flight-plate ring avoids both most center stamps and the outer rim.
 const step=Math.max(1,Math.floor(Math.min(w,h)/105));
 for(let y=Math.max(0,Math.floor(disc.y-disc.r*.79));y<Math.min(h,Math.ceil(disc.y+disc.r*.79));y+=step)
 for(let x=Math.max(0,Math.floor(disc.x-disc.r*.79));x<Math.min(w,Math.ceil(disc.x+disc.r*.79));x+=step){
   const radius=Math.hypot(x-disc.x,y-disc.y)/disc.r;
   if(radius<.42||radius>.77)continue;
   const index=(y*w+x)*4;
   if(data[index+3]<240)continue;
   const rgb=[data[index],data[index+1],data[index+2]];
   // Very dark stamps, glare and saturated existing marks are excluded later.
   samples.push(rgb);
 }
 if(samples.length<40)throw Error("The disc was too small to estimate its color");
 const med=[0,1,2].map(c=>median(samples.map(v=>v[c])));
 const ranked=samples.map(rgb=>({rgb,d:distance(rgb,med)})).sort((a,b)=>a.d-b.d);
 const core=ranked.slice(0,Math.ceil(ranked.length*.64));
 const rgb=[0,1,2].map(ch=>core.reduce((s,x)=>s+x.rgb[ch],0)/core.length);
 const q=(i)=>ranked[clamp(Math.floor(ranked.length*i),0,ranked.length-1)].d;
 const spread=q(.75),outliers=ranked.filter(x=>x.d>48).length/ranked.length;
 const edgeFound=disc.edge>=15&&disc.valid>=28;
 const consistent=spread<34&&outliers<.35;
 const confidence=edgeFound&&consistent?"good":"check";
 return {hex:hex(rgb),rgb:rgb.map(x=>Math.round(x)),confidence,
   edgeDetected:edgeFound,spread:Math.round(spread),outlierFraction:+outliers.toFixed(2),
   pixelCount:samples.length};
}
async function analyzeImage(file){
 if(!file||!file.type.startsWith("image/"))throw Error("Choose a photo of your disc");
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(!ctx)throw Error("Photo processing unavailable in this browser");
 let img=null,url=null;
 try{
   if(typeof createImageBitmap==="function")img=await createImageBitmap(file);
   else{
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
 for(const [button,input] of [["takeDiscPhoto",camera],["chooseDiscPhoto",library]]){
   document.getElementById(button).addEventListener("click",()=>input.click());
 }
 async function apply(event){
   const input=event.currentTarget,file=input.files&&input.files[0];
   if(!file)return;
   status.textContent="Reading disc color…";status.className="photo-status";
   try{
     const result=await analyzeImage(file);
     if(!result.edgeDetected)throw Error("Disc edge not found. Retake with the entire disc on a contrasting background.");
     const color=document.getElementById("baseColor"),field=document.getElementById("baseHex");
     color.value=result.hex;field.value=result.hex;
     // Same existing UI color handlers; automatically refresh model and undo history.
     color.dispatchEvent(new Event("input",{bubbles:true}));
     // Reuse the existing optical-profile transmission estimate and single undo/history commit.
     document.getElementById("autoTransmission").click();
     const summary=result.confidence==="good"?
       "Estimated "+result.hex+" from the disc. Check against the real disc; lighting can shift color.":
       "Estimated "+result.hex+". Photo is uncertain—try even light, with the full disc on a contrasting surface.";
     status.textContent=summary;
     status.className="photo-status "+(result.confidence==="good"?"photo-ok":"photo-check");
     document.getElementById("photoColorChip").style.backgroundColor=result.hex;
     document.getElementById("photoColorChip").hidden=false;
   }catch(error){
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
