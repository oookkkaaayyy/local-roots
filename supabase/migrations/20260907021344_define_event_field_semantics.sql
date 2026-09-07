create or replace function public.lr_event_field_semantics(p_field text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case
    when p_field = 'county' then 'source_or_geography_derived'
    when p_field = 'event_type' then 'source_or_internal_classification'
    when p_field = 'status' then 'source_or_temporal_derived'
    when p_field = 'results_url' then 'routing_metadata'
    else 'source_claim'
  end
$$;

comment on function public.lr_event_field_semantics(text) is
  'Classifies Local Roots canonical event fields for source-authority audits. County, event_type, and status may be system-derived; results_url is outbound routing metadata and does not authorize copying third-party result values.';

create or replace function public.lr_unexpected_unsupported_event_fields()
returns table(field_name text, unsupported_count bigint)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with fields(field_name) as (
    values
      ('name'),('start_date'),('end_date'),('county'),('city'),('venue_name'),('course_name'),
      ('rounds_text'),('event_type'),('format'),('sanctioned'),('tier'),('status'),
      ('registration_status'),('registration_url'),('results_url'),('club_host'),('td_names')
  ), vals as (
    select e.id, f.field_name,
      case f.field_name
        when 'name' then to_jsonb(e.name)
        when 'start_date' then to_jsonb(e.start_date)
        when 'end_date' then to_jsonb(e.end_date)
        when 'county' then to_jsonb(e.county)
        when 'city' then to_jsonb(e.city)
        when 'venue_name' then to_jsonb(e.venue_name)
        when 'course_name' then to_jsonb(e.course_name)
        when 'rounds_text' then to_jsonb(e.rounds_text)
        when 'event_type' then to_jsonb(e.event_type)
        when 'format' then to_jsonb(e.format)
        when 'sanctioned' then to_jsonb(e.sanctioned)
        when 'tier' then to_jsonb(e.tier)
        when 'status' then to_jsonb(e.status)
        when 'registration_status' then to_jsonb(e.registration_status)
        when 'registration_url' then to_jsonb(e.registration_url)
        when 'results_url' then to_jsonb(e.results_url)
        when 'club_host' then to_jsonb(e.club_host)
        when 'td_names' then to_jsonb(e.td_names)
      end as field_value
    from public.lr_events e
    cross join fields f
    where e.published
  )
  select v.field_name, count(*)::bigint
  from vals v
  where public.lr_event_field_semantics(v.field_name) = 'source_claim'
    and v.field_value is not null
    and v.field_value <> 'null'::jsonb
    and v.field_value <> '[]'::jsonb
    and not exists (
      select 1
      from public.lr_event_sources es
      join public.lr_sources s on s.id = es.source_id
      where es.event_id = v.id
        and v.field_name = any(s.authoritative_fields)
    )
  group by v.field_name
  order by v.field_name
$$;

comment on function public.lr_unexpected_unsupported_event_fields() is
  'Audits published Local Roots source-claim fields only. System-derived county/event_type/status and routing-only results_url are intentionally excluded from unsupported-source cleanup.';

revoke all on function public.lr_unexpected_unsupported_event_fields() from public, anon, authenticated;
revoke all on function public.lr_event_field_semantics(text) from public, anon, authenticated;
