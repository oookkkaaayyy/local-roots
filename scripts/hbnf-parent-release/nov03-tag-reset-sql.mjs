// DORA T1. SQL is returned as review-only text; this module has no DB/network
// connection and never executes its own SQL. Only Scoring P0's admitted tag
// owner may use it after the S1 score recovery, with fresh provider baselines.
import {prepareNov3TagSeasonReset} from './nov03-event-source.mjs';

const RESET_ID='hbnf-nov03-season-reset-v1';
const DATE='2026-11-03';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>literal(JSON.stringify(value))+'::jsonb';
const validMd5=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const validDate=value=>typeof value==='string'&&
 /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)&&
 !Number.isNaN(Date.parse(value));
const validReceipt=value=>typeof value==='string'&&value.length>=12&&value.length<=256&&
 /^[A-Za-z0-9_:.\/-]+$/.test(value);
const fail=status=>({status,productionWrite:false});

function statements(body,tag) {
 return ['BEGIN;','DO $'+tag+'$',...body,'$'+tag+';','COMMIT;'].join('\n');
}
const coreOwners=owners=>owners.map(x=>({
 key:String(x.player_key),name:String(x.player_name),tag:Number(x.tag_number)
})).sort((a,b)=>a.tag-b.tag||a.key.localeCompare(b.key));
const coreAvailable=tags=>tags.map(x=>({
 tag:Number(x.tag_number),source:String(x.source),notes:String(x.notes)
})).sort((a,b)=>a.tag-b.tag);

export function prepareNov3AtomicTagReset({
 expectedLeagueUpdatedAt,expectedRootMd5,authorityRevision,
 currentOwners,currentAvailableTags,verifiedBackupReceipt,alreadyFinalized=false
}={}) {
 const existing=prepareNov3TagSeasonReset({authorityRevision,currentOwners,
  currentAvailableTags,alreadyFinalized});
 if(existing.status!=='EXACT_NEW_SEASON_RESET_READY_FOR_SEPARATE_ADMITTED_TRANSACTION')
  return fail(existing.status);
 if(!validDate(expectedLeagueUpdatedAt)||!validMd5(expectedRootMd5))
  return fail('FRESH_EXACT_LEAGUE_STATE_REVISION_AND_MD5_REQUIRED');
 if(!validReceipt(verifiedBackupReceipt))
  return fail('VERIFIED_DURABLE_PREIMAGE_BACKUP_RECEIPT_REQUIRED');
 const origOwners=coreOwners(currentOwners),origAvailable=coreAvailable(currentAvailableTags);
 // Exact DB schema and trigger path observed in public Supabase on Nov4.
 // Readback must still reverify this fingerprint after S1 before admission.
 const sql=statements([
 'DECLARE',
 ' v_state jsonb; v_updated timestamptz; v_revision bigint;',
 ' v_owners jsonb; v_available jsonb; v_full_owners jsonb; v_full_available jsonb;',
 ' v_archive jsonb; v_next jsonb; v_after jsonb;',
 'BEGIN',
 ' SELECT state_json,updated_at INTO STRICT v_state,v_updated FROM public.league_state WHERE id=1 FOR UPDATE;',
 ' SELECT revision INTO STRICT v_revision FROM public.hbnf_tag_authority_state WHERE id=1 FOR UPDATE;',
 ' LOCK TABLE public.hbnf_current_tag_entries,public.hbnf_current_available_tags IN SHARE ROW EXCLUSIVE MODE;',
 ' IF v_updated IS DISTINCT FROM '+literal(expectedLeagueUpdatedAt)+'::timestamptz OR',
 '    md5(v_state::text) IS DISTINCT FROM '+literal(expectedRootMd5)+' OR',
 '    v_revision IS DISTINCT FROM 9 THEN RAISE EXCEPTION '+literal('T1_ROOT_OR_TAG_REVISION_CONFLICT')+'; END IF;',
 ' IF coalesce((SELECT auto_live FROM public.hbnf_matrix_control_state WHERE id=1),true)',
 '    THEN RAISE EXCEPTION '+literal('T1_MATRIX_AUTO_LIVE_REQUIRES_COORDINATED_REVIEW')+'; END IF;',
 ' IF EXISTS(SELECT 1 FROM public.hbnf_round_tag_finalizations WHERE round_date>=DATE '+literal(DATE)+') OR',
 '    EXISTS(SELECT 1 FROM public.hbnf_round_tag_entries WHERE round_date>=DATE '+literal(DATE)+')',
 '    THEN RAISE EXCEPTION '+literal('T1_NEW_SEASON_ALREADY_HAS_TAG_ACTIVITY')+'; END IF;',
 ' IF v_state#>'+literal('{bagTags,seasonResetAudit,2026-11-03}')+' IS NOT NULL OR',
 '    v_state#>'+literal('{bagTags,seasonStartDate}')+' IS NOT NULL',
 '    THEN RAISE EXCEPTION '+literal('T1_SEASON_RESET_ALREADY_STARTED_OR_REPLAY')+'; END IF;',
 ' SELECT coalesce(jsonb_agg(jsonb_build_object('+literal('key')+',player_key,'+literal('name')+',player_name,'+literal('tag')+',tag_number) ORDER BY tag_number,player_key),'+literal('[]')+'::jsonb),',
 '        coalesce(jsonb_agg(to_jsonb(e) ORDER BY tag_number,player_key),'+literal('[]')+'::jsonb)',
 '   INTO v_owners,v_full_owners FROM public.hbnf_current_tag_entries e;',
 ' SELECT coalesce(jsonb_agg(jsonb_build_object('+literal('tag')+',tag_number,'+literal('source')+',source,'+literal('notes')+',notes) ORDER BY tag_number),'+literal('[]')+'::jsonb),',
 '        coalesce(jsonb_agg(to_jsonb(a) ORDER BY tag_number),'+literal('[]')+'::jsonb)',
 '   INTO v_available,v_full_available FROM public.hbnf_current_available_tags a;',
 ' IF v_owners IS DISTINCT FROM '+json(origOwners)+' OR v_available IS DISTINCT FROM '+json(origAvailable),
 '    THEN RAISE EXCEPTION '+literal('T1_EXACT_OLD_TAG_OWNERS_OR_AVAILABLE_14_CHANGED')+'; END IF;',
 ' v_archive=jsonb_build_object('+literal('id')+','+literal(RESET_ID)+','+literal('effectiveDate')+','+literal(DATE)+',',
 '   '+literal('priorAuthorityRevision')+',v_revision,'+literal('priorRootUpdatedAt')+',v_updated::text,',
 '   '+literal('priorRootMd5')+',md5(v_state::text),',
 '   '+literal('durableBackupReceipt')+','+literal(verifiedBackupReceipt)+',',
 '   '+literal('priorOwners')+',v_full_owners,'+literal('priorAvailableTags')+',v_full_available,',
 '   '+literal('priorBagTags')+',v_state->'+literal('bagTags')+');',
 ' DELETE FROM public.hbnf_current_tag_entries;',
 ' DELETE FROM public.hbnf_current_available_tags;',
 ' INSERT INTO public.hbnf_current_tag_entries(player_key,player_name,tag_number,updated_at)',
 ' VALUES ('+literal('matt')+','+literal('Matt')+',1,clock_timestamp()),',
 '        ('+literal('jason')+','+literal('Jason')+',2,clock_timestamp()),',
 '        ('+literal('andrew')+','+literal('Andrew')+',3,clock_timestamp());',
 ' v_next=jsonb_set(v_state,'+literal('{bagTags,seasonResetAudit}')+',jsonb_build_object('+literal(DATE)+',v_archive),true);',
 ' v_next=jsonb_set(v_next,'+literal('{bagTags,seasonStartDate}')+',to_jsonb('+literal(DATE)+'::text),true);',
 ' UPDATE public.league_state SET state_json=v_next WHERE id=1 AND updated_at=v_updated RETURNING state_json INTO v_after;',
 ' IF NOT FOUND THEN RAISE EXCEPTION '+literal('T1_LEAGUE_CAS_MISSED')+'; END IF;',
 ' IF v_after->'+literal('glow')+' IS DISTINCT FROM v_state->'+literal('glow')+' OR',
 '    v_after->'+literal('skins')+' IS DISTINCT FROM v_state->'+literal('skins')+' OR',
 '    v_after->'+literal('__backups')+' IS DISTINCT FROM v_state->'+literal('__backups'),
 '    THEN RAISE EXCEPTION '+literal('T1_UNRELATED_SCORING_HISTORY_CHANGED')+'; END IF;',
 ' IF v_after#>'+literal('{bagTags,players}')+' IS DISTINCT FROM '+json([
  {tag:1,name:'Matt'},{tag:2,name:'Jason'},{tag:3,name:'Andrew'}
 ])+' OR',
 '    v_after#>'+literal('{bagTags,manual}')+' IS DISTINCT FROM '+json({Matt:1,Jason:2,Andrew:3})+' OR',
 '    v_after#>>'+literal('{bagTags,seasonStartDate}')+' IS DISTINCT FROM '+literal(DATE),
 '    THEN RAISE EXCEPTION '+literal('T1_CANONICAL_MIRROR_MISMATCH')+'; END IF;',
 ' IF (SELECT count(*) FROM public.hbnf_current_available_tags)<>0',
 '    THEN RAISE EXCEPTION '+literal('T1_OLD_AVAILABLE_14_STILL_PRESENT')+'; END IF;',
 ' UPDATE public.hbnf_tag_authority_state SET revision=revision+1,updated_at=clock_timestamp()',
 '  WHERE id=1 AND revision=9;',
 ' IF NOT FOUND THEN RAISE EXCEPTION '+literal('T1_TAG_REVISION_UPDATE_CONFLICT')+'; END IF;',
 'END;'
 ],'hbnf_t1_reset');
 return {
  status:'REVIEW_ONLY_SQL_PREPARED_NOT_ADMITTED',
  transactionId:RESET_ID,effectiveDate:DATE,
  expectedLeagueUpdatedAt,expectedRootMd5,expectedAuthorityRevision:9,
  previousOwners:origOwners,previousAvailable:origAvailable,
  proposedOwners:existing.proposedCurrentOwners,proposedAvailable:[],
  preservesPriorRounds:true,requiresFreshPostS1Readback:true,productionWrite:false,
  expectedPostConditions:{
   authorityRevision:10,seasonStartDate:DATE,
   owners:[['Matt',1],['Jason',2],['Andrew',3]],available:[],
   oldRoundFinalizationsUnchanged:true,glowAndSkinsUnchanged:true
  },
  applySql:sql,
  acceptance:'NO EXECUTION until original same-manifest admission, verified preimage download-back and tag owner coordination; after commit independently GET both tag tables, league_state.mirrors, separate fresh iPhone current tags and prior history.'
 };
}

// Recovery for an ALREADY COMMITTED reset. Within the apply transaction, any
// error rolls back to original revision9 automatically. A later authorized undo
// increments the tag revision monotonically (10->11) instead of rewinding it,
// preserving stale-client CAS safety. No score or other branch is replaced.
export function prepareNov3TagResetUndo({
 expectedLeagueUpdatedAt,expectedRootMd5,expectedAuthorityRevision
}={}) {
 if(!validDate(expectedLeagueUpdatedAt)||!validMd5(expectedRootMd5)||
    !Number.isSafeInteger(expectedAuthorityRevision)||expectedAuthorityRevision<10)
  return fail('VERIFIED_EXACT_POST_RESET_PREIMAGE_REQUIRED_FOR_UNDO');
 const sql=statements([
 'DECLARE',
 ' v_state jsonb; v_updated timestamptz; v_revision bigint;',
 ' v_archive jsonb; v_before jsonb; v_after jsonb; v_owners jsonb;',
 'BEGIN',
 ' SELECT state_json,updated_at INTO STRICT v_state,v_updated FROM public.league_state WHERE id=1 FOR UPDATE;',
 ' SELECT revision INTO STRICT v_revision FROM public.hbnf_tag_authority_state WHERE id=1 FOR UPDATE;',
 ' LOCK TABLE public.hbnf_current_tag_entries,public.hbnf_current_available_tags IN SHARE ROW EXCLUSIVE MODE;',
 ' IF v_updated IS DISTINCT FROM '+literal(expectedLeagueUpdatedAt)+'::timestamptz OR',
 '    md5(v_state::text) IS DISTINCT FROM '+literal(expectedRootMd5)+' OR',
 '    v_revision IS DISTINCT FROM '+expectedAuthorityRevision,
 '    THEN RAISE EXCEPTION '+literal('T1_UNDO_POSTIMAGE_CHANGED')+'; END IF;',
 ' IF coalesce((SELECT auto_live FROM public.hbnf_matrix_control_state WHERE id=1),true)',
 '    THEN RAISE EXCEPTION '+literal('T1_UNDO_MATRIX_AUTO_LIVE_REVIEW_REQUIRED')+'; END IF;',
 ' v_archive=v_state#>'+literal('{bagTags,seasonResetAudit,2026-11-03}')+';',
 ' IF v_archive IS NULL OR v_archive->>'+literal('id')+' IS DISTINCT FROM '+literal(RESET_ID)+' OR',
 '    jsonb_typeof(v_archive->'+literal('priorOwners')+') IS DISTINCT FROM '+literal('array')+' OR',
 '    jsonb_typeof(v_archive->'+literal('priorAvailableTags')+') IS DISTINCT FROM '+literal('array')+' OR',
 '    jsonb_typeof(v_archive->'+literal('priorBagTags')+') IS DISTINCT FROM '+literal('object'),
 '    THEN RAISE EXCEPTION '+literal('T1_UNDO_ARCHIVE_MISSING_OR_INVALID')+'; END IF;',
 ' SELECT coalesce(jsonb_agg(jsonb_build_object('+literal('key')+',player_key,'+literal('name')+',player_name,'+literal('tag')+',tag_number) ORDER BY tag_number),'+literal('[]')+'::jsonb)',
 '    INTO v_owners FROM public.hbnf_current_tag_entries;',
 ' IF v_owners IS DISTINCT FROM '+json([{key:'matt',name:'Matt',tag:1},{key:'jason',name:'Jason',tag:2},{key:'andrew',name:'Andrew',tag:3}])+' OR',
 '    EXISTS(SELECT 1 FROM public.hbnf_current_available_tags)',
 '    THEN RAISE EXCEPTION '+literal('T1_UNDO_CANONICAL_TAG_DRIFT')+'; END IF;',
 ' DELETE FROM public.hbnf_current_tag_entries;',
 ' DELETE FROM public.hbnf_current_available_tags;',
 ' INSERT INTO public.hbnf_current_tag_entries(player_key,player_name,tag_number,updated_at)',
 ' SELECT player_key,player_name,tag_number,updated_at',
 ' FROM jsonb_to_recordset(v_archive->'+literal('priorOwners')+') AS old(',
 '  player_key text,player_name text,tag_number integer,updated_at timestamptz);',
 ' INSERT INTO public.hbnf_current_available_tags(tag_number,source,notes,updated_at)',
 ' SELECT tag_number,source,notes,updated_at',
 ' FROM jsonb_to_recordset(v_archive->'+literal('priorAvailableTags')+') AS old(',
 '  tag_number integer,source text,notes text,updated_at timestamptz);',
 ' v_before=jsonb_set(v_state,'+literal('{bagTags}')+',v_archive->'+literal('priorBagTags')+',true);',
 ' UPDATE public.league_state SET state_json=v_before WHERE id=1 AND updated_at=v_updated RETURNING state_json INTO v_after;',
 ' IF NOT FOUND OR v_after->'+literal('glow')+' IS DISTINCT FROM v_state->'+literal('glow')+' OR',
 '    v_after->'+literal('skins')+' IS DISTINCT FROM v_state->'+literal('skins'),
 '    THEN RAISE EXCEPTION '+literal('T1_UNDO_SCORE_BRANCH_DRIFT')+'; END IF;',
 ' IF v_after->'+literal('bagTags')+' IS DISTINCT FROM v_archive->'+literal('priorBagTags'),
 '    THEN RAISE EXCEPTION '+literal('T1_UNDO_MIRROR_DIFFERENCE')+'; END IF;',
 ' UPDATE public.hbnf_tag_authority_state SET revision=revision+1,updated_at=clock_timestamp()',
 '  WHERE id=1 AND revision='+expectedAuthorityRevision+';',
 ' IF NOT FOUND THEN RAISE EXCEPTION '+literal('T1_UNDO_TAG_REVISION_CONFLICT')+'; END IF;',
 'END;'
 ],'hbnf_t1_undo');
 return {status:'REVIEW_ONLY_UNDO_SQL_PREPARED_NOT_ADMITTED',
  transactionId:RESET_ID,expectedAuthorityRevision:expectedAuthorityRevision,
  expectedLeagueUpdatedAt,expectedRootMd5,productionWrite:false,
  undoSql:sql,
  acceptance:'Requires independently verified POST-reset updated_at/root MD5/authority revision, same original recovery manifest, tag owner admission and fresh post-undo provider/UI readback.'
 };
}
