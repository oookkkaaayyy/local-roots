-- Local Roots Events — Milestone 1 acceptance/regression tests
-- Safe to run against production: all fixture data is rolled back.

begin;

do $$
begin
  begin
    perform 'August 2026'::uuid;
    raise exception 'M1-01 FAIL: month name was accepted as canonical UUID';
  exception
    when invalid_text_representation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type)
    values ('m1-invalid-numeric-name','2',date '2026-09-01',date '2026-09-01','Orange','Huntington Beach','Huntington Beach Central Park','tournament');
    raise exception 'M1-02 FAIL: numeric-only event name was accepted';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type)
    values ('m1-invalid-course','Schema Corruption Fixture',date '2026-09-02',date '2026-09-02','Orange','Huntington Beach','Yes - C-Tier','tournament');
    raise exception 'M1-03 FAIL: sanction/tier string was accepted as course name';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type)
    values ('m1-invalid-date-order','Invalid Date Order',date '2026-09-03',date '2026-09-02','Orange','Huntington Beach','Huntington Beach Central Park','tournament');
    raise exception 'M1-04 FAIL: end_date before start_date was accepted';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type,registration_url)
    values ('m1-invalid-url','Invalid URL',date '2026-09-04',date '2026-09-04','Orange','Huntington Beach','Huntington Beach Central Park','tournament','javascript:alert(1)');
    raise exception 'M1-05 FAIL: invalid registration URL was accepted';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type,published,last_verified_at)
    values ('m1-no-provenance','No Provenance',date '2026-09-05',date '2026-09-05','Orange','Huntington Beach','Huntington Beach Central Park','tournament',true,now());
    raise exception 'M1-06 FAIL: published event without provenance was accepted';
  exception when check_violation then null;
  end;
end
$$;

insert into public.lr_sources (key,name,source_type,base_url,access_method,permission_basis,enabled)
values ('m1_test_source','Milestone 1 Test Source','manual','https://example.com','test fixture','transactional regression fixture',true);

insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type,sanctioned,published,last_verified_at)
values ('m1-sanction-basis','Sanction Basis Test',date '2026-09-06',date '2026-09-06','Orange','Huntington Beach','Huntington Beach Central Park','tournament',true,false,now());

insert into public.lr_event_sources (event_id,source_id,external_id,source_url,source_role,is_sanction_basis)
select e.id,s.id,'m1-sanction-basis','https://example.com/m1-sanction-basis','manual_verification',false
from public.lr_events e cross join public.lr_sources s
where e.slug='m1-sanction-basis' and s.key='m1_test_source';

do $$
begin
  begin
    update public.lr_events set published=true where slug='m1-sanction-basis';
    raise exception 'M1-07 FAIL: sanctioned published event without sanction-basis source was accepted';
  exception when check_violation then null;
  end;
end
$$;

update public.lr_event_sources es set is_sanction_basis=true
from public.lr_events e, public.lr_sources s
where es.event_id=e.id and es.source_id=s.id and e.slug='m1-sanction-basis' and s.key='m1_test_source';

update public.lr_events set published=true where slug='m1-sanction-basis';

do $$
begin
  if not exists (select 1 from public.lr_events where slug='m1-sanction-basis' and published) then
    raise exception 'M1-07 FAIL: valid sanction-basis provenance did not permit publication';
  end if;
end
$$;

insert into public.lr_source_runs (source_id,fetch_status,parse_status,validation_status,health_status,records_seen)
select id,'ok','ok','ok','healthy',1 from public.lr_sources where key='m1_test_source';

do $$
declare v_run_id uuid; v_source_id uuid;
begin
  select sr.id,sr.source_id into v_run_id,v_source_id
  from public.lr_source_runs sr join public.lr_sources s on s.id=sr.source_id
  where s.key='m1_test_source' order by sr.started_at desc limit 1;
  begin
    insert into public.lr_source_candidates (source_run_id,source_id,external_id,source_url,normalized_payload,validation_status,match_confidence,promotion_status)
    values (v_run_id,v_source_id,'m1-array-candidate','https://example.com/array','[]'::jsonb,'invalid',0.10,'rejected');
    raise exception 'M1-08 FAIL: positional JSON array candidate was accepted';
  exception when check_violation then null;
  end;
end
$$;

insert into public.lr_source_candidates (source_run_id,source_id,external_id,source_url,normalized_payload,validation_status,match_confidence,promotion_status)
select sr.id,s.id,'m1-low-confidence','https://example.com/low-confidence',jsonb_build_object('name','Low Confidence Candidate','start_date','2026-09-07','county','Orange'),'warning',0.20,'review_required'
from public.lr_source_runs sr join public.lr_sources s on s.id=sr.source_id
where s.key='m1_test_source' order by sr.started_at desc limit 1;

do $$
begin
  if exists (select 1 from public.lr_public_events() where name='Low Confidence Candidate') then
    raise exception 'M1-41 FAIL: low-confidence candidate appeared in public API';
  end if;
end
$$;

insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type,registration_url,last_verified_at)
values ('m1-override-precedence','Override Precedence Test',date '2026-10-01',date '2026-10-10','Los Angeles','Pasadena','Oak Grove','tournament','https://example.com/original-registration',now());

select public.lr_set_manual_override((select id from public.lr_events where slug='m1-override-precedence'),'start_date',to_jsonb('2026-10-02'::text),'M1-24 date override fixture');
select public.lr_set_manual_override((select id from public.lr_events where slug='m1-override-precedence'),'registration_url',to_jsonb('https://example.com/manual-registration'::text),'M1-25 URL override fixture');
select public.lr_apply_event_patch((select id from public.lr_events where slug='m1-override-precedence'),jsonb_build_object('start_date','2026-10-03','registration_url','https://example.com/source-registration','city','Long Beach','last_verified_at',now()));

do $$
declare e public.lr_events%rowtype;
begin
  select * into e from public.lr_events where slug='m1-override-precedence';
  if e.start_date<>date '2026-10-02' then raise exception 'M1-24 FAIL: active manual date override did not survive source patch'; end if;
  if e.registration_url<>'https://example.com/manual-registration' then raise exception 'M1-25 FAIL: active manual registration URL override did not survive source patch'; end if;
  if e.city<>'Long Beach' then raise exception 'M1-27 FAIL: non-overridden field did not update'; end if;
end
$$;

select public.lr_release_manual_override((select id from public.lr_events where slug='m1-override-precedence'),'start_date');
select public.lr_release_manual_override((select id from public.lr_events where slug='m1-override-precedence'),'registration_url');
select public.lr_apply_event_patch((select id from public.lr_events where slug='m1-override-precedence'),jsonb_build_object('start_date','2026-10-03','registration_url','https://example.com/source-registration'));

do $$
declare e public.lr_events%rowtype;
begin
  select * into e from public.lr_events where slug='m1-override-precedence';
  if e.start_date<>date '2026-10-03' or e.registration_url<>'https://example.com/source-registration' then
    raise exception 'M1-26 FAIL: released override did not allow source control to resume';
  end if;
end
$$;

insert into public.lr_events (slug,name,start_date,end_date,county,city,course_name,event_type,published,last_verified_at,internal_notes,confidence)
values ('m1-unpublished-hidden','Unpublished Hidden Event',date '2026-11-01',date '2026-11-01','San Diego','San Diego','Morley Field','tournament',false,now(),'ADMIN ONLY',0.10);

do $$
begin
  if exists (select 1 from public.lr_public_events() where slug='m1-unpublished-hidden') then
    raise exception 'M1-44 FAIL: unpublished canonical event appeared in public API';
  end if;
end
$$;

do $$
declare v_signature text;
begin
  select pg_get_function_result('public.lr_public_events()'::regprocedure) into v_signature;
  if position('internal_notes' in v_signature)>0 or position('confidence' in v_signature)>0 or position('source_payload' in v_signature)>0 or position('review' in v_signature)>0 then
    raise exception 'M1-45 FAIL: admin/internal fields are present in public API signature: %',v_signature;
  end if;
  if has_column_privilege('anon','public.lr_events','internal_notes','SELECT') or has_column_privilege('anon','public.lr_events','confidence','SELECT') then
    raise exception 'M1-45 FAIL: anon can read internal Local Roots event columns';
  end if;
  if has_table_privilege('anon','public.lr_manual_overrides','SELECT') or has_table_privilege('anon','public.lr_source_candidates','SELECT') or has_table_privilege('anon','public.lr_review_queue','SELECT') then
    raise exception 'M1-45 FAIL: anon can read admin-only Local Roots tables';
  end if;
  if not has_function_privilege('anon','public.lr_public_events()','EXECUTE') then
    raise exception 'M1-45 FAIL: anon cannot execute restricted public event API';
  end if;
end
$$;

rollback;
