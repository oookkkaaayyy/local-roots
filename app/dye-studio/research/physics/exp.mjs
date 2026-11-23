import fs from "node:fs";
const R=new URL("../../";
const rd=p=>fs.readFileSync(R+p,"utf8");
const GT=JSON.parse(rd("src/groundtruth.json"));
export function mk(patch){let eng=rd("src/engine.src.js");for(const [a,b] of patch||[]){if(!eng.includes(a))throw new Error("nomatch "+a);eng=eng.replace(a,b)}
 return new Function(rd("src/spectral.src.js")+"\n"+eng+"\n"+rd("src/catalog.generated.js")+"\nreturn {DE,SP};")()}
const pathAt=(r)=>{let x;if(r<.58)x=.64+r*.20;else if(r<.84)x=.78+(r-.58)*1.25;else x=1.10+(r-.84)*3.10;return x};
export function anchors(DE,verbose){const A=GT.anchors,Z={plate:.35,shoulder:.72,rim:.93},e=[],rows=[];
 for(const n of Object.keys(A.colors))for(const z of["plate","shoulder","rim"]){const p=DE.predict({baseHex:A.surfaceBase,transHex:A.transmissionBase,family:"champion",scene:"outdoor",zone:z,path:pathAt(Z[z]),items:[{name:n,s:1}]}).hex;const d=DE.dEhex(p,A.colors[n][z]);e.push(d);rows.push([n,z,A.colors[n][z],p,d.toFixed(1)].join(" "))}
 if(verbose)console.log(rows.join("\n"));return e.reduce((a,b)=>a+b)/e.length}
