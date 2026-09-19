create or replace function public.lr_source_soak_status(p_source_id uuid, p_required_days integer default 14)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
  v_gate_complete boolean := false;
  v_max_historical_streak integer := 0;
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
    and coalesce(r.metrics->>'trigger','') = 'cron'
    and r.scheduler_status = 'ok';

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
        and coalesce(r.metrics->>'trigger','') = 'cron'
        and r.scheduler_status = 'ok'
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

  with daily_latest as (
    select distinct on ((r.started_at at time zone 'America/Los_Angeles')::date)
      (r.started_at at time zone 'America/Los_Angeles')::date as run_date,
      r.health_status
    from public.lr_source_runs r
    where r.source_id = p_source_id
      and coalesce(r.metrics->>'trigger','') = 'cron'
      and r.scheduler_status = 'ok'
      and (r.started_at at time zone 'America/Los_Angeles')::date >= v_first_expected_date
      and (r.started_at at time zone 'America/Los_Angeles')::date <= v_expected_date
    order by ((r.started_at at time zone 'America/Los_Angeles')::date), r.started_at desc
  ), healthy_days as (
    select run_date,
           run_date - (row_number() over (order by run_date))::integer as grp
    from daily_latest
    where health_status = 'healthy'
  ), streaks as (
    select count(*)::integer as streak
    from healthy_days
    group by grp
  )
  select coalesce(max(streak), 0)
    into v_max_historical_streak
  from streaks;

  v_gate_complete := v_max_historical_streak >= p_required_days;

  return jsonb_build_object(
    'source_id', p_source_id,
    'source_key', v_source_key,
    'required_days', p_required_days,
    'first_expected_date', v_first_expected_date,
    'latest_required_date', v_expected_date,
    'daily_run_due', v_expected_date >= v_first_expected_date,
    'consecutive_healthy_days', v_consecutive,
    'max_historical_healthy_days', v_max_historical_streak,
    'soak_complete', v_gate_complete,
    'first_gap_or_unhealthy_date', v_first_gap,
    'last_production_run_at', v_last_production_run
  );
end;
$function$;
