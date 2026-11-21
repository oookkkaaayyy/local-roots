import sharp from 'sharp';
const C=await import('/tmp/lr/app/src/lib/duStencilCompiler.mjs');
for(const r of ['0','2','4','5','7','8']){const {data,info}=await sharp(`/tmp/pr${r}.png`).greyscale().raw().toBuffer({resolveWithObject:true});
 const lum=new Uint8Array(data);const t=Date.now();const art=C.normalizeArtwork(lum,info.width,info.height);const res=C.compileStencil(art.mask,art.width,art.height,art.mmPerPx);
 console.log(r,res.verdict,'islands',res.validation.islandFails.length,'necks',res.validation.necks.length,'thinBlack',res.validation.thinBlackAreaMm2,Date.now()-t,'ms',JSON.stringify(res.fidelity.level))}
