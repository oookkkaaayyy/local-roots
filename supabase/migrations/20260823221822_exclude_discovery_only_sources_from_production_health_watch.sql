-- Review-only/discovery sources must not generate production launch-health alerts.
create or replace function public.lr_source_health_watch(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'cron'
as $function$
declare
  v_now_local timestamp without time zone := current_timestamp at time zone 'America/Los_Angeles';
  v_status jsonb;
  v_expected_date date;
  v_gap_date date;
  v_created integer := 0;
  s record;
begin
  if not p_force and extract(hour from v_now_local) <> 8 then
    return 0;
  end if;

  for s in
    select id, key, name
    from public.lr_sources
    where enabled
      and refresh_schedule is not null
      and cardinality(authoritative_fields) > 0
    order by key
  loop
    v_status := public.lr_source_soak_status(s.id, 14);
    if coalesce((v_status->>'daily_run_due')::boolean, false) is false then
      continue;
    end if;

    v_expected_date := nullif(v_status->>'latest_required_date','')::date;
    v_gap_date := nullif(v_status->>'first_gap_or_unhealthy_date','')::date;

    if v_expected_date is not null and v_gap_date = v_expected_date then
      if not exists (
        select 1
        from public.lr_review_queue q
        where q.issue_type = 'scheduled_source_health'
          and q.status in ('open','in_review')
          and q.details->>'source_id' = s.id::text
          and q.details->>'expected_date' = v_expected_date::text
      ) then
        insert into public.lr_review_queue(issue_type,severity,summary,details)
        values (
          'scheduled_source_health',
          'high',
          format('%s did not finish the required daily source cycle healthy', s.name),
          jsonb_build_object(
            'source_id', s.id,
            'source_key', s.key,
            'expected_date', v_expected_date,
            'soak_status', v_status,
            'automatic_watch', true
          )
        );
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  return v_created;
end;
$function$;
