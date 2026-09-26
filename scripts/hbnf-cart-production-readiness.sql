\set ON_ERROR_STOP on
-- Run only after independent backend, matched firmware, UI, and same-revision projection checks pass.
-- Every :*_ready value must be supplied as true only with matching evidence attached.
begin;
update hbnf_internal.cart_cutover_readiness
set backend_ready = :'backend_ready'::boolean,
    matrix_firmware_ready = :'matrix_firmware_ready'::boolean,
    aux_firmware_ready = :'aux_firmware_ready'::boolean,
    ui_ready = :'ui_ready'::boolean,
    projection_sane = :'projection_sane'::boolean,
    evidence = :'evidence_json'::jsonb,
    verified_at = case
      when :'backend_ready'::boolean and :'matrix_firmware_ready'::boolean
       and :'aux_firmware_ready'::boolean and :'ui_ready'::boolean
       and :'projection_sane'::boolean then clock_timestamp()
      else null end
where cart_id='hbnf-cart' and release_id=:'release_id'
  and release_artifact_id=:'release_artifact_id'
  and release_sha256=:'release_sha256'
  and matrix_firmware_sha256=:'matrix_sha256'
  and aux_firmware_sha256=:'aux_sha256'
  and exists (select 1 from hbnf_internal.cart_actuator_fence
              where cart_id='hbnf-cart' and active=false and release_id=:'release_id')
  and exists (select 1 from hbnf_internal.cart_desired_state
              where cart_id='hbnf-cart' and revision=0);
do $check$
begin
  if not found then raise exception 'readiness row not found or fence is already active'; end if;
end;
$check$;
commit;
