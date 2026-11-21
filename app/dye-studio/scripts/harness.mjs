import fs from "node:fs";
const rd=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8");
const GT=JSON.parse(rd("../src/groundtruth.json"));
export const lab=(hex)=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(u=>u<=.04045?u/12.92:Math.pow((u+.055)/1.055,2.4));
 const X=(.4124*v[0]+.3576*v[1]+.1805*v[2])/.95047,Y=.2126*v[0]+.7152*v[1]+.0722*v[2],Z=(.0193*v[0]+.1192*v[1]+.9505*v[2])/1.08883;
 const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;return[116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))]};
export const dE=(a,b)=>{const x=lab(a),y=lab(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])};
const pathAt=(r,o)=>{const p=Math.max(.35,Math.min(1,(o?.translucency||65)/100));let x;if(r<.58)x=.64+r*.20;else if(r<.84)x=.78+(r-.58)*1.25;else x=1.10+(r-.84)*3.10;return x};
// withCatalog=false builds a bare engine (used by the fitter)
export function engine(withCatalog=true){
 const code=rd("../src/spectral.src.js")+"\n"+rd("../src/engine.src.js")+"\n"+(withCatalog?rd("../src/catalog.generated.js"):"")+"\nreturn {DE,SP};";
 return new Function(code)();
}
export function load(){
 const {DE,SP}=engine(true);
 return {DE,SP,dyes:GT.dyes,META:GT.META,opaqueTargets:GT.opaqueTargets,hbnfChampionPointAnchors:GT.anchors,opticalPathAt:pathAt};
}
export const GROUND=GT;
