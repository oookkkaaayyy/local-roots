// Fits UV365 emission centre/width/blue-band weight/yield per fluorescent dye to the vendor-stated UV colour,
// bounded to +-42 nm of the existing hue-class prior. ESTIMATE (replace with measured UV photos). Usage: node fit_uv.mjs
import fs from "node:fs";
import {load} from "./harness.mjs";
const h=load(),DE=h.DE,CAT=DE.CAT,META=h.META,cl=(v,a,b)=>Math.min(b,Math.max(a,v));
function nm(f,x0,step,iters=240){const n=x0.length;let S=[x0.slice()];for(let i=0;i<n;i++){const x=x0.slice();x[i]+=step[i];S.push(x)}let F=S.map(f);
 for(let it=0;it<iters;it++){const o=F.map((v,i)=>i).sort((a,b)=>F[a]-F[b]);S=o.map(i=>S[i]);F=o.map(i=>F[i]);const c=S[0].map((_,k)=>S.slice(0,n).reduce((a,x)=>a+x[k],0)/n);const pt=t=>c.map((v,k)=>v+t*(S[n][k]-v));const xr=pt(-1),fr=f(xr);
 if(fr<F[0]){const xe=pt(-2),fe=f(xe);if(fe<fr){S[n]=xe;F[n]=fe}else{S[n]=xr;F[n]=fr}}else if(fr<F[n-1]){S[n]=xr;F[n]=fr}else{const xc=pt(fr<F[n]?-.5:.5),fc=f(xc);if(fc<Math.min(fr,F[n])){S[n]=xc;F[n]=fc}else{for(let i=1;i<=n;i++){S[i]=S[0].map((v,k)=>v+.5*(S[i][k]-v));F[i]=f(S[i])}}}}
 let b=0;for(let i=1;i<=n;i++)if(F[i]<F[b])b=i;return{x:S[b],f:F[b]}}
const hue=x=>{const[r,g,b]=[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;const H=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return(H*60+360)%360};
const FP=JSON.parse(fs.readFileSync(new URL("../research/dataset/fluor_priors.json",import.meta.url),"utf8")).classes;
const cls=H=>H<15||H>=340?"red":H<45?"orange":H<80?"yellow":H<100?"lime":H<170?"green":H<200?"cyan":H<250?"blue":H<300?"purple":"pink";
const alias=n=>n.replace(/^(iDye Poly |ProChem |UV Blast )/,"");
let n=0,before=0,after=0;
for(const k of Object.keys(CAT)){const e=CAT[k];if(!(e.phi>0)||e.uvAbs)continue;const m=META[k]||META[alias(k)]||META["ProChem "+k];if(!m||!m.uvColor)continue;
 const H=hue(m.uvColor);if(!e.uvem){const pc=FP[cls(H)];e.uvem=pc.em.slice();e.uvphi=pc.uvphi}const two=H>=280||H<20,c0=e.uvem[0],ev=()=>DE.dEhex(DE.uv365({baseHex:"#E7EFC9",family:"star",items:[{name:k,s:1}]}),m.uvColor);before+=ev();
 const err=p=>{e.uvem=[cl(p[0],c0-42,c0+42),cl(p[1],16,46)];e.uvphi=cl(p[3],.15,1.2);if(two)e.uvem2=[450,30,cl(p[2],0,2.2)];return ev()+.02*Math.abs(e.uvem[0]-c0)};
 const r=nm(err,[c0,e.uvem[1],e.uvem2?e.uvem2[2]:.5,e.uvphi||.5],[10,5,.3,.15]);err(r.x);after+=ev();n++}
const src=fs.readFileSync(new URL("../src/catalog.generated.js",import.meta.url),"utf8");
const prm=src.match(/Object\.assign\(DE\.PRM\.champion,[\s\S]*?\/\*CATALOG-END\*\//)[0].replace("/*CATALOG-END*/","").trim();
fs.writeFileSync(new URL("../src/catalog.generated.js",import.meta.url),"/*CATALOG-BEGIN*/\nObject.assign(DE.CAT,"+JSON.stringify(CAT)+");\n"+prm+"\n/*CATALOG-END*/\n");
console.log("fitted",n,"UV mean dE",(before/n).toFixed(2),"->",(after/n).toFixed(2));
