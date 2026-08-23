-- Surface stale current/future events as review exceptions and close the alert
-- automatically after the event is re-verified, unpublished, or becomes past.

create or replace function public.lr_future_event_freshness_watch(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_local timestamp without time zone := current_timestamp at time zone 'America/Los_Angeles';
  v_today date := v_local::date;
  v_stale integer := 0;
  v_created integer := 0;
  v_resolved integer := 0;
  r record;
begin
  if not p_force and extract(hour from v_local) <> 8 then
    return jsonb_build_object('checked',false,'reason','outside_08_pacific_hour','checked_at',current_timestamp);
  end if;

  update public.lr_review_queue q
  set status='resolved',
      resolved_at=current_timestamp,
      resolution='Auto-resolved: event is no longer a stale published current/future event.'
  where q.issue_type='stale_event_verification'
    and q.status in ('open','in_review')
    and q.event_id is not null
    and exists (
      select 1 from public.lr_events e
      where e.id=q.event_id
        and (
          not e.published
          or e.end_date < v_today
          or e.last_verified_at >= current_timestamp - interval '14 days'
        )
    );
  get diagnostics v_resolved = row_count;

  for r in
    select e.id,e.name,e.start_date,e.end_date,e.last_verified_at
    from public.lr_events e
    where e.published
      and e.end_date >= v_today
      and (e.last_verified_at is null or e.last_verified_at < current_timestamp - interval '14 days')
    order by e.start_date,e.name
  loop
    v_stale := v_stale + 1;
    if not exists (
      select 1 from public.lr_review_queue q
      where q.issue_type='stale_event_verification'
        and q.event_id=r.id
        and q.status in ('open','in_review')
    ) then
      insert into public.lr_review_queue(issue_type,severity,event_id,summary,details)
      values (
        'stale_event_verification',
        'medium',
        r.id,
        ('Future event needs source re-verification: ' || r.name)::text,
        jsonb_build_object(
          'watch','future_event_freshness',
          'freshness_days',14,
          'start_date',r.start_date,
          'end_date',r.end_date,
          'last_verified_at',r.last_verified_at
        )
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked',true,
    'checked_at',current_timestamp,
    'stale_future_events',v_stale,
    'alerts_created',v_created,
    'alerts_auto_resolved',v_resolved
  );
end;
$$;

revoke all on function public.lr_future_event_freshness_watch(boolean) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('local-roots-event-freshness-watch');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'local-roots-event-freshness-watch',
  '47 * * * *',
  'select public.lr_future_event_freshness_watch();'
);
