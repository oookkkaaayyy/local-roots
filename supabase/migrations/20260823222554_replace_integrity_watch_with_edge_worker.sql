-- Replace the transaction-bound staging probe with the production Edge-worker model.
-- The secret is generated inside Vault; no credential value is stored in Git.

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name='local_roots_integrity_sync_secret'
  ) then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'local_roots_integrity_sync_secret',
      'Private scheduler token for Local Roots public integrity watch'
    );
  end if;
end;
$$;

create or replace function public.lr_verify_integrity_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from vault.decrypted_secrets s
    where s.name='local_roots_integrity_sync_secret'
      and s.decrypted_secret=p_token
  );
$$;

create or replace function public.lr_integrity_watch(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_now_local timestamp without time zone := current_timestamp at time zone 'America/Los_Angeles';
  v_secret text;
  v_request_id bigint;
begin
  if not p_force and extract(hour from v_now_local) <> 8 then
    return jsonb_build_object('dispatched',false,'reason','outside_08_pacific_hour','checked_at',current_timestamp);
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='local_roots_integrity_sync_secret'
  limit 1;
  if v_secret is null then
    raise exception 'Local Roots integrity scheduler secret missing';
  end if;

  select net.http_post(
    url := 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/lr-integrity-watch',
    headers := jsonb_build_object('Content-Type','application/json','x-local-roots-sync-secret',v_secret),
    body := jsonb_build_object('trigger',case when p_force then 'manual' else 'cron' end,'requested_at',current_timestamp),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return jsonb_build_object('dispatched',true,'request_id',v_request_id,'checked_at',current_timestamp);
end;
$$;

revoke all on function public.lr_verify_integrity_sync_secret(text) from public, anon, authenticated;
revoke all on function public.lr_integrity_watch(boolean) from public, anon, authenticated;

-- Recreate the hourly DST-safe gate. The function only dispatches during the
-- 08:00 America/Los_Angeles hour; the hourly cron makes DST conversion automatic.
do $$
begin
  perform cron.unschedule('local-roots-integrity-watch');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'local-roots-integrity-watch',
  '31 * * * *',
  'select public.lr_integrity_watch();'
);
