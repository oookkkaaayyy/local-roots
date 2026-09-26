\set ON_ERROR_STOP on
begin;

create temporary table _hbnf_cutover_input on commit drop as
select :'initial_state_json'::jsonb as state_json,
       :'matrix_brightness'::integer as matrix_brightness,
       :'aux_brightness'::integer as aux_brightness,
       :'operator_user_id'::uuid as operator_user_id,
       :'release_id'::text as release_id,
       :'release_artifact_id'::text as release_artifact_id,
       :'release_sha256'::text as release_sha256,
       :'matrix_sha256'::text as matrix_sha256,
       :'aux_sha256'::text as aux_sha256;

insert into hbnf_internal.cart_desired_state(cart_id, revision, state)
select 'hbnf-cart', 0, state_json from _hbnf_cutover_input
on conflict (cart_id) do nothing;

insert into hbnf_internal.cart_operator_allowlist(user_id, active)
select operator_user_id, true from _hbnf_cutover_input
on conflict (user_id) do nothing;

insert into hbnf_internal.cart_cutover_readiness(
  cart_id, release_id, release_artifact_id, release_sha256,
  matrix_firmware_sha256, aux_firmware_sha256
)
select 'hbnf-cart', release_id, release_artifact_id, release_sha256, matrix_sha256, aux_sha256
from _hbnf_cutover_input
on conflict (cart_id, release_id) do nothing;

do $check$
declare
  i record;
  stored_state jsonb;
  stored_revision bigint;
  fence hbnf_internal.cart_actuator_fence%rowtype;
  readiness hbnf_internal.cart_cutover_readiness%rowtype;
  allowlisted boolean;
begin
  select * into i from _hbnf_cutover_input;
  if jsonb_typeof(i.state_json) <> 'object'
     or i.state_json->>'cartId' <> 'hbnf-cart'
     or coalesce((i.state_json->>'revision')::bigint, -1) <> 0
     or i.state_json->>'power' not in ('off','on')
     or jsonb_typeof(i.state_json->'devices') <> 'object'
     or (i.state_json->'devices'->'matrix'->>'brightness')::integer <> i.matrix_brightness
     or (i.state_json->'devices'->'aux'->>'brightness')::integer <> i.aux_brightness
     or coalesce((i.state_json->'devices'->'matrix'->>'brightnessLocked')::boolean, false) is not true
     or coalesce((i.state_json->'devices'->'aux'->>'brightnessLocked')::boolean, false) is not true
     or i.matrix_brightness not between 0 and 255
     or i.aux_brightness not between 0 and 255
     or i.release_sha256 !~ '^[0-9a-f]{64}$'
     or i.matrix_sha256 !~ '^[0-9a-f]{64}$'
     or i.aux_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid initial cart state or release identity';
  end if;

  select revision, state into stored_revision, stored_state
    from hbnf_internal.cart_desired_state where cart_id='hbnf-cart';
  if stored_revision <> 0 or stored_state is distinct from i.state_json then
    raise exception 'existing desired state differs; refusing to overwrite';
  end if;

  select * into fence from hbnf_internal.cart_actuator_fence where cart_id='hbnf-cart' for update;
  if not found or fence.active or fence.release_id <> i.release_id then
    raise exception 'fence missing, active, or release identity mismatch';
  end if;

  select active into allowlisted from hbnf_internal.cart_operator_allowlist where user_id=i.operator_user_id;
  if not found or not allowlisted then raise exception 'operator is not active on the cart allowlist'; end if;

  select * into readiness from hbnf_internal.cart_cutover_readiness
    where cart_id='hbnf-cart' and release_id=i.release_id;
  if not found
     or readiness.release_artifact_id <> i.release_artifact_id
     or readiness.release_sha256 <> i.release_sha256
     or readiness.matrix_firmware_sha256 <> i.matrix_sha256
     or readiness.aux_firmware_sha256 <> i.aux_sha256
     or readiness.backend_ready or readiness.matrix_firmware_ready
     or readiness.aux_firmware_ready or readiness.ui_ready or readiness.projection_sane then
    raise exception 'cutover readiness row conflicts with initialization; refusing to overwrite';
  end if;
end;
$check$;

commit;
