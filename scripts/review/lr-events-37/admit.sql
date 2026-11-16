-- Review candidate under Events #162. Kept outside the migration path.
-- Run only inside a caller-owned transaction with all 37 reviewed CSV rows
-- loaded into pg_temp.lr_review_occurrences and the evidence timestamp set.
DO $review$
DECLARE
  occurrence record;
  candidate_payload jsonb;
  candidate_id uuid;
  matcher record;
  published_count integer := 0;
  verified_at timestamptz := current_setting('local_roots.review_evidence_at')::timestamptz;
BEGIN
  IF verified_at IS NULL OR NOT isfinite(verified_at) OR verified_at > transaction_timestamp()
    OR verified_at < transaction_timestamp() - interval '14 days' THEN
    RAISE EXCEPTION 'Tier-2 verification timestamp must be within 14 days';
  END IF;
  IF (SELECT count(*) FROM pg_temp.lr_review_occurrences) <> 37 THEN
    RAISE EXCEPTION 'Review candidate requires exactly 37 occurrences';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.lr_review_occurrences
    WHERE start_date < (transaction_timestamp() AT TIME ZONE 'America/Los_Angeles')::date
  ) THEN
    RAISE EXCEPTION 'Review candidate has past occurrences; regrade the exact scope';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lr_publication_policy WHERE version = 2
  ) THEN
    RAISE EXCEPTION 'Source Policy v2 is required';
  END IF;

  LOCK TABLE public.lr_sources, public.lr_scope_profiles IN SHARE MODE;
  LOCK TABLE public.lr_events, public.lr_event_sources IN SHARE ROW EXCLUSIVE MODE;

  FOR occurrence IN
    SELECT i.*, s.id AS source_id, s.default_confidence
    FROM pg_temp.lr_review_occurrences i
    LEFT JOIN public.lr_sources s ON s.key = i.source_key
      AND s.enabled AND s.trust_tier = 2 AND s.verification_ttl = interval '14 days'
      AND s.authoritative_fields @> ARRAY[
        'name','start_date','end_date','city','county','course_name','event_type'
      ]::text[]
    ORDER BY i.start_date, i.slug
  LOOP
    IF occurrence.source_id IS NULL OR occurrence.default_confidence IS NULL THEN
      RAISE EXCEPTION 'Missing enabled Tier-2 field authority for %', occurrence.slug;
    END IF;
    candidate_payload := jsonb_build_object(
      'name', occurrence.name, 'start_date', occurrence.start_date,
      'end_date', occurrence.start_date, 'city', occurrence.city, 'county', occurrence.county,
      'course_name', occurrence.course_name, 'event_type', occurrence.event_type
    );
    IF public.lr_candidate_validation_errors(candidate_payload) <> '[]'::jsonb
      OR public.lr_candidate_scope_status(candidate_payload) <> 'in_scope' THEN
      RAISE EXCEPTION 'Candidate validation or scope check failed for %', occurrence.slug;
    END IF;
    SELECT * INTO STRICT matcher FROM public.lr_match_candidate(
      occurrence.source_id, occurrence.external_id, candidate_payload
    );
    IF matcher.method IS DISTINCT FROM 'new' OR matcher.event_id IS NOT NULL
      OR matcher.ambiguous IS DISTINCT FROM false
      OR EXISTS (SELECT 1 FROM public.lr_events WHERE slug = occurrence.slug)
      OR EXISTS (
        SELECT 1 FROM public.lr_event_sources es
        JOIN public.lr_events e ON e.id = es.event_id
        WHERE es.source_id = occurrence.source_id AND es.source_url = occurrence.source_url
          AND e.start_date = occurrence.start_date
      ) THEN
      RAISE EXCEPTION 'Potential duplicate for %; review without inserting', occurrence.slug;
    END IF;

    INSERT INTO public.lr_events (
      slug, name, start_date, end_date, county, city, course_name, event_type,
      published, confidence, last_verified_at
    ) VALUES (
      occurrence.slug, occurrence.name, occurrence.start_date, occurrence.start_date,
      occurrence.county, occurrence.city, occurrence.course_name, occurrence.event_type,
      false, occurrence.default_confidence, verified_at
    ) RETURNING id INTO candidate_id;
    INSERT INTO public.lr_event_sources (
      event_id, source_id, external_id, source_url, source_role,
      is_sanction_basis, source_payload, confidence
    ) VALUES (
      candidate_id, occurrence.source_id, occurrence.external_id, occurrence.source_url,
      'manual_verification', false, candidate_payload, occurrence.default_confidence
    );
    INSERT INTO public.lr_event_field_evidence (
      event_id, field_name, source_id, source_url, status, observed_value, verified_at, expires_at
    )
    SELECT candidate_id, field.key, occurrence.source_id, occurrence.source_url,
      'verified', field.value, verified_at, verified_at + interval '14 days'
    FROM jsonb_each(candidate_payload) AS field;
    UPDATE public.lr_events SET published = true WHERE id = candidate_id;
    published_count := published_count + 1;
  END LOOP;

  IF published_count <> 37 OR (
    SELECT count(*) FROM public.lr_events e
    JOIN pg_temp.lr_review_occurrences i ON i.slug = e.slug
    WHERE e.published
  ) <> 37 THEN
    RAISE EXCEPTION 'Expected 37 published occurrences after source linkage';
  END IF;
END
$review$;
