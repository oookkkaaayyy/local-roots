-- DORA E1: scoped fixture publication and historical-write invariant.
-- REVIEW ONLY. Apply after existing #162 same-manifest admission PASS.
-- Do not invoke the broad v7 sync to install or test this database guard.
BEGIN;
LOCK TABLE public.lr_events, public.lr_event_sources, public.lr_results IN SHARE ROW EXCLUSIVE MODE;
DO $pre$
DECLARE e public.lr_events%ROWTYPE; n integer; qualified integer;
BEGIN
 SELECT * INTO e FROM public.lr_events
  WHERE id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid FOR UPDATE;
 IF NOT FOUND OR e.slug IS DISTINCT FROM 'hbnf-glow-2026-09-02'
  OR e.status IS DISTINCT FROM 'completed'
  THEN RAISE EXCEPTION 'E1 identity/status mismatch'; END IF;
 SELECT count(*), count(*) FILTER(WHERE
  id='3b6db90a-800e-4c46-927e-2df1d081f9c7'::uuid AND
  source_id='d77cfae0-8597-475a-8e05-ae96e2dbee6f'::uuid AND
  external_id='hbnf:glow:2026-09-02') INTO n,qualified
 FROM public.lr_event_sources WHERE event_id=e.id;
 IF n<>1 OR qualified<>1 THEN RAISE EXCEPTION 'E1 provenance mismatch'; END IF;
 SELECT count(*), count(*) FILTER(WHERE
  source_id='d77cfae0-8597-475a-8e05-ae96e2dbee6f'::uuid AND
  player_name ~* '^Fixture([[:space:]]|$)') INTO n,qualified
 FROM public.lr_results WHERE event_id=e.id;
 IF n<>6 OR qualified<>6 THEN RAISE EXCEPTION 'E1 six-row identity mismatch'; END IF;
 -- Counts/IDs are a local safety check, NOT the separately required full-byte preimage comparison.
END $pre$;
CREATE OR REPLACE FUNCTION public.lr_dora_e1_event_write_barrier()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
AS $event$
DECLARE target CONSTANT uuid:='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.id=target THEN RETURN NULL; END IF;
  RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  IF NEW.id=target THEN RETURN NULL; END IF;
  RETURN NEW;
 END IF;
 IF OLD.id=target OR NEW.id=target THEN
  -- One allowed initial visibility correction. All subsequent source writes
  -- to this UUID, including published=true and canceled status, are no-ops.
  IF OLD.id=target AND NEW.id=target
   AND OLD.published IS TRUE AND NEW.published IS FALSE
   AND (to_jsonb(OLD)-'published')=(to_jsonb(NEW)-'published')
  THEN RETURN NEW; END IF;
  RETURN NULL;
 END IF;
 RETURN NEW;
END $event$;
CREATE OR REPLACE FUNCTION public.lr_dora_e1_dependent_write_barrier()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
AS $dependent$
DECLARE target CONSTANT uuid:='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.event_id=target THEN RETURN NULL; END IF;
  RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  IF NEW.event_id=target THEN RETURN NULL; END IF;
  RETURN NEW;
 END IF;
 IF OLD.event_id=target OR NEW.event_id=target THEN RETURN NULL; END IF;
 RETURN NEW;
END $dependent$;
REVOKE ALL ON FUNCTION public.lr_dora_e1_event_write_barrier() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lr_dora_e1_dependent_write_barrier() FROM PUBLIC;
DROP TRIGGER IF EXISTS lr_events_01_dora_e1_write_barrier ON public.lr_events;
CREATE TRIGGER lr_events_01_dora_e1_write_barrier BEFORE INSERT OR UPDATE OR DELETE
ON public.lr_events FOR EACH ROW EXECUTE FUNCTION public.lr_dora_e1_event_write_barrier();
DROP TRIGGER IF EXISTS lr_event_sources_00_dora_e1_write_barrier ON public.lr_event_sources;
CREATE TRIGGER lr_event_sources_00_dora_e1_write_barrier BEFORE INSERT OR UPDATE OR DELETE
ON public.lr_event_sources FOR EACH ROW EXECUTE FUNCTION public.lr_dora_e1_dependent_write_barrier();
DROP TRIGGER IF EXISTS lr_results_00_dora_e1_write_barrier ON public.lr_results;
CREATE TRIGGER lr_results_00_dora_e1_write_barrier BEFORE INSERT OR UPDATE OR DELETE
ON public.lr_results FOR EACH ROW EXECUTE FUNCTION public.lr_dora_e1_dependent_write_barrier();
UPDATE public.lr_events SET published=false
WHERE id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND published IS TRUE;
DO $post$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.lr_events WHERE
  id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND
  published IS FALSE AND status='completed')
 OR (SELECT count(*) FROM public.lr_results
  WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid)<>6
 OR (SELECT count(*) FROM public.lr_event_sources
  WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid)<>1
 THEN RAISE EXCEPTION 'E1 atomic postcheck failure'; END IF;
END $post$;
COMMIT;
