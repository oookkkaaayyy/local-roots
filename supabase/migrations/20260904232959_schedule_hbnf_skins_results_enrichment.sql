create or replace function public.lr_trigger_hbnf_skins_results(p_trigger text default 'manual')
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_id bigint;
  sync_secret text;
begin
  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name='local_roots_hbnf_sync_secret'
  limit 1;
  if sync_secret is null then raise exception 'HBNF sync scheduler secret missing'; end if;

  select net.http_post(
    url := 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/lr-sync-hbnf-skins-results',
    headers := jsonb_build_object('Content-Type','application/json','x-local-roots-sync-secret',sync_secret),
    body := jsonb_build_object('trigger',coalesce(nullif(p_trigger,''),'manual'),'requested_at',now()),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$function$;

revoke all on function public.lr_trigger_hbnf_skins_results(text) from public, anon, authenticated;

create or replace function public.lr_schedule_hbnf_skins_results()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  local_now timestamp;
begin
  local_now := now() at time zone 'America/Los_Angeles';
  if extract(hour from local_now) <> 8 then return null; end if;
  return public.lr_trigger_hbnf_skins_results('cron');
end;
$function$;

revoke all on function public.lr_schedule_hbnf_skins_results() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from cron.job where jobname='local-roots-hbnf-skins-results') then
    perform cron.unschedule('local-roots-hbnf-skins-results');
  end if;
  perform cron.schedule(
    'local-roots-hbnf-skins-results',
    '15 * * * *',
    'select public.lr_schedule_hbnf_skins_results();'
  );
end
$do$;
