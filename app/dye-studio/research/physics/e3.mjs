import {mk,anchors} from "./exp.mjs";
import fs from "node:fs";
const GT=JSON.parse(fs.readFileSync("/home/claude/wt-dye-physics/app/dye-studio/src/groundtruth.json","utf8")).anchors;
for(const w of [.3,.5,.7,.85,1])for(const rimk of [.12,.3])for(const kT of [1.5]){
 const {DE}=mk([["outdoor:{plate:1,shoulder:.75,rim:.5}","outdoor:{plate:1,shoulder:.75,rim:"+w+"}"],["champion:{qb","champion:{rimx:1,qb"],["tr:1,kS","tr:1,kS"]]);
 DE.PRM.champion.rim=rimk;
 const out=[];for(const n of Object.keys(GT.colors)){const p=DE.predict({baseHex:GT.surfaceBase,transHex:GT.transmissionBase,family:"champion",scene:"outdoor",zone:"rim",path:1.38,items:[{name:n,s:1}]});out.push(p.hex+" "+DE.dEhex(p.hex,GT.colors[n].rim).toFixed(1))}
 console.log(w,rimk,out.join(" | "))}
