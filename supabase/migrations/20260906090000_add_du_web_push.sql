-- D&U Web Push: private signing config + per-device subscriptions.
-- Client roles have no table access; all reads/writes flow through protected Edge Functions.

create table if not exists public.du_push_config (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.du_push_config enable row level security;
revoke all on table public.du_push_config from public, anon, authenticated;
grant all on table public.du_push_config to service_role;

create table if not exists public.du_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz
);

create index if not exists du_push_subscriptions_user_active_idx
  on public.du_push_subscriptions (user_id, created_at desc)
  where disabled_at is null;

alter table public.du_push_subscriptions enable row level security;
revoke all on table public.du_push_subscriptions from public, anon, authenticated;
grant all on table public.du_push_subscriptions to service_role;

comment on table public.du_push_config is 'Service-role-only D&U VAPID signing configuration. Never expose private_key to clients.';
comment on table public.du_push_subscriptions is 'Service-role-only Web Push device subscriptions for authorized D&U admins.';
