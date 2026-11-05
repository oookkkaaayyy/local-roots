-- CART #116 v1 overlay-only protocol rollback; ONLY new objects are removed.
-- NEVER touch existing hbnf_cart_matrix_relay_* functions, Cart desired,
-- Owner observed state, firmware, or league_state. Apply solely under same manifest.
BEGIN;
DO $rollback_guard$
BEGIN
 IF EXISTS (SELECT 1 FROM hbnf_internal.cart_glow_overlay_challenges_v1
             WHERE restored_at IS NULL)
 THEN RAISE EXCEPTION 'unresolved_overlay_v1_challenge_requires_device_recovery' USING ERRCODE='55000';
 END IF;
END $rollback_guard$;
-- Reverse the source-intent contract first. No league_state/Cart state is deleted.
DROP FUNCTION IF EXISTS public.hbnf_cart_commit_glow_intent(text,text,text,text,bigint,bigint,text,uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_source_snapshot(text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text);
DROP TABLE IF EXISTS hbnf_internal.cart_glow_overlay_challenges_v1;
COMMIT;
