-- Rollback-only Milestone 4 database acceptance test.
begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_submission uuid;
  v_event uuid;
  v_merge_submission uuid;
  v_reject_submission uuid;
begin
  insert into auth.users(id,is_sso_user,is_anonymous,created_at,updated_at)
  values(v_admin,false,false,now(),now());
  insert into public.lr_admin_users(user_id,display_name,role)
  values(v_admin,'Milestone 4 fixture','admin');

  v_submission := public.lr_ingest_event_submission(jsonb_build_object(
    'name','Milestone 4 Test Open','start_date','2026-11-07','county','Orange County','city','Huntington Beach',
    'course_name','Huntington Beach Disc Golf Course','event_type','tournament','registration_url','https://example.com/m4-open',
    'submitter_name','Fixture Organizer','submitter_email','fixture@example.com'
  ));
  if not exists(select 1 from public.lr_event_submissions where id=v_submission and status='pending' and validation_status='valid' and scope_status='in_scope' and candidate_id is not null) then raise exception 'valid submission ingestion failed'; end if;
  if not exists(select 1 from public.lr_review_queue rq join public.lr_event_submissions s on s.candidate_id=rq.source_candidate_id where s.id=v_submission and rq.status='open') then raise exception 'submission review queue generation failed'; end if;

  v_event := public.lr_decide_event_submission(v_submission,'approve_new',null,v_admin,'fixture approval');
  if v_event is null or not exists(select 1 from public.lr_events where id=v_event and published) then raise exception 'approve_new did not publish event'; end if;
  if not exists(select 1 from public.lr_event_sources where event_id=v_event and external_id='submission:'||v_submission::text) then raise exception 'approved event missing submission provenance'; end if;

  v_merge_submission := public.lr_ingest_event_submission(jsonb_build_object(
    'name','Milestone 4 Test Open','start_date','2026-11-07','county','Orange','city','Huntington Beach',
    'course_name','Huntington Beach Disc Golf Course','event_type','tournament','registration_url','https://example.com/m4-open-2'
  ));
  perform public.lr_decide_event_submission(v_merge_submission,'merge',v_event,v_admin,'fixture merge');
  if not exists(select 1 from public.lr_event_submissions where id=v_merge_submission and status='merged' and matched_event_id=v_event) then raise exception 'merge decision failed'; end if;

  v_reject_submission := public.lr_ingest_event_submission(jsonb_build_object('name','Milestone 4 Reject Test','start_date','2026-11-08','county','Orange','city','Anaheim','event_type','other'));
  perform public.lr_decide_event_submission(v_reject_submission,'reject',null,v_admin,'fixture rejection');
  if not exists(select 1 from public.lr_event_submissions where id=v_reject_submission and status='rejected') then raise exception 'reject decision failed'; end if;

  v_submission := public.lr_ingest_event_submission(jsonb_build_object('name','Out of Scope Test','start_date','2026-11-09','county','Santa Barbara','city','Santa Barbara','event_type','tournament'));
  if not exists(select 1 from public.lr_event_submissions where id=v_submission and scope_status='out_of_scope') then raise exception 'out-of-scope submission not held'; end if;
end $$;

rollback;
select 'milestone4_database_acceptance_passed' as result;
