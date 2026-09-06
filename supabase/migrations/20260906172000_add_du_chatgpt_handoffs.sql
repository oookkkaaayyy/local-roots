create table if not exists public.du_chatgpt_handoffs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  first_access_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0),
  disabled_at timestamptz
);

create index if not exists du_chatgpt_handoffs_job_id_idx
  on public.du_chatgpt_handoffs(job_id);

create index if not exists du_chatgpt_handoffs_expires_at_idx
  on public.du_chatgpt_handoffs(expires_at);

alter table public.du_chatgpt_handoffs enable row level security;

revoke all on table public.du_chatgpt_handoffs from anon, authenticated;
grant select, insert, update, delete on table public.du_chatgpt_handoffs to service_role;
