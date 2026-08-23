-- Repair caught by rollback-only Milestone 2 fixtures: pg_trgm is installed in extensions schema.
-- This migration is superseded by 20260823011902_fix_milestone2_uuid_ranking.sql, which retains the qualification.

create or replace function public.lr_match_candidate(
  p_source_id uuid,
  p_external_id text,
  p_payload jsonb
)
returns table(event_id uuid, confidence numeric, method text, ambiguous boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  strong_id uuid; url_id uuid; top_id uuid; top_score numeric; second_score numeric;
  top_venue text; payload_venue text; payload_date date;
begin
  if nullif(btrim(p_external_id),'') is not null then
    select es.event_id into strong_id from public.lr_event_sources es where es.source_id=p_source_id and es.external_id=p_external_id order by es.last_seen_at desc limit 1;
    if strong_id is not null then return query select strong_id,1.0::numeric,'source_external_id'::text,false; return; end if;
  end if;
  if nullif(btrim(p_payload->>'registration_url'),'') is not null then
    select e.id into url_id from public.lr_events e where lower(e.registration_url)=lower(p_payload->>'registration_url') limit 1;
    if url_id is not null then return query select url_id,0.98::numeric,'registration_url'::text,false; return; end if;
  end if;
  begin payload_date:=(p_payload->>'start_date')::date; exception when others then payload_date:=null; end;
  if payload_date is null or public.lr_normalize_match_text(p_payload->>'name') is null then return query select null::uuid,0::numeric,'new'::text,false; return; end if;
  with scored as (
    select e.id,e.course_name,greatest(extensions.similarity(public.lr_normalize_match_text(e.name),public.lr_normalize_match_text(p_payload->>'name')),0)::numeric score
    from public.lr_events e where e.start_date=payload_date and extensions.similarity(public.lr_normalize_match_text(e.name),public.lr_normalize_match_text(p_payload->>'name'))>=0.55
    order by score desc,e.id limit 2
  )
  select max(id) filter(where rn=1),max(score) filter(where rn=1),max(score) filter(where rn=2),max(course_name) filter(where rn=1)
  into top_id,top_score,second_score,top_venue from (select *,row_number() over(order by score desc,id) rn from scored)s;
  if top_id is null then return query select null::uuid,0::numeric,'new'::text,false; return; end if;
  payload_venue:=p_payload->>'course_name';
  if top_score>=0.85 then
    if nullif(btrim(payload_venue),'') is not null and nullif(btrim(top_venue),'') is not null and extensions.similarity(public.lr_normalize_match_text(payload_venue),public.lr_normalize_match_text(top_venue))<0.45 then return query select top_id,top_score,'ambiguous'::text,true; return; end if;
    if second_score is not null and (top_score-second_score)<0.12 then return query select top_id,top_score,'ambiguous'::text,true; return; end if;
    return query select top_id,least(0.95::numeric,top_score),'fuzzy'::text,false; return;
  end if;
  return query select top_id,top_score,'ambiguous'::text,true;
end;
$$;
