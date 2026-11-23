import {mk} from "./exp.mjs";
import fs from "node:fs";
const GT=JSON.parse(fs.readFileSync("/home/claude/wt-dye-physics/app/dye-studio/src/groundtruth.json","utf8"));
const A=GT.anchors,{DE}=mk();
const N="UV Blast Blaze Orange",orig=JSON.parse(JSON.stringify(DE.CAT[N]));
const film=GT.opaqueTargets[N];
const Z={plate:.35,shoulder:.72,rim:.93},pathAt=(r)=>{let x;if(r<.58)x=.64+r*.20;else if(r<.84)x=.78+(r-.58)*1.25;else x=1.10+(r-.84)*3.10;return x};
function ev(bands,verbose){DE.CAT[N]={...orig,b:bands};
 const f=DE.dEhex(DE.predict({baseHex:"#F4F2E8",family:"star",items:[{name:N,s:1}]}).hex,film);
 const an=["plate","shoulder","rim"].map(z=>DE.dEhex(DE.predict({baseHex:A.surfaceBase,transHex:A.transmissionBase,family:"champion",scene:"outdoor",zone:z,path:pathAt(Z[z]),items:[{name:N,s:1}]}).hex,A.colors[N][z]));
 if(verbose)console.log("film",f.toFixed(2),"anch",an.map(x=>x.toFixed(1)).join(","));return [f,an]}
ev(orig.b,1);
// physical prior: main band mu1 in 530-580, vibronic shoulder 40-60nm blue, plus optional broad UV/blue band
let best=null;const r=DE.rng(5);
const obj=p=>{const [m1,s1,a1,d2,s2,a2,m3,s3,a3]=p;if(m1<525||m1>585||s1<14||s1>60||d2<30||d2>70||s2<14||s2>60||a1<0||a2<0||a3<0||m3<380||m3>480||s3<15||s3>80)return 1e9;
 const b=[[m1,s1,a1],[m1-d2,s2,a2],[m3,s3,a3]];const [f,an]=ev(b);return 1.5*f+an.reduce((x,y)=>x+y,0)/3+.002*(a1+a2+a3)};
for(let k=0;k<400;k++){const p=[525+r()*60,14+r()*40,1+r()*12,30+r()*40,14+r()*40,r()*10,380+r()*100,15+r()*60,r()*10];const v=obj(p);if(!best||v<best.v)best={v,p}}
// simple pattern search
let {p,v}=best,st=p.map(x=>Math.abs(x)*.1+.5);
for(let it=0;it<3000;it++){const i=Math.floor(r()*p.length),q=p.slice();q[i]+=(r()-.5)*2*st[i];const w=obj(q);if(w<v){v=w;p=q}}
console.log(JSON.stringify(p.map(x=>+x.toFixed(2))),v.toFixed(2));
const b=[[p[0],p[1],p[2]],[p[0]-p[3],p[4],p[5]],[p[6],p[7],p[8]]];ev(b,1);console.log(JSON.stringify(b.map(x=>x.map(y=>+y.toFixed(2)))));
