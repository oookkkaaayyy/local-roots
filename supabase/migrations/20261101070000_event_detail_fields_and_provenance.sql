-- Events P0 Stage 1: structured public details and safe field-level provenance.
-- Additive only. No event, result, source, override, or review rows are deleted.
begin;

alter table public.lr_events
  add column if not exists venue_address text,
  add column if not exists course_id text,
  add column if not exists course_url text,
  add column if not exists start_time_local time without time zone,
  add column if not exists end_time_local time without time zone,
  add column if not exists format_details jsonb not null default '{}'::jsonb,
  add column if not exists entry_fee_amount numeric(10,2),
  add column if not exists entry_fee_currency text,
  add column if not exists entry_fee_unit text,
  add column if not exists fee_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists additional_fees_note text,
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz,
  add column if not exists registration_capacity integer,
  add column if not exists registration_available integer,
  add column if not exists official_url text;

alter table public.lr_events
  add constraint lr_events_course_url_http_check check (course_url is null or public.lr_is_http_url(course_url)),
  add constraint lr_events_official_url_http_check check (official_url is null or public.lr_is_http_url(official_url)),
  add constraint lr_events_format_details_object_check check (jsonb_typeof(format_details) = 'object'),
  add constraint lr_events_fee_breakdown_array_check check (jsonb_typeof(fee_breakdown) = 'array'),
  add constraint lr_events_fee_amount_nonnegative_check check (entry_fee_amount is null or entry_fee_amount >= 0),
  add constraint lr_events_fee_currency_check check (entry_fee_currency is null or entry_fee_currency ~ '^[A-Z]{3}$'),
  add constraint lr_events_fee_unit_currency_pair_check check (
    entry_fee_amount is null or (entry_fee_currency is not null and nullif(btrim(entry_fee_unit),'') is not null)
  ),
  add constraint lr_events_end_time_requires_start_check check (end_time_local is null or start_time_local is not null),
  add constraint lr_events_same_day_time_order_check check (
    coalesce(end_date,start_date) is distinct from start_date or start_time_local is null or end_time_local is null or end_time_local > start_time_local
  ),
  add constraint lr_events_registration_capacity_check check (
    (registration_capacity is null or registration_capacity >= 0)
    and (registration_available is null or registration_available >= 0)
    and (registration_capacity is null or registration_available is null or registration_available <= registration_capacity)
  ),
  add constraint lr_events_registration_window_check check (
    registration_opens_at is null or registration_closes_at is null or registration_closes_at > registration_opens_at
  );

alter table public.lr_event_submissions
  add column if not exists venue_address text,
  add column if not exists course_id text,
  add column if not exists course_url text,
  add column if not exists start_time_local time without time zone,
  add column if not exists end_time_local time without time zone,
  add column if not exists timezone text,
  add column if not exists format_details jsonb not null default '{}'::jsonb,
  add column if not exists entry_fee_amount numeric(10,2),
  add column if not exists entry_fee_currency text,
  add column if not exists entry_fee_unit text,
  add column if not exists fee_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists additional_fees_note text,
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz,
  add column if not exists registration_capacity integer,
  add column if not exists registration_available integer,
  add column if not exists official_url text;

-- This table is internal. Public consumers only receive canonical event fields.
create table if not exists public.lr_event_field_evidence (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lr_events(id) on delete cascade,
  field_name text not null,
  source_id uuid references public.lr_sources(id) on delete restrict,
  source_candidate_id uuid references public.lr_source_candidates(id) on delete set null,
  source_url text,
  status text not null check (status in ('verified','not_applicable','not_announced','missing_despite_available_evidence','unverified','stale','conflicting')),
  observed_value jsonb,
  verified_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lr_event_field_evidence_source_url_check check (source_url is null or public.lr_is_http_url(source_url)),
  constraint lr_event_field_evidence_name_check check (field_name = any(array[
    'name','start_date','end_date','timezone','county','city','venue_name','venue_address','course_name','course_id','course_url','start_time_local','end_time_local',
    'rounds_text','event_type','format','format_details','sanctioned','tier','status','registration_status','registration_url',
    'registration_opens_at','registration_closes_at','registration_capacity','registration_available','entry_fee_amount',
    'entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','official_url','results_url','club_host','td_names'
  ]::text[]))
);

create unique index if not exists lr_event_field_evidence_source_key
  on public.lr_event_field_evidence(event_id,field_name,source_id) where source_id is not null;
create unique index if not exists lr_event_field_evidence_manual_key
  on public.lr_event_field_evidence(event_id,field_name) where source_id is null;
create index if not exists lr_event_field_evidence_expiry_idx
  on public.lr_event_field_evidence(expires_at) where status='verified' and expires_at is not null;
alter table public.lr_event_field_evidence enable row level security;
revoke all on public.lr_event_field_evidence from public,anon,authenticated;
grant all on public.lr_event_field_evidence to service_role;

insert into public.lr_sources(key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,notes)
values(
  'hbnf_udisc_manual','HBNF organizer listings (manual verification)','manual','https://udisc.com',
  'Manual verification only of exact organizer-supplied HBNF event/course links; automated crawling is disabled.',
  'The owner supplied the specific November 3, 10, and 17, 2026 organizer listing URLs and confirmed their facts. Retain only the listed event metadata and links; do not scrape or extrapolate to later dates.',
  true,
  array['name','start_date','end_date','timezone','county','city','course_name','course_id','course_url','event_type','format','format_details','start_time_local','end_time_local','entry_fee_amount','entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','official_url']::text[],
  'No automated retrieval. Exact event-specific facts from the owner-provided listings only; later Tuesdays remain unverified for time, venue, fee, and event URL.'
)
on conflict(key) do update set
  access_method=excluded.access_method,
  permission_basis=excluded.permission_basis,
  authoritative_fields=excluded.authoritative_fields,
  notes=excluded.notes,
  updated_at=now();

create or replace function public.lr_is_overridable_event_field(p_field text)
returns boolean language sql immutable strict set search_path=pg_catalog as $$
  select p_field = any(array[
    'name','start_date','end_date','timezone','county','city','venue_name','venue_address','course_name','course_id','course_url','start_time_local','end_time_local',
    'rounds_text','event_type','format','format_details','sanctioned','tier','status','registration_status','registration_url',
    'registration_opens_at','registration_closes_at','registration_capacity','registration_available','entry_fee_amount',
    'entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','official_url','results_url','club_host','td_names'
  ]::text[])
$$;

create or replace function public.lr_event_field_value(p_event_id uuid,p_field_name text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.lr_events%rowtype;
begin
  if not public.lr_is_overridable_event_field(p_field_name) then raise exception 'Unsupported Local Roots event field: %',p_field_name using errcode='22023'; end if;
  select * into e from public.lr_events where id=p_event_id;
  if not found then raise exception 'Local Roots event not found: %',p_event_id using errcode='P0002'; end if;
  return case p_field_name
    when 'name' then to_jsonb(e.name) when 'start_date' then to_jsonb(e.start_date) when 'end_date' then to_jsonb(e.end_date)
    when 'timezone' then to_jsonb(e.timezone) when 'county' then to_jsonb(e.county) when 'city' then to_jsonb(e.city)
    when 'venue_name' then to_jsonb(e.venue_name) when 'venue_address' then to_jsonb(e.venue_address)
    when 'course_name' then to_jsonb(e.course_name) when 'course_id' then to_jsonb(e.course_id) when 'course_url' then to_jsonb(e.course_url)
    when 'start_time_local' then to_jsonb(e.start_time_local) when 'end_time_local' then to_jsonb(e.end_time_local)
    when 'rounds_text' then to_jsonb(e.rounds_text) when 'event_type' then to_jsonb(e.event_type) when 'format' then to_jsonb(e.format)
    when 'format_details' then to_jsonb(e.format_details) when 'sanctioned' then to_jsonb(e.sanctioned) when 'tier' then to_jsonb(e.tier)
    when 'status' then to_jsonb(e.status) when 'registration_status' then to_jsonb(e.registration_status)
    when 'registration_url' then to_jsonb(e.registration_url) when 'registration_opens_at' then to_jsonb(e.registration_opens_at)
    when 'registration_closes_at' then to_jsonb(e.registration_closes_at) when 'registration_capacity' then to_jsonb(e.registration_capacity)
    when 'registration_available' then to_jsonb(e.registration_available) when 'entry_fee_amount' then to_jsonb(e.entry_fee_amount)
    when 'entry_fee_currency' then to_jsonb(e.entry_fee_currency) when 'entry_fee_unit' then to_jsonb(e.entry_fee_unit)
    when 'fee_breakdown' then to_jsonb(e.fee_breakdown) when 'additional_fees_note' then to_jsonb(e.additional_fees_note)
    when 'official_url' then to_jsonb(e.official_url) when 'results_url' then to_jsonb(e.results_url)
    when 'club_host' then to_jsonb(e.club_host) when 'td_names' then to_jsonb(e.td_names)
  end;
end
$$;
revoke all on function public.lr_event_field_value(uuid,text) from public,anon,authenticated;
grant execute on function public.lr_event_field_value(uuid,text) to service_role;

-- A named field setter centralizes type conversion for source patches and admin overrides.
create or replace function public.lr_set_event_field_value(p_event_id uuid,p_field_name text,p_value jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.lr_is_overridable_event_field(p_field_name) then raise exception 'Unsupported Local Roots event field: %',p_field_name using errcode='22023'; end if;
  if p_value is null then raise exception 'Event field value cannot be SQL NULL' using errcode='22023'; end if;
  if p_field_name='timezone' and not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_value#>>'{}') then
    raise exception 'Unknown IANA timezone: %',p_value#>>'{}' using errcode='22023';
  end if;
  update public.lr_events e set
    name=case when p_field_name='name' then p_value#>>'{}' else e.name end,
    start_date=case when p_field_name='start_date' then (p_value#>>'{}')::date else e.start_date end,
    end_date=case when p_field_name='end_date' then (p_value#>>'{}')::date else e.end_date end,
    timezone=case when p_field_name='timezone' then p_value#>>'{}' else e.timezone end,
    county=case when p_field_name='county' then p_value#>>'{}' else e.county end,
    city=case when p_field_name='city' then p_value#>>'{}' else e.city end,
    venue_name=case when p_field_name='venue_name' then p_value#>>'{}' else e.venue_name end,
    venue_address=case when p_field_name='venue_address' then p_value#>>'{}' else e.venue_address end,
    course_name=case when p_field_name='course_name' then p_value#>>'{}' else e.course_name end,
    course_id=case when p_field_name='course_id' then p_value#>>'{}' else e.course_id end,
    course_url=case when p_field_name='course_url' then p_value#>>'{}' else e.course_url end,
    start_time_local=case when p_field_name='start_time_local' then (p_value#>>'{}')::time else e.start_time_local end,
    end_time_local=case when p_field_name='end_time_local' then (p_value#>>'{}')::time else e.end_time_local end,
    rounds_text=case when p_field_name='rounds_text' then p_value#>>'{}' else e.rounds_text end,
    event_type=case when p_field_name='event_type' then p_value#>>'{}' else e.event_type end,
    format=case when p_field_name='format' then p_value#>>'{}' else e.format end,
    format_details=case when p_field_name='format_details' then case when jsonb_typeof(p_value)='null' then '{}'::jsonb else p_value end else e.format_details end,
    sanctioned=case when p_field_name='sanctioned' then (p_value#>>'{}')::boolean else e.sanctioned end,
    tier=case when p_field_name='tier' then p_value#>>'{}' else e.tier end,
    status=case when p_field_name='status' then p_value#>>'{}' else e.status end,
    registration_status=case when p_field_name='registration_status' then p_value#>>'{}' else e.registration_status end,
    registration_url=case when p_field_name='registration_url' then p_value#>>'{}' else e.registration_url end,
    registration_opens_at=case when p_field_name='registration_opens_at' then (p_value#>>'{}')::timestamptz else e.registration_opens_at end,
    registration_closes_at=case when p_field_name='registration_closes_at' then (p_value#>>'{}')::timestamptz else e.registration_closes_at end,
    registration_capacity=case when p_field_name='registration_capacity' then (p_value#>>'{}')::integer else e.registration_capacity end,
    registration_available=case when p_field_name='registration_available' then (p_value#>>'{}')::integer else e.registration_available end,
    entry_fee_amount=case when p_field_name='entry_fee_amount' then (p_value#>>'{}')::numeric else e.entry_fee_amount end,
    entry_fee_currency=case when p_field_name='entry_fee_currency' then p_value#>>'{}' else e.entry_fee_currency end,
    entry_fee_unit=case when p_field_name='entry_fee_unit' then p_value#>>'{}' else e.entry_fee_unit end,
    fee_breakdown=case when p_field_name='fee_breakdown' then case when jsonb_typeof(p_value)='null' then '[]'::jsonb else p_value end else e.fee_breakdown end,
    additional_fees_note=case when p_field_name='additional_fees_note' then p_value#>>'{}' else e.additional_fees_note end,
    official_url=case when p_field_name='official_url' then p_value#>>'{}' else e.official_url end,
    results_url=case when p_field_name='results_url' then p_value#>>'{}' else e.results_url end,
    club_host=case when p_field_name='club_host' then p_value#>>'{}' else e.club_host end,
    td_names=case when p_field_name='td_names' then case when jsonb_typeof(p_value)='null' then '{}'::text[] else coalesce(array(select jsonb_array_elements_text(p_value)),'{}'::text[]) end else e.td_names end,
    last_changed_at=now(),updated_at=now()
  where e.id=p_event_id;
  if not found then raise exception 'Local Roots event not found: %',p_event_id using errcode='P0002'; end if;
end
$$;
revoke all on function public.lr_set_event_field_value(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lr_set_event_field_value(uuid,text,jsonb) to service_role;

create or replace function public.lr_apply_event_patch(p_event_id uuid,p_patch jsonb)
returns public.lr_events language plpgsql security definer set search_path=pg_catalog,public as $$
declare f text; v jsonb; v_patch jsonb; v_event public.lr_events%rowtype;
begin
  if jsonb_typeof(p_patch)<>'object' then raise exception 'Local Roots event patch must be a named JSON object' using errcode='22023'; end if;
  for f,v in select key,value from jsonb_each(p_patch) loop
    if not public.lr_is_overridable_event_field(f) then raise exception 'Unsupported Local Roots event patch field: %',f using errcode='22023'; end if;
  end loop;
  select coalesce(jsonb_object_agg(p.key,p.value),'{}'::jsonb) into v_patch
  from jsonb_each(p_patch) p
  where not exists(select 1 from public.lr_manual_overrides mo where mo.event_id=p_event_id and mo.field_name=p.key and mo.active);
  if v_patch='{}'::jsonb then
    select * into v_event from public.lr_events e where e.id=p_event_id;
    if not found then raise exception 'Local Roots event not found: %',p_event_id using errcode='P0002'; end if;
    return v_event;
  end if;
  if v_patch ? 'format_details' and v_patch->'format_details'='null'::jsonb then v_patch:=jsonb_set(v_patch,'{format_details}','{}'::jsonb); end if;
  if v_patch ? 'fee_breakdown' and v_patch->'fee_breakdown'='null'::jsonb then v_patch:=jsonb_set(v_patch,'{fee_breakdown}','[]'::jsonb); end if;
  if v_patch ? 'td_names' and v_patch->'td_names'='null'::jsonb then v_patch:=jsonb_set(v_patch,'{td_names}','[]'::jsonb); end if;
  with original as materialized (
    select e.* from public.lr_events e where e.id=p_event_id for update
  ), patched as (
    select p.* from original o cross join lateral jsonb_populate_record(o,v_patch) as p
  )
  update public.lr_events e set
    (name,start_date,end_date,timezone,county,city,venue_name,venue_address,course_name,course_id,course_url,start_time_local,end_time_local,
      rounds_text,event_type,format,format_details,sanctioned,tier,status,registration_status,registration_url,registration_opens_at,registration_closes_at,
      registration_capacity,registration_available,entry_fee_amount,entry_fee_currency,entry_fee_unit,fee_breakdown,additional_fees_note,official_url,
      results_url,club_host,td_names,last_changed_at,updated_at)
    =(p.name,p.start_date,p.end_date,p.timezone,p.county,p.city,p.venue_name,p.venue_address,p.course_name,p.course_id,p.course_url,p.start_time_local,p.end_time_local,
      p.rounds_text,p.event_type,p.format,p.format_details,p.sanctioned,p.tier,p.status,p.registration_status,p.registration_url,p.registration_opens_at,p.registration_closes_at,
      p.registration_capacity,p.registration_available,p.entry_fee_amount,p.entry_fee_currency,p.entry_fee_unit,p.fee_breakdown,p.additional_fees_note,p.official_url,
      p.results_url,p.club_host,p.td_names,now(),now())
  from patched p where e.id=p.id returning e.* into v_event;
  if not found then raise exception 'Local Roots event not found: %',p_event_id using errcode='P0002'; end if;
  return v_event;
end
$$;
revoke all on function public.lr_apply_event_patch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lr_apply_event_patch(uuid,jsonb) to service_role;

create or replace function public.lr_candidate_validation_errors(p_payload jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
  declare errs jsonb:='[]'::jsonb; s date; e date; v text; fee numeric; item jsonb; total numeric:=0; n integer;
begin
  if jsonb_typeof(p_payload)<>'object' then return jsonb_build_array('payload_not_object'); end if;
  v:=btrim(coalesce(p_payload->>'name',''));
  if v='' then errs:=errs||'"missing_name"'::jsonb; elsif v~'^\s*\d+\s*$' then errs:=errs||'"numeric_only_name"'::jsonb; end if;
  begin s:=(p_payload->>'start_date')::date; exception when others then errs:=errs||'"invalid_start_date"'::jsonb; end;
  begin e:=coalesce(nullif(p_payload->>'end_date',''),p_payload->>'start_date')::date; exception when others then errs:=errs||'"invalid_end_date"'::jsonb; end;
  if s is not null and e is not null and e<s then errs:=errs||'"end_before_start"'::jsonb; end if;
  if nullif(p_payload->>'timezone','') is not null and not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_payload->>'timezone') then errs:=errs||'"invalid_timezone"'::jsonb; end if;
  if p_payload ? 'event_type' and p_payload->>'event_type' not in ('tournament','flex_start','league','doubles','team','putting','ace_race','circuit_challenge','tag_match','clinic','charity','community','other') then errs:=errs||'"invalid_event_type"'::jsonb; end if;
  if p_payload ? 'course_name' and nullif(btrim(p_payload->>'course_name'),'') is not null and not public.lr_is_plausible_course_name(p_payload->>'course_name') then errs:=errs||'"implausible_course_name"'::jsonb; end if;
  foreach v in array array['registration_url','results_url','official_url','course_url','source_url'] loop
    if p_payload ? v and nullif(btrim(p_payload->>v),'') is not null and not public.lr_is_http_url(p_payload->>v) then errs:=errs||to_jsonb('invalid_'||v); end if;
  end loop;
  foreach v in array array['start_time_local','end_time_local'] loop
    if p_payload ? v and nullif(p_payload->>v,'') is not null then
      begin perform (p_payload->>v)::time; exception when others then errs:=errs||to_jsonb('invalid_'||v); end;
    end if;
  end loop;
  if nullif(p_payload->>'end_time_local','') is not null and nullif(p_payload->>'start_time_local','') is null then errs:=errs||'"end_time_without_start_time"'::jsonb; end if;
  if (nullif(p_payload->>'start_time_local','') is not null or nullif(p_payload->>'end_time_local','') is not null)
    and nullif(p_payload->>'timezone','') is null then errs:=errs||'"timezone_required_for_timed_event"'::jsonb; end if;
  if p_payload ? 'entry_fee_amount' and p_payload->'entry_fee_amount'<>'null'::jsonb then
    begin fee:=(p_payload->>'entry_fee_amount')::numeric; if fee<0 then errs:=errs||'"negative_entry_fee"'::jsonb; end if;
    exception when others then errs:=errs||'"invalid_entry_fee_amount"'::jsonb; end;
  end if;
  if p_payload ? 'entry_fee_currency' and coalesce(p_payload->>'entry_fee_currency','') !~ '^[A-Z]{3}$' then errs:=errs||'"invalid_entry_fee_currency"'::jsonb; end if;
  if p_payload ? 'fee_breakdown' and jsonb_typeof(p_payload->'fee_breakdown')<>'array' then errs:=errs||'"invalid_fee_breakdown"'::jsonb;
  elsif jsonb_typeof(p_payload->'fee_breakdown')='array' then
    for item in select value from jsonb_array_elements(p_payload->'fee_breakdown') loop
      if jsonb_typeof(item)<>'object' or nullif(btrim(item->>'label'),'') is null or item->>'amount' is null or coalesce(item->>'currency','') !~ '^[A-Z]{3}$' then errs:=errs||'"invalid_fee_breakdown_item"'::jsonb; exit; end if;
      if fee is not null and item->>'currency'<>p_payload->>'entry_fee_currency' then errs:=errs||'"fee_breakdown_currency_mismatch"'::jsonb; exit; end if;
      begin
        if (item->>'amount')::numeric<0 then errs:=errs||'"negative_fee_breakdown_amount"'::jsonb; exit; end if;
        total:=total+(item->>'amount')::numeric;
      exception when others then errs:=errs||'"invalid_fee_breakdown_amount"'::jsonb; exit; end;
    end loop;
    if fee is not null and total<>fee then errs:=errs||'"fee_breakdown_total_mismatch"'::jsonb; end if;
  end if;
  if p_payload ? 'format_details' and jsonb_typeof(p_payload->'format_details')<>'object' then errs:=errs||'"invalid_format_details"'::jsonb; end if;
  if fee is not null and (nullif(p_payload->>'entry_fee_currency','') is null or nullif(p_payload->>'entry_fee_unit','') is null) then errs:=errs||'"entry_fee_unit_and_currency_required"'::jsonb; end if;
  begin
    if nullif(p_payload->>'end_time_local','') is not null and nullif(p_payload->>'start_time_local','') is not null
      and coalesce(nullif(p_payload->>'end_date','')::date,nullif(p_payload->>'start_date','')::date)=nullif(p_payload->>'start_date','')::date
      and (p_payload->>'end_time_local')::time <= (p_payload->>'start_time_local')::time then errs:=errs||'"end_time_must_follow_start_time_for_same_day_event"'::jsonb; end if;
  exception when others then null; end;
  if p_payload ? 'registration_capacity' and nullif(p_payload->>'registration_capacity','') is not null then
    begin n:=(p_payload->>'registration_capacity')::integer; if n<0 then errs:=errs||'"invalid_registration_capacity"'::jsonb; end if;
    exception when others then errs:=errs||'"invalid_registration_capacity"'::jsonb; end;
  end if;
  if p_payload ? 'registration_available' and nullif(p_payload->>'registration_available','') is not null then
    begin n:=(p_payload->>'registration_available')::integer; if n<0 then errs:=errs||'"invalid_registration_available"'::jsonb; end if;
    exception when others then errs:=errs||'"invalid_registration_available"'::jsonb; end;
  end if;
  if p_payload ? 'registration_capacity' and p_payload ? 'registration_available'
    and nullif(p_payload->>'registration_capacity','') is not null and nullif(p_payload->>'registration_available','') is not null then
    begin if (p_payload->>'registration_available')::integer>(p_payload->>'registration_capacity')::integer then errs:=errs||'"registration_available_exceeds_capacity"'::jsonb; end if;
    exception when others then null; end;
  end if;
  if p_payload ? 'registration_opens_at' and p_payload ? 'registration_closes_at'
    and nullif(p_payload->>'registration_opens_at','') is not null and nullif(p_payload->>'registration_closes_at','') is not null then
    begin if (p_payload->>'registration_closes_at')::timestamptz <= (p_payload->>'registration_opens_at')::timestamptz then errs:=errs||'"invalid_registration_window"'::jsonb; end if;
    exception when others then errs:=errs||'"invalid_registration_window"'::jsonb; end;
  end if;
  return errs;
end
$$;

create or replace function public.lr_apply_authoritative_candidate(p_candidate_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  c public.lr_source_candidates%rowtype;
  e public.lr_events%rowtype;
  patch jsonb:='{}'::jsonb;
  f text;
  oldv jsonb;
  newv jsonb;
  ev jsonb;
  evidence_source_id uuid;
  fields text[]:=array[
    'name','start_date','end_date','timezone','county','city','venue_name','venue_address','course_name','course_id','course_url','start_time_local','end_time_local',
    'rounds_text','event_type','format','format_details','sanctioned','tier','status','registration_status','registration_url',
    'registration_opens_at','registration_closes_at','registration_capacity','registration_available','entry_fee_amount',
    'entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','official_url','results_url','club_host','td_names'
  ];
  refresh_field boolean;
begin
  c:=public.lr_process_candidate(p_candidate_id);
  if c.validation_status<>'valid' or c.scope_status='out_of_scope' or c.promotion_status='review_required' then return c.match_event_id; end if;
  if c.match_event_id is null then return null; end if;
  select * into e from public.lr_events where id=c.match_event_id for update;

  foreach f in array fields loop
    if not (c.normalized_payload ? f) then continue; end if;
    newv:=c.normalized_payload->f;
    oldv:=public.lr_event_field_value(e.id,f);
    ev:=c.normalized_payload->'field_evidence'->f;
    evidence_source_id:=c.source_id;
    if nullif(ev->>'source_key','') is not null then
      select id into evidence_source_id from public.lr_sources where key=ev->>'source_key' and enabled;
      if evidence_source_id is null or not public.lr_source_authoritative_for(evidence_source_id,f) then
        raise exception 'Field evidence source is not registered and authorized for %',f using errcode='22023';
      end if;
    end if;
    if coalesce(ev->>'status','verified') in ('not_applicable','not_announced','missing_despite_available_evidence','unverified','stale','conflicting') then
      if public.lr_source_authoritative_for(evidence_source_id,f) then
        insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_candidate_id,source_url,status,observed_value,verified_at,expires_at,notes)
        values(e.id,f,evidence_source_id,c.id,coalesce(nullif(ev->>'source_url',''),c.source_url),ev->>'status',newv,now(),null,nullif(ev->>'notes',''))
        on conflict (event_id,field_name,source_id) where source_id is not null do update set
          source_candidate_id=excluded.source_candidate_id,source_url=excluded.source_url,status=excluded.status,
          observed_value=excluded.observed_value,verified_at=excluded.verified_at,expires_at=null,notes=excluded.notes,updated_at=now();
      end if;
      continue;
    end if;
    if jsonb_typeof(newv)='null' then
      -- A missing/null source field is not an instruction to erase a known fact.
      if oldv is distinct from 'null'::jsonb and oldv is not null then
        if not exists(select 1 from public.lr_review_queue q where q.issue_type='source_field_missing' and q.event_id=e.id and q.status in ('open','in_review') and q.details->>'field'=f and q.details->>'source_id'=c.source_id::text) then
          insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details)
          values('source_field_missing','medium',e.id,c.id,'An authorized source omitted a previously known event field',jsonb_build_object('field',f,'source_id',c.source_id,'previous_value',oldv,'candidate_value',newv));
        end if;
      end if;
      continue;
    end if;

    -- A candidate may carry independently sourced facts (such as an
    -- owner-verified organizer listing attached to the HBNF schedule sync).
    -- Promotion authority belongs to the validated field evidence source,
    -- not automatically to the transport/source that delivered the payload.
    if public.lr_source_authoritative_for(evidence_source_id,f) then
      if exists(select 1 from public.lr_manual_overrides mo where mo.event_id=e.id and mo.field_name=f and mo.active) then
        if newv is distinct from oldv then
          if not exists(select 1 from public.lr_review_queue q where q.issue_type='source_field_conflict' and q.event_id=e.id and q.status in ('open','in_review') and q.details->>'field'=f and q.details->>'source_id'=evidence_source_id::text) then
            insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details)
            values('source_field_conflict','high',e.id,c.id,'An authoritative source conflicts with an active manual event override',jsonb_build_object('field',f,'current',oldv,'candidate',newv,'source_id',evidence_source_id,'active_override',true));
          end if;
          insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_candidate_id,source_url,status,observed_value,verified_at,notes)
          values(e.id,f,evidence_source_id,c.id,coalesce(nullif(ev->>'source_url',''),c.source_url),'conflicting',newv,now(),'Authoritative source differs from an active manual override')
          on conflict (event_id,field_name,source_id) where source_id is not null do update set status='conflicting',source_candidate_id=excluded.source_candidate_id,source_url=excluded.source_url,observed_value=excluded.observed_value,verified_at=excluded.verified_at,notes=excluded.notes,updated_at=now();
          continue;
        end if;
      end if;
      if newv is distinct from oldv then
        patch:=patch||jsonb_build_object(f,newv);
        insert into public.lr_event_change_log(event_id,source_id,source_candidate_id,field_name,old_value,new_value,change_type)
        values(e.id,evidence_source_id,c.id,f,oldv,newv,case when f in ('start_date','end_date') then 'organizer_confirmed' else 'source_update' end);
      end if;
      refresh_field:=coalesce((ev->>'refresh_on_sync')::boolean,true);
      insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_candidate_id,source_url,status,observed_value,verified_at,expires_at,notes)
      values(e.id,f,evidence_source_id,c.id,coalesce(nullif(ev->>'source_url',''),c.source_url),'verified',newv,now(),now()+interval '14 days',nullif(ev->>'notes',''))
      on conflict (event_id,field_name,source_id) where source_id is not null do update set
        source_candidate_id=excluded.source_candidate_id,
        source_url=excluded.source_url,
        status='verified',
        verified_at=case when public.lr_event_field_evidence.observed_value is distinct from excluded.observed_value or refresh_field then excluded.verified_at else public.lr_event_field_evidence.verified_at end,
        expires_at=case when public.lr_event_field_evidence.observed_value is distinct from excluded.observed_value or refresh_field then excluded.expires_at else public.lr_event_field_evidence.expires_at end,
        observed_value=excluded.observed_value,
        notes=excluded.notes,
        updated_at=now();
    elsif f in ('start_date','end_date') and newv is distinct from oldv then
      update public.lr_source_candidates set promotion_status='review_required',updated_at=now() where id=c.id;
      insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details)
      values('conflicting_date','high',e.id,c.id,'Lower-authority source conflicts on event date',jsonb_build_object('field',f,'current',oldv,'candidate',newv));
      return e.id;
    elsif newv is distinct from oldv then
      if not exists(select 1 from public.lr_review_queue q where q.issue_type='source_field_conflict' and q.event_id=e.id and q.status in ('open','in_review') and q.details->>'field'=f and q.details->>'source_id'=evidence_source_id::text) then
        insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details)
        values('source_field_conflict','medium',e.id,c.id,'A non-authoritative source disagrees on an event field',jsonb_build_object('field',f,'current',oldv,'candidate',newv,'source_id',evidence_source_id));
      end if;
      insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_candidate_id,source_url,status,observed_value,verified_at,notes)
      values(e.id,f,evidence_source_id,c.id,coalesce(nullif(ev->>'source_url',''),c.source_url),'conflicting',newv,now(),'Candidate value differs from the current field-authoritative value')
      on conflict (event_id,field_name,source_id) where source_id is not null do update set status='conflicting',source_candidate_id=excluded.source_candidate_id,source_url=excluded.source_url,observed_value=excluded.observed_value,verified_at=excluded.verified_at,notes=excluded.notes,updated_at=now();
    end if;
  end loop;

  if patch<>'{}'::jsonb then perform public.lr_apply_event_patch(e.id,patch); end if;
  update public.lr_source_candidates set promotion_status='promoted',updated_at=now() where id=c.id;
  return e.id;
end
$$;
revoke all on function public.lr_apply_authoritative_candidate(uuid) from public,anon,authenticated;
grant execute on function public.lr_apply_authoritative_candidate(uuid) to service_role;

-- Active overrides retain precedence and use the same named-field setter.
create or replace function public.lr_set_manual_override(p_event_id uuid,p_field_name text,p_override_value jsonb,p_reason text,p_created_by uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_original jsonb; v_override_id uuid; v_status text;
begin
  if not public.lr_is_overridable_event_field(p_field_name) then raise exception 'Unsupported Local Roots event field: %',p_field_name using errcode='22023'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'Manual override reason is required' using errcode='23514'; end if;
  v_original:=public.lr_event_field_value(p_event_id,p_field_name);
  insert into public.lr_manual_overrides(event_id,field_name,original_value,override_value,reason,active,created_by)
  values(p_event_id,p_field_name,v_original,p_override_value,p_reason,true,p_created_by)
  on conflict (event_id,field_name) where active do update set override_value=excluded.override_value,reason=excluded.reason,created_by=coalesce(excluded.created_by,public.lr_manual_overrides.created_by)
  returning id into v_override_id;
  perform public.lr_set_event_field_value(p_event_id,p_field_name,p_override_value);
  -- Clearing a value is not evidence that the organizer has not announced it.
  v_status:=case when jsonb_typeof(p_override_value)='null' then 'unverified' else 'verified' end;
  insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_url,status,observed_value,verified_at,notes)
  values(p_event_id,p_field_name,null,null,v_status,p_override_value,now(),p_reason)
  on conflict (event_id,field_name) where source_id is null do update set status=excluded.status,observed_value=excluded.observed_value,verified_at=excluded.verified_at,notes=excluded.notes,updated_at=now();
  return v_override_id;
end
$$;
revoke all on function public.lr_set_manual_override(uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.lr_set_manual_override(uuid,text,jsonb,text,uuid) to service_role;

-- Private audit view: absence of an evidence row is reported as unverified, never confirmed.
create or replace view public.lr_event_field_status as
select e.id as event_id,e.slug,e.name,e.start_date,e.event_type,
       f.field_name,
       coalesce(
         case when bool_or(ev.status='conflicting' and ev.observed_value is distinct from public.lr_event_field_value(e.id,f.field_name))
                    or count(distinct ev.observed_value) filter(where ev.status='verified')>1
                    or (count(ev.id) filter(where ev.status='verified')>0 and bool_or(ev.status in ('not_announced','not_applicable','missing_despite_available_evidence'))) then 'conflicting'
              when bool_or(ev.status='missing_despite_available_evidence') then 'missing_despite_available_evidence'
              when count(ev.id) filter(where ev.status='verified')>0 and public.lr_event_field_value(e.id,f.field_name)='null'::jsonb then 'missing_despite_available_evidence'
              when bool_or(ev.status='not_announced') then 'not_announced'
              when bool_or(ev.status='not_applicable') then 'not_applicable'
              when bool_or(ev.status='stale') then 'stale'
              when count(ev.id) filter(where ev.status='verified' and (ev.expires_at is null or ev.expires_at>=now()))>0 then 'verified'
              when bool_or(ev.status='verified') then 'stale'
              else null end,
         'unverified') as verification_status,
       count(distinct ev.source_id) filter(where ev.status='verified') as verifying_sources,
       max(ev.verified_at) as last_verified_at,
       min(ev.expires_at) filter(where ev.status='verified') as next_expiry,
       coalesce(jsonb_agg(jsonb_build_object('source_url',ev.source_url,'status',ev.status,'notes',ev.notes,'verified_at',ev.verified_at,'expires_at',ev.expires_at) order by ev.updated_at desc) filter(where ev.id is not null),'[]'::jsonb) as evidence_sources
from public.lr_events e
cross join lateral unnest(array[
  'start_date','end_date','start_time_local','end_time_local','timezone','venue_name','venue_address','city','county',
  'course_name','course_id','course_url','event_type','format','format_details','rounds_text','entry_fee_amount',
  'entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','registration_status','registration_url',
  'registration_opens_at','registration_closes_at','registration_capacity','registration_available','official_url','results_url',
  'club_host','td_names','sanctioned','tier'
]::text[]) f(field_name)
left join public.lr_event_field_evidence ev on ev.event_id=e.id and ev.field_name=f.field_name
group by e.id,e.slug,e.name,e.start_date,e.event_type,f.field_name;
revoke all on public.lr_event_field_status from public,anon,authenticated;
grant select on public.lr_event_field_status to service_role;

-- The existing reviewable submission path may carry structured details. Submissions
-- remain unpublished until an authorized administrator approves them.
update public.lr_sources
set authoritative_fields=array(
  select distinct f from unnest(authoritative_fields || array[
    'name','start_date','end_date','timezone','county','city','venue_name','venue_address','course_name','course_id','course_url','start_time_local','end_time_local',
    'rounds_text','event_type','format','format_details','sanctioned','tier','status','registration_status','registration_url',
    'registration_opens_at','registration_closes_at','registration_capacity','registration_available','entry_fee_amount',
    'entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','official_url','results_url','club_host','td_names'
  ]::text[]) as f where f<>'status' order by f
),updated_at=now()
where key='local_roots_submissions';

-- HBNF's integration emits only the owner-confirmed facts it actually knows.
-- Null/absent fields are not authority to clear prior verified details.
update public.lr_sources
set authoritative_fields=array(
  select distinct f from unnest(authoritative_fields || array[
    'venue_address','course_id','course_url','start_time_local','end_time_local','format_details','entry_fee_amount',
    'entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','registration_opens_at','registration_closes_at',
    'registration_capacity','registration_available','official_url'
  ]::text[]) as f order by f
),updated_at=now()
where key='hbnf_internal_schedule';

drop function if exists public.lr_public_event_detail(text);
drop function if exists public.lr_public_events();

create function public.lr_public_events()
returns table(
  id uuid,slug text,name text,start_date date,end_date date,timezone text,county text,city text,venue_name text,
  venue_address text,course_name text,course_id text,course_url text,rounds_text text,event_type text,format text,
  format_details jsonb,start_time_local time without time zone,end_time_local time without time zone,
  entry_fee_amount numeric,entry_fee_currency text,entry_fee_unit text,fee_breakdown jsonb,additional_fees_note text,
  sanctioned boolean,tier text,status text,registration_status text,registration_url text,
  registration_opens_at timestamptz,registration_closes_at timestamptz,registration_capacity integer,registration_available integer,
  results_url text,official_url text,source_url text,club_host text,td_names text[],last_verified_at timestamptz,last_changed_at timestamptz,top_results jsonb
)
language sql stable security definer set search_path=pg_catalog,public as $$
  select e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,e.venue_name,e.venue_address,
    e.course_name,e.course_id,e.course_url,e.rounds_text,e.event_type,e.format,e.format_details,
    e.start_time_local,e.end_time_local,e.entry_fee_amount,e.entry_fee_currency,e.entry_fee_unit,e.fee_breakdown,e.additional_fees_note,
    e.sanctioned,e.tier,
    case when e.end_date < (current_timestamp at time zone 'America/Los_Angeles')::date
      and e.status in ('announced','upcoming','registration_open','full','waitlist') then 'completed'::text else e.status end,
    e.registration_status,e.registration_url,e.registration_opens_at,e.registration_closes_at,e.registration_capacity,e.registration_available,
    e.results_url,e.official_url,(
      select es.source_url from public.lr_event_sources es join public.lr_sources s on s.id=es.source_id
      where es.event_id=e.id and es.source_role in ('organizer_confirmed','official','manual_verification')
        and cardinality(s.authoritative_fields)>0
      order by cardinality(s.authoritative_fields) desc,
        case es.source_role when 'organizer_confirmed' then 0 when 'official' then 1 else 2 end,
        coalesce(es.confidence,0) desc,es.last_seen_at desc,es.source_url limit 1
    ),e.club_host,e.td_names,e.last_verified_at,e.last_changed_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'division_code',r.division_code,'place',r.place,'player_name',r.player_name,'pdga_number',r.pdga_number,
      'total_score',r.total_score,'to_par',r.to_par,'points',r.points,'rating',r.rating,'source_url',r.source_url,'last_verified_at',r.last_verified_at
    ) order by r.place,r.player_name) from public.lr_results r where r.event_id=e.id and r.is_public_selected_division and r.place<=3),'[]'::jsonb)
  from public.lr_events e where e.published order by e.start_date,e.name
$$;

create function public.lr_public_event_detail(p_slug text)
returns table(
  id uuid,slug text,name text,start_date date,end_date date,timezone text,county text,city text,venue_name text,
  venue_address text,course_name text,course_id text,course_url text,rounds_text text,event_type text,format text,
  format_details jsonb,start_time_local time without time zone,end_time_local time without time zone,
  entry_fee_amount numeric,entry_fee_currency text,entry_fee_unit text,fee_breakdown jsonb,additional_fees_note text,
  sanctioned boolean,tier text,status text,registration_status text,registration_url text,
  registration_opens_at timestamptz,registration_closes_at timestamptz,registration_capacity integer,registration_available integer,
  results_url text,official_url text,source_url text,club_host text,td_names text[],last_verified_at timestamptz,last_changed_at timestamptz,
  top_results jsonb,all_results jsonb
)
language sql stable security definer set search_path=pg_catalog,public as $$
  select p.*,
    coalesce((select jsonb_agg(jsonb_build_object(
      'division_code',r.division_code,'place',r.place,'player_name',r.player_name,'pdga_number',r.pdga_number,
      'total_score',r.total_score,'to_par',r.to_par,'points',r.points,'rating',r.rating,'source_url',r.source_url,'last_verified_at',r.last_verified_at
    ) order by r.division_code,r.place,r.player_name) from public.lr_results r where r.event_id=p.id),'[]'::jsonb)
  from public.lr_public_events() p where p.slug=p_slug limit 1
$$;
revoke all on function public.lr_public_events() from public;
revoke all on function public.lr_public_event_detail(text) from public;
grant execute on function public.lr_public_events() to anon,authenticated,service_role;
grant execute on function public.lr_public_event_detail(text) to anon,authenticated,service_role;

-- Safe parsers let organizer submissions reach the review queue with field-level
-- validation errors instead of failing before an auditable submission is stored.
create or replace function public.lr_safe_time(p_value text)
returns time language plpgsql immutable set search_path='' as $$
begin
  if nullif(btrim(p_value),'') is null then return null; end if;
  return p_value::time;
exception when others then return null;
end
$$;

create or replace function public.lr_safe_numeric(p_value text)
returns numeric language plpgsql immutable set search_path='' as $$
begin
  if nullif(btrim(p_value),'') is null then return null; end if;
  return p_value::numeric;
exception when others then return null;
end
$$;

create or replace function public.lr_safe_integer(p_value text)
returns integer language plpgsql immutable set search_path='' as $$
begin
  if nullif(btrim(p_value),'') is null then return null; end if;
  return p_value::integer;
exception when others then return null;
end
$$;

create or replace function public.lr_safe_timestamptz(p_value text)
returns timestamptz language plpgsql immutable set search_path='' as $$
begin
  if nullif(btrim(p_value),'') is null then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end
$$;

revoke all on function public.lr_safe_time(text),public.lr_safe_numeric(text),public.lr_safe_integer(text),public.lr_safe_timestamptz(text) from public,anon,authenticated;
grant execute on function public.lr_safe_time(text),public.lr_safe_numeric(text),public.lr_safe_integer(text),public.lr_safe_timestamptz(text) to service_role;

-- Admins can explicitly classify an unknown field without changing the canonical
-- event value. A null override alone never means "not announced".
create or replace function public.lr_set_manual_event_field_status(
  p_event_id uuid,p_field_name text,p_status text,p_source_url text,p_observed_value jsonb,p_reason text
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.lr_is_overridable_event_field(p_field_name) then raise exception 'Unsupported Local Roots event field: %',p_field_name using errcode='22023'; end if;
  if p_status is null or p_status not in ('not_applicable','not_announced','missing_despite_available_evidence','unverified','stale','conflicting') then raise exception 'Invalid manual field status' using errcode='22023'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A field-status reason is required' using errcode='23514'; end if;
  if p_source_url is not null and not public.lr_is_http_url(p_source_url) then raise exception 'Evidence URL must be HTTP(S)' using errcode='22023'; end if;
  if p_status in ('not_applicable','not_announced','missing_despite_available_evidence') and p_source_url is null then raise exception 'This classification requires a source URL' using errcode='23514'; end if;
  if not exists(select 1 from public.lr_events where id=p_event_id) then raise exception 'Local Roots event not found' using errcode='P0002'; end if;
  insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_url,status,observed_value,verified_at,expires_at,notes)
  values(p_event_id,p_field_name,null,p_source_url,p_status,p_observed_value,now(),case when p_status='stale' then now() else null end,p_reason)
  on conflict (event_id,field_name) where source_id is null do update set
    source_url=excluded.source_url,status=excluded.status,observed_value=excluded.observed_value,
    verified_at=excluded.verified_at,expires_at=excluded.expires_at,notes=excluded.notes,updated_at=now();
end
$$;
revoke all on function public.lr_set_manual_event_field_status(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.lr_set_manual_event_field_status(uuid,text,text,text,jsonb,text) to service_role;

-- Bounded recurring freshness/missing-fact monitor. It raises one deduplicated
-- review item per upcoming event/field and closes only issues whose recorded
-- status has actually become verified, not applicable, or not announced.
create or replace function public.lr_enqueue_event_field_reviews(p_horizon_days integer default 60)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_today date:=(now() at time zone 'America/Los_Angeles')::date; v_horizon integer:=least(greatest(coalesce(p_horizon_days,60),1),90); v_inserted integer:=0; r record;
begin
  update public.lr_review_queue q set status='resolved',resolved_at=now(),resolution='Field now has a current evidence classification'
  where q.issue_type='event_field_verification' and q.status in ('open','in_review')
    and not exists(
      select 1 from public.lr_event_field_status s where s.event_id=q.event_id and s.field_name=q.details->>'field'
        and s.start_date between v_today and v_today+v_horizon
        and s.verification_status in ('unverified','stale','missing_despite_available_evidence','conflicting')
    );

  for r in
    select s.event_id,s.slug,s.name,s.start_date,s.field_name,s.verification_status,s.last_verified_at,s.next_expiry
    from public.lr_event_field_status s join public.lr_events e on e.id=s.event_id
    where e.published and e.status not in ('canceled','completed')
      and s.start_date between v_today and v_today+v_horizon
      and (
        s.field_name = any(case
          when e.event_type in ('tournament','flex_start','league','doubles','team','tag_match') then
            array['start_date','timezone','course_name','event_type','format']::text[]
          else array['start_date','event_type']::text[] end)
        or s.verification_status in ('stale','missing_despite_available_evidence','conflicting')
      )
      -- Course, venue, or a street address can each provide a useful precise
      -- destination. Do not emit multiple empty location alerts or treat a
      -- legitimate date-only confirmed schedule as a time announcement.
      and (s.field_name <> 'course_name' or (e.course_name is null and e.venue_name is null and e.venue_address is null))
      and (s.field_name <> 'start_time_local' or not exists(
        select 1 from public.lr_event_sources es
        where es.event_id=e.id
          and es.source_payload->>'origin'='organizer_confirmed_schedule'
          and es.source_payload->>'schedule_rule' is not null
      ))
      and s.verification_status in ('unverified','stale','missing_despite_available_evidence','conflicting')
    order by s.start_date,case s.verification_status when 'conflicting' then 0 when 'missing_despite_available_evidence' then 1 when 'stale' then 2 else 3 end,s.field_name
  loop
    if not exists(select 1 from public.lr_review_queue q where q.issue_type='event_field_verification' and q.event_id=r.event_id and q.status in ('open','in_review') and q.details->>'field'=r.field_name) then
      insert into public.lr_review_queue(issue_type,severity,event_id,summary,details)
      values('event_field_verification',case when r.start_date<=v_today+7 or r.verification_status in ('conflicting','missing_despite_available_evidence') then 'high' when r.start_date<=v_today+30 then 'medium' else 'low' end,
        r.event_id,'Upcoming event detail needs evidence review',jsonb_build_object('field',r.field_name,'verification_status',r.verification_status,'start_date',r.start_date,'slug',r.slug,'last_verified_at',r.last_verified_at,'expires_at',r.next_expiry));
      v_inserted:=v_inserted+1;
    else
      update public.lr_review_queue q set severity=case when r.start_date<=v_today+7 or r.verification_status in ('conflicting','missing_despite_available_evidence') then 'high' when r.start_date<=v_today+30 then 'medium' else 'low' end,
        summary='Upcoming event detail needs evidence review',details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object('verification_status',r.verification_status,'start_date',r.start_date,'last_verified_at',r.last_verified_at,'expires_at',r.next_expiry)
      where q.issue_type='event_field_verification' and q.event_id=r.event_id and q.status in ('open','in_review') and q.details->>'field'=r.field_name;
    end if;
  end loop;
  return v_inserted;
end
$$;
revoke all on function public.lr_enqueue_event_field_reviews(integer) from public,anon,authenticated;
grant execute on function public.lr_enqueue_event_field_reviews(integer) to service_role;

-- Keep organizer submissions fully structured through intake; they remain
-- unpublished and non-authoritative until the existing admin decision path.
create or replace function public.lr_ingest_event_submission(p_submission jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  v_source_id uuid; v_run_id uuid; v_submission_id uuid:=gen_random_uuid(); v_candidate_id uuid;
  v_candidate public.lr_source_candidates%rowtype; v_payload jsonb; v_errors jsonb; v_scope text;
  v_start date; v_end date; v_source_url text; v_name text;
begin
  if jsonb_typeof(p_submission)<>'object' then raise exception 'submission must be a JSON object' using errcode='22023'; end if;
  v_name:=nullif(btrim(p_submission->>'name'),'');
  if v_name is null then raise exception 'event name is required' using errcode='22023'; end if;
  v_start:=public.lr_safe_date(p_submission->>'start_date');
  v_end:=coalesce(public.lr_safe_date(p_submission->>'end_date'),v_start);

  v_payload:=jsonb_strip_nulls(jsonb_build_object(
    'name',v_name,'start_date',case when v_start is null then p_submission->>'start_date' else v_start::text end,
    'end_date',case when v_end is null then p_submission->>'end_date' else v_end::text end,
    'timezone',coalesce(nullif(btrim(p_submission->>'timezone'),''),'America/Los_Angeles'),
    'county',public.lr_canonical_scope_county(p_submission->>'county'),'city',nullif(btrim(p_submission->>'city'),''),
    'venue_name',nullif(btrim(p_submission->>'venue_name'),''),'venue_address',nullif(btrim(p_submission->>'venue_address'),''),
    'course_name',nullif(btrim(p_submission->>'course_name'),''),'course_id',nullif(btrim(p_submission->>'course_id'),''),'course_url',nullif(btrim(p_submission->>'course_url'),''),
    'rounds_text',nullif(btrim(p_submission->>'rounds_text'),''),'event_type',coalesce(nullif(btrim(p_submission->>'event_type'),''),'other'),
    'format',nullif(btrim(p_submission->>'format'),''),'format_details',case when p_submission ? 'format_details' then p_submission->'format_details' else '{}'::jsonb end,
    'start_time_local',nullif(btrim(p_submission->>'start_time_local'),''),'end_time_local',nullif(btrim(p_submission->>'end_time_local'),''),
    'sanctioned',case when p_submission?'sanctioned' and p_submission->'sanctioned'<>'null'::jsonb then p_submission->'sanctioned' else null end,
    'tier',nullif(btrim(p_submission->>'tier'),''),'status','upcoming','registration_status',nullif(btrim(p_submission->>'registration_status'),''),
    'registration_url',nullif(btrim(p_submission->>'registration_url'),''),'registration_opens_at',nullif(btrim(p_submission->>'registration_opens_at'),''),
    'registration_closes_at',nullif(btrim(p_submission->>'registration_closes_at'),''),'registration_capacity',p_submission->'registration_capacity',
    'registration_available',p_submission->'registration_available','entry_fee_amount',p_submission->'entry_fee_amount',
    'entry_fee_currency',nullif(btrim(p_submission->>'entry_fee_currency'),''),'entry_fee_unit',nullif(btrim(p_submission->>'entry_fee_unit'),''),
    'fee_breakdown',case when p_submission ? 'fee_breakdown' then p_submission->'fee_breakdown' else '[]'::jsonb end,
    'additional_fees_note',nullif(btrim(p_submission->>'additional_fees_note'),''),'official_url',nullif(btrim(p_submission->>'official_url'),''),
    'results_url',nullif(btrim(p_submission->>'results_url'),''),'club_host',nullif(btrim(p_submission->>'club_host'),''),
    'td_names',case when jsonb_typeof(p_submission->'td_names')='array' then p_submission->'td_names' else '[]'::jsonb end,
    'source_url',nullif(btrim(p_submission->>'source_url'),'')
  ));
  v_errors:=public.lr_candidate_validation_errors(v_payload);
  v_scope:=public.lr_candidate_scope_status(v_payload);
  v_source_url:=coalesce(nullif(btrim(p_submission->>'source_url'),''),nullif(btrim(p_submission->>'registration_url'),''),'https://localrootsdg.com/events/submissions/'||v_submission_id::text);
  select id into v_source_id from public.lr_sources where key='local_roots_submissions';
  if v_source_id is null then raise exception 'Local Roots submission source missing'; end if;

  insert into public.lr_event_submissions(
    id,name,start_date,end_date,timezone,county,city,venue_name,venue_address,course_name,course_id,course_url,event_type,format,format_details,
    start_time_local,end_time_local,rounds_text,sanctioned,tier,registration_url,registration_opens_at,registration_closes_at,
    registration_capacity,registration_available,entry_fee_amount,entry_fee_currency,entry_fee_unit,fee_breakdown,additional_fees_note,
    official_url,results_url,source_url,club_host,td_names,submitter_name,submitter_email,notes,
    normalized_payload,validation_status,validation_errors,scope_status
  ) values (
    v_submission_id,v_name,v_start,v_end,coalesce(nullif(p_submission->>'timezone',''),'America/Los_Angeles'),
    public.lr_canonical_scope_county(p_submission->>'county'),nullif(btrim(p_submission->>'city'),''),nullif(btrim(p_submission->>'venue_name'),''),nullif(btrim(p_submission->>'venue_address'),''),
    nullif(btrim(p_submission->>'course_name'),''),nullif(btrim(p_submission->>'course_id'),''),nullif(btrim(p_submission->>'course_url'),''),
    coalesce(nullif(btrim(p_submission->>'event_type'),''),'other'),nullif(btrim(p_submission->>'format'),''),
    case when jsonb_typeof(p_submission->'format_details')='object' then p_submission->'format_details' else '{}'::jsonb end,
    public.lr_safe_time(p_submission->>'start_time_local'),public.lr_safe_time(p_submission->>'end_time_local'),nullif(btrim(p_submission->>'rounds_text'),''),
    case when p_submission?'sanctioned' and p_submission->'sanctioned'<>'null'::jsonb then (p_submission->>'sanctioned')::boolean else null end,
    nullif(btrim(p_submission->>'tier'),''),nullif(btrim(p_submission->>'registration_url'),''),public.lr_safe_timestamptz(p_submission->>'registration_opens_at'),
    public.lr_safe_timestamptz(p_submission->>'registration_closes_at'),public.lr_safe_integer(p_submission->>'registration_capacity'),
    public.lr_safe_integer(p_submission->>'registration_available'),public.lr_safe_numeric(p_submission->>'entry_fee_amount'),
    nullif(btrim(p_submission->>'entry_fee_currency'),''),nullif(btrim(p_submission->>'entry_fee_unit'),''),
    case when jsonb_typeof(p_submission->'fee_breakdown')='array' then p_submission->'fee_breakdown' else '[]'::jsonb end,
    nullif(btrim(p_submission->>'additional_fees_note'),''),nullif(btrim(p_submission->>'official_url'),''),nullif(btrim(p_submission->>'results_url'),''),
    nullif(btrim(p_submission->>'source_url'),''),nullif(btrim(p_submission->>'club_host'),''),
    case when jsonb_typeof(p_submission->'td_names')='array' then array(select jsonb_array_elements_text(p_submission->'td_names')) else '{}'::text[] end,
    nullif(btrim(p_submission->>'submitter_name'),''),nullif(btrim(p_submission->>'submitter_email'),''),nullif(btrim(p_submission->>'notes'),''),v_payload,
    case when jsonb_array_length(v_errors)>0 then 'invalid' when v_scope='out_of_scope' then 'warning' else 'valid' end,v_errors,v_scope
  );

  insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,records_seen,records_valid,records_rejected,metrics,parser_version)
  values(v_source_id,now(),now(),'ok','ok',case when jsonb_array_length(v_errors)>0 then 'failed' when v_scope='out_of_scope' then 'warning' else 'ok' end,
    case when jsonb_array_length(v_errors)>0 then 'warning' else 'healthy' end,1,case when jsonb_array_length(v_errors)=0 then 1 else 0 end,
    case when jsonb_array_length(v_errors)>0 then 1 else 0 end,jsonb_build_object('submission_id',v_submission_id,'scope_status',v_scope),'submission-v2-structured') returning id into v_run_id;

  insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
  values(v_run_id,v_source_id,'submission:'||v_submission_id::text,v_source_url,v_payload) returning id into v_candidate_id;
  v_candidate:=public.lr_process_candidate(v_candidate_id);
  if v_candidate.validation_status='valid' and v_candidate.scope_status<>'out_of_scope' then
    update public.lr_source_candidates set promotion_status='review_required',updated_at=now() where id=v_candidate_id;
  end if;
  update public.lr_event_submissions set candidate_id=v_candidate_id,matched_event_id=v_candidate.match_event_id,updated_at=now() where id=v_submission_id;
  insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details)
  values('organizer_submission',case when jsonb_array_length(v_errors)>0 or v_scope='out_of_scope' then 'medium' else 'low' end,v_candidate.match_event_id,v_candidate_id,
    'Local Roots event submission requires review',jsonb_build_object('submission_id',v_submission_id,'validation_errors',v_errors,'scope_status',v_scope,'match_method',v_candidate.match_method,'match_confidence',v_candidate.match_confidence));
  return v_submission_id;
end
$$;

revoke all on function public.lr_ingest_event_submission(jsonb) from public,anon,authenticated;
grant execute on function public.lr_ingest_event_submission(jsonb) to service_role;

-- Preserve every structured submission field through the existing explicit
-- reviewer decision. The candidate/provenance pipeline applies merges and new
-- events consistently, including manual-override and source-authority checks.
create or replace function public.lr_decide_event_submission(
  p_submission_id uuid,p_action text,p_target_event_id uuid,p_admin_user_id uuid,p_resolution_note text default null
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  s public.lr_event_submissions%rowtype; v_event_id uuid; v_source_id uuid; v_slug text; v_base_slug text; v_source_url text; v_payload jsonb; v_applied uuid;
begin
  if not exists(select 1 from public.lr_admin_users a where a.user_id=p_admin_user_id and a.active and a.role in ('admin','reviewer')) then raise exception 'not authorized' using errcode='42501'; end if;
  select * into s from public.lr_event_submissions where id=p_submission_id for update;
  if s.id is null then raise exception 'submission not found' using errcode='P0002'; end if;
  if s.status<>'pending' then raise exception 'submission already decided' using errcode='22023'; end if;
  if p_action not in ('approve_new','merge','reject') then raise exception 'invalid submission action' using errcode='22023'; end if;

  if p_action='reject' then
    update public.lr_event_submissions set status='rejected',reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=p_resolution_note,updated_at=now() where id=s.id;
    if s.candidate_id is not null then update public.lr_source_candidates set promotion_status='rejected',updated_at=now() where id=s.candidate_id; end if;
    update public.lr_review_queue set status='rejected',resolved_at=now(),resolution=coalesce(p_resolution_note,'Submission rejected') where source_candidate_id=s.candidate_id and status in ('open','in_review');
    return null;
  end if;
  if s.validation_status='invalid' then raise exception 'invalid submission cannot be approved' using errcode='22023'; end if;
  if s.scope_status='out_of_scope' then raise exception 'out-of-scope submission cannot be approved without changing scope configuration' using errcode='22023'; end if;
  if s.candidate_id is null then raise exception 'submission candidate is missing' using errcode='P0002'; end if;
  select id into v_source_id from public.lr_sources where key='local_roots_submissions';
  if v_source_id is null then raise exception 'Local Roots submission source missing'; end if;
  v_source_url:=coalesce(s.source_url,s.official_url,s.registration_url,'https://localrootsdg.com/events/submissions/'||s.id::text);
  v_payload:=s.normalized_payload-'source_url';

  if p_action='merge' then
    if p_target_event_id is null then raise exception 'merge target required' using errcode='22023'; end if;
    if not exists(select 1 from public.lr_events where id=p_target_event_id) then raise exception 'merge target not found' using errcode='P0002'; end if;
    v_event_id:=p_target_event_id;
    insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,confidence,last_fetched_at)
    values(v_event_id,v_source_id,'submission:'||s.id::text,v_source_url,'manual_verification',false,v_payload,0.85,now())
    on conflict (source_id,external_id) where external_id is not null do update set event_id=excluded.event_id,source_url=excluded.source_url,last_seen_at=now(),last_fetched_at=now(),source_payload=excluded.source_payload,confidence=excluded.confidence;
    update public.lr_source_candidates set match_event_id=v_event_id,promotion_status='pending',updated_at=now() where id=s.candidate_id;
    v_applied:=public.lr_apply_authoritative_candidate(s.candidate_id);
    if v_applied is distinct from v_event_id then raise exception 'submission candidate did not apply to the approved merge target' using errcode='23514'; end if;
    update public.lr_events set last_verified_at=now(),updated_at=now() where id=v_event_id;
    update public.lr_event_submissions set status='merged',matched_event_id=v_event_id,reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=p_resolution_note,updated_at=now() where id=s.id;
  else
    if s.start_date is null then raise exception 'start date required to approve new event' using errcode='22023'; end if;
    v_base_slug:=trim(both '-' from regexp_replace(lower(s.name),'[^a-z0-9]+','-','g')); if v_base_slug='' then v_base_slug:='event'; end if;
    v_slug:=v_base_slug||'-'||to_char(s.start_date,'YYYY-MM-DD'); if exists(select 1 from public.lr_events where slug=v_slug) then v_slug:=v_slug||'-'||left(replace(s.id::text,'-',''),8); end if;
    insert into public.lr_events(slug,name,start_date,end_date,timezone,county,city,venue_name,venue_address,course_name,course_id,course_url,rounds_text,
      start_time_local,end_time_local,event_type,format,format_details,entry_fee_amount,entry_fee_currency,entry_fee_unit,fee_breakdown,additional_fees_note,
      sanctioned,tier,status,registration_status,registration_url,registration_opens_at,registration_closes_at,registration_capacity,registration_available,
      official_url,results_url,club_host,td_names,published,confidence,last_verified_at)
    values(v_slug,s.name,s.start_date,coalesce(s.end_date,s.start_date),coalesce(s.timezone,'America/Los_Angeles'),s.county,s.city,s.venue_name,s.venue_address,s.course_name,s.course_id,s.course_url,s.rounds_text,
      s.start_time_local,s.end_time_local,s.event_type,s.format,coalesce(s.format_details,'{}'::jsonb),s.entry_fee_amount,s.entry_fee_currency,s.entry_fee_unit,coalesce(s.fee_breakdown,'[]'::jsonb),s.additional_fees_note,
      s.sanctioned,s.tier,'upcoming',null,s.registration_url,s.registration_opens_at,s.registration_closes_at,s.registration_capacity,s.registration_available,
      s.official_url,s.results_url,s.club_host,s.td_names,false,0.85,now()) returning id into v_event_id;
    insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,confidence,last_fetched_at)
    values(v_event_id,v_source_id,'submission:'||s.id::text,v_source_url,'manual_verification',coalesce(s.sanctioned,false),v_payload,0.85,now());
    update public.lr_source_candidates set match_event_id=v_event_id,promotion_status='pending',updated_at=now() where id=s.candidate_id;
    v_applied:=public.lr_apply_authoritative_candidate(s.candidate_id);
    if v_applied is distinct from v_event_id then raise exception 'approved submission candidate did not apply to its new event' using errcode='23514'; end if;
    update public.lr_events set published=true,last_verified_at=now(),updated_at=now() where id=v_event_id;
    update public.lr_source_candidates set match_event_id=v_event_id,match_confidence=1.0,match_method='admin_approved_new',promotion_status='promoted',updated_at=now() where id=s.candidate_id;
    update public.lr_event_submissions set status='approved',matched_event_id=v_event_id,reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=p_resolution_note,updated_at=now() where id=s.id;
  end if;
  update public.lr_review_queue set status='resolved',resolved_at=now(),resolution=coalesce(p_resolution_note,case when p_action='merge' then 'Submission merged' else 'Submission approved as new event' end) where source_candidate_id=s.candidate_id and status in ('open','in_review');
  return v_event_id;
end
$$;
revoke all on function public.lr_decide_event_submission(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.lr_decide_event_submission(uuid,text,uuid,uuid,text) to service_role;

create unique index if not exists lr_event_field_review_dedupe_idx
  on public.lr_review_queue(event_id,(details->>'field'))
  where issue_type='event_field_verification' and status in ('open','in_review');

notify pgrst, 'reload schema';
commit;
