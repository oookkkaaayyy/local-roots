import fs from "node:fs";
const rd=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8").trim()+"\n";
const out=new URL("../../public/dyed-and-unattached/dye-studio/",import.meta.url);
for(const f of fs.readdirSync(out))if(/^(studio|consumer|disc-photo|index\.html|dye\.css)/.test(f))fs.rmSync(new URL(f,out));
fs.writeFileSync(new URL("engine.js",out),["../src/spectral.src.js","../src/engine.src.js","../src/catalog.generated.js","../src/dyes.generated.js"].map(rd).join("\n"));
for(const f of["duStencilCompiler.mjs","duStencilConstraints.mjs","photo-stencil.mjs","segment.mjs"])fs.writeFileSync(new URL(f,out),rd("../src/"+f));
fs.writeFileSync(new URL("ui.js",out),rd("../src/ui.src.js"));
console.log("dye studio built");
