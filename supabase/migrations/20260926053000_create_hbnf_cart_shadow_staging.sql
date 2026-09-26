-- Additive, inert HBNF cart shadow staging only. No production readers or actuator fences.
begin;
create schema if not exists hbnf_cart_shadow;
revoke all on schema hbnf_cart_shadow from public, anon, authenticated;
grant usage on schema hbnf_cart_shadow to service_role;

create table hbnf_cart_shadow.operators (
  user_id uuid primary key,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);
create table hbnf_cart_shadow.runs (
  run_id uuid primary key,
  fixture_id text not null check (length(fixture_id) between 1 and 120),
  actor_id uuid not null,
  cart_revision bigint not null check (cart_revision >= 0),
  parity boolean not null,
  mismatch_count integer not null check (mismatch_count >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create table hbnf_cart_shadow.observations (
  run_id uuid not null references hbnf_cart_shadow.runs(run_id) on delete cascade,
  device_id text not null check (device_id in ('matrix','aux')),
  expected_projection jsonb not null check (jsonb_typeof(expected_projection) = 'object'),
  actual_projection jsonb not null check (jsonb_typeof(actual_projection) = 'object'),
  parity boolean not null,
  mismatches jsonb not null check (jsonb_typeof(mismatches) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_id, device_id)
);
alter table hbnf_cart_shadow.operators enable row level security;
alter table hbnf_cart_shadow.runs enable row level security;
alter table hbnf_cart_shadow.observations enable row level security;
revoke all on all tables in schema hbnf_cart_shadow from public, anon, authenticated;
grant select, insert on hbnf_cart_shadow.runs to service_role;
grant select, insert on hbnf_cart_shadow.observations to service_role;
grant select on hbnf_cart_shadow.operators to service_role;
commit;
