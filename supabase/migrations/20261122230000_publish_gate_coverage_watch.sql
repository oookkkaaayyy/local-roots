-- Publish completeness gate (core fields), public completeness RPC, coverage watch, schedules.
-- Applied live 2026-11-22; recorded here for repo parity. Rollback: drop trigger lr_event_publish_completeness_gate_trg;
-- cron.unschedule('coverage-watch'|'completeness-gap-watch'|'duplicate-watch').
create or replace function public.lr_event_publish_completeness_gate() returns trigger language plpgsql set search_path='' as $$
declare missing text[]:='{}';
begin
  if NEW.published and (TG_OP='INSERT' or coalesce(OLD.published,false)=false) then
    if nullif(btrim(NEW.name),'') is null then missing:=missing||'name'; end if;
    if NEW.start_date is null then missing:=missing||'start_date'; end if;
    if nullif(btrim(NEW.timezone),'') is null then missing:=missing||'timezone'; end if;
    if nullif(btrim(NEW.city),'') is null then missing:=missing||'city'; end if;
    if nullif(btrim(NEW.county),'') is null then missing:=missing||'county'; end if;
    if nullif(btrim(coalesce(NEW.course_name,NEW.venue_name)),'') is null then missing:=missing||'course_or_venue'; end if;
    if NEW.event_type is null then missing:=missing||'event_type'; end if;
    if array_length(missing,1)>0 then
      raise exception 'lr_publish_completeness_gate: cannot publish event, missing core fields: %', array_to_string(missing,', ') using errcode='23514';
    end if;
  end if;
  return NEW;
end $$;
create trigger lr_event_publish_completeness_gate_trg before insert or update of published on public.lr_events for each row execute function public.lr_event_publish_completeness_gate();

create or replace function public.lr_public_event_completeness() returns table(slug text, completeness_score numeric, required_filled int, required_total int, expected_filled int, expected_total int)
language sql stable security definer set search_path='public' as $$
  select c.slug,c.completeness_score,c.required_filled::int,c.required_total::int,c.expected_filled::int,c.expected_total::int from public.lr_event_completeness c where c.published
$$;
revoke all on function public.lr_public_event_completeness() from public;
grant execute on function public.lr_public_event_completeness() to anon, authenticated, service_role;

create table if not exists public.lr_coverage_watch(
  url text primary key, source_key text, label text, enabled boolean not null default true,
  last_status int, last_hash text, last_checked_at timestamptz, last_changed_at timestamptz, consecutive_failures int not null default 0,
  created_at timestamptz not null default now());
alter table public.lr_coverage_watch enable row level security;
-- seeds, secret creation, verify/dispatch/record functions: see live schema (lr_verify_coverage_sync_secret, lr_coverage_watch_targets, lr_record_coverage_check, lr_coverage_watch_dispatch).
select cron.schedule('completeness-gap-watch','23 * * * *',$$select public.lr_enqueue_completeness_gaps(60)$$);
select cron.schedule('duplicate-watch','53 */3 * * *',$$select public.lr_enqueue_duplicate_alerts()$$);
select cron.schedule('coverage-watch','41 11 * * *',$$select public.lr_coverage_watch_dispatch()$$);
