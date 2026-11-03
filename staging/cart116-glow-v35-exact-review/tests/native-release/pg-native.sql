\set ON_ERROR_STOP on
\echo 'PG TEST: service-only privileges and exact type signatures'
DO $check$
BEGIN
 IF pg_catalog.has_function_privilege('anon', 'public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text)', 'EXECUTE')
 OR pg_catalog.has_function_privilege('authenticated', 'public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text)', 'EXECUTE')
 OR NOT pg_catalog.has_function_privilege('service_role', 'public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text)', 'EXECUTE')
 THEN RAISE EXCEPTION 'role privilege regression'; END IF;
 IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='hbnf_internal' AND table_name='cart_glow_overlay_challenges_v1' AND grantee in ('anon','authenticated')) THEN RAISE EXCEPTION 'data table publicly exposed'; END IF;
END $check$;
\echo 'PG TEST: direct service-role execution, JWT spoof prevention and one-use capability'
SET ROLE service_role;
SET request.jwt.claim.role='authenticated';
DO $bad$
BEGIN
 BEGIN
  PERFORM public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',7,3,'test-release-123','glow-20261103-nativecase','hbnf-0123456789abcdef0123456789abcdef',2000,repeat('a',64));
  RAISE EXCEPTION 'spoofed role accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $bad$;
SET request.jwt.claim.role='service_role';
SELECT public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',7,3,'test-release-123','glow-20261103-nativecase','hbnf-0123456789abcdef0123456789abcdef',2000,repeat('a',64)) AS cid \gset
\echo 'PG TEST: unresolved challenge blocks duplicate issuance'
DO $duplicate$
BEGIN
 BEGIN
  PERFORM public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',7,3,'test-release-123','glow-20261103-nativecase','hbnf-0123456789abcdef0123456789abcdef',2000,repeat('a',64));
  RAISE EXCEPTION 'duplicate issued';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
END $duplicate$;
SET cart116.challenge = :'cid';
DO $capability$
DECLARE c uuid := current_setting('cart116.challenge')::uuid;
BEGIN
 IF public.hbnf_cart_glow_overlay_v1_authorize('opal-hbnf-cart',c,'hbnf-0123456789abcdef0123456789abcdef',repeat('b',64)) THEN RAISE EXCEPTION 'wrong preimage authorized'; END IF;
 IF NOT public.hbnf_cart_glow_overlay_v1_authorize('opal-hbnf-cart',c,'hbnf-0123456789abcdef0123456789abcdef',repeat('a',64)) THEN RAISE EXCEPTION 'valid authorization rejected'; END IF;
 IF public.hbnf_cart_glow_overlay_v1_authorize('opal-hbnf-cart',c,'hbnf-0123456789abcdef0123456789abcdef',repeat('a',64)) THEN RAISE EXCEPTION 'second authorization replayed'; END IF;
 IF public.hbnf_cart_glow_overlay_v1_ack('opal-hbnf-cart',c,'hbnf-fedcba9876543210fedcba9876543210',repeat('a',64)) THEN RAISE EXCEPTION 'wrong overlay acknowledged'; END IF;
 IF NOT public.hbnf_cart_glow_overlay_v1_ack('opal-hbnf-cart',c,'hbnf-0123456789abcdef0123456789abcdef',repeat('a',64)) THEN RAISE EXCEPTION 'valid ACK rejected'; END IF;
 IF public.hbnf_cart_glow_overlay_v1_ack('opal-hbnf-cart',c,'hbnf-0123456789abcdef0123456789abcdef',repeat('a',64)) THEN RAISE EXCEPTION 'ACK replayed'; END IF;
 IF public.hbnf_cart_glow_overlay_v1_restored('opal-hbnf-cart',c,repeat('a',64),null) THEN RAISE EXCEPTION 'premature restore accepted'; END IF;
END $capability$;
SELECT pg_sleep(2.15);
DO $restore$
DECLARE c uuid := current_setting('cart116.challenge')::uuid;
BEGIN
 IF NOT public.hbnf_cart_glow_overlay_v1_restored('opal-hbnf-cart',c,repeat('a',64),null) THEN RAISE EXCEPTION 'valid restoration rejected'; END IF;
 IF public.hbnf_cart_glow_overlay_v1_restored('opal-hbnf-cart',c,repeat('a',64),null) THEN RAISE EXCEPTION 'restoration replay accepted'; END IF;
END $restore$;
\echo 'PG TEST: owner priority and stale fence fail closed'
RESET ROLE;
UPDATE hbnf_internal.cart_desired_state SET state=jsonb_build_object('power','on','overlays',jsonb_build_array(
 jsonb_build_object('id','glow-20261103-nativecase','kind','scoreboard','priority',20,'expiresAt',(floor(extract(epoch from clock_timestamp() + interval '25 seconds')*1000))::bigint,'payload',jsonb_build_object('label','GLOW','entries',jsonb_build_array('Player A -2'))),
 jsonb_build_object('id','owner-text','priority',50,'expiresAt',(floor(extract(epoch from clock_timestamp() + interval '25 seconds')*1000))::bigint))) WHERE cart_id='hbnf-cart';
SET ROLE service_role;
DO $owner$
BEGIN
 BEGIN
  PERFORM public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',7,3,'test-release-123','glow-20261103-nativecase','hbnf-fedcba9876543210fedcba9876543210',2000,repeat('c',64));
  RAISE EXCEPTION 'owner priority lost';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
END $owner$;
RESET ROLE;
UPDATE hbnf_internal.cart_desired_state SET state=jsonb_build_object('power','on','overlays',jsonb_build_array(
 jsonb_build_object('id','glow-20261103-nativecase','kind','scoreboard','priority',20,'expiresAt',(floor(extract(epoch from clock_timestamp() + interval '25 seconds')*1000))::bigint,'payload',jsonb_build_object('label','GLOW','entries',jsonb_build_array('Player A -2'))))) WHERE cart_id='hbnf-cart';
SET ROLE service_role;
DO $stale$
BEGIN
 BEGIN
  PERFORM public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',6,3,'test-release-123','glow-20261103-nativecase','hbnf-fedcba9876543210fedcba9876543210',2000,repeat('c',64));
  RAISE EXCEPTION 'stale desired revision accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 BEGIN
  PERFORM public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',7,2,'test-release-123','glow-20261103-nativecase','hbnf-fedcba9876543210fedcba9876543210',2000,repeat('c',64));
  RAISE EXCEPTION 'stale actuator fence accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
END $stale$;
RESET ROLE;
\echo 'PG PASS: all privilege, single-use, TTL, owner, and fence assertions'
