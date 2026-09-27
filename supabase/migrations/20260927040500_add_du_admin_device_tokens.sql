create table if not exists public.du_admin_device_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.du_admin_device_tokens enable row level security;

revoke all on table public.du_admin_device_tokens from anon, authenticated;
grant all on table public.du_admin_device_tokens to service_role;

create index if not exists idx_du_admin_device_tokens_user_id
  on public.du_admin_device_tokens(user_id);

create index if not exists idx_du_admin_device_tokens_active_expiry
  on public.du_admin_device_tokens(expires_at)
  where revoked_at is null;
