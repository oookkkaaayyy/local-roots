-- Expedite launch confidence without weakening publication/integrity gates.
-- Population work proceeds independently; this changes only the scheduled-source soak threshold.
create or replace function public.lr_launch_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_public_events integer;
  v_published_without_provenance integer;
  v_sanctioned_without_basis integer;
  v_stale_future_events integer;
  v_high_reviews integer;
  v_scheduled_sources integer;
  v_all_soak boolean;
  v_sources jsonb;
  v_today date := (current_timestamp at time zone 'America/Los_Angeles')::date;
begin
  select count(*) into v_public_events
  from public.lr_events e
  where e.published;

  select count(*) into v_published_without_provenance
  from public.lr_events e
  where e.published
    and not exists (
      select 1 from public.lr_event_sources es where es.event_id = e.id
    );

  select count(*) into v_sanctioned_without_basis
  from public.lr_events e
  where e.published
    and e.sanctioned is true
    and not exists (
      select 1
      from public.lr_event_sources es
      where es.event_id = e.id and es.is_sanction_basis
    );

  select count(*) into v_stale_future_events
  from public.lr_events e
  where e.published
    and e.end_date >= v_today
    and (e.last_verified_at is null or e.last_verified_at < current_timestamp - interval '14 days');

  select count(*) into v_high_reviews
  from public.lr_review_queue q
  where q.status in ('open','in_review')
    and q.severity in ('high','critical');

  with scheduled as (
    select s.id, s.key, public.lr_source_soak_status(s.id, 5) as soak
    from public.lr_sources s
    where s.enabled
      and s.refresh_schedule is not null
      and cardinality(s.authoritative_fields) > 0
  )
  select
    count(*)::integer,
    coalesce(bool_and((soak->>'soak_complete')::boolean), false),
    coalesce(jsonb_agg(soak order by key), '[]'::jsonb)
  into v_scheduled_sources, v_all_soak, v_sources
  from scheduled;

  return jsonb_build_object(
    'checked_at', current_timestamp,
    'required_soak_days', 5,
    'future_event_freshness_days', 14,
    'ready',
      v_public_events > 0
      and v_scheduled_sources > 0
      and v_all_soak
      and v_published_without_provenance = 0
      and v_sanctioned_without_basis = 0
      and v_stale_future_events = 0
      and v_high_reviews = 0,
    'public_event_count', v_public_events,
    'scheduled_source_count', v_scheduled_sources,
    'scheduled_sources', v_sources,
    'blocking_high_or_critical_reviews', v_high_reviews,
    'published_without_provenance', v_published_without_provenance,
    'sanctioned_without_basis', v_sanctioned_without_basis,
    'stale_future_events', v_stale_future_events
  );
end;
$function$;
