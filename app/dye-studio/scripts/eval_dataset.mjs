// Reproducible evaluation of the engine against research/dataset/observations.json.
// Usage: node eval_dataset.mjs [--json]  (prints dE2000 mean/median/p95 and direction pass rate)
import fs from "node:fs";
import {load} from "./harness.mjs";
const h=load(),DE=h.DE;
const OBS=JSON.parse(fs.readFileSync(new URL("../research/dataset/observations.json",import.meta.url),"utf8"));
const THc=(B)=>"#"+[1,3,5].map(i=>Math.round(parseInt(B.slice(i,i+2),16)*.34+255*.66).toString(16).padStart(2,"0")).join("");
const pred=(base,fam,items,zone="plate",path=.5,o={})=>DE.predict({baseHex:base,transHex:o.trans||(process.env.LEGACY_TRANS&&fam==="champion"?THc(base):undefined),family:fam,scene:"outdoor",zone,path,items});
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*(s.length-1)+.5))]};
const stats=a=>({n:a.length,mean:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2),median:+q(a,.5).toFixed(2),p95:+q(a,.95).toFixed(2),max:+Math.max(...a).toFixed(2)});
export function coverage(){
 const lin=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 const rows=fs.readFileSync(new URL("../research/image-clusters.txt",import.meta.url),"utf8").split(/[;\n]/).map(r=>r.trim().split(" ").filter(Boolean).map(x=>"#"+x)).filter(r=>r.length>=2);
 const names=Object.keys(DE.CAT).filter(n=>!/^(ProChem |iDye Poly |UV Blast )/.test(n)||!DE.CAT[n.replace(/^(ProChem |iDye Poly )/,"")]),best=[];
 for(const row of rows){let b=1e9;
  for(const B of row)for(const C of row){if(B===C)continue;const LC=DE.hexLab(C);if(LC[0]>DE.hexLab(B)[0]-4)continue;
   for(const f of["star","champion"])for(const nm of names)for(const s of[.1,.25,.5,.8,1.2]){const e=DE.de2000(LC,DE.hexLab(pred(B,f,[{name:nm,s}],"plate",.8).hex));if(e<b)b=e}}
  if(b<1e9)best.push(b)}
 return stats(best)}
export function evaluate(){
 const R={};
 // films
 R.films=stats(Object.entries(h.opaqueTargets).map(([n,t])=>DE.dEhex(pred("#F4F2E8","star",[{name:n,s:1}]).hex,t)));
 // champion anchors
 {const A=h.hbnfChampionPointAnchors,Z={plate:.35,shoulder:.72,rim:.93},e=[];
  for(const n of Object.keys(A.colors))for(const z of["plate","shoulder","rim"])e.push(DE.dEhex(pred(A.surfaceBase,"champion",[{name:n,s:1}],z,h.opticalPathAt(Z[z]),{trans:A.transmissionBase}).hex,A.colors[n][z]));
  R.anchors=stats(e)}
 R.photoSamples=stats(OBS.photoSamples.map(p=>DE.dEhex(pred(p.base,p.family,[{name:p.dye,s:p.s}]).hex,p.observed)));
 // direction
 const hue=hex=>{const l=DE.hexLab(hex);return (Math.atan2(l[2],l[1])*180/Math.PI+360)%360};
 const inRange=(x,[a,b])=>a<=b?x>=a&&x<=b:(x>=a||x<=b);
 const rows=[];
 const SW=[.01,.02,.03,.05,.1,.2,.35,.5,.7,1];
 const hsl=hx=>{const rgb=[1,3,5].map(i=>parseInt(hx.slice(i,i+2),16)/255),mx=Math.max(...rgb),mn=Math.min(...rgb),dd=mx-mn;let H=0;if(dd){H=mx===rgb[0]?((rgb[1]-rgb[2])/dd)%6:mx===rgb[1]?(rgb[2]-rgb[0])/dd+2:(rgb[0]-rgb[1])/dd+4;H=(H*60+360)%360}return H};
 // A case passes when (1) at full strength the result is no lighter than Lmax and no more chromatic than Cmax,
 // and (2) its hue window is reachable at some practical strength (.05-1) with visible chroma and non-black value.
 for(const d of OBS.direction){const at=s=>{const hx=pred(d.base,d.plastic,d.dyes.map(n=>({name:n,s}))).hex,l=DE.hexLab(hx);return{hx,l,C:Math.hypot(l[1],l[2]),H:hsl(hx)}};
  const full=at(1);let ok=true,why="";
  if(d.Lmax!=null&&full.l[0]>d.Lmax){ok=false;why="L"}
  if(d.Cmax!=null&&full.C>d.Cmax){ok=false;why+="C"}
  if(d.hue&&!SW.some(s=>{const x=at(s);return x.C>=10&&x.l[0]>=8&&inRange(x.H,d.hue)})){ok=false;why+="H"}
  rows.push({id:d.id,hex:full.hx,H:Math.round(full.H),L:Math.round(full.l[0]),ok,why})}
 {const hs=[];for(const u of OBS.uv||[]){const hx=DE.uv365({baseHex:"#F4F2E8",family:"star",items:[{name:u.dye,s:1}]}),l=DE.hexLab(hx);hs.push({dye:u.dye,hex:hx,ok:inRange(hsl(hx),u.hue)&&l[0]>25})}R.uv={n:hs.length,pass:hs.filter(x=>x.ok).length,rows:hs}}
 R.direction={n:rows.length,pass:rows.filter(r=>r.ok).length,rows};
 return R}
if(process.argv[1]&&process.argv[1].endsWith("eval_dataset.mjs")){const R=evaluate();
 if(process.argv.includes("--json"))console.log(JSON.stringify(R));else{for(const k of["films","anchors","photoSamples"])console.log(k.padEnd(13),JSON.stringify(R[k]));
 if(process.argv.includes("--coverage"))console.log("coverage     ",JSON.stringify(coverage()));console.log("uv365 hue",R.uv.pass+"/"+R.uv.n,R.uv.rows.filter(r=>!r.ok).map(r=>r.dye+" "+r.hex).join(", "));console.log("direction",R.direction.pass+"/"+R.direction.n);R.direction.rows.filter(r=>!r.ok).forEach(r=>console.log("  FAIL",r.id,r.hex,"H",r.H,"L",r.L,r.why))}}
