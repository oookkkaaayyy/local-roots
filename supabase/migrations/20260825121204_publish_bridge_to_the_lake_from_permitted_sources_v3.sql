begin;

insert into public.lr_sources (
  key, name, source_type, base_url, access_method, permission_basis, enabled,
  authoritative_fields, refresh_schedule, notes
)
values (
  'la_county_parks_castaic_manual',
  'Los Angeles County Parks — Castaic Lake State Recreation Area',
  'manual',
  'https://parks.lacounty.gov/castaic-lake-state-recreation-area-2/',
  'Manual verification of the public first-party park page / LA County facility locator; no automated crawling.',
  'Official Los Angeles County Parks public information may be used for narrow venue/location facts such as facility identity, Castaic city/address, and Los Angeles County location. It does not establish tournament dates, sanctioning, registration, or organizer details.',
  true,
  array['county','city','venue_name']::text[],
  null,
  'Narrow location corroboration source only. Event schedule facts must come from a permitted event/organizer source.'
)
on conflict (key) do update
set name=excluded.name,
    source_type=excluded.source_type,
    base_url=excluded.base_url,
    access_method=excluded.access_method,
    permission_basis=excluded.permission_basis,
    enabled=excluded.enabled,
    authoritative_fields=excluded.authoritative_fields,
    refresh_schedule=excluded.refresh_schedule,
    notes=excluded.notes,
    updated_at=now();

insert into public.lr_events (
  slug, name, start_date, end_date, county, city, venue_name, course_name,
  event_type, sanctioned, tier, status, registration_status, registration_url,
  td_names, published, confidence, last_verified_at, internal_notes
)
select
  '2026-3rd-annual-bridge-to-the-lake',
  '3rd Annual Bridge to the Lake',
  date '2026-10-17',
  date '2026-10-17',
  'Los Angeles',
  'Castaic',
  'Castaic Lake State Recreation Area',
  'Castaic Lake Seasonal Course',
  'tournament',
  true,
  null,
  'announced',
  null,
  null,
  array['Jason Scott','Logan Turner']::text[],
  false,
  0.95,
  now(),
  'Published from the current TD-supplied SoCal DGC calendar after resolving the prior Castaic naming/date conflict. SoCal establishes event name/date/course/sanction status/TDs; LA County Parks independently establishes Castaic/Los Angeles County venue location. Registration URL intentionally omitted because the linked third-party registration page uses conflicting event naming and is not production authority.'
where not exists (
  select 1 from public.lr_events where slug='2026-3rd-annual-bridge-to-the-lake'
);

insert into public.lr_event_sources (
  event_id, source_id, external_id, source_url, source_role, is_sanction_basis,
  first_seen_at, last_seen_at, last_fetched_at, confidence
)
select e.id, s.id, 'socal:2026:3rd-annual-bridge-to-the-lake',
       'https://socaldiscgolfclub.com/upcoming-events/', 'manual_verification', true,
       now(), now(), now(), 0.98
from public.lr_events e
join public.lr_sources s on s.key='socal_dgc_manual_calendar'
where e.slug='2026-3rd-annual-bridge-to-the-lake'
  and not exists (
    select 1 from public.lr_event_sources x
    where x.source_id=s.id and x.external_id='socal:2026:3rd-annual-bridge-to-the-lake'
  );

insert into public.lr_event_sources (
  event_id, source_id, external_id, source_url, source_role, is_sanction_basis,
  first_seen_at, last_seen_at, last_fetched_at, confidence
)
select e.id, s.id, 'lacounty:castaic-lake-sra',
       'https://parks.lacounty.gov/castaic-lake-state-recreation-area-2/', 'official', false,
       now(), now(), now(), 0.99
from public.lr_events e
join public.lr_sources s on s.key='la_county_parks_castaic_manual'
where e.slug='2026-3rd-annual-bridge-to-the-lake'
  and not exists (
    select 1 from public.lr_event_sources x
    where x.source_id=s.id and x.external_id='lacounty:castaic-lake-sra'
  );

update public.lr_events
set published=true,
    last_verified_at=now(),
    updated_at=now()
where slug='2026-3rd-annual-bridge-to-the-lake';

update public.lr_review_queue
set status='resolved',
    resolved_at=now(),
    resolution='Resolved with the current permitted TD-supplied SoCal DGC calendar: 3rd Annual Bridge to the Lake, 2026-10-17, Castaic Lake Seasonal Course, TDs Jason Scott and Logan Turner. Los Angeles County Parks independently corroborates the Castaic / Los Angeles County venue location. Third-party registration naming was not used as production authority and no conflicting registration URL was promoted.'
where id='a5af91a2-8d61-404c-8a3a-2687db6d167b'
  and status='open';

commit;
