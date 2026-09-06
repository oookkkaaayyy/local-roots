update public.lr_events e
set tier = null,
    updated_at = now()
where e.tier is not null
  and exists (
    select 1
    from public.lr_event_sources es
    join public.lr_sources s on s.id = es.source_id
    where es.event_id = e.id
      and s.key = 'socal_dgc_manual_calendar'
  )
  and not exists (
    select 1
    from public.lr_event_sources es
    join public.lr_sources s on s.id = es.source_id
    where es.event_id = e.id
      and 'tier' = any(s.authoritative_fields)
  );
