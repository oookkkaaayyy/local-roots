begin;

insert into public.lr_sources (
  key, name, source_type, base_url, access_method, permission_basis, enabled,
  authoritative_fields, refresh_schedule, notes
)
values
(
  'crpd_sapwi_manual',
  'Conejo Recreation & Park District — Sapwi Trails Community Park',
  'manual',
  'https://www.crpd.org/disc-golf-abd7a7f6-309d-44e5-876a-d0aa63d5f4e6',
  'Manual verification of CRPD public first-party park/disc-golf pages; no automated crawling.',
  'Conejo Recreation & Park District is the public park operator and identifies Sapwi Trails Community Park as a disc-golf facility. Its public agreements page separately identifies Conejo Disc Golf Club as the district partner supporting, operating and promoting disc golf at Sapwi Trails and Rabbit Flats. Use only for narrow venue/course/operator relationship facts, not tournament dates, sanctioning, registration or event-specific hosting unless explicitly stated.',
  true,
  array['venue_name','course_name']::text[],
  null,
  'Narrow first-party venue/course corroboration only.'
),
(
  'city_thousand_oaks_manual',
  'City of Thousand Oaks — official city information',
  'manual',
  'https://toaks.gov/about',
  'Manual verification of the City of Thousand Oaks public first-party website; no automated crawling.',
  'The official City of Thousand Oaks About page states that Thousand Oaks is located in Ventura County. Use only for narrow city/county geography corroboration; it does not establish disc-golf event facts.',
  true,
  array['county','city']::text[],
  null,
  'Narrow first-party geography corroboration only.'
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
  '2026-sapwi-trails-disc-golf-course-championships',
  'Sapwi Trails Disc Golf Course Championships',
  date '2026-09-26',
  date '2026-09-26',
  'Ventura',
  'Thousand Oaks',
  'Sapwi Trails Community Park',
  'Sapwi',
  'tournament',
  true,
  null,
  'announced',
  null,
  null,
  array['Seth Gregory']::text[],
  false,
  0.96,
  now(),
  'Published from the current detailed TD-supplied SoCal DGC schedule, which lists Sep. 26 only. The older SoCal sidebar/blog two-day representation is treated as stale because the current detailed schedule is the specific event row and was manually rechecked on 2026-08-25. Tier remains null because tier is outside the SoCal manual source authoritative-fields contract. Third-party discovery pages were not used as production authority. CRPD independently establishes Sapwi Trails as a disc-golf facility, and the City of Thousand Oaks independently establishes Thousand Oaks in Ventura County.'
where not exists (
  select 1 from public.lr_events where slug='2026-sapwi-trails-disc-golf-course-championships'
);

insert into public.lr_event_sources (
  event_id, source_id, external_id, source_url, source_role, is_sanction_basis,
  first_seen_at, last_seen_at, last_fetched_at, confidence
)
select e.id, s.id, 'socal:2026:sapwi-trails-disc-golf-course-championships',
       'https://socaldiscgolfclub.com/upcoming-events/', 'manual_verification', true,
       now(), now(), now(), 0.99
from public.lr_events e
join public.lr_sources s on s.key='socal_dgc_manual_calendar'
where e.slug='2026-sapwi-trails-disc-golf-course-championships'
  and not exists (
    select 1 from public.lr_event_sources x
    where x.source_id=s.id and x.external_id='socal:2026:sapwi-trails-disc-golf-course-championships'
  );

insert into public.lr_event_sources (
  event_id, source_id, external_id, source_url, source_role, is_sanction_basis,
  first_seen_at, last_seen_at, last_fetched_at, confidence
)
select e.id, s.id, 'crpd:sapwi-trails-disc-golf',
       'https://www.crpd.org/disc-golf-abd7a7f6-309d-44e5-876a-d0aa63d5f4e6', 'official', false,
       now(), now(), now(), 0.99
from public.lr_events e
join public.lr_sources s on s.key='crpd_sapwi_manual'
where e.slug='2026-sapwi-trails-disc-golf-course-championships'
  and not exists (
    select 1 from public.lr_event_sources x
    where x.source_id=s.id and x.external_id='crpd:sapwi-trails-disc-golf'
  );

insert into public.lr_event_sources (
  event_id, source_id, external_id, source_url, source_role, is_sanction_basis,
  first_seen_at, last_seen_at, last_fetched_at, confidence
)
select e.id, s.id, 'toaks:about:ventura-county',
       'https://toaks.gov/about', 'official', false,
       now(), now(), now(), 0.99
from public.lr_events e
join public.lr_sources s on s.key='city_thousand_oaks_manual'
where e.slug='2026-sapwi-trails-disc-golf-course-championships'
  and not exists (
    select 1 from public.lr_event_sources x
    where x.source_id=s.id and x.external_id='toaks:about:ventura-county'
  );

update public.lr_events
set published=true,
    last_verified_at=now(),
    updated_at=now()
where slug='2026-sapwi-trails-disc-golf-course-championships';

update public.lr_review_queue
set status='resolved',
    resolved_at=now(),
    resolution='Resolved 2026-08-25 using the current detailed TD-supplied SoCal DGC schedule as the controlling permitted event row: Sapwi Trails Disc Golf Course Championships is listed for Sep. 26 only at Sapwi, Thousand Oaks, sanctioned, TD Seth Gregory. The older SoCal sidebar/blog Sep. 26-27 representation is treated as stale rather than averaged with the newer detailed schedule. CRPD independently corroborates the Sapwi Trails disc-golf venue and the City of Thousand Oaks independently corroborates Ventura County geography. Tier remains intentionally null because it is outside the SoCal source authoritative-fields contract; third-party discovery sources were not used as production authority.'
where issue_type='source_conflict'
  and summary='Sapwi Trails 2026 date conflict blocks publication'
  and status='open';

commit;
