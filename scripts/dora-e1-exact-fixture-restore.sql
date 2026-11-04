-- DORA E1 exact-UUID database invariant restore, SAME-MANIFEST only.
-- Logical published-state restoration only: existing updated_at touch trigger
-- advances the clock; the immutable full preimage remains separately archived.
BEGIN;
LOCK TABLE public.lr_events, public.lr_event_sources, public.lr_results IN SHARE ROW EXCLUSIVE MODE;
DO $pre$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.lr_events WHERE
  id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND
  slug='hbnf-glow-2026-09-02' AND status='completed')
 OR (SELECT count(*) FROM public.lr_event_sources WHERE
  event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND
  id='3b6db90a-800e-4c46-927e-2df1d081f9c7'::uuid AND
  source_id='d77cfae0-8597-475a-8e05-ae96e2dbee6f'::uuid)<>1
 OR (SELECT count(*) FROM public.lr_results WHERE
  event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND
  source_id='d77cfae0-8597-475a-8e05-ae96e2dbee6f'::uuid AND
  player_name ~* '^Fixture([[:space:]]|$)')<>6
 THEN RAISE EXCEPTION 'E1 restore requires exactly admitted historical identity'; END IF;
END $pre$;
DROP TRIGGER IF EXISTS lr_results_00_dora_e1_write_barrier ON public.lr_results;
DROP TRIGGER IF EXISTS lr_event_sources_00_dora_e1_write_barrier ON public.lr_event_sources;
DROP TRIGGER IF EXISTS lr_events_01_dora_e1_write_barrier ON public.lr_events;
DROP FUNCTION IF EXISTS public.lr_dora_e1_dependent_write_barrier();
DROP FUNCTION IF EXISTS public.lr_dora_e1_event_write_barrier();
UPDATE public.lr_events SET published=true
WHERE id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND published IS FALSE;
DO $post$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.lr_events WHERE
  id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND
  status='completed' AND published IS TRUE)
 OR (SELECT count(*) FROM public.lr_results WHERE
  event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid)<>6
 OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE
  tgname IN ('lr_events_01_dora_e1_write_barrier',
    'lr_event_sources_00_dora_e1_write_barrier',
    'lr_results_00_dora_e1_write_barrier') AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'E1 rollback postcheck failed'; END IF;
END $post$;
COMMIT;
