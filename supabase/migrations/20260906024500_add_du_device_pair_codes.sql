create table if not exists public.du_device_pair_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists du_device_pair_codes_user_id_idx
  on public.du_device_pair_codes (user_id);
create index if not exists du_device_pair_codes_expires_at_idx
  on public.du_device_pair_codes (expires_at);

alter table public.du_device_pair_codes enable row level security;
revoke all on table public.du_device_pair_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.du_device_pair_codes to service_role;

comment on table public.du_device_pair_codes is
  'Short-lived, single-use D&U admin pairing codes used to transfer an already-authorized Safari admin login into the iPhone Home Screen PWA without sending another auth email.';
