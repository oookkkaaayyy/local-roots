import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/review/lr-events-37/live-policy-query.mjs',import.meta.url));
function generate(){
 const p=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
 assert.equal(p.error,undefined);
 assert.equal(p.status,0,p.stderr);
 return p.stdout;
}
test('emits a single non-mutating SELECT with the exact 37 candidate IDs',()=>{
 const sql=generate();
 const match=sql.match(/\$LR37_REVIEW\$(.*?)\$LR37_REVIEW\$::jsonb/s);
 assert.ok(match,'candidate JSON must be safely dollar-quoted');
 const rows=JSON.parse(match[1]);
 assert.equal(rows.length,37);
 assert.equal(new Set(rows.map(r=>r.slug)).size,37);
 assert.equal(rows.filter(r=>r.start_date==='2026-11-17').length,3);
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
