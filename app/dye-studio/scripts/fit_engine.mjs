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
 // swatch -> film map learned from the 6 measured dyes (vendor swatch vs owner film photo on white Star):
 // L* x0.92 (0.88-0.93, Onyx and Blue excepted), chroma x0.93 (0.86-0.94 for fluorescent greens/oranges/reds), hue -4 deg (0 to -9 toward yellow)
 // map re-derived 2026-11-23 (leave-one-out mean 2.8 dE2000 vs 3.5 for the previous L*.92/C*.91/hue-4 map): L* x0.90, chroma x1.0 (measured ratios 0.95-1.06), hue -3 deg; neon yellow-greens (hue 88-135, L*>70) shift +6 deg toward green (measured Green +9.6, shrunk 0.6; single sample)
 const l=lab(hex),C=Math.hypot(l[1],l[2]),hd=(Math.atan2(l[2],l[1])*57.3+360)%360,dh=C>20?(l[0]>70&&hd>=88&&hd<=135?6:-3):0,H=Math.atan2(l[2],l[1])+dh*Math.PI/180;
 const L=l[0]>25?l[0]*.90:l[0],Cn=C;
 return{hex:labToLinHex([L,Cn*Math.cos(H),Cn*Math.sin(H)]),measured:false};
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
DE.PRM.star.Sx=+(process.env.SXS||.4);// ESTIMATE: dyed skin over opaque substrate scatters weakly; Onyx film (#080808) is unreachable at Sx>=0.8, all six measured films fit within 0.8 dE at Sx<=0.4
let ACAP=70,USE_ANCH=false,MUMAX=720,SMAX=95,SELFABS=false;
const clampP=p=>{const q=p.slice();for(let i=0;i<q.length;i+=3){q[i]=Math.min(MUMAX,Math.max(390,q[i]));q[i+1]=Math.min(SMAX,Math.max(16,q[i+1]));q[i+2]=Math.max(0,Math.min(ACAP,q[i+2]))}return q};
const toBands=p=>{const b=[];for(let i=0;i<p.length;i+=3)if(p[i+2]>1e-3)b.push([p[i],p[i+1],p[i+2]]);return b};
// ---- UV365 emission priors by hue class (src/fluor_priors.json) + provenance labels ----
const PRI=JSON.parse(fs.readFileSync(here("../research/dataset/fluor_priors.json"),"utf8")).classes;
const PINK_BLUE=+(process.env.PINK_BLUE||.8);
const hueClass=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let H=0;if(d){H=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;H*=60;if(H<0)H+=360}
 if(H>=345||H<8)return"red";if(H<48)return"orange";if(H<78)return"yellow";if(H<110)return"lime";if(H<165)return"green";if(H<200)return"cyan";if(H<255)return"blue";if(H<295)return"purple";return"pink"};
const EMFIX={};
const white="#F4F2E8";
function fitDye(n,info){
 const tg=filmTarget(n,info.hex),tl=lab2(tg.hex),m=META[n]||META[alias(n)]||{};
 SMAX=Math.hypot(tl[1],tl[2])<9&&tl[0]<45?260:95;ACAP=tl[0]<35?40:tl[0]<55?24:14;
 const neutral=Math.hypot(tl[1],tl[2])<9&&tl[0]<45;
 let phi0=Math.min(.7,(m.fluor||0)*.45);
 // emission band from the dye's UV color
 let em=null;
 if(m.fluor>0&&m.uvColor){const c=PRI[hueClass(m.uvColor)];em=EMFIX[n]?EMFIX[n].slice():c.em.slice()}// daylight emission = UV emission (Kasha rule: one emission spectrum per dye); centre from the literature hue-class prior, refined by the UV fit
 {let hd=1e9;if(em&&m.uvColor){const ul=lab(m.uvColor);const e=Math.abs(Math.atan2(ul[2],ul[1])-Math.atan2(tl[2],tl[1]));hd=Math.min(e,2*Math.PI-e)*57.3}SELFABS=!!(em&&hd<40&&em[0]>=515);MUMAX=720;if(!(em&&hd<40&&em[0]>=515))phi0=Math.min(.7,(m.fluor||0)*.08);}
 const evalP=(p,phi)=>{const q=clampP(p);DE.CAT[n]={b:toBands(q),phi:phi,em:em||[520,22],aff:1,sd:.15};
  const Rr=DE.opaque?null:null;
  const items=[{name:n,s:1}];const o=DE.render({baseHex:white,family:"star",items},{});let pen=0;if(em&&SELFABS){const A=DE.absorb(DE.CAT[n],1),ix=Math.round((em[0]-400)/10);pen=.6*Math.max(0,A[Math.min(30,Math.max(0,ix))]-2.0)}
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
const P=DE.PRM.champion;if(process.env.CHQB!==undefined)P.qb=process.env.CHQB==='tie'?'tie':+process.env.CHQB;if(process.env.CHSD!==undefined)P.sd=+process.env.CHSD;if(process.env.STSD!==undefined)DE.PRM.star.sd=+process.env.STSD;
if(process.env.G0!==undefined)P.g0=+process.env.G0;
const cl=(v,a,b)=>Math.min(b,Math.max(a,v));
function champErr(p,verbose){
 P.kS=cl(Math.abs(p[0]),.1,3);P.kT=cl(Math.abs(p[1]),.2,3);P.pw=cl(Math.abs(p[2]),.4,1.2);P.gT=cl(Math.abs(p[3]),1,1.6);P.Sx=cl(Math.abs(p[4]),.03,.6);P.w.outdoor.rim=cl(p[5],.3,1);P.w.outdoor.shoulder=cl(p[6],.3,1);P.rim=cl(p[7],.04,.25);
 let s=0,n=0;const rows=[];
 for(const dn of Object.keys(nameMap))for(const z of["plate","shoulder","rim"]){
  const items=[{name:dn,s:1}],pr=DE.predict({baseHex:base,transHex:trans,family:"champion",scene:"outdoor",zone:z,path:Math.pow(ZP(zoneOf[z]),1),items},{});
  const e=DE.de2000(lab2(A.colors[dn][z]),DE.labOf(pr.lin.map(v=>Math.min(1,Math.max(0,v)))));s+=e;n++;if(verbose)rows.push([dn,z,A.colors[dn][z],pr.hex,e.toFixed(1)]);}
 const ow=ownerErr(verbose);
 if(verbose)rows.forEach(r=>console.log(r.join(" ")));return (s+ow.s*OWN_W)/(n+ow.n*OWN_W);
}
// owner undyed Champion discs on white paper (research/owner-champion-photos-20261121.md): transmission colour = plate, undyed, so zone behaviour of the base plastic is constrained without any dye
const OWNER={orange:["#FF971A","#FC8528","#FF722F"],red:["#E18172","#EA7C6C","#BE4043"],glow:["#FCF9D4","#F0E2C1","#E6D9AF"]};
const OWN_W=+(process.env.OWN_W||1);
function ownerErr(verbose){let s=0,n=0;for(const [k,v] of Object.entries(OWNER))["shoulder","rim"].forEach((z,i)=>{const pr=DE.predict({baseHex:v[0],transHex:v[0],family:"champion",scene:"outdoor",zone:z,path:ZP(zoneOf[z]),items:[]},{});const e=DE.de2000(lab2(v[i+1]),DE.labOf(pr.lin.map(x=>Math.min(1,Math.max(0,x)))));s+=e;n++;if(verbose)console.log("owner undyed",k,z,v[i+1],pr.hex,e.toFixed(1))});return{s,n}}
function champFit(x0,rounds){let best=nm(champErr,x0,[.15,.4,.15,.2,.1,.1,.1,.03],400);const rr=DE.rng(5);
 for(let k=0;k<rounds;k++){const xs=best.x.map((v,i)=>v*(1+(rr()-.5)*(i>=5?.6:.8)));const q=nm(champErr,xs,[.1,.3,.1,.15,.05,.08,.08,.03],400);if(q.f<best.f)best=q}
 return nm(champErr,best.x,[.04,.12,.04,.06,.02,.03,.03,.01],300)}
let r0=champFit([P.kS,P.kT,P.pw,P.gT,.2,.5,.75,.12],8);
for(let round=0;round<3;round++){USE_ANCH=round>=1;for(const k of Object.keys(DE.CAT))delete DE.CAT[k];results=fitFilms();r0=champFit(r0.x,8)}
console.log("champion anchors mean dE2000",r0.f.toFixed(2));champErr(r0.x,true);
const AL={"Green UV Blast":"UV Blast Green","Flo Red UV Blast":"UV Blast Red","Flo Orange / Blaze Orange UV":"UV Blast Blaze Orange","Clear UV Blast":"UV Blast Clear","Blue":"iDye Poly Blue","Crimson":"iDye Poly Crimson","Onyx":"iDye Poly Onyx"};
for(const [a,b] of Object.entries(AL))if(DE.CAT[b])DE.CAT[a]=DE.CAT[b];
for(const k of Object.keys(DE.CAT)){const pk="ProChem "+k;if(DE.CAT[pk]&&!DE.CAT[k])DE.CAT[k]=DE.CAT[pk]}

// ---- UV365 emission fit (function uvPass) ----
function uvPass(){
for(const [k,e] of Object.entries(DE.CAT)){
 const m=META[k]||META[alias(k)]||{};
 const uvc=m.uvColor||(e.uvAbs?"#7DEBFF":null);
 if(e.phi>0&&uvc){const c=PRI[hueClass(uvc)];e.uvem=e.uvAbs?[474,44]:c.em;e.uvphi=c.uvphi;if(hueClass(uvc)==="pink")e.uvem2=[455,30,PINK_BLUE];
  // refine emission centre/width/blue-component/yield against the stated UV colour, bounded to +-42 nm of the literature class prior (non-spectral hues keep a blue second band)
  const cls=hueClass(uvc),two=/pink|purple|red/.test(cls),c0=e.uvem[0];
  const uvErr=p=>{const mu=cl(p[0],c0-42,c0+42),sg=cl(p[1],16,46),w=two?cl(p[2],0,2.2):0,ph=cl(p[3],.15,1.2);e.uvem=[mu,sg];e.uvphi=ph;if(two)e.uvem2=[450,30,w];
   const o=DE.uv365({baseHex:"#E7EFC9",family:"star",items:[{name:k,s:1}]});return DE.dEhex(o,uvc)+.02*Math.abs(mu-c0)};
  const r=nm(uvErr,[c0,e.uvem[1],e.uvem2?e.uvem2[2]:.5,e.uvphi],[10,5,.3,.15],240);uvErr(r.x);
  e.uvprov="estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo"}
 const measured=!!(h.opaqueTargets[k]||h.opaqueTargets[alias(k)]);
 e.prov=measured?"film measured on white Star (owner photo); bands fitted":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star";
 e.est=!measured;
}
}
uvPass();
// second pass: daylight emission tied to the fitted UV emission band, then refit films, Champion process and UV
for(let pass=0;pass<2;pass++){
 for(const [k,e] of Object.entries(DE.CAT))if(e.uvem&&!e.uvAbs&&e.phi>0)EMFIX[k.replace(/^(ProChem |iDye Poly )/,"")===k?k:k]=e.uvem.slice();
 for(const k of Object.keys(DE.CAT))delete DE.CAT[k];
 USE_ANCH=true;results=fitFilms();r0=champFit(r0.x,6);
 for(const [a,b] of Object.entries(AL))if(DE.CAT[b])DE.CAT[a]=DE.CAT[b];
 for(const k of Object.keys(DE.CAT)){const pk="ProChem "+k;if(DE.CAT[pk]&&!DE.CAT[k])DE.CAT[k]=DE.CAT[pk]}
 uvPass();
}
champErr(r0.x,true);
fs.writeFileSync(here("../src/catalog.generated.js"),"/*CATALOG-BEGIN*/\nObject.assign(DE.CAT,"+JSON.stringify(DE.CAT)+");\nObject.assign(DE.PRM.champion,"+JSON.stringify({kS:P.kS,kT:P.kT,pw:P.pw,gT:P.gT,g0:P.g0,Sx:P.Sx,qb:P.qb,sd:P.sd})+");\nDE.PRM.champion.w.outdoor.rim="+P.w.outdoor.rim+";DE.PRM.champion.w.outdoor.shoulder="+P.w.outdoor.shoulder+";DE.PRM.champion.rim="+P.rim+";\nDE.PRM.star.Sx="+DE.PRM.star.Sx+";\nDE.PRM.tq="+DE.PRM.tq+";\n/*CATALOG-END*/\n");
const ds=results.map(r=>r.dE);console.log("films mean dE",(ds.reduce((a,b)=>a+b,0)/ds.length).toFixed(2),"max",Math.max(...ds).toFixed(2));
