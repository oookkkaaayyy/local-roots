-- CART #116 Track A: parallel overlay-ID protocol. NOT DEPLOYED.
-- Legacy hbnf_cart_matrix_relay_* functions and Owner state are untouched.
-- This source must only be applied under a distinct accepted two-phase manifest.
BEGIN;
CREATE TABLE hbnf_internal.cart_glow_overlay_challenges_v1 (
 challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 relay_id text NOT NULL CHECK (relay_id='opal-hbnf-cart'),
 cart_id text NOT NULL CHECK (cart_id='hbnf-cart'),
 desired_revision bigint NOT NULL,
 fence_epoch bigint NOT NULL,
 release_id text NOT NULL,
 canonical_overlay_id text NOT NULL,
 native_overlay_id text NOT NULL CHECK (native_overlay_id ~ '^hbnf-[a-f0-9]{32}$'),
 preimage_sha256 text NOT NULL CHECK (preimage_sha256 ~ '^[a-f0-9]{64}$'),
 ttl_ms integer NOT NULL CHECK (ttl_ms BETWEEN 1000 AND 20000),
 expires_at timestamptz NOT NULL,
 restore_deadline timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 apply_authorized_at timestamptz,
 acknowledged_at timestamptz,
 restored_at timestamptz
);
REVOKE ALL ON hbnf_internal.cart_glow_overlay_challenges_v1 FROM PUBLIC,anon,authenticated;
-- At most one unresolved overlay per cart across *all* desired revisions.
-- Do not garbage-collect unverified/indeterminate actuation: it needs a human
-- readback and a separate recovery transaction. Expiry is not proof of restore.
CREATE UNIQUE INDEX cart_glow_overlay_v1_open_cart_idx
 ON hbnf_internal.cart_glow_overlay_challenges_v1 (cart_id)
 WHERE restored_at IS NULL;
CREATE INDEX cart_glow_overlay_v1_expiry_idx
 ON hbnf_internal.cart_glow_overlay_challenges_v1 (restore_deadline);

-- All writers serialize desired Cart row then actuator fence, exactly as existing
-- revision-fence operations. Neither these functions nor this table write league_state.
CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_issue(
 p_relay_id text,p_desired_revision bigint,p_fence_epoch bigint,p_release_id text,
 p_canonical_overlay_id text,p_native_overlay_id text,p_ttl_ms integer,p_preimage_sha256 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_d record; v_f record; v_overlay jsonb; v_now timestamptz := clock_timestamp();
        v_now_ms bigint := floor(extract(epoch FROM v_now)*1000)::bigint;
        v_id uuid;
BEGIN
 -- The service role is checked by both PostgREST RPC privileges and JWT.
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('hbnf-cart-glow-overlay-v1'));
 v_now:=clock_timestamp(); v_now_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF p_relay_id IS DISTINCT FROM 'opal-hbnf-cart' OR p_desired_revision IS NULL OR
    p_fence_epoch IS NULL OR coalesce(p_release_id,'')='' OR
    p_canonical_overlay_id !~ '^glow-[a-zA-Z0-9-]{10,100}$' OR
    p_native_overlay_id !~ '^hbnf-[a-f0-9]{32}$' OR
    p_preimage_sha256 !~ '^[a-f0-9]{64}$' OR
    p_ttl_ms NOT BETWEEN 1000 AND 20000
 THEN RAISE EXCEPTION 'overlay_issue_invalid' USING ERRCODE='22023'; END IF;
 SELECT revision,state INTO v_d FROM hbnf_internal.cart_desired_state
 WHERE cart_id='hbnf-cart' FOR UPDATE;
 SELECT active,epoch,release_id INTO v_f FROM hbnf_internal.cart_actuator_fence
 WHERE cart_id='hbnf-cart' FOR SHARE;
 IF NOT FOUND OR v_d.revision IS DISTINCT FROM p_desired_revision OR
    v_f.active IS DISTINCT FROM true OR v_f.epoch IS DISTINCT FROM p_fence_epoch OR
    v_f.release_id IS DISTINCT FROM p_release_id OR v_d.state->>'power' IS DISTINCT FROM 'on' OR
    jsonb_typeof(v_d.state->'overlays') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'overlay_fence_changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_d.state->'overlays') o(value)
   WHERE (o.value->>'expiresAt')::bigint>v_now_ms
     AND coalesce((o.value->>'priority')::int,0)>=20
     AND o.value->>'id' IS DISTINCT FROM p_canonical_overlay_id)
 THEN RAISE EXCEPTION 'owner_or_higher_priority_active' USING ERRCODE='40001'; END IF;
 SELECT o.value INTO v_overlay FROM jsonb_array_elements(v_d.state->'overlays') o(value)
 WHERE o.value->>'id'=p_canonical_overlay_id AND o.value->>'kind'='scoreboard'
 AND o.value#>>'{payload,label}'='GLOW' AND (o.value->>'priority')::int=20
 AND (o.value->>'expiresAt')::bigint BETWEEN v_now_ms+1000 AND v_now_ms+30000;
 IF v_overlay IS NULL OR jsonb_typeof(v_overlay#>'{payload,entries}') IS DISTINCT FROM 'array' OR
    jsonb_array_length(v_overlay#>'{payload,entries}') NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'canonical_glow_overlay_missing' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM hbnf_internal.cart_glow_overlay_challenges_v1
   WHERE cart_id='hbnf-cart' AND restored_at IS NULL)
 THEN RAISE EXCEPTION 'overlay_challenge_already_open' USING ERRCODE='40001'; END IF;
 -- Expired-but-unconfirmed overlays remain locked out; never auto-delete.
 IF p_ttl_ms > ((v_overlay->>'expiresAt')::bigint - v_now_ms)
 THEN RAISE EXCEPTION 'glow_ttl_exceeds_canonical_expiry' USING ERRCODE='22023'; END IF;
 INSERT INTO hbnf_internal.cart_glow_overlay_challenges_v1
 (relay_id,cart_id,desired_revision,fence_epoch,release_id,canonical_overlay_id,
 native_overlay_id,preimage_sha256,ttl_ms,expires_at,restore_deadline)
 VALUES(p_relay_id,'hbnf-cart',p_desired_revision,p_fence_epoch,p_release_id,
 p_canonical_overlay_id,p_native_overlay_id,p_preimage_sha256,p_ttl_ms,
 v_now+interval '20 seconds',v_now+interval '75 seconds') RETURNING challenge_id INTO v_id;
 RETURN v_id;
END $fn$;

CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(
 p_relay_id text,p_challenge_id uuid,p_native_overlay_id text,p_preimage_sha256 text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_c hbnf_internal.cart_glow_overlay_challenges_v1%rowtype; v_d record;v_f record;
 v_now_ms bigint := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 -- The service role is checked by both PostgREST RPC privileges and JWT.
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('hbnf-cart-glow-overlay-v1'));
 v_now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 -- Advisory lock serializes all v1 challenge operations. The challenge-row
 -- lock precedes canonical desired/fence locks, but NO other transaction
 -- accesses the new challenge table; legacy Owner RPCs remain unchanged.
 SELECT * INTO v_c FROM hbnf_internal.cart_glow_overlay_challenges_v1
 WHERE relay_id=p_relay_id AND challenge_id=p_challenge_id FOR UPDATE;
 IF NOT FOUND OR v_c.expires_at<=clock_timestamp() OR
  v_c.apply_authorized_at IS NOT NULL OR v_c.acknowledged_at IS NOT NULL OR
  v_c.preimage_sha256 IS DISTINCT FROM p_preimage_sha256 OR
  v_c.native_overlay_id IS DISTINCT FROM p_native_overlay_id THEN RETURN false; END IF;
 SELECT revision,state INTO v_d FROM hbnf_internal.cart_desired_state
 WHERE cart_id=v_c.cart_id FOR UPDATE;
 SELECT active,epoch,release_id INTO v_f FROM hbnf_internal.cart_actuator_fence
 WHERE cart_id=v_c.cart_id FOR SHARE;
 IF v_d.revision IS DISTINCT FROM v_c.desired_revision OR v_f.active IS DISTINCT FROM true OR
  v_f.epoch IS DISTINCT FROM v_c.fence_epoch OR v_f.release_id IS DISTINCT FROM v_c.release_id OR
  v_d.state->>'power' IS DISTINCT FROM 'on' OR
  jsonb_typeof(v_d.state->'overlays') IS DISTINCT FROM 'array' OR
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_d.state->'overlays','[]'::jsonb)) o(value)
    WHERE o.value->>'id'=v_c.canonical_overlay_id AND o.value->>'kind'='scoreboard'
      AND o.value#>>'{payload,label}'='GLOW' AND (o.value->>'expiresAt')::bigint>v_now_ms) OR
  EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_d.state->'overlays','[]'::jsonb)) o(value)
    WHERE (o.value->>'expiresAt')::bigint>v_now_ms
      AND coalesce((o.value->>'priority')::int,0)>=20 AND
      o.value->>'id' IS DISTINCT FROM v_c.canonical_overlay_id)
 THEN RETURN false; END IF;
 UPDATE hbnf_internal.cart_glow_overlay_challenges_v1
 SET apply_authorized_at=clock_timestamp() WHERE challenge_id=p_challenge_id;
 RETURN true;
END $fn$;

CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_ack(
 p_relay_id text,p_challenge_id uuid,p_native_overlay_id text,p_preimage_sha256 text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_c hbnf_internal.cart_glow_overlay_challenges_v1%rowtype;v_d record;v_f record;
BEGIN
 -- The service role is checked by both PostgREST RPC privileges and JWT.
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('hbnf-cart-glow-overlay-v1'));
 -- The same advisory lock prevents competing challenge/ACK transactions.
 -- Canonical desired/fence rows are read and validated under row locks.
 SELECT * INTO v_c FROM hbnf_internal.cart_glow_overlay_challenges_v1
 WHERE relay_id=p_relay_id AND challenge_id=p_challenge_id FOR UPDATE;
 IF NOT FOUND OR v_c.restore_deadline<=clock_timestamp() OR
  v_c.apply_authorized_at IS NULL OR v_c.acknowledged_at IS NOT NULL OR
  v_c.native_overlay_id IS DISTINCT FROM p_native_overlay_id OR
  v_c.preimage_sha256 IS DISTINCT FROM p_preimage_sha256 THEN RETURN false; END IF;
 SELECT revision,state INTO v_d FROM hbnf_internal.cart_desired_state WHERE cart_id=v_c.cart_id FOR UPDATE;
 SELECT active,epoch,release_id INTO v_f FROM hbnf_internal.cart_actuator_fence WHERE cart_id=v_c.cart_id FOR SHARE;
 IF v_d.revision IS DISTINCT FROM v_c.desired_revision OR v_f.active IS DISTINCT FROM true OR
  v_f.epoch IS DISTINCT FROM v_c.fence_epoch OR v_f.release_id IS DISTINCT FROM v_c.release_id OR
  v_d.state->>'power' IS DISTINCT FROM 'on'
 THEN RETURN false; END IF;
 UPDATE hbnf_internal.cart_glow_overlay_challenges_v1 SET acknowledged_at=clock_timestamp()
 WHERE challenge_id=p_challenge_id;
 RETURN true;
END $fn$;

CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_restored(
 p_relay_id text,p_challenge_id uuid,p_preimage_sha256 text,p_observed_overlay_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_c hbnf_internal.cart_glow_overlay_challenges_v1%rowtype;
BEGIN
 -- The service role is checked by both PostgREST RPC privileges and JWT.
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('hbnf-cart-glow-overlay-v1'));
 -- The same advisory lock prevents competing challenge/ACK transactions.
 -- Canonical desired/fence rows are read and validated under row locks.
 SELECT * INTO v_c FROM hbnf_internal.cart_glow_overlay_challenges_v1
 WHERE relay_id=p_relay_id AND challenge_id=p_challenge_id FOR UPDATE;
 IF NOT FOUND OR v_c.acknowledged_at IS NULL OR v_c.restored_at IS NOT NULL OR
    v_c.restore_deadline<=clock_timestamp() OR
    v_c.preimage_sha256 IS DISTINCT FROM p_preimage_sha256 OR p_observed_overlay_id IS NOT NULL OR
    clock_timestamp()<v_c.acknowledged_at+make_interval(secs=>v_c.ttl_ms::double precision/1000.0)
 THEN RETURN false; END IF;
 UPDATE hbnf_internal.cart_glow_overlay_challenges_v1 SET restored_at=clock_timestamp()
 WHERE challenge_id=p_challenge_id;
 RETURN true;
END $fn$;


-- C7: service-role-only saved-source snapshot and revision/fence CAS.
-- These are part of the SAME reviewed overlay-v1 transaction, not a separate
-- replay writer. Historical scores can be inspected but are NEVER committed
-- as a live Cart command. Use existing public event bindings; no fixed date.
CREATE FUNCTION public.hbnf_cart_glow_source_snapshot(p_week_date text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $snapshot$
DECLARE v_state jsonb; v_week jsonb; v_updated timestamptz;
        v_event record; v_revision text; v_now timestamptz:=clock_timestamp();
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 IF p_week_date IS NULL OR p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION 'invalid_event_date' USING ERRCODE='22023'; END IF;
 SELECT event_date,event_id,window_start,window_end INTO v_event
 FROM public.hbnf_udisc_glow_event_bindings
 WHERE event_date=p_week_date::date;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown_governed_event' USING ERRCODE='P0002'; END IF;
 SELECT state_json,updated_at INTO v_state,v_updated
 FROM public.league_state WHERE id=1 FOR SHARE;
 IF NOT FOUND OR v_updated IS NULL THEN
   RAISE EXCEPTION 'authoritative_source_unavailable' USING ERRCODE='P0002'; END IF;
 v_week:=(v_state#>'{glow,weeks}')->p_week_date;
 IF jsonb_typeof(v_week) IS DISTINCT FROM 'object' OR
    v_week#>>'{udiscSync,eventId}' IS DISTINCT FROM v_event.event_id OR
    v_week#>>'{udiscSync,weekDate}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscSync,latest,signature}' !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'authoritative_event_or_signature_mismatch' USING ERRCODE='22023'; END IF;
 -- Historical XLSX remains readable only outside its event window. An XLSX
 -- record marked "fresh" must never be a LIVE Cart command source.
 IF v_now BETWEEN v_event.window_start AND v_event.window_end THEN
   IF v_week#>>'{udiscSync,source}' IS DISTINCT FROM 'UDisc explicitly authorized live source' OR
      v_week#>>'{udiscLive,schema}' IS DISTINCT FROM 'hbnf.udisc.live-lineage.v1' OR
      v_week#>>'{udiscLive,eventId}' IS DISTINCT FROM v_event.event_id OR
      v_week#>>'{udiscLive,weekDate}' IS DISTINCT FROM p_week_date OR
      v_week#>>'{udiscLive,sourceIdentity}' IS DISTINCT FROM v_event.event_id OR
      v_week#>>'{udiscLive,sourceMode}' IS DISTINCT FROM 'EXPLICITLY_AUTHORIZED_IN_ROUND' OR
      v_week#>>'{udiscLive,sourceFreshness}' IS DISTINCT FROM 'VERIFIED_PROVIDER_RECENT' OR
      coalesce(v_week#>>'{udiscLive,permissionReference}','') !~ '^[A-Za-z0-9._:/-]{5,128}$' OR
      coalesce(v_week#>>'{udiscLive,cursor}','') !~ '^[1-9][0-9]{0,15}$' OR
      v_week#>>'{udiscSync,latest,sourceCursor}' IS DISTINCT FROM v_week#>>'{udiscLive,cursor}' OR
      v_week#>>'{udiscSync,latest,sourceUpdatedAt}' IS DISTINCT FROM v_week#>>'{udiscLive,sourceUpdatedAt}' OR
      v_week#>>'{udiscSync,latest,liveSourceReceipt}' IS DISTINCT FROM 'true' OR
      v_week#>>'{udiscLive,envelopeDigest}' IS DISTINCT FROM v_week#>>'{udiscSync,latest,signature}' OR
      jsonb_typeof(v_week#>'{udiscLive,acceptedHoles}') IS DISTINCT FROM 'object' OR
      -- A results-only latest cursor must not inherit prior accepted strokes.
      NOT EXISTS (
        SELECT 1 FROM jsonb_each(
          CASE WHEN jsonb_typeof(v_week#>'{udiscLive,acceptedHoles}')='object'
            THEN v_week#>'{udiscLive,acceptedHoles}' ELSE '{}'::jsonb END
        ) AS team(team_id,holes)
        CROSS JOIN LATERAL jsonb_each(
          CASE WHEN jsonb_typeof(team.holes)='object'
            THEN team.holes ELSE '{}'::jsonb END
        ) AS hole(hole_id,score)
        WHERE score->>'cursor'=v_week#>>'{udiscLive,cursor}'
          AND score->>'strokes' ~ '^[0-9]{1,2} USING ERRCODE='22023'; END IF;
 ELSE
   IF v_week#>>'{udiscSync,source}' IS DISTINCT FROM 'UDisc event XLSX export'
   THEN RAISE EXCEPTION 'historical_source_not_qualified' USING ERRCODE='22023'; END IF;
 END IF;
 v_revision:=to_char(v_updated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 RETURN jsonb_build_object(
   'state_json',v_state,'week',v_week,'fingerprint',md5(v_week::text),
   'source_revision',v_revision,'event_date',v_event.event_date::text,
   'event_id',v_event.event_id,
   'window_start',to_char(v_event.window_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'window_end',to_char(v_event.window_end AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'delivery_policy',CASE WHEN v_now BETWEEN v_event.window_start AND v_event.window_end
     THEN 'WINDOW_OPEN_SOURCE_FRESHNESS_STILL_REQUIRED' ELSE 'HISTORICAL_PREVIEW_ONLY_NO_ACTUATION' END
 );
END $snapshot$;

CREATE FUNCTION public.hbnf_cart_commit_glow_intent(
 p_week_date text,p_source_revision text,p_fingerprint text,p_signature text,
 p_cart_revision bigint,p_fence_epoch bigint,p_release_id text,
 p_command_id uuid,p_intent_key text,p_next_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE v_state jsonb;v_week jsonb;v_updated timestamptz;v_event record;
        v_fence record;v_desired record;v_now timestamptz:=clock_timestamp();
        v_ms bigint;v_signature text;v_revision text;v_success timestamptz;
        v_expected_key text;v_overlay jsonb;v_old_active jsonb;v_new_other jsonb;
        v_receipt record;v_out record;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 IF p_week_date IS NULL OR p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    OR p_source_revision IS NULL OR p_source_revision !~ '^20[0-9]{2}-'
    OR p_fingerprint !~ '^[0-9a-f]{32}$' OR p_signature !~ '^[0-9a-f]{64}$'
    OR p_command_id IS NULL OR p_intent_key IS NULL OR p_intent_key !~ '^glow-[0-9]{8}-[0-9a-f]{20}-[0-9]+$'
    OR p_cart_revision IS NULL OR p_fence_epoch IS NULL OR coalesce(p_release_id,'')=''
    OR jsonb_typeof(p_next_state) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'invalid_glow_intent_arguments' USING ERRCODE='22023'; END IF;
 -- Lock the source row through the following Cart write. A concurrent scoring
 -- update cannot slip between source fingerprint validation and commit.
 SELECT state_json,updated_at INTO v_state,v_updated
 FROM public.league_state WHERE id=1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'authoritative_source_missing' USING ERRCODE='40001'; END IF;
 v_week:=(v_state#>'{glow,weeks}')->p_week_date;
 v_revision:=to_char(v_updated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 IF jsonb_typeof(v_week) IS DISTINCT FROM 'object' OR
    v_revision IS DISTINCT FROM p_source_revision OR md5(v_week::text) IS DISTINCT FROM p_fingerprint OR
    v_state#>>'{glow,activeWeek}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscSync,weekDate}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscSync,source}' IS DISTINCT FROM 'UDisc explicitly authorized live source' OR
    v_week#>>'{udiscSync,latest,signature}' IS DISTINCT FROM p_signature OR
    v_week#>>'{udiscSync,latest,liveSourceReceipt}' IS DISTINCT FROM 'true' OR
    v_week#>>'{udiscLive,schema}' IS DISTINCT FROM 'hbnf.udisc.live-lineage.v1' OR
    v_week#>>'{udiscLive,eventId}' IS DISTINCT FROM v_week#>>'{udiscSync,eventId}' OR
    v_week#>>'{udiscLive,weekDate}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscLive,sourceMode}' IS DISTINCT FROM 'EXPLICITLY_AUTHORIZED_IN_ROUND' OR
    v_week#>>'{udiscLive,sourceFreshness}' IS DISTINCT FROM 'VERIFIED_PROVIDER_RECENT' OR
    coalesce(v_week#>>'{udiscLive,permissionReference}','') !~ '^[A-Za-z0-9._:/-]{5,128}$' OR
    coalesce(v_week#>>'{udiscLive,cursor}','') !~ '^[1-9][0-9]{0,15}$' OR
    v_week#>>'{udiscSync,latest,sourceCursor}' IS DISTINCT FROM v_week#>>'{udiscLive,cursor}' OR
    v_week#>>'{udiscSync,latest,sourceUpdatedAt}' IS DISTINCT FROM v_week#>>'{udiscLive,sourceUpdatedAt}' OR
    v_week#>>'{udiscLive,envelopeDigest}' IS DISTINCT FROM p_signature OR
    v_week#>>'{udiscLive,receivedAt}' IS DISTINCT FROM v_week#>>'{udiscSync,status,lastSuccessAt}' OR
    v_week#>>'{udiscSync,latest,observedAt}' IS DISTINCT FROM v_week#>>'{udiscSync,status,lastSuccessAt}' OR
    jsonb_typeof(v_week#>'{udiscLive,acceptedHoles}') IS DISTINCT FROM 'object' OR
    coalesce(v_week->>'scoresLocked','false')<>'false'
 THEN RAISE EXCEPTION 'stale_or_untrusted_score_source' USING ERRCODE='40001'; END IF;
 SELECT event_date,event_id,window_start,window_end INTO v_event
 FROM public.hbnf_udisc_glow_event_bindings
 WHERE event_date=p_week_date::date FOR SHARE;
 IF NOT FOUND OR v_week#>>'{udiscSync,eventId}' IS DISTINCT FROM v_event.event_id OR
    v_week#>>'{udiscLive,sourceIdentity}' IS DISTINCT FROM v_event.event_id OR
    v_now NOT BETWEEN v_event.window_start AND v_event.window_end
 THEN RAISE EXCEPTION 'historical_or_cross_event_source_not_live' USING ERRCODE='40001'; END IF;
 IF v_week#>>'{udiscSync,status,state}' IS DISTINCT FROM 'fresh' OR
    v_week#>>'{udiscSync,status,lastSuccessAt}' IS NULL OR
    v_week#>>'{udiscSync,status,lastSuccessAt}' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' 
 THEN RAISE EXCEPTION 'unverified_live_source_freshness' USING ERRCODE='40001'; END IF;
 v_success:=(v_week#>>'{udiscSync,status,lastSuccessAt}')::timestamptz;
 IF v_success>v_now OR v_success<v_now-interval '10 minutes'
 THEN RAISE EXCEPTION 'live_source_stale' USING ERRCODE='40001'; END IF;
 IF v_week#>>'{udiscLive,sourceUpdatedAt}' IS NULL OR
    v_week#>>'{udiscLive,sourceUpdatedAt}' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
 THEN RAISE EXCEPTION 'live_provider_timestamp_missing' USING ERRCODE='40001'; END IF;
 v_success:=(v_week#>>'{udiscLive,sourceUpdatedAt}')::timestamptz;
 IF v_success>v_now OR v_success<v_now-interval '10 minutes'
    OR v_success NOT BETWEEN v_event.window_start AND v_event.window_end
 THEN RAISE EXCEPTION 'live_provider_timestamp_stale' USING ERRCODE='40001'; END IF;
 v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 v_expected_key:='glow-'||replace(p_week_date,'-','')||'-'||left(p_signature,20)||'-'||floor(v_ms::numeric/240000)::bigint::text;
 IF p_intent_key IS DISTINCT FROM v_expected_key
 THEN RAISE EXCEPTION 'stale_or_forged_glow_intent_key' USING ERRCODE='40001'; END IF;
 -- Follow existing canonical Cart lock order (fence SHARE, desired UPDATE).
 -- No second full-state writer and no direct WLED/AUX call.
 SELECT active,epoch,release_id INTO v_fence FROM hbnf_internal.cart_actuator_fence
 WHERE cart_id='hbnf-cart' FOR SHARE;
 SELECT revision,state INTO v_desired FROM hbnf_internal.cart_desired_state
 WHERE cart_id='hbnf-cart' FOR UPDATE;
 IF v_fence.active IS DISTINCT FROM true OR
    v_fence.epoch IS DISTINCT FROM p_fence_epoch OR
    v_fence.release_id IS DISTINCT FROM p_release_id OR
    v_desired.state->>'power' IS DISTINCT FROM 'on' OR
    jsonb_typeof(v_desired.state->'overlays') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'cart_release_fence_changed' USING ERRCODE='40001'; END IF;
 -- Exactly-once retry: a known command may return its old receipt only
 -- while its immutable source, event, current fence and original dispatch
 -- cursor still match. No new Cart revision or device command is issued.
 SELECT * INTO v_receipt FROM hbnf_internal.cart_command_receipts
 WHERE cart_id='hbnf-cart' AND command_id=p_command_id;
 IF FOUND THEN
   IF v_receipt.command_type IS DISTINCT FROM 'OVERLAY_START' OR
      v_desired.state#>>'{glowScoreIntentCursor,key}' IS DISTINCT FROM p_intent_key OR
      v_desired.state#>>'{glowScoreIntentCursor,sourceRevision}' IS DISTINCT FROM p_source_revision
   THEN RAISE EXCEPTION 'intent_replay_or_command_collision' USING ERRCODE='40001'; END IF;
   RETURN jsonb_build_object('status','DUPLICATE','desired_revision',v_receipt.revision);
 END IF;
 IF v_desired.revision IS DISTINCT FROM p_cart_revision
 THEN RAISE EXCEPTION 'cart_revision_changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_desired.state->'overlays') o(x)
     WHERE (o.x->>'expiresAt')::bigint>v_ms
       AND coalesce((o.x->>'priority')::integer,0)>=20)
 THEN RAISE EXCEPTION 'manual_or_owner_overlay_active' USING ERRCODE='40001'; END IF;
 IF p_next_state->>'cartId' IS DISTINCT FROM 'hbnf-cart' OR
    p_next_state->>'revision' IS DISTINCT FROM (p_cart_revision+1)::text OR
    p_next_state->>'lastCommandId' IS DISTINCT FROM p_command_id::text OR
    p_next_state#>>'{glowScoreIntentCursor,key}' IS DISTINCT FROM p_intent_key OR
    p_next_state#>>'{glowScoreIntentCursor,sourceRevision}' IS DISTINCT FROM p_source_revision OR
    jsonb_typeof(p_next_state->'overlays') IS DISTINCT FROM 'array' OR
    (p_next_state - 'revision' - 'lastCommandId' - 'glowScoreIntentCursor' - 'overlays')
      IS DISTINCT FROM (v_desired.state - 'revision' - 'lastCommandId' - 'glowScoreIntentCursor' - 'overlays')
 THEN RAISE EXCEPTION 'non_overlay_canonical_state_change' USING ERRCODE='22023'; END IF;
 SELECT o.x INTO v_overlay FROM jsonb_array_elements(p_next_state->'overlays') o(x)
 WHERE o.x->>'id'=p_intent_key AND o.x->>'kind'='scoreboard'
   AND o.x->>'priority'='20' AND o.x#>>'{payload,label}'='GLOW';
 IF v_overlay IS NULL OR
    jsonb_typeof(v_overlay#>'{payload,entries}') IS DISTINCT FROM 'array' OR
    jsonb_array_length(v_overlay#>'{payload,entries}') NOT BETWEEN 1 AND 12 OR
    (v_overlay->>'expiresAt')::bigint NOT BETWEEN v_ms+1000 AND v_ms+30000 OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(v_overlay#>'{payload,entries}') s(v)
      WHERE jsonb_typeof(s.v) IS DISTINCT FROM 'string' OR length(s.v #>> '{}') NOT BETWEEN 1 AND 48)
 THEN RAISE EXCEPTION 'invalid_canonical_scoreboard_overlay' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY ord),'[]'::jsonb) INTO v_old_active
 FROM jsonb_array_elements(v_desired.state->'overlays') WITH ORDINALITY o(x,ord)
 WHERE (o.x->>'expiresAt')::bigint>v_ms;
 SELECT coalesce(jsonb_agg(x ORDER BY ord),'[]'::jsonb) INTO v_new_other
 FROM jsonb_array_elements(p_next_state->'overlays') WITH ORDINALITY o(x,ord)
 WHERE o.x->>'id' IS DISTINCT FROM p_intent_key;
 IF v_old_active IS DISTINCT FROM v_new_other
 THEN RAISE EXCEPTION 'owner_overlay_modified_by_glow' USING ERRCODE='40001'; END IF;
 -- One atomic internal command receipt+CAS. No league_state mutation.
 SELECT * INTO v_out FROM hbnf_internal.hbnf_cart_commit_command(
   'hbnf-cart',p_command_id,'OVERLAY_START',p_cart_revision,p_next_state);
 IF v_out.accepted IS DISTINCT FROM true OR v_out.duplicate IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'glow_commit_transaction_not_applied' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('status','COMMITTED','desired_revision',v_out.result_revision);
END $commit$;

REVOKE ALL ON FUNCTION public.hbnf_cart_glow_source_snapshot(text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_commit_glow_intent(text,text,text,text,bigint,bigint,text,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_source_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_commit_glow_intent(text,text,text,text,bigint,bigint,text,uuid,text,jsonb)
 TO service_role;


REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text) TO service_role;
COMMIT;

          AND (score->>'strokes')::integer BETWEEN 1 AND 99
      )
   THEN RAISE EXCEPTION 'live_source_lineage_not_verified' USING ERRCODE='22023'; END IF;
 ELSE
   IF v_week#>>'{udiscSync,source}' IS DISTINCT FROM 'UDisc event XLSX export'
   THEN RAISE EXCEPTION 'historical_source_not_qualified' USING ERRCODE='22023'; END IF;
 END IF;
 v_revision:=to_char(v_updated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 RETURN jsonb_build_object(
   'state_json',v_state,'week',v_week,'fingerprint',md5(v_week::text),
   'source_revision',v_revision,'event_date',v_event.event_date::text,
   'event_id',v_event.event_id,
   'window_start',to_char(v_event.window_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'window_end',to_char(v_event.window_end AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'delivery_policy',CASE WHEN v_now BETWEEN v_event.window_start AND v_event.window_end
     THEN 'WINDOW_OPEN_SOURCE_FRESHNESS_STILL_REQUIRED' ELSE 'HISTORICAL_PREVIEW_ONLY_NO_ACTUATION' END
 );
END $snapshot$;

CREATE FUNCTION public.hbnf_cart_commit_glow_intent(
 p_week_date text,p_source_revision text,p_fingerprint text,p_signature text,
 p_cart_revision bigint,p_fence_epoch bigint,p_release_id text,
 p_command_id uuid,p_intent_key text,p_next_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE v_state jsonb;v_week jsonb;v_updated timestamptz;v_event record;
        v_fence record;v_desired record;v_now timestamptz:=clock_timestamp();
        v_ms bigint;v_signature text;v_revision text;v_success timestamptz;
        v_expected_key text;v_overlay jsonb;v_old_active jsonb;v_new_other jsonb;
        v_receipt record;v_out record;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
 IF p_week_date IS NULL OR p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    OR p_source_revision IS NULL OR p_source_revision !~ '^20[0-9]{2}-'
    OR p_fingerprint !~ '^[0-9a-f]{32}$' OR p_signature !~ '^[0-9a-f]{64}$'
    OR p_command_id IS NULL OR p_intent_key IS NULL OR p_intent_key !~ '^glow-[0-9]{8}-[0-9a-f]{20}-[0-9]+$'
    OR p_cart_revision IS NULL OR p_fence_epoch IS NULL OR coalesce(p_release_id,'')=''
    OR jsonb_typeof(p_next_state) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'invalid_glow_intent_arguments' USING ERRCODE='22023'; END IF;
 -- Lock the source row through the following Cart write. A concurrent scoring
 -- update cannot slip between source fingerprint validation and commit.
 SELECT state_json,updated_at INTO v_state,v_updated
 FROM public.league_state WHERE id=1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'authoritative_source_missing' USING ERRCODE='40001'; END IF;
 v_week:=(v_state#>'{glow,weeks}')->p_week_date;
 v_revision:=to_char(v_updated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 IF jsonb_typeof(v_week) IS DISTINCT FROM 'object' OR
    v_revision IS DISTINCT FROM p_source_revision OR md5(v_week::text) IS DISTINCT FROM p_fingerprint OR
    v_state#>>'{glow,activeWeek}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscSync,weekDate}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscSync,source}' IS DISTINCT FROM 'UDisc explicitly authorized live source' OR
    v_week#>>'{udiscSync,latest,signature}' IS DISTINCT FROM p_signature OR
    v_week#>>'{udiscSync,latest,liveSourceReceipt}' IS DISTINCT FROM 'true' OR
    v_week#>>'{udiscLive,schema}' IS DISTINCT FROM 'hbnf.udisc.live-lineage.v1' OR
    v_week#>>'{udiscLive,eventId}' IS DISTINCT FROM v_week#>>'{udiscSync,eventId}' OR
    v_week#>>'{udiscLive,weekDate}' IS DISTINCT FROM p_week_date OR
    v_week#>>'{udiscLive,sourceMode}' IS DISTINCT FROM 'EXPLICITLY_AUTHORIZED_IN_ROUND' OR
    v_week#>>'{udiscLive,sourceFreshness}' IS DISTINCT FROM 'VERIFIED_PROVIDER_RECENT' OR
    coalesce(v_week#>>'{udiscLive,permissionReference}','') !~ '^[A-Za-z0-9._:/-]{5,128}$' OR
    coalesce(v_week#>>'{udiscLive,cursor}','') !~ '^[1-9][0-9]{0,15}$' OR
    v_week#>>'{udiscSync,latest,sourceCursor}' IS DISTINCT FROM v_week#>>'{udiscLive,cursor}' OR
    v_week#>>'{udiscSync,latest,sourceUpdatedAt}' IS DISTINCT FROM v_week#>>'{udiscLive,sourceUpdatedAt}' OR
    v_week#>>'{udiscLive,envelopeDigest}' IS DISTINCT FROM p_signature OR
    v_week#>>'{udiscLive,receivedAt}' IS DISTINCT FROM v_week#>>'{udiscSync,status,lastSuccessAt}' OR
    v_week#>>'{udiscSync,latest,observedAt}' IS DISTINCT FROM v_week#>>'{udiscSync,status,lastSuccessAt}' OR
    jsonb_typeof(v_week#>'{udiscLive,acceptedHoles}') IS DISTINCT FROM 'object' OR
    coalesce(v_week->>'scoresLocked','false')<>'false'
 THEN RAISE EXCEPTION 'stale_or_untrusted_score_source' USING ERRCODE='40001'; END IF;
 SELECT event_date,event_id,window_start,window_end INTO v_event
 FROM public.hbnf_udisc_glow_event_bindings
 WHERE event_date=p_week_date::date FOR SHARE;
 IF NOT FOUND OR v_week#>>'{udiscSync,eventId}' IS DISTINCT FROM v_event.event_id OR
    v_week#>>'{udiscLive,sourceIdentity}' IS DISTINCT FROM v_event.event_id OR
    v_now NOT BETWEEN v_event.window_start AND v_event.window_end
 THEN RAISE EXCEPTION 'historical_or_cross_event_source_not_live' USING ERRCODE='40001'; END IF;
 IF v_week#>>'{udiscSync,status,state}' IS DISTINCT FROM 'fresh' OR
    v_week#>>'{udiscSync,status,lastSuccessAt}' IS NULL OR
    v_week#>>'{udiscSync,status,lastSuccessAt}' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' 
 THEN RAISE EXCEPTION 'unverified_live_source_freshness' USING ERRCODE='40001'; END IF;
 v_success:=(v_week#>>'{udiscSync,status,lastSuccessAt}')::timestamptz;
 IF v_success>v_now OR v_success<v_now-interval '10 minutes'
 THEN RAISE EXCEPTION 'live_source_stale' USING ERRCODE='40001'; END IF;
 IF v_week#>>'{udiscLive,sourceUpdatedAt}' IS NULL OR
    v_week#>>'{udiscLive,sourceUpdatedAt}' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
 THEN RAISE EXCEPTION 'live_provider_timestamp_missing' USING ERRCODE='40001'; END IF;
 v_success:=(v_week#>>'{udiscLive,sourceUpdatedAt}')::timestamptz;
 IF v_success>v_now OR v_success<v_now-interval '10 minutes'
    OR v_success NOT BETWEEN v_event.window_start AND v_event.window_end
 THEN RAISE EXCEPTION 'live_provider_timestamp_stale' USING ERRCODE='40001'; END IF;
 v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 v_expected_key:='glow-'||replace(p_week_date,'-','')||'-'||left(p_signature,20)||'-'||floor(v_ms::numeric/240000)::bigint::text;
 IF p_intent_key IS DISTINCT FROM v_expected_key
 THEN RAISE EXCEPTION 'stale_or_forged_glow_intent_key' USING ERRCODE='40001'; END IF;
 -- Follow existing canonical Cart lock order (fence SHARE, desired UPDATE).
 -- No second full-state writer and no direct WLED/AUX call.
 SELECT active,epoch,release_id INTO v_fence FROM hbnf_internal.cart_actuator_fence
 WHERE cart_id='hbnf-cart' FOR SHARE;
 SELECT revision,state INTO v_desired FROM hbnf_internal.cart_desired_state
 WHERE cart_id='hbnf-cart' FOR UPDATE;
 IF v_fence.active IS DISTINCT FROM true OR
    v_fence.epoch IS DISTINCT FROM p_fence_epoch OR
    v_fence.release_id IS DISTINCT FROM p_release_id OR
    v_desired.state->>'power' IS DISTINCT FROM 'on' OR
    jsonb_typeof(v_desired.state->'overlays') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'cart_release_fence_changed' USING ERRCODE='40001'; END IF;
 -- Exactly-once retry: a known command may return its old receipt only
 -- while its immutable source, event, current fence and original dispatch
 -- cursor still match. No new Cart revision or device command is issued.
 SELECT * INTO v_receipt FROM hbnf_internal.cart_command_receipts
 WHERE cart_id='hbnf-cart' AND command_id=p_command_id;
 IF FOUND THEN
   IF v_receipt.command_type IS DISTINCT FROM 'OVERLAY_START' OR
      v_desired.state#>>'{glowScoreIntentCursor,key}' IS DISTINCT FROM p_intent_key OR
      v_desired.state#>>'{glowScoreIntentCursor,sourceRevision}' IS DISTINCT FROM p_source_revision
   THEN RAISE EXCEPTION 'intent_replay_or_command_collision' USING ERRCODE='40001'; END IF;
   RETURN jsonb_build_object('status','DUPLICATE','desired_revision',v_receipt.revision);
 END IF;
 IF v_desired.revision IS DISTINCT FROM p_cart_revision
 THEN RAISE EXCEPTION 'cart_revision_changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_desired.state->'overlays') o(x)
     WHERE (o.x->>'expiresAt')::bigint>v_ms
       AND coalesce((o.x->>'priority')::integer,0)>=20)
 THEN RAISE EXCEPTION 'manual_or_owner_overlay_active' USING ERRCODE='40001'; END IF;
 IF p_next_state->>'cartId' IS DISTINCT FROM 'hbnf-cart' OR
    p_next_state->>'revision' IS DISTINCT FROM (p_cart_revision+1)::text OR
    p_next_state->>'lastCommandId' IS DISTINCT FROM p_command_id::text OR
    p_next_state#>>'{glowScoreIntentCursor,key}' IS DISTINCT FROM p_intent_key OR
    p_next_state#>>'{glowScoreIntentCursor,sourceRevision}' IS DISTINCT FROM p_source_revision OR
    jsonb_typeof(p_next_state->'overlays') IS DISTINCT FROM 'array' OR
    (p_next_state - 'revision' - 'lastCommandId' - 'glowScoreIntentCursor' - 'overlays')
      IS DISTINCT FROM (v_desired.state - 'revision' - 'lastCommandId' - 'glowScoreIntentCursor' - 'overlays')
 THEN RAISE EXCEPTION 'non_overlay_canonical_state_change' USING ERRCODE='22023'; END IF;
 SELECT o.x INTO v_overlay FROM jsonb_array_elements(p_next_state->'overlays') o(x)
 WHERE o.x->>'id'=p_intent_key AND o.x->>'kind'='scoreboard'
   AND o.x->>'priority'='20' AND o.x#>>'{payload,label}'='GLOW';
 IF v_overlay IS NULL OR
    jsonb_typeof(v_overlay#>'{payload,entries}') IS DISTINCT FROM 'array' OR
    jsonb_array_length(v_overlay#>'{payload,entries}') NOT BETWEEN 1 AND 12 OR
    (v_overlay->>'expiresAt')::bigint NOT BETWEEN v_ms+1000 AND v_ms+30000 OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(v_overlay#>'{payload,entries}') s(v)
      WHERE jsonb_typeof(s.v) IS DISTINCT FROM 'string' OR length(s.v #>> '{}') NOT BETWEEN 1 AND 48)
 THEN RAISE EXCEPTION 'invalid_canonical_scoreboard_overlay' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY ord),'[]'::jsonb) INTO v_old_active
 FROM jsonb_array_elements(v_desired.state->'overlays') WITH ORDINALITY o(x,ord)
 WHERE (o.x->>'expiresAt')::bigint>v_ms;
 SELECT coalesce(jsonb_agg(x ORDER BY ord),'[]'::jsonb) INTO v_new_other
 FROM jsonb_array_elements(p_next_state->'overlays') WITH ORDINALITY o(x,ord)
 WHERE o.x->>'id' IS DISTINCT FROM p_intent_key;
 IF v_old_active IS DISTINCT FROM v_new_other
 THEN RAISE EXCEPTION 'owner_overlay_modified_by_glow' USING ERRCODE='40001'; END IF;
 -- One atomic internal command receipt+CAS. No league_state mutation.
 SELECT * INTO v_out FROM hbnf_internal.hbnf_cart_commit_command(
   'hbnf-cart',p_command_id,'OVERLAY_START',p_cart_revision,p_next_state);
 IF v_out.accepted IS DISTINCT FROM true OR v_out.duplicate IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'glow_commit_transaction_not_applied' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('status','COMMITTED','desired_revision',v_out.result_revision);
END $commit$;

REVOKE ALL ON FUNCTION public.hbnf_cart_glow_source_snapshot(text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_commit_glow_intent(text,text,text,text,bigint,bigint,text,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_source_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_commit_glow_intent(text,text,text,text,bigint,bigint,text,uuid,text,jsonb)
 TO service_role;


REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text) TO service_role;
COMMIT;
