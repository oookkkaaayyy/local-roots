with supported_format as (
  select distinct es.event_id
  from public.lr_event_sources es
  join public.lr_sources s on s.id = es.source_id
  where 'format' = any(s.authoritative_fields)
)
update public.lr_events e
set format = null,
    updated_at = now()
where e.published = true
  and e.format is not null
  and not exists (select 1 from supported_format sf where sf.event_id = e.id);

with supported_rounds as (
  select distinct es.event_id
  from public.lr_event_sources es
  join public.lr_sources s on s.id = es.source_id
  where 'rounds_text' = any(s.authoritative_fields)
)
update public.lr_events e
set rounds_text = null,
    updated_at = now()
where e.published = true
  and e.rounds_text is not null
  and not exists (select 1 from supported_rounds sr where sr.event_id = e.id);

with supported_venue as (
  select distinct es.event_id
  from public.lr_event_sources es
  join public.lr_sources s on s.id = es.source_id
  where 'venue_name' = any(s.authoritative_fields)
)
update public.lr_events e
set venue_name = null,
    updated_at = now()
where e.published = true
  and e.venue_name is not null
  and not exists (select 1 from supported_venue sv where sv.event_id = e.id);
