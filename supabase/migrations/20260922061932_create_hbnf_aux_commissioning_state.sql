create table if not exists public.hbnf_aux_commissioning_state (
  id smallint primary key default 1 check (id = 1),
  hardware_wired boolean not null default false,
  power_verified boolean not null default false,
  gpio_verified boolean not null default false,
  current_limit_verified boolean not null default false,
  segments_verified boolean not null default false,
  audio_input_verified boolean not null default false,
  udp_sync_verified boolean not null default false,
  underglow_sync_verified boolean not null default false,
  uv_main_verified boolean not null default false,
  uv_short_verified boolean not null default false,
  uv_full_verified boolean not null default false,
  thermal_verified boolean not null default false,
  mixed_load_verified boolean not null default false,
  aux_enabled boolean not null default false,
  accepted_at timestamptz null,
  notes text null,
  updated_at timestamptz not null default now()
);

alter table public.hbnf_aux_commissioning_state enable row level security;

insert into public.hbnf_aux_commissioning_state (id)
values (1)
on conflict (id) do nothing;

comment on table public.hbnf_aux_commissioning_state is
'HBNF cart aux physical commissioning gate. Defaults closed; service-role backend only. Do not enable aux until physical acceptance.';
