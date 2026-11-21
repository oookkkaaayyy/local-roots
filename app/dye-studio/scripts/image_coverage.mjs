// Per-hue residual of engine vs photo cluster colors (Google Images thumbnails). Usage: node image_coverage.mjs
import fs from "fs";import path from "path";const here=path.dirname(new URL(import.meta.url).pathname);const DE=new Function(fs.readFileSync(path.join(here,"../../public/dyed-and-unattached/dye-studio/engine.js"),"utf8")+";return DE")();
const rows=fs.readFileSync(path.join(here,"../research/image-clusters.txt"),"utf8").split(/[;\n]/).map(r=>r.trim().split(" ").filter(Boolean).map(h=>"#"+h)).filter(r=>r.length>=2);
const lin=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
const lab=h=>{const[r,g,b]=lin(h);let x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.089;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;return[116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))]};
const TH=(B,f)=>f==="champion"?"#"+[1,3,5].map(i=>Math.round(parseInt(B.slice(i,i+2),16)*(1-.66)+255*.66).toString(16).padStart(2,"0")).join(""):B;
const names=Object.keys(DE.CAT).filter((_,i)=>i%2==0);


const bins={};
for(const row of rows){let best=1e9,bb=null;
 for(const B of row)for(const C of row){if(B===C)continue;const LC=lab(C),LB=lab(B);if(LC[0]>LB[0]-4)continue;
  for(const f of ["star","champion"])for(const nm of names)for(const s of [.1,.2,.35,.6,1,1.3]){
   const r=DE.predict({baseHex:B,transHex:TH(B,f),family:f,items:[{name:nm,s,b:0}],zone:"plate",scene:"outdoor",path:.8}).hex,LR=lab(r);
   const d=Math.hypot(LR[0]-LC[0],LR[1]-LC[1],LR[2]-LC[2]);if(d<best){best=d;bb=[LC,LR,LB,d,f]}}}
 if(!bb)continue;const h=Math.round(((Math.atan2(bb[0][2],bb[0][1])*180/Math.PI+360)%360)/45)%8;const k=h;
 (bins[k]=bins[k]||[]).push(bb)}
for(const k of Object.keys(bins).sort()){const a=bins[k],m=f=>a.reduce((s,x)=>s+f(x),0)/a.length;
 console.log("hue",k*45,"n",a.length,"dE",m(x=>x[3]).toFixed(1),"dL(photo-eng)",m(x=>x[0][0]-x[1][0]).toFixed(1),"dC",m(x=>Math.hypot(x[0][1],x[0][2])-Math.hypot(x[1][1],x[1][2])).toFixed(1))}
