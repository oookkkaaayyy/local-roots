with target as (
  select e.id,
         case es.external_id
           when 'socal:2026:the-fling-xxix-chavez-ridge' then 'Fling XXIX'
           when 'socal:2026:3rd-annual-nixon-open-2026' then 'Nixon Open'
         end as current_name
  from public.lr_events e
  join public.lr_event_sources es on es.event_id = e.id
  join public.lr_sources s on s.id = es.source_id
  where s.key = 'socal_dgc_manual_calendar'
    and es.external_id in (
      'socal:2026:the-fling-xxix-chavez-ridge',
      'socal:2026:3rd-annual-nixon-open-2026'
    )
)
update public.lr_events e
set name = target.current_name,
    last_verified_at = now(),
    updated_at = now()
from target
where e.id = target.id
  and e.name is distinct from target.current_name;

update public.lr_event_sources es
set last_seen_at = now(),
    last_fetched_at = now(),
    source_payload = jsonb_set(
      coalesce(es.source_payload, '{}'::jsonb),
      '{verified_at}',
      to_jsonb(now()::text),
      true
    ),
    updated_at = now()
from public.lr_sources s
where s.id = es.source_id
  and s.key = 'socal_dgc_manual_calendar'
  and es.external_id in (
    'socal:2026:the-fling-xxix-chavez-ridge',
    'socal:2026:3rd-annual-nixon-open-2026'
  );