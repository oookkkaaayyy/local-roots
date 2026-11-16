\set ON_ERROR_STOP on
-- REVIEW-ONLY PostgreSQL 17 fixture, disposable CI database only.
BEGIN;
CREATE TABLE public.lr_publication_policy(version integer PRIMARY KEY);
INSERT INTO public.lr_publication_policy VALUES (2);
CREATE TABLE public.lr_scope_profiles(id integer PRIMARY KEY);
INSERT INTO public.lr_scope_profiles VALUES (1);
CREATE TABLE public.lr_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL,
 enabled boolean NOT NULL, trust_tier integer NOT NULL,
 verification_ttl interval NOT NULL, authoritative_fields text[] NOT NULL,
 default_confidence text NOT NULL
);
INSERT INTO public.lr_sources(key,enabled,trust_tier,verification_ttl,authoritative_fields,default_confidence)
SELECT key,true,2,interval '14 days',
 ARRAY['name','start_date','end_date','city','county','course_name','event_type'],'high'
FROM (VALUES ('udisc_organizer_listings'),('dgs_manual_discovery_only')) AS source(key);
CREATE TABLE public.lr_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL,
 name text NOT NULL,start_date date NOT NULL,end_date date NOT NULL,
 county text NOT NULL,city text NOT NULL,course_name text NOT NULL,event_type text NOT NULL,
 published boolean NOT NULL DEFAULT false,confidence text,last_verified_at timestamptz
);
CREATE TABLE public.lr_event_sources(
 event_id uuid NOT NULL,source_id uuid NOT NULL,external_id text NOT NULL,
 source_url text NOT NULL,source_role text,is_sanction_basis boolean,
 source_payload jsonb,confidence text
);
CREATE TABLE public.lr_event_field_evidence(
 event_id uuid NOT NULL,field_name text NOT NULL,source_id uuid NOT NULL,
 source_url text NOT NULL,status text NOT NULL,observed_value jsonb,
 verified_at timestamptz,expires_at timestamptz
);
INSERT INTO public.lr_events(
 id,slug,name,start_date,end_date,county,city,course_name,event_type,published,confidence,last_verified_at
) VALUES (
 '10000000-0000-4000-8000-000000000001','new-year-new-me-new-tags-2027','New Year, New Me, New Tags 2027',
 '2027-01-01','2027-01-01','Santa Barbara','Santa Maria','Waller Park','tournament',true,'high','2026-11-16 14:43:16+00'
);
INSERT INTO public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis)
SELECT '10000000-0000-4000-8000-000000000001',id,'dgs:fixture-existing',
 'https://www.discgolfscene.com/tournaments/New_Year_New_Me_New_Tags_2027','manual_verification',false
FROM public.lr_sources WHERE key='dgs_manual_discovery_only';
CREATE TEMP TABLE jan1_before AS
SELECT to_jsonb(e) AS event_row, to_jsonb(s) AS source_row
FROM public.lr_events e JOIN public.lr_event_sources s ON s.event_id=e.id
WHERE e.slug='new-year-new-me-new-tags-2027';
CREATE FUNCTION public.lr_candidate_validation_errors(payload jsonb) RETURNS jsonb
LANGUAGE sql AS $$
 SELECT CASE WHEN payload ?& ARRAY['name','start_date','end_date','city','county','course_name','event_type']
 AND nullif(payload->>'name','') IS NOT NULL
 THEN '[]'::jsonb ELSE '["missing required field"]'::jsonb END;
$$;
CREATE FUNCTION public.lr_candidate_scope_status(payload jsonb) RETURNS text
LANGUAGE sql AS $$
 SELECT CASE WHEN payload->>'county' IN ('Orange','San Diego','Kern','Santa Barbara')
 THEN 'in_scope' ELSE 'out_of_scope' END;
$$;
CREATE FUNCTION public.lr_match_candidate(p_source uuid,p_external text,p_payload jsonb)
RETURNS TABLE(method text,event_id uuid,ambiguous boolean)
LANGUAGE sql AS $$
 SELECT CASE WHEN s.event_id IS NULL THEN 'new' ELSE 'existing' END,
 s.event_id,false
 FROM (SELECT 1) x LEFT JOIN LATERAL (
 SELECT es.event_id FROM public.lr_event_sources es
 WHERE es.source_id=p_source AND es.external_id=p_external LIMIT 1
 ) s ON true;
$$;
\i /tmp/lr-review/stage.sql
\copy pg_temp.lr_review_occurrences FROM '/tmp/lr-review/occurrences.csv' CSV HEADER
SELECT set_config('local_roots.review_evidence_at',transaction_timestamp()::text,true);
\i /tmp/lr-review/admit.sql
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.lr_events) <> 37
    OR (SELECT count(*) FROM public.lr_events WHERE published) <> 37
    OR (SELECT count(*) FROM public.lr_event_sources) <> 37
    OR (SELECT count(*) FROM public.lr_event_field_evidence) <> 252
 THEN RAISE EXCEPTION 'PG17 admission fixture count mismatch'; END IF;
END $check$;
\i /tmp/lr-review/withdraw.sql
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.lr_events) <> 37
    OR (SELECT count(*) FROM public.lr_events WHERE published) <> 1
    OR (SELECT count(*) FROM public.lr_event_sources) <> 37
    OR (SELECT count(*) FROM public.lr_event_field_evidence) <> 252
 THEN RAISE EXCEPTION 'PG17 withdrawal modified or deleted candidate evidence'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM jan1_before b JOIN public.lr_events e ON to_jsonb(e)=b.event_row
   JOIN public.lr_event_sources s ON s.event_id=e.id AND to_jsonb(s)=b.source_row
 ) THEN RAISE EXCEPTION 'PG17 fixture altered the pre-existing January 1 event or its provenance'; END IF;
END $check$;
ROLLBACK;
\echo PG17_REVIEW_ONLY_ADMIT_36_WITHDRAW_36_PRESERVE_EXISTING_AND_EVIDENCE_PASS
