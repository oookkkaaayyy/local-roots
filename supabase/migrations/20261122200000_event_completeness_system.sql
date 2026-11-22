-- Event completeness system (2026-11-22).
-- Goal: every listing is complete by default. A required-fields schema per event class,
-- a computed completeness score, a gap view, a fact applier that fills only NULL fields and
-- attaches provenance evidence (which is what closes event_field_verification items),
-- a duplicate detector, and review-queue alerting. No external messages are sent.

create table if not exists public.lr_event_field_requirements (
  event_class text not null check (event_class in ('recurring','tournament')),
  group_key text not null,
  fields text[] not null,
  tier text not null check (tier in ('required','expected')),
  note text,
  primary key (event_class, group_key)
);
alter table public.lr_event_field_requirements enable row level security;
comment on table public.lr_event_field_requirements is 'Required/expected field groups per event class. A group is satisfied when any listed field has a value, or has a current not_announced/not_applicable evidence row with a source URL.';

insert into public.lr_event_field_requirements(event_class,group_key,fields,tier,note) values
 ('recurring','name','{name}','required',null),
 ('recurring','start_date','{start_date}','required',null),
 ('recurring','timezone','{timezone}','required',null),
 ('recurring','county','{county}','required',null),
 ('recurring','city','{city}','required',null),
 ('recurring','location','{course_name,venue_name,venue_address}','required','course, venue or address'),
 ('recurring','event_type','{event_type}','required',null),
 ('recurring','format','{format}','required',null),
 ('recurring','start_time','{start_time_local,start_time_note}','required',null),
 ('recurring','host','{club_host,td_names}','required','club or director'),
 ('recurring','link','{official_url,registration_url}','required','a page where the event can be confirmed'),
 ('recurring','fee','{entry_fee_amount,fee_breakdown}','expected',null),
 ('recurring','rounds','{rounds_text}','expected',null),
 ('recurring','registration','{registration_url,registration_status}','expected',null),
 ('tournament','name','{name}','required',null),
 ('tournament','start_date','{start_date}','required',null),
 ('tournament','timezone','{timezone}','required',null),
 ('tournament','county','{county}','required',null),
 ('tournament','city','{city}','required',null),
 ('tournament','location','{course_name,venue_name,venue_address}','required','course, venue or address'),
 ('tournament','event_type','{event_type}','required',null),
 ('tournament','format','{format}','required',null),
 ('tournament','start_time','{start_time_local,start_time_note}','required',null),
 ('tournament','host','{club_host,td_names}','required','club or director'),
 ('tournament','link','{official_url,registration_url}','required',null),
 ('tournament','fee','{entry_fee_amount,fee_breakdown}','required',null),
 ('tournament','registration','{registration_url,registration_status}','required',null),
 ('tournament','rounds','{rounds_text}','required',null),
 ('tournament','divisions','{format_details}','expected','divisions, tiers or field details'),
 ('tournament','sanction','{sanctioned}','expected',null)
on conflict (event_class,group_key) do nothing;

create or replace function public.lr_event_class(p_event_type text)
returns text language sql immutable set search_path to 'pg_catalog' as $$
  select case when p_event_type in ('league','doubles','tag_match','community') then 'recurring' else 'tournament' end
$$;

create or replace function public.lr__field_filled(p_event_id uuid, p_row jsonb, p_field text)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select (
    case when p_row->p_field is null or jsonb_typeof(p_row->p_field)='null' then false
         when p_row->p_field in ('""'::jsonb,'[]'::jsonb,'{}'::jsonb) then false
         else true end
  ) or exists (
    select 1 from public.lr_event_field_evidence ev
    where ev.event_id=p_event_id and ev.field_name=p_field
      and ev.status in ('not_announced','not_applicable')
      and ev.source_url is not null
      and (ev.expires_at is null or ev.expires_at>=now())
  )
$$;

create or replace view public.lr_event_completeness as
with ev as (
  select e.id, e.slug, e.name, e.start_date, e.event_type, e.published, e.status, to_jsonb(e) as row,
         public.lr_event_class(e.event_type) as event_class
  from public.lr_events e
), g as (
  select ev.id, ev.slug, ev.name, ev.start_date, ev.event_type, ev.published, ev.status, ev.event_class,
         r.group_key, r.tier, r.fields,
         exists (select 1 from unnest(r.fields) f where public.lr__field_filled(ev.id, ev.row, f)) as filled
  from ev join public.lr_event_field_requirements r on r.event_class=ev.event_class
)
select id as event_id, slug, name, start_date, event_type, event_class, published, status,
  count(*) filter (where tier='required') as required_total,
  count(*) filter (where tier='required' and filled) as required_filled,
  count(*) filter (where tier='expected') as expected_total,
  count(*) filter (where tier='expected' and filled) as expected_filled,
  round(100.0 * (2*count(*) filter (where tier='required' and filled) + count(*) filter (where tier='expected' and filled))
        / nullif(2*count(*) filter (where tier='required') + count(*) filter (where tier='expected'),0), 1) as completeness_score,
  coalesce(array_agg(group_key order by group_key) filter (where tier='required' and not filled), '{}') as missing_required,
  coalesce(array_agg(group_key order by group_key) filter (where tier='expected' and not filled), '{}') as missing_expected
from g group by id, slug, name, start_date, event_type, event_class, published, status;
comment on view public.lr_event_completeness is 'Per-event completeness score (required weighted 2x, expected 1x) and missing field groups. Admin/service use.';

create or replace view public.lr_event_gaps as
select c.event_id, c.slug, c.name, c.start_date, c.event_type, c.completeness_score, u.group_key, 'required'::text as tier
from public.lr_event_completeness c cross join lateral unnest(c.missing_required) u(group_key)
where c.published and c.start_date>=current_date and c.status not in ('canceled','completed')
union all
select c.event_id, c.slug, c.name, c.start_date, c.event_type, c.completeness_score, u.group_key, 'expected'
from public.lr_event_completeness c cross join lateral unnest(c.missing_expected) u(group_key)
where c.published and c.start_date>=current_date and c.status not in ('canceled','completed');

revoke all on public.lr_event_completeness, public.lr_event_gaps from anon, authenticated;
grant select on public.lr_event_completeness, public.lr_event_gaps to service_role;
revoke all on public.lr_event_field_requirements from anon, authenticated;

-- Fact applier: fills only NULL fields, never overwrites a differing value (records a conflict),
-- and attaches provenance evidence. Evidence is what closes event_field_verification items.
create or replace function public.lr__same_value(p_field text, a jsonb, b jsonb)
returns boolean language plpgsql immutable set search_path to 'pg_catalog','public' as $$
begin
  if a is null or b is null then return false; end if;
  if p_field in ('start_time_local','checkin_time_local','end_time_local') then return (a#>>'{}')::time = (b#>>'{}')::time; end if;
  if p_field in ('registration_opens_at','registration_closes_at') then return (a#>>'{}')::timestamptz = (b#>>'{}')::timestamptz; end if;
  if jsonb_typeof(a)='string' and jsonb_typeof(b)='string' then
    return lower(regexp_replace(btrim(a#>>'{}'),'\s+',' ','g')) = lower(regexp_replace(btrim(b#>>'{}'),'\s+',' ','g'));
  end if;
  return a = b;
exception when others then return false;
end $$;

create or replace function public.lr_apply_event_facts(p_event_ids uuid[], p_source_key text, p_source_url text, p_facts jsonb, p_actor text default 'enrichment')
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare
  src public.lr_sources%rowtype; eid uuid; k text; v jsonb; cur jsonb; ok_auth boolean; exp timestamptz; st text;
  stable_fields constant text[] := array['timezone','county','city','course_name','course_id','course_url','venue_name','venue_address','event_type','name'];
  filled int:=0; verified int:=0; conflicts int:=0; classified int:=0; touched int; fields_done text[];
begin
  select * into src from public.lr_sources where key=p_source_key;
  if not found then raise exception 'Unknown source key %', p_source_key using errcode='22023'; end if;
  if not public.lr_is_http_url(p_source_url) then raise exception 'Source URL must be HTTP(S)' using errcode='22023'; end if;
  foreach eid in array p_event_ids loop
    touched:=0; fields_done:='{}';
    if not exists(select 1 from public.lr_event_sources es where es.event_id=eid and es.source_id=src.id and es.source_url=p_source_url) then
      insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,confidence)
      values(eid,src.id,'enrich:'||md5(p_source_url||eid::text),p_source_url,'manual_verification',false,jsonb_build_object('origin','lr_apply_event_facts','actor',p_actor),coalesce(src.default_confidence,0.75))
      on conflict do nothing;
    end if;
    for k,v in select key,value from jsonb_each(p_facts) order by (key<>'start_time_local'), key loop
      if not public.lr_is_overridable_event_field(k) then continue; end if;
      cur := public.lr_event_field_value(eid,k);
      ok_auth := k = any(src.authoritative_fields);
      if jsonb_typeof(v)='object' and v ? 'status' then
        st := v->>'status';
        if st not in ('not_announced','not_applicable') then continue; end if;
        if not (cur is null or jsonb_typeof(cur)='null' or cur in ('""'::jsonb,'[]'::jsonb,'{}'::jsonb)) then conflicts:=conflicts+1; continue; end if;
        exp := case when st='not_announced' then now()+make_interval(days => coalesce((v->>'ttl_days')::int,14)) else null end;
        insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_url,status,observed_value,verified_at,expires_at,notes)
        values(eid,k,null,p_source_url,st,null,now(),exp,coalesce(v->>'note','Classified from source page by '||p_actor))
        on conflict (event_id,field_name) where source_id is null do update set source_url=excluded.source_url,status=excluded.status,verified_at=excluded.verified_at,expires_at=excluded.expires_at,notes=excluded.notes,updated_at=now();
        classified:=classified+1; touched:=touched+1; fields_done:=fields_done||k; continue;
      end if;
      if v is null or jsonb_typeof(v)='null' then continue; end if;
      if cur is null or jsonb_typeof(cur)='null' or cur in ('""'::jsonb,'[]'::jsonb,'{}'::jsonb) then
        if k='entry_fee_amount' then
          update public.lr_events set entry_fee_amount=(v#>>'{}')::numeric, entry_fee_currency=coalesce(p_facts->>'entry_fee_currency','USD'), entry_fee_unit=coalesce(p_facts->>'entry_fee_unit','person'), last_changed_at=now() where id=eid;
        elsif k in ('entry_fee_currency','entry_fee_unit') then null;
        else perform public.lr_set_event_field_value(eid,k,v); end if;
        cur := public.lr_event_field_value(eid,k); filled:=filled+1;
      end if;
      exp := case when k = any(stable_fields) then null else now()+coalesce(src.verification_ttl,interval '14 days') end;
      if public.lr__same_value(k,cur,v) then
        if ok_auth then
          insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_url,status,observed_value,verified_at,expires_at,notes)
          values(eid,k,src.id,p_source_url,'verified',cur,now(),exp,'Read from source page by '||p_actor)
          on conflict (event_id,field_name,source_id) where source_id is not null do update set source_url=excluded.source_url,status='verified',observed_value=excluded.observed_value,verified_at=now(),expires_at=excluded.expires_at,notes=excluded.notes,updated_at=now();
        else
          insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_url,status,observed_value,verified_at,expires_at,notes)
          values(eid,k,null,p_source_url,'verified',cur,now(),exp,'Read from '||p_source_key||' page by '||p_actor)
          on conflict (event_id,field_name) where source_id is null do update set source_url=excluded.source_url,status='verified',observed_value=excluded.observed_value,verified_at=now(),expires_at=excluded.expires_at,notes=excluded.notes,updated_at=now();
        end if;
        verified:=verified+1; touched:=touched+1; fields_done:=fields_done||k;
      else
        insert into public.lr_event_field_evidence(event_id,field_name,source_id,source_url,status,observed_value,verified_at,expires_at,notes)
        values(eid,k,case when ok_auth then src.id else null end,p_source_url,'conflicting',v,now(),null,'Source value differs from stored value; not overwritten')
        on conflict do nothing;
        conflicts:=conflicts+1;
      end if;
    end loop;
    if touched>0 then
      update public.lr_events set last_verified_at=now(),
        internal_notes=left(coalesce(internal_notes||E'\n','')||(now() at time zone 'America/Los_Angeles')::date||' facts from '||p_source_url||' ('||array_to_string(fields_done,',')||')',4000)
      where id=eid;
    end if;
  end loop;
  return jsonb_build_object('filled',filled,'verified',verified,'classified',classified,'conflicts',conflicts);
end $$;
revoke all on function public.lr_apply_event_facts(uuid[],text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.lr_apply_event_facts(uuid[],text,text,jsonb,text) to service_role;

-- Review-queue alerting for completeness gaps: one item per event, auto-updated, auto-closed.
create or replace function public.lr_enqueue_completeness_gaps(p_horizon_days integer default 120)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare v_opened int:=0; v_closed int:=0; v_updated int:=0; r record;
begin
  update public.lr_review_queue q set status='resolved',resolved_at=now(),resolution='Required fields complete or event no longer upcoming'
  where q.issue_type='event_completeness_gap' and q.status in ('open','in_review')
    and not exists(select 1 from public.lr_event_completeness c where c.event_id=q.event_id and c.published and c.start_date>=current_date and c.status not in ('canceled','completed') and cardinality(c.missing_required)>0);
  get diagnostics v_closed = row_count;
  for r in select * from public.lr_event_completeness c where c.published and c.start_date between current_date and current_date+p_horizon_days and c.status not in ('canceled','completed') and cardinality(c.missing_required)>0 loop
    if exists(select 1 from public.lr_review_queue q where q.issue_type='event_completeness_gap' and q.event_id=r.event_id and q.status in ('open','in_review')) then
      update public.lr_review_queue q set details=jsonb_build_object('slug',r.slug,'start_date',r.start_date,'score',r.completeness_score,'missing_required',r.missing_required,'missing_expected',r.missing_expected)
      where q.issue_type='event_completeness_gap' and q.event_id=r.event_id and q.status in ('open','in_review');
      v_updated:=v_updated+1;
    else
      insert into public.lr_review_queue(issue_type,severity,event_id,summary,details)
      values('event_completeness_gap',case when r.start_date<=current_date+14 then 'high' when r.start_date<=current_date+45 then 'medium' else 'low' end,r.event_id,
        'Published upcoming event is missing required fields',
        jsonb_build_object('slug',r.slug,'start_date',r.start_date,'score',r.completeness_score,'missing_required',r.missing_required,'missing_expected',r.missing_expected));
      v_opened:=v_opened+1;
    end if;
  end loop;
  return jsonb_build_object('opened',v_opened,'updated',v_updated,'closed',v_closed);
end $$;
revoke all on function public.lr_enqueue_completeness_gaps(integer) from public, anon, authenticated;
grant execute on function public.lr_enqueue_completeness_gaps(integer) to service_role;

-- Duplicate detection: same date, same place, near-identical normalized name (or shared registration URL).
create or replace view public.lr_possible_duplicates as
select a.id as event_a, b.id as event_b, a.start_date, a.name as name_a, b.name as name_b, a.course_name,
  case when a.registration_url is not null and a.registration_url=b.registration_url then 'same_registration_url' else 'same_day_place_similar_name' end as reason
from public.lr_events a join public.lr_events b on a.id<b.id and a.start_date=b.start_date
 and coalesce(a.course_name,a.venue_name,a.city)=coalesce(b.course_name,b.venue_name,b.city)
where a.status<>'canceled' and b.status<>'canceled' and a.start_date>=current_date-30
  and ( (a.registration_url is not null and a.registration_url=b.registration_url)
     or extensions.similarity(public.lr_normalize_match_text(a.name), public.lr_normalize_match_text(b.name))>=0.6 );
revoke all on public.lr_possible_duplicates from anon, authenticated;
grant select on public.lr_possible_duplicates to service_role;

create or replace function public.lr_enqueue_duplicate_alerts()
returns integer language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare n int:=0; r record;
begin
  for r in select * from public.lr_possible_duplicates d where not exists(
      select 1 from public.lr_review_queue q where q.issue_type='possible_duplicate_event'
      and q.details->>'event_a'=d.event_a::text and q.details->>'event_b'=d.event_b::text) loop
    insert into public.lr_review_queue(issue_type,severity,event_id,summary,details)
    values('possible_duplicate_event','medium',r.event_a,'Two events share a date and place with similar names',
      jsonb_build_object('event_a',r.event_a,'event_b',r.event_b,'name_a',r.name_a,'name_b',r.name_b,'start_date',r.start_date,'reason',r.reason));
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.lr_enqueue_duplicate_alerts() from public, anon, authenticated;
grant execute on function public.lr_enqueue_duplicate_alerts() to service_role;

-- Series applier: one page's facts for every upcoming published event of a named series.
create or replace function public.lr_apply_series_facts(p_name text, p_source_key text, p_source_url text, p_facts jsonb, p_page_dates date[] default null, p_actor text default 'editorial')
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare ids uuid[]; r record; res jsonb; n int:=0;
begin
  select coalesce(array_agg(id),'{}') into ids from public.lr_events where published and start_date>=current_date and name=p_name;
  if cardinality(ids)=0 then return jsonb_build_object('error','no events','name',p_name); end if;
  res := public.lr_apply_event_facts(ids,p_source_key,p_source_url,p_facts,p_actor);
  if p_page_dates is not null then
    for r in select id,start_date,end_date from public.lr_events where id=any(ids) and start_date=any(p_page_dates) loop
      perform public.lr_apply_event_facts(array[r.id],p_source_key,p_source_url,
        jsonb_build_object('start_date',r.start_date)||case when r.end_date=r.start_date then jsonb_build_object('end_date',r.end_date) else '{}'::jsonb end,p_actor);
      n:=n+1;
    end loop;
  end if;
  return res||jsonb_build_object('events',cardinality(ids),'dates_verified',n,'dates_not_on_page',(select coalesce(jsonb_agg(start_date),'[]') from public.lr_events where id=any(ids) and p_page_dates is not null and not start_date=any(p_page_dates)));
end $$;
revoke all on function public.lr_apply_series_facts(text,text,text,jsonb,date[],text) from public, anon, authenticated;
grant execute on function public.lr_apply_series_facts(text,text,text,jsonb,date[],text) to service_role;
