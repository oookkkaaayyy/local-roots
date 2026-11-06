-- REVIEW ONLY. Scoring P0 is the only production mutation owner.
-- Requires admitted same-manifest release, current-source rollback and fresh
-- five-target readback. Never apply this file as a standalone production write.
-- This gate is used BY THE EXISTING minute cron; it creates NO scheduler.
BEGIN;

CREATE TABLE public.hbnf_udisc_glow_fetch_gate (
  event_id text PRIMARY KEY,
  week_date text NOT NULL UNIQUE,
  attempt_token uuid,
  last_attempt_at timestamptz,
  next_eligible_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  lease_expires_at timestamptz,
  last_outcome text,
  last_http_status integer,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT hbnf_udisc_fetch_event_check CHECK (event_id ~ '^hb-glow-doubles-[A-Za-z0-9]{6}$'),
  CONSTRAINT hbnf_udisc_fetch_week_check CHECK (week_date ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT hbnf_udisc_fetch_outcome_check CHECK (
    last_outcome IS NULL OR last_outcome IN ('SUCCESS','SOURCE_FAILED','RATE_LIMITED')
  ),
  CONSTRAINT hbnf_udisc_fetch_http_check CHECK (
    last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599
  )
);
ALTER TABLE public.hbnf_udisc_glow_fetch_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hbnf_udisc_glow_fetch_gate FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hbnf_udisc_glow_fetch_gate TO service_role;

-- Atomic claim across Worker invocations, restarts and concurrent cron runs.
-- Fail CLOSED: claim installs a hold beyond the event window BEFORE any UDisc
-- request. Only the matching token may shorten it after a verified outcome.
CREATE OR REPLACE FUNCTION public.hbnf_claim_udisc_glow_fetch(
  p_event_id text, p_week_date text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $claim$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_matches integer;
  v_token uuid := gen_random_uuid();
  v_claimed uuid;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^hb-glow-doubles-[A-Za-z0-9]{6}$'
     OR p_week_date IS NULL OR p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_event');
  END IF;
  SELECT count(*), min(window_start), max(window_end)
    INTO v_matches, v_window_start, v_window_end
    FROM public.hbnf_udisc_glow_event_bindings
   WHERE event_id=p_event_id AND event_date=p_week_date::date
     AND window_start<=v_now AND window_end>=v_now;
  IF v_matches <> 1 THEN
    RETURN jsonb_build_object('allowed',false,'reason','event_not_active_or_ambiguous');
  END IF;
  -- Reject overlapping windows even if one event ID was selected upstream.
  IF (SELECT count(*) FROM public.hbnf_udisc_glow_event_bindings
        WHERE window_start<=v_now AND window_end>=v_now) <> 1 THEN
    RETURN jsonb_build_object('allowed',false,'reason','multiple_active_events');
  END IF;
  INSERT INTO public.hbnf_udisc_glow_fetch_gate AS gate (
    event_id,week_date,attempt_token,last_attempt_at,
    next_eligible_at,lease_expires_at,updated_at
  ) VALUES (
    p_event_id,p_week_date,v_token,v_now,
    v_window_end+interval '1 minute',v_now+interval '2 minutes',v_now
  )
  ON CONFLICT (event_id) DO UPDATE SET
    attempt_token=EXCLUDED.attempt_token,
    last_attempt_at=EXCLUDED.last_attempt_at,
    next_eligible_at=EXCLUDED.next_eligible_at,
    lease_expires_at=EXCLUDED.lease_expires_at,
    updated_at=EXCLUDED.updated_at
  WHERE gate.week_date=EXCLUDED.week_date
    AND gate.next_eligible_at<=v_now
    AND (gate.lease_expires_at IS NULL OR gate.lease_expires_at<=v_now)
  RETURNING attempt_token INTO v_claimed;
  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','event_cadence_or_lease');
  END IF;
  RETURN jsonb_build_object('allowed',true,'attemptToken',v_claimed,
    'eventId',p_event_id,'weekDate',p_week_date,
    'attemptedAt',v_now,'failClosedUntil',v_window_end+interval '1 minute');
END
$claim$;

-- Provider 429/503 Retry-After never gets silently shortened. If this function
-- cannot execute/verify, the claim's beyond-window hold remains in force.
CREATE OR REPLACE FUNCTION public.hbnf_finish_udisc_glow_fetch(
  p_event_id text, p_week_date text, p_attempt_token uuid,
  p_outcome text, p_http_status integer DEFAULT NULL,
  p_retry_after_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $finish$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_next timestamptz;
  v_updated timestamptz;
BEGIN
  IF p_attempt_token IS NULL
     OR p_outcome NOT IN ('SUCCESS','SOURCE_FAILED','RATE_LIMITED')
     OR p_http_status IS NOT NULL AND (p_http_status<100 OR p_http_status>599)
     OR p_outcome='RATE_LIMITED' AND (p_http_status IS NULL OR p_http_status NOT IN (429,503))
     OR p_retry_after_at IS NOT NULL AND p_outcome<>'RATE_LIMITED' THEN
    RETURN jsonb_build_object('recorded',false,'reason','invalid_completion');
  END IF;
  v_next := CASE p_outcome
    WHEN 'SUCCESS' THEN v_now+interval '5 minutes'
    WHEN 'SOURCE_FAILED' THEN v_now+interval '10 minutes'
    ELSE greatest(v_now+interval '15 minutes',
                  coalesce(p_retry_after_at,v_now+interval '15 minutes'))
  END;
  UPDATE public.hbnf_udisc_glow_fetch_gate
     SET next_eligible_at=v_next,lease_expires_at=NULL,attempt_token=NULL,
         last_outcome=p_outcome,last_http_status=p_http_status,updated_at=v_now
   WHERE event_id=p_event_id AND week_date=p_week_date
     AND attempt_token=p_attempt_token
  RETURNING next_eligible_at INTO v_updated;
  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('recorded',false,'reason','token_or_event_changed');
  END IF;
  RETURN jsonb_build_object('recorded',true,'eventId',p_event_id,
    'weekDate',p_week_date,'nextEligibleAt',v_updated,'outcome',p_outcome);
END
$finish$;

REVOKE ALL ON FUNCTION public.hbnf_claim_udisc_glow_fetch(text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_claim_udisc_glow_fetch(text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_finish_udisc_glow_fetch(text,text,uuid,text,integer,timestamptz)
  TO service_role;

-- Update exactly ONE case in the ACTUAL installed failure-status RPC. The
-- digest is from authenticated read-only pg_get_functiondef on Nov 5; if the
-- installed body changed, abort the whole transaction with no schema changes.
-- CREATE OR REPLACE preserves the function's installed ACL and ownership.
DO $patch$
DECLARE
  v_installed text;
  v_revised text;
  v_old text := '''SOURCE_UNAVAILABLE'', ''SOURCE_PARSE_FAILED'', ''IDENTITY_REVIEW_REQUIRED'',
    ''SAVE_CONFLICT'', ''SYNC_FAILED''';
  v_new text := '''SOURCE_UNAVAILABLE'', ''SOURCE_PARSE_FAILED'', ''IDENTITY_REVIEW_REQUIRED'',
    ''SOURCE_RATE_LIMITED'', ''SAVE_CONFLICT'', ''SYNC_FAILED''';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_installed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='hbnf_record_udisc_glow_sync_status'
     AND pg_get_function_identity_arguments(p.oid)=
       'p_week_date text, p_expected_active_week text, p_attempted_at timestamp with time zone, p_error_code text';
  IF v_installed IS NULL OR md5(v_installed) <> '636ea2b92a9b1e6339a91e5e2eb9cec6' THEN
    RAISE EXCEPTION 'UDISC_STATUS_RPC_PREIMAGE_DRIFT_NO_CHANGE';
  END IF;
  v_revised := replace(v_installed,v_old,v_new);
  IF v_revised = v_installed OR position('SOURCE_RATE_LIMITED' in v_installed)>0 THEN
    RAISE EXCEPTION 'UDISC_STATUS_RPC_ALLOWLIST_AMBIGUOUS_NO_CHANGE';
  END IF;
  EXECUTE v_revised;
  IF NOT has_function_privilege('service_role',
    'public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)','EXECUTE')
     OR has_function_privilege('anon',
    'public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)','EXECUTE') THEN
    RAISE EXCEPTION 'UDISC_STATUS_RPC_ACL_CHANGED_NO_CHANGE';
  END IF;
END
$patch$;

COMMIT;
