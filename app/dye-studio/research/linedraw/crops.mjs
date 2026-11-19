import * as ort from 'onnxruntime-node';import sharp from 'sharp';import fs from 'node:fs';
const S=await import('/tmp/lr/app/dye-studio/src/segment.mjs');
const sess=await ort.InferenceSession.create('/tmp/ml/u2netp.onnx');
const seg=async d=>{const o=await sess.run({[sess.inputNames[0]]:new ort.Tensor('float32',S.frameToTensor(d,640),[1,3,320,320])});return S.maskFromProb(o[sess.outputNames[0]].data,640)};
for(const r of ['0','2','4','5','7','8']){
 let d=new Uint8ClampedArray(await sharp(`/tmp/src${r}.png`).ensureAlpha().raw().toBuffer());
 const m0=await seg(d),f=S.headFrame(m0,640);
 const side=Math.min(640,Math.round(f.side));const left=Math.round(Math.max(0,Math.min(640-side,f.cx-side/2))),top=Math.round(Math.max(0,Math.min(640-side,f.cy-side/2)));
 await sharp(`/tmp/src${r}.png`).extract({left,top,width:side,height:side}).resize(640,640,{kernel:'lanczos3'}).png().toFile(`/tmp/crop${r}.png`);
 const d2=new Uint8ClampedArray(await sharp(`/tmp/crop${r}.png`).ensureAlpha().raw().toBuffer());const m=await seg(d2);
 const b=Buffer.alloc(640*640);for(let i=0;i<b.length;i++)b[i]=m[i]?255:0;await sharp(b,{raw:{width:640,height:640,channels:1}}).png().toFile(`/tmp/cmsk${r}.png`);console.log(r,side)}
