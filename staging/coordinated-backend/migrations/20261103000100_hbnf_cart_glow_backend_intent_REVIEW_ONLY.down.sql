-- Exact rollback for the REVIEW_ONLY migration. NOT a production command.
BEGIN;
DROP FUNCTION IF EXISTS public.hbnf_cart_commit_glow_intent(date,timestamptz,text,text,bigint,bigint,text,uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.hbnf_cart_glow_source_snapshot(date);
COMMIT;
