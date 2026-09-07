with target as (
  select e.id as event_id, es.id as event_source_id
  from public.lr_events e
  join public.lr_event_sources es on es.event_id = e.id
  join public.lr_sources s on s.id = es.source_id
  where s.key = 'socal_dgc_manual_calendar'
    and es.external_id = 'socal:2026:2026-nadgt-martha-mclean'
)
update public.lr_events e
set name = '2026 NADGT C Tier 2 Rounder @ Martha McLean',
    course_name = 'Martha McLean',
    last_verified_at = now(),
    updated_at = now()
from target t
where e.id = t.event_id;

with target as (
  select es.id as event_source_id
  from public.lr_event_sources es
  join public.lr_sources s on s.id = es.source_id
  where s.key = 'socal_dgc_manual_calendar'
    and es.external_id = 'socal:2026:2026-nadgt-martha-mclean'
)
update public.lr_event_sources es
set last_seen_at = now(),
    last_fetched_at = now(),
    updated_at = now(),
    source_payload = jsonb_set(
      coalesce(es.source_payload, '{}'::jsonb),
      '{verified_at}',
      to_jsonb(now()::text),
      true
    )
from target t
where es.id = t.event_source_id;
