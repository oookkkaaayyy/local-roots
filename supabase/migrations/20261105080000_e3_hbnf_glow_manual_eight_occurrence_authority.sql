-- E3 HBNF Glow: expand the pre-existing manual organizer evidence boundary
-- to eight individually verified exact-date UDisc About pages. No scraping,
-- Edge deployment, event mutation, score import or recurring worker.
-- Apply ONLY as part of an independently admitted exact E3 release.
DO $e3_source_pre$
DECLARE s public.lr_sources%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.lr_sources
  WHERE key='hbnf_udisc_manual' FOR UPDATE;
 IF NOT FOUND OR s.id<>'a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid
    OR s.source_type<>'manual' OR s.enabled IS DISTINCT FROM true
    OR s.refresh_schedule IS NOT NULL
    OR s.permission_basis IS DISTINCT FROM 'The owner supplied the specific November 3, 10, and 17, 2026 organizer listing URLs and confirmed their facts. Retain only the listed event metadata and links; do not scrape or extrapolate to later dates.'
    OR s.notes IS DISTINCT FROM 'No automated retrieval. Exact event-specific facts from the owner-provided listings only; later Tuesdays remain unverified for time, venue, fee, and event URL.'
 THEN RAISE EXCEPTION 'E3 manual source authority identity/baseline drift'; END IF;
 IF (SELECT count(*) FROM public.lr_sources WHERE key='hbnf_udisc_manual')<>1
 THEN RAISE EXCEPTION 'E3 source nonunique'; END IF;
END; $e3_source_pre$;
UPDATE public.lr_sources SET
 permission_basis='Owner-authorized Local Roots manual verification of exactly eight organizer-managed HBNF Glow UDisc About pages dated Nov 3, 10, 17, 24 and Dec 1, 8, 15, 22 of 2026. Permit only per-occurrence date, event name, doubles format, venue, timezone, start/end times, $10/player (7 play plus 3 ace), separate unspecified course fee, and exact organizer event/course links. No automated UDisc retrieval, participant/results ingestion, invented registration URLs, or extension to unverified dates.',
 notes='Manual-only #161 eight dated organizer About pages verified 2026-11-04 PST; Dec 1/8 About details newly confirmed. UDisc pages are outbound event information, not asserted registration checkout links. Future new dates require distinct evidence. Source field verification timestamps are fixed, never refreshed by normal sync.'
WHERE id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid
 AND key='hbnf_udisc_manual';
DO $e3_source_post$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lr_sources
  WHERE id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid
  AND key='hbnf_udisc_manual' AND source_type='manual' AND enabled
  AND refresh_schedule IS NULL AND permission_basis='Owner-authorized Local Roots manual verification of exactly eight organizer-managed HBNF Glow UDisc About pages dated Nov 3, 10, 17, 24 and Dec 1, 8, 15, 22 of 2026. Permit only per-occurrence date, event name, doubles format, venue, timezone, start/end times, $10/player (7 play plus 3 ace), separate unspecified course fee, and exact organizer event/course links. No automated UDisc retrieval, participant/results ingestion, invented registration URLs, or extension to unverified dates.'
  AND notes='Manual-only #161 eight dated organizer About pages verified 2026-11-04 PST; Dec 1/8 About details newly confirmed. UDisc pages are outbound event information, not asserted registration checkout links. Future new dates require distinct evidence. Source field verification timestamps are fixed, never refreshed by normal sync.')
 THEN RAISE EXCEPTION 'E3 manual source update postcheck failed'; END IF;
END; $e3_source_post$;
