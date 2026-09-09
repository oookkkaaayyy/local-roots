with routes(name, start_date, results_url) as (
  values
    ('Fling XXIX'::text, '2026-09-12'::date, 'https://www.pdga.com/tour/event/100194'::text),
    ('Sapwi Trails Disc Golf Course Championships', '2026-09-26'::date, 'https://www.pdga.com/tour/event/107447'),
    ('Nixon Open', '2026-09-26'::date, 'https://www.pdga.com/tour/event/105951'),
    ('2026 NADGT C Tier 2 Rounder @ Martha McLean', '2026-10-04'::date, 'https://www.pdga.com/tour/event/106882'),
    ('Castaic Open', '2026-10-17'::date, 'https://www.pdga.com/tour/event/105039'),
    ('The OG Mamas 12th Annual Breast Cancer, Beat Cancer Charity 2026', '2026-10-18'::date, 'https://www.pdga.com/tour/event/103122'),
    ('Whispering Lakes Championship, supported by Innova Disc Golf', '2026-10-25'::date, 'https://www.pdga.com/tour/event/107786'),
    ('2026 So Cal Championships Presented by Innova & Legacy – Ams', '2026-11-21'::date, 'https://www.pdga.com/tour/event/106487'),
    ('Billy Goat ~ Fallen Disc Golfers Memorial', '2026-11-28'::date, 'https://www.pdga.com/tour/event/103192')
), matched as (
  select e.id, r.results_url
  from public.lr_events e
  join routes r on r.name = e.name and r.start_date = e.start_date
  where e.published = true
    and exists (
      select 1
      from public.lr_event_sources es
      join public.lr_sources s on s.id = es.source_id
      where es.event_id = e.id and s.key = 'socal_dgc_manual_calendar'
    )
)
update public.lr_events e
set results_url = m.results_url,
    last_verified_at = now(),
    updated_at = now()
from matched m
where e.id = m.id
  and e.results_url is distinct from m.results_url;

update public.lr_event_sources es
set last_seen_at = now(),
    last_fetched_at = now(),
    updated_at = now()
from public.lr_sources s, public.lr_events e
where s.id = es.source_id
  and s.key = 'socal_dgc_manual_calendar'
  and e.id = es.event_id
  and e.published = true
  and e.results_url in (
    'https://www.pdga.com/tour/event/100194',
    'https://www.pdga.com/tour/event/107447',
    'https://www.pdga.com/tour/event/105951',
    'https://www.pdga.com/tour/event/106882',
    'https://www.pdga.com/tour/event/105039',
    'https://www.pdga.com/tour/event/103122',
    'https://www.pdga.com/tour/event/107786',
    'https://www.pdga.com/tour/event/106487',
    'https://www.pdga.com/tour/event/103192'
  );
