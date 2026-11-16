-- Non-deleting containment for the exact candidate. Requires review and admission.
DO $review$
DECLARE
  withdrawn integer;
  verified_at timestamptz := current_setting('local_roots.review_evidence_at')::timestamptz;
BEGIN
  IF (SELECT count(*) FROM pg_temp.lr_review_occurrences) <> 36 THEN
    RAISE EXCEPTION 'Withdrawal requires exactly 36 reviewed occurrences';
  END IF;
  LOCK TABLE public.lr_events, public.lr_event_sources IN SHARE ROW EXCLUSIVE MODE;
  UPDATE public.lr_events e SET published = false
  FROM pg_temp.lr_review_occurrences i
  JOIN public.lr_sources s ON s.key = i.source_key
  JOIN public.lr_event_sources es ON es.source_id = s.id
    AND es.external_id = i.external_id AND es.source_url = i.source_url
  WHERE e.id = es.event_id AND e.slug = i.slug AND e.name = i.name
    AND e.start_date = i.start_date AND e.end_date = i.start_date
    AND e.city = i.city AND e.county = i.county AND e.course_name = i.course_name
    AND e.event_type = i.event_type AND e.last_verified_at = verified_at
    AND e.published;
  GET DIAGNOSTICS withdrawn = ROW_COUNT;
  IF withdrawn <> 36 THEN
    RAISE EXCEPTION 'Withdrawal identity mismatch: expected 36, got %', withdrawn;
  END IF;
END
$review$;
