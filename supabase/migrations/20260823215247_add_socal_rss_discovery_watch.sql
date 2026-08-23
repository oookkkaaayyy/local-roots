create table if not exists public.lr_source_cursors (
  source_id uuid primary key references public.lr_sources(id) on delete cascade,
  cursor text not null,
  checked_at timestamptz not null default now()
);
alter table public.lr_source_cursors enable row level security;

create table if not exists public.lr_source_discovery_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.lr_sources(id) on delete cascade,
  external_id text not null,
  title text not null,
  source_url text not null,
  published_at timestamptz,
  review_id uuid references public.lr_review_queue(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lr_source_discovery_items_external_id_check check (btrim(external_id) <> ''),
  constraint lr_source_discovery_items_title_check check (btrim(title) <> ''),
  constraint lr_source_discovery_items_url_check check (public.lr_is_http_url(source_url)),
  constraint lr_source_discovery_items_source_external_unique unique (source_id, external_id)
);
alter table public.lr_source_discovery_items enable row level security;
create index if not exists lr_source_discovery_items_source_created_idx on public.lr_source_discovery_items(source_id,created_at desc);

insert into public.lr_sources(key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,refresh_schedule,expected_min_records,expected_max_records,notes)
values(
  'socal_dgc_rss',
  'SoCal Disc Golf Club RSS',
  'feed',
  'https://socaldiscgolfclub.com/feed/',
  'Public WordPress RSS feed; discovery-only change detection',
  'RSS syndication endpoint intentionally exposed by the source site. Used only to detect new posts for human review; it cannot publish or modify events.',
  true,
  '{}'::text[],
  'Every 6 hours; review-only',
  1,
  100,
  'Supplemental discovery sentinel. First run establishes the current feed watermark without creating historical alerts. New feed posts create review items only.'
)
on conflict(key) do update set
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
  notes=excluded.notes,
  updated_at=now();

create or replace function public.lr_verify_socal_rss_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from vault.decrypted_secrets s
    where s.name='local_roots_socal_rss_sync_secret'
      and s.decrypted_secret=p_token
  );
$$;
revoke all on function public.lr_verify_socal_rss_sync_secret(text) from public, anon, authenticated;
grant execute on function public.lr_verify_socal_rss_sync_secret(text) to service_role;

create or replace function public.lr_trigger_socal_rss_sync(p_trigger text default 'manual')
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  request_id bigint;
  sync_secret text;
begin
  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name='local_roots_socal_rss_sync_secret'
  limit 1;
  if sync_secret is null then raise exception 'SoCal RSS sync scheduler secret missing'; end if;

  select net.http_post(
    url := 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/lr-sync-socal-rss',
    headers := jsonb_build_object('Content-Type','application/json','x-local-roots-sync-secret',sync_secret),
    body := jsonb_build_object('trigger',case when p_trigger='cron' then 'cron' else 'manual' end,'requested_at',now()),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.lr_trigger_socal_rss_sync(text) from public, anon, authenticated;
grant execute on function public.lr_trigger_socal_rss_sync(text) to service_role;

select cron.unschedule(jobname) from cron.job where jobname='local-roots-socal-rss-discovery';
select cron.schedule('local-roots-socal-rss-discovery','17 */6 * * *','select public.lr_trigger_socal_rss_sync(''cron'');');
