-- Isolated test-only legacy contract; not a production baseline schema.
-- The tracked migration history starts after these D&U tables existed.
create extension if not exists pgcrypto;
create table public.lr_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text, role text not null default 'admin' check (role in ('admin','reviewer')),
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lr_admin_users enable row level security;
revoke all on public.lr_admin_users from anon, authenticated;
grant all on public.lr_admin_users to service_role;
create table public.jobs (
  id uuid primary key default gen_random_uuid(), job_number text not null unique,
  client_name text, phone text, email text, subject_name text, subject_type text,
  disc_brand text, disc_model text, disc_details text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  workflow_status text not null default 'intake_complete', handoff_ready_at timestamptz,
  handoff_last_error text, handoff_retry_count integer not null default 0, drive_folder_id text,
  notification_sent_at timestamptz, stage_a_started_at timestamptz, art_approved_at timestamptz,
  production_ready_at timestamptz, completed_at timestamptz, latest_draft_path text,
  final_stencil_path text, finished_disc_path text
);
alter table public.jobs enable row level security;
grant all on public.jobs to service_role;
create table public.job_photos (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
  storage_bucket text not null default 'du-intake', storage_path text not null,
  content_type text, sort_order integer not null default 0, created_at timestamptz not null default now()
);
alter table public.job_photos enable row level security;
grant all on public.job_photos to service_role;
create table public.draft_options (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
  option_code text not null
);
alter table public.draft_options enable row level security;
grant all on public.draft_options to service_role;
create table public.production_checklist (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id) on delete cascade
);
alter table public.production_checklist enable row level security;
grant all on public.production_checklist to service_role;
insert into storage.buckets (id, name, public) values ('du-intake', 'du-intake', false) on conflict (id) do nothing;
