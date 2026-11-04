// S1 narrow, one-use SQL boundary. Source only. No provider calls.
import {readFileSync} from 'node:fs';
export const SCORED_XLSX_SHA256='29ed49f19ee3b9c9cb8b12043e9beeb111b0c156ac3cc89a90a9dc54669f86f8';
const quoted=s=>"'"+String(s).replaceAll("'","''")+"'";
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const at=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(s);
export const neededS1Gates=['originalBytesVerified','round1LayoutEvidenceQualified',
 'reviewedIdentityCrosswalk','fullRootBackupDownloadedBack','legacyWriterGuardQualified',
 'conditionalRestoreQualified','installedWatchAndMatrixCompatible',
 'oneTimeClaimQualified','sameManifestAdmitted','ownerScoreOnlyAuthorized'];
const check=x=>{
 if(!hash(x?.beforeSha)||!at(x?.beforeRevision)||x?.oldWeek?.players?.length!==3||
 !x.oldWeek.players.every(p=>String(p.id||'').startsWith('QI_1793572411877_')))
 throw Error('S1_EXACT_PRIOR_QI_STATE_REQUIRED');
};
const gate=g=>{
 const missing=neededS1Gates.filter(k=>g?.[k]!==true);
 if(missing.length)throw Error('S1_NOT_ADMITTED:'+missing.join(','));
};
export function buildS1ApplySQL({before,review,gates}){
 gate(gates);check(before);
 if(review?.status!=='ATOMIC_NOV03_SCORE_PROPOSAL_REVIEW_ONLY'||
 review?.projectedStatus!=='READY_FOR_SEPARATE_ADMITTED_CAS_REVIEW'||
 review?.officialSource?.claimedSha256!==SCORED_XLSX_SHA256||
 review?.officialSource?.originalXlsxVerified!==true||
 review?.eventId!=='hb-glow-doubles-tAP8Y5'||
 review?.projectedWeek?.players?.length!==4||
 !review.projectedWeek.players.every(p=>String(p.id||'').startsWith('UDISC_20261103_')&&p.scores?.length===18))
 throw Error('S1_EXACT_ORIGINAL_IMPORT_REVIEW_REQUIRED');
 const root=quoted(before.beforeSha),rev=quoted(before.beforeRevision);
 const old=quoted(JSON.stringify(before.oldWeek)),next=quoted(JSON.stringify(review.projectedWeek));
 const ddl=readFileSync(new URL('./sql/nov03-score-only-guard.sql',import.meta.url),'utf8');
 return ['BEGIN;',"SET LOCAL lock_timeout='5s';","SET LOCAL statement_timeout='30s';",
 'LOCK TABLE public.league_state IN SHARE ROW EXCLUSIVE MODE;',ddl,
 'DO $apply$','DECLARE b jsonb;a jsonb;rv timestamptz;next_rv timestamptz;ack jsonb;',
 ' old_week jsonb:='+old+'::jsonb;new_week jsonb:='+next+'::jsonb;',
 'BEGIN','SELECT state_json,updated_at INTO STRICT b,rv FROM public.league_state WHERE id=1 FOR UPDATE;',
 'IF rv IS DISTINCT FROM '+rev+'::timestamptz OR',
 " pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(b::text,'UTF8')),'hex')<>"+root,
 " OR b#>'{glow,weeks,2026-11-03}' IS DISTINCT FROM old_week THEN",
 " RAISE EXCEPTION 'S1_STALE_PREIMAGE'; END IF;",
 "SELECT public.hbnf_apply_udisc_glow_week('2026-11-03',old_week,new_week,'\"2026-11-03\"'::jsonb) INTO ack;",
 "IF ack->>'applied' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'S1_CAS_REFUSED'; END IF;",
 'SELECT state_json,updated_at INTO STRICT a,next_rv FROM public.league_state WHERE id=1;',
 "IF next_rv<=rv OR a IS DISTINCT FROM pg_catalog.jsonb_set(b,'{glow,weeks,2026-11-03}',",
 "new_week||pg_catalog.jsonb_build_object('date','2026-11-03','activeWeek','2026-11-03'),false)",
 "THEN RAISE EXCEPTION 'S1_UNRELATED_ROOT_CHANGED'; END IF;",
 'END;','$apply$;','COMMIT;'].join('\n');
}
export function buildS1ExactRollbackSQL({before,after}){
 check(before);
 if(!hash(after?.sha)||!at(after?.revision))throw Error('S1_REVERSE_POSTIMAGE_REQUIRED');
 const b=quoted(before.beforeSha),a=quoted(after.sha),rev=quoted(after.revision);
 const old=quoted(JSON.stringify(before.oldWeek));
 return ['BEGIN;',"SET LOCAL lock_timeout='5s';","SET LOCAL statement_timeout='30s';",
 'LOCK TABLE public.league_state IN ACCESS EXCLUSIVE MODE;',
 'DO $before$','DECLARE s jsonb;t timestamptz;','BEGIN',
 'SELECT state_json,updated_at INTO STRICT s,t FROM public.league_state WHERE id=1 FOR UPDATE;',
 'IF t IS DISTINCT FROM '+rev+'::timestamptz OR',
 "pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(s::text,'UTF8')),'hex')<>"+a,
 "OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.league_state'::regclass",
 " AND tgname='zzz_hbnf_s1_nov03_scores' AND NOT tgisinternal)",
 "THEN RAISE EXCEPTION 'S1_REVERSE_FENCE_MISMATCH'; END IF;",
 'END;','$before$;',
 'DROP TRIGGER zzz_hbnf_s1_nov03_scores ON public.league_state;',
 'DO $restore$','DECLARE s jsonb;t timestamptz;n integer;','BEGIN',
 "UPDATE public.league_state SET state_json=pg_catalog.jsonb_set(state_json,'{glow,weeks,2026-11-03}',",
 old+"::jsonb,false) WHERE id=1 AND updated_at="+rev+"::timestamptz AND",
 "pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(state_json::text,'UTF8')),'hex')="+a+';',
 'GET DIAGNOSTICS n=ROW_COUNT;', "IF n<>1 THEN RAISE EXCEPTION 'S1_REVERSE_CAS_FAILED'; END IF;",
 'SELECT state_json,updated_at INTO STRICT s,t FROM public.league_state WHERE id=1;',
 "IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(s::text,'UTF8')),'hex')<>"+b,
 "OR t<="+rev+"::timestamptz THEN RAISE EXCEPTION 'S1_EXACT_ROOT_RESTORE_FAILED'; END IF;",
 'END;','$restore$;',
 'DROP FUNCTION public.hbnf_s1_protect_nov03_scores();','COMMIT;'].join('\n');
}
