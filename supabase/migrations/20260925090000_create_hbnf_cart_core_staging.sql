-- HBNF cart core staging schema. Apply only to a dedicated staging branch/project.
-- No production application is part of this migration.
begin;

create schema if not exists hbnf_internal;
revoke all on schema hbnf_internal from public, anon, authenticated;
grant usage on schema hbnf_internal to service_role;

create table hbnf_internal.cart_desired_state (
  cart_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default clock_timestamp()
);

create table hbnf_internal.cart_device_observed (
  cart_id text not null references hbnf_internal.cart_desired_state(cart_id) on delete cascade,
  device_id text not null check (device_id in ('matrix','aux')),
  online boolean not null,
  status text not null check (status in ('online','offline','off','failed','stale')),
  desired_revision bigint not null check (desired_revision >= 0),
  fence_epoch bigint not null check (fence_epoch >= 0),
  release_id text not null,
  boot_id text,
  reported jsonb not null default '{}'::jsonb check (jsonb_typeof(reported) = 'object'),
  observed_at timestamptz not null default clock_timestamp(),
  primary key (cart_id, device_id)
);

create table hbnf_internal.cart_command_receipts (
  cart_id text not null,
  command_id uuid not null,
  revision bigint not null check (revision > 0),
  command_type text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (cart_id, command_id),
  foreign key (cart_id) references hbnf_internal.cart_desired_state(cart_id) on delete cascade
);

create table hbnf_internal.cart_actuator_fence (
  cart_id text primary key,
  epoch bigint not null default 1 check (epoch > 0),
  release_id text not null,
  active boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table hbnf_internal.cart_operator_allowlist (
  user_id uuid primary key,
  active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);

alter table hbnf_internal.cart_desired_state enable row level security;
alter table hbnf_internal.cart_device_observed enable row level security;
alter table hbnf_internal.cart_command_receipts enable row level security;
alter table hbnf_internal.cart_actuator_fence enable row level security;
alter table hbnf_internal.cart_operator_allowlist enable row level security;
revoke all on all tables in schema hbnf_internal from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema hbnf_internal to service_role;

create or replace function hbnf_internal.hbnf_cart_commit_command(
  p_cart_id text,
  p_command_id uuid,
  p_command_type text,
  p_expected_revision bigint,
  p_next_state jsonb
) returns table(accepted boolean, duplicate boolean, result_revision bigint, current_state jsonb)
language plpgsql security definer set search_path = pg_catalog, hbnf_internal, auth
as $$
declare
  v_revision bigint;
  v_state jsonb;
  v_receipt hbnf_internal.cart_command_receipts%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode='42501', message='service role required';
  end if;
  if p_cart_id is null or length(trim(p_cart_id)) not between 1 and 128
     or p_command_type is null or length(trim(p_command_type)) not between 1 and 48
     or jsonb_typeof(p_next_state) <> 'object' then
    raise exception using errcode='22023', message='invalid cart command';
  end if;
  insert into hbnf_internal.cart_desired_state(cart_id,state) values (p_cart_id,p_next_state)
    on conflict (cart_id) do nothing;
  select revision,state into v_revision,v_state from hbnf_internal.cart_desired_state
    where cart_id=p_cart_id for update;
  select * into v_receipt from hbnf_internal.cart_command_receipts
    where cart_id=p_cart_id and command_id=p_command_id;
  if found then
    return query select true,true,v_receipt.revision,v_state;
    return;
  end if;
  if p_expected_revision <> v_revision then
    raise exception using errcode='40001', message='stale cart revision';
  end if;
  v_revision := v_revision + 1;
  update hbnf_internal.cart_desired_state set revision=v_revision,state=p_next_state,updated_at=clock_timestamp()
    where cart_id=p_cart_id;
  insert into hbnf_internal.cart_command_receipts(cart_id,command_id,revision,command_type)
    values(p_cart_id,p_command_id,v_revision,p_command_type);
  return query select true,false,v_revision,p_next_state;
end;
$$;

revoke all on function hbnf_internal.hbnf_cart_commit_command(text,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function hbnf_internal.hbnf_cart_commit_command(text,uuid,text,bigint,jsonb) to service_role;
commit;
