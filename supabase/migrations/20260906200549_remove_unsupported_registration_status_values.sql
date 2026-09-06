update public.lr_events e
set registration_status = null,
    updated_at = now()
where e.published = true
  and e.registration_status is not null
  and not exists (
    select 1
    from public.lr_event_sources es
    join public.lr_sources s on s.id = es.source_id
    where es.event_id = e.id
      and 'registration_status' = any(s.authoritative_fields)
  );
