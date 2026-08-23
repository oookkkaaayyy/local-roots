-- First permitted production source: user-controlled HB Night Flyers.
-- Secret values are intentionally stored only in Supabase Vault and are not represented here.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

insert into public.lr_sources(
  key,name,source_type,base_url,access_method,permission_basis,enabled,
  authoritative_fields,refresh_schedule,expected_min_records,expected_max_records,notes
)
values(
  'hbnf_internal_schedule',
  'HB Night Flyers',
  'internal',
  'https://hbnightflyers.com',
  'Automated read of the user-controlled HBNF Supabase league_state through its public application API',
  'First-party/user-controlled HB Night Flyers system explicitly authorized for Local Roots integration',
  true,
  array['name','start_date','end_date','county','city','course_name','rounds_text','event_type','format','sanctioned','status','club_host']::text[],
  'Daily at 05:00 America/Los_Angeles',
  1,
  100,
  'First permitted production adapter. HBNF remains a separate backend; Local Roots stores only normalized event/provenance/result data needed for the event calendar.'
)
on conflict (key) do update set
  name=excluded.name,
  source_type=excluded.source_type,
  base_url=excluded.base_url,
  access_method=excluded.access_method,
  permission_basis=excluded.permission_basis,
  enabled=excluded.enabled,
  authoritative_fields=excluded.authoritative_fields,
  refresh_schedule=excluded.refresh_schedule,
  expected_min_records=excluded.expected_min_records,
  expected_max_records=excluded.expected_max_records,
  notes=excluded.notes;

create or replace function public.lr_verify_hbnf_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from vault.decrypted_secrets s
    where s.name='local_roots_hbnf_sync_secret'
      and s.decrypted_secret=p_token
  );
$$;

create or replace function public.lr_hbnf_adapter_config()
returns table(hbnf_url text,publishable_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'https://phcpbvuqibyarpfrftgx.supabase.co'::text,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name='local_roots_hbnf_publishable_key' limit 1)::text;
$$;

revoke all on function public.lr_verify_hbnf_sync_secret(text) from public,anon,authenticated;
revoke all on function public.lr_hbnf_adapter_config() from public,anon,authenticated;
grant execute on function public.lr_verify_hbnf_sync_secret(text) to service_role;
grant execute on function public.lr_hbnf_adapter_config() to service_role;

create or replace function public.lr_schedule_hbnf_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_now timestamp;
  source_uuid uuid;
  already_ran boolean;
  request_id bigint;
  sync_secret text;
begin
  local_now := now() at time zone 'America/Los_Angeles';
  if extract(hour from local_now) <> 5 then
    return null;
  end if;

  select id into source_uuid from public.lr_sources where key='hbnf_internal_schedule' and enabled;
  if source_uuid is null then return null; end if;

  select exists(
    select 1 from public.lr_source_runs r
    where r.source_id=source_uuid
      and (r.started_at at time zone 'America/Los_Angeles')::date=local_now::date
      and r.fetch_status in ('ok','running')
  ) into already_ran;
  if already_ran then return null; end if;

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

select cron.unschedule(jobid)
from cron.job
where jobname='local-roots-hbnf-hourly-gate';

select cron.schedule(
  'local-roots-hbnf-hourly-gate',
  '0 * * * *',
  $cron$select public.lr_schedule_hbnf_sync();$cron$
);