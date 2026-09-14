create table public.lr_result_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lr_events(id) on delete cascade,
  score_type text not null check (score_type = any (array['to_par'::text,'total_score'::text,'points'::text])),
  featured_division text not null check (char_length(btrim(featured_division)) between 1 and 24),
  results jsonb not null check (jsonb_typeof(results)='array' and jsonb_array_length(results) between 1 and 300),
  submitter_name text not null check (char_length(btrim(submitter_name)) between 2 and 160),
  submitter_email text not null check (char_length(btrim(submitter_email)) between 3 and 320),
  submitter_role text not null check (char_length(btrim(submitter_role)) between 2 and 120),
  organization text not null check (char_length(btrim(organization)) between 2 and 200),
  source_notes text null check (source_notes is null or char_length(source_notes) <= 2000),
  attestation_version text not null default 'organizer-owned-results-v1',
  attested boolean not null default false check (attested),
  status text not null default 'pending' check (status = any (array['pending'::text,'approved'::text,'rejected'::text])),
  reviewed_by uuid null references auth.users(id),
  reviewed_at timestamptz null,
  resolution_note text null check (resolution_note is null or char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lr_result_submissions_event_status_idx on public.lr_result_submissions(event_id,status,created_at);
alter table public.lr_result_submissions enable row level security;
revoke all on table public.lr_result_submissions from public, anon, authenticated;
grant all on table public.lr_result_submissions to service_role;

comment on table public.lr_result_submissions is 'Review-first organizer-owned results submitted directly to Local Roots. No row publishes until an authorized Local Roots admin approves it.';
comment on column public.lr_results.is_public_selected_division is 'Marks the division featured in compact public event-card previews. Other admitted lr_results rows may appear on the event detail page.';

update public.lr_sources
set name='Local Roots organizer submissions',
    permission_basis='Direct event or organizer-owned results submission to Local Roots. Nothing publishes automatically: Local Roots administrative review is required, and result submitters must attest that the supplied standings come from their own authorized records rather than copied third-party standings.',
    updated_at=now()
where key='local_roots_submissions';

create or replace function public.lr_ingest_result_submission(p_submission jsonb)
returns uuid
language plpgsql
security invoker
set search_path to pg_catalog, public
as $$
declare
  v_id uuid;
  v_event_id uuid;
  v_event_name text;
  v_score_type text;
  v_featured text;
  v_results jsonb;
  v_email text;
begin
  if p_submission is null or jsonb_typeof(p_submission) <> 'object' then raise exception 'invalid_submission'; end if;
  begin v_event_id := nullif(p_submission->>'event_id','')::uuid; exception when others then raise exception 'invalid_event_id'; end;
  if v_event_id is null then raise exception 'event_id_required'; end if;
  select name into v_event_name from public.lr_events where id=v_event_id and published=true;
  if v_event_name is null then raise exception 'event_not_found'; end if;
  v_score_type := btrim(coalesce(p_submission->>'score_type',''));
  if v_score_type not in ('to_par','total_score','points') then raise exception 'invalid_score_type'; end if;
  v_featured := upper(btrim(coalesce(p_submission->>'featured_division','')));
  if char_length(v_featured) < 1 or char_length(v_featured) > 24 then raise exception 'invalid_featured_division'; end if;
  v_results := p_submission->'results';
  if v_results is null or jsonb_typeof(v_results) <> 'array' then raise exception 'invalid_results'; end if;
  if jsonb_array_length(v_results) < 1 or jsonb_array_length(v_results) > 300 then raise exception 'invalid_result_count'; end if;
  if p_submission->'attested' is distinct from 'true'::jsonb then raise exception 'attestation_required'; end if;
  if nullif(btrim(coalesce(p_submission->>'submitter_name','')),'') is null or char_length(btrim(p_submission->>'submitter_name')) > 160 then raise exception 'invalid_submitter_name'; end if;
  v_email := lower(btrim(coalesce(p_submission->>'submitter_email','')));
  if char_length(v_email) < 3 or char_length(v_email) > 320 or position('@' in v_email) <= 1 then raise exception 'invalid_submitter_email'; end if;
  if nullif(btrim(coalesce(p_submission->>'submitter_role','')),'') is null or char_length(btrim(p_submission->>'submitter_role')) > 120 then raise exception 'invalid_submitter_role'; end if;
  if nullif(btrim(coalesce(p_submission->>'organization','')),'') is null or char_length(btrim(p_submission->>'organization')) > 200 then raise exception 'invalid_organization'; end if;
  if char_length(coalesce(p_submission->>'source_notes','')) > 2000 then raise exception 'source_notes_too_long'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_results) as item(row_data)
    where jsonb_typeof(row_data) <> 'object'
       or nullif(btrim(coalesce(row_data->>'division_code','')),'') is null
       or char_length(btrim(coalesce(row_data->>'division_code',''))) > 24
       or jsonb_typeof(row_data->'place') <> 'number'
       or mod((row_data->>'place')::numeric,1) <> 0
       or (row_data->>'place')::numeric < 1 or (row_data->>'place')::numeric > 999
       or nullif(btrim(coalesce(row_data->>'player_name','')),'') is null
       or char_length(btrim(coalesce(row_data->>'player_name',''))) > 160
       or jsonb_typeof(row_data->'value') <> 'number'
       or (v_score_type in ('to_par','total_score') and mod((row_data->>'value')::numeric,1) <> 0)
       or (v_score_type='total_score' and (row_data->>'value')::numeric <= 0)
       or (v_score_type='points' and (row_data->>'value')::numeric < 0)
  ) then raise exception 'invalid_result_row'; end if;
  if not exists (select 1 from jsonb_array_elements(v_results) as item(row_data) where upper(btrim(row_data->>'division_code'))=v_featured) then raise exception 'featured_division_missing'; end if;
  insert into public.lr_result_submissions(event_id,score_type,featured_division,results,submitter_name,submitter_email,submitter_role,organization,source_notes,attestation_version,attested)
  values(v_event_id,v_score_type,v_featured,v_results,btrim(p_submission->>'submitter_name'),v_email,btrim(p_submission->>'submitter_role'),btrim(p_submission->>'organization'),nullif(btrim(coalesce(p_submission->>'source_notes','')),''),'organizer-owned-results-v1',true)
  returning id into v_id;
  insert into public.lr_review_queue(issue_type,severity,event_id,summary,details,status)
  values('organizer_results_submission','low',v_event_id,'Organizer results submission for '||v_event_name,jsonb_build_object('submission_id',v_id::text,'organization',btrim(p_submission->>'organization'),'submitter_name',btrim(p_submission->>'submitter_name'),'score_type',v_score_type,'row_count',jsonb_array_length(v_results)),'open');
  return v_id;
end;
$$;
revoke all on function public.lr_ingest_result_submission(jsonb) from public, anon, authenticated;
grant execute on function public.lr_ingest_result_submission(jsonb) to service_role;

create or replace function public.lr_decide_result_submission(p_submission_id uuid,p_action text,p_admin_user_id uuid,p_resolution_note text default null)
returns uuid
language plpgsql
security invoker
set search_path to pg_catalog, public
as $$
declare
  s public.lr_result_submissions%rowtype;
  v_source_id uuid;
  v_slug text;
  v_source_url text;
  v_has_selected boolean;
begin
  if not exists(select 1 from public.lr_admin_users where user_id=p_admin_user_id and active=true) then raise exception 'unauthorized_admin'; end if;
  select * into s from public.lr_result_submissions where id=p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if s.status <> 'pending' then raise exception 'submission_already_decided'; end if;
  if p_action not in ('approve','reject') then raise exception 'invalid_action'; end if;
  if p_action='reject' then
    update public.lr_result_submissions set status='rejected',reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=nullif(btrim(coalesce(p_resolution_note,'')),''),updated_at=now() where id=s.id;
    update public.lr_review_queue set status='rejected',resolved_at=now(),resolution=coalesce(nullif(btrim(coalesce(p_resolution_note,'')),''),'Result submission rejected during administrative review') where issue_type='organizer_results_submission' and details->>'submission_id'=s.id::text and status in ('open','in_review');
    return s.event_id;
  end if;
  select id into v_source_id from public.lr_sources where key='local_roots_submissions' and enabled=true;
  if v_source_id is null then raise exception 'submission_source_unavailable'; end if;
  select slug into v_slug from public.lr_events where id=s.event_id and published=true;
  if v_slug is null then raise exception 'event_not_published'; end if;
  if exists (
    select 1 from jsonb_array_elements(s.results) as item(row_data)
    join public.lr_results existing on existing.event_id=s.event_id and upper(existing.division_code)=upper(btrim(row_data->>'division_code')) and existing.place=(row_data->>'place')::int and lower(existing.player_name)=lower(btrim(row_data->>'player_name'))
  ) then raise exception 'result_key_conflict'; end if;
  select exists(select 1 from public.lr_results where event_id=s.event_id and is_public_selected_division=true) into v_has_selected;
  v_source_url := 'https://localrootsdg.com/events/'||v_slug||'#results';
  insert into public.lr_results(event_id,division_code,place,player_name,pdga_number,total_score,to_par,points,rating,source_url,source_id,is_public_selected_division,last_verified_at)
  select s.event_id,upper(btrim(row_data->>'division_code')),(row_data->>'place')::int,btrim(row_data->>'player_name'),null,
    case when s.score_type='total_score' then (row_data->>'value')::numeric::int else null end,
    case when s.score_type='to_par' then (row_data->>'value')::numeric::int else null end,
    case when s.score_type='points' then (row_data->>'value')::numeric else null end,
    null,v_source_url,v_source_id,(not v_has_selected and upper(btrim(row_data->>'division_code'))=upper(s.featured_division)),now()
  from jsonb_array_elements(s.results) as item(row_data);
  update public.lr_result_submissions set status='approved',reviewed_by=p_admin_user_id,reviewed_at=now(),resolution_note=nullif(btrim(coalesce(p_resolution_note,'')),''),updated_at=now() where id=s.id;
  update public.lr_review_queue set status='resolved',resolved_at=now(),resolution=coalesce(nullif(btrim(coalesce(p_resolution_note,'')),''),'Organizer-owned results approved for publication') where issue_type='organizer_results_submission' and details->>'submission_id'=s.id::text and status in ('open','in_review');
  return s.event_id;
end;
$$;
revoke all on function public.lr_decide_result_submission(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.lr_decide_result_submission(uuid,text,uuid,text) to service_role;

drop policy if exists lr_results_public_read on public.lr_results;
create policy lr_results_public_read on public.lr_results for select to anon, authenticated using (exists(select 1 from public.lr_events e where e.id=lr_results.event_id and e.published));

create or replace function public.lr_public_events()
returns table(id uuid,slug text,name text,start_date date,end_date date,timezone text,county text,city text,venue_name text,course_name text,rounds_text text,event_type text,format text,sanctioned boolean,tier text,status text,registration_status text,registration_url text,results_url text,club_host text,td_names text[],last_verified_at timestamptz,last_changed_at timestamptz,top_results jsonb)
language sql stable set search_path to pg_catalog, public
as $$
  select e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,e.venue_name,e.course_name,e.rounds_text,e.event_type,e.format,e.sanctioned,e.tier,
    case when e.end_date < (current_timestamp at time zone 'America/Los_Angeles')::date and e.status in ('announced','upcoming','registration_open','full','waitlist') then 'completed'::text else e.status end as status,
    e.registration_status,e.registration_url,e.results_url,e.club_host,e.td_names,e.last_verified_at,e.last_changed_at,
    coalesce((select jsonb_agg(jsonb_build_object('division_code',r.division_code,'place',r.place,'player_name',r.player_name,'pdga_number',r.pdga_number,'total_score',r.total_score,'to_par',r.to_par,'points',r.points,'rating',r.rating,'source_url',r.source_url,'last_verified_at',r.last_verified_at) order by r.place,r.player_name) from public.lr_results r where r.event_id=e.id and r.is_public_selected_division and r.place <= 3),'[]'::jsonb) as top_results
  from public.lr_events e where e.published order by e.start_date,e.name
$$;
revoke all on function public.lr_public_events() from public;
grant execute on function public.lr_public_events() to anon, authenticated, service_role;

create or replace function public.lr_public_event_detail(p_slug text)
returns table(id uuid,slug text,name text,start_date date,end_date date,timezone text,county text,city text,venue_name text,course_name text,rounds_text text,event_type text,format text,sanctioned boolean,tier text,status text,registration_status text,registration_url text,results_url text,club_host text,td_names text[],last_verified_at timestamptz,last_changed_at timestamptz,top_results jsonb,all_results jsonb)
language sql stable set search_path to pg_catalog, public
as $$
  select p.*,coalesce((select jsonb_agg(jsonb_build_object('division_code',r.division_code,'place',r.place,'player_name',r.player_name,'pdga_number',r.pdga_number,'total_score',r.total_score,'to_par',r.to_par,'points',r.points,'rating',r.rating,'source_url',r.source_url,'last_verified_at',r.last_verified_at) order by r.division_code,r.place,r.player_name) from public.lr_results r where r.event_id=p.id),'[]'::jsonb) as all_results
  from public.lr_public_events() p where p.slug=p_slug limit 1
$$;
revoke all on function public.lr_public_event_detail(text) from public;
grant execute on function public.lr_public_event_detail(text) to anon, authenticated, service_role;
