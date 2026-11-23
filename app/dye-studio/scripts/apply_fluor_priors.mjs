// Applies research/dataset/fluor_priors.json (emission band by hue class, UV yield) to the fitted catalog WITHOUT refitting
// absorbance bands, so measured film and anchor fits stay as they were. Usage: node apply_fluor_priors.mjs
import fs from "node:fs";
import {load} from "./harness.mjs";
const h=load(),CAT=h.DE.CAT,META=h.META,FP=JSON.parse(fs.readFileSync(new URL("../research/dataset/fluor_priors.json",import.meta.url),"utf8"));
const hue=x=>{const[r,g,b]=[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;const H=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return(H*60+360)%360};
const cls=H=>H<15||H>=340?"red":H<45?"orange":H<80?"yellow":H<100?"lime":H<170?"green":H<200?"cyan":H<250?"blue":H<300?"purple":"pink";
const alias=n=>n.replace(/^(iDye Poly |ProChem |UV Blast )/,"");
let n=0;
for(const k of Object.keys(CAT)){const c=CAT[k];if(!(c.phi>0)||!c.em)continue;const m=META[k]||META[alias(k)]||META["ProChem "+k];if(!m||!m.uvColor||!(m.fluor>0))continue;
 const p=FP.classes[cls(hue(m.uvColor))];if(k==="Clear UV Blast"||k==="UV Blast Clear")continue;c.uvem=p.em.slice();c.uvphi=+(p.uvphi*Math.min(1,.5+m.fluor/2)).toFixed(3);n++}
const src=fs.readFileSync(new URL("../src/catalog.generated.js",import.meta.url),"utf8");
const prm=src.match(/Object\.assign\(DE\.PRM\.champion,[^;]*;\nDE\.PRM\.tq=[^;]*;/)[0];
fs.writeFileSync(new URL("../src/catalog.generated.js",import.meta.url),"/*CATALOG-BEGIN*/\nObject.assign(DE.CAT,"+JSON.stringify(CAT)+");\n"+prm+"\n/*CATALOG-END*/\n");
console.log("fluorescent entries updated",n);
