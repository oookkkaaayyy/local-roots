-- CART #116 v1 overlay-only protocol rollback; ONLY new objects are removed.
-- NEVER touch existing hbnf_cart_matrix_relay_* functions, Cart desired,
-- Owner observed state, firmware, or league_state. Apply solely under same manifest.
BEGIN;
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_restored(text,uuid,text,text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_ack(text,uuid,text,text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_authorize(text,uuid,text,text);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_overlay_v1_issue(text,bigint,bigint,text,text,text,integer,text);
DROP TABLE IF EXISTS hbnf_internal.cart_glow_overlay_challenges_v1;
COMMIT;
