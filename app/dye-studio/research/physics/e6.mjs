import {mk} from "./exp.mjs";
import fs from "node:fs";
const GT=JSON.parse(fs.readFileSync("/home/claude/wt-dye-physics/app/dye-studio/src/groundtruth.json","utf8"));
const A=GT.anchors,{DE}=mk();const N="UV Blast Blaze Orange",o=DE.CAT[N];
const Z={plate:.35,shoulder:.72,rim:.93},pathAt=(r)=>{let x;if(r<.58)x=.64+r*.20;else if(r<.84)x=.78+(r-.58)*1.25;else x=1.10+(r-.84)*3.10;return x};
const res=[];
for(const mu of [510,525,540,555,570])for(const sg of [20,30,40])for(const a of [.5,1,2,3,4,6]){
 DE.CAT[N]={...o,b:o.b.concat([[mu,sg,a]])};
 const f=DE.dEhex(DE.predict({baseHex:"#F4F2E8",family:"star",items:[{name:N,s:1}]}).hex,GT.opaqueTargets[N]);
 const an=["plate","shoulder","rim"].map(z=>DE.dEhex(DE.predict({baseHex:A.surfaceBase,transHex:A.transmissionBase,family:"champion",scene:"outdoor",zone:z,path:pathAt(Z[z]),items:[{name:N,s:1}]}).hex,A.colors[N][z]));
 res.push([f,an,mu,sg,a,an.reduce((x,y)=>x+y)/3])}
res.sort((x,y)=>x[5]+x[0]-y[5]-y[0]);for(const r of res.slice(0,8))console.log("mu",r[2],"sg",r[3],"a",r[4],"film",r[0].toFixed(2),"anch",r[1].map(x=>x.toFixed(1)).join(","))
