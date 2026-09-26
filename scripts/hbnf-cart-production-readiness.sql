\set ON_ERROR_STOP on
begin;

create temporary table _hbnf_readiness_input on commit drop as
select :'release_id'::text as release_id,
       :'release_artifact_id'::text as release_artifact_id,
       :'release_sha256'::text as release_sha256,
       :'matrix_sha256'::text as matrix_sha256,
       :'aux_sha256'::text as aux_sha256,
       :'backend_ready'::boolean as backend_ready,
       :'matrix_firmware_ready'::boolean as matrix_firmware_ready,
       :'aux_firmware_ready'::boolean as aux_firmware_ready,
       :'ui_ready'::boolean as ui_ready,
       :'projection_sane'::boolean as projection_sane,
       :'evidence_json'::jsonb as evidence_json;

create temporary table _hbnf_readiness_result(updated boolean);

with changed as (
  update hbnf_internal.cart_cutover_readiness r
  set backend_ready=i.backend_ready,
      matrix_firmware_ready=i.matrix_firmware_ready,
      aux_firmware_ready=i.aux_firmware_ready,
      ui_ready=i.ui_ready,
      projection_sane=i.projection_sane,
      evidence=i.evidence_json,
      verified_at=case when i.backend_ready and i.matrix_firmware_ready
        and i.aux_firmware_ready and i.ui_ready and i.projection_sane
        then clock_timestamp() else null end
  from _hbnf_readiness_input i
  where r.cart_id='hbnf-cart' and r.release_id=i.release_id
    and r.release_artifact_id=i.release_artifact_id
    and r.release_sha256=i.release_sha256
    and r.matrix_firmware_sha256=i.matrix_sha256
    and r.aux_firmware_sha256=i.aux_sha256
    and exists (select 1 from hbnf_internal.cart_actuator_fence
                where cart_id='hbnf-cart' and active=false and release_id=i.release_id)
    and exists (select 1 from hbnf_internal.cart_desired_state
                where cart_id='hbnf-cart' and revision=0)
  returning 1
)
insert into _hbnf_readiness_result(updated) select exists(select 1 from changed);

do $check$
begin
  if not coalesce((select updated from _hbnf_readiness_result), false) then
    raise exception 'readiness row not found or fence/state is not eligible';
  end if;
end;
$check$;
commit;
