\set ON_ERROR_STOP on
-- ISOLATED TEST DB ONLY. This never targets HBNF production.
CREATE SCHEMA hbnf_internal;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE hbnf_internal.cart_desired_state(cart_id text PRIMARY KEY, revision bigint NOT NULL, state jsonb NOT NULL);
CREATE TABLE hbnf_internal.cart_actuator_fence(cart_id text PRIMARY KEY, epoch bigint NOT NULL, release_id text NOT NULL, active boolean NOT NULL);
CREATE TABLE hbnf_internal.cart_matrix_relay_challenges(challenge_id uuid PRIMARY KEY);
INSERT INTO hbnf_internal.cart_desired_state VALUES ('hbnf-cart',7,jsonb_build_object('power','on','overlays',jsonb_build_array(jsonb_build_object('id','glow-20261103-nativecase','kind','scoreboard','priority',20,'expiresAt',(floor(extract(epoch from clock_timestamp() + interval '25 seconds')*1000))::bigint,'payload',jsonb_build_object('label','GLOW','entries',jsonb_build_array('Player A -2'))))));
INSERT INTO hbnf_internal.cart_actuator_fence VALUES('hbnf-cart',3,'test-release-123',true);
