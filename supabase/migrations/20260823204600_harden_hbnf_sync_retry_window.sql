-- Start the daily HBNF sync at 05:00 Pacific and retry at 06:00/07:00 only if
-- the day's prior attempt is unhealthy. A healthy/warning or currently-running
-- attempt suppresses additional calls.

create or replace function public.lr_schedule_hbnf_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_now timestamp;
  source_uuid uuid;
  successful_or_running boolean;
  request_id bigint;
  sync_secret text;
begin
  local_now := now() at time zone 'America/Los_Angeles';
  if extract(hour from local_now) not in (5,6,7) then
    return null;
  end if;

  select id into source_uuid
  from public.lr_sources
  where key='hbnf_internal_schedule' and enabled;
  if source_uuid is null then return null; end if;

  select exists(
    select 1
    from public.lr_source_runs r
    where r.source_id=source_uuid
      and (r.started_at at time zone 'America/Los_Angeles')::date=local_now::date
      and (
        r.health_status in ('healthy','warning')
        or (r.finished_at is null and (r.fetch_status='running' or r.parse_status='running'))
      )
  ) into successful_or_running;
  if successful_or_running then return null; end if;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name='local_roots_hbnf_sync_secret'
  limit 1;
  if sync_secret is null then raise exception 'HBNF sync scheduler secret missing'; end if;

  select net.http_post(
    url := 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/lr-sync-hbnf',
    headers := jsonb_build_object('Content-Type','application/json','x-local-roots-sync-secret',sync_secret),
    body := jsonb_build_object('trigger','cron','requested_at',now()),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.lr_schedule_hbnf_sync() from public,anon,authenticated;
grant execute on function public.lr_schedule_hbnf_sync() to service_role;