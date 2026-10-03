import { readFileSync } from 'node:fs';

const admin=readFileSync(new URL('../src/pages/DuAdminPage.tsx',import.meta.url),'utf8');
const generator=readFileSync(new URL('../functions/api/du-generate.ts',import.meta.url),'utf8');
const wrangler=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const serviceWorker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

const failures=[];
const requireText=(source,text,label)=>{if(!source.includes(text))failures.push('Missing '+label);};
const forbidText=(source,text,label)=>{if(source.includes(text))failures.push('Forbidden '+label);};

forbidText(admin,'du-handoff-create','legacy secure handoff');
forbidText(admin,"chatgpt://",'ChatGPT deep link');
forbidText(admin,'Open ChatGPT','ChatGPT launch UI');
requireText(admin,"fetch('/api/du-generate'","Generation v2 endpoint");
requireText(admin,"action:'save_generated_draft'","draft persistence");
requireText(admin,'Composition photo','composition selector');
requireText(generator,"@cf/black-forest-labs/flux-2-klein-4b",'free FLUX.2 model');
requireText(generator,'input_image_0','multipart composition input');
requireText(generator,"action:'job'",'server-side admin authorization');
requireText(wrangler,'"binding": "AI"','Workers AI binding');
requireText(serviceWorker,'notificationTarget(payload.url)','exact-job push target');
requireText(serviceWorker,'client.navigate(targetUrl)','push navigation');

if(failures.length){
  console.error('D&U Generation v2 regression check failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('D&U Generation v2 regression check passed.');
