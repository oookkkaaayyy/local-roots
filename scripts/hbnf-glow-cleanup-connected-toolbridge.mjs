// Exact shape bridge for the established HBNF cleanup runner's legacy tool
// requests. REVIEW_ONLY by default; no general command execution or fallback.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const REPO='oookkkaaayyy/local-roots';
const PROJECT='phcpbvuqibyarpfrftgx';
const FOLDER='1mZWMyzLIKnSjBTP82-EfGOqktld17X84';
const CLAIM=/^release-claims\/[A-Za-z0-9._-]{1,80}\.(?:admission|execution|restore)-claim\.json$/;
const error=message=>{throw new Error('HBNF cleanup bridge: '+message)};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const field=(x,name)=>{if(!obj(x)||typeof x[name]!=='string'||!x[name])error('missing '+name);return x[name]};
const exactKeys=(value,allowed)=>{if(!obj(value)||Object.keys(value).some(k=>!allowed.includes(k)))error('unsupported tool arguments')};
function requireOk(answer,service){
  if(!obj(answer)||answer.isError===true||answer.error)error(service+' provider error');
  if(typeof answer.text==='string'){
    let p;try{p=JSON.parse(answer.text)}catch{error(service+' response was not valid JSON')}
    if(p.error||p.isError)error(service+' response reports failure');
  }
  return answer;
}
export function createHbnfCleanupConnectedBridge({
  connected={},mode='REVIEW_ONLY',authorizeLive,resolveFileUri,readLocal=readFile,
}={}){
  if(!['REVIEW_ONLY','SYNTHETIC','ADMITTED_LIVE'].includes(mode))error('invalid bridge mode');
  const get=key=>{
    const f=connected[key];if(typeof f!=='function')error(key+' connector unavailable');
    return f;
  };
  async function permission(kind,args){
    if(mode==='SYNTHETIC')return;
    if(mode!=='ADMITTED_LIVE'||typeof authorizeLive!=='function'||
      await authorizeLive({kind,args})!==true)error(kind+' rejected: no live admission/owner permit');
  }
  const methods={
    async mcp__codex_apps__supabase_execute_sql(args){
      exactKeys(args,['project_id','query']);
      if(field(args,'project_id')!==PROJECT)error('Supabase project mismatch');
      const q=field(args,'query').trim();
      if(/^(select|with)\b/i.test(q)){
        // The existing real read/hash SELECT contract is passed through exactly.
        if(/;\s*\S/.test(q))error('multiple SQL statements denied');
      }else if(/^DO\s+\$hbnf_cleanup_guard\$/i.test(q)){
        if(!q.includes('LOCK TABLE public.hbnf_current_tag_entries IN SHARE MODE')||
          !q.includes('hbnf_save_league_state_v1(')||
          !q.includes('hbnf_cleanup_cas_conflict')||
          !q.includes('public.hbnf_matrix_control_state'))error('noncanonical guarded CAS');
        await permission('guarded-cas',args);
      }else error('SQL outside exact cleanup read/CAS operations');
      const r=requireOk(await get('supabaseExecuteSql')(args),'Supabase SQL');
      // Connected Chat returns {text:'{"result":"...<untrusted-data>..."}'},
      // original cleanup provider parses MCP-style content [{type:'text',text}].
      const raw=typeof r.text==='string'?r.text:
        typeof r?.result==='string'?JSON.stringify({result:r.result}):
        typeof r?.content?.[0]?.text==='string'?r.content[0].text:null;
      if(typeof raw!=='string')error('Supabase result cannot be safely normalized');
      let outer;try{outer=JSON.parse(raw)}catch{error('Supabase SQL response malformed')}
      if(typeof outer?.result!=='string'||!/<\/untrusted-data-[^>]+>/.test(outer.result))
        error('Supabase SQL missing bounded provider data');
      return {content:[{type:'text',text:raw}]};
    },
    async mcp__codex_apps__github_create_file(args){
      exactKeys(args,['repository_full_name','branch','path','content','message']);
      if(args.repository_full_name!==REPO||!CLAIM.test(field(args,'path')))
        error('GitHub claim target mismatch');
      if(!/^(feature\/udisc-glow-standings-prototype|review\/hbnf-glow-cleanup-toolbridge-20261102)$/.test(field(args,'branch')))
        error('GitHub claim branch not allowed');
      // This path never creates ANY production claim in review/synthetic absence.
      await permission('one-time-claim',args);
      const result=requireOk(await get('githubCreateFile')(args),'GitHub create claim');
      const commit=result?.result?.commit_sha||result?.structuredContent?.commit_sha;
      if(typeof commit!=='string'||!/^[0-9a-f]{40}$/.test(commit))
        error('GitHub claim lacks immutable commit SHA');
      return {structuredContent:{commit_sha:commit}};
    },
    async mcp__codex_apps__github_fetch_file(args){
      exactKeys(args,['repository_full_name','branch','path','ref','encoding']);
      if(args.repository_full_name!==REPO||!CLAIM.test(field(args,'path'))||
        !/^[a-f0-9]{40}$/.test(field(args,'ref'))||args.encoding!=='base64')
        error('GitHub immutable claim readback target invalid');
      const r=requireOk(await get('githubFetchFile')({
        repository_full_name:REPO,path:args.path,ref:args.ref,encoding:'base64'}),'GitHub fetch claim');
      const payload=r?.result||r?.structuredContent;
      if(typeof payload?.content!=='string'||payload.encoding!=='base64')
        error('GitHub claim bytes were not returned as base64');
      return {structuredContent:{content:payload.content}};
    },
    async mcp__codex_apps__google_drive_search(args){
      exactKeys(args,['query','topn','special_filter_query_str']);
      const expected="'"+FOLDER+"' in parents and trashed = false";
      if(args.query!=='HBNF Glow cleanup evidence'||args.special_filter_query_str!==expected||
        args.topn!==100)error('Drive search scope differs');
      const r=requireOk(await get('driveSearch')(args),'Drive folder search');
      const entries=r?.result?.results||r?.structuredContent?.results;
      if(!Array.isArray(entries)||entries.length>=100)error('Drive folder listing incomplete');
      return {structuredContent:{results:entries.map(x=>({id:x.id,title:x.title||x.name}))}};
    },
    async mcp__codex_apps__google_drive_fetch(args){
      exactKeys(args,['url','download_raw_file','include_base64']);
      const id=field(args,'url').match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/view$/)?.[1];
      if(!id||args.download_raw_file!==true||args.include_base64!==true)
        error('Drive download parameters invalid');
      const r=requireOk(await get('driveFetch')(args),'Drive download');
      const p=r?.result||r?.structuredContent;
      if(typeof p?.b64_string!=='string'||p.b64_string.length===0)error('Drive download omitted provider bytes');
      return {structuredContent:{b64_string:p.b64_string}};
    },
    async mcp__codex_apps__google_drive_upload_file(args){
      exactKeys(args,['file_uri','file_name','mime_type','parent_folder_id']);
      if(args.parent_folder_id!==FOLDER||args.mime_type!=='application/json'||
        !/^[A-Za-z0-9._-]{10,120}\.json$/.test(field(args,'file_name')))
        error('Drive immutable receipt target invalid');
      // The runner passes an absolute local file path in file_uri, while the
      // Chat Drive connector REQUIRES a provider-owned file_uri. A string cast
      // or local filesystem path does not meet that contract.
      if(typeof resolveFileUri!=='function')error('no authenticated local-file→connector-file_uri materializer');
      const pathname=field(args,'file_uri');
      if(!pathname.startsWith('/')||pathname.includes('..'))error('unexpected local receipt path');
      const source=Buffer.from(await readLocal(pathname));
      const resolved=await resolveFileUri({localPath:pathname,name:args.file_name,
        sha256:sha(source),bytes:source.length});
      if(!obj(resolved)||!resolved.providerMaterialized||
        typeof resolved.file_uri!=='string'||!resolved.file_uri||
        resolved.sha256!==sha(source)||resolved.bytes!==source.length)
        error('Drive connector file_uri did not prove local-source byte identity');
      await permission('durable-receipt-upload',args);
      const r=requireOk(await get('driveUploadFile')({
        file_uri:resolved.file_uri,file_name:args.file_name,
        mime_type:'application/json',parent_folder_id:FOLDER}),'Drive upload');
      const id=r?.result?.id||r?.structuredContent?.id;
      if(typeof id!=='string'||!id)error('Drive upload omitted provider file ID');
      return {structuredContent:{id}};
    },
  };
  return Object.freeze({
    dispatch:async(request)=>{
      if(!obj(request)||request.type!=='tool'||!Number.isSafeInteger(request.id)||request.id<1)
        error('invalid runner request frame');
      const fn=methods[request.method];
      if(typeof fn!=='function')error('unknown runner method; no fallback');
      return {id:request.id,result:await fn(request.args)};
    },
    methods:Object.freeze(Object.keys(methods)),
    mode,
  });
}
// Transport: each runner stdout line with type:"tool" passes dispatch;
// write the JSON reply on runner stdin, exactly once per id. Never forward
// status lines as tool calls. On errors STOP the runner; do not fabricate a
// successful provider response or retry a one-time claim.
