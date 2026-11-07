-- S1 original-score protection. REVIEW ONLY until same-manifest admission.
-- Install in SAME SQL transaction as the official scored-week import.
-- Retain all current anon/authenticated grants, RLS, and no-email UI flows.
-- A stale whole-root update changing the authentic Nov3 score content fails.
CREATE OR REPLACE FUNCTION public.hbnf_s1_protect_nov03_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $s1$
DECLARE v_old jsonb;v_new jsonb;v_players jsonb;v_protected boolean;
BEGIN
 IF OLD.id IS DISTINCT FROM 1 OR NEW.id IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
 v_old:=OLD.state_json#>'{glow,weeks,2026-11-03}';
 v_new:=NEW.state_json#>'{glow,weeks,2026-11-03}';
 v_players:=v_old->'players';
 IF pg_catalog.jsonb_typeof(v_players) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_players) AS p(team)
   WHERE pg_catalog.left(p.team->>'id',15)='UDISC_20261103_') INTO v_protected;
 IF v_protected AND (
   v_old->'players' IS DISTINCT FROM v_new->'players'
   OR v_old->'cards' IS DISTINCT FROM v_new->'cards'
   OR v_old#>'{scorecardText,holePars}' IS DISTINCT FROM v_new#>'{scorecardText,holePars}'
   OR v_old#>'{udiscSync,latest}' IS DISTINCT FROM v_new#>'{udiscSync,latest}'
 ) THEN RAISE EXCEPTION USING ERRCODE='23514',
   MESSAGE='HBNF_S1_NOV03_SCORES_PROTECTED_REFRESH_REQUIRED'; END IF;
 RETURN NEW;
END;
$s1$;
CREATE TRIGGER zzz_hbnf_s1_nov03_scores
BEFORE UPDATE OF state_json ON public.league_state
FOR EACH ROW WHEN (OLD.id=1)
EXECUTE FUNCTION public.hbnf_s1_protect_nov03_scores();
