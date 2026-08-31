-- Source-control mirror of the already-applied production migration
-- 20260826170849_quarantine_legacy_ventura_disc_golf_domain.
--
-- Preserve the current first-party Ventura routing authority and make the
-- legacy domain quarantine idempotent. This intentionally does not promote
-- any event facts or expand this source's authoritative fields.

update public.lr_sources
set
  base_url = 'https://www.casitaswater.org/disc-golf',
  notes = case
    when coalesce(notes, '') like '%SOURCE-INTEGRITY WARNING 2026-08-26:%'
      then notes
    else rtrim(coalesce(notes, '')) || E'\nSOURCE-INTEGRITY WARNING 2026-08-26: the historical domain venturadiscgolf.com is no longer a Ventura Disc Golf Club source; current public content is unrelated golf-betting material. Do not use, cite, crawl, or treat that domain as organizer evidence. The current first-party routing authority remains the official Lake Casitas / Casitas Municipal Water District disc-golf page and other independently verified municipal/club-controlled public evidence.'
  end,
  updated_at = now()
where key = 'ventura_disc_golf_club_direct';
