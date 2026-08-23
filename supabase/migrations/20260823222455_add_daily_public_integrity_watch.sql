-- Local Roots public integrity watch.
--
-- This migration establishes the persistent snapshot/evaluation layer. The original
-- production attempt also tried to perform the staging HTTP check from Postgres;
-- that approach was immediately superseded by the following Edge-worker migration
-- because pg_net response collection is not safe/reliable inside the same database
-- transaction. Keep this file replay-safe; the next migration installs the live
-- dispatch implementation.

create table if not exists public.lr_integrity_snapshots (
  snapshot_date date primary key,
  checked_at timestamptz not null default now(),
  public_event_count integer not null,
  published_without_provenance integer not null,
  sanctioned_without_basis integer not null,
  previous_public_event_count integer,
  staging_http_status integer,
  staging_ok boolean not null,
  anomalies text[] not null default '{}'::text[]
);

alter table public.lr_integrity_snapshots enable row level security;
revoke all on table public.lr_integrity_snapshots from anon, authenticated;

create or replace function public.lr_evaluate_integrity(
  p_public_events integer,
  p_published_without_provenance integer,
  p_sanctioned_without_basis integer,
  p_previous_public_events integer,
  p_staging_ok boolean
) returns text[]
language sql
immutable
set search_path = 'pg_catalog'
as $$
  select array_remove(array[
    case when coalesce(p_public_events,0)=0 then 'public_corpus_empty' end,
    case when coalesce(p_published_without_provenance,0)>0 then 'published_without_provenance' end,
    case when coalesce(p_sanctioned_without_basis,0)>0 then 'sanctioned_without_basis' end,
    case when p_previous_public_events is not null
               and p_previous_public_events >= 10
               and coalesce(p_public_events,0) < (p_previous_public_events * 0.5)
         then 'public_corpus_collapse' end,
    case when coalesce(p_staging_ok,false) is false then 'staging_unhealthy' end
  ], null::text);
$$;

create or replace function public.lr_record_integrity_snapshot(
  p_public_events integer,
  p_published_without_provenance integer,
  p_sanctioned_without_basis integer,
  p_staging_http_status integer,
  p_staging_ok boolean
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_date date := (current_timestamp at time zone 'America/Los_Angeles')::date;
  v_previous_public_events integer;
  v_anomalies text[];
  v_anomaly text;
  v_created integer := 0;
  v_severity text;
begin
  select s.public_event_count into v_previous_public_events
  from public.lr_integrity_snapshots s
  where s.snapshot_date < v_date
  order by s.snapshot_date desc
  limit 1;

  v_anomalies := public.lr_evaluate_integrity(
    p_public_events,
    p_published_without_provenance,
    p_sanctioned_without_basis,
    v_previous_public_events,
    p_staging_ok
  );

  insert into public.lr_integrity_snapshots(
    snapshot_date,checked_at,public_event_count,published_without_provenance,
    sanctioned_without_basis,previous_public_event_count,staging_http_status,staging_ok,anomalies
  ) values (
    v_date,current_timestamp,p_public_events,p_published_without_provenance,
    p_sanctioned_without_basis,v_previous_public_events,p_staging_http_status,p_staging_ok,v_anomalies
  )
  on conflict (snapshot_date) do update set
    checked_at=excluded.checked_at,
    public_event_count=excluded.public_event_count,
    published_without_provenance=excluded.published_without_provenance,
    sanctioned_without_basis=excluded.sanctioned_without_basis,
    previous_public_event_count=excluded.previous_public_event_count,
    staging_http_status=excluded.staging_http_status,
    staging_ok=excluded.staging_ok,
    anomalies=excluded.anomalies;

  foreach v_anomaly in array v_anomalies loop
    v_severity := case when v_anomaly='staging_unhealthy' then 'high' else 'critical' end;
    if not exists (
      select 1 from public.lr_review_queue q
      where q.issue_type='integrity_' || v_anomaly
        and q.details->>'snapshot_date'=v_date::text
    ) then
      insert into public.lr_review_queue(issue_type,severity,summary,details)
      values (
        'integrity_' || v_anomaly,
        v_severity,
        case v_anomaly
          when 'public_corpus_empty' then 'Local Roots public event corpus is empty'
          when 'published_without_provenance' then 'Published Local Roots events exist without provenance'
          when 'sanctioned_without_basis' then 'Published sanctioned events exist without sanction-basis provenance'
          when 'public_corpus_collapse' then 'Local Roots public event corpus collapsed by more than 50 percent'
          when 'staging_unhealthy' then 'Local Roots Cloudflare staging health check failed'
          else 'Local Roots integrity anomaly detected'
        end,
        jsonb_build_object(
          'snapshot_date',v_date,
          'integrity_watch',true,
          'public_event_count',p_public_events,
          'previous_public_event_count',v_previous_public_events,
          'published_without_provenance',p_published_without_provenance,
          'sanctioned_without_basis',p_sanctioned_without_basis,
          'staging_http_status',p_staging_http_status,
          'staging_ok',p_staging_ok,
          'anomaly',v_anomaly
        )
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'snapshot_date',v_date,
    'public_event_count',p_public_events,
    'previous_public_event_count',v_previous_public_events,
    'published_without_provenance',p_published_without_provenance,
    'sanctioned_without_basis',p_sanctioned_without_basis,
    'staging_http_status',p_staging_http_status,
    'staging_ok',p_staging_ok,
    'anomalies',to_jsonb(v_anomalies),
    'alerts_created',v_created
  );
end;
$$;

-- Temporary replay-safe stub. The next migration replaces this with the secret-gated
-- Edge worker dispatcher used in production.
create or replace function public.lr_integrity_watch(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
begin
  return jsonb_build_object(
    'dispatched',false,
    'reason','edge_worker_not_installed_yet',
    'checked_at',current_timestamp
  );
end;
$$;

revoke all on function public.lr_evaluate_integrity(integer,integer,integer,integer,boolean) from public, anon, authenticated;
revoke all on function public.lr_record_integrity_snapshot(integer,integer,integer,integer,boolean) from public, anon, authenticated;
revoke all on function public.lr_integrity_watch(boolean) from public, anon, authenticated;
