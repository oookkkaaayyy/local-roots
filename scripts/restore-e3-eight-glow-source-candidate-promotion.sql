-- E3 exact eight-event event/source/candidate logical restore.
-- Review only. Run as ONE provider-managed transaction with the source-authority
-- restore, after same-manifest complete beforeimage equality and admission.
-- Preserve Sep 2 E1 history, Oct20 played events and prior source links.
SET LOCAL lock_timeout='5s';
LOCK TABLE public.lr_sources,public.lr_events,public.lr_event_sources,
 public.lr_source_runs,public.lr_source_candidates,
 public.lr_event_field_evidence,public.lr_event_change_log,
 public.lr_manual_overrides,public.lr_review_queue IN SHARE ROW EXCLUSIVE MODE;

DO $e3_restore_pre$
DECLARE
 sid constant uuid:='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;
 runid uuid;
BEGIN
 SELECT r.id INTO runid FROM public.lr_source_runs r
  WHERE r.source_id=sid AND r.metrics->>'release_id'='local-roots-events-e3-glow-20261104';
 IF runid IS NULL OR
  (SELECT count(*) FROM public.lr_source_runs r WHERE r.source_id=sid)<>1 OR
  (SELECT count(*) FROM public.lr_source_candidates c WHERE c.source_run_id=runid)<>8 OR
  (SELECT count(*) FROM public.lr_event_sources s WHERE s.source_id=sid)<>8 OR
  (SELECT count(*) FROM public.lr_manual_overrides mo
    WHERE mo.active AND mo.reason LIKE 'E3 exact organizer UDisc manual source %')<>16
 THEN RAISE EXCEPTION 'E3 restore exact release ownership changed'; END IF;
 IF (SELECT count(*) FROM public.lr_events e JOIN public.lr_event_sources s
      ON s.event_id=e.id AND s.source_id=sid
      WHERE e.slug IN ('hbnf-glow-2026-11-03','hbnf-glow-2026-11-10',
        'hbnf-glow-2026-11-17','hbnf-glow-2026-11-24','hbnf-glow-2026-12-01',
        'hbnf-glow-2026-12-08','hbnf-glow-2026-12-15','hbnf-glow-2026-12-22')
        AND e.name='HB Night Flyers Glow Doubles' AND e.event_type='doubles'
        AND e.published=true AND e.entry_fee_amount=10
        AND e.official_url=s.source_url
        -- Every value the reverse UPDATE would overwrite must still be
        -- the E3-installed value. Otherwise preserve subsequent real edits.
        AND e.start_date=substring(e.slug from 11)::date AND e.end_date=e.start_date
        AND e.city='Huntington Beach'
        AND e.course_name='Huntington Beach Central Park Disc Golf Course'
        AND e.course_id='A9Fe'
        AND e.course_url='https://udisc.com/courses/huntington-beach-central-park-A9Fe'
        AND e.format='Doubles'
        AND e.format_details='{"registration_mode":"Individual"}'::jsonb
        AND e.start_time_local='17:30'::time AND e.end_time_local='21:00'::time
        AND e.entry_fee_currency='USD' AND e.entry_fee_unit='person'
        AND e.fee_breakdown='[{"label":"Play","amount":7,"currency":"USD"},{"label":"Ace contribution","amount":3,"currency":"USD"}]'::jsonb
        AND e.additional_fees_note='Standard course fee payable separately; amount not specified.'
        AND e.status=CASE WHEN e.start_date='2026-11-03'::date THEN 'completed' ELSE 'upcoming' END
        AND (SELECT count(*) FROM public.lr_event_sources s2
           WHERE s2.event_id=e.id AND s2.source_id<>sid)=1)<>8
 THEN RAISE EXCEPTION 'E3 restored targets/provenance changed'; END IF;
 -- Four real November 3 results existed before E3. Preserve their exact
 -- full-row canonical PostgreSQL JSONB SHA-256 on reversal. The same-manifest
 -- restore transaction must first set localroots.e3_prechange_results_sha256
 -- to the independently downloaded accepted BEFORE-image digest.
 -- Missing or changed results MUST fail closed. Do not mutate lr_results.
 IF nullif(current_setting('localroots.e3_prechange_results_sha256',true),'') IS NULL
    OR current_setting('localroots.e3_prechange_results_sha256',true) !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'E3 original result fingerprint missing from admitted recovery'; END IF;
 IF (SELECT encode(pg_catalog.sha256(convert_to(
         coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb)::text,'UTF8')),'hex')
     FROM public.lr_results r WHERE r.event_id IN
       (SELECT e.id FROM public.lr_events e JOIN public.lr_event_sources s
        ON e.id=s.event_id WHERE s.source_id=sid))
    IS DISTINCT FROM current_setting('localroots.e3_prechange_results_sha256',true)
 THEN RAISE EXCEPTION 'E3 event gained results or changed baseline rows; do not erase'; END IF;
 IF EXISTS (SELECT 1 FROM public.lr_review_queue q WHERE q.source_candidate_id IN
      (SELECT c.id FROM public.lr_source_candidates c WHERE c.source_run_id=runid))
 OR EXISTS (SELECT 1 FROM public.lr_event_field_evidence f WHERE f.source_id=sid
      AND NOT EXISTS (SELECT 1 FROM public.lr_source_candidates c
        WHERE c.id=f.source_candidate_id AND c.source_run_id=runid
          AND c.match_event_id=f.event_id))
 OR EXISTS (SELECT 1 FROM public.lr_event_change_log l WHERE l.source_id=sid
      AND NOT EXISTS (SELECT 1 FROM public.lr_source_candidates c
        WHERE c.id=l.source_candidate_id AND c.source_run_id=runid
          AND c.match_event_id=l.event_id))
 THEN RAISE EXCEPTION 'E3 release sources acquired new dependent data'; END IF;
END; $e3_restore_pre$;

DELETE FROM public.lr_manual_overrides mo WHERE mo.active
 AND mo.reason LIKE 'E3 exact organizer UDisc manual source %'
 AND mo.event_id IN (SELECT event_id FROM public.lr_event_sources
     WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid);
DELETE FROM public.lr_event_field_evidence f
 WHERE f.source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;
DELETE FROM public.lr_event_change_log l
 WHERE l.source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;

UPDATE public.lr_events e SET
 name='HB Night Flyers Glow',event_type='other',
 format=NULL,format_details='{}'::jsonb,city=NULL,course_name=NULL,
 course_id=NULL,course_url=NULL,start_time_local=NULL,end_time_local=NULL,
 entry_fee_amount=NULL,entry_fee_currency=NULL,entry_fee_unit=NULL,
 fee_breakdown='[]'::jsonb,additional_fees_note=NULL,official_url=NULL
WHERE e.id IN (SELECT s.event_id FROM public.lr_event_sources s
 WHERE s.source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid);

DELETE FROM public.lr_event_sources
 WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;
DELETE FROM public.lr_source_candidates
 WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;
DELETE FROM public.lr_source_runs
 WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;

DO $e3_restore_post$
BEGIN
 IF EXISTS (SELECT 1 FROM public.lr_event_sources
  WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid)
 OR EXISTS (SELECT 1 FROM public.lr_event_field_evidence
  WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid)
 OR EXISTS (SELECT 1 FROM public.lr_source_candidates
  WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid)
 OR EXISTS (SELECT 1 FROM public.lr_source_runs
  WHERE source_id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid)
 OR (SELECT count(*) FROM public.lr_events
  WHERE slug IN ('hbnf-glow-2026-11-03','hbnf-glow-2026-11-10','hbnf-glow-2026-11-17',
   'hbnf-glow-2026-11-24','hbnf-glow-2026-12-01','hbnf-glow-2026-12-08',
   'hbnf-glow-2026-12-15','hbnf-glow-2026-12-22')
  AND published AND name='HB Night Flyers Glow' AND event_type='other'
  AND city IS NULL AND course_name IS NULL AND start_time_local IS NULL
  AND entry_fee_amount IS NULL AND official_url IS NULL)<>8
 THEN RAISE EXCEPTION 'E3 logical rollback postcheck mismatch'; END IF;
END; $e3_restore_post$;
