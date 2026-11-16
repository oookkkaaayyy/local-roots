import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const script=fileURLToPath(new URL('../scripts/review/lr-events-37/live-policy-query.mjs',import.meta.url));
function generate(){
 const p=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
 assert.equal(p.error,undefined);
 assert.equal(p.status,0,p.stderr);
 return p.stdout;
}
test('emits a single non-mutating SELECT with the exact 36 candidate IDs',()=>{
 const sql=generate();
 const match=sql.match(/\$LR36_REVIEW\$(.*?)\$LR36_REVIEW\$::jsonb/s);
 assert.ok(match,'candidate JSON must be safely dollar-quoted');
 const rows=JSON.parse(match[1]);
 assert.equal(rows.length,36);
 assert.equal(new Set(rows.map(r=>r.slug)).size,36);
 assert.equal(rows.filter(r=>r.start_date==='2026-11-17').length,3);
 assert.ok(rows.every(r=>r.source_key==='udisc_organizer_listings'));
 assert.ok(rows.every(r=>r.slug!=='new-year-new-me-new-tags-2027'));
 assert.equal(sql.trim().split(';').length,2,'one terminal SQL statement');
 const body=sql.split('\n').filter(x=>!x.startsWith('--')).join('\n');
 assert.doesNotMatch(body,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|COPY)\b/i);
 assert.match(body,/^WITH candidate AS \(/);
 assert.match(body,/^FROM problems;$/m);
});
test('compares installed live authorization, fields, matcher, and Pacific time',()=>{
 const sql=generate();
 for(const field of [
  'public.lr_sources','public.lr_events','public.lr_event_sources',
  'public.lr_candidate_validation_errors','public.lr_candidate_scope_status',
  'public.lr_match_candidate','enabled IS DISTINCT FROM true',
  'trust_tier IS DISTINCT FROM 2',"interval '14 days'",
  "method IS DISTINCT FROM 'new'",'slug_exists','same_url_date',
  "America/Los_Angeles",'blocked_rows'
 ])assert.ok(sql.includes(field),field);
 const body=sql.split('\n').filter(x=>!x.startsWith('--')).join('\n');
 assert.ok(!body.includes('league_state'),'must not query official HBNF scoring');
});

test('review manifest pins the exact 36-row inputs without reusing recovery authority', async () => {
 const folder=new URL('../scripts/review/lr-events-37/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('review-manifest.json',folder),'utf8'));
 const names=['admit.sql','occurrences.csv','stage.sql','withdraw.sql'];
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 const files=await Promise.all(names.map(async name=>({
  path:`scripts/review/lr-events-37/${name}`,
  content:await readFile(new URL(name,folder),'utf8'),
 })));
 assert.deepEqual(manifest.files,files.map(({path,content})=>({
  path,bytes:Buffer.byteLength(content),sha256:digest(content),
 })));
 const bundle=Buffer.from(JSON.stringify({files})+'\n');
 assert.equal(manifest.occurrenceCount,36);
 assert.equal(manifest.package.bytes,bundle.length);
 assert.equal(manifest.package.sha256,digest(bundle));
 assert.equal(manifest.excludedExisting.slug,'new-year-new-me-new-tags-2027');
 assert.equal(manifest.recovery.approval,'PENDING_EXACT_REVISED_CANDIDATE');
 assert.equal(manifest.productionPublication,'NOT_AUTHORIZED');
 assert.equal(manifest.releaseAdmission,'NOT_RUN');
});
