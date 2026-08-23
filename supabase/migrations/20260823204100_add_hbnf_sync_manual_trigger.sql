-- Service-role-only manual trigger used for controlled QA and recovery runs.
-- The private scheduler token remains in Supabase Vault.

create or replace function public.lr_trigger_hbnf_sync(p_trigger text default 'manual')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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
    url := 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/lr-sync-hbnf',
    headers := jsonb_build_object('Content-Type','application/json','x-local-roots-sync-secret',sync_secret),
    body := jsonb_build_object('trigger',case when p_trigger='cron' then 'cron' else 'manual' end,'requested_at',now()),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.lr_trigger_hbnf_sync(text) from public,anon,authenticated;
grant execute on function public.lr_trigger_hbnf_sync(text) to service_role;