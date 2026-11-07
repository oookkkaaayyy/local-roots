-- REVIEW ONLY. Conditional rollback for udisc-event-fetch-gate.review.sql.
-- Restores the exact authenticated installed status RPC and removes only the
-- newly introduced empty fetch-gate table/functions. Any drift or recorded
-- attempt stops the transaction; this does not erase rate-limit/cadence data.
BEGIN;

DO $undo$
DECLARE
  v_status text;
  v_restored text;
  v_old text := '''SOURCE_UNAVAILABLE'', ''SOURCE_PARSE_FAILED'', ''IDENTITY_REVIEW_REQUIRED'',
    ''SOURCE_RATE_LIMITED'', ''SAVE_CONFLICT'', ''SYNC_FAILED''';
  v_new text := '''SOURCE_UNAVAILABLE'', ''SOURCE_PARSE_FAILED'', ''IDENTITY_REVIEW_REQUIRED'',
    ''SAVE_CONFLICT'', ''SYNC_FAILED''';
  v_count bigint;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_status
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='hbnf_record_udisc_glow_sync_status'
     AND pg_get_function_identity_arguments(p.oid)=
       'p_week_date text, p_expected_active_week text, p_attempted_at timestamp with time zone, p_error_code text';
  IF v_status IS NULL OR position(v_old in v_status)=0 THEN
    RAISE EXCEPTION 'UDISC_STATUS_RPC_NOT_PATCHED_CANDIDATE_NO_CHANGE';
  END IF;
  v_restored := replace(v_status,v_old,v_new);
  IF v_restored=v_status OR md5(v_restored)<>'636ea2b92a9b1e6339a91e5e2eb9cec6' THEN
    RAISE EXCEPTION 'UDISC_STATUS_RPC_INVERSE_NOT_EXACT_BASELINE_NO_CHANGE';
  END IF;
  IF to_regclass('public.hbnf_udisc_glow_fetch_gate') IS NULL THEN
    RAISE EXCEPTION 'UDISC_FETCH_GATE_TABLE_MISSING_NO_CHANGE';
  END IF;
  EXECUTE 'SELECT count(*) FROM public.hbnf_udisc_glow_fetch_gate' INTO v_count;
  IF v_count<>0 THEN
    RAISE EXCEPTION 'UDISC_FETCH_GATE_HAS_DURABLE_ATTEMPTS_NO_CHANGE';
  END IF;
  IF md5(pg_get_functiondef('public.hbnf_claim_udisc_glow_fetch(text,text)'::regprocedure))
       <>'ef475c75d8828e49466a1d209d36d40d'
     OR md5(pg_get_functiondef('public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)'::regprocedure))
       <>'ac6927130ae531f0c905875f9b031663' THEN
    RAISE EXCEPTION 'UDISC_FETCH_GATE_FUNCTION_DRIFT_NO_CHANGE';
  END IF;
  EXECUTE v_restored;
  EXECUTE 'DROP FUNCTION public.hbnf_claim_udisc_glow_fetch(text,text)';
  EXECUTE 'DROP FUNCTION public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)';
  EXECUTE 'DROP TABLE public.hbnf_udisc_glow_fetch_gate';
END
$undo$;

COMMIT;
