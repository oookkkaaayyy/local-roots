#!/bin/sh
set -eu
ROOT=${HBNF_OPAL_ROOT:-/}
TEST_MODE=${HBNF_TEST_MODE:-0}
TX=OWNER-LOCAL-CONTROL-UV-STATUS-V115-20261027-01
BASELINE_PACKAGE_SHA256=a5a877c3c9089df245c1262341ad3a3926c9fc85ba660d67197f277fad6096fa
BASELINE_MODULE_SHA256=72e586ba9d2643967923d0f3202523b0fee025b507affc281bc284bb17a40d13
CANDIDATE_MODULE_SHA256=ae51e16f33f88b8cce4ec3d9fa058443edc94b4cb721816b81359966a139a342
BASELINE_FILES_SHA256=35d79e40b11e3759ce228cbced7a227f4a5ce7ac6a01a7171acd2b41e03c1307
UPDATED_FILES_SHA256=cb2789e341712d485c9c370e9a218b4b3b7ab7b9755dc0a4dfd5fc41fa9c8e38
BACKUP=$(printf '%s/%s\n' "${ROOT%/}" root/hbnf-owner-local-control-uv-status.rollback-V115-20261027-01)
TARGET=$(printf '%s/%s\n' "${ROOT%/}" etc/hbnf-local-control/lua/uv_status_access.lua)
fail(){ echo "ROLLBACK BLOCKED: $*" >&2; exit 1; }
[ "$ROOT" = / ] || [ "$TEST_MODE" = 1 ] || fail "alternate roots are permitted only for offline rehearsal"
[ "$ROOT" = / ] && [ "$(id -u)" != 0 ] && fail "run as root on the Opal"
[ -d "$BACKUP" ] && [ -f "$TARGET" ] && [ ! -L "$TARGET" ] || fail "exact device snapshot or installed module is missing"
[ "$(sha256sum "$BACKUP/ROLLBACK_BASELINE.zip" | awk '{print $1}')" = "$BASELINE_PACKAGE_SHA256" ] || fail "exact v1.0.14 rollback package hash failed"
[ "$(sha256sum "$BACKUP/BASELINE_FILES.SHA256SUMS" | awk '{print $1}')" = "$BASELINE_FILES_SHA256" ] || fail "exact v1.0.14 manifest identity failed"
[ "$(sha256sum "$BACKUP/UPDATED_FILES.SHA256SUMS" | awk '{print $1}')" = "$UPDATED_FILES_SHA256" ] || fail "updated manifest identity failed"
[ "$(sha256sum "$BACKUP/etc/hbnf-local-control/lua/uv_status_access.lua" | awk '{print $1}')" = "$BASELINE_MODULE_SHA256" ] || fail "saved prior v1.0.14 module is corrupt"
[ "$(sha256sum "$TARGET" | awk '{print $1}')" = "$CANDIDATE_MODULE_SHA256" ] || fail "installed UV status module changed; preserve files and inspect"
(cd "$ROOT" && sha256sum -c "$BACKUP/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "installed gateway differs from the expected post-update 20-file state"
if [ "$ROOT" != / ] && [ "$TEST_MODE" = 1 ]; then
  TEST_RELOAD=${HBNF_TEST_RELOAD:-}
  [ -x "$TEST_RELOAD" ] || fail "offline rehearsal reload stub is missing"
  reload_gateway(){ "$TEST_RELOAD" reload; }
else
  reload_gateway(){ "$ROOT/etc/init.d/hbnf-owner-local-control" reload; }
fi
cp -p "$TARGET" "$BACKUP/rolled-back-candidate-uv_status_access.lua"
cp -p "$BACKUP/etc/hbnf-local-control/lua/uv_status_access.lua" "$TARGET.rollback"
mv -f "$TARGET.rollback" "$TARGET"
reload_gateway || fail "prior file restored, but dedicated Nginx reload failed; snapshot retained"
(cd "$ROOT" && sha256sum -c "$BACKUP/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "restored v1.0.14 installed file set did not verify"
printf '%s\n' "schema=hbnf-opal-uv-status-rollback-readback-v1" "transaction=$TX" "restored_module_sha256=$BASELINE_MODULE_SHA256" "rollback_package_sha256=$BASELINE_PACKAGE_SHA256" "installed_file_manifest=PASS" "dedicated_nginx_reload=PASS" > "$BACKUP/ROLLBACK-READBACK.txt"
sync
echo "ROLLBACK_VERIFIED: prior v1.0.14 UV status module restored; exact gateway package and full 20-file snapshot retained at $BACKUP."
