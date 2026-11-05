-- Events #157: precise manual rollback for the two Morley first-party records.
-- Review-only. Never run against changed production rows without exact preimage
-- and same-manifest rollback admission. Refuse any dependent result or review.
BEGIN;
DO $morley_restore_pre$
DECLARE src uuid; n integer;
BEGIN
 SELECT id INTO src FROM public.lr_sources WHERE key='morley_field_course_direct';
 IF src IS NULL THEN RAISE EXCEPTION 'Morley source absent; no rollback'; END IF;
 SELECT count(*) INTO n FROM public.lr_events
 WHERE slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026');
 IF n<>2 THEN RAISE EXCEPTION 'Morley target identities drifted'; END IF;
 SELECT count(*) INTO n FROM public.lr_event_sources es JOIN public.lr_events e ON e.id=es.event_id
 WHERE e.slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026')
 AND es.source_id=src AND es.source_role='organizer_confirmed'
 AND es.is_sanction_basis IS FALSE
 AND es.external_id IN (
  'morley:course-championships:2026-12-05:amateur',
  'morley:course-championships:2026-12-12:pro');
 IF n<>2 THEN RAISE EXCEPTION 'Morley provenance identity drifted'; END IF;
 IF EXISTS (SELECT 1 FROM public.lr_event_sources es JOIN public.lr_events e ON e.id=es.event_id
  WHERE e.slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')
  AND es.source_id<>src)
 OR EXISTS (SELECT 1 FROM public.lr_event_sources WHERE source_id=src AND
  event_id NOT IN (SELECT id FROM public.lr_events WHERE slug IN (
   'morley-field-amateur-course-championships-2026',
   'morley-field-pro-course-championship-2026')))
 THEN RAISE EXCEPTION 'Morley source acquired additional provenance; refuse rollback'; END IF;
 -- Covers each current foreign-key dependent table to prevent silent cascades or SET NULL.
 IF EXISTS (SELECT 1 FROM public.lr_results WHERE event_id IN (
    SELECT id FROM public.lr_events WHERE slug LIKE 'morley-field-%-course-championship%-2026') OR source_id=src)
 OR EXISTS (SELECT 1 FROM public.lr_event_change_log WHERE event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')) OR source_id=src)
 OR EXISTS (SELECT 1 FROM public.lr_event_field_evidence WHERE event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')) OR source_id=src)
 OR EXISTS (SELECT 1 FROM public.lr_event_submissions WHERE matched_event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')))
 OR EXISTS (SELECT 1 FROM public.lr_manual_overrides WHERE event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')))
 OR EXISTS (SELECT 1 FROM public.lr_result_submissions WHERE event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')))
 OR EXISTS (SELECT 1 FROM public.lr_review_queue WHERE event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')))
 OR EXISTS (SELECT 1 FROM public.lr_source_candidates WHERE match_event_id IN (
    SELECT id FROM public.lr_events WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026')) OR source_id=src)
 OR EXISTS (SELECT 1 FROM public.lr_source_runs WHERE source_id=src)
 OR EXISTS (SELECT 1 FROM public.lr_source_cursors WHERE source_id=src)
 OR EXISTS (SELECT 1 FROM public.lr_source_discovery_items WHERE source_id=src)
 THEN RAISE EXCEPTION 'Morley received dependent data or additional source usage; refuse destructive rollback'; END IF;
END; $morley_restore_pre$;

-- Unpublish before unlinking to preserve the published-provenance invariant.
UPDATE public.lr_events SET published=false
WHERE slug IN ('morley-field-amateur-course-championships-2026','morley-field-pro-course-championship-2026');
DELETE FROM public.lr_event_sources WHERE source_id=(
 SELECT id FROM public.lr_sources WHERE key='morley_field_course_direct')
 AND event_id IN (
 SELECT id FROM public.lr_events WHERE slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026'));
DELETE FROM public.lr_events WHERE slug IN (
 'morley-field-amateur-course-championships-2026',
 'morley-field-pro-course-championship-2026');
DELETE FROM public.lr_sources WHERE key='morley_field_course_direct';

DO $morley_restore_post$
BEGIN
 IF EXISTS (SELECT 1 FROM public.lr_sources WHERE key='morley_field_course_direct')
 OR EXISTS (SELECT 1 FROM public.lr_events WHERE slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026'))
 OR EXISTS (SELECT 1 FROM public.lr_event_sources WHERE external_id IN (
  'morley:course-championships:2026-12-05:amateur',
  'morley:course-championships:2026-12-12:pro'))
 THEN RAISE EXCEPTION 'Morley scoped rollback postcheck failed'; END IF;
END; $morley_restore_post$;
COMMIT;
