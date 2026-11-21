import sharp from 'sharp';
import { compileStencil, normalizeArtwork } from '/tmp/lr/app/dye-studio/src/duStencilCompiler.mjs';
import fs from 'fs';
const d='/mnt/user-data/uploads/local-roots/.stencil-test/';
for (const f of fs.readdirSync(d).filter(x=>/^out_.*\.png$/.test(x))) {
  const n=1024;const { data } = await sharp(d+f).flatten({background:'#fff'}).greyscale().resize(n,n).raw().toBuffer({resolveWithObject:true});
  const lum=new Float32Array(n*n);for(let k=0;k<n*n;k++)lum[k]=data[k];
  const a=normalizeArtwork(lum,n,n);const r=compileStencil(a.mask,a.width,a.height,a.mmPerPx);
  const v=r.validation,fi=r.fidelity;
  console.log(f.padEnd(14),r.verdict.padEnd(10),'islands',v.islandCount,'fail',v.islandFails.length,'necks',v.necks.length,'thinBlk',v.thinBlackAreaMm2,'chg%',(fi.changedFraction*100).toFixed(2),fi.level,'passes',r.passes.length);
}
