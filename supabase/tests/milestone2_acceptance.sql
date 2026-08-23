-- Rollback-only Milestone 2 acceptance/regression suite.
-- Covers scope, dedupe/matching, date authority, source health, and historical candidate-validation regressions.
begin;

insert into public.lr_sources(key,name,source_type,access_method,permission_basis,authoritative_fields)
values
('m2_org','M2 Organizer','organizer_submission','direct','fixture',array['name','start_date','end_date','county','city','course_name','registration_url']),
('m2_low','M2 Low Authority','manual','manual','fixture',array['name']);

insert into public.lr_events(slug,name,start_date,end_date,county,city,course_name,event_type,published,confidence)
values
('m2-canonical','SoCal Classic','2026-10-10','2026-10-10','Orange','Huntington Beach','Huntington Central Park','tournament',false,0.9),
('m2-other-date','SoCal Classic','2026-10-11','2026-10-11','Orange','Huntington Beach','Huntington Central Park','tournament',false,null);

insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,confidence)
select e.id,s.id,'ORG-100','https://example.com/events/100','organizer_confirmed',1
from public.lr_events e, public.lr_sources s where e.slug='m2-canonical' and s.key='m2_org';

-- 9–12 Geography
DO $$ declare st text; begin
 st:=public.lr_candidate_scope_status('{"name":"A","start_date":"2026-10-01","county":"Orange"}'::jsonb); if st<>'in_scope' then raise exception 'active county failed'; end if;
 st:=public.lr_candidate_scope_status('{"name":"A","start_date":"2026-10-01","county":"Santa Barbara"}'::jsonb); if st<>'out_of_scope' then raise exception 'outside scope failed'; end if;
end $$;
update public.lr_scope_profiles set allowed_course_names=array_append(allowed_course_names,'Exception Course') where active;
DO $$ begin if public.lr_candidate_scope_status('{"name":"A","start_date":"2026-10-01","county":"Santa Barbara","course_name":"Exception Course"}'::jsonb)<>'exception' then raise exception 'course exception failed'; end if; end $$;

-- 13–16 Matching / dedupe
DO $$ declare r record; expected uuid; begin
 select id into expected from public.lr_events where slug='m2-canonical';
 select * into r from public.lr_match_candidate((select id from public.lr_sources where key='m2_org'),'ORG-100','{"name":"Different","start_date":"2026-12-31","course_name":"Elsewhere"}'::jsonb);
 if r.event_id<>expected or r.method<>'source_external_id' or r.confidence<>1 then raise exception 'stable ID did not win'; end if;
 select * into r from public.lr_match_candidate((select id from public.lr_sources where key='m2_low'),null,'{"name":"SoCal Classic","start_date":"2026-10-12","course_name":"Huntington Central Park"}'::jsonb);
 if r.event_id is not null or r.method<>'new' then raise exception 'same name different date merged'; end if;
end $$;

DO $$ declare runid uuid; cid uuid; c public.lr_source_candidates%rowtype; begin
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid) values((select id from public.lr_sources where key='m2_low'),'ok','ok','ok',1,1) returning id into runid;
 insert into public.lr_source_candidates(source_run_id,source_id,normalized_payload) values(runid,(select id from public.lr_sources where key='m2_low'),'{"name":"SoCal Classic","start_date":"2026-10-10","end_date":"2026-10-10","county":"Orange","course_name":"Totally Different Mountain Course"}'::jsonb) returning id into cid;
 c:=public.lr_process_candidate(cid); if c.promotion_status<>'review_required' or c.match_method<>'ambiguous' then raise exception 'ambiguous venue not reviewed'; end if;
 insert into public.lr_source_candidates(source_run_id,source_id,normalized_payload) values(runid,(select id from public.lr_sources where key='m2_low'),'{"name":"Outside Event","start_date":"2026-10-10","end_date":"2026-10-10","county":"Santa Barbara","course_name":"Outside Course"}'::jsonb) returning id into cid;
 c:=public.lr_process_candidate(cid); if c.promotion_status<>'held' or c.scope_status<>'out_of_scope' then raise exception 'out of scope not held'; end if;
end $$;

-- 46–47 historical schema corruption cannot pass candidate validation
DO $$ declare errs jsonb; begin
 errs:=public.lr_candidate_validation_errors('{"name":"2","start_date":"2026-10-10","end_date":"2026-10-10","county":"Orange","course_name":"Yes - C-Tier"}'::jsonb);
 if not (errs ? 'numeric_only_name') or not (errs ? 'implausible_course_name') then raise exception 'historical validation regression'; end if;
end $$;

-- 17–19 authoritative date change + audit + multiday preservation
DO $$ declare runid uuid; cid uuid; eid uuid; d1 date; d2 date; n int; begin
 select id into eid from public.lr_events where slug='m2-canonical';
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid) values((select id from public.lr_sources where key='m2_org'),'ok','ok','ok',1,1) returning id into runid;
 insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload) values(runid,(select id from public.lr_sources where key='m2_org'),'ORG-100','https://example.com/events/100','{"name":"SoCal Classic","start_date":"2026-10-17","end_date":"2026-10-18","county":"Orange","city":"Huntington Beach","course_name":"Huntington Central Park","event_type":"tournament"}'::jsonb) returning id into cid;
 perform public.lr_apply_authoritative_candidate(cid);
 select start_date,end_date into d1,d2 from public.lr_events where id=eid;
 select count(*) into n from public.lr_event_change_log where event_id=eid and source_candidate_id=cid and field_name in ('start_date','end_date');
 if d1<>date '2026-10-17' or d2<>date '2026-10-18' or n<>2 then raise exception 'authoritative date change failed'; end if;
end $$;

DO $$ declare runid uuid; cid uuid; eid uuid; before_date date; after_date date; n int; begin
 select id,start_date into eid,before_date from public.lr_events where slug='m2-canonical';
 insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role) values(eid,(select id from public.lr_sources where key='m2_low'),'LOW-100','https://example.com/low/100','discovery');
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid) values((select id from public.lr_sources where key='m2_low'),'ok','ok','ok',1,1) returning id into runid;
 insert into public.lr_source_candidates(source_run_id,source_id,external_id,normalized_payload) values(runid,(select id from public.lr_sources where key='m2_low'),'LOW-100',jsonb_build_object('name','SoCal Classic','start_date',before_date::text,'end_date',(before_date+3)::text,'county','Orange','course_name','Huntington Central Park','event_type','tournament')) returning id into cid;
 perform public.lr_apply_authoritative_candidate(cid);
 select end_date into after_date from public.lr_events where id=eid;
 select count(*) into n from public.lr_review_queue where source_candidate_id=cid and issue_type='conflicting_date';
 if after_date<>date '2026-10-18' or n=0 then raise exception 'lower-authority date conflict overwrote canonical'; end if;
end $$;

-- 20–23, 35–40 source health / last-known-good preservation
DO $$ declare sid uuid; rid uuid; r public.lr_source_runs%rowtype; n int; begin
 select id into sid from public.lr_sources where key='m2_org';
 insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected,health_status,validation_status) values(sid,now()-interval '3 hour',now()-interval '2 hour','ok','ok','ok',10,10,0,'healthy','ok');
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected) values(sid,'ok','ok','ok',0,0,0) returning id into rid;
 r:=public.lr_finalize_source_run(rid); if r.health_status<>'unhealthy' or r.scheduler_status<>'ok' then raise exception 'zero run marked healthy or scheduler conflated'; end if;
 if not exists(select 1 from public.lr_events where slug='m2-canonical') then raise exception 'canonical data wiped'; end if;
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected) values(sid,'ok','ok','ok',0,0,0) returning id into rid;
 perform public.lr_finalize_source_run(rid);
 select count(*) into n from public.lr_review_queue where issue_type='source_disappearance' and details->>'source_id'=sid::text; if n=0 then raise exception 'repeated disappearance not reviewed'; end if;
end $$;

DO $$ declare sid uuid; rid uuid; r public.lr_source_runs%rowtype; begin
 select id into sid from public.lr_sources where key='m2_low';
 insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected,health_status,validation_status) values(sid,now()-interval '3 hour',now()-interval '2 hour','ok','ok','ok',100,100,0,'healthy','ok');
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected) values(sid,'ok','ok','ok',40,40,0) returning id into rid;
 r:=public.lr_finalize_source_run(rid); if r.health_status<>'warning' then raise exception 'count collapse not warned'; end if;
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected) values(sid,'ok','ok','ok',100,70,30) returning id into rid;
 r:=public.lr_finalize_source_run(rid); if r.health_status<>'warning' or r.validation_status<>'warning' then raise exception 'validation spike not warned'; end if;
 insert into public.lr_source_runs(source_id,fetch_status,parse_status,scheduler_status,records_seen,records_valid,records_rejected) values(sid,'ok','ok','ok',10,0,10) returning id into rid;
 r:=public.lr_finalize_source_run(rid); if r.health_status<>'unhealthy' or r.validation_status<>'failed' then raise exception 'all-invalid run not unhealthy'; end if;
end $$;

select 'milestone2_acceptance_passed' as result;
rollback;
