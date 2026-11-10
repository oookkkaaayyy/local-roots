// Actual native PostgreSQL 17 syntax + transaction test, disposable container only.
// Does NOT connect to Supabase, use secrets, mutate production, or admit a release.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {prepareNov3AtomicTagReset,prepareNov3TagResetUndo} from '../scripts/hbnf-parent-release/nov03-tag-reset-sql.mjs';
import {prepareNov3OwnerFinalTagExchange,prepareNov3OwnerFinalTagUndo} from '../scripts/hbnf-parent-release/nov03-final-tag-exchange-sql.mjs';

const cid=process.env.HBNF_TEST_PG_CID;
if(!cid||!/^[0-9a-f]{12,64}$/.test(cid))
 throw new Error('T1_T2_ISOLATED_DOCKER_PG17_CONTAINER_REQUIRED');
const psql=sql=>execFileSync('docker',
 ['exec','-i',cid,'psql','-X','-A','-t','-U','postgres','-v','ON_ERROR_STOP=1'],
 {input:sql,encoding:'utf8',maxBuffer:4*1024*1024,timeout:30000,stdio:['pipe','pipe','pipe']});
const query=sql=>psql(sql).trim().split('\n').at(-1);
const assertDB=(statement,label)=>{
 try{psql('DO $test$ BEGIN IF NOT ('+statement+') THEN RAISE EXCEPTION '+
 "'"+label.replaceAll("'","''")+"'"+'; END IF; END $test$;');}
 catch(e){throw new Error(label+': '+String(e.stderr||e.message).slice(-2000));}
};
const mustReject=(sql,marker)=>{
 let rejected=false;
 try{psql(sql);}
 catch(e){
  const err=String(e.stderr||e.message);
  if(!err.includes(marker))throw new Error('Wrong SQL failure expected '+marker+': '+err.slice(-1800));
  rejected=true;
 }
 assert.equal(rejected,true,'Expected PostgreSQL transaction rejection: '+marker);
};
const snapshot=()=>{
 const value=query("SELECT updated_at::text||'|'||md5(state_json::text) FROM public.league_state WHERE id=1;");
 const [expectedLeagueUpdatedAt,expectedRootMd5]=value.split('|');
 assert.ok(expectedRootMd5?.match(/^[0-9a-f]{32}$/));
 return {expectedLeagueUpdatedAt,expectedRootMd5};
};
const sourcePre=fs.readFileSync(new URL('./hbnf-t1-t2-native-pg17-pre.sql',import.meta.url),'utf8');
const oldOwners=[
 ['rusty','Rusty',1],['andrew','Andrew',2],['fox','Fox',5],
 ['jason','Jason',6],['quiotee','Quiotee',7],['dylan','Dylan',8],
 ['matt','Matt',10],['karl','Karl',15],['danny','Danny',16]
].map(([player_key,player_name,tag_number])=>({player_key,player_name,tag_number}));
const oldAvailable=[{tag_number:14,source:'Manual correction',
 notes:'Released by manual tag update',updated_at:'2026-10-28T00:51:11.782725Z'}];
const seed=[
 {player_key:'matt',player_name:'Matt',tag_number:1},
 {player_key:'jason',player_name:'Jason',tag_number:2},
 {player_key:'andrew',player_name:'Andrew',tag_number:3}
];
const shared={verifiedBackupReceipt:'ephemeral-verified-fixture-downloadback-not-live'};
const t1=({expectedLeagueUpdatedAt,expectedRootMd5})=>prepareNov3AtomicTagReset({
 expectedLeagueUpdatedAt,expectedRootMd5,authorityRevision:9,
 currentOwners:oldOwners,currentAvailableTags:oldAvailable,...shared,
 verifiedS1Receipt:'ephemeral-only-S1-4x18-source-readback'
});
const t2=({expectedLeagueUpdatedAt,expectedRootMd5})=>prepareNov3OwnerFinalTagExchange({
 expectedLeagueUpdatedAt,expectedRootMd5,authorityRevision:10,
 currentOwners:seed,currentAvailableTags:[],
 verifiedS1Receipt:'ephemeral-only-S1-4x18-source-readback',
 verifiedT1Receipt:'ephemeral-only-T1-rev10-tags-readback',
 ...shared
});
const origSchema=()=>psql(sourcePre);

// First, fail closed when genuine S1 results have NOT replaced QI rehearsals.
// The baseline used here is the identical scratch schema/native functions, never live.
origSchema();
psql("UPDATE public.league_state SET state_json=jsonb_set(state_json,'{glow,weeks,2026-11-03,players}','[{\"id\":\"QI_1\",\"scores\":[\"2\"]},{\"id\":\"QI_2\",\"scores\":[\"2\"]},{\"id\":\"QI_3\",\"scores\":[\"2\"]}]'::jsonb,false) WHERE id=1;");
const early=t1(snapshot());
assert.equal(early.productionWrite,false);
assert.ok(early.applySql,'Source must produce guardable SQL for rejected pre-S1 input');
const beforeRejected=query("SELECT md5(state_json::text) FROM public.league_state WHERE id=1;");
mustReject(early.applySql,'T1_REQUIRES_VERIFIED_S1_FOUR_TEAM_SCORE_SOURCE');
assert.equal(query("SELECT md5(state_json::text) FROM public.league_state WHERE id=1;"),beforeRejected);
assert.equal(query("SELECT revision FROM public.hbnf_tag_authority_state WHERE id=1;"),'9');
console.log('PASS T1 rejects QI pre-S1 input and leaves all writes rolled back');

origSchema();
const pre=snapshot();
const t1Candidate=t1(pre);
assert.equal(t1Candidate.status,'REVIEW_ONLY_SQL_PREPARED_NOT_ADMITTED');
assert.equal(t1Candidate.productionWrite,false);
mustReject(t1({...pre,expectedRootMd5:'f'.repeat(32)}).applySql,'T1_ROOT_OR_TAG_REVISION_CONFLICT');
psql(t1Candidate.applySql);
assertDB("(SELECT revision FROM public.hbnf_tag_authority_state WHERE id=1)=10",'T1_AUTH_REV10');
assertDB("(SELECT count(*) FROM public.hbnf_current_tag_entries)=3",'T1_ALL_OLD_HOLDERS_REMOVED');
assertDB("(SELECT count(*) FROM public.hbnf_current_available_tags)=0",'T1_AVAILABLE_14_CLEARED');
assertDB("(SELECT state_json#>>'{bagTags,seasonStartDate}' FROM public.league_state WHERE id=1)='2026-11-03'",'T1_SEASON_DATE');
assertDB("(SELECT jsonb_array_length(state_json#>'{bagTags,seasonResetAudit,2026-11-03,priorOwners}') FROM public.league_state WHERE id=1)=9",'T1_ARCHIVE_NINE');
assertDB("(SELECT jsonb_array_length(state_json#>'{bagTags,seasonResetAudit,2026-11-03,priorAvailableTags}') FROM public.league_state WHERE id=1)=1",'T1_ARCHIVE_AVAILABLE_14');
assertDB("(SELECT state_json->'glow' FROM public.league_state WHERE id=1) IS NOT DISTINCT FROM (SELECT old_root->'glow' FROM public.hbnf_pg17_fixture_baseline)",'T1_GLOW_UNCHANGED');
assertDB("(SELECT state_json->'skins' FROM public.league_state WHERE id=1) IS NOT DISTINCT FROM (SELECT old_root->'skins' FROM public.hbnf_pg17_fixture_baseline)",'T1_SKINS_UNCHANGED');
console.log('PASS T1 atomic commit, original nine-owner/#14 archival, rev10 and pre-round mirrors');

const afterT1=snapshot();
const t2Candidate=t2(afterT1);
assert.equal(t2Candidate.status,'REVIEW_ONLY_T2_NATIVE_FINALIZATION_SQL_NOT_ADMITTED');
assert.equal(t2Candidate.productionWrite,false);
mustReject(t2({...afterT1,expectedRootMd5:'f'.repeat(32)}).applySql,'T2_ROOT_OR_TAG_REVISION_CONFLICT');
psql(t2Candidate.applySql);
assertDB("(SELECT revision FROM public.hbnf_tag_authority_state WHERE id=1)=11",'T2_AUTH_REV11');
assertDB("(SELECT count(*) FROM public.hbnf_current_tag_entries)=8",'T2_EIGHT_TAG_HOLDERS');
assertDB("(SELECT count(*) FROM public.hbnf_current_available_tags)=0",'T2_EMPTY_AVAILABLE');
assertDB("(SELECT count(*) FROM public.hbnf_round_tag_finalizations WHERE round_date='2026-11-03' AND event_type='glow')=1",'T2_NATIVE_GLOW_FINALIZATION');
assertDB("(SELECT jsonb_array_length(assignments) FROM public.hbnf_round_tag_finalizations WHERE round_date='2026-11-03' AND event_type='glow')=8",'T2_EIGHT_FINALIZATIONS');
assertDB("(SELECT state_json#>'{bagTags,manual}' FROM public.league_state WHERE id=1) IS NOT DISTINCT FROM '{\"Jason\":1,\"Fox\":2,\"Matt\":3,\"Andrew\":4,\"Dylan\":5,\"Kyle\":6,\"Tony\":7,\"Karl\":8}'::jsonb",'T2_EXACT_EIGHT_MIRROR');
assertDB("(SELECT state_json#>>'{bagTags,seasonFinalExchangeAudit,2026-11-03,id}' FROM public.league_state WHERE id=1)='hbnf-nov03-owner-final-tags-v1'",'T2_OWNER_RECEIPT');
assertDB("(SELECT state_json->'glow' FROM public.league_state WHERE id=1) IS NOT DISTINCT FROM (SELECT old_root->'glow' FROM public.hbnf_pg17_fixture_baseline)",'T2_GLOW_UNCHANGED');
assertDB("(SELECT count(*) FROM public.hbnf_round_tag_finalizations)=2",'T2_PRESERVE_OCT20_FINALIZATION');
assertDB("(SELECT count(*) FROM public.hbnf_round_tag_entries)=(SELECT old_entries_count FROM public.hbnf_pg17_fixture_baseline)",'T2_PRESERVE_OLD_ENTRIES');
console.log('PASS T2 native PostgreSQL Glow finalization, eight exact owners, rev11, mirrors/history');

const afterT2=snapshot();
mustReject(t2Candidate.applySql,'T2_ROOT_OR_TAG_REVISION_CONFLICT');
assert.equal(snapshot().expectedRootMd5,afterT2.expectedRootMd5,'T2 retry did not mutate root');

const t2Undo=prepareNov3OwnerFinalTagUndo({...afterT2,authorityRevision:11});
assert.equal(t2Undo.status,'REVIEW_ONLY_T2_GUARDED_UNDO_NOT_ADMITTED');
mustReject(prepareNov3OwnerFinalTagUndo({...afterT2,expectedRootMd5:'f'.repeat(32),authorityRevision:11}).undoSql,
 'T2_UNDO_REVISION_IDENTITY_OR_ARCHIVE_CONFLICT');
psql(t2Undo.undoSql);
assertDB("(SELECT revision FROM public.hbnf_tag_authority_state WHERE id=1)=12",'T2_UNDO_MONOTONIC_REV12');
assertDB("(SELECT count(*) FROM public.hbnf_current_tag_entries)=3",'T2_UNDO_THREE_SEED');
assertDB("(SELECT count(*) FROM public.hbnf_round_tag_finalizations WHERE round_date='2026-11-03')=0",'T2_UNDO_REMOVE_ONLY_NEW_FINALIZATION');
assertDB("(SELECT state_json#>'{bagTags,manual}' FROM public.league_state WHERE id=1) IS NOT DISTINCT FROM '{\"Matt\":1,\"Jason\":2,\"Andrew\":3}'::jsonb",'T2_UNDO_SEED_MIRROR');
assertDB("(SELECT latest_finalized_round FROM public.hbnf_tag_authority_state WHERE id=1)='2026-10-20'::date",'T2_UNDO_PRIOR_HISTORY');
console.log('PASS guarded T2 postcommit undo and monotonic rev12');

const afterT2Undo=snapshot();
const t1Undo=prepareNov3TagResetUndo({...afterT2Undo,expectedAuthorityRevision:12});
assert.equal(t1Undo.status,'REVIEW_ONLY_UNDO_SQL_PREPARED_NOT_ADMITTED');
psql(t1Undo.undoSql);
assertDB("(SELECT revision FROM public.hbnf_tag_authority_state WHERE id=1)=13",'T1_UNDO_MONOTONIC_REV13');
assertDB("(SELECT count(*) FROM public.hbnf_current_tag_entries)=9",'T1_UNDO_NINE_OLD');
assertDB("(SELECT tag_number FROM public.hbnf_current_available_tags LIMIT 1)=14",'T1_UNDO_RESTORE_AVAILABLE_14');
assertDB("(SELECT state_json FROM public.league_state WHERE id=1) IS NOT DISTINCT FROM (SELECT old_root FROM public.hbnf_pg17_fixture_baseline)",'T1_EXACT_OLD_ROOT_RESTORED');
assertDB("(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.tag_number) FROM public.hbnf_current_tag_entries e) IS NOT DISTINCT FROM (SELECT old_owners FROM public.hbnf_pg17_fixture_baseline)",'T1_EXACT_OLD_TAG_ROWS_RESTORED');
assertDB("(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.tag_number) FROM public.hbnf_current_available_tags a) IS NOT DISTINCT FROM (SELECT old_available FROM public.hbnf_pg17_fixture_baseline)",'T1_EXACT_AVAILABLE_ROW_RESTORED');
assertDB("(SELECT count(*) FROM public.hbnf_round_tag_finalizations)=(SELECT old_finalizations_count FROM public.hbnf_pg17_fixture_baseline)",'T1_PRESERVE_HISTORY');
console.log('PASS guarded T1 postcommit undo, full exact root/owners/available restoration, monotonic rev13');
console.log('T1_T2_PG17_NATIVE_ISOLATED_APPLY_AND_BOTH_UNDOS_PASS');
