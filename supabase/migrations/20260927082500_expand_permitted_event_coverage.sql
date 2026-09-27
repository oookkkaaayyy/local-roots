-- Expand Local Roots current/future coverage from permitted first-party sources only.
-- This migration mirrors the 2026-09-27 live coverage pass. Restricted discovery
-- sources (PDGA, Disc Golf Scene, UDisc) remain non-authoritative for event facts.

begin;

insert into public.lr_sources(
  key,name,source_type,base_url,access_method,permission_basis,enabled,
  authoritative_fields,refresh_schedule,notes
) values
(
  'oak_grove_disc_golf_club_direct',
  'Oak Grove Disc Golf Club — official events page',
  'club',
  'https://oakgrovediscgolf.com/',
  'Manual factual verification of the public first-party Oak Grove Disc Golf Club events page; no automated crawling or third-party event-field promotion.',
  'First-party public club/organizer website. Local Roots may store narrowly verified event facts that the club itself publishes on its EVENTS page. Third-party PDGA, Disc Golf Scene, and UDisc facts are not promoted through this source.',
  true,
  array['name','start_date','end_date','city','course_name','format','club_host'],
  null,
  'Added 2026-09-27 to expand permitted Southern California event coverage from first-party organizer sources. Official EVENTS page also publishes current weekly recurrence details and special-event dates.'
),
(
  'crpd_rabbit_flats_direct',
  'Conejo Recreation & Park District — Rabbit Flats Disc Golf',
  'manual',
  'https://www.crpd.org/disc-golf',
  'Manual factual verification of the public CRPD disc-golf program page.',
  'First-party public municipal recreation source. May establish the Rabbit Flats Drop-In Program recurrence, location, host and event-format facts published by CRPD.',
  true,
  array['name','start_date','end_date','city','course_name','format','club_host'],
  null,
  'CRPD states the Disc Golf Drop-In Program runs the first Saturday of each month at 10:00am at Rabbit Flats.'
),
(
  'isaca_san_diego_eventbrite_manual',
  'ISACA San Diego Chapter — organizer Eventbrite',
  'manual',
  'https://www.eventbrite.com/e/isaca-san-diego-disc-golf-community-event-tickets-2000904029816',
  'Manual factual verification of the organizer-published public Eventbrite event page.',
  'Organizer-authored public event listing. Use only the event facts ISACA San Diego Chapter itself publishes on this listing.',
  true,
  array['name','start_date','end_date','city','course_name','format','registration_url','club_host'],
  null,
  'One-off community disc golf event at Morley Field on 2026-10-17.'
)
on conflict(key) do update set
  name=excluded.name,
  source_type=excluded.source_type,
  base_url=excluded.base_url,
  access_method=excluded.access_method,
  permission_basis=excluded.permission_basis,
  enabled=excluded.enabled,
  authoritative_fields=excluded.authoritative_fields,
  refresh_schedule=excluded.refresh_schedule,
  notes=excluded.notes,
  updated_at=now();

-- Fixed-date first-party events.
insert into public.lr_events(
  slug,name,start_date,end_date,county,city,course_name,event_type,status,
  registration_url,club_host,published,confidence,last_verified_at,internal_notes
) values
(
  'nate-weaver-high-school-event-2026','Nate Weaver High School Event',
  date '2026-10-11',date '2026-10-11','Los Angeles','Pasadena','Oak Grove Disc Golf Course',
  'tournament','upcoming',null,null,false,0.95,now(),
  'First-party Oak Grove EVENTS page lists this event for Sunday, October 11, 2026. Formal third-party naming/details intentionally not imported.'
),
(
  'isaca-san-diego-disc-golf-community-event-2026','ISACA San Diego Disc Golf Community Event',
  date '2026-10-17',date '2026-10-17','San Diego','San Diego','Morley Field Disc Golf Course',
  'community','upcoming',
  'https://www.eventbrite.com/e/isaca-san-diego-disc-golf-community-event-tickets-2000904029816',
  'ISACA San Diego Chapter',false,0.98,now(),
  'Organizer-published Eventbrite listing; no sanctioned-status inference.'
),
(
  'oak-grove-cancer-awareness-tournament-2026','Cancer Awareness Tournament',
  date '2026-10-18',date '2026-10-18','Los Angeles','Pasadena','Oak Grove Disc Golf Course',
  'tournament','upcoming',null,null,false,0.98,now(),
  'First-party Oak Grove EVENTS page lists Sunday, October 18, 2026, course open. Possible identity overlap with the SoCal-calendar OG Mamas event is kept in review rather than guessed.'
),
(
  'oak-grove-appreciation-day-2026','Oak Grove Appreciation Day',
  date '2026-10-31',date '2026-10-31','Los Angeles','Pasadena','Oak Grove Disc Golf Course',
  'community','upcoming',null,null,false,0.95,now(),
  'First-party Oak Grove EVENTS page lists Saturday, October 31, 2026 and marks the course closed.'
)
on conflict(slug) do update set
  name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,
  county=excluded.county,city=excluded.city,course_name=excluded.course_name,
  event_type=excluded.event_type,status=excluded.status,registration_url=excluded.registration_url,
  club_host=excluded.club_host,confidence=excluded.confidence,last_verified_at=excluded.last_verified_at,
  internal_notes=excluded.internal_notes;

-- Rabbit Flats: CRPD explicitly publishes first-Saturday monthly at 10:00 AM.
with dates(event_date) as (
  values (date '2026-10-03'),(date '2026-11-07'),(date '2026-12-05')
)
insert into public.lr_events(
  slug,name,start_date,end_date,county,city,course_name,event_type,status,club_host,
  published,confidence,last_verified_at,internal_notes
)
select
  'rabbit-flats-disc-golf-drop-in-'||to_char(event_date,'YYYY-MM-DD'),
  'Rabbit Flats Disc Golf Drop-In',event_date,event_date,'Ventura','Thousand Oaks',
  'Rabbit Flats Disc Golf Course','community','upcoming','Conejo Recreation & Park District',
  false,0.98,now(),'Materialized from CRPD first-Saturday monthly recurrence.'
from dates
on conflict(slug) do update set
  name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,
  county=excluded.county,city=excluded.city,course_name=excluded.course_name,
  event_type=excluded.event_type,status=excluded.status,club_host=excluded.club_host,
  confidence=excluded.confidence,last_verified_at=excluded.last_verified_at,
  internal_notes=excluded.internal_notes;

-- Oak Grove recurring schedule. October recurrence rows are intentionally omitted because
-- the same first-party page flags likely September-October field closure/maintenance.
with dates as (
  select d::date as event_date,'Howard''s Weekly'::text as event_name,'league'::text as event_type,
         'Tuesdays'::text as recurrence,'3 hours before sunset'::text as published_time,0.98::numeric as confidence
  from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d
  where extract(isodow from d)=2
  union all
  select d::date,'Wednesday Doubles','doubles','Wednesdays','Show up around 5 PM',0.98
  from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d
  where extract(isodow from d)=3
  union all
  select d::date,'Friday Doubles','doubles','Fridays','Show up around 5 PM',0.98
  from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d
  where extract(isodow from d)=5
  union all
  select d::date,'OGDGC Weekly','league','Saturdays (unless there is a monthly)','1 PM Check-in, 2 PM Shotgun start',0.95
  from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d
  where extract(isodow from d)=6 and d::date not in (date '2026-11-28',date '2026-12-26')
  union all
  values
    (date '2026-11-28','OG Monthly & Disc Swap','community','Generally the last Saturday of the month','1 PM Check-in, 2 PM start; Disc Swap 11:30 AM to 5:30 PM',0.90::numeric),
    (date '2026-12-26','OG Monthly & Disc Swap','community','Generally the last Saturday of the month','1 PM Check-in, 2 PM start; Disc Swap 11:30 AM to 5:30 PM',0.90::numeric)
)
insert into public.lr_events(
  slug,name,start_date,end_date,county,city,course_name,event_type,status,club_host,
  published,confidence,last_verified_at,internal_notes
)
select
  case event_name
    when 'Howard''s Weekly' then 'oak-grove-howards-weekly-'||to_char(event_date,'YYYY-MM-DD')
    when 'Wednesday Doubles' then 'oak-grove-wednesday-doubles-'||to_char(event_date,'YYYY-MM-DD')
    when 'Friday Doubles' then 'oak-grove-friday-doubles-'||to_char(event_date,'YYYY-MM-DD')
    when 'OGDGC Weekly' then 'oak-grove-ogdgc-weekly-'||to_char(event_date,'YYYY-MM-DD')
    else 'oak-grove-og-monthly-disc-swap-'||to_char(event_date,'YYYY-MM-DD')
  end,
  event_name,event_date,event_date,'Los Angeles','Pasadena','Oak Grove Disc Golf Course',
  event_type,'upcoming','Oak Grove Disc Golf Club',false,confidence,now(),
  case
    when event_name='OG Monthly & Disc Swap' then
      'Materialized from Oak Grove first-party recurring schedule. Monthly wording is "Generally the last Saturday of the month"; exact occurrence should be rechecked as the date approaches.'
    else
      'Materialized through 2026 year-end from the current first-party Oak Grove EVENTS recurring schedule.'
  end
from dates
on conflict(slug) do update set
  name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,
  county=excluded.county,city=excluded.city,course_name=excluded.course_name,
  event_type=excluded.event_type,status=excluded.status,club_host=excluded.club_host,
  confidence=excluded.confidence,last_verified_at=excluded.last_verified_at,
  internal_notes=excluded.internal_notes;

-- Provenance: fixed Oak Grove rows.
with s as (select id from public.lr_sources where key='oak_grove_disc_golf_club_direct'),
rows(slug,external_id,role,payload,confidence) as (
  values
  ('nate-weaver-high-school-event-2026','oakgrove:2026-10-11:nate-weaver-high-school-event','official',
   jsonb_build_object('first_party',true,'source_section','EVENTS','published_name','Nate Weaver High School Event','published_date','2026-10-11'),0.95::numeric),
  ('oak-grove-cancer-awareness-tournament-2026','oakgrove:2026-10-18:cancer-awareness-tournament','organizer_confirmed',
   jsonb_build_object('first_party',true,'source_section','EVENTS','published_name','Cancer Awareness Tournament','published_date','2026-10-18'),0.98::numeric),
  ('oak-grove-appreciation-day-2026','oakgrove:2026-10-31:appreciation-day','official',
   jsonb_build_object('first_party',true,'source_section','EVENTS','published_name','Oak Grove Appreciation Day','published_date','2026-10-31'),0.95::numeric)
)
insert into public.lr_event_sources(
  event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,
  confidence,first_seen_at,last_seen_at,last_fetched_at
)
select e.id,s.id,r.external_id,'https://oakgrovediscgolf.com/',r.role,false,r.payload,r.confidence,now(),now(),now()
from rows r join public.lr_events e on e.slug=r.slug cross join s
on conflict(source_id,external_id) where external_id is not null do update set
  event_id=excluded.event_id,source_url=excluded.source_url,source_role=excluded.source_role,
  source_payload=excluded.source_payload,confidence=excluded.confidence,
  last_seen_at=excluded.last_seen_at,last_fetched_at=excluded.last_fetched_at;

-- Provenance: recurring Oak Grove rows.
with s as (select id from public.lr_sources where key='oak_grove_disc_golf_club_direct'),
dates as (
  select d::date as event_date,'Howard''s Weekly'::text as event_name,'Tuesdays'::text as recurrence,'3 hours before sunset'::text as published_time,0.98::numeric as confidence
  from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d where extract(isodow from d)=2
  union all
  select d::date,'Wednesday Doubles','Wednesdays','Show up around 5 PM',0.98 from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d where extract(isodow from d)=3
  union all
  select d::date,'Friday Doubles','Fridays','Show up around 5 PM',0.98 from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d where extract(isodow from d)=5
  union all
  select d::date,'OGDGC Weekly','Saturdays (unless there is a monthly)','1 PM Check-in, 2 PM Shotgun start',0.95 from generate_series(date '2026-11-01',date '2026-12-31',interval '1 day') d where extract(isodow from d)=6 and d::date not in (date '2026-11-28',date '2026-12-26')
  union all
  values
    (date '2026-11-28','OG Monthly & Disc Swap','Generally the last Saturday of the month','1 PM Check-in, 2 PM start; Disc Swap 11:30 AM to 5:30 PM',0.90::numeric),
    (date '2026-12-26','OG Monthly & Disc Swap','Generally the last Saturday of the month','1 PM Check-in, 2 PM start; Disc Swap 11:30 AM to 5:30 PM',0.90::numeric)
), rows as (
  select
    case event_name
      when 'Howard''s Weekly' then 'oak-grove-howards-weekly-'||to_char(event_date,'YYYY-MM-DD')
      when 'Wednesday Doubles' then 'oak-grove-wednesday-doubles-'||to_char(event_date,'YYYY-MM-DD')
      when 'Friday Doubles' then 'oak-grove-friday-doubles-'||to_char(event_date,'YYYY-MM-DD')
      when 'OGDGC Weekly' then 'oak-grove-ogdgc-weekly-'||to_char(event_date,'YYYY-MM-DD')
      else 'oak-grove-og-monthly-disc-swap-'||to_char(event_date,'YYYY-MM-DD')
    end as slug,
    case event_name
      when 'OGDGC Weekly' then 'oakgrove:weekly:saturday:'||event_date::text
      when 'OG Monthly & Disc Swap' then 'oakgrove:monthly:'||event_date::text
      else 'oakgrove:'||
        case event_name when 'Howard''s Weekly' then 'oak-grove-howards-weekly-' when 'Wednesday Doubles' then 'oak-grove-wednesday-doubles-' else 'oak-grove-friday-doubles-' end
        ||event_date::text
    end as external_id,
    recurrence,published_time,event_date,confidence
  from dates
)
insert into public.lr_event_sources(
  event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,
  confidence,first_seen_at,last_seen_at,last_fetched_at
)
select e.id,s.id,r.external_id,'https://oakgrovediscgolf.com/','organizer_confirmed',false,
       jsonb_build_object('first_party',true,'source_section','EVENTS','recurrence',r.recurrence,
                          'published_time',r.published_time,'materialized_date',r.event_date::text,'schedule_derived',true),
       r.confidence,now(),now(),now()
from rows r join public.lr_events e on e.slug=r.slug cross join s
on conflict(source_id,external_id) where external_id is not null do update set
  event_id=excluded.event_id,source_url=excluded.source_url,source_role=excluded.source_role,
  source_payload=excluded.source_payload,confidence=excluded.confidence,
  last_seen_at=excluded.last_seen_at,last_fetched_at=excluded.last_fetched_at;

-- Provenance: Rabbit Flats recurrence.
with s as (select id from public.lr_sources where key='crpd_rabbit_flats_direct'),
dates(event_date) as (values (date '2026-10-03'),(date '2026-11-07'),(date '2026-12-05'))
insert into public.lr_event_sources(
  event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,
  confidence,first_seen_at,last_seen_at,last_fetched_at
)
select e.id,s.id,'crpd:rabbit-flats:'||d.event_date::text,'https://www.crpd.org/disc-golf','official',false,
       jsonb_build_object('first_party',true,'recurrence','first Saturday monthly','time_local','10:00','materialized_date',d.event_date::text),
       0.98,now(),now(),now()
from dates d
join public.lr_events e on e.slug='rabbit-flats-disc-golf-drop-in-'||to_char(d.event_date,'YYYY-MM-DD')
cross join s
on conflict(source_id,external_id) where external_id is not null do update set
  event_id=excluded.event_id,source_url=excluded.source_url,source_role=excluded.source_role,
  source_payload=excluded.source_payload,confidence=excluded.confidence,
  last_seen_at=excluded.last_seen_at,last_fetched_at=excluded.last_fetched_at;

-- Provenance: ISACA organizer listing.
with s as (select id from public.lr_sources where key='isaca_san_diego_eventbrite_manual')
insert into public.lr_event_sources(
  event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,
  confidence,first_seen_at,last_seen_at,last_fetched_at
)
select e.id,s.id,'eventbrite:2000904029816',
       'https://www.eventbrite.com/e/isaca-san-diego-disc-golf-community-event-tickets-2000904029816',
       'organizer_confirmed',false,
       jsonb_build_object('venue','Morley Field Disc Golf Course','organizer','ISACA San Diego Chapter','time_local','09:00-13:00'),
       0.98,now(),now(),now()
from public.lr_events e cross join s
where e.slug='isaca-san-diego-disc-golf-community-event-2026'
on conflict(source_id,external_id) where external_id is not null do update set
  event_id=excluded.event_id,source_url=excluded.source_url,source_role=excluded.source_role,
  source_payload=excluded.source_payload,confidence=excluded.confidence,
  last_seen_at=excluded.last_seen_at,last_fetched_at=excluded.last_fetched_at;

-- Publish only after provenance exists, preserving publication guards.
update public.lr_events
set published=true,last_changed_at=now(),updated_at=now()
where slug in (
  'nate-weaver-high-school-event-2026',
  'isaca-san-diego-disc-golf-community-event-2026',
  'oak-grove-cancer-awareness-tournament-2026',
  'oak-grove-appreciation-day-2026',
  'rabbit-flats-disc-golf-drop-in-2026-10-03',
  'rabbit-flats-disc-golf-drop-in-2026-11-07',
  'rabbit-flats-disc-golf-drop-in-2026-12-05'
)
or slug ~ '^oak-grove-(howards-weekly|wednesday-doubles|friday-doubles|ogdgc-weekly|og-monthly-disc-swap)-2026-(11|12)-';

-- Preserve two material ambiguities for later review instead of guessing.
insert into public.lr_review_queue(issue_type,severity,event_id,summary,status,details)
select 'possible_duplicate_event','medium',e.id,
       'Possible duplicate Oak Grove breast-cancer event on 2026-10-18','open',
       jsonb_build_object(
         'other_event_id',(select id from public.lr_events where slug='og-mamas-12th-breast-cancer-charity-2026'),
         'other_event_name','The OG Mamas 12th Annual Breast Cancer, Beat Cancer Charity 2026',
         'reason','Same date and Oak Grove location family; first-party Oak Grove page says Cancer Awareness Tournament while permitted SoCal calendar uses the OG Mamas name. Do not merge without stronger identity evidence.',
         'first_party_url','https://oakgrovediscgolf.com/',
         'regional_source_url','https://socaldiscgolfclub.com/upcoming-events/'
       )
from public.lr_events e
where e.slug='oak-grove-cancer-awareness-tournament-2026'
  and not exists (
    select 1 from public.lr_review_queue q
    where q.status in ('open','in_review') and q.issue_type='possible_duplicate_event' and q.event_id=e.id
  );

insert into public.lr_review_queue(issue_type,severity,event_id,summary,status,details)
select 'source_date_inconsistency','medium',null,
       'Cowtown Christmas Classic 2026 calendar row has stale/inconsistent date-link evidence','open',
       jsonb_build_object(
         'source_url','https://socaldiscgolfclub.com/upcoming-events/',
         'listed_date','2026-12-20',
         'listed_weekday','Saturday',
         'calendar_weekday','Sunday',
         'registration_link_destination','2025 Cowtown Christmas Classic',
         'results_link_destination','2025 PDGA event',
         'disposition','Do not publish a 2026 Cowtown event until the permitted source is corrected or independent permitted first-party evidence confirms the 2026 date.'
       )
where not exists (
  select 1 from public.lr_review_queue q
  where q.status in ('open','in_review') and q.issue_type='source_date_inconsistency'
    and q.summary='Cowtown Christmas Classic 2026 calendar row has stale/inconsistent date-link evidence'
);

commit;
