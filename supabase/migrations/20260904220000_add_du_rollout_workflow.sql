begin;

alter table public.jobs
  add column if not exists workflow_status text not null default 'draft',
  add column if not exists intake_complete_at timestamptz,
  add column if not exists handoff_ready_at timestamptz,
  add column if not exists handoff_last_error text,
  add column if not exists handoff_retry_count integer not null default 0,
  add column if not exists drive_folder_id text,
  add column if not exists notification_sent_at timestamptz,
  add column if not exists stage_a_started_at timestamptz,
  add column if not exists art_approved_at timestamptz,
  add column if not exists production_ready_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.jobs drop constraint if exists jobs_workflow_status_check;
alter table public.jobs add constraint jobs_workflow_status_check check (
  workflow_status in (
    'draft', 'intake_complete', 'handoff_preparing', 'chatgpt_ready',
    'notification_sent', 'stage_a_started', 'awaiting_art_approval',
    'art_approved', 'production_ready', 'complete', 'handoff_failed'
  )
);

alter table public.jobs drop constraint if exists jobs_handoff_retry_count_check;
alter table public.jobs add constraint jobs_handoff_retry_count_check
  check (handoff_retry_count >= 0);

update public.jobs
set workflow_status = case
  when finished_disc_path is not null then 'complete'
  when final_stencil_path is not null then 'production_ready'
  when latest_draft_path is not null then 'awaiting_art_approval'
  else 'intake_complete'
end,
intake_complete_at = coalesce(intake_complete_at, created_at)
where workflow_status = 'draft';

create index if not exists jobs_workflow_status_created_at_idx
  on public.jobs (workflow_status, created_at desc);

create or replace function public.du_mark_intake_complete()
returns trigger
language plpgsql
security invoker
set search_path = public, stencil_ops, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
  v_source_count integer;
begin
  select * into v_job from public.jobs where id = new.job_id;
  select count(*)::integer into v_source_count from public.job_photos where job_id = new.job_id;
  update public.jobs
  set workflow_status = 'intake_complete',
      intake_complete_at = coalesce(intake_complete_at, now()),
      handoff_last_error = null
  where id = new.job_id;
  insert into stencil_ops.jobs (job_key, status, source_authority, source_count, notes)
  values (
    v_job.job_number,
    'stage_a_open',
    jsonb_build_object('source','site_intake','public_job_id',v_job.id,'subject_type',v_job.subject_type),
    v_source_count,
    'Created automatically when the site intake completed.'
  )
  on conflict (job_key) do update
    set source_count = excluded.source_count,
        source_authority = stencil_ops.jobs.source_authority || excluded.source_authority,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists du_intake_complete_after_checklist on public.production_checklist;
create trigger du_intake_complete_after_checklist
after insert on public.production_checklist
for each row execute function public.du_mark_intake_complete();

create or replace function public.du_set_workflow_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if new.workflow_status is distinct from old.workflow_status then
    case new.workflow_status
      when 'intake_complete' then new.intake_complete_at := coalesce(new.intake_complete_at, now());
      when 'chatgpt_ready' then new.handoff_ready_at := coalesce(new.handoff_ready_at, now());
      when 'notification_sent' then new.notification_sent_at := coalesce(new.notification_sent_at, now());
      when 'stage_a_started' then new.stage_a_started_at := coalesce(new.stage_a_started_at, now());
      when 'art_approved' then new.art_approved_at := coalesce(new.art_approved_at, now());
      when 'production_ready' then new.production_ready_at := coalesce(new.production_ready_at, now());
      when 'complete' then new.completed_at := coalesce(new.completed_at, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists du_jobs_workflow_timestamp on public.jobs;
create trigger du_jobs_workflow_timestamp
before update of workflow_status on public.jobs
for each row execute function public.du_set_workflow_timestamp();

revoke execute on function public.du_set_workflow_timestamp() from public, anon, authenticated;
revoke execute on function public.du_mark_intake_complete() from public, anon, authenticated;

commit;
