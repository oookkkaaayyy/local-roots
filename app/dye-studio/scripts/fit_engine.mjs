// Fits the dye catalog (Gaussian absorbance bands, fluorescence) and champion process parameters.
// Output: src/catalog.generated.js  (assigned to DE.CAT / DE.PRM)
import fs from "node:fs";
import {lab} from "./harness.mjs";
const here=p=>new URL(p,import.meta.url);
import {engine,GROUND} from "./harness.mjs";
export const DEF=engine(false);
const {DE,SP}=DEF;
const h={dyes:GROUND.dyes,opaqueTargets:GROUND.opaqueTargets,hbnfChampionPointAnchors:GROUND.anchors,opticalPathAt:(r)=>{let x;if(r<.58)x=.64+r*.20;else if(r<.84)x=.78+(r-.58)*1.25;else x=1.10+(r-.84)*3.10;return x}};
const META=GROUND.META;
const lab2=hex=>DE.hexLab(hex);
// unique dye names used in the catalog; prefer My Inventory swatch
const names={};for(const d of h.dyes){const n=d[1];if(d[3]){names[n]={clear:true,hex:d[2]};continue}if(!names[n]||d[0]==="My Inventory")names[n]={hex:d[2],group:d[0]}}
const alias=n=>n.replace(/^iDye Poly /,"").replace(/^ProChem /,"");
function filmTarget(n,hex){
 const t=h.opaqueTargets[n]||h.opaqueTargets[alias(n)];if(t)return{hex:t,measured:true};
 const l=lab(hex);const L=l[0]>25?l[0]*.9:l[0];
 const a=l[1],b=l[2];const lin=labToLinHex([L,a,b]);return{hex:lin,measured:false};
}
function labToLinHex([L,a,b]){const fy=(L+16)/116,fx=fy+a/500,fz=fy-b/200,f=t=>t**3>216/24389?t**3:(116*t-16)/(24389/27);
 const X=f(fx)*.95047,Y=L>8?fy**3:L/(24389/27),Z=f(fz)*1.08883;
 const r=[3.2406*X-1.5372*Y-.4986*Z,-.9689*X+1.8758*Y+.0415*Z,.0557*X-.2040*Y+1.0570*Z].map(v=>Math.min(1,Math.max(0,v)));
 return SP.linHex(r)}
// ---- Nelder-Mead ----
function nm(f,x0,step,iters=260){
 const n=x0.length;let S=[x0.slice()];for(let i=0;i<n;i++){const x=x0.slice();x[i]+=step[i];S.push(x)}
 let F=S.map(f);
 for(let it=0;it<iters;it++){
  const o=F.map((v,i)=>i).sort((a,b)=>F[a]-F[b]);S=o.map(i=>S[i]);F=o.map(i=>F[i]);
  const c=S[0].map((_,k)=>S.slice(0,n).reduce((a,x)=>a+x[k],0)/n);
  const pt=(t)=>c.map((v,k)=>v+t*(S[n][k]-v));
  const xr=pt(-1),fr=f(xr);
  if(fr<F[0]){const xe=pt(-2),fe=f(xe);if(fe<fr){S[n]=xe;F[n]=fe}else{S[n]=xr;F[n]=fr}}
  else if(fr<F[n-1]){S[n]=xr;F[n]=fr}
  else{const xc=pt(fr<F[n]?-.5:.5),fc=f(xc);if(fc<Math.min(fr,F[n])){S[n]=xc;F[n]=fc}else{for(let i=1;i<=n;i++){S[i]=S[0].map((v,k)=>v+.5*(S[i][k]-v));F[i]=f(S[i])}}}
 }
 let b=0;for(let i=1;i<=n;i++)if(F[i]<F[b])b=i;return{x:S[b],f:F[b]};
}
let ACAP=70,USE_ANCH=false,MUMAX=720,SMAX=95;
const clampP=p=>{const q=p.slice();for(let i=0;i<q.length;i+=3){q[i]=Math.min(MUMAX,Math.max(390,q[i]));q[i+1]=Math.min(SMAX,Math.max(16,q[i+1]));q[i+2]=Math.max(0,Math.min(ACAP,q[i+2]))}return q};
const toBands=p=>{const b=[];for(let i=0;i<p.length;i+=3)if(p[i+2]>1e-3)b.push([p[i],p[i+1],p[i+2]]);return b};
const white="#F4F2E8";
function fitDye(n,info){
 const tg=filmTarget(n,info.hex),tl=lab2(tg.hex),m=META[n]||META[alias(n)]||{};
 SMAX=Math.hypot(tl[1],tl[2])<9&&tl[0]<45?260:+(process.env.DYE_SMAX||95);ACAP=tl[0]<35?40:tl[0]<55?24:14;
 const neutral=Math.hypot(tl[1],tl[2])<9&&tl[0]<45;
 let phi0=Math.min(.7,(m.fluor||0)*.45);
 // emission band from the dye's UV color
 let em=null;
 if(m.fluor>0&&m.uvColor){const ul=lab(m.uvColor);let best=1e9,bm=520;for(let mu=430;mu<=690;mu+=5){const s=DE.lam.map(l=>DE.gau(l,mu,22)*1.3);const e=Math.abs(Math.atan2(DE.labOfSpec(s)[2],DE.labOfSpec(s)[1])-Math.atan2(ul[2],ul[1]));const ee=Math.min(e,2*Math.PI-e);if(ee<best){best=ee;bm=mu}}em=[bm,22]}
 {let hd=1e9;if(em&&m.uvColor){const ul=lab(m.uvColor);const e=Math.abs(Math.atan2(ul[2],ul[1])-Math.atan2(tl[2],tl[1]));hd=Math.min(e,2*Math.PI-e)*57.3}MUMAX=em&&hd<40&&em[0]>=525?em[0]-35:720;if(!(em&&hd<40&&em[0]>=525))phi0=Math.min(.7,(m.fluor||0)*.08);}
 const evalP=(p,phi)=>{const q=clampP(p);DE.CAT[n]={b:toBands(q),phi:phi,em:em||[520,22],aff:1,sd:.15};
  const Rr=DE.opaque?null:null;
  const items=[{name:n,s:1}];const o=DE.render({baseHex:white,family:"star",items},{});let pen=0;if(em&&MUMAX<720){const A=DE.absorb(DE.CAT[n],1),ix=Math.round((em[0]-400)/10);pen=2*Math.max(0,A[Math.min(30,Math.max(0,ix))]-1.0)}
  let e=pen+(USE_ANCH&&h.hbnfChampionPointAnchors.colors[n]?2.2:1)*DE.de2000(tl,DE.labOfSpec(o))+.004*q.reduce((a,v,i)=>a+(i%3===2?v:0),0);if(USE_ANCH&&h.hbnfChampionPointAnchors.colors[n]){let t=0;for(const z of["plate","shoulder","rim"]){const pr=DE.predict({baseHex:h.hbnfChampionPointAnchors.surfaceBase,transHex:h.hbnfChampionPointAnchors.transmissionBase,family:"champion",scene:"outdoor",zone:z,path:ZP(zoneOf[z]),items},{});t+=DE.de2000(lab2(h.hbnfChampionPointAnchors.colors[n][z]),DE.labOf(pr.lin.map(v=>Math.min(1,Math.max(0,v)))))}e+=t/3*1.2}return e};
 let starts;
 if(neutral){starts=[[450,90,4,550,90,4,650,90,4],[480,80,8,560,90,8,640,90,8]]}
 else{starts=[];const hue=Math.atan2(tl[2],tl[1])*180/Math.PI;
  // absorbed band lies roughly opposite the perceived hue
  for(const mu of[430,470,510,550,590,630,670])for(const sg of[28,45,65])starts.push([mu,sg,1.8,mu+80>700?mu-80:mu+80,45,0]);
  for(const m1 of[440,490,540,590])for(const m2 of[560,610,660])if(m2>m1+40)for(const a of[2,6])starts.push([m1,45,a,m2,50,a]);}
 let best=null;
 for(const s0 of starts){
  const f=p=>evalP(p,phi0)+(tg.measured?0:0)+0.0;
  const r=nm(f,s0,s0.map((v,i)=>i%3===2?.8:i%3===1?8:25),neutral?200:160);
  if(!best||r.f<best.f)best=r;
 }
 if(best.f>3&&!neutral){const rr=DE.rng(99);const pool=[];for(let k=0;k<500;k++){const p=[390+rr()*330,20+rr()*70,rr()*ACAP,390+rr()*330,20+rr()*70,rr()*ACAP];pool.push([evalP(p,phi0),p])}pool.sort((a,b)=>a[0]-b[0]);for(const [,p0] of pool.slice(0,6)){const r=nm(p=>evalP(p,phi0),p0,p0.map((v,i)=>i%3===2?1.5:i%3===1?10:30),220);if(r.f<best.f)best=r}}
 // refine best with phi free for fluorescent dyes
 let phi=phi0;
 if(em){const f=p=>evalP(p.slice(0,-1),Math.max(0,Math.min(.85,p[p.length-1])))+Math.abs(p[p.length-1]-phi0)*.4;
  const r=nm(f,best.x.concat([phi0]),best.x.map((v,i)=>i%3===2?.3:i%3===1?5:15).concat([.1]),220);
  best={x:r.x.slice(0,-1),f:r.f};phi=Math.max(0,Math.min(.85,r.x[r.x.length-1]))}
 const q=clampP(best.x);
 // refit residual (strip regulariser)
 const entry={b:toBands(q).map(b=>b.map(v=>+v.toFixed(3))),phi:+phi.toFixed(3),aff:/iDye|Onyx|Black/.test(n)?1.6:1.0,sd:tg.measured?.08:.18};
 if(em)entry.em=em;
 DE.CAT[n]=entry;
 const o=DE.render({baseHex:white,family:"star",items:[{name:n,s:1}]},{});
 return{n,entry,dE:DE.de2000(tl,DE.labOfSpec(o)),target:tg.hex,measured:tg.measured,got:DE.present(o).hex};
}
function fitFilms(){
const results=[];
for(const [n,info] of Object.entries(names)){
 if(info.clear){DE.CAT[n]={b:[],phi:.45,em:[445,28],aff:.2,sd:.2,uvAbs:1};continue}
 const r=fitDye(n,info);results.push(r);
 console.log(r.n.padEnd(34),r.target,r.got,"dE",r.dE.toFixed(2),r.measured?"(measured)":"");
}

return results}
let results=fitFilms();
// ---- Champion process parameters from HBNF photo anchors ----
const A=h.hbnfChampionPointAnchors,base=A.surfaceBase,trans=A.transmissionBase;
const zoneOf={plate:.35,shoulder:.72,rim:.93};
const nameMap={"UV Blast Green":"UV Blast Green","UV Blast Blaze Orange":"UV Blast Blaze Orange"};
const ZP=h.opticalPathAt?zr=>h.opticalPathAt(zr,{translucency:78}):zr=>zr;
const P=DE.PRM.champion;
function champErr(p,verbose){
 if(p.length>4)DE.PRM.tq=Math.abs(p[4]);P.kS=Math.abs(p[0]);P.kT=Math.abs(p[1]);P.pw=Math.abs(p[2]);P.gT=Math.abs(p[3]);
 let s=0,n=0;const rows=[];
 for(const dn of Object.keys(nameMap))for(const z of["plate","shoulder","rim"]){
  const items=[{name:dn,s:1}],pr=DE.predict({baseHex:base,transHex:trans,family:"champion",scene:"outdoor",zone:z,path:Math.pow(ZP(zoneOf[z]),1),items},{});
  const e=DE.de2000(lab2(A.colors[dn][z]),DE.labOf(pr.lin.map(v=>Math.min(1,Math.max(0,v)))));s+=e;n++;if(verbose)rows.push([dn,z,A.colors[dn][z],pr.hex,e.toFixed(1)]);}
 if(verbose)rows.forEach(r=>console.log(r.join(" ")));return s/n;
}
let r0=nm(champErr,[P.kS,P.kT,P.pw,P.gT],[.15,.4,.15,.2],300);
for(let round=0;round<3;round++){USE_ANCH=round>=1;for(const k of Object.keys(DE.CAT))delete DE.CAT[k];results=fitFilms();const q=nm(x=>champErr(x),r0.x.slice(0,4),[.1,.3,.1,.15],250);r0=q}
console.log("champion anchors mean dE2000",r0.f.toFixed(2));champErr(r0.x,true);
const AL={"Green UV Blast":"UV Blast Green","Flo Red UV Blast":"UV Blast Red","Flo Orange / Blaze Orange UV":"UV Blast Blaze Orange","Clear UV Blast":"UV Blast Clear","Blue":"iDye Poly Blue","Crimson":"iDye Poly Crimson","Onyx":"iDye Poly Onyx"};
for(const [a,b] of Object.entries(AL))if(DE.CAT[b])DE.CAT[a]=DE.CAT[b];
for(const k of Object.keys(DE.CAT)){const pk="ProChem "+k;if(DE.CAT[pk]&&!DE.CAT[k])DE.CAT[k]=DE.CAT[pk]}
fs.writeFileSync(here("../src/catalog.generated.js"),"/*CATALOG-BEGIN*/\nObject.assign(DE.CAT,"+JSON.stringify(DE.CAT)+");\nObject.assign(DE.PRM.champion,"+JSON.stringify({kS:P.kS,kT:P.kT,pw:P.pw,gT:P.gT})+");\nDE.PRM.tq="+DE.PRM.tq+";\n/*CATALOG-END*/\n");
const ds=results.map(r=>r.dE);console.log("films mean dE",(ds.reduce((a,b)=>a+b,0)/ds.length).toFixed(2),"max",Math.max(...ds).toFixed(2));
