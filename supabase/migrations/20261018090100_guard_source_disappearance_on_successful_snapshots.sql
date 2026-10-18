-- Only successfully fetched and parsed consecutive zero-record source snapshots
-- may create disappearance reviews. Preserves function signature, security, and grants.
-- Captured from live function 2026-10-18; no data/review mutations.
CREATE OR REPLACE FUNCTION public.lr_finalize_source_run(p_run_id uuid)
 RETURNS lr_source_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.lr_source_runs%rowtype;
  prev public.lr_source_runs%rowtype;
  health text := 'healthy';
  validation_state text := 'ok';
  reasons jsonb := '[]'::jsonb;
  collapse numeric := null;
  fail_rate numeric := 0;
  zero_streak int := 0;
begin
  select * into r from public.lr_source_runs where id=p_run_id for update;
  if r.id is null then raise exception 'source run not found'; end if;

  select * into prev from public.lr_source_runs
    where source_id=r.source_id and id<>r.id and health_status in ('healthy','warning') and finished_at is not null
    order by finished_at desc limit 1;

  if r.fetch_status='failed' or r.parse_status='failed' then
    health := 'unhealthy';
    validation_state := 'skipped';
    reasons := reasons || '"fetch_or_parse_failed"'::jsonb;
  end if;

  if r.parse_status='ok' and r.records_seen=0 and prev.id is not null and prev.records_seen>0 then
    health := 'unhealthy';
    reasons := reasons || '"zero_after_nonzero_baseline"'::jsonb;
  end if;

  if prev.id is not null and prev.records_seen>0 then
    collapse := 1 - (r.records_seen::numeric / prev.records_seen::numeric);
    if collapse > 0.50 and health <> 'unhealthy' then
      health := 'warning';
      reasons := reasons || '"record_count_collapse"'::jsonb;
    end if;
  end if;

  if r.records_seen>0 then fail_rate := r.records_rejected::numeric/r.records_seen::numeric; end if;
  if fail_rate > 0.20 and validation_state <> 'skipped' then
    validation_state := 'warning';
    if health <> 'unhealthy' then health := 'warning'; end if;
    reasons := reasons || '"validation_failure_rate"'::jsonb;
  end if;

  if r.records_seen>0 and r.records_valid=0 and validation_state <> 'skipped' then
    validation_state := 'failed';
    health := 'unhealthy';
    reasons := reasons || '"no_valid_records"'::jsonb;
  end if;

  -- Only two consecutive successfully fetched/parsed snapshots establish disappearance.
  -- Failed fetches have records_seen=0 but are not observations of source absence.
  -- A delayed/re-finalized older run must not generate a retroactive alert.
  if r.finished_at is null
     and r.fetch_status='ok'
     and r.parse_status='ok'
     and r.records_seen=0
     and not exists (
       select 1 from public.lr_source_runs newer
       where newer.source_id=r.source_id
         and newer.id<>r.id
         and newer.started_at>r.started_at
         and newer.fetch_status='ok'
         and newer.parse_status='ok'
         and newer.finished_at is not null
     )
  then
    select count(*) into zero_streak from (
      select s.records_seen from public.lr_source_runs s
      where s.source_id=r.source_id
        and s.fetch_status='ok'
        and s.parse_status='ok'
        and (s.finished_at is not null or s.id=r.id)
        and (s.started_at<r.started_at or s.id=r.id)
      order by s.started_at desc, s.id desc limit 2
    ) x where records_seen=0;

    if zero_streak=2 then
      insert into public.lr_review_queue(issue_type,severity,summary,details)
      values('source_disappearance','high','Source returned zero records in consecutive runs',jsonb_build_object('source_id',r.source_id,'run_id',r.id))
      on conflict do nothing;
    end if;
  end if;

  update public.lr_source_runs
    set finished_at=coalesce(finished_at,now()), validation_status=validation_state, health_status=health,
        metrics=coalesce(metrics,'{}'::jsonb) || jsonb_build_object(
          'health_reasons',reasons,
          'baseline_records',prev.records_seen,
          'collapse_fraction',collapse,
          'validation_failure_fraction',fail_rate,
          'scheduler_status',scheduler_status
        )
    where id=r.id returning * into r;
  return r;
end;
$function$

