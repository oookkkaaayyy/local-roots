-- Local Roots Events — Milestone 1 domain model
-- Source-neutral canonical event schema. No external adapters.

create extension if not exists pgcrypto;

create or replace function public.lr_is_http_url(p_value text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select p_value ~* '^https?://[^\s]+$'
$$;

create or replace function public.lr_normalize_county(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select lower(regexp_replace(btrim(p_value), '\s+county$', '', 'i'))
$$;

create or replace function public.lr_is_plausible_course_name(p_value text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case
    when btrim(p_value) = '' then false
    when lower(btrim(p_value)) in ('yes','no','a-tier','b-tier','c-tier','x-tier','a tier','b tier','c tier','x tier') then false
    when lower(btrim(p_value)) ~ '^(yes|no)\s*-\s*[a-z0-9]+\s*-?\s*tier$' then false
    else true
  end
$$;

create or replace function public.lr_is_overridable_event_field(p_field text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select p_field = any(array['name','start_date','end_date','county','city','venue_name','course_name','rounds_text','event_type','format','sanctioned','tier','status','registration_status','registration_url','results_url','club_host','td_names']::text[])
$$;

create table public.lr_scope_profiles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  allowed_counties text[] not null default '{}',
  allowed_cities text[] not null default '{}',
  allowed_course_names text[] not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index lr_scope_profiles_one_active_idx on public.lr_scope_profiles ((active)) where active;

create table public.lr_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  source_type text not null check (source_type in ('internal','api','feed','organizer_submission','manual','club','regional_calendar','other')),
  base_url text,
  access_method text not null check (btrim(access_method) <> ''),
  permission_basis text not null check (btrim(permission_basis) <> ''),
  enabled boolean not null default true,
  authoritative_fields text[] not null default '{}',
  refresh_schedule text,
  expected_min_records integer check (expected_min_records is null or expected_min_records >= 0),
  expected_max_records integer check (expected_max_records is null or expected_max_records >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lr_sources_base_url_http_check check (base_url is null or public.lr_is_http_url(base_url)),
  constraint lr_sources_expected_range_check check (expected_min_records is null or expected_max_records is null or expected_max_records >= expected_min_records)
);

create table public.lr_source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.lr_sources(id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetch_status text not null default 'pending' check (fetch_status in ('pending','running','ok','failed','skipped')),
  parse_status text not null default 'pending' check (parse_status in ('pending','running','ok','failed','skipped')),
  validation_status text not null default 'pending' check (validation_status in ('pending','ok','warning','failed','skipped')),
  health_status text not null default 'running' check (health_status in ('running','healthy','warning','unhealthy','unknown')),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_valid integer not null default 0 check (records_valid >= 0),
  records_new integer not null default 0 check (records_new >= 0),
  records_changed integer not null default 0 check (records_changed >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  records_missing integer not null default 0 check (records_missing >= 0),
  error_code text,
  error_message text,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  parser_version text,
  created_at timestamptz not null default now(),
  constraint lr_source_runs_finished_after_start_check check (finished_at is null or finished_at >= started_at),
  constraint lr_source_runs_valid_not_over_seen_check check (records_valid <= records_seen),
  constraint lr_source_runs_rejected_not_over_seen_check check (records_rejected <= records_seen)
);
create index lr_source_runs_source_started_idx on public.lr_source_runs(source_id, started_at desc);

create table public.lr_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> '' and name !~ '^\s*\d+\s*$'),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'America/Los_Angeles' check (btrim(timezone) <> ''),
  county text,
  city text,
  venue_name text,
  course_name text,
  rounds_text text,
  event_type text not null check (event_type in ('tournament','flex_start','league','doubles','team','putting','ace_race','circuit_challenge','tag_match','clinic','charity','community','other')),
  format text,
  sanctioned boolean,
  tier text,
  status text not null default 'upcoming' check (status in ('announced','upcoming','registration_open','full','waitlist','postponed','date_changed','canceled','completed')),
  registration_status text check (registration_status is null or registration_status in ('unknown','not_open','open','waitlist','full','closed','canceled')),
  registration_url text,
  results_url text,
  club_host text,
  td_names text[] not null default '{}',
  published boolean not null default false,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  last_verified_at timestamptz,
  last_changed_at timestamptz not null default now(),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lr_events_date_order_check check (end_date >= start_date),
  constraint lr_events_course_plausibility_check check (course_name is null or public.lr_is_plausible_course_name(course_name)),
  constraint lr_events_registration_url_http_check check (registration_url is null or public.lr_is_http_url(registration_url)),
  constraint lr_events_results_url_http_check check (results_url is null or public.lr_is_http_url(results_url))
);
create index lr_events_dates_idx on public.lr_events(start_date, end_date);
create index lr_events_published_dates_idx on public.lr_events(start_date, end_date) where published;
create index lr_events_county_idx on public.lr_events(county);

create table public.lr_event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lr_events(id) on delete cascade,
  source_id uuid not null references public.lr_sources(id) on delete restrict,
  external_id text,
  source_url text not null check (public.lr_is_http_url(source_url)),
  source_role text not null check (source_role in ('discovery','official','registration','results','organizer_confirmed','manual_verification')),
  is_sanction_basis boolean not null default false,
  source_payload jsonb,
  payload_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lr_event_sources_seen_order_check check (last_seen_at >= first_seen_at),
  constraint lr_event_sources_payload_object_check check (source_payload is null or jsonb_typeof(source_payload) = 'object')
);
create unique index lr_event_sources_external_id_unique_idx on public.lr_event_sources(source_id, external_id) where external_id is not null;
create unique index lr_event_sources_source_url_unique_idx on public.lr_event_sources(source_id, source_url);
create index lr_event_sources_event_idx on public.lr_event_sources(event_id);

create table public.lr_source_candidates (
  id uuid primary key default gen_random_uuid(),
  source_run_id uuid not null references public.lr_source_runs(id) on delete restrict,
  source_id uuid not null references public.lr_sources(id) on delete restrict,
  external_id text,
  source_url text check (source_url is null or public.lr_is_http_url(source_url)),
  normalized_payload jsonb not null,
  validation_status text not null default 'pending' check (validation_status in ('pending','valid','invalid','warning')),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  match_event_id uuid references public.lr_events(id) on delete set null,
  match_confidence numeric(5,4) check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  promotion_status text not null default 'pending' check (promotion_status in ('pending','promoted','review_required','rejected','duplicate','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lr_source_candidates_named_object_check check (jsonb_typeof(normalized_payload) = 'object')
);
create index lr_source_candidates_run_idx on public.lr_source_candidates(source_run_id);
create index lr_source_candidates_match_idx on public.lr_source_candidates(match_event_id) where match_event_id is not null;

create table public.lr_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lr_events(id) on delete cascade,
  division_code text not null check (btrim(division_code) <> ''),
  place integer not null check (place > 0),
  player_name text not null check (btrim(player_name) <> ''),
  pdga_number integer check (pdga_number is null or pdga_number > 0),
  total_score integer,
  to_par integer,
  points numeric,
  rating numeric,
  source_url text not null check (public.lr_is_http_url(source_url)),
  source_id uuid not null references public.lr_sources(id) on delete restrict,
  is_public_selected_division boolean not null default false,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, division_code, place, player_name)
);
create index lr_results_event_selected_idx on public.lr_results(event_id, division_code, place) where is_public_selected_division;

create table public.lr_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lr_events(id) on delete cascade,
  field_name text not null check (public.lr_is_overridable_event_field(field_name)),
  original_value jsonb,
  override_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  constraint lr_manual_overrides_release_state_check check ((active and released_at is null) or (not active and released_at is not null))
);
create unique index lr_manual_overrides_one_active_field_idx on public.lr_manual_overrides(event_id, field_name) where active;
create index lr_manual_overrides_event_idx on public.lr_manual_overrides(event_id, active);

create table public.lr_review_queue (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null check (btrim(issue_type) <> ''),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  event_id uuid references public.lr_events(id) on delete set null,
  source_candidate_id uuid references public.lr_source_candidates(id) on delete set null,
  summary text not null check (btrim(summary) <> ''),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'open' check (status in ('open','in_review','resolved','rejected','duplicate')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  constraint lr_review_queue_resolution_state_check check ((status in ('open','in_review') and resolved_at is null) or (status in ('resolved','rejected','duplicate') and resolved_at is not null))
);
create index lr_review_queue_open_idx on public.lr_review_queue(status, severity, created_at) where status in ('open','in_review');

create or replace function public.lr_touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin new.updated_at := now(); return new; end
$$;
create trigger lr_scope_profiles_touch_updated_at before update on public.lr_scope_profiles for each row execute function public.lr_touch_updated_at();
create trigger lr_sources_touch_updated_at before update on public.lr_sources for each row execute function public.lr_touch_updated_at();
create trigger lr_events_touch_updated_at before update on public.lr_events for each row execute function public.lr_touch_updated_at();
create trigger lr_event_sources_touch_updated_at before update on public.lr_event_sources for each row execute function public.lr_touch_updated_at();
create trigger lr_source_candidates_touch_updated_at before update on public.lr_source_candidates for each row execute function public.lr_touch_updated_at();
create trigger lr_results_touch_updated_at before update on public.lr_results for each row execute function public.lr_touch_updated_at();

create or replace function public.lr_event_is_in_active_scope(p_county text,p_city text,p_course_name text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.lr_scope_profiles sp
    where sp.active and (
      (p_county is not null and public.lr_normalize_county(p_county) = any (select public.lr_normalize_county(x) from unnest(sp.allowed_counties) as x))
      or (p_city is not null and lower(btrim(p_city)) = any (select lower(btrim(x)) from unnest(sp.allowed_cities) as x))
      or (p_course_name is not null and lower(btrim(p_course_name)) = any (select lower(btrim(x)) from unnest(sp.allowed_course_names) as x))
    )
  )
$$;

create or replace function public.lr_validate_event_publication()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.published then
    if new.last_verified_at is null then raise exception 'Published Local Roots event % requires last_verified_at', new.id using errcode='23514'; end if;
    if not public.lr_event_is_in_active_scope(new.county,new.city,new.course_name) then raise exception 'Published Local Roots event % is outside the active scope', new.id using errcode='23514'; end if;
    if not exists (select 1 from public.lr_event_sources es where es.event_id=new.id) then raise exception 'Published Local Roots event % requires provenance', new.id using errcode='23514'; end if;
    if new.sanctioned is true and not exists (select 1 from public.lr_event_sources es where es.event_id=new.id and es.is_sanction_basis) then raise exception 'Sanctioned Local Roots event % requires a sanction-basis source', new.id using errcode='23514'; end if;
  end if;
  return new;
end
$$;
create trigger lr_events_validate_publication before insert or update of published,sanctioned,county,city,course_name,last_verified_at on public.lr_events for each row execute function public.lr_validate_event_publication();

create or replace function public.lr_protect_published_event_provenance()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_event_id uuid; v_published boolean; v_sanctioned boolean; v_other_sources integer; v_other_sanction_sources integer;
begin
  v_event_id := old.event_id;
  select e.published,e.sanctioned into v_published,v_sanctioned from public.lr_events e where e.id=v_event_id;
  if not coalesce(v_published,false) then if tg_op='DELETE' then return old; else return new; end if; end if;
  if tg_op='DELETE' then
    select count(*) into v_other_sources from public.lr_event_sources es where es.event_id=v_event_id and es.id<>old.id;
    if v_other_sources=0 then raise exception 'Cannot remove the final provenance row from published Local Roots event %',v_event_id using errcode='23514'; end if;
    if coalesce(v_sanctioned,false) and old.is_sanction_basis then
      select count(*) into v_other_sanction_sources from public.lr_event_sources es where es.event_id=v_event_id and es.id<>old.id and es.is_sanction_basis;
      if v_other_sanction_sources=0 then raise exception 'Cannot remove the final sanction-basis row from sanctioned published Local Roots event %',v_event_id using errcode='23514'; end if;
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if new.event_id<>old.event_id then raise exception 'Cannot move provenance away from a published Local Roots event' using errcode='23514'; end if;
    if coalesce(v_sanctioned,false) and old.is_sanction_basis and not new.is_sanction_basis then
      select count(*) into v_other_sanction_sources from public.lr_event_sources es where es.event_id=v_event_id and es.id<>old.id and es.is_sanction_basis;
      if v_other_sanction_sources=0 then raise exception 'Cannot clear the final sanction-basis row from sanctioned published Local Roots event %',v_event_id using errcode='23514'; end if;
    end if;
    return new;
  end if;
  return new;
end
$$;
create trigger lr_event_sources_protect_published_provenance before delete or update of event_id,is_sanction_basis on public.lr_event_sources for each row execute function public.lr_protect_published_event_provenance();

create or replace function public.lr_event_field_value(p_event_id uuid,p_field_name text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare e public.lr_events%rowtype;
begin
  if not public.lr_is_overridable_event_field(p_field_name) then raise exception 'Unsupported Local Roots event override field: %',p_field_name using errcode='22023'; end if;
  select * into e from public.lr_events where id=p_event_id;
  if not found then raise exception 'Local Roots event not found: %',p_event_id using errcode='P0002'; end if;
  return case p_field_name
    when 'name' then to_jsonb(e.name) when 'start_date' then to_jsonb(e.start_date) when 'end_date' then to_jsonb(e.end_date)
    when 'county' then to_jsonb(e.county) when 'city' then to_jsonb(e.city) when 'venue_name' then to_jsonb(e.venue_name)
    when 'course_name' then to_jsonb(e.course_name) when 'rounds_text' then to_jsonb(e.rounds_text) when 'event_type' then to_jsonb(e.event_type)
    when 'format' then to_jsonb(e.format) when 'sanctioned' then to_jsonb(e.sanctioned) when 'tier' then to_jsonb(e.tier)
    when 'status' then to_jsonb(e.status) when 'registration_status' then to_jsonb(e.registration_status) when 'registration_url' then to_jsonb(e.registration_url)
    when 'results_url' then to_jsonb(e.results_url) when 'club_host' then to_jsonb(e.club_host) when 'td_names' then to_jsonb(e.td_names)
  end;
end
$$;

create or replace function public.lr_set_manual_override(p_event_id uuid,p_field_name text,p_override_value jsonb,p_reason text,p_created_by uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_original jsonb; v_override_id uuid;
begin
  if not public.lr_is_overridable_event_field(p_field_name) then raise exception 'Unsupported Local Roots event override field: %',p_field_name using errcode='22023'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'Manual override reason is required' using errcode='23514'; end if;
  v_original := public.lr_event_field_value(p_event_id,p_field_name);
  insert into public.lr_manual_overrides(event_id,field_name,original_value,override_value,reason,active,created_by)
  values(p_event_id,p_field_name,v_original,p_override_value,p_reason,true,p_created_by)
  on conflict (event_id,field_name) where active do update set override_value=excluded.override_value,reason=excluded.reason,created_by=coalesce(excluded.created_by,public.lr_manual_overrides.created_by)
  returning id into v_override_id;
  update public.lr_events e set
    name=case when p_field_name='name' then p_override_value#>>'{}' else e.name end,
    start_date=case when p_field_name='start_date' then (p_override_value#>>'{}')::date else e.start_date end,
    end_date=case when p_field_name='end_date' then (p_override_value#>>'{}')::date else e.end_date end,
    county=case when p_field_name='county' then p_override_value#>>'{}' else e.county end,
    city=case when p_field_name='city' then p_override_value#>>'{}' else e.city end,
    venue_name=case when p_field_name='venue_name' then p_override_value#>>'{}' else e.venue_name end,
    course_name=case when p_field_name='course_name' then p_override_value#>>'{}' else e.course_name end,
    rounds_text=case when p_field_name='rounds_text' then p_override_value#>>'{}' else e.rounds_text end,
    event_type=case when p_field_name='event_type' then p_override_value#>>'{}' else e.event_type end,
    format=case when p_field_name='format' then p_override_value#>>'{}' else e.format end,
    sanctioned=case when p_field_name='sanctioned' then (p_override_value#>>'{}')::boolean else e.sanctioned end,
    tier=case when p_field_name='tier' then p_override_value#>>'{}' else e.tier end,
    status=case when p_field_name='status' then p_override_value#>>'{}' else e.status end,
    registration_status=case when p_field_name='registration_status' then p_override_value#>>'{}' else e.registration_status end,
    registration_url=case when p_field_name='registration_url' then p_override_value#>>'{}' else e.registration_url end,
    results_url=case when p_field_name='results_url' then p_override_value#>>'{}' else e.results_url end,
    club_host=case when p_field_name='club_host' then p_override_value#>>'{}' else e.club_host end,
    td_names=case when p_field_name='td_names' then array(select jsonb_array_elements_text(p_override_value)) else e.td_names end,
    last_changed_at=now()
  where e.id=p_event_id;
  return v_override_id;
end
$$;

create or replace function public.lr_release_manual_override(p_event_id uuid,p_field_name text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  update public.lr_manual_overrides set active=false,released_at=now() where event_id=p_event_id and field_name=p_field_name and active;
  get diagnostics v_count=row_count;
  return v_count>0;
end
$$;

create or replace function public.lr_apply_event_patch(p_event_id uuid,p_patch jsonb)
returns public.lr_events language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_event public.lr_events%rowtype;
begin
  if jsonb_typeof(p_patch)<>'object' then raise exception 'Local Roots event patch must be a named JSON object' using errcode='22023'; end if;
  update public.lr_events e set
    name=case when p_patch?'name' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='name' and mo.active) then p_patch->>'name' else e.name end,
    start_date=case when p_patch?'start_date' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='start_date' and mo.active) then (p_patch->>'start_date')::date else e.start_date end,
    end_date=case when p_patch?'end_date' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='end_date' and mo.active) then (p_patch->>'end_date')::date else e.end_date end,
    county=case when p_patch?'county' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='county' and mo.active) then p_patch->>'county' else e.county end,
    city=case when p_patch?'city' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='city' and mo.active) then p_patch->>'city' else e.city end,
    venue_name=case when p_patch?'venue_name' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='venue_name' and mo.active) then p_patch->>'venue_name' else e.venue_name end,
    course_name=case when p_patch?'course_name' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='course_name' and mo.active) then p_patch->>'course_name' else e.course_name end,
    rounds_text=case when p_patch?'rounds_text' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='rounds_text' and mo.active) then p_patch->>'rounds_text' else e.rounds_text end,
    event_type=case when p_patch?'event_type' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='event_type' and mo.active) then p_patch->>'event_type' else e.event_type end,
    format=case when p_patch?'format' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='format' and mo.active) then p_patch->>'format' else e.format end,
    sanctioned=case when p_patch?'sanctioned' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='sanctioned' and mo.active) then (p_patch->>'sanctioned')::boolean else e.sanctioned end,
    tier=case when p_patch?'tier' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='tier' and mo.active) then p_patch->>'tier' else e.tier end,
    status=case when p_patch?'status' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='status' and mo.active) then p_patch->>'status' else e.status end,
    registration_status=case when p_patch?'registration_status' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='registration_status' and mo.active) then p_patch->>'registration_status' else e.registration_status end,
    registration_url=case when p_patch?'registration_url' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='registration_url' and mo.active) then p_patch->>'registration_url' else e.registration_url end,
    results_url=case when p_patch?'results_url' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='results_url' and mo.active) then p_patch->>'results_url' else e.results_url end,
    club_host=case when p_patch?'club_host' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='club_host' and mo.active) then p_patch->>'club_host' else e.club_host end,
    td_names=case when p_patch?'td_names' and not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name='td_names' and mo.active) then array(select jsonb_array_elements_text(p_patch->'td_names')) else e.td_names end,
    confidence=case when p_patch?'confidence' then (p_patch->>'confidence')::numeric else e.confidence end,
    last_verified_at=case when p_patch?'last_verified_at' then (p_patch->>'last_verified_at')::timestamptz else e.last_verified_at end,
    last_changed_at=case when p_patch-array['confidence','last_verified_at']<>'{}'::jsonb then now() else e.last_changed_at end
  where e.id=p_event_id returning e.* into v_event;
  if not found then raise exception 'Local Roots event not found: %',p_event_id using errcode='P0002'; end if;
  return v_event;
end
$$;

create or replace function public.lr_public_events()
returns table(id uuid,slug text,name text,start_date date,end_date date,timezone text,county text,city text,venue_name text,course_name text,rounds_text text,event_type text,format text,sanctioned boolean,tier text,status text,registration_status text,registration_url text,results_url text,club_host text,td_names text[],last_verified_at timestamptz,last_changed_at timestamptz,top_results jsonb)
language sql stable security definer set search_path = pg_catalog, public as $$
  select e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,e.venue_name,e.course_name,e.rounds_text,e.event_type,e.format,e.sanctioned,e.tier,e.status,e.registration_status,e.registration_url,e.results_url,e.club_host,e.td_names,e.last_verified_at,e.last_changed_at,
    coalesce((select jsonb_agg(jsonb_build_object('division_code',r.division_code,'place',r.place,'player_name',r.player_name,'pdga_number',r.pdga_number,'total_score',r.total_score,'to_par',r.to_par,'points',r.points,'rating',r.rating,'source_url',r.source_url,'last_verified_at',r.last_verified_at) order by r.place,r.player_name) from public.lr_results r where r.event_id=e.id and r.is_public_selected_division),'[]'::jsonb) as top_results
  from public.lr_events e where e.published order by e.start_date,e.name
$$;

alter table public.lr_scope_profiles enable row level security;
alter table public.lr_sources enable row level security;
alter table public.lr_source_runs enable row level security;
alter table public.lr_events enable row level security;
alter table public.lr_event_sources enable row level security;
alter table public.lr_source_candidates enable row level security;
alter table public.lr_results enable row level security;
alter table public.lr_manual_overrides enable row level security;
alter table public.lr_review_queue enable row level security;

revoke all on table public.lr_scope_profiles,public.lr_sources,public.lr_source_runs,public.lr_events,public.lr_event_sources,public.lr_source_candidates,public.lr_results,public.lr_manual_overrides,public.lr_review_queue from anon,authenticated;
grant all on table public.lr_scope_profiles,public.lr_sources,public.lr_source_runs,public.lr_events,public.lr_event_sources,public.lr_source_candidates,public.lr_results,public.lr_manual_overrides,public.lr_review_queue to service_role;

revoke all on function public.lr_public_events() from public;
grant execute on function public.lr_public_events() to anon,authenticated,service_role;
revoke all on function public.lr_event_is_in_active_scope(text,text,text),public.lr_event_field_value(uuid,text),public.lr_set_manual_override(uuid,text,jsonb,text,uuid),public.lr_release_manual_override(uuid,text),public.lr_apply_event_patch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lr_event_is_in_active_scope(text,text,text),public.lr_event_field_value(uuid,text),public.lr_set_manual_override(uuid,text,jsonb,text,uuid),public.lr_release_manual_override(uuid,text),public.lr_apply_event_patch(uuid,jsonb) to service_role;

insert into public.lr_scope_profiles(key,name,allowed_counties,active)
values('socal_six_county','Southern California — six county production scope',array['Ventura','Los Angeles','Orange','Riverside','San Bernardino','San Diego']::text[],true);
