import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildKeepAssetsCandidate} from '../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs';

const capturePath=process.env.HBNF_CF_AUTHENTICATED_CAPTURE;
const settingsPath=process.env.HBNF_CF_AUTHENTICATED_SETTINGS;

test('authenticated v348 dispatcher remains byte-derived and candidate adds only the helper route',
  (!capturePath||!settingsPath)?{skip:'Set HBNF_CF_AUTHENTICATED_CAPTURE and HBNF_CF_AUTHENTICATED_SETTINGS to private local files.'}:{},
  async()=>{
    const capture=JSON.parse(await readFile(resolve(capturePath),'utf8'));
    const workerSettings=JSON.parse(await readFile(resolve(settingsPath),'utf8'));
    assert.equal(capture.origin,'AUTHENTICATED_CLOUDFLARE_GET');
    assert.equal(capture.before.versionId,'48ffa87e-3c83-46d0-a6ca-db7bf0b064e6');
    assert.equal(capture.after.versionId,capture.before.versionId);
    const helper=await readFile(new URL('../public/glow-save-sync.mjs',import.meta.url));
    const built=buildKeepAssetsCandidate({capture,helper,workerSettings});
    const dir=await mkdtemp(join(tmpdir(),'hbnf-authenticated-worker-'));
    try{
      const original=Buffer.from(capture.source.multipartBase64,'base64');
      const {parseMultipart}=await import('../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs');
      const originalModule=parseMultipart(original).parts.get('index.js');
      await writeFile(join(dir,'v348.mjs'),originalModule);
      await writeFile(join(dir,'candidate.mjs'),built.module);
      const v348=await import(pathToFileURL(join(dir,'v348.mjs')).href);
      const candidate=await import(pathToFileURL(join(dir,'candidate.mjs')).href);
      const dispatched=[];
      const env={ASSETS:{fetch:async request=>{
        dispatched.push(new URL(request.url).pathname);
        return new Response('provider asset response',{headers:{'X-Asset-Fixture':'unchanged'}});
      }}};
      for(const pathname of ['/api/udisc-glow/events','/internal/udisc-glow-sync','/cart.html']){
        const request=()=>new Request(`https://hbnightflyers.com${pathname}`);
        const before=await v348.default.fetch(request(),env);
        const after=await candidate.default.fetch(request(),env);
        assert.equal(after.status,before.status,`${pathname} status changed`);
        assert.equal(await after.text(),await before.text(),`${pathname} response changed`);
        assert.equal(after.headers.get('content-type'),before.headers.get('content-type'),`${pathname} content type changed`);
      }
      assert.deepEqual(dispatched,['/cart.html','/cart.html']);
      const helperResponse=await candidate.default.fetch(new Request('https://hbnightflyers.com/glow-save-sync.mjs'),env);
      assert.equal(helperResponse.status,200);
      assert.equal(await helperResponse.text(),helper.toString());
      assert.equal(dispatched.length,2,'new helper route fell through to the provider asset collection');
    }finally{await rm(dir,{recursive:true,force:true});}
  });
