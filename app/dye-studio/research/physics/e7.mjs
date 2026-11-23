import {mk,anchors} from "./exp.mjs";
for(const X of [0,1,2,3,4])for(const wf of [1,.6,.3]){
 const {DE}=mk([["Math.exp(-.7*tauTotal[j])","Math.exp(-.7*tauTotal[j]*(opt&&opt.att||1))"],["{cscale:P.kS*P.kT*Math.pow(path,P.pw)}","{cscale:P.kS*P.kT*Math.pow(path,P.pw),att:Math.pow(Math.max(path,.2)/.74,"+X+")}"],["v+f[i]*(scene===\"backlit\"?.3:1)","v+f[i]*(scene===\"backlit\"?.3:1)*(zone===\"rim\"?"+wf+":1)"]]);
 console.log("X",X,"rimFluorW",wf,anchors(DE).toFixed(2))}
