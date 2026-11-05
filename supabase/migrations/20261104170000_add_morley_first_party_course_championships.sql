-- Events #157: manual first-party Morley Field calendar coverage, Nov 2026.
-- REVIEW ONLY. No PDGA/DGS/UDisc ingestion, no source crawler, no Edge changes.
-- Source: https://www.morleyfield.com/tournament-schedule-results
-- The first-party course calendar supplies these two future dates, venue, times,
-- names and outbound registration links. It does NOT supply sanction tier, so
-- both sanctioned and tier are intentionally NULL, not inferred from linked sites.
BEGIN;

DO $morley_preflight$
BEGIN
 IF EXISTS (SELECT 1 FROM public.lr_sources WHERE key='morley_field_course_direct') THEN
  RAISE EXCEPTION 'Morley source already registered; refuse duplicate one-time promotion';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.lr_events e
  WHERE e.slug IN (
    'morley-field-amateur-course-championships-2026',
    'morley-field-pro-course-championship-2026'
  )
  OR (e.start_date IN (date '2026-12-05',date '2026-12-12')
     AND (e.course_name ILIKE '%Morley%' OR e.name ILIKE '%Morley Field%')
     AND e.name ILIKE '%Championship%')
 ) THEN RAISE EXCEPTION 'Morley championship identity already exists; manual reconciliation required';
 END IF;
END; $morley_preflight$;

INSERT INTO public.lr_sources(
 key,name,source_type,base_url,access_method,permission_basis,
 enabled,authoritative_fields,refresh_schedule,verification_ttl,notes
) VALUES (
 'morley_field_course_direct',
 'Morley Field Disc Golf Course — tournament schedule',
 'club','https://www.morleyfield.com/tournament-schedule-results',
 'Manual factual verification of the first-party course-operated tournament calendar; no automated crawler, PDGA/DGS/UDisc API or registration-site data ingestion.',
 'First-party Morley Field course operator publicly lists its own tournament names, dates, times, venue and outbound registration links. Only those source-visible facts may be stored; no sanction/tier/result value claims from linked third-party pages.',
 true,
 ARRAY['name','start_date','end_date','timezone','county','city','course_name','event_type','status','club_host','start_time_local','end_time_local','registration_url','official_url']::text[],
 NULL,interval '14 days',
 'Individually verified 2026-11-04: Amateur Dec 5 and Pro Dec 12-13; no sanction/tier promotion without separately permitted evidence.'
);

INSERT INTO public.lr_events (
 slug,name,start_date,end_date,timezone,county,city,course_name,event_type,
 status,sanctioned,tier,club_host,start_time_local,end_time_local,
 registration_url,official_url,published,confidence,last_verified_at,internal_notes
) VALUES
(
 'morley-field-amateur-course-championships-2026',
 'Amateur Morley Field Course Championships',
 date '2026-12-05',date '2026-12-05','America/Los_Angeles',
 'San Diego','San Diego','Morley Field Disc Golf Course','tournament',
 'upcoming',NULL,NULL,'Morley Field Disc Golf Course',
 time '08:30',time '16:30',
 'https://www.discgolfscene.com/tournament/Morley_Field_Course_Championships_Amateur_Divisions_2026',
 'https://www.morleyfield.com/tournament-schedule-results',
 false,0.98,now(),
 'Verified directly on first-party Morley Field tournament calendar 2026-11-04. Organizer link only to DGS; sanction/tier intentionally unadmitted.'
),
(
 'morley-field-pro-course-championship-2026',
 'Pro Morley Field Course Championship',
 date '2026-12-12',date '2026-12-13','America/Los_Angeles',
 'San Diego','San Diego','Morley Field Disc Golf Course','tournament',
 'upcoming',NULL,NULL,'Morley Field Disc Golf Course',
 time '08:30',time '15:00',
 'https://www.discgolfscene.com/tournaments/Morley_Field_Course_Championships_Pro_Divisions_2026/register',
 'https://www.morleyfield.com/tournament-schedule-results',
 false,0.98,now(),
 'Verified directly on first-party Morley Field tournament calendar 2026-11-04. Organizer link only to DGS; sanction/tier intentionally unadmitted.'
);

INSERT INTO public.lr_event_sources (
 event_id,source_id,external_id,source_url,source_role,
 is_sanction_basis,source_payload,confidence,last_seen_at
)
SELECT e.id,s.id,
 CASE e.slug
  WHEN 'morley-field-amateur-course-championships-2026' THEN 'morley:course-championships:2026-12-05:amateur'
  ELSE 'morley:course-championships:2026-12-12:pro'
 END,
 'https://www.morleyfield.com/tournament-schedule-results',
 'organizer_confirmed',false,
 jsonb_build_object('origin','first_party_course_calendar','checked_on','2026-11-04',
  'event_date',e.start_date,'registration_link_origin','operator_published'),
 0.98,now()
FROM public.lr_events e
CROSS JOIN public.lr_sources s
WHERE s.key='morley_field_course_direct'
 AND e.slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026'
 );

-- Publication only AFTER first-party provenance has been inserted.
UPDATE public.lr_events e SET published=true
WHERE e.slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026'
);

DO $morley_postcheck$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n
 FROM public.lr_events e JOIN public.lr_event_sources es ON es.event_id=e.id
 JOIN public.lr_sources s ON s.id=es.source_id
 WHERE s.key='morley_field_course_direct'
 AND e.slug IN (
  'morley-field-amateur-course-championships-2026',
  'morley-field-pro-course-championship-2026'
 )
 AND e.published IS TRUE AND e.status='upcoming'
 AND e.sanctioned IS NULL AND e.tier IS NULL
 AND es.source_role='organizer_confirmed' AND es.is_sanction_basis IS FALSE;
 IF n<>2 THEN RAISE EXCEPTION 'Morley first-party publication/provenance postcheck failed: %',n; END IF;
END; $morley_postcheck$;
COMMIT;
