-- E3 one-time manual organizer source -> exact event link -> validated candidate
-- -> authoritative field evidence -> public event fields -> v7-safe manual pins.
-- REVIEW ONLY. Deploy only after E3 baseline/download-back and same-manifest
-- release:admit PASS. Combine atomically with E3 source-policy migration.
-- No Edge invocation, no UDisc automated access, no score/result mutation.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.lr_sources, public.lr_events, public.lr_event_sources,
 public.lr_source_runs, public.lr_source_candidates,
 public.lr_event_field_evidence, public.lr_event_change_log,
 public.lr_manual_overrides, public.lr_review_queue IN SHARE ROW EXCLUSIVE MODE;

DO $e3_promotion$
DECLARE
 manual_source public.lr_sources%ROWTYPE;
 occurrence record;
 event_before public.lr_events%ROWTYPE;
 run_id uuid;
 candidate_id uuid;
 linked_id uuid;
 applied_id uuid;
 verified_fields jsonb;
 payload jsonb;
 evidence jsonb;
 field_key text;
 n integer;
 expected_url text;
BEGIN
 SELECT * INTO manual_source FROM public.lr_sources
  WHERE key='hbnf_udisc_manual' FOR UPDATE;
 IF NOT FOUND OR manual_source.id<>'a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid
  OR manual_source.source_type<>'manual' OR manual_source.enabled IS NOT TRUE
  OR manual_source.refresh_schedule IS NOT NULL
  OR manual_source.permission_basis NOT LIKE 'Owner-authorized Local Roots manual verification of exactly eight organizer-managed%'
 THEN RAISE EXCEPTION 'E3 source-policy migration not admitted or scope changed'; END IF;
 IF EXISTS (SELECT 1 FROM public.lr_source_runs r WHERE r.source_id=manual_source.id)
  OR EXISTS (SELECT 1 FROM public.lr_source_candidates c WHERE c.source_id=manual_source.id)
  OR EXISTS (SELECT 1 FROM public.lr_event_sources es WHERE es.source_id=manual_source.id)
  OR EXISTS (SELECT 1 FROM public.lr_manual_overrides mo WHERE mo.event_id IN
    (SELECT id FROM public.lr_events WHERE slug IN (
     'hbnf-glow-2026-11-03','hbnf-glow-2026-11-10','hbnf-glow-2026-11-17','hbnf-glow-2026-11-24',
     'hbnf-glow-2026-12-01','hbnf-glow-2026-12-08','hbnf-glow-2026-12-15','hbnf-glow-2026-12-22')) AND mo.active)
 THEN RAISE EXCEPTION 'E3 manual organizer source, runs, links, candidates or overrides already in use'; END IF;
 IF (SELECT count(*) FROM public.lr_events WHERE
  slug IN ('hbnf-glow-2026-11-03','hbnf-glow-2026-11-10','hbnf-glow-2026-11-17','hbnf-glow-2026-11-24',
           'hbnf-glow-2026-12-01','hbnf-glow-2026-12-08','hbnf-glow-2026-12-15','hbnf-glow-2026-12-22')
  AND published=true AND name='HB Night Flyers Glow' AND event_type='other'
  AND city IS NULL AND course_name IS NULL AND format IS NULL AND start_time_local IS NULL
  AND end_time_local IS NULL AND entry_fee_amount IS NULL AND official_url IS NULL
  AND registration_url IS NULL)<>8
 THEN RAISE EXCEPTION 'E3 eight-event exact target preimage drift'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.lr_events
  WHERE id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid AND slug='hbnf-glow-2026-09-02'
  AND published=false AND status='completed')
  OR (SELECT count(*) FROM public.lr_results WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid)<>6
  OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname LIKE '%dora_e1%' AND NOT tgisinternal)<>3
 THEN RAISE EXCEPTION 'E3 E1 synthetic quarantine invariant drift'; END IF;

 INSERT INTO public.lr_source_runs(source_id,fetch_status,parse_status,validation_status,health_status,
  scheduler_status,records_seen,records_valid,records_changed,records_new,records_rejected,records_missing,
  parser_version,metrics)
 VALUES (manual_source.id,'skipped','ok','ok','running','skipped',8,0,0,0,0,0,
   'manual-exact-udisc-about-e3-20261104',
   jsonb_build_object('release_id','local-roots-events-e3-glow-20261104',
    'ingestion_mode','human_verified_exact_organizer_pages','automated_udisc_fetch',false,
    'source_commit','8cd25855f964c5c42149dfe3a3ac2adce224fd4e'))
 RETURNING id INTO run_id;
 FOR occurrence IN SELECT * FROM (VALUES
    ('2026-11-03','tAP8Y5'),
    ('2026-11-10','af85rU'),
    ('2026-11-17','C1mFl8'),
    ('2026-11-24','wHLqmp'),
    ('2026-12-01','1ff5RM'),
    ('2026-12-08','Jxxe98'),
    ('2026-12-15','ZhDgeK'),
    ('2026-12-22','fFa7Lz')
  ) AS x(event_date,udisc_id)
 LOOP
  SELECT * INTO event_before FROM public.lr_events e
   WHERE e.slug='hbnf-glow-'||occurrence.event_date FOR UPDATE;
  IF NOT FOUND OR event_before.start_date<>occurrence.event_date::date
   OR event_before.end_date<>occurrence.event_date::date
   OR event_before.published IS NOT TRUE
   OR event_before.name<>'HB Night Flyers Glow'
   OR event_before.event_type<>'other'
  THEN RAISE EXCEPTION 'E3 date identity changed: %',occurrence.event_date; END IF;
  expected_url:='https://udisc.com/events/hb-glow-doubles-'||occurrence.udisc_id||'/about';

  INSERT INTO public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,
     is_sanction_basis,source_payload,confidence,last_seen_at)
  VALUES(event_before.id,manual_source.id,'udisc:hb-glow:'||occurrence.event_date||':'||occurrence.udisc_id,
    expected_url,'organizer_confirmed',false,
    jsonb_build_object('origin','manual_verified_organizer_about','source_date',occurrence.event_date,
       'verification_timestamp','2026-11-05T07:21:29Z','registration_url_confirmed',false),
    1,now()) RETURNING id INTO linked_id;

  verified_fields:=jsonb_build_object(
   'name','HB Night Flyers Glow Doubles',
   'start_date',occurrence.event_date,
   'end_date',occurrence.event_date,
   'timezone','America/Los_Angeles',
   'county','Orange','city','Huntington Beach',
   'course_name','Huntington Beach Central Park Disc Golf Course',
   'course_id','A9Fe','course_url','https://udisc.com/courses/huntington-beach-central-park-A9Fe',
   'event_type','doubles','format','Doubles',
   'format_details',jsonb_build_object('registration_mode','Individual'),
   'start_time_local','17:30','end_time_local','21:00',
   'entry_fee_amount',10,'entry_fee_currency','USD','entry_fee_unit','person',
   'fee_breakdown',jsonb_build_array(
      jsonb_build_object('label','Play','amount',7,'currency','USD'),
      jsonb_build_object('label','Ace contribution','amount',3,'currency','USD')),
   'additional_fees_note','Standard course fee payable separately; amount not specified.',
   'official_url',expected_url);
  SELECT jsonb_object_agg(key,jsonb_build_object(
    'status','verified','source_key','hbnf_udisc_manual','source_url',
    CASE WHEN key='course_url' THEN 'https://udisc.com/courses/huntington-beach-central-park-A9Fe'
         ELSE expected_url END,
    'verified_at','2026-11-05T07:21:29Z','refresh_on_sync',false,
    'notes','Exact organizer-managed dated About page, manually checked; no automated UDisc ingestion.'))
   INTO evidence FROM jsonb_object_keys(verified_fields) key;
  payload:=verified_fields || jsonb_build_object('field_evidence',evidence,'source_url',expected_url);

  INSERT INTO public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
  VALUES(run_id,manual_source.id,'udisc:hb-glow:'||occurrence.event_date||':'||occurrence.udisc_id,
    expected_url,payload) RETURNING id INTO candidate_id;
  SELECT public.lr_apply_authoritative_candidate(candidate_id) INTO applied_id;
  IF applied_id IS DISTINCT FROM event_before.id
   OR NOT EXISTS (SELECT 1 FROM public.lr_source_candidates WHERE id=candidate_id
     AND match_event_id=event_before.id AND match_method='source_external_id'
     AND validation_status='valid' AND promotion_status='promoted')
  THEN RAISE EXCEPTION 'E3 candidate failed exact event matching / promotion: %',occurrence.event_date; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lr_events e WHERE e.id=event_before.id
   AND e.name='HB Night Flyers Glow Doubles' AND e.event_type='doubles'
   AND e.start_time_local='17:30'::time AND e.end_time_local='21:00'::time
   AND e.entry_fee_amount=10 AND e.official_url=expected_url
   AND e.registration_url IS NULL AND e.status=event_before.status AND e.published=true)
  THEN RAISE EXCEPTION 'E3 exact promoter readback failed: %',occurrence.event_date; END IF;

  -- Current installed v7 emits generic name/type. Only these two attributes
  -- need durable field pins to survive a subsequent ordinary scheduled sync.
  INSERT INTO public.lr_manual_overrides(event_id,field_name,original_value,override_value,reason,active)
  VALUES
   (event_before.id,'name',to_jsonb(event_before.name),to_jsonb('HB Night Flyers Glow Doubles'::text),
    'E3 exact organizer UDisc manual source '||expected_url||'; preserve against installed v7 generic schedule',true),
   (event_before.id,'event_type',to_jsonb(event_before.event_type),to_jsonb('doubles'::text),
    'E3 exact organizer UDisc manual source '||expected_url||'; preserve against installed v7 generic schedule',true);
 END LOOP;

 UPDATE public.lr_source_runs SET
  finished_at=now(),health_status='healthy',records_valid=8,records_changed=8,
  metrics=metrics||jsonb_build_object('manual_rows_promoted',8,'source_verification','eight_exact_dated_about_urls')
 WHERE id=run_id;
 SELECT count(*) INTO n FROM public.lr_events e JOIN public.lr_event_sources es ON es.event_id=e.id
  WHERE es.source_id=manual_source.id AND e.name='HB Night Flyers Glow Doubles'
   AND e.event_type='doubles' AND e.published=true
   AND e.entry_fee_amount=10 AND e.start_time_local='17:30'::time
   AND e.end_time_local='21:00'::time AND es.source_url=e.official_url;
 IF n<>8 OR (SELECT count(*) FROM public.lr_manual_overrides mo WHERE mo.active AND
   mo.event_id IN (SELECT event_id FROM public.lr_event_sources WHERE source_id=manual_source.id)
   AND mo.field_name IN ('name','event_type'))<>16
 THEN RAISE EXCEPTION 'E3 postcheck did not promote eight protected events'; END IF;
END; $e3_promotion$;
