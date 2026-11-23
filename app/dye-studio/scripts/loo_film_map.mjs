import {load,lab,GROUND} from "./harness.mjs";
const h=load(),{DE,SP}=h;
const names={};for(const d of GROUND.dyes){if(d[3])continue;if(!names[d[1]]||d[0]==="My Inventory")names[d[1]]=d[2]}
const alias=n=>n.replace(/^iDye Poly /,"").replace(/^ProChem /,"");
const pairs=[];for(const [n,t] of Object.entries(GROUND.opaqueTargets)){const sw=names[n]||names[alias(n)]||names["iDye Poly "+n]||names["ProChem "+n];pairs.push({n,sw,film:t})}
console.log(pairs.map(p=>p.n+" "+p.sw+" "+p.film).join("\n"));
const toHex=([L,a,b])=>{const fy=(L+16)/116,fx=fy+a/500,fz=fy-b/200,f=t=>t**3>216/24389?t**3:(116*t-16)/(24389/27);const X=f(fx)*.95047,Y=L>8?fy**3:L/(24389/27),Z=f(fz)*1.08883;const r=[3.2406*X-1.5372*Y-.4986*Z,-.9689*X+1.8758*Y+.0415*Z,.0557*X-.2040*Y+1.0570*Z].map(v=>Math.min(1,Math.max(0,v)));return SP.linHex(r)};
const mapF=(hex,p)=>{const l=lab(hex),C=Math.hypot(l[1],l[2]),H=Math.atan2(l[2],l[1])-(C>20?p.dh*Math.PI/180:0);const L=l[0]*p.kL,Cn=C*p.kC;return toHex([L,Cn*Math.cos(H),Cn*Math.sin(H)])};
const cur={kL:.92,kC:.93,dh:4};
const err=(ps,p)=>ps.map(x=>DE.dEhex(mapF(x.sw,p),x.film));
console.log("current map train",err(pairs,cur).map(e=>e.toFixed(1)).join(" "));
function fit(ps){let best=[9e9,cur];for(let kL=.8;kL<=1.05;kL+=.01)for(let kC=.7;kC<=1.1;kC+=.02)for(let dh=-4;dh<=10;dh+=1){const p={kL,kC,dh};const e=err(ps,p).reduce((a,b)=>a+b,0)/ps.length;if(e<best[0])best=[e,p]}return best}
const full=fit(pairs);console.log("refit all",JSON.stringify(full[1]),full[0].toFixed(2));
const loo=pairs.map((x,i)=>{const tr=pairs.filter((_,j)=>j!==i),b=fit(tr);return DE.dEhex(mapF(x.sw,b[1]),x.film)});
console.log("LOO",pairs.map((p,i)=>p.n+" "+loo[i].toFixed(1)).join(" | "),"mean",(loo.reduce((a,b)=>a+b,0)/loo.length).toFixed(2));
const idn=pairs.map(x=>DE.dEhex(x.sw,x.film));console.log("no map (swatch as film)",idn.map(e=>e.toFixed(1)).join(" "),(idn.reduce((a,b)=>a+b,0)/idn.length).toFixed(2));
const L9=pairs.map(x=>DE.dEhex(mapF(x.sw,{kL:.9,kC:1,dh:0}),x.film));console.log("old L*.9 only",L9.map(e=>e.toFixed(1)).join(" "),(L9.reduce((a,b)=>a+b,0)/L9.length).toFixed(2));
console.log("--- per dye swatch->film");
for(const x of pairs){const a=lab(x.sw),b=lab(x.film);const Ca=Math.hypot(a[1],a[2]),Cb=Math.hypot(b[1],b[2]);console.log(x.n.padEnd(22),"L",a[0].toFixed(0),"->",b[0].toFixed(0),"ratio",(b[0]/a[0]).toFixed(2),"C",Ca.toFixed(0),"->",Cb.toFixed(0),"ratio",(Cb/Ca).toFixed(2),"dh",(((Math.atan2(b[2],b[1])-Math.atan2(a[2],a[1]))*57.3+540)%360-180).toFixed(1))}
console.log("--- candidates");
const hueOf=hex=>{const l=lab(hex);return (Math.atan2(l[2],l[1])*57.3+360)%360};
const lerpWarp=(pts,h)=>{pts=pts.slice().sort((a,b)=>a[0]-b[0]);const n=pts.length;const ext=[[pts[n-1][0]-360,pts[n-1][1]],...pts,[pts[0][0]+360,pts[0][1]]];for(let i=0;i<ext.length-1;i++){if(h>=ext[i][0]&&h<=ext[i+1][0]){const t=(h-ext[i][0])/(ext[i+1][0]-ext[i][0]);return ext[i][1]+t*(ext[i+1][1]-ext[i][1])}}return 0};
const chromaful=pairs.filter(p=>Math.hypot(lab(p.sw)[1],lab(p.sw)[2])>20);
const mapW=(hex,kL,kC,pts,shrink)=>{const l=lab(hex),C=Math.hypot(l[1],l[2]);const dh=C>20?shrink*lerpWarp(pts,hueOf(hex)):0;const H=Math.atan2(l[2],l[1])+dh*Math.PI/180;return toHex([l[0]>25?l[0]*kL:l[0],C*kC*Math.cos(H),C*kC*Math.sin(H)])};
const ptsOf=ps=>ps.filter(p=>Math.hypot(lab(p.sw)[1],lab(p.sw)[2])>20).map(p=>{const a=lab(p.sw),b=lab(p.film);return[hueOf(p.sw),((Math.atan2(b[2],b[1])-Math.atan2(a[2],a[1]))*57.3+540)%360-180]});
for(const [name,kL,kC,sh] of [["const dh -3, L.9, C1",.9,1,null],["warp L.9 C1 shrink1",.9,1,1],["warp L.9 C1 shrink.6",.9,1,.6],["warp L.9 C.97 shrink.6",.9,.97,.6]]){
 const trn=pairs.map(x=>DE.dEhex(sh==null?mapF(x.sw,{kL,kC,dh:3}):mapW(x.sw,kL,kC,ptsOf(pairs),sh),x.film));
 const lo=pairs.map((x,i)=>DE.dEhex(sh==null?mapF(x.sw,{kL,kC,dh:3}):mapW(x.sw,kL,kC,ptsOf(pairs.filter((_,j)=>j!==i)),sh),x.film));
 console.log(name.padEnd(26),"train",(trn.reduce((a,b)=>a+b,0)/6).toFixed(2),"LOO",lo.map(e=>e.toFixed(1)).join(" "),(lo.reduce((a,b)=>a+b,0)/6).toFixed(2))}
