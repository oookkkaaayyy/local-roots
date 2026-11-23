import {mk,anchors} from "./exp.mjs";
const out=[];
for(const d of [.25,.5,1,2,4,1e3])for(const m of [.6,.8,1,1.25,1.6,2.2])for(const gm of [.8,1,1.25]){
 const f=`((1-Math.exp(-path/${d}))/(1-Math.exp(-.74/${d}))*.74)`;
 const {DE}=mk([["Math.exp(-2*tau[i]*P.kT*Math.pow(path,P.pw))","Math.exp(-2*tau[i]*P.kT*Math.pow(.74,P.pw)/.74*"+f+")"]]);DE.PRM.champion.kT*=m;DE.PRM.champion.gT*=gm;
 out.push([anchors(DE),d,m,gm])}
out.sort((a,b)=>a[0]-b[0]);console.log(out.slice(0,8).map(r=>r.map(x=>+x.toFixed(2)).join(" ")).join("\n"));
