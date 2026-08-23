create or replace function public.lr_source_soak_status(
  p_source_id uuid,
  p_required_days integer default 14
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_key text;
  v_created_local timestamp without time zone;
  v_first_expected_date date;
  v_now_local timestamp without time zone := current_timestamp at time zone 'America/Los_Angeles';
  v_expected_date date;
  v_target_date date;
  v_health text;
  v_run_started timestamptz;
  v_consecutive integer := 0;
  v_first_gap date;
  v_last_production_run timestamptz;
  i integer;
begin
  if p_required_days < 1 or p_required_days > 60 then
    raise exception 'p_required_days must be between 1 and 60';
  end if;

  select s.key, s.created_at at time zone 'America/Los_Angeles'
    into v_source_key, v_created_local
  from public.lr_sources s
  where s.id = p_source_id;

  if not found then
    raise exception 'source not found';
  end if;

  if v_created_local::time <= time '05:00' then
    v_first_expected_date := v_created_local::date;
  else
    v_first_expected_date := v_created_local::date + 1;
  end if;

  if v_now_local::time >= time '07:15' then
    v_expected_date := v_now_local::date;
  else
    v_expected_date := v_now_local::date - 1;
  end if;

  select max(r.started_at)
    into v_last_production_run
  from public.lr_source_runs r
  where r.source_id = p_source_id
    and (coalesce(r.metrics->>'trigger','') = 'cron' or r.scheduler_status = 'ok');

  if v_expected_date >= v_first_expected_date then
    for i in 0..p_required_days-1 loop
      v_target_date := v_expected_date - i;
      exit when v_target_date < v_first_expected_date;

      v_health := null;
      v_run_started := null;
      select r.health_status, r.started_at
        into v_health, v_run_started
      from public.lr_source_runs r
      where r.source_id = p_source_id
        and (coalesce(r.metrics->>'trigger','') = 'cron' or r.scheduler_status = 'ok')
        and (r.started_at at time zone 'America/Los_Angeles')::date = v_target_date
      order by r.started_at desc
      limit 1;

      if v_health is distinct from 'healthy' then
        v_first_gap := v_target_date;
        exit;
      end if;

      v_consecutive := v_consecutive + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'source_id', p_source_id,
    'source_key', v_source_key,
    'required_days', p_required_days,
    'first_expected_date', v_first_expected_date,
    'latest_required_date', v_expected_date,
    'daily_run_due', v_expected_date >= v_first_expected_date,
    'consecutive_healthy_days', v_consecutive,
    'soak_complete', v_consecutive >= p_required_days,
    'first_gap_or_unhealthy_date', v_first_gap,
    'last_production_run_at', v_last_production_run
  );
end;
$$;

revoke all on function public.lr_source_soak_status(uuid,integer) from public, anon, authenticated;
grant execute on function public.lr_source_soak_status(uuid,integer) to service_role;

create or replace function public.lr_launch_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_public_events integer;
  v_published_without_provenance integer;
  v_sanctioned_without_basis integer;
  v_high_reviews integer;
  v_scheduled_sources integer;
  v_all_soak boolean;
  v_sources jsonb;
begin
  select count(*) into v_public_events
  from public.lr_events e where e.published;

  select count(*) into v_published_without_provenance
  from public.lr_events e
  where e.published
    and not exists (select 1 from public.lr_event_sources es where es.event_id = e.id);

  select count(*) into v_sanctioned_without_basis
  from public.lr_events e
  where e.published and e.sanctioned is true
    and not exists (
      select 1 from public.lr_event_sources es
      where es.event_id = e.id and es.is_sanction_basis
    );

  select count(*) into v_high_reviews
  from public.lr_review_queue q
  where q.status in ('open','in_review') and q.severity in ('high','critical');

  with scheduled as (
    select s.id, s.key, public.lr_source_soak_status(s.id, 14) as soak
    from public.lr_sources s
    where s.enabled and s.refresh_schedule is not null
  )
  select count(*)::integer,
         coalesce(bool_and((soak->>'soak_complete')::boolean), false),
         coalesce(jsonb_agg(soak order by key), '[]'::jsonb)
    into v_scheduled_sources, v_all_soak, v_sources
  from scheduled;

  return jsonb_build_object(
    'checked_at', current_timestamp,
    'required_soak_days', 14,
    'ready',
      v_public_events > 0
      and v_scheduled_sources > 0
      and v_all_soak
      and v_published_without_provenance = 0
      and v_sanctioned_without_basis = 0
      and v_high_reviews = 0,
    'public_event_count', v_public_events,
    'scheduled_source_count', v_scheduled_sources,
    'scheduled_sources', v_sources,
    'blocking_high_or_critical_reviews', v_high_reviews,
    'published_without_provenance', v_published_without_provenance,
    'sanctioned_without_basis', v_sanctioned_without_basis
  );
end;
$$;

revoke all on function public.lr_launch_readiness() from public, anon, authenticated;
grant execute on function public.lr_launch_readiness() to service_role;

create or replace function public.lr_public_events()
returns table(
  id uuid,
  slug text,
  name text,
  start_date date,
  end_date date,
  timezone text,
  county text,
  city text,
  venue_name text,
  course_name text,
  rounds_text text,
  event_type text,
  format text,
  sanctioned boolean,
  tier text,
  status text,
  registration_status text,
  registration_url text,
  results_url text,
  club_host text,
  td_names text[],
  last_verified_at timestamptz,
  last_changed_at timestamptz,
  top_results jsonb
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,
    e.venue_name,e.course_name,e.rounds_text,e.event_type,e.format,e.sanctioned,e.tier,
    case
      when e.end_date < (current_timestamp at time zone 'America/Los_Angeles')::date
       and e.status in ('announced','upcoming','registration_open','full','waitlist')
      then 'completed'::text
      else e.status
    end as status,
    e.registration_status,e.registration_url,e.results_url,e.club_host,e.td_names,
    e.last_verified_at,e.last_changed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'division_code',r.division_code,
          'place',r.place,
          'player_name',r.player_name,
          'pdga_number',r.pdga_number,
          'total_score',r.total_score,
          'to_par',r.to_par,
          'points',r.points,
          'rating',r.rating,
          'source_url',r.source_url,
          'last_verified_at',r.last_verified_at
        ) order by r.place,r.player_name
      )
      from public.lr_results r
      where r.event_id=e.id and r.is_public_selected_division
    ),'[]'::jsonb) as top_results
  from public.lr_events e
  where e.published
  order by e.start_date,e.name
$$;
