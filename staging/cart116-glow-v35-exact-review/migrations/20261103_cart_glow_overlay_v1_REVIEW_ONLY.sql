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

REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text) TO service_role;
COMMIT;
