import test from 'node:test';
import assert from 'node:assert/strict';
import {rebindHistoricalSql} from '../scripts/hbnf-parent-release/rebind-historical-review-sql.mjs';

const root={glow:{weeks:{'2026-11-03':{players:[
 {name:'Fox / Jason',scores:[...Array(12).fill('3'),...Array(6).fill('2')]},
 {name:'Andrew / Matt',scores:[...Array(17).fill('3'),'1']},
 {name:'Kyle / Dylan',scores:[...Array(17).fill('3'),'1']},
 {name:'Karl / Tony Howell',scores:[...Array(17).fill('3'),'6']}],udiscSync:{latest:{rows:[{},{},{},{}]}}}}}};
const snapshot={state_json:root,updated_at:'2026-11-06T08:00:00+00:00',tagAuthorityRevision:11,
 nov03GlowFinalizations:1,matrixAutoLive:false};
const hashes={rootMd5:'11111111111111111111111111111111',targetMd5:'d211577dffb13ed572ba12c9e9265537',
 targetPresent:true,updatedAtSqlLiteral:'2026-11-06 08:00:00+00'};
const sql=`IF v_updated IS DISTINCT FROM '2026-11-05 08:18:41.788058+00'::timestamptz
 THEN RAISE EXCEPTION 'HBNF_OCT27_SCORING_CAS_OR_HISTORY_FENCE_FAILED'; END IF;
 OR md5(v_state::text) IS DISTINCT FROM '58f2015ef01268d2d00842298e67c390'
 OR md5((v_state#>'{skins,weeks,2026-10-27}')::text) IS DISTINCT FROM 'd211577dffb13ed572ba12c9e9265537'
 WHERE id=1 AND updated_at=v_updated AND md5(state_json::text)='58f2015ef01268d2d00842298e67c390'`;

test('serial historical rebind updates only the global root CAS pair and preserves Nov 3 fences',async()=>{
 const result=rebindHistoricalSql({kind:'oct27',sql,snapshot,pgHashes:hashes});
 assert.match(result.sql,/2026-11-06 08:00:00\+00/);
 assert.match(result.sql,/11111111111111111111111111111111/);
 assert.match(result.sql,/d211577dffb13ed572ba12c9e9265537/);
 assert.equal(result.receipt.productionWrite,false);
 assert.equal(result.receipt.admission,'NOT_ADMITTED');
});

test('rebind refuses stale Nov 3 scores, tag revision, target hashes and missing root digest',async()=>{
 assert.throws(()=>rebindHistoricalSql({kind:'oct27',sql,snapshot:{...snapshot,tagAuthorityRevision:10},pgHashes:hashes}),/TAG_OR_MATRIX_FENCE/);
 assert.throws(()=>rebindHistoricalSql({kind:'oct27',sql,snapshot,pgHashes:{...hashes,targetMd5:'0'.repeat(32)}}),/TARGET_PATH_POSTGRES_MD5/);
 assert.throws(()=>rebindHistoricalSql({kind:'oct27',sql,snapshot,pgHashes:{...hashes,rootMd5:undefined}}),/POSTGRES_JSONB_ROOT_MD5/);
 assert.throws(()=>rebindHistoricalSql({kind:'oct27',sql:sql.replace('HBNF_OCT27_SCORING_CAS_OR_HISTORY_FENCE_FAILED','OTHER'),snapshot,pgHashes:hashes}),/UNRECOGNIZED_PRIVATE_SQL_CANDIDATE/);
});
