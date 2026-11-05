-- Reverse ONLY E3 manual source permission expansion. Do not run while
-- source-backed E3 event fields depend on the expanded authority: restore the
-- exact eight-event field/provenance preimage FIRST under its own release gate.
DO $e3_source_restore_pre$
DECLARE s public.lr_sources%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.lr_sources WHERE key='hbnf_udisc_manual' FOR UPDATE;
 IF NOT FOUND OR s.id<>'a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid
  OR s.permission_basis IS DISTINCT FROM 'Owner-authorized Local Roots manual verification of exactly eight organizer-managed HBNF Glow UDisc About pages dated Nov 3, 10, 17, 24 and Dec 1, 8, 15, 22 of 2026. Permit only per-occurrence date, event name, doubles format, venue, timezone, start/end times, $10/player (7 play plus 3 ace), separate unspecified course fee, and exact organizer event/course links. No automated UDisc retrieval, participant/results ingestion, invented registration URLs, or extension to unverified dates.'
  OR s.notes IS DISTINCT FROM 'Manual-only #161 eight dated organizer About pages verified 2026-11-04 PST; Dec 1/8 About details newly confirmed. UDisc pages are outbound event information, not asserted registration checkout links. Future new dates require distinct evidence. Source field verification timestamps are fixed, never refreshed by normal sync.'
 THEN RAISE EXCEPTION 'E3 rollback source authority changed; refuse restore'; END IF;
 IF EXISTS(SELECT 1 FROM public.lr_event_field_evidence f
  JOIN public.lr_events e ON e.id=f.event_id
  WHERE f.source_id=s.id
   AND e.slug IN ('hbnf-glow-2026-11-24','hbnf-glow-2026-12-01',
    'hbnf-glow-2026-12-08','hbnf-glow-2026-12-15','hbnf-glow-2026-12-22'))
 THEN RAISE EXCEPTION 'E3 expanded fields still linked; restore events first'; END IF;
END; $e3_source_restore_pre$;
UPDATE public.lr_sources SET
 permission_basis='The owner supplied the specific November 3, 10, and 17, 2026 organizer listing URLs and confirmed their facts. Retain only the listed event metadata and links; do not scrape or extrapolate to later dates.',
 notes='No automated retrieval. Exact event-specific facts from the owner-provided listings only; later Tuesdays remain unverified for time, venue, fee, and event URL.'
WHERE key='hbnf_udisc_manual' AND id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid;
DO $e3_source_restore_post$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lr_sources
  WHERE id='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3'::uuid
  AND permission_basis='The owner supplied the specific November 3, 10, and 17, 2026 organizer listing URLs and confirmed their facts. Retain only the listed event metadata and links; do not scrape or extrapolate to later dates.' AND notes='No automated retrieval. Exact event-specific facts from the owner-provided listings only; later Tuesdays remain unverified for time, venue, fee, and event URL.')
 THEN RAISE EXCEPTION 'E3 source registry logical rollback mismatch'; END IF;
END; $e3_source_restore_post$;
