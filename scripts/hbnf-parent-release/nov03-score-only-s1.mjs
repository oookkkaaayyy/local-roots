// S1 narrow, one-use SQL boundary. Source only. No provider calls.
import {readFileSync} from 'node:fs';
import {NOV03_SCORED_RECEIPT} from './udisc-nov03-reconciliation.mjs';
import {NOV3_LAYOUT} from './nov03-event-source.mjs';
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

// The last-stage release renderer must rebind the *actual 72 hole values*,
// eight canonical participant identities and PAR59, not merely trust mutable
// "source verified" flags copied from a review JSON. It reuses the identical
// scored receipt already checked by the XLSX read-only reconciling planner.
export function verifyScoredNov03Week(week) {
 const canonical=[['Fox','Jason'],['Andrew','Matt'],['Kyle','Dylan'],['Karl','Tony Howell']];
 const actual=week?.players, cards=week?.cards,pars=week?.scorecardText?.holePars;
 if(!Array.isArray(actual)||actual.length!==4||!Array.isArray(cards)||
    cards.length!==1||!Array.isArray(cards[0]?.players)||cards[0].players.length!==4)
   throw Error('S1_REVIEW_TEAM_CARD_COUNT_INVALID');
 const ids=new Set();
 for(let i=0;i<4;i++){
   const item=actual[i], ref=NOV03_SCORED_RECEIPT[i], pair=canonical[i];
   if(!item||typeof item.id!=='string'||ids.has(item.id)||
      !item.id.startsWith('UDISC_20261103_')||
      item.partner1!==pair[0]||item.partner2!==pair[1]||
      !Array.isArray(item.scores)||item.scores.length!==18||
      item.scores.some((value,j)=>String(value)!==String(ref.strokes[j]))||
      item.scores.reduce((n,v)=>n+Number(v),0)!==ref.total)
     throw Error('S1_REVIEW_OFFICIAL_SCORES_OR_IDENTITIES_MISMATCH:'+i);
   ids.add(item.id);
 }
 if(cards[0].players.some((item,i)=>item?.id!==actual[i].id))
   throw Error('S1_REVIEW_CARD_PLAYER_MISMATCH');
 if(!pars||typeof pars!=='object'||Object.keys(pars).length!==18||
    NOV3_LAYOUT.holes.some(h=>String(pars[h[0]])!==String(h[4]))||
    NOV3_LAYOUT.holes.reduce((sum,h)=>sum+Number(pars[h[0]]),0)!==59)
   throw Error('S1_REVIEW_PAR59_MISMATCH');
 return true;
}
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
 verifyScoredNov03Week(review.projectedWeek);
 // The live Nov03 week has no redundant date/activeWeek fields. The installed
 // hbnf_apply_udisc_glow_week RPC rejects a replacement without date even when
 // all official scores match; normalize only these exact date keys, fail closed
 // if a supplied key conflicts, and preserve every other projected field.
 if(['date','activeWeek'].some(k=>review.projectedWeek[k]!==undefined &&
    review.projectedWeek[k]!=='2026-11-03'))
   throw Error('S1_REVIEW_WEEK_DATE_MISMATCH');
 const normalizedWeek={...review.projectedWeek,date:'2026-11-03',activeWeek:'2026-11-03'};
 const root=quoted(before.beforeSha),rev=quoted(before.beforeRevision);
 const old=quoted(JSON.stringify(before.oldWeek)),next=quoted(JSON.stringify(normalizedWeek));
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
