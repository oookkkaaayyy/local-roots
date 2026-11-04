// DORA T2: review-only Nov03 owner-confirmed final bag-tag exchange.
// This module returns SQL and has no DB client or production write capability.
// Invoke only in existing Scoring P0 / tag source-owner admission AFTER S1 and T1.
export const NOV3_FINAL_TAGS=Object.freeze([
 {player_key:'jason',player_name:'Jason',tag_number:1},
 {player_key:'fox',player_name:'Fox',tag_number:2},
 {player_key:'matt',player_name:'Matt',tag_number:3},
 {player_key:'andrew',player_name:'Andrew',tag_number:4},
 {player_key:'dylan',player_name:'Dylan',tag_number:5},
 {player_key:'kyle',player_name:'Kyle',tag_number:6},
 {player_key:'tony',player_name:'Tony',tag_number:7},
 {player_key:'karl',player_name:'Karl',tag_number:8}
]);
const SEED=Object.freeze([
 {player_key:'matt',player_name:'Matt',tag_number:1},
 {player_key:'jason',player_name:'Jason',tag_number:2},
 {player_key:'andrew',player_name:'Andrew',tag_number:3}
]);
const DAY='2026-11-03';
const T2_ID='hbnf-nov03-owner-final-tags-v1';
const L=x=>"'"+String(x).replaceAll("'","''")+"'";
const J=x=>L(JSON.stringify(x))+'::jsonb';
const isMD5=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const isDate=x=>typeof x==='string'&&
 /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(x)&&
 Number.isFinite(Date.parse(x));
const isReceipt=x=>typeof x==='string'&&x.length>=12&&x.length<=256&&/^[A-Za-z0-9_:./-]+$/.test(x);
const denied=status=>({status,productionWrite:false});
const sqlBlock=(tag,body)=>['BEGIN;','DO $'+tag+'$',...body,'$'+tag+'$;','COMMIT;'].join('\n');
const sorted=rows=>rows.map(r=>({
 player_key:r.player_key,player_name:r.player_name,tag_number:r.tag_number
})).sort((a,b)=>a.tag_number-b.tag_number);
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const expectedFinal=NOV3_FINAL_TAGS.map(r=>({name:r.player_name,tag:r.tag_number}));
const expectedSeed=SEED.map(r=>({name:r.player_name,tag:r.tag_number}));
const finalAssignments=NOV3_FINAL_TAGS.map(r=>({...r,status:'confirmed'}));

export function prepareNov3OwnerFinalTagExchange({
 expectedLeagueUpdatedAt,expectedRootMd5,authorityRevision,currentOwners,
 currentAvailableTags,verifiedS1Receipt,verifiedT1Receipt,
 verifiedBackupReceipt,existingRoundEntries=0,existingGlowFinalization=false
}={}) {
 if(authorityRevision!==10||!Array.isArray(currentOwners)||!same(currentOwners,SEED)||
    !Array.isArray(currentAvailableTags)||currentAvailableTags.length)
  return denied('T2_REQUIRES_EXACT_POST_T1_THREE_SEED_CANONICAL_STATE_REV10');
 if(existingRoundEntries!==0||existingGlowFinalization)
  return denied('T2_EXISTING_NOV3_TAG_ACTIVITY_REQUIRES_ADJUDICATION');
 if(!isDate(expectedLeagueUpdatedAt)||!isMD5(expectedRootMd5))
  return denied('T2_FRESH_POST_T1_LEAGUE_STATE_REVISION_AND_HASH_REQUIRED');
 if(!isReceipt(verifiedS1Receipt)||!isReceipt(verifiedT1Receipt)||!isReceipt(verifiedBackupReceipt))
  return denied('T2_SOURCE_BOUND_S1_T1_BACKUP_RECEIPTS_REQUIRED');
 // Native PostgreSQL source confirmed in the provider:
 // public.hbnf_finalize_round_tags_v3(date,text,jsonb,jsonb,uuid,bigint,bigint).
 // It creates canonical Glow finalization, updates holder tables, and rev 10->11.
 // It DOES NOT mirror to league_state. The same locked SQL transaction therefore
 // performs one root update, using the installed BEFORE projection trigger.
 const body=[
 'DECLARE',
 ' v_root jsonb; v_updated timestamptz; v_authority public.hbnf_tag_authority_state%rowtype;',
 ' v_before_owners jsonb; v_before_available jsonb; v_reply jsonb; v_after jsonb;',
 ' v_final_owners jsonb; v_final_available jsonb; v_ledger jsonb; v_newroot jsonb;',
 ' v_final public.hbnf_round_tag_finalizations%rowtype;',
 ' v_week jsonb; v_scores integer[];',
 'BEGIN',
 ' SELECT state_json,updated_at INTO STRICT v_root,v_updated FROM public.league_state WHERE id=1 FOR UPDATE;',
 ' SELECT * INTO STRICT v_authority FROM public.hbnf_tag_authority_state WHERE id=1 FOR UPDATE;',
 ' LOCK TABLE public.hbnf_current_tag_entries,public.hbnf_current_available_tags IN SHARE ROW EXCLUSIVE MODE;',
 ' IF v_updated IS DISTINCT FROM '+L(expectedLeagueUpdatedAt)+'::timestamptz OR',
 '    md5(v_root::text) IS DISTINCT FROM '+L(expectedRootMd5)+' OR',
 '    v_authority.revision IS DISTINCT FROM 10',
 '    THEN RAISE EXCEPTION '+L('T2_ROOT_OR_TAG_REVISION_CONFLICT')+'; END IF;',
 ' IF coalesce((SELECT auto_live FROM public.hbnf_matrix_control_state WHERE id=1),true)',
 '    THEN RAISE EXCEPTION '+L('T2_CART_AUTO_LIVE_NOT_QUALIFIED')+'; END IF;',
 ' IF v_root#>>'+L('{bagTags,seasonStartDate}')+' IS DISTINCT FROM '+L(DAY)+' OR',
 '    v_root#>>'+L('{bagTags,seasonResetAudit,2026-11-03,id}')+
 ' IS DISTINCT FROM '+L('hbnf-nov03-season-reset-v1')+' OR',
 '    v_root#>'+L('{bagTags,seasonFinalExchangeAudit,2026-11-03}')+' IS NOT NULL',
 '    THEN RAISE EXCEPTION '+L('T2_T1_SEASON_ARCHIVE_MISSING_OR_REPLAY')+'; END IF;',
 ' IF EXISTS(SELECT 1 FROM public.hbnf_round_tag_entries WHERE round_date=DATE '+L(DAY)+
 ' AND event_type='+L('glow')+') OR',
 '    EXISTS(SELECT 1 FROM public.hbnf_round_tag_finalizations WHERE round_date=DATE '+L(DAY)+
 ' AND event_type='+L('glow')+')',
 '    THEN RAISE EXCEPTION '+L('T2_GLOW_ROUND_TAG_ACTIVITY_ALREADY_EXISTS')+'; END IF;',
 ' SELECT coalesce(jsonb_agg(jsonb_build_object('+L('name')+',player_name,'+
 L('tag')+',tag_number) ORDER BY tag_number),'+L('[]')+'::jsonb)',
 ' INTO v_before_owners FROM public.hbnf_current_tag_entries;',
 ' SELECT coalesce(jsonb_agg(tag_number ORDER BY tag_number),'+L('[]')+'::jsonb)',
 ' INTO v_before_available FROM public.hbnf_current_available_tags;',
 ' IF v_before_owners IS DISTINCT FROM '+J(expectedSeed)+' OR',
 '    v_before_available IS DISTINCT FROM '+J([])+' OR',
 '    v_root#>'+L('{bagTags,players}')+' IS DISTINCT FROM '+J(expectedSeed.map(x=>({tag:x.tag,name:x.name})))+' OR',
 '    v_root#>'+L('{bagTags,manual}')+' IS DISTINCT FROM '+J({Matt:1,Jason:2,Andrew:3})+' OR',
 '    v_authority.latest_finalized_round IS DISTINCT FROM DATE '+L('2026-10-20')+' OR',
 '    v_authority.latest_finalized_event_type IS DISTINCT FROM '+L('skins'),
 '    THEN RAISE EXCEPTION '+L('T2_POST_T1_CANONICAL_MIRROR_OR_HISTORY_CONFLICT')+'; END IF;',
 ' v_week=v_root#>'+L('{glow,weeks,2026-11-03}')+';',
 ' IF v_root#>>'+L('{glow,activeWeek}')+' IS DISTINCT FROM '+L(DAY)+' OR',
 '    jsonb_typeof(v_week->'+L('players')+') IS DISTINCT FROM '+L('array')+' OR',
 '    jsonb_array_length(v_week->'+L('players')+')<>4 OR',
 '    EXISTS(SELECT 1 FROM jsonb_array_elements(v_week->'+L('players')+') p',
 '      WHERE coalesce(p->>'+L('id')+','+L('')+') LIKE '+L('QI_%')+' OR',
 '      jsonb_typeof(p->'+L('scores')+') IS DISTINCT FROM '+L('array')+' OR',
 '      jsonb_array_length(p->'+L('scores')+')<>18)',
 '    THEN RAISE EXCEPTION '+L('T2_REQUIRES_INDEPENDENTLY_SAVED_FOUR_TEAM_S1')+'; END IF;',
 ' IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_week->'+L('players')+') p',
 '   CROSS JOIN LATERAL jsonb_array_elements_text(p->'+L('scores')+') score(stroke)',
 '   WHERE score.stroke !~ '+L('^[1-9][0-9]?$')+')',
 '   THEN RAISE EXCEPTION '+L('T2_SCORE_SLOTS_NOT_FULLY_VERIFIED')+'; END IF;',
 ' SELECT array_agg(t.total ORDER BY t.total) INTO v_scores FROM (',
 '  SELECT sum(score.stroke::int)::int total FROM jsonb_array_elements(v_week->'+L('players')+') p,',
 '  LATERAL jsonb_array_elements_text(p->'+L('scores')+') score(stroke)',
 '  GROUP BY p->>'+L('id')+') t;',
 ' IF v_scores IS DISTINCT FROM ARRAY[48,52,52,57]',
 '    THEN RAISE EXCEPTION '+L('T2_GENUINE_SCORES_NOT_YET_MATCHED')+'; END IF;',
 ' v_reply=public.hbnf_finalize_round_tags_v3('+
 L(DAY)+'::date,'+L('glow')+','+J(finalAssignments)+','+J([])+',',
 ' md5('+L(T2_ID)+')::uuid,0,10);',
 ' IF v_reply->>'+L('status')+' IS DISTINCT FROM '+L('saved')+' OR',
 '    coalesce((v_reply->>'+L('applied_current')+')::boolean,false) IS DISTINCT FROM true OR',
 '    coalesce((v_reply->>'+L('handoff_pending')+')::boolean,true) IS DISTINCT FROM false OR',
 '    (v_reply->>'+L('current_revision')+')::bigint IS DISTINCT FROM 11',
 '    THEN RAISE EXCEPTION '+L('T2_NATIVE_GLOW_FINALIZATION_NOT_APPLIED')+'; END IF;',
 ' SELECT * INTO STRICT v_final FROM public.hbnf_round_tag_finalizations',
 ' WHERE round_date=DATE '+L(DAY)+' AND event_type='+L('glow')+';',
 ' IF v_final.assignments IS DISTINCT FROM '+J(finalAssignments)+' OR',
 '    v_final.available_tags IS DISTINCT FROM '+J([])+' OR',
 '    v_final.handoff_pending IS DISTINCT FROM false',
 '    THEN RAISE EXCEPTION '+L('T2_FINALIZATION_PAYLOAD_MISMATCH')+'; END IF;',
 ' SELECT coalesce(jsonb_agg(jsonb_build_object('+L('name')+',player_name,'+L('tag')+',tag_number) ORDER BY tag_number),'+L('[]')+'::jsonb)',
 ' INTO v_final_owners FROM public.hbnf_current_tag_entries;',
 ' SELECT coalesce(jsonb_agg(tag_number ORDER BY tag_number),'+L('[]')+'::jsonb)',
 ' INTO v_final_available FROM public.hbnf_current_available_tags;',
 ' IF v_final_owners IS DISTINCT FROM '+J(expectedFinal)+' OR',
 '    v_final_available IS DISTINCT FROM '+J([]),
 '    THEN RAISE EXCEPTION '+L('T2_FINAL_CANONICAL_HOLDER_OR_AVAILABLE_CONFLICT')+'; END IF;',
 ' v_ledger=jsonb_build_object('+L('id')+','+L(T2_ID)+','+L('date')+','+L(DAY)+',',
 '   '+L('source')+','+L('explicit_owner_confirmed_final_post_round')+',',
 '   '+L('verifiedS1Receipt')+','+L(verifiedS1Receipt)+',',
 '   '+L('verifiedT1Receipt')+','+L(verifiedT1Receipt)+',',
 '   '+L('verifiedBackupReceipt')+','+L(verifiedBackupReceipt)+',',
 '   '+L('beforeOwners')+',v_before_owners,'+L('afterOwners')+',v_final_owners,',
 '   '+L('roundFinalizationRevision')+',v_final.revision,',
 '   '+L('nativeClientEditId')+',v_final.client_edit_id::text,',
 '   '+L('priorAuthorityRevision')+',10,',
 '   '+L('priorLatestFinalizedRound')+',v_authority.latest_finalized_round,',
 '   '+L('priorLatestFinalizedEventType')+',v_authority.latest_finalized_event_type,',
 '   '+L('priorLatestFinalizationOrder')+',v_authority.latest_finalization_order,',
 '   '+L('priorBagTags')+',v_root->'+L('bagTags')+');',
 ' v_newroot=jsonb_set(v_root,'+L('{bagTags,seasonFinalExchangeAudit}')+',',
 '    jsonb_build_object('+L(DAY)+',v_ledger),true);',
 ' UPDATE public.league_state SET state_json=v_newroot WHERE id=1 AND updated_at=v_updated',
 ' RETURNING state_json INTO v_after;',
 ' IF NOT FOUND OR v_after->'+L('glow')+' IS DISTINCT FROM v_root->'+L('glow')+' OR',
 '    v_after->'+L('skins')+' IS DISTINCT FROM v_root->'+L('skins')+' OR',
 '    v_after->'+L('admin')+' IS DISTINCT FROM v_root->'+L('admin')+' OR',
 '    v_after#>>'+L('{bagTags,seasonStartDate}')+' IS DISTINCT FROM '+L(DAY)+' OR',
 '    v_after#>'+L('{bagTags,players}')+' IS DISTINCT FROM '+J(expectedFinal.map(x=>({tag:x.tag,name:x.name})))+' OR',
 '    v_after#>'+L('{bagTags,manual}')+' IS DISTINCT FROM '+J(Object.fromEntries(NOV3_FINAL_TAGS.map(x=>[x.player_name,x.tag_number])))+' OR',
 '    (SELECT revision FROM public.hbnf_tag_authority_state WHERE id=1)<>11',
 '    THEN RAISE EXCEPTION '+L('T2_MIRROR_ROOT_OR_REVISION_MISMATCH')+'; END IF;',
 'END;'
 ];
 return {
  status:'REVIEW_ONLY_T2_NATIVE_FINALIZATION_SQL_NOT_ADMITTED',
  productionWrite:false,
  requiresAfter:['S1_SCORE_PROVIDER_AND_SOURCE_ACCEPTED','T1_RESET_READBACK_REV10'],
  idempotencyKey:T2_ID,
  ownerConfirmedFinal:NOV3_FINAL_TAGS.map(r=>({...r})),
  nativeFinalization:'hbnf_finalize_round_tags_v3',
  expectedAuthorityRevision:10,
  expectedResultRevision:11,
  expectedAvailableTags:[],
  initialSeeds:SEED.map(r=>({...r})),
  historicalRounds:'PRESERVE_UNCHANGED_EXCEPT_NOV03_GLOW_FINALIZATION',
  completeExchange:'OWNER_FINAL_ASSIGNMENTS_ONLY_NO_INVENTED_INTERMEDIATE_HOLDERS',
  applySql:sqlBlock('hbnf_t2_final',body),
  verification:'Fresh canonical eight owners, available empty, rev11, Nov03 Glow finalization 8 owners, league bagTags mirror + seasonStartDate, historical Oct20/27 unchanged, real iPhone/website tag displays, no extra payouts. Independent post-S1/T1 provider source match required.'
 };
}

export function prepareNov3OwnerFinalTagUndo({
 expectedLeagueUpdatedAt,expectedRootMd5,authorityRevision,
 expectedFinalizationRevision=1
}={}) {
 if(!isDate(expectedLeagueUpdatedAt)||!isMD5(expectedRootMd5)||
    authorityRevision!==11||expectedFinalizationRevision!==1)
  return denied('T2_UNDO_REQUIRES_EXACT_POST_FINALIZATION_REV11_PREIMAGE');
 const body=[
 'DECLARE',
 ' v_root jsonb; v_updated timestamptz; v_authority public.hbnf_tag_authority_state%rowtype;',
 ' v_final public.hbnf_round_tag_finalizations%rowtype; v_ledger jsonb; v_next jsonb; v_after jsonb;',
 ' v_owners jsonb; v_avail jsonb;',
 'BEGIN',
 ' SELECT state_json,updated_at INTO STRICT v_root,v_updated FROM public.league_state WHERE id=1 FOR UPDATE;',
 ' SELECT * INTO STRICT v_authority FROM public.hbnf_tag_authority_state WHERE id=1 FOR UPDATE;',
 ' LOCK TABLE public.hbnf_current_tag_entries,public.hbnf_current_available_tags IN SHARE ROW EXCLUSIVE MODE;',
 ' SELECT * INTO STRICT v_final FROM public.hbnf_round_tag_finalizations',
 ' WHERE round_date=DATE '+L(DAY)+' AND event_type='+L('glow')+' FOR UPDATE;',
 ' v_ledger=v_root#>'+L('{bagTags,seasonFinalExchangeAudit,2026-11-03}')+';',
 ' IF v_updated IS DISTINCT FROM '+L(expectedLeagueUpdatedAt)+'::timestamptz OR',
 '    md5(v_root::text) IS DISTINCT FROM '+L(expectedRootMd5)+' OR',
 '    v_authority.revision IS DISTINCT FROM 11 OR v_final.revision IS DISTINCT FROM 1 OR',
 '    v_ledger->>'+L('id')+' IS DISTINCT FROM '+L(T2_ID)+' OR',
 '    v_final.assignments IS DISTINCT FROM '+J(finalAssignments)+' OR',
 '    v_final.available_tags IS DISTINCT FROM '+J([])+' OR',
 '    v_final.client_edit_id IS DISTINCT FROM md5('+L(T2_ID)+')::uuid OR',
 '    v_authority.latest_finalized_round IS DISTINCT FROM DATE '+L(DAY)+' OR',
 '    v_authority.latest_finalized_event_type IS DISTINCT FROM '+L('glow')+' OR',
 '    v_authority.latest_finalization_order IS DISTINCT FROM v_final.finalization_order',
 '    THEN RAISE EXCEPTION '+L('T2_UNDO_REVISION_IDENTITY_OR_ARCHIVE_CONFLICT')+'; END IF;',
 ' IF coalesce((SELECT auto_live FROM public.hbnf_matrix_control_state WHERE id=1),true)',
 '    THEN RAISE EXCEPTION '+L('T2_UNDO_CART_AUTO_LIVE_NOT_QUALIFIED')+'; END IF;',
 ' IF EXISTS(SELECT 1 FROM public.hbnf_round_tag_entries WHERE round_date>=DATE '+L(DAY)+') OR',
 '    EXISTS(SELECT 1 FROM public.hbnf_round_tag_finalizations WHERE round_date>DATE '+L(DAY)+')',
 '    THEN RAISE EXCEPTION '+L('T2_UNDO_LATER_TAG_ACTIVITY_BLOCKS')+'; END IF;',
 ' SELECT coalesce(jsonb_agg(jsonb_build_object('+L('name')+',player_name,'+L('tag')+',tag_number) ORDER BY tag_number),'+L('[]')+'::jsonb)',
 ' INTO v_owners FROM public.hbnf_current_tag_entries;',
 ' SELECT coalesce(jsonb_agg(tag_number ORDER BY tag_number),'+L('[]')+'::jsonb)',
 ' INTO v_avail FROM public.hbnf_current_available_tags;',
 ' IF v_owners IS DISTINCT FROM '+J(expectedFinal)+' OR v_avail IS DISTINCT FROM '+J([])+' OR',
 '    v_root#>'+L('{bagTags,manual}')+' IS DISTINCT FROM '+J(Object.fromEntries(NOV3_FINAL_TAGS.map(x=>[x.player_name,x.tag_number]))),
 '    THEN RAISE EXCEPTION '+L('T2_UNDO_CURRENT_TAG_PREIMAGE_DRIFT')+'; END IF;',
 ' DELETE FROM public.hbnf_round_tag_finalizations',
 ' WHERE round_date=DATE '+L(DAY)+' AND event_type='+L('glow')+
 ' AND revision=1 AND client_edit_id=md5('+L(T2_ID)+')::uuid;',
 ' IF NOT FOUND THEN RAISE EXCEPTION '+L('T2_UNDO_FINALIZATION_NOT_EXACT')+'; END IF;',
 ' DELETE FROM public.hbnf_current_tag_entries;',
 ' INSERT INTO public.hbnf_current_tag_entries(player_key,player_name,tag_number,updated_at)',
 ' VALUES ('+L('matt')+','+L('Matt')+',1,clock_timestamp()),',
 '        ('+L('jason')+','+L('Jason')+',2,clock_timestamp()),',
 '        ('+L('andrew')+','+L('Andrew')+',3,clock_timestamp());',
 ' v_next=jsonb_set(v_root,'+L('{bagTags}')+',v_ledger->'+L('priorBagTags')+',true);',
 ' UPDATE public.league_state SET state_json=v_next WHERE id=1 AND updated_at=v_updated',
 ' RETURNING state_json INTO v_after;',
 ' IF NOT FOUND OR v_after->'+L('glow')+' IS DISTINCT FROM v_root->'+L('glow')+' OR',
 '    v_after->'+L('skins')+' IS DISTINCT FROM v_root->'+L('skins')+' OR',
 '    v_after#>'+L('{bagTags,manual}')+' IS DISTINCT FROM '+J({Matt:1,Jason:2,Andrew:3}),
 '    THEN RAISE EXCEPTION '+L('T2_UNDO_SEED_MIRROR_OR_SCORE_BRANCH_CONFLICT')+'; END IF;',
 ' UPDATE public.hbnf_tag_authority_state SET revision=revision+1,updated_at=clock_timestamp(),',
 ' latest_finalized_round=(v_ledger->>'+L('priorLatestFinalizedRound')+')::date,',
 ' latest_finalized_event_type=v_ledger->>'+L('priorLatestFinalizedEventType')+',',
 ' latest_finalization_order=(v_ledger->>'+L('priorLatestFinalizationOrder')+')::bigint',
 ' WHERE id=1 AND revision=11;',
 ' IF NOT FOUND THEN RAISE EXCEPTION '+L('T2_UNDO_TAG_REVISION_CHANGED')+'; END IF;',
 'END;'
 ];
 return {status:'REVIEW_ONLY_T2_GUARDED_UNDO_NOT_ADMITTED',productionWrite:false,
  expectedAuthorityRevision:11,expectedPostUndoRevision:12,
  undoSql:sqlBlock('hbnf_t2_undo',body),
  verification:'After authorized undo, read canonical Matt1/Jason2/Andrew3, no available tags, prior latest finalized Oct20, auth rev12, old preserved history; cancel if later edits exist.'
 };
}
