-- Milestone 2: source-independent normalization, matching, scope, change history, and source health.
create extension if not exists pg_trgm with schema extensions;

alter table public.lr_source_runs add column if not exists scheduler_status text not null default 'unknown';
do $$ begin
  alter table public.lr_source_runs add constraint lr_source_runs_scheduler_status_check check (scheduler_status = any (array['unknown','ok','failed','skipped']));
exception when duplicate_object then null; end $$;

alter table public.lr_source_candidates
  add column if not exists scope_status text not null default 'pending',
  add column if not exists match_method text;
do $$ begin alter table public.lr_source_candidates drop constraint lr_source_candidates_promotion_status_check; exception when undefined_object then null; end $$;
alter table public.lr_source_candidates add constraint lr_source_candidates_promotion_status_check check (promotion_status = any (array['pending','promoted','review_required','rejected','duplicate','superseded','held']));
do $$ begin alter table public.lr_source_candidates add constraint lr_source_candidates_scope_status_check check (scope_status = any (array['pending','in_scope','out_of_scope','exception'])); exception when duplicate_object then null; end $$;
do $$ begin alter table public.lr_source_candidates add constraint lr_source_candidates_match_method_check check (match_method is null or match_method = any (array['source_external_id','registration_url','fuzzy','new','ambiguous'])); exception when duplicate_object then null; end $$;

create table if not exists public.lr_event_change_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lr_events(id) on delete cascade,
  source_id uuid references public.lr_sources(id) on delete set null,
  source_candidate_id uuid references public.lr_source_candidates(id) on delete set null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  change_type text not null check (change_type = any (array['source_update','organizer_confirmed','manual','system'])),
  created_at timestamptz not null default now()
);
create index if not exists lr_event_change_log_event_idx on public.lr_event_change_log(event_id, created_at desc);
alter table public.lr_event_change_log enable row level security;
revoke all on public.lr_event_change_log from anon, authenticated;

create or replace function public.lr_normalize_match_text(p_value text) returns text language sql immutable set search_path = '' as $$
  select nullif(trim(regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', ' ', 'g')), '');
$$;

create or replace function public.lr_candidate_validation_errors(p_payload jsonb) returns jsonb language plpgsql stable set search_path = '' as $$
declare errs jsonb := '[]'::jsonb; s date; e date; v text;
begin
  if jsonb_typeof(p_payload) <> 'object' then return jsonb_build_array('payload_not_object'); end if;
  v := btrim(coalesce(p_payload->>'name',''));
  if v = '' then errs := errs || '"missing_name"'::jsonb; elsif v ~ '^\s*\d+\s*$' then errs := errs || '"numeric_only_name"'::jsonb; end if;
  begin s := (p_payload->>'start_date')::date; exception when others then errs := errs || '"invalid_start_date"'::jsonb; end;
  begin e := coalesce(nullif(p_payload->>'end_date',''), p_payload->>'start_date')::date; exception when others then errs := errs || '"invalid_end_date"'::jsonb; end;
  if s is not null and e is not null and e < s then errs := errs || '"end_before_start"'::jsonb; end if;
  if p_payload ? 'course_name' and nullif(btrim(p_payload->>'course_name'),'') is not null and not public.lr_is_plausible_course_name(p_payload->>'course_name') then errs := errs || '"implausible_course_name"'::jsonb; end if;
  foreach v in array array['registration_url','results_url','source_url'] loop
    if p_payload ? v and nullif(btrim(p_payload->>v),'') is not null and not public.lr_is_http_url(p_payload->>v) then errs := errs || to_jsonb('invalid_' || v); end if;
  end loop;
  return errs;
end;
$$;

-- NOTE: the original deployed version of lr_candidate_scope_status was immediately superseded by
-- 20260823011901_fix_milestone2_scope_normalization.sql after rollback fixtures caught canonical-form mismatch.
create or replace function public.lr_candidate_scope_status(p_payload jsonb) returns text language plpgsql stable set search_path = '' as $$
declare profile public.lr_scope_profiles%rowtype; county_norm text; c text;
begin
  select * into profile from public.lr_scope_profiles where active order by updated_at desc limit 1;
  if profile.id is null then return 'out_of_scope'; end if;
  county_norm := public.lr_normalize_county(p_payload->>'county');
  if county_norm is not null and county_norm = any(profile.allowed_counties) then return 'in_scope'; end if;
  if nullif(btrim(p_payload->>'course_name'),'') is not null then foreach c in array profile.allowed_course_names loop if public.lr_normalize_match_text(c)=public.lr_normalize_match_text(p_payload->>'course_name') then return 'exception'; end if; end loop; end if;
  if nullif(btrim(p_payload->>'city'),'') is not null then foreach c in array profile.allowed_cities loop if public.lr_normalize_match_text(c)=public.lr_normalize_match_text(p_payload->>'city') then return 'exception'; end if; end loop; end if;
  return 'out_of_scope';
end;
$$;

create or replace function public.lr_source_authoritative_for(p_source_id uuid,p_field text) returns boolean language sql stable set search_path='' as $$
  select coalesce(p_field = any(authoritative_fields), false) from public.lr_sources where id=p_source_id;
$$;

-- NOTE: the original deployed matcher was immediately superseded by two repair migrations after
-- rollback fixtures caught extension schema qualification and UUID ranking issues.

create or replace function public.lr_process_candidate(p_candidate_id uuid) returns public.lr_source_candidates language plpgsql security definer set search_path='' as $$
declare c public.lr_source_candidates%rowtype; errs jsonb; scope_state text; m record;
begin
  select * into c from public.lr_source_candidates where id=p_candidate_id for update; if c.id is null then raise exception 'candidate not found'; end if;
  errs:=public.lr_candidate_validation_errors(c.normalized_payload); scope_state:=public.lr_candidate_scope_status(c.normalized_payload);
  if jsonb_array_length(errs)>0 then update public.lr_source_candidates set validation_status='invalid',validation_errors=errs,scope_status=scope_state,promotion_status='rejected',match_event_id=null,match_confidence=null,match_method=null,updated_at=now() where id=c.id returning * into c; return c; end if;
  if scope_state='out_of_scope' then update public.lr_source_candidates set validation_status='valid',validation_errors='[]'::jsonb,scope_status=scope_state,promotion_status='held',match_event_id=null,match_confidence=null,match_method='new',updated_at=now() where id=c.id returning * into c; return c; end if;
  select * into m from public.lr_match_candidate(c.source_id,c.external_id,c.normalized_payload) limit 1;
  if coalesce(m.ambiguous,false) then
    update public.lr_source_candidates set validation_status='valid',validation_errors='[]'::jsonb,scope_status=scope_state,promotion_status='review_required',match_event_id=m.event_id,match_confidence=m.confidence,match_method='ambiguous',updated_at=now() where id=c.id returning * into c;
    insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details) values('ambiguous_match','medium',m.event_id,c.id,'Candidate match requires review',jsonb_build_object('confidence',m.confidence,'method',m.method)) on conflict do nothing;
    return c;
  end if;
  update public.lr_source_candidates set validation_status='valid',validation_errors='[]'::jsonb,scope_status=scope_state,match_event_id=m.event_id,match_confidence=m.confidence,match_method=m.method,promotion_status='pending',updated_at=now() where id=c.id returning * into c;
  return c;
end;
$$;
revoke all on function public.lr_process_candidate(uuid) from public,anon,authenticated;

create or replace function public.lr_apply_authoritative_candidate(p_candidate_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.lr_source_candidates%rowtype; e public.lr_events%rowtype; patch jsonb:='{}'::jsonb; f text; oldv jsonb; newv jsonb; fields text[]:=array['name','start_date','end_date','county','city','venue_name','course_name','rounds_text','event_type','format','sanctioned','tier','status','registration_status','registration_url','results_url','club_host','td_names'];
begin
  c:=public.lr_process_candidate(p_candidate_id); if c.validation_status<>'valid' or c.scope_status='out_of_scope' or c.promotion_status='review_required' then return c.match_event_id; end if; if c.match_event_id is null then return null; end if;
  select * into e from public.lr_events where id=c.match_event_id for update;
  foreach f in array fields loop
    if c.normalized_payload ? f and public.lr_source_authoritative_for(c.source_id,f) then
      oldv:=public.lr_event_field_value(e.id,f); newv:=c.normalized_payload->f;
      if newv is distinct from oldv then patch:=patch||jsonb_build_object(f,newv); insert into public.lr_event_change_log(event_id,source_id,source_candidate_id,field_name,old_value,new_value,change_type) values(e.id,c.source_id,c.id,f,oldv,newv,case when f in ('start_date','end_date') then 'organizer_confirmed' else 'source_update' end); end if;
    elsif c.normalized_payload ? f and f in ('start_date','end_date') then
      oldv:=public.lr_event_field_value(e.id,f); newv:=c.normalized_payload->f;
      if newv is distinct from oldv then update public.lr_source_candidates set promotion_status='review_required',updated_at=now() where id=c.id; insert into public.lr_review_queue(issue_type,severity,event_id,source_candidate_id,summary,details) values('conflicting_date','high',e.id,c.id,'Lower-authority source conflicts on event date',jsonb_build_object('field',f,'current',oldv,'candidate',newv)); return e.id; end if;
    end if;
  end loop;
  if patch<>'{}'::jsonb then perform public.lr_apply_event_patch(e.id,patch); end if; update public.lr_source_candidates set promotion_status='promoted',updated_at=now() where id=c.id; return e.id;
end;
$$;
revoke all on function public.lr_apply_authoritative_candidate(uuid) from public,anon,authenticated;

create or replace function public.lr_finalize_source_run(p_run_id uuid) returns public.lr_source_runs language plpgsql security definer set search_path='' as $$
declare r public.lr_source_runs%rowtype; prev public.lr_source_runs%rowtype; health text:='healthy'; validation_state text:='ok'; reasons jsonb:='[]'::jsonb; collapse numeric:=null; fail_rate numeric:=0; zero_streak int:=0;
begin
  select * into r from public.lr_source_runs where id=p_run_id for update; if r.id is null then raise exception 'source run not found'; end if;
  select * into prev from public.lr_source_runs where source_id=r.source_id and id<>r.id and health_status in ('healthy','warning') and finished_at is not null order by finished_at desc limit 1;
  if r.fetch_status='failed' or r.parse_status='failed' then health:='unhealthy'; reasons:=reasons||'"fetch_or_parse_failed"'::jsonb; end if;
  if r.parse_status='ok' and r.records_seen=0 and prev.id is not null and prev.records_seen>0 then health:='unhealthy'; reasons:=reasons||'"zero_after_nonzero_baseline"'::jsonb; end if;
  if prev.id is not null and prev.records_seen>0 then collapse:=1-(r.records_seen::numeric/prev.records_seen::numeric); if collapse>0.50 and health<>'unhealthy' then health:='warning'; reasons:=reasons||'"record_count_collapse"'::jsonb; end if; end if;
  if r.records_seen>0 then fail_rate:=r.records_rejected::numeric/r.records_seen::numeric; end if;
  if fail_rate>0.20 then validation_state:='warning'; if health<>'unhealthy' then health:='warning'; end if; reasons:=reasons||'"validation_failure_rate"'::jsonb; end if;
  if r.records_seen>0 and r.records_valid=0 then validation_state:='failed'; health:='unhealthy'; reasons:=reasons||'"no_valid_records"'::jsonb; end if;
  select count(*) into zero_streak from (select records_seen from public.lr_source_runs where source_id=r.source_id and (finished_at is not null or id=r.id) order by coalesce(finished_at,now()) desc limit 2) x where records_seen=0;
  if zero_streak=2 then insert into public.lr_review_queue(issue_type,severity,summary,details) values('source_disappearance','high','Source returned zero records in consecutive runs',jsonb_build_object('source_id',r.source_id,'run_id',r.id)) on conflict do nothing; end if;
  update public.lr_source_runs set finished_at=coalesce(finished_at,now()),validation_status=validation_state,health_status=health,metrics=coalesce(metrics,'{}'::jsonb)||jsonb_build_object('health_reasons',reasons,'baseline_records',prev.records_seen,'collapse_fraction',collapse,'validation_failure_fraction',fail_rate,'scheduler_status',scheduler_status) where id=r.id returning * into r;
  return r;
end;
$$;
revoke all on function public.lr_finalize_source_run(uuid) from public,anon,authenticated;
