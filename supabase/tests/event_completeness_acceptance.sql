-- Rollback-only regression for the event completeness system.
-- 1) a sparse event scores below a fully attested one, 2) lr_apply_event_facts fills only NULL fields,
-- 3) a differing source value is recorded as a conflict and never overwrites, 4) not_announced with a
-- source URL satisfies a required group, 5) fee amount/currency/unit are written together.
begin;
insert into public.lr_sources(key,name,source_type,access_method,permission_basis,authoritative_fields)
values('qa_completeness_source','QA Completeness Source','club','manual fixture','rollback-only fixture',array['name','start_date','city','format']);
insert into public.lr_events(slug,name,start_date,end_date,county,city,course_name,event_type,status,published,confidence,last_verified_at,timezone)
values('qa-completeness-one','QA Completeness One',current_date+5,current_date+5,'Orange','Huntington Beach','QA Course','league','upcoming',false,0.9,now(),'America/Los_Angeles');
do $$
declare eid uuid; r jsonb; s1 numeric; s2 numeric; ev_conflicts int; fee numeric;
begin
  select id into eid from public.lr_events where slug='qa-completeness-one';
  select completeness_score into s1 from public.lr_event_completeness where event_id=eid;
  r := public.lr_apply_event_facts(array[eid],'qa_completeness_source','https://example.org/qa',
    '{"format":"Doubles","start_time_local":"18:00","city":"Irvine","entry_fee_amount":10,
      "club_host":{"status":"not_announced","note":"qa"},"official_url":"https://example.org/qa"}'::jsonb,'qa');
  if (r->>'filled')::int < 3 then raise exception 'expected NULL fields to be filled: %', r; end if;
  if (select city from public.lr_events where id=eid) <> 'Huntington Beach' then raise exception 'existing city was overwritten'; end if;
  select count(*) into ev_conflicts from public.lr_event_field_evidence where event_id=eid and field_name='city' and status='conflicting';
  if ev_conflicts <> 1 then raise exception 'differing city should be recorded as one conflict, got %', ev_conflicts; end if;
  select entry_fee_amount into fee from public.lr_events where id=eid;
  if fee <> 10 or (select entry_fee_currency from public.lr_events where id=eid) is null then raise exception 'fee trio not written together'; end if;
  select completeness_score into s2 from public.lr_event_completeness where event_id=eid;
  if not s2 > s1 then raise exception 'score did not improve: % -> %', s1, s2; end if;
  if 'host' = any((select missing_required from public.lr_event_completeness where event_id=eid)) then raise exception 'not_announced with source URL should satisfy host group'; end if;
end $$;
rollback;
