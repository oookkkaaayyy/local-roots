-- REVIEW_ONLY: not applied to live Supabase. Source must pass same-manifest admission.
-- Existing hbnf-cart-control service role, canonical reducer/command bridge and
-- authenticated Opal op=next are the ONLY actuation route. Never writes league_state.
BEGIN;
CREATE OR REPLACE FUNCTION public.hbnf_cart_glow_source_snapshot(p_week_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_state jsonb; v_rev timestamptz; v_week jsonb;
  v_event record; v_count integer;
BEGIN
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
  THEN RAISE EXCEPTION 'backend_service_role_required' USING ERRCODE='42501'; END IF;
  IF p_week_date::text IS DISTINCT FROM to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD')
  THEN RAISE EXCEPTION 'glow_event_date_inactive' USING ERRCODE='22023'; END IF;
  SELECT state_json,updated_at INTO v_state,v_rev FROM public.league_state WHERE id=1;
  v_week := v_state #> ARRAY['glow','weeks',p_week_date::text];
  IF v_rev IS NULL OR v_state #>> '{glow,activeWeek}' IS DISTINCT FROM p_week_date::text
     OR jsonb_typeof(v_week) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'glow_source_missing' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.hbnf_udisc_glow_event_bindings
   WHERE event_date=p_week_date AND event_id='hb-glow-doubles-tAP8Y5'
     AND window_start<=clock_timestamp() AND window_end>clock_timestamp();
  IF v_count<>1 THEN RAISE EXCEPTION 'glow_event_window_inactive' USING ERRCODE='22023'; END IF;
  SELECT event_id,window_start,window_end INTO v_event
    FROM public.hbnf_udisc_glow_event_bindings
   WHERE event_date=p_week_date AND event_id='hb-glow-doubles-tAP8Y5';
  RETURN jsonb_build_object('state_json',v_state,'week',v_week,
    'source_revision',v_rev::text,'fingerprint',md5(v_week::text),
    'event_date',p_week_date::text,'event_id',v_event.event_id,
    'window_start',v_event.window_start::text,'window_end',v_event.window_end::text);
END $fn$;

CREATE OR REPLACE FUNCTION public.hbnf_cart_commit_glow_intent(
  p_week_date date, p_source_revision timestamptz, p_fingerprint text,
  p_signature text, p_cart_revision bigint, p_fence_epoch bigint,
  p_release_id text, p_command_id uuid, p_intent_key text, p_next_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_league record; v_week jsonb; v_sync jsonb; v_fingerprint text;
  v_success timestamptz; v_count integer; v_now timestamptz := clock_timestamp();
  v_rev bigint; v_state jsonb; v_active boolean; v_epoch bigint; v_release text;
  v_expected_key text; v_cursor jsonb; v_overlays jsonb; v_remaining jsonb;
  v_new jsonb; v_entries jsonb; v_expiry bigint; v_now_ms bigint;
  v_accepted boolean; v_duplicate boolean; v_result bigint;
BEGIN
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
  THEN RAISE EXCEPTION 'backend_service_role_required' USING ERRCODE='42501'; END IF;
  IF p_week_date::text IS DISTINCT FROM to_char(v_now AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD') OR
     p_signature !~ '^[a-f0-9]{64}$' OR p_fingerprint !~ '^[a-f0-9]{32}$' OR
     p_source_revision IS NULL OR p_cart_revision<0 OR p_fence_epoch<0 OR
     coalesce(p_release_id,'')='' OR p_command_id IS NULL OR jsonb_typeof(p_next_state) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'glow_intent_invalid' USING ERRCODE='22023'; END IF;
  -- Serialize against Scoring P0 source updates, then canonical Cart writes.
  SELECT state_json,updated_at INTO v_league FROM public.league_state WHERE id=1 FOR SHARE;
  IF NOT FOUND OR v_league.updated_at IS DISTINCT FROM p_source_revision
  THEN RAISE EXCEPTION 'glow_source_revision_changed' USING ERRCODE='40001'; END IF;
  v_week := v_league.state_json #> ARRAY['glow','weeks',p_week_date::text];
  IF v_league.state_json #>> '{glow,activeWeek}' IS DISTINCT FROM p_week_date::text OR
     jsonb_typeof(v_week) IS DISTINCT FROM 'object' OR
     coalesce((v_week->>'scoresLocked')::boolean,false) OR
     coalesce((v_week->>'finalized')::boolean,false) OR
     jsonb_typeof(v_week->'cards') IS DISTINCT FROM 'array' OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(v_week->'cards') x(value)
       WHERE coalesce((x.value->>'finalized')::boolean,false))
  THEN RAISE EXCEPTION 'glow_week_unavailable_or_locked' USING ERRCODE='22023'; END IF;
  v_fingerprint := md5(v_week::text);
  IF v_fingerprint IS DISTINCT FROM p_fingerprint
  THEN RAISE EXCEPTION 'glow_source_fingerprint_changed' USING ERRCODE='40001'; END IF;
  SELECT count(*) INTO v_count FROM public.hbnf_udisc_glow_event_bindings
   WHERE event_date=p_week_date AND event_id='hb-glow-doubles-tAP8Y5'
    AND window_start<=v_now AND window_end>v_now;
  IF v_count<>1 THEN RAISE EXCEPTION 'glow_event_window_changed' USING ERRCODE='22023'; END IF;
  v_sync := v_week->'udiscSync';
  IF v_sync->>'source' IS DISTINCT FROM 'UDisc event XLSX export' OR
     v_sync->>'eventId' IS DISTINCT FROM 'hb-glow-doubles-tAP8Y5' OR
     v_sync->>'weekDate' IS DISTINCT FROM p_week_date::text OR
     v_sync #>> '{status,state}' IS DISTINCT FROM 'fresh' OR
     v_sync #>> '{latest,signature}' IS DISTINCT FROM p_signature OR
     v_sync #>> '{status,lastSuccessAt}' IS NULL
  THEN RAISE EXCEPTION 'udisc_saved_ack_mismatch' USING ERRCODE='22023'; END IF;
  BEGIN
    v_success := (v_sync #>> '{status,lastSuccessAt}')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'udisc_saved_ack_time_invalid' USING ERRCODE='22023';
  END;
  IF v_success>v_now OR v_now-v_success>interval '10 minutes'
  THEN RAISE EXCEPTION 'udisc_saved_ack_expired' USING ERRCODE='22023'; END IF;

  SELECT revision,state INTO v_rev,v_state FROM hbnf_internal.cart_desired_state
   WHERE cart_id='hbnf-cart' FOR UPDATE;
  SELECT active,epoch,release_id INTO v_active,v_epoch,v_release FROM hbnf_internal.cart_actuator_fence
   WHERE cart_id='hbnf-cart' FOR SHARE;
  IF v_rev IS DISTINCT FROM p_cart_revision OR v_active IS DISTINCT FROM true OR
     v_epoch IS DISTINCT FROM p_fence_epoch OR v_release IS DISTINCT FROM p_release_id OR
     jsonb_typeof(v_state) IS DISTINCT FROM 'object' OR v_state->>'power' IS DISTINCT FROM 'on'
  THEN RAISE EXCEPTION 'cart_revision_or_release_fence_changed' USING ERRCODE='40001'; END IF;
  v_expected_key := 'glow-'||replace(p_week_date::text,'-','')||'-'||left(p_signature,20)||'-'||
     floor(extract(epoch FROM v_now)/240)::bigint::text;
  IF p_intent_key IS DISTINCT FROM v_expected_key
  THEN RAISE EXCEPTION 'glow_intent_bucket_or_signature_changed' USING ERRCODE='40001'; END IF;
  v_cursor := v_state->'glowScoreIntentCursor';
  IF v_cursor->>'key' IS NOT DISTINCT FROM p_intent_key AND
     v_cursor->>'sourceRevision' IS NOT DISTINCT FROM p_source_revision::text
  THEN RETURN jsonb_build_object('status','DUPLICATE','desired_revision',v_rev,'device_readback',false); END IF;
  v_now_ms := floor(extract(epoch FROM v_now)*1000)::bigint;
  v_overlays := coalesce(v_state->'overlays','[]'::jsonb);
  IF jsonb_typeof(v_overlays) IS DISTINCT FROM 'array' OR jsonb_typeof(p_next_state->'overlays') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'canonical_overlays_invalid' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_overlays) a(value)
     WHERE coalesce((a.value->>'priority')::integer,0)>=20
       AND coalesce((a.value->>'expiresAt')::bigint,0)>v_now_ms)
  THEN RAISE EXCEPTION 'owner_or_higher_priority_active' USING ERRCODE='40001'; END IF;
  -- Bound the existing reducer result to exactly one transient GLOW overlay;
  -- preserve power, brightness, audio, Vibe, Matrix/AUX and every other field.
  IF (p_next_state - 'overlays' - 'glowScoreIntentCursor' - 'revision' - 'lastCommandId')
     IS DISTINCT FROM (v_state - 'overlays' - 'glowScoreIntentCursor' - 'revision' - 'lastCommandId') OR
     (p_next_state->>'revision')::bigint IS DISTINCT FROM v_rev+1 OR
     p_next_state->>'lastCommandId' IS DISTINCT FROM p_command_id::text OR
     p_next_state #>> '{glowScoreIntentCursor,key}' IS DISTINCT FROM p_intent_key OR
     p_next_state #>> '{glowScoreIntentCursor,sourceRevision}' IS DISTINCT FROM p_source_revision::text
  THEN RAISE EXCEPTION 'canonical_desired_state_changed' USING ERRCODE='22023'; END IF;
  v_new := (p_next_state->'overlays')->(jsonb_array_length(p_next_state->'overlays')-1);
  v_entries := v_new #> '{payload,entries}';
  v_expiry := (v_new->>'expiresAt')::bigint;
  IF v_new->>'id' IS DISTINCT FROM p_intent_key OR
     v_new->>'kind' IS DISTINCT FROM 'scoreboard' OR
     (v_new->>'priority')::integer IS DISTINCT FROM 20 OR
     v_new #>> '{payload,label}' IS DISTINCT FROM 'GLOW' OR
     jsonb_typeof(v_entries) IS DISTINCT FROM 'array' OR
     jsonb_array_length(v_entries) NOT BETWEEN 1 AND 12 OR
     v_expiry NOT BETWEEN v_now_ms+5000 AND v_now_ms+20000 OR
     EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_entries) e(s)
      WHERE length(e.s) NOT BETWEEN 1 AND 48 OR e.s ~ '[[:cntrl:]]')
  THEN RAISE EXCEPTION 'glow_overlay_payload_invalid' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(a.value ORDER BY a.ord),'[]'::jsonb) INTO v_remaining
    FROM jsonb_array_elements(v_overlays) WITH ORDINALITY a(value,ord)
    WHERE coalesce((a.value->>'expiresAt')::bigint,0)>v_now_ms
      AND a.value->>'id' IS DISTINCT FROM p_intent_key;
  IF p_next_state->'overlays' IS DISTINCT FROM (v_remaining||jsonb_build_array(v_new))
  THEN RAISE EXCEPTION 'unrelated_overlay_reordered_or_removed' USING ERRCODE='22023'; END IF;

  SELECT accepted,duplicate,result_revision INTO v_accepted,v_duplicate,v_result
    FROM public.hbnf_cart_commit_command_bridge(
      'hbnf-cart',p_command_id,'OVERLAY_START',v_rev,p_next_state);
  IF v_accepted IS DISTINCT FROM true OR v_duplicate IS TRUE OR v_result IS DISTINCT FROM v_rev+1
  THEN RAISE EXCEPTION 'canonical_command_bridge_rejected' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('status','COMMITTED','desired_revision',v_result,
    'source_fingerprint',v_fingerprint,'device_readback',false);
END $fn$;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_source_snapshot(date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_commit_glow_intent(date,timestamptz,text,text,bigint,bigint,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_source_snapshot(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_commit_glow_intent(date,timestamptz,text,text,bigint,bigint,text,uuid,text,jsonb) TO service_role;
COMMIT;
