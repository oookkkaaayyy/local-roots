\set ON_ERROR_STOP on
-- The SOURCE guard is now installed on this scratch database only.
UPDATE public.league_state
 SET state_json=pg_catalog.jsonb_set(state_json,'{glow,weeks,2026-11-03,players}',
 '[{"id":"UDISC_20261103_01","scores":["3","3"]},{"id":"UDISC_20261103_02","scores":["3","3"]},{"id":"UDISC_20261103_03","scores":["3","3"]},{"id":"UDISC_20261103_04","scores":["3","3"]}]'::jsonb,false) WHERE id=1;
DO $check$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  UPDATE public.league_state SET state_json=(SELECT original_state FROM s1_original);
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'STALE_QI_OVERWRITE_NOT_BLOCKED'; END IF;
 IF (SELECT jsonb_array_length(state_json#>'{glow,weeks,2026-11-03,players}') FROM public.league_state WHERE id=1)<>4
 THEN RAISE EXCEPTION 'SAVED_TEAMS_LOST'; END IF;
END;
$check$;
-- A previously loaded client may still save other, non-Nov03 state.
UPDATE public.league_state
 SET state_json=pg_catalog.jsonb_set(state_json,'{skins,unrelated}','true'::jsonb,true) WHERE id=1;
-- A service-role status-only update may still touch the selected week.
UPDATE public.league_state
 SET state_json=pg_catalog.jsonb_set(state_json,'{glow,weeks,2026-11-03,udiscSync,status}','{"state":"failed","lastAttemptAt":"later"}'::jsonb,true)
 WHERE id=1;
DO $check$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  UPDATE public.league_state SET state_json=pg_catalog.jsonb_set(state_json,
   '{glow,weeks,2026-11-03,players,0,scores,0}','"7"'::jsonb,false) WHERE id=1;
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLE_SCORE_CHANGE_NOT_BLOCKED'; END IF;
END;
$check$;
DO $check$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  UPDATE public.league_state SET state_json=pg_catalog.jsonb_set(state_json,
    '{glow,weeks,2026-11-03,scorecardText,holePars,1}','"4"'::jsonb,false) WHERE id=1;
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'NOV03_PAR_CHANGE_NOT_BLOCKED'; END IF;
END;
$check$;
-- Revert an unrelated test edit, still using the ordinary legacy UPDATE.
UPDATE public.league_state
 SET state_json=state_json#-'{skins,unrelated}' WHERE id=1;
-- Scratch proof of conditional, same-transaction guard removal + exact
-- selected-week JSONB inverse. No live schema or root is changed.
BEGIN;
LOCK TABLE public.league_state IN ACCESS EXCLUSIVE MODE;
DROP TRIGGER zzz_hbnf_s1_nov03_scores ON public.league_state;
UPDATE public.league_state SET state_json=pg_catalog.jsonb_set(state_json,
 '{glow,weeks,2026-11-03}',
 (SELECT original_state#>'{glow,weeks,2026-11-03}' FROM s1_original),false)
 WHERE id=1;
DO $check$
BEGIN
 IF NOT (SELECT l.state_json IS NOT DISTINCT FROM o.original_state
         FROM public.league_state l CROSS JOIN s1_original o WHERE l.id=1)
 THEN RAISE EXCEPTION 'EXACT_OLD_JSONB_ROLLBACK_FAILED'; END IF;
END;
$check$;
DROP FUNCTION public.hbnf_s1_protect_nov03_scores();
COMMIT;
SELECT 'S1_PG17_SCORE_GUARD_AND_EXACT_INVERSE_PASS' AS verification;
