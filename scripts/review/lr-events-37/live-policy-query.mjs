#!/usr/bin/env node
// Emit one read-only SQL SELECT from the exact candidate CSV. Never connect to a DB.
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const cols=['slug','name','start_date','county','city','course_name','event_type','source_key','external_id','source_url'];
function parse(line) {
  const out=[]; let field='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++}else quoted=!quoted;}
    else if(c===','&&!quoted){out.push(field);field='';}
    else field+=c;
  }
  if(quoted)throw Error('Unterminated quote');
  out.push(field); return out;
}
const lines=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'occurrences.csv'),'utf8').trim().split(/\r?\n/);
if(JSON.stringify(parse(lines.shift()))!==JSON.stringify(cols))throw Error('Candidate CSV schema changed');
const rows=lines.map(s=>{
  const fields=parse(s);
  if(fields.length!==cols.length)throw Error('Candidate CSV width changed');
  return Object.fromEntries(cols.map((col,i)=>[col,fields[i]]));
});
if(rows.length!==37||new Set(rows.map(x=>x.slug)).size!==37)throw Error('Candidate identity/count changed');
const payload=JSON.stringify(rows);
if(payload.includes('$LR37_REVIEW$'))throw Error('Unsafe SQL delimiter');
const sql=[
'-- READ ONLY: exact Local Roots review CSV. Run against the existing Local Roots DB with read-only privileges.',
'-- No DML, DDL, source crawling, scores, tags or restricted HBNF league_state access.',
'WITH candidate AS (',
" SELECT * FROM jsonb_to_recordset($LR37_REVIEW$"+payload+"$LR37_REVIEW$::jsonb)",
' AS c(slug text,name text,start_date date,county text,city text,course_name text,event_type text,source_key text,external_id text,source_url text)',
'), joined AS (',
' SELECT c.*,s.id AS source_id,s.enabled,s.trust_tier,s.verification_ttl,',
"  jsonb_build_object('name',c.name,'start_date',c.start_date,'end_date',c.start_date,",
"   'city',c.city,'county',c.county,'course_name',c.course_name,'event_type',c.event_type) AS payload",
' FROM candidate c LEFT JOIN public.lr_sources s ON s.key=c.source_key',
'), evaluated AS (',
' SELECT c.*, public.lr_candidate_validation_errors(c.payload) AS errors,',
'  public.lr_candidate_scope_status(c.payload) AS scope,',
'  m.method,m.ambiguous,m.event_id AS matched_event_id,',
'  EXISTS(SELECT 1 FROM public.lr_events e WHERE e.slug=c.slug) AS slug_exists,',
'  EXISTS(SELECT 1 FROM public.lr_event_sources es JOIN public.lr_events e ON e.id=es.event_id',
'    WHERE es.source_id=c.source_id AND es.source_url=c.source_url AND e.start_date=c.start_date) AS same_url_date',
' FROM joined c LEFT JOIN LATERAL',
'   public.lr_match_candidate(c.source_id,c.external_id,c.payload) m ON true',
'), problems AS (',
' SELECT *, (errors <> \u0027[]\u0027::jsonb OR scope IS DISTINCT FROM \u0027in_scope\u0027',
' OR enabled IS DISTINCT FROM true OR trust_tier IS DISTINCT FROM 2',
" OR verification_ttl IS DISTINCT FROM interval '14 days'",
" OR method IS DISTINCT FROM 'new' OR ambiguous IS DISTINCT FROM false",
' OR matched_event_id IS NOT NULL OR slug_exists OR same_url_date',
" OR start_date < (now() AT TIME ZONE 'America/Los_Angeles')::date) AS blocked",
' FROM evaluated',
')',
"SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date AS pacific_as_of,",
' count(*) AS candidate_count,',
' count(*) FILTER (WHERE NOT blocked) AS eligible_count,',
' count(*) FILTER (WHERE blocked) AS blocked_count,',
" coalesce(jsonb_agg(jsonb_build_object('slug',slug,'date',start_date,",
"  'errors',errors,'scope',scope,'source_enabled',enabled,'source_tier',trust_tier,",
"  'source_ttl',verification_ttl::text,'match_method',method,'ambiguous',ambiguous,",
"  'slug_exists',slug_exists,'same_url_date',same_url_date)",
" ORDER BY start_date,slug) FILTER (WHERE blocked),'[]'::jsonb) AS blocked_rows",
'FROM problems;'
].join('\n')+'\n';
process.stdout.write(sql);
