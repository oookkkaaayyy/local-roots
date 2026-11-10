-- Native PostgreSQL 17 assertion after the review-only inverse script.
DO $assert_undo$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)'::regprocedure)
    INTO v_definition;
  IF md5(v_definition)<>'636ea2b92a9b1e6339a91e5e2eb9cec6'
     OR position('SOURCE_RATE_LIMITED' IN v_definition)>0 THEN
    RAISE EXCEPTION 'STATUS_RPC_BASELINE_NOT_RESTORED';
  END IF;
  IF to_regclass('public.hbnf_udisc_glow_fetch_gate') IS NOT NULL
     OR to_regprocedure('public.hbnf_claim_udisc_glow_fetch(text,text)') IS NOT NULL
     OR to_regprocedure('public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'FETCH_GATE_OBJECTS_NOT_REMOVED';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)','EXECUTE')
     OR has_function_privilege('anon',
       'public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)','EXECUTE') THEN
    RAISE EXCEPTION 'STATUS_RPC_ACL_CHANGED_BY_INVERSE';
  END IF;
END
$assert_undo$;
SELECT 'HBNF_UDISC_GATE_PG17_UNDO_PASS' AS evidence;
