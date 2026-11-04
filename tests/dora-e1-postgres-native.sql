\set ON_ERROR_STOP on
-- PostgreSQL-native disposable fixture, NEVER run against production.
CREATE TABLE public.lr_events (id uuid PRIMARY KEY,slug text UNIQUE NOT NULL,
 status text NOT NULL,published boolean NOT NULL,updated_at timestamptz DEFAULT now());
CREATE TABLE public.lr_event_sources (id uuid PRIMARY KEY,event_id uuid NOT NULL
 REFERENCES public.lr_events(id),source_id uuid NOT NULL,external_id text,
 source_payload jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE public.lr_results (id uuid PRIMARY KEY,event_id uuid NOT NULL
 REFERENCES public.lr_events(id),source_id uuid NOT NULL,player_name text,
 place integer,total_score integer,updated_at timestamptz DEFAULT now());
CREATE FUNCTION public.lr_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END; $;
CREATE TRIGGER lr_events_touch_updated_at BEFORE UPDATE ON public.lr_events
 FOR EACH ROW EXECUTE FUNCTION public.lr_touch_updated_at();
CREATE TRIGGER lr_event_sources_touch_updated_at BEFORE UPDATE ON public.lr_event_sources
 FOR EACH ROW EXECUTE FUNCTION public.lr_touch_updated_at();
CREATE TRIGGER lr_results_touch_updated_at BEFORE UPDATE ON public.lr_results
 FOR EACH ROW EXECUTE FUNCTION public.lr_touch_updated_at();
INSERT INTO public.lr_events(id,slug,status,published) VALUES
 ('5e87e132-dfe9-41e5-8087-80d4b881caa0','hbnf-glow-2026-09-02','completed',true),
 ('11111111-1111-4111-8111-111111111111','real-hbnf-played','completed',true);
INSERT INTO public.lr_event_sources(id,event_id,source_id,external_id,source_payload) VALUES
 ('3b6db90a-800e-4c46-927e-2df1d081f9c7','5e87e132-dfe9-41e5-8087-80d4b881caa0',
  'd77cfae0-8597-475a-8e05-ae96e2dbee6f','hbnf:glow:2026-09-02','{"mode":"glow"}'),
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
  'd77cfae0-8597-475a-8e05-ae96e2dbee6f','hbnf:skins:2026-10-20','{}');
INSERT INTO public.lr_results(id,event_id,source_id,player_name,place,total_score)
 SELECT ('33333333-3333-4333-8333-'||lpad(n::text,12,'0'))::uuid,
  '5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid,
  'd77cfae0-8597-475a-8e05-ae96e2dbee6f'::uuid,
  'Fixture player '||n,n,50+n FROM generate_series(1,6) n;
INSERT INTO public.lr_results(id,event_id,source_id,player_name,place,total_score)
 VALUES('44444444-4444-4444-8444-444444444444',
 '11111111-1111-4111-8111-111111111111',
 'd77cfae0-8597-475a-8e05-ae96e2dbee6f','Real player',1,58);
CREATE TEMP TABLE e1_before_event AS SELECT to_jsonb(e)-'published'-'updated_at' event_snapshot FROM public.lr_events e
 WHERE slug='hbnf-glow-2026-09-02';
CREATE TEMP TABLE e1_before_links AS SELECT to_jsonb(es) source_snapshot FROM public.lr_event_sources es
 WHERE external_id='hbnf:glow:2026-09-02';
CREATE TEMP TABLE e1_before_results AS SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) results_snapshot FROM public.lr_results r
 WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0';

\i /tmp/dora-e1-invariant.sql
-- Replayed actual v7 write shapes. All fixture DML must be discarded, not throw.
UPDATE public.lr_events SET published=true,status='canceled' WHERE slug='hbnf-glow-2026-09-02';
UPDATE public.lr_event_sources SET source_payload='{"new":true}' WHERE external_id='hbnf:glow:2026-09-02';
DELETE FROM public.lr_results WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0';
INSERT INTO public.lr_results(id,event_id,source_id,player_name,place,total_score)
 SELECT ('55555555-5555-4555-8555-'||lpad(n::text,12,'0'))::uuid,
  '5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid,
  'd77cfae0-8597-475a-8e05-ae96e2dbee6f'::uuid,
  'Fixture replacement '||n,n,75+n FROM generate_series(1,6) n;
-- Genuine event CRUD must remain normal.
UPDATE public.lr_events SET published=false WHERE slug='real-hbnf-played';
UPDATE public.lr_event_sources SET source_payload='{"genuine":true}'
 WHERE external_id='hbnf:skins:2026-10-20';
DELETE FROM public.lr_results WHERE event_id='11111111-1111-4111-8111-111111111111';
INSERT INTO public.lr_results(id,event_id,source_id,player_name,place,total_score)
 VALUES('66666666-6666-4666-8666-666666666666',
 '11111111-1111-4111-8111-111111111111',
 'd77cfae0-8597-475a-8e05-ae96e2dbee6f','Real corrected',1,57);
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lr_events WHERE slug='hbnf-glow-2026-09-02'
  AND published=false AND status='completed') THEN RAISE EXCEPTION 'synthetic republished or misclassified'; END IF;
 IF (SELECT to_jsonb(e)-'published'-'updated_at' FROM public.lr_events e WHERE slug='hbnf-glow-2026-09-02')
    IS DISTINCT FROM (SELECT event_snapshot FROM e1_before_event) THEN RAISE EXCEPTION 'event field drift'; END IF;
 IF (SELECT to_jsonb(es) FROM public.lr_event_sources es WHERE external_id='hbnf:glow:2026-09-02')
    IS DISTINCT FROM (SELECT source_snapshot FROM e1_before_links) THEN RAISE EXCEPTION 'provenance mutated'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.lr_results r
  WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0')
    IS DISTINCT FROM (SELECT results_snapshot FROM e1_before_results) THEN RAISE EXCEPTION 'fixture result history lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lr_events WHERE slug='real-hbnf-played' AND published=false)
  OR NOT EXISTS(SELECT 1 FROM public.lr_results WHERE player_name='Real corrected')
  OR NOT EXISTS(SELECT 1 FROM public.lr_event_sources WHERE external_id='hbnf:skins:2026-10-20'
   AND source_payload->>'genuine'='true') THEN RAISE EXCEPTION 'real event blocked'; END IF;
END; $check$;
CREATE TEMP TABLE e1_timestamp AS SELECT updated_at stamp FROM public.lr_events WHERE slug='hbnf-glow-2026-09-02';
\i /tmp/dora-e1-invariant.sql
DO $check$ BEGIN
 IF (SELECT updated_at FROM public.lr_events WHERE slug='hbnf-glow-2026-09-02')
  IS DISTINCT FROM (SELECT stamp FROM e1_timestamp) THEN RAISE EXCEPTION 'idempotent reapply touched timestamp'; END IF;
END; $check$;
\i /tmp/dora-e1-rollback.sql
\i /tmp/dora-e1-rollback.sql
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lr_events WHERE slug='hbnf-glow-2026-09-02' AND status='completed' AND published=true)
  OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.lr_results r
  WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0')
  IS DISTINCT FROM (SELECT results_snapshot FROM e1_before_results)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN (
    'lr_events_01_dora_e1_write_barrier','lr_event_sources_00_dora_e1_write_barrier',
    'lr_results_00_dora_e1_write_barrier')) THEN RAISE EXCEPTION 'rollback failed'; END IF;
END; $check$;
SELECT 'PASS: exact UUID quarantine, six immutable rows, provenance, genuine-event behavior, idempotency, restore' AS e1_native_result;
