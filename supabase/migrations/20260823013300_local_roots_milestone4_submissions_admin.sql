-- Milestone 4: Local Roots organizer submissions and authenticated admin-review domain.
-- Source-neutral: no PDGA/UDisc/Disc Golf Scene adapter is introduced here.

create table if not exists public.lr_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'admin' check (role in ('admin','reviewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lr_admin_users enable row level security;
revoke all on public.lr_admin_users from anon, authenticated;

create table if not exists public.lr_event_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  start_date date,
  end_date date,
  county text,
  city text check (city is null or char_length(city) <= 120),
  venue_name text check (venue_name is null or char_length(venue_name) <= 200),
  course_name text check (course_name is null or char_length(course_name) <= 200),
  event_type text not null default 'other' check (event_type in ('tournament','flex_start','league','doubles','team','putting','ace_race','circuit_challenge','tag_match','clinic','charity','community','other')),
  format text check (format is null or char_length(format) <= 160),
  rounds_text text check (rounds_text is null or char_length(rounds_text) <= 160),
  sanctioned boolean,
  tier text check (tier is null or char_length(tier) <= 80),
  registration_url text check (registration_url is null or public.lr_is_http_url(registration_url)),
  results_url text check (results_url is null or public.lr_is_http_url(results_url)),
  source_url text check (source_url is null or public.lr_is_http_url(source_url)),
  club_host text check (club_host is null or char_length(club_host) <= 200),
  td_names text[] not null default '{}',
  submitter_name text check (submitter_name is null or char_length(submitter_name) <= 160),
  submitter_email text check (submitter_email is null or char_length(submitter_email) <= 320),
  notes text check (notes is null or char_length(notes) <= 4000),
  normalized_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_payload) = 'object'),
  validation_status text not null default 'pending' check (validation_status in ('pending','valid','warning','invalid')),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  scope_status text not null default 'unknown' check (scope_status in ('in_scope','out_of_scope','unknown')),
  status text not null default 'pending' check (status in ('pending','approved','merged','rejected')),
  candidate_id uuid unique references public.lr_source_candidates(id) on delete set null,
  matched_event_id uuid references public.lr_events(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (submitter_email is null or position('@' in submitter_email) > 1)
);
alter table public.lr_event_submissions enable row level security;
revoke all on public.lr_event_submissions from anon, authenticated;
create index if not exists lr_event_submissions_status_created_idx on public.lr_event_submissions(status, created_at desc);
create index if not exists lr_event_submissions_candidate_idx on public.lr_event_submissions(candidate_id) where candidate_id is not null;
create index if not exists lr_event_submissions_match_idx on public.lr_event_submissions(matched_event_id) where matched_event_id is not null;
create index if not exists lr_event_submissions_reviewed_by_idx on public.lr_event_submissions(reviewed_by) where reviewed_by is not null;

insert into public.lr_sources(key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,notes)
values(
  'local_roots_submissions','Local Roots event submissions','organizer_submission','https://localrootsdg.com',
  'Local Roots public event submission form',
  'Direct submission to Local Roots; publication requires Local Roots administrative review',
  true,'{}'::text[],
  'Submissions are never treated as authoritative until an administrator explicitly reviews them.'
)
on conflict (key) do nothing;

create or replace function public.lr_safe_date(p_value text)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if nullif(btrim(p_value),'') is null then return null; end if;
  return p_value::date;
exception when others then return null;
end;
$$;

create or replace function public.lr_canonical_scope_county(p_value text)
returns text language sql stable set search_path = '' as $$
  select coalesce(
    (select c from public.lr_scope_profiles sp, unnest(sp.allowed_counties) c
      where sp.active and public.lr_normalize_county(c)=public.lr_normalize_county(p_value) limit 1),
    case when nullif(btrim(p_value),'') is null then null else initcap(public.lr_normalize_county(p_value)) end
  );
$$;

create or replace function public.lr_ingest_event_submission(p_submission jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
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
    'county',public.lr_canonical_scope_county(p_submission->>'county'),'city',nullif(btrim(p_submission->>'city'),''),
    'venue_name',nullif(btrim(p_submission->>'venue_name'),''),'course_name',nullif(btrim(p_submission->>'course_name'),''),
    'rounds_text',nullif(btrim(p_submission->>'rounds_text'),''),'event_type',coalesce(nullif(btrim(p_submission->>'event_type'),''),'other'),
    'format',nullif(btrim(p_submission->>'format'),''),
    'sanctioned',case when p_submission?'sanctioned' and p_submission->'sanctioned'<>'null'::jsonb then (p_submission->>'sanctioned')::boolean else null end,
    'tier',nullif(btrim(p_submission->>'tier'),''),'status','upcoming','registration_url',nullif(btrim(p_submission->>'registration_url'),''),
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
    id,name,start_date,end_date,county,city,venue_name,course_name,event_type,format,rounds_text,sanctioned,tier,
    registration_url,results_url,source_url,club_host,td_names,submitter_name,submitter_email,notes,
    normalized_payload,validation_status,validation_errors,scope_status
  ) values (
    v_submission_id,v_name,v_start,v_end,public.lr_canonical_scope_county(p_submission->>'county'),nullif(btrim(p_submission->>'city'),''),
    nullif(btrim(p_submission->>'venue_name'),''),nullif(btrim(p_submission->>'course_name'),''),coalesce(nullif(btrim(p_submission->>'event_type'),''),'other'),
    nullif(btrim(p_submission->>'format'),''),nullif(btrim(p_submission->>'rounds_text'),''),
    case when p_submission?'sanctioned' and p_submission->'sanctioned'<>'null'::jsonb then (p_submission->>'sanctioned')::boolean else null end,
    nullif(btrim(p_submission->>'tier'),''),nullif(btrim(p_submission->>'registration_url'),''),nullif(btrim(p_submission->>'results_url'),''),
    nullif(btrim(p_submission->>'source_url'),''),nullif(btrim(p_submission->>'club_host'),''),
    case when jsonb_typeof(p_submission->'td_names')='array' then array(select jsonb_array_elements_text(p_submission->'td_names')) else '{}'::text[] end,
    nullif(btrim(p_submission->>'submitter_name'),''),nullif(btrim(p_submission->>'submitter_email'),''),nullif(btrim(p_submission->>'notes'),''),v_payload,
    case when jsonb_array_length(v_errors)>0 then 'invalid' when v_scope='out_of_scope' then 'warning' else 'valid' end,v_errors,v_scope
  );

  insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,records_seen,records_valid,records_rejected,metrics,parser_version)
  values(v_source_id,now(),now(),'ok','ok',case when jsonb_array_length(v_errors)>0 then 'failed' when v_scope='out_of_scope' then 'warning' else 'ok' end,
    case when jsonb_array_length(v_errors)>0 then 'warning' else 'healthy' end,1,case when jsonb_array_length(v_errors)=0 then 1 else 0 end,
    case when jsonb_array_length(v_errors)>0 then 1 else 0 end,jsonb_build_object('submission_id',v_submission_id,'scope_status',v_scope),'submission-v1')
  returning id into v_run_id;

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
end;
$$;

-- Canonical final implementation. The live project briefly used a noncanonical match_method
-- value during fixture testing; the following version incorporates the immediate repair.
create or replace function public.lr_decide_event_submission(
  p_submission_id uuid,p_action text,p_target_event_id uuid,p_admin_user_id uuid,p_resolution_note text default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  s public.lr_event_submissions%rowtype; v_event_id uuid; v_source_id uuid; v_slug text; v_base_slug text; v_source_url text; v_payload jsonb;
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
  select id into v_source_id from public.lr_sources where key='local_roots_submissions';
  v_source_url:=coalesce(s.source_url,s.registration_url,'https://localrootsdg.com/events/submissions/'||s.id::text);
  v_payload:=s.normalized_payload-'source_url';

  if p_action='merge' then
    if p_target_event_id is null then raise exception 'merge target required' using errcode='22023'; end if;
    if not exists(select 1 from public.lr_events where id=p_target_event_id) then raise exception 'merge target not found' using errcode='P0002'; end if;
    v_event_id:=p_target_event_id;
    insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,confidence,last_fetched_at)
    values(v_event_id,v_source_id,'submission:'||s.id::text,v_source_url,'manual_verification',false,v_payload,0.85,now())
    on conflict (source_id,external_id) where external_id is not null do update set event_id=excluded.event_id,last_seen_at=now(),last_fetched_at=now(),source_payload=excluded.source_payload,confidence=excluded.confidence;
    update public.lr_events set last_verified_at=now(),updated_at=now() where id=v_event_id;
    update public.lr_event_submissions set status='merged',matched_event_id=v_event_id,reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=p_resolution_note,updated_at=now() where id=s.id;
    if s.candidate_id is not null then update public.lr_source_candidates set match_event_id=v_event_id,promotion_status='duplicate',updated_at=now() where id=s.candidate_id; end if;
  else
    if s.start_date is null then raise exception 'start date required to approve new event' using errcode='22023'; end if;
    v_base_slug:=trim(both '-' from regexp_replace(lower(s.name),'[^a-z0-9]+','-','g')); if v_base_slug='' then v_base_slug:='event'; end if;
    v_slug:=v_base_slug||'-'||to_char(s.start_date,'YYYY-MM-DD'); if exists(select 1 from public.lr_events where slug=v_slug) then v_slug:=v_slug||'-'||left(replace(s.id::text,'-',''),8); end if;
    insert into public.lr_events(slug,name,start_date,end_date,county,city,venue_name,course_name,rounds_text,event_type,format,sanctioned,tier,status,registration_url,results_url,club_host,td_names,published,confidence,last_verified_at)
    values(v_slug,s.name,s.start_date,coalesce(s.end_date,s.start_date),s.county,s.city,s.venue_name,s.course_name,s.rounds_text,s.event_type,s.format,s.sanctioned,s.tier,'upcoming',s.registration_url,s.results_url,s.club_host,s.td_names,false,0.85,now()) returning id into v_event_id;
    insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,confidence,last_fetched_at)
    values(v_event_id,v_source_id,'submission:'||s.id::text,v_source_url,'manual_verification',coalesce(s.sanctioned,false),v_payload,0.85,now());
    update public.lr_events set published=true where id=v_event_id;
    update public.lr_event_submissions set status='approved',matched_event_id=v_event_id,reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=p_resolution_note,updated_at=now() where id=s.id;
    if s.candidate_id is not null then update public.lr_source_candidates set match_event_id=v_event_id,match_confidence=1.0,match_method='new',promotion_status='promoted',updated_at=now() where id=s.candidate_id; end if;
  end if;
  update public.lr_review_queue set status='resolved',resolved_at=now(),resolution=coalesce(p_resolution_note,case when p_action='merge' then 'Submission merged' else 'Submission approved as new event' end) where source_candidate_id=s.candidate_id and status in ('open','in_review');
  return v_event_id;
end;
$$;

revoke all on function public.lr_safe_date(text) from public,anon,authenticated;
revoke all on function public.lr_canonical_scope_county(text) from public,anon,authenticated;
revoke all on function public.lr_ingest_event_submission(jsonb) from public,anon,authenticated;
revoke all on function public.lr_decide_event_submission(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.lr_ingest_event_submission(jsonb) to service_role;
grant execute on function public.lr_decide_event_submission(uuid,text,uuid,uuid,text) to service_role;
