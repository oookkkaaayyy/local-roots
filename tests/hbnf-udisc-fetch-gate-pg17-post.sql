-- ISOLATED PostgreSQL 17 only. Assert service_role-safe claim/release and
-- installed-error-code patch; no real provider, no external UDisc request.
DO $check$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)'::regprocedure) INTO def;
 IF position('SOURCE_RATE_LIMITED' IN def)=0 THEN
   RAISE EXCEPTION 'RATE_LIMIT_STATUS_RPC_NOT_PATCHED';
 END IF;
 IF has_function_privilege('anon','public.hbnf_claim_udisc_glow_fetch(text,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.hbnf_claim_udisc_glow_fetch(text,text)','EXECUTE') OR
    has_function_privilege('anon','public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)','EXECUTE') THEN
   RAISE EXCEPTION 'PUBLIC_GATE_EXECUTE_EXPOSED';
 END IF;
 IF NOT has_function_privilege('service_role','public.hbnf_claim_udisc_glow_fetch(text,text)','EXECUTE') OR
    NOT has_function_privilege('service_role','public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)','EXECUTE') THEN
   RAISE EXCEPTION 'SERVER_GATE_SERVICE_ROLE_MISSING';
 END IF;
END
$check$;

SET ROLE service_role;
DO $test$
DECLARE
 v_date text:=to_char(current_date,'YYYY-MM-DD');
 v_a jsonb;v_b jsonb;v_finished jsonb;v_token uuid;
 v_hold timestamptz:=clock_timestamp()+interval '1 hour';
 v_next timestamptz;
BEGIN
 v_a:=public.hbnf_claim_udisc_glow_fetch('hb-glow-doubles-af85rU',v_date);
 IF v_a->>'allowed' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'ATOMIC_FIRST_CLAIM_REJECTED: %',v_a;
 END IF;
 v_token:=(v_a->>'attemptToken')::uuid;
 SELECT next_eligible_at INTO v_next FROM public.hbnf_udisc_glow_fetch_gate
  WHERE event_id='hb-glow-doubles-af85rU' AND week_date=v_date;
 IF v_next<=clock_timestamp()+interval '5 hours' THEN
   RAISE EXCEPTION 'CLAIM_MUST_FAIL_CLOSED_BEYOND_EVENT';
 END IF;
 v_b:=public.hbnf_claim_udisc_glow_fetch('hb-glow-doubles-af85rU',v_date);
 IF v_b->>'allowed' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'OVERLAPPING_CLAIM_NOT_REJECTED';
 END IF;
 v_b:=public.hbnf_finish_udisc_glow_fetch(
   'hb-glow-doubles-af85rU',v_date,gen_random_uuid(),'RATE_LIMITED',429,v_hold);
 IF v_b->>'recorded' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'INCORRECT_TOKEN_ACCEPTED';
 END IF;
 v_finished:=public.hbnf_finish_udisc_glow_fetch(
   'hb-glow-doubles-af85rU',v_date,v_token,'RATE_LIMITED',429,v_hold);
 IF v_finished->>'recorded' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'CORRECT_TOKEN_NOT_SETTLED: %',v_finished;
 END IF;
 SELECT next_eligible_at INTO v_next FROM public.hbnf_udisc_glow_fetch_gate
  WHERE event_id='hb-glow-doubles-af85rU' AND week_date=v_date
    AND attempt_token IS NULL AND last_outcome='RATE_LIMITED';
 IF v_next IS NULL OR v_next<v_hold THEN
   RAISE EXCEPTION 'PROVIDER_RETRY_AFTER_NOT_DURABLE';
 END IF;
 v_b:=public.hbnf_claim_udisc_glow_fetch('hb-glow-doubles-af85rU',v_date);
 IF v_b->>'allowed' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'RATE_LIMIT_HOLD_NOT_ENFORCED';
 END IF;
 v_b:=public.hbnf_finish_udisc_glow_fetch(
   'hb-glow-doubles-af85rU',v_date,v_token,'SUCCESS',200,NULL);
 IF v_b->>'recorded' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'COMPLETION_TOKEN_REPLAY_ACCEPTED';
 END IF;
END
$test$;
RESET ROLE;

DO $status$
DECLARE v_result jsonb;v_code text;
BEGIN
  v_result:=public.hbnf_record_udisc_glow_sync_status(
    '2026-11-10','2026-11-10',clock_timestamp(),'SOURCE_RATE_LIMITED');
  IF v_result->>'recorded' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'SOURCE_FAILURE_STATUS_NOT_RECORDED: %',v_result;
  END IF;
  SELECT state_json #>> '{glow,weeks,2026-11-10,udiscSync,status,errorCode}'
    INTO v_code FROM public.league_state WHERE id=1;
  IF v_code IS DISTINCT FROM 'SOURCE_RATE_LIMITED' THEN
    RAISE EXCEPTION 'INSTALLED_STATUS_RPC_STILL_LOSES_RATE_LIMIT: %',v_code;
  END IF;
END
$status$;
SELECT 'HBNF_UDISC_GATE_PG17_NATIVE_PASS' AS evidence;
