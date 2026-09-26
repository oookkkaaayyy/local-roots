\set ON_ERROR_STOP on
begin;

create temporary table _hbnf_activate_input on commit drop as
select :'release_id'::text as release_id,
       :'release_artifact_id'::text as release_artifact_id,
       :'release_sha256'::text as release_sha256,
       :'matrix_sha256'::text as matrix_sha256,
       :'aux_sha256'::text as aux_sha256;

do $activate$
declare
  i record;
  fence hbnf_internal.cart_actuator_fence%rowtype;
  readiness hbnf_internal.cart_cutover_readiness%rowtype;
  state_row hbnf_internal.cart_desired_state%rowtype;
  changed integer;
begin
  select * into i from _hbnf_activate_input;
  if i.release_sha256 !~ '^[0-9a-f]{64}$'
     or i.matrix_sha256 !~ '^[0-9a-f]{64}$'
     or i.aux_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid release or firmware digest';
  end if;

  select * into fence from hbnf_internal.cart_actuator_fence
    where cart_id='hbnf-cart' for update;
  select * into state_row from hbnf_internal.cart_desired_state
    where cart_id='hbnf-cart' for share;
  select * into readiness from hbnf_internal.cart_cutover_readiness
    where cart_id='hbnf-cart' and release_id=i.release_id for share;

  if not found then raise exception 'cart cutover prerequisites missing'; end if;
  if fence.active or fence.release_id <> i.release_id
     or state_row.cart_id is null or readiness.cart_id is null
     or state_row.revision <> 0
     or readiness.release_artifact_id <> i.release_artifact_id
     or readiness.release_sha256 <> i.release_sha256
     or readiness.matrix_firmware_sha256 <> i.matrix_sha256
     or readiness.aux_firmware_sha256 <> i.aux_sha256
     or not readiness.backend_ready
     or not readiness.matrix_firmware_ready
     or not readiness.aux_firmware_ready
     or not readiness.ui_ready
     or not readiness.projection_sane
     or readiness.verified_at is null then
    raise exception 'backend, matched firmware, UI, projection, or fence prerequisite failed';
  end if;

  update hbnf_internal.cart_actuator_fence
    set active=true, epoch=epoch+1, updated_at=clock_timestamp()
    where cart_id='hbnf-cart' and active=false and release_id=i.release_id;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'fence activation was not a single atomic update'; end if;
end;
$activate$;

commit;
