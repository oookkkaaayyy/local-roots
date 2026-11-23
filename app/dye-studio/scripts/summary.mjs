import fs from "node:fs";
import {load,lab} from "./harness.mjs";
import {evaluate} from "./eval_dataset.mjs";
const h=load(),{DE}=h;const R=evaluate();
const OWNER={orange:["#FF971A","#FC8528","#FF722F"],red:["#E18172","#EA7C6C","#BE4043"],glow:["#FCF9D4","#F0E2C1","#E6D9AF"]};
const Z={plate:.35,shoulder:.72,rim:.93};let s=0,n=0;
for(const v of Object.values(OWNER))["shoulder","rim"].forEach((z,i)=>{const pr=DE.predict({baseHex:v[0],transHex:v[0],family:"champion",zone:z,path:h.opticalPathAt(Z[z]),items:[]});s+=DE.dEhex(pr.hex,v[i+1]);n++});
const A=h.hbnfChampionPointAnchors;const rr={};for(const k of Object.keys(A.colors))rr[k.split(" ").pop()]=+DE.dEhex(DE.predict({baseHex:A.surfaceBase,transHex:A.transmissionBase,family:"champion",zone:"rim",path:h.opticalPathAt(.93),items:[{name:k,s:1}]}).hex,A.colors[k].rim).toFixed(1);
console.log(JSON.stringify({films:R.films.mean,anchors:R.anchors.mean,anchP95:R.anchors.p95,rim:rr,ownerUndyed:+(s/n).toFixed(2),retailRimMed:R.champRimBase.median,uv:R.uv.pass+"/"+R.uv.n,dir:R.direction.pass+"/"+R.direction.n}));
