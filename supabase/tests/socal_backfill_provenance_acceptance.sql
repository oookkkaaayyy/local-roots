-- Rollback-only regression for bulk/manual regional backfills.
-- Publication must fail without provenance. A real aggregate source page may
-- support multiple events, while source-scoped external IDs stay unique.
begin;

insert into public.lr_sources(key,name,source_type,access_method,permission_basis,authoritative_fields)
values('qa_backfill_source','QA Backfill Source','regional_calendar','manual fixture','rollback-only fixture',array['name','start_date','end_date','sanctioned']);

insert into public.lr_events(slug,name,start_date,end_date,county,city,course_name,event_type,sanctioned,status,published,confidence,last_verified_at)
values
('qa-backfill-one','QA Backfill One','2026-02-01','2026-02-01','Orange','Huntington Beach','QA Course','tournament',true,'completed',false,0.9,now()),
('qa-backfill-two','QA Backfill Two','2026-02-02','2026-02-02','Orange','Huntington Beach','QA Course','tournament',true,'completed',false,0.9,now());

DO $$ begin
  begin
    update public.lr_events set published=true where slug='qa-backfill-one';
    raise exception 'publication without provenance unexpectedly succeeded';
  exception when others then
    if sqlerrm='publication without provenance unexpectedly succeeded' then raise; end if;
  end;
  if (select published from public.lr_events where slug='qa-backfill-one') then
    raise exception 'failed publication attempt left event published';
  end if;
end $$;

insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,confidence)
select e.id,s.id,'qa:one','https://example.test/calendar/','manual_verification',true,1
from public.lr_events e cross join public.lr_sources s
where e.slug='qa-backfill-one' and s.key='qa_backfill_source';

insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,confidence)
select e.id,s.id,'qa:two','https://example.test/calendar/','manual_verification',true,1
from public.lr_events e cross join public.lr_sources s
where e.slug='qa-backfill-two' and s.key='qa_backfill_source';

DO $$ begin
  begin
    insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,confidence)
    select e.id,s.id,'qa:one','https://example.test/calendar/','manual_verification',true,1
    from public.lr_events e cross join public.lr_sources s
    where e.slug='qa-backfill-two' and s.key='qa_backfill_source';
    raise exception 'duplicate source external ID unexpectedly succeeded';
  exception when unique_violation then null;
  end;
end $$;

update public.lr_events e set published=true
where e.slug in ('qa-backfill-one','qa-backfill-two')
  and exists(select 1 from public.lr_event_sources es where es.event_id=e.id);

DO $$ declare n int; begin
  select count(*) into n from public.lr_events where slug in ('qa-backfill-one','qa-backfill-two') and published;
  if n<>2 then raise exception 'provenance-backed publication failed: %',n; end if;

  select count(*) into n
  from public.lr_event_sources es join public.lr_sources s on s.id=es.source_id
  where s.key='qa_backfill_source' and es.source_url='https://example.test/calendar/';
  if n<>2 then raise exception 'shared aggregate provenance URL did not persist twice: %',n; end if;

  select count(distinct external_id) into n
  from public.lr_event_sources es join public.lr_sources s on s.id=es.source_id
  where s.key='qa_backfill_source';
  if n<>2 then raise exception 'expected two distinct source-scoped external IDs, got %',n; end if;
end $$;

select 'socal_backfill_provenance_acceptance_passed' as result;
rollback;
