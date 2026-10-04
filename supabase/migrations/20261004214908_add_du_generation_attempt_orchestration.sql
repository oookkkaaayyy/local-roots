-- Private, append-oriented records for manual ChatGPT generation orchestration.
-- No client-facing policies are created; the authenticated du-admin Edge Function
-- is the only writer/reader for these records.
create table if not exists public.du_generation_packages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  composition_photo_id uuid not null,
  locked_prompt text not null check (length(locked_prompt) between 20 and 12000),
  prompt_sha256 text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  source_manifest jsonb not null,
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.du_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.du_generation_packages(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  status text not null default 'ready' check (status in ('ready','failed','candidate','rejected','selected')),
  failure_note text check (failure_note is null or length(failure_note) between 5 and 1000),
  candidate_path text,
  candidate_sha256 text check (candidate_sha256 is null or candidate_sha256 ~ '^[0-9a-f]{64}$'),
  candidate_metadata jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, attempt_number),
  unique(id, job_id),
  check ((candidate_path is null) = (candidate_sha256 is null))
);

create table if not exists public.du_generation_selections (
  job_id uuid primary key references public.jobs(id) on delete restrict,
  attempt_id uuid not null unique,
  candidate_path text not null,
  candidate_sha256 text not null check (candidate_sha256 ~ '^[0-9a-f]{64}$'),
  selected_by uuid not null,
  selected_at timestamptz not null default now(),
  foreign key (attempt_id, job_id) references public.du_generation_attempts(id, job_id) on delete restrict
);

create table if not exists public.du_generation_corrections (
  job_id uuid primary key references public.jobs(id) on delete restrict,
  base_attempt_id uuid not null,
  base_candidate_path text not null,
  base_candidate_sha256 text not null check (base_candidate_sha256 ~ '^[0-9a-f]{64}$'),
  correction_prompt text not null check (length(correction_prompt) between 20 and 2000),
  correction_prompt_sha256 text not null check (correction_prompt_sha256 ~ '^[0-9a-f]{64}$'),
  corrected_path text,
  corrected_sha256 text check (corrected_sha256 is null or corrected_sha256 ~ '^[0-9a-f]{64}$'),
  corrected_metadata jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check ((corrected_path is null) = (corrected_sha256 is null)),
  foreign key (base_attempt_id, job_id) references public.du_generation_attempts(id, job_id) on delete restrict
);

create table if not exists public.du_generation_final_masters (
  job_id uuid primary key references public.jobs(id) on delete restrict,
  master_kind text not null check (master_kind in ('attempt','correction')),
  attempt_id uuid,
  master_path text not null,
  master_sha256 text not null check (master_sha256 ~ '^[0-9a-f]{64}$'),
  selected_by uuid not null,
  selected_at timestamptz not null default now(),
  foreign key (attempt_id, job_id) references public.du_generation_attempts(id, job_id) on delete restrict,
  check ((master_kind = 'attempt' and attempt_id is not null) or (master_kind = 'correction' and attempt_id is null))
);

create table if not exists public.du_generation_production_runs (
  job_id uuid primary key references public.jobs(id) on delete restrict,
  input_master_path text not null,
  input_master_sha256 text not null check (input_master_sha256 ~ '^[0-9a-f]{64}$'),
  output_path text not null,
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  artwork_width_mm numeric not null check (artwork_width_mm = 190.5),
  validator_report jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.du_generation_packages enable row level security;
alter table public.du_generation_attempts enable row level security;
alter table public.du_generation_selections enable row level security;
alter table public.du_generation_corrections enable row level security;
alter table public.du_generation_final_masters enable row level security;
alter table public.du_generation_production_runs enable row level security;

create or replace function public.du_generation_guard_immutable_rows()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name in ('du_generation_packages','du_generation_selections','du_generation_final_masters','du_generation_production_runs') then
    raise exception '% rows are immutable', tg_table_name;
  end if;
  if tg_op = 'DELETE' then raise exception '% rows cannot be deleted', tg_table_name; end if;
  if tg_table_name = 'du_generation_attempts' then
    if (new.id, new.package_id, new.job_id, new.attempt_number, new.created_by, new.created_at)
       is distinct from
       (old.id, old.package_id, old.job_id, old.attempt_number, old.created_by, old.created_at) then
      raise exception 'attempt identity is immutable';
    end if;
    if old.status = 'ready' and new.status = 'failed' then
      if (new.candidate_path,new.candidate_sha256,new.candidate_metadata) is distinct from (old.candidate_path,old.candidate_sha256,old.candidate_metadata) or
         old.failure_note is not null or new.failure_note is null then
        raise exception 'failed attempt cannot carry a candidate';
      end if;
    elsif old.status = 'ready' and new.status = 'candidate' then
      if old.candidate_path is not null or old.candidate_sha256 is not null or new.candidate_path is null or new.candidate_sha256 is null or new.candidate_metadata is null or new.failure_note is not null then
        raise exception 'candidate can be attached once to an empty attempt';
      end if;
    elsif old.status = 'candidate' and new.status in ('rejected','selected') then
      if (new.candidate_path,new.candidate_sha256,new.candidate_metadata) is distinct from (old.candidate_path,old.candidate_sha256,old.candidate_metadata) or
         (new.status = 'rejected' and (old.failure_note is not null or new.failure_note is null)) or
         (new.status = 'selected' and new.failure_note is distinct from old.failure_note) then
        raise exception 'attempt candidate is immutable';
      end if;
    else
      raise exception 'invalid attempt status transition';
    end if;
  elsif tg_table_name = 'du_generation_corrections' then
    if (new.job_id, new.base_attempt_id, new.base_candidate_path, new.base_candidate_sha256,
        new.correction_prompt, new.correction_prompt_sha256, new.created_by, new.created_at)
       is distinct from
       (old.job_id, old.base_attempt_id, old.base_candidate_path, old.base_candidate_sha256,
        old.correction_prompt, old.correction_prompt_sha256, old.created_by, old.created_at) then
      raise exception 'correction base and prompt are immutable';
    end if;
    if old.corrected_path is not null or new.corrected_path is null or new.corrected_sha256 is null then
      raise exception 'correction candidate can be uploaded once';
    end if;
  end if;
  return new;
end $$;

create trigger du_generation_packages_immutable before update or delete on public.du_generation_packages
for each row execute function public.du_generation_guard_immutable_rows();
create trigger du_generation_selections_immutable before update or delete on public.du_generation_selections
for each row execute function public.du_generation_guard_immutable_rows();
create trigger du_generation_final_masters_immutable before update or delete on public.du_generation_final_masters
for each row execute function public.du_generation_guard_immutable_rows();
create trigger du_generation_production_runs_immutable before update or delete on public.du_generation_production_runs
for each row execute function public.du_generation_guard_immutable_rows();
create trigger du_generation_attempts_guard before update or delete on public.du_generation_attempts
for each row execute function public.du_generation_guard_immutable_rows();
create trigger du_generation_corrections_guard before update or delete on public.du_generation_corrections
for each row execute function public.du_generation_guard_immutable_rows();

revoke all on public.du_generation_packages, public.du_generation_attempts,
  public.du_generation_selections, public.du_generation_corrections,
  public.du_generation_final_masters, public.du_generation_production_runs from anon, authenticated;
grant all on public.du_generation_packages, public.du_generation_attempts,
  public.du_generation_selections, public.du_generation_corrections,
  public.du_generation_final_masters, public.du_generation_production_runs to service_role;
