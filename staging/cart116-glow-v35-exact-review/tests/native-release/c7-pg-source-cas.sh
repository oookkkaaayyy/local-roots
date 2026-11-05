#!/usr/bin/env bash
# PG17 ephemeral fixture only. No provider/device commands and no credentials.
set -euo pipefail
: "$PG_CONTAINER"
test -n "$PG_CONTAINER"
cd "$(dirname "$0")/../.."
docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA hbnf_internal;
CREATE TABLE public.league_state(id bigint PRIMARY KEY,state_json jsonb,updated_at timestamptz);
CREATE TABLE public.hbnf_udisc_glow_event_bindings(event_date date PRIMARY KEY,event_id text UNIQUE,window_start timestamptz,window_end timestamptz);
CREATE TABLE hbnf_internal.cart_desired_state(cart_id text PRIMARY KEY,revision bigint,state jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE hbnf_internal.cart_actuator_fence(cart_id text PRIMARY KEY,active boolean,epoch bigint,release_id text);
CREATE TABLE hbnf_internal.cart_command_receipts(cart_id text,command_id uuid,revision bigint,command_type text,PRIMARY KEY(cart_id,command_id));
-- Isolated reproduction of the real installed Cart writer signature and CAS.
CREATE FUNCTION hbnf_internal.hbnf_cart_commit_command(
  p_cart_id text,p_command_id uuid,p_command_type text,p_expected_revision bigint,p_next_state jsonb)
 RETURNS TABLE(accepted boolean,duplicate boolean,result_revision bigint,current_state jsonb)
 LANGUAGE plpgsql AS $writer$
DECLARE rev bigint;
BEGIN
 SELECT revision INTO rev FROM hbnf_internal.cart_desired_state WHERE cart_id=p_cart_id FOR UPDATE;
 IF rev IS DISTINCT FROM p_expected_revision OR p_next_state->>'revision' IS DISTINCT FROM (rev+1)::text
 THEN RAISE EXCEPTION 'test_writer_stale' USING ERRCODE='40001'; END IF;
 UPDATE hbnf_internal.cart_desired_state SET revision=rev+1,state=p_next_state WHERE cart_id=p_cart_id;
 INSERT INTO hbnf_internal.cart_command_receipts VALUES(p_cart_id,p_command_id,rev+1,p_command_type);
 RETURN QUERY SELECT true,false,rev+1,p_next_state;
END $writer$;
INSERT INTO hbnf_internal.cart_desired_state(cart_id,revision,state)
 VALUES('hbnf-cart',0,'{"cartId":"hbnf-cart","power":"on","revision":0,"overlays":[],"devices":{}}');
INSERT INTO hbnf_internal.cart_actuator_fence
 VALUES('hbnf-cart',true,5,'hbnf-cart-foundation-v1-20260925');
INSERT INTO public.hbnf_udisc_glow_event_bindings VALUES
 ('2026-11-03','hb-glow-doubles-tAP8Y5','2026-11-04 01:30:00+00','2026-11-04 07:30:00+00');
INSERT INTO public.league_state(id,state_json,updated_at) VALUES(1,
 '{"glow":{"activeWeek":"2026-11-03","weeks":{"2026-11-03":{"date":"2026-11-03","scoresLocked":false,
 "udiscSync":{"source":"UDisc event XLSX export","eventId":"hb-glow-doubles-tAP8Y5",
 "weekDate":"2026-11-03","latest":{"signature":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}}}}}',
 '2026-11-05 01:43:35.537984+00');
SQL

docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql

docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
SET request.jwt.claim.role='anon';
DO $check$
BEGIN
 BEGIN
  PERFORM public.hbnf_cart_glow_source_snapshot('2026-11-03');
  RAISE EXCEPTION 'anon_snapshot_accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $check$;
SET request.jwt.claim.role='service_role';
DO $check$
DECLARE snap jsonb;
BEGIN
 snap:=public.hbnf_cart_glow_source_snapshot('2026-11-03');
 IF snap->>'delivery_policy' IS DISTINCT FROM 'HISTORICAL_PREVIEW_ONLY_NO_ACTUATION'
 OR snap->>'fingerprint' IS DISTINCT FROM md5((snap->'week')::text)
 THEN RAISE EXCEPTION 'historical_source_failed'; END IF;
 BEGIN
  PERFORM public.hbnf_cart_commit_glow_intent(
   '2026-11-03',snap->>'source_revision',snap->>'fingerprint',repeat('b',64),
   0,5,'hbnf-cart-foundation-v1-20260925',gen_random_uuid(),
   'glow-20261103-'||repeat('b',20)||'-1','{"cartId":"hbnf-cart"}'::jsonb);
  RAISE EXCEPTION 'historical_source_actuated';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
END $check$;
DO $setup$
DECLARE d text:=current_date::text;
BEGIN
 INSERT INTO public.hbnf_udisc_glow_event_bindings VALUES(
  current_date,'hb-glow-doubles-Ab123Z',clock_timestamp()-interval '1 hour',
  clock_timestamp()+interval '1 hour');
 UPDATE public.league_state SET
 state_json=jsonb_build_object('glow',jsonb_build_object('activeWeek',d,
 'weeks',jsonb_build_object(d,jsonb_build_object('date',d,'scoresLocked',false,
 'udiscSync',jsonb_build_object('source','UDisc event XLSX export',
 'eventId','hb-glow-doubles-Ab123Z','weekDate',d,
 'latest',jsonb_build_object('signature',repeat('b',64)),
 'status',jsonb_build_object('state','fresh',
 'lastSuccessAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))))))),
 updated_at=clock_timestamp() WHERE id=1;
END $setup$;
DO $check$
DECLARE d text:=current_date::text;snap jsonb;cmd uuid:=gen_random_uuid();
        ms bigint;k text;next_state jsonb;returned jsonb;old_md5 text;
BEGIN
 snap:=public.hbnf_cart_glow_source_snapshot(d);
 IF snap->>'delivery_policy' IS DISTINCT FROM 'WINDOW_OPEN_SOURCE_FRESHNESS_STILL_REQUIRED'
 THEN RAISE EXCEPTION 'fresh_source_not_recognized'; END IF;
 old_md5:=md5((snap->'week')::text);
 ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 k:='glow-'||replace(d,'-','')||'-'||repeat('b',20)||'-'||floor(ms::numeric/240000)::bigint::text;
 next_state:=jsonb_build_object('cartId','hbnf-cart','power','on','revision',1,
 'devices','{}'::jsonb,'lastCommandId',cmd::text,
 'glowScoreIntentCursor',jsonb_build_object('key',k,'sourceRevision',snap->>'source_revision'),
 'overlays',jsonb_build_array(jsonb_build_object('id',k,'kind','scoreboard',
 'priority',20,'expiresAt',ms+15000,
 'payload',jsonb_build_object('label','GLOW','entries',jsonb_build_array('Team A -11')))));
 BEGIN
  PERFORM public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   repeat('0',32),repeat('b',64),0,5,'hbnf-cart-foundation-v1-20260925',
   cmd,k,next_state);
  RAISE EXCEPTION 'stale_fingerprint_accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 BEGIN
  PERFORM public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   snap->>'fingerprint',repeat('0',64),0,5,'hbnf-cart-foundation-v1-20260925',
   cmd,k,next_state);
  RAISE EXCEPTION 'wrong_event_signature_accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 BEGIN
  PERFORM public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   snap->>'fingerprint',repeat('b',64),0,6,'hbnf-cart-foundation-v1-20260925',
   cmd,k,next_state);
  RAISE EXCEPTION 'wrong_fence_accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 BEGIN
  PERFORM public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   snap->>'fingerprint',repeat('b',64),0,5,'hbnf-cart-foundation-v1-20260925',
   cmd,k,next_state||'{"power":"off"}'::jsonb);
  RAISE EXCEPTION 'owner_power_rewrite_accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 returned:=public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   snap->>'fingerprint',repeat('b',64),0,5,'hbnf-cart-foundation-v1-20260925',
   cmd,k,next_state);
 IF returned->>'status' IS DISTINCT FROM 'COMMITTED' THEN
  RAISE EXCEPTION 'valid_commit_rejected: %',returned; END IF;
 returned:=public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   snap->>'fingerprint',repeat('b',64),0,5,'hbnf-cart-foundation-v1-20260925',
   cmd,k,next_state);
 IF returned->>'status' IS DISTINCT FROM 'DUPLICATE' THEN
  RAISE EXCEPTION 'valid_idempotent_retry_rejected: %',returned; END IF;
 IF (SELECT revision FROM hbnf_internal.cart_desired_state WHERE cart_id='hbnf-cart')<>1
 OR (SELECT count(*) FROM hbnf_internal.cart_command_receipts)<>1
 OR (SELECT md5(((state_json#>'{glow,weeks}')->d)::text) FROM public.league_state WHERE id=1)<>old_md5
 THEN RAISE EXCEPTION 'source_or_cart_mutated_twice'; END IF;
 BEGIN
  PERFORM public.hbnf_cart_commit_glow_intent(d,snap->>'source_revision',
   snap->>'fingerprint',repeat('b',64),1,5,'hbnf-cart-foundation-v1-20260925',
   gen_random_uuid(),k,next_state||'{"revision":2}'::jsonb);
  RAISE EXCEPTION 'existing_priority_overlay_overwritten';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
END $check$;
SQL
docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql
docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
DO $verify$
BEGIN
 IF to_regprocedure('public.hbnf_cart_glow_source_snapshot(text)') IS NOT NULL
 OR to_regprocedure('public.hbnf_cart_commit_glow_intent(text,text,text,text,bigint,bigint,text,uuid,text,jsonb)') IS NOT NULL
 OR to_regclass('hbnf_internal.cart_glow_overlay_challenges_v1') IS NOT NULL
 THEN RAISE EXCEPTION 'new_c7_objects_remain_after_inverse'; END IF;
 IF (SELECT revision FROM hbnf_internal.cart_desired_state WHERE cart_id='hbnf-cart')<>1
 THEN RAISE EXCEPTION 'down_touched_existing_cart_state'; END IF;
END $verify$;
SQL
echo "PASS C7 isolated PG17 source/event/role/fingerprint/CAS/idempotence/inverse"
