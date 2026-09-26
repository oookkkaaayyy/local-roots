#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to the isolated disposable PostgreSQL database}"
root="$(cd "$(dirname "$0")/.." && pwd)"
migration="$root/supabase/migrations/20260926080000_hbnf_cart_core_production.sql"
init_sql="$root/scripts/hbnf-cart-production-cutover-init.sql"
activate_sql="$root/scripts/hbnf-cart-production-activate.sql"
for path in "$migration" "$init_sql" "$activate_sql"; do test -s "$path"; done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
SQL

# Applying twice checks migration idempotency in a brand-new, isolated database.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from hbnf_internal.cart_actuator_fence where cart_id='hbnf-cart' and active=false) then
    raise exception 'migration did not leave an inactive fence';
  end if;
  if exists (select 1 from hbnf_internal.cart_desired_state where cart_id='hbnf-cart') then
    raise exception 'migration seeded desired state';
  end if;
  if exists (select 1 from hbnf_internal.cart_cutover_readiness) then
    raise exception 'migration seeded readiness';
  end if;
  if not (select relrowsecurity from pg_class where oid='hbnf_internal.cart_desired_state'::regclass) then
    raise exception 'RLS not enabled';
  end if;
  if has_function_privilege('anon','hbnf_internal.hbnf_cart_commit_command(text,uuid,text,bigint,jsonb)','EXECUTE') then
    raise exception 'anon can execute commit RPC';
  end if;
end
$$;
begin;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
begin
  begin
    perform hbnf_internal.hbnf_cart_commit_command('hbnf-cart','11111111-1111-1111-1111-111111111111','ON',0,
      '{"cartId":"hbnf-cart","revision":1}'::jsonb);
    raise exception 'anonymous RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
begin
  begin
    perform hbnf_internal.hbnf_cart_commit_command('hbnf-cart','22222222-2222-2222-2222-222222222222','ON',0,
      '{"cartId":"hbnf-cart","revision":1}'::jsonb);
    raise exception 'inactive-fence RPC unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;
rollback;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111')"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
python3 - "$tmpdir/initial-state.json" <<'PY'
import json,sys
state={
  "cartId":"hbnf-cart","revision":0,"power":"off","programMode":"auto",
  "sceneId":"course-flow","paletteId":"hbnf-balanced","vibe":"moderate",
  "vibeMode":"music","tempoMode":"music","manualSpeedBias":1,"sequenceCursor":0,
  "devices":{
    "matrix":{"enabled":True,"brightness":91,"brightnessLocked":True,"profileRevision":1,"speedBias":1},
    "aux":{"enabled":True,"brightness":37,"brightnessLocked":True,"profileRevision":1,"speedBias":1}
  },
  "overlays":[],"lastCommandId":None,"commandReceipts":{}
}
with open(sys.argv[1],"w") as f: json.dump(state,f,separators=(",",":"))
PY
export INITIAL_CART_STATE_JSON="$tmpdir/initial-state.json"
export CART_OPERATOR_USER_ID="11111111-1111-1111-1111-111111111111"
export HBNF_CART_RELEASE_ID="hbnf-cart-foundation-v1-20260925"
export HBNF_CART_RELEASE_ARTIFACT_ID="isolated-migration-dry-run"
export HBNF_CART_RELEASE_SHA256="$(printf '0%.0s' {1..64})"
export HBNF_MATRIX_FIRMWARE_SHA256="8065fa2fe3cf919839ebe984c444cefc4ee9fca3cd8302a2dcf3f4216bd8bab3"
export HBNF_AUX_FIRMWARE_SHA256="b2ef3045f00e37cdf6e6e4f9864ef831fae59ab5636cf37780b2dbada3e767d4"
export MATRIX_BRIGHTNESS=91 AUX_BRIGHTNESS=37
node "$root/scripts/hbnf-cart-projection-preflight.mjs" "$INITIAL_CART_STATE_JSON" "$HBNF_CART_RELEASE_ID" 1

# Initialization is repeat-safe for the same input and leaves the actuator fence inactive.
bash "$root/scripts/hbnf-cart-cutover-init.sh"
"$root/scripts/hbnf-cart-cutover-init.sh"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from hbnf_internal.cart_actuator_fence where cart_id='hbnf-cart' and active=false) then
    raise exception 'initializer activated the fence';
  end if;
  if not exists (select 1 from hbnf_internal.cart_desired_state where cart_id='hbnf-cart' and revision=0
    and (state->'devices'->'matrix'->>'brightness')::int=91
    and (state->'devices'->'aux'->>'brightness')::int=37) then
    raise exception 'initializer failed to retain independent brightness';
  end if;
end
$$;
SQL

activation_args=(
  -v release_id="$HBNF_CART_RELEASE_ID"
  -v release_artifact_id="$HBNF_CART_RELEASE_ARTIFACT_ID"
  -v release_sha256="$HBNF_CART_RELEASE_SHA256"
  -v matrix_sha256="$HBNF_MATRIX_FIRMWARE_SHA256"
  -v aux_sha256="$HBNF_AUX_FIRMWARE_SHA256"
)
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "${activation_args[@]}" -f "$activate_sql" >/dev/null 2>&1; then
  echo "activation must fail before readiness gates pass" >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
update hbnf_internal.cart_cutover_readiness set backend_ready=true,matrix_firmware_ready=true,
  aux_firmware_ready=true,ui_ready=true,projection_sane=true,evidence='{"dryRun":"isolated-only"}',
  verified_at=clock_timestamp()
where cart_id='hbnf-cart' and release_id='hbnf-cart-foundation-v1-20260925';
SQL
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "${activation_args[@]}" -f "$activate_sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists(select 1 from hbnf_internal.cart_actuator_fence where cart_id='hbnf-cart' and active=true and epoch=2) then raise exception 'guarded activation test failed'; end if; end \$\$;"
echo "PRODUCTION_MIGRATION_DRY_RUN=PASS (isolated PostgreSQL only)"
