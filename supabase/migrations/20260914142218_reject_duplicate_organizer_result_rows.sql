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
  if exists (
    select 1
    from jsonb_array_elements(v_results) as item(row_data)
    group by upper(btrim(row_data->>'division_code')),
             (row_data->>'place')::int,
             lower(btrim(row_data->>'player_name'))
    having count(*) > 1
  ) then raise exception 'duplicate_result_row'; end if;
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
    select 1
    from jsonb_array_elements(s.results) as item(row_data)
    group by upper(btrim(row_data->>'division_code')),
             (row_data->>'place')::int,
             lower(btrim(row_data->>'player_name'))
    having count(*) > 1
  ) then raise exception 'duplicate_result_row'; end if;
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
