import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {buildCleanupCandidate,canonicalJson,createSupabaseGlowCleanupProvider} from '../scripts/hbnf-glow-week-cleanup.mjs';

const exec=promisify(execFile);
const digest=(alg,value)=>createHash(alg).update(value).digest('hex');
const cast=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
async function sql(command){
  const {stdout}=await exec('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-c',command],{
    env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGPASSWORD:'offline_fixture_only'},
    timeout:7000,maxBuffer:3000000
  });
  return stdout.trim();
}
function fixture(){
  const names=['Test Player A','Test Player B','Test Player C','Test Player D'];
  const teams=[
    {id:'T1',partner1:names[0],partner2:names[1]},
    {id:'T2',partner1:names[2],partner2:names[1]},
    {id:'T3',partner1:'Andrew',partner2:names[3]}];
  const players=[
    {id:'P1',name:names[0],cardId:'C1',scores:['3','4','2'],partner1:names[0],partner2:names[1],removed:false},
    {id:'P2',name:names[2],cardId:'C1',scores:['4','3','2'],partner1:names[2],partner2:names[1],removed:false},
    {id:'P3',name:'Andrew',cardId:'C1',scores:['3','4','2'],partner1:'Andrew',partner2:names[3],removed:false}
  ];
  return {
    skins:{week:{scores:[2,3],history:[{date:'2026-10-28'}]}},
    bagTags:{players:[],manual:{}},
    glow:{activeWeek:'2026-11-03',weeks:{
      '2026-10-28':{cards:[],players:[{id:'H1',scores:['3']}],scoresLocked:true},
      '2026-11-03':{cards:[{id:'C1',players:teams,finalized:false}],players,
        scoresLocked:false,scorecardText:{holePars:[3,3],holeNotes:['keep']},entryFee:5}
    },playerAliases:Object.fromEntries(names.map(n=>[n,n])),
      trophyHistory:[{winner:'prior'}]},
    __backups:[{id:'prior'}]
  };
}
function operation(state){
  const week=state.glow.weeks['2026-11-03'];
  const aliases=Object.keys(state.glow.playerAliases).sort();
  const after=structuredClone(state);
  after.glow.weeks['2026-11-03'].cards=[];
  after.glow.weeks['2026-11-03'].players=[];
  for(const k of aliases)delete after.glow.playerAliases[k];
  return {
    expectedCounts:{cards:1,teams:3,playerRows:3,enteredScores:9,testAliases:4},
    testAliasKeysMd5:digest('md5',aliases.join('\n')),
    rehearsalPayloadSha256:digest('sha256',canonicalJson({cards:week.cards,players:week.players})),
    cleanedStateSha256:digest('sha256',canonicalJson(after))
  };
}
function sqlAdapter(){
  return async function({project_id,query}){
    assert.equal(project_id,'phcpbvuqibyarpfrftgx','CI adapter is hard-bound to synthetic tenant name only');
    if(!/^\s*(select|DO\s)/i.test(query))throw new Error('unexpected SQL kind in fixture');
    const output=await sql(query);
    let rows;
    if(/^\s*DO\s/i.test(query)) rows=[];
    else if(query.includes('as readback'))rows=[{readback:JSON.parse(output)}];
    else rows=[{stateJsonMd5:output}];
    const text=JSON.stringify({result:'<untrusted-data-native>\n'+JSON.stringify(rows)+'\n</untrusted-data-native>'});
    return {content:[{type:'text',text}]};
  };
}
test('native PG17: exact installed CAS/revision/tag/queue trigger and fingerprint-bound rollback + concurrent write fencing',async()=>{
  const root=fixture();
  // This PostgreSQL service exists exclusively in GitHub-hosted CI.
  // It is not the HBNF Supabase project; no production URLs or credentials exist.
  await sql('INSERT INTO public.league_state(id,state_json) VALUES(1,'+cast(root)+')');
  await sql("INSERT INTO public.hbnf_matrix_vnext_live_queue(id,state_updated_at,queued_at,due_at,status,fingerprint,last_error,updated_at) SELECT 1,updated_at,now(),now(),'pending',md5(state_json::text),null,now() FROM public.league_state WHERE id=1");
  const provider=createSupabaseGlowCleanupProvider({executeSql:sqlAdapter()});
  const baseline=await provider.read();
  assert.equal(baseline.row.cards,1);
  assert.equal(baseline.row.teams,3);
  assert.equal(baseline.row.playerRows,3);
  assert.equal(Number(baseline.row.enteredScores),9);
  assert.equal(baseline.row.testAliases,4);
  assert.equal(baseline.tagProjectionMatches,true);
  assert.equal(baseline.matrix.autoLive,false);
  assert.equal(baseline.row.stateJsonMd5,await provider.hashState(root));
  const candidate=buildCleanupCandidate(root,operation(root)).stateJson;
  assert.deepEqual(candidate.skins,root.skins);
  assert.deepEqual(candidate.glow.weeks['2026-10-28'],root.glow.weeks['2026-10-28']);
  let result=await provider.compareAndSwap(baseline.row.updatedAt,candidate);
  assert.equal(result.saved,true,'CAS must actually update native PG');
  let clean=await provider.read();
  assert.equal(clean.row.cards,0);
  assert.equal(clean.row.teams,0);
  assert.equal(clean.row.playerRows,0);
  assert.equal(Number(clean.row.enteredScores),0);
  assert.equal(Number(clean.row.testAliases),0);
  assert.equal(clean.row.stateJsonMd5,await provider.hashState(candidate));
  assert.equal(clean.matrix.queueFingerprint,clean.row.stateJsonMd5);
  assert.equal(clean.matrix.queueStateUpdatedAt,clean.row.updatedAt);
  assert.equal(clean.tagProjectionMatches,true);
  assert.equal(clean.matrix.autoLive,false);
  assert.equal(clean.matrix.cinematicEventCount,1);
  await assert.rejects(provider.compareAndSwap(baseline.row.updatedAt,root),
    /hbnf_cleanup_cas_conflict|guarded CAS failed/,'stale revision cannot overwrite cleanup');

  // Qualify controlled restore only from exact acknowledged cleanup revision.
  result=await provider.compareAndSwap(clean.row.updatedAt,root);
  assert.equal(result.saved,true);
  const restored=await provider.read();
  assert.equal(restored.row.stateJsonMd5,baseline.row.stateJsonMd5);
  assert.equal(restored.matrix.queueFingerprint,restored.row.stateJsonMd5);
  assert.equal(restored.matrix.queueStateUpdatedAt,restored.row.updatedAt);
  assert.equal(restored.tagProjectionMatches,true);
  assert.notEqual(restored.row.updatedAt,baseline.row.updatedAt);

  // Two simultaneous independent PostgreSQL connections compete for one CAS.
  // The row lock + server revision trigger must yield exactly one winner.
  const [a,b]=await Promise.allSettled([
    provider.compareAndSwap(restored.row.updatedAt,candidate),
    provider.compareAndSwap(restored.row.updatedAt,candidate)
  ]);
  const won=[a,b].filter(x=>x.status==='fulfilled'&&x.value.saved===true).length;
  const lost=[a,b].filter(x=>x.status==='rejected'||x.value.saved===false).length;
  assert.equal(won,1,'exactly one concurrent native CAS may win');
  assert.equal(lost,1,'the other concurrent CAS must be fenced');
  const concurrent=await provider.read();
  assert.equal(concurrent.row.stateJsonMd5,await provider.hashState(candidate));
  assert.equal(concurrent.matrix.queueFingerprint,concurrent.row.stateJsonMd5);
  assert.equal(concurrent.matrix.queueStateUpdatedAt,concurrent.row.updatedAt);
  assert.equal((await provider.compareAndSwap(concurrent.row.updatedAt,root)).saved,true);
  const final=await provider.read();
  assert.equal(final.row.stateJsonMd5,baseline.row.stateJsonMd5);
  assert.equal(final.matrix.queueFingerprint,final.row.stateJsonMd5);
  assert.equal(final.matrix.queueStateUpdatedAt,final.row.updatedAt);
  console.log('NATIVE_PG17_CLEANUP=PASS exact schema-trigger family, CAS, stale replay, 2-client concurrency, queue, tag projection, conditional restore');
  console.log('PRODUCTION_WRITES=ZERO PRIVATE_LIVE_DATA=NONE');
});
