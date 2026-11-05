-- E3 exact eight-event manual candidate release logical restore.
-- Run ONLY against exact archived same-manifest E3 baseline with fresh
-- prechange readback; MUST be followed within the same transaction by
-- scripts/restore-e3-hbnf-glow-manual-evidence-authority.sql.
-- Does not remove HBNF original source provenance, results, E1 or E2.
SET LOCAL lock_timeout='5s';
LOCK TABLE public.lr_sources, public.lr_events, public.lr_event_sources,
 public.lr_source_runs, public.lr_source_candidates,
 public.lr_event_field_evidence, public.lr_event_change_log,
 public.lr_manual_overrides, public.lr_review_queue IN SHARE ROW EXCLUSIVE MODE;
DO $e3_rollback$
DECLARE
 source_id uuid:='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;
 run_id uuid;
 cnt integer;
 date_id text;
 event_id uuid;
 event_before public.lr_events%ROWTYPE;
 normalized jsonb;
 current_url text;
BEGIN
 SELECT r.id INTO run_id FROM public.lr_source_runs r
 WHERE r.source_id=source_id
  AND r.metrics->>'release_id'='local-roots-events-e3-glow-20261104';
 IF run_id IS NULL OR
  (SELECT count(*) FROM public.lr_source_runs r WHERE r.source_id=source_id)<>1
  OR (SELECT count(*) FROM public.lr_source_candidates c WHERE c.source_run_id=run_id)<>8
  OR (SELECT count(*) FROM public.lr_event_sources es WHERE es.source_id=source_id)<>8
  OR (SELECT count(*) FROM public.lr_manual_overrides mo
       WHERE mo.active AND mo.reason LIKE 'E3 exact organizer UDisc manual source %')<>16
 THEN RAISE EXCEPTION 'E3 restore cannot prove exactly this release state'; END IF;
 IF EXISTS (SELECT 1 FROM public.lr_review_queue q
 WHERE q.source_candidate_id IN (SELECT c.id FROM public.lr_source_candidates c WHERE c.source_run_id=run_id))
 THEN RAISE EXCEPTION 'E3 candidates acquired review records; manual reconciliation before restore'; END IF;
 FOR date_id IN SELECT to_char(d,'YYYY-MM-DD') FROM
   unnest(ARRAY['2026-11-03','2026-11-10','2026-11-17','2026-11-24',
   '2026-12-01','2026-12-08','2026-12-15','2026-12-22']::date[]) d
 LOOP
  SELECT * INTO event_before FROM public.lr_events
   WHERE slug='hbnf-glow-'||date_id FOR UPDATE;
  SELECT es.source_url INTO current_url FROM public.lr_event_sources es
   WHERE es.source_id=source_id AND es.event_id=event_before.id;
  IF event_before.id IS NULL OR event_before.name<>'HB Night Flyers Glow Doubles'
   OR event_before.event_type<>'doubles' OR event_before.official_url IS DISTINCT FROM current_url
   OR event_before.entry_fee_amount<>10 OR event_before.published IS DISTINCT FROM true
   OR event_before.status<>CASE WHEN date_id='2026-11-03' THEN 'completed' ELSE 'upcoming' END
   OR (SELECT count(*) FROM public.lr_event_sources es WHERE es.event_id=event_before.id AND es.source_id<>source_id)<>1
  THEN RAISE EXCEPTION 'E3 event or original provenance changed since candidate: %',date_id; END IF;
  IF EXISTS (SELECT 1 FROM public.lr_results WHERE event_id=event_before.id)
  THEN RAISE EXCEPTION 'E3 event gained results; do not erase: %',date_id; END IF;
 END LOOP;
 -- Remove only recorded active pins and only release-owned source data.
 DELETE FROM public.lr_manual_overrides
 WHERE event_id IN (SELECT e.id FROM public.lr_events e
  WHERE e.slug IN ('hbnf-glow-2026-11-03','hbnf-glow-2026-11-10',
  'hbnf-glow-2026-11-17','hbnf-glow-2026-11-24','hbnf-glow-2026-12-01',
  'hbnf-glow-2026-12-08','hbnf-glow-2026-12-15','hbnf-glow-2026-12-22'))
 AND reason LIKE 'E3 exact organizer UDisc manual source %';
 DELETE FROM public.lr_event_field_evidence
 WHERE source_id=source_id AND source_candidate_id IN
  (SELECT id FROM public.lr_source_candidates WHERE source_run_id=run_id);
 DELETE FROM public.lr_event_change_log
 WHERE source_id=source_id AND source_candidate_id IN
  (SELECT id FROM public.lr_source_candidates WHERE source_run_id=run_id);
 -- Restore only exact preadmitted source-overridden structured event fields.
 FOR date_id IN SELECT to_char(d,'YYYY-MM-DD') FROM
   unnest(ARRAY['2026-11-03','2026-11-10','2026-11-17','2026-11-24',
   '2026-12-01','2026-12-08','2026-12-15','2026-12-22']::date[]) d
 LOOP
  SELECT id INTO event_id FROM public.lr_events WHERE slug='hbnf-glow-'||date_id;
  normalized:=jsonb_build_object(
   'name','HB Night Flyers Glow','event_type','other','format',null,
   'format_details','{}'::jsonb,'city',null,'course_name',null,'course_id',null,
   'course_url',null,'start_time_local',null,'end_time_local',null,
   'entry_fee_amount',null,'entry_fee_currency',null,'entry_fee_unit',null,
   'fee_breakdown','[]'::jsonb,'additional_fees_note',null,'official_url',null);
  PERFORM public.lr_apply_event_patch(event_id,normalized);
 END LOOP;
 DELETE FROM public.lr_event_sources WHERE source_id=source_id
 AND event_id IN (SELECT id FROM public.lr_events WHERE slug IN (
  'hbnf-glow-2026-11-03','hbnf-glow-2026-11-10','hbnf-glow-2026-11-17',
  'hbnf-glow-2026-11-24','hbnf-glow-2026-12-01','hbnf-glow-2026-12-08',
  'hbnf-glow-2026-12-15','hbnf-glow-2026-12-22'));
 DELETE FROM public.lr_source_candidates WHERE source_run_id=run_id;
 DELETE FROM public.lr_source_runs WHERE id=run_id;
 IF EXISTS (SELECT 1 FROM public.lr_event_field_evidence f WHERE f.source_id=source_id)
  OR EXISTS (SELECT 1 FROM public.lr_event_sources s WHERE s.source_id=source_id)
  OR EXISTS (SELECT 1 FROM public.lr_source_candidates c WHERE c.source_id=source_id)
 THEN RAISE EXCEPTION 'E3 source not fully restored'; END IF;
 IF (SELECT count(*) FROM public.lr_events WHERE
  slug IN ('hbnf-glow-2026-11-03','hbnf-glow-2026-11-10','hbnf-glow-2026-11-17',
  'hbnf-glow-2026-11-24','hbnf-glow-2026-12-01','hbnf-glow-2026-12-08',
  'hbnf-glow-2026-12-15','hbnf-glow-2026-12-22')
  AND published AND name='HB Night Flyers Glow' AND event_type='other'
  AND city IS NULL AND course_name IS NULL AND start_time_local IS NULL
  AND entry_fee_amount IS NULL AND official_url IS NULL)<>8
 THEN RAISE EXCEPTION 'E3 logical restore eight-field postcheck failed'; END IF;
END; $e3_rollback$;
