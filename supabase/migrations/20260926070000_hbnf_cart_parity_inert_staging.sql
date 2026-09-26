-- Inert HBNF cart parity staging storage/API. No production state or actuator path.
create schema if not exists hbnf_cart_shadow;
revoke all on schema hbnf_cart_shadow from public, anon, authenticated;
grant usage on schema hbnf_cart_shadow to service_role;

create table if not exists hbnf_cart_shadow.parity_state (
  cart_id text primary key,
  revision bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists hbnf_cart_shadow.parity_fence (
  cart_id text primary key,
  fence_epoch bigint not null default 1,
  release_id text not null default 'parity-staging-only'
);
create table if not exists hbnf_cart_shadow.parity_commands (
  cart_id text not null,
  command_id uuid not null,
  revision bigint not null,
  command_type text not null,
  payload jsonb not null default '{}'::jsonb,
  accepted boolean not null,
  duplicate boolean not null default false,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key(cart_id, command_id)
);
create table if not exists hbnf_cart_shadow.parity_applied (
  cart_id text not null,
  device_id text not null,
  cart_revision bigint not null,
  fence_epoch bigint not null,
  projection jsonb not null,
  adapter_slug text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(cart_id, device_id)
);
create table if not exists hbnf_cart_shadow.test_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  disabled_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

alter table hbnf_cart_shadow.parity_state enable row level security;
alter table hbnf_cart_shadow.parity_fence enable row level security;
alter table hbnf_cart_shadow.parity_commands enable row level security;
alter table hbnf_cart_shadow.parity_applied enable row level security;
alter table hbnf_cart_shadow.test_tokens enable row level security;
revoke all on all tables in schema hbnf_cart_shadow from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema hbnf_cart_shadow to service_role;

create or replace function hbnf_cart_shadow.commit_parity_command(
  p_command_id uuid, p_command_type text, p_expected_revision bigint,
  p_next_state jsonb, p_payload jsonb
) returns table(accepted boolean, duplicate boolean, result_revision bigint, current_revision bigint, current_state jsonb)
language plpgsql security definer
set search_path = pg_catalog, hbnf_cart_shadow
as $function$
declare s hbnf_cart_shadow.parity_state%rowtype; c hbnf_cart_shadow.parity_commands%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'') <> 'service_role'
  then raise exception using errcode='42501',message='service role required'; end if;
  select * into s from hbnf_cart_shadow.parity_state where cart_id='parity-test-cart' for update;
  if not found then raise exception using errcode='P0002',message='parity state missing'; end if;
  select * into c from hbnf_cart_shadow.parity_commands where cart_id=s.cart_id and command_id=p_command_id;
  if found then return query select true,true,c.revision,s.revision,s.state; return; end if;
  if s.revision<>p_expected_revision then raise exception using errcode='40001',message='stale parity revision'; end if;
  update hbnf_cart_shadow.parity_state set revision=s.revision+1,state=p_next_state,updated_at=clock_timestamp()
   where cart_id=s.cart_id returning * into s;
  insert into hbnf_cart_shadow.parity_commands(cart_id,command_id,revision,command_type,payload,accepted,result)
   values(s.cart_id,p_command_id,s.revision,p_command_type,p_payload,true,jsonb_build_object('revision',s.revision));
  return query select true,false,s.revision,s.revision,s.state;
end $function$;

create or replace function public.hbnf_cart_parity_api(p_op text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, hbnf_cart_shadow, public
as $function$
declare x jsonb; s hbnf_cart_shadow.parity_state%rowtype; f hbnf_cart_shadow.parity_fence%rowtype;
        c hbnf_cart_shadow.parity_commands%rowtype; r record;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'') <> 'service_role'
  then raise exception using errcode='42501',message='service role required'; end if;
  if p_op='token' then
    return jsonb_build_object('valid',exists(select 1 from hbnf_cart_shadow.test_tokens
      where token_hash=p_data->>'hash' and disabled_at is null and expires_at>clock_timestamp()));
  elsif p_op='state' then
    select * into s from hbnf_cart_shadow.parity_state where cart_id='parity-test-cart';
    select * into f from hbnf_cart_shadow.parity_fence where cart_id='parity-test-cart';
    return jsonb_build_object('revision',s.revision,'state',s.state,'fenceEpoch',f.fence_epoch,'releaseId',f.release_id);
  elsif p_op='command' then
    select * into r from hbnf_cart_shadow.commit_parity_command((p_data->>'command_id')::uuid,p_data->>'command_type',
      (p_data->>'expected_revision')::bigint,p_data->'next_state',coalesce(p_data->'payload','{}'::jsonb));
    return jsonb_build_object('accepted',r.accepted,'duplicate',r.duplicate,'resultRevision',r.result_revision,
      'currentRevision',r.current_revision,'state',r.current_state);
  elsif p_op='find_command' then
    select * into c from hbnf_cart_shadow.parity_commands where cart_id='parity-test-cart'
      and command_id=(p_data->>'command_id')::uuid;
    return case when found then jsonb_build_object('revision',c.revision) else null end;
  elsif p_op='applied' then
    x:=p_data->'projection';
    insert into hbnf_cart_shadow.parity_applied(cart_id,device_id,cart_revision,fence_epoch,projection,adapter_slug)
      values('parity-test-cart',x->>'deviceId',(x->>'cartRevision')::bigint,(x->>'fenceEpoch')::bigint,x,p_data->>'adapter_slug')
      on conflict(cart_id,device_id) do update set cart_revision=excluded.cart_revision,fence_epoch=excluded.fence_epoch,
        projection=excluded.projection,adapter_slug=excluded.adapter_slug,created_at=clock_timestamp();
    return jsonb_build_object('ok',true);
  elsif p_op='applied_state' then
    return coalesce((select jsonb_agg(jsonb_build_object('deviceId',device_id,'cartRevision',cart_revision,
      'fenceEpoch',fence_epoch,'projection',projection,'adapter',adapter_slug))
      from hbnf_cart_shadow.parity_applied where cart_id='parity-test-cart'),'[]'::jsonb);
  else raise exception using errcode='22023',message='unsupported parity operation';
  end if;
end $function$;
revoke all on function hbnf_cart_shadow.commit_parity_command(uuid,text,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function hbnf_cart_shadow.commit_parity_command(uuid,text,bigint,jsonb,jsonb) to service_role;
revoke all on function public.hbnf_cart_parity_api(text,jsonb) from public, anon, authenticated;
grant execute on function public.hbnf_cart_parity_api(text,jsonb) to service_role;
