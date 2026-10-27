#!/usr/bin/env python3
"""Read-only GL-SFT1200 preflight bound to the pinned Owner PWA v1.0.14 release."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.14"
BASELINE_PACKAGE = ROOT / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.13"
CONTROL = ROOT / "scripts/hbnf_control.py"
DEVICE = "root@192.168.77.1"
TX = "OWNER-PWA-LOCAL-V114-UV-20261026-01"
BASELINE_READBACK = ROOT / "evidence/owner-pwa-v113-readback-20261025/READONLY_BASELINE.json"
spec = importlib.util.spec_from_file_location("hbnf_control", CONTROL)
control = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(control)
profile = control._owner_pwa_v114_profile()
expected_owner = profile["baseline_filesystem_hashes"]
expected_mission = profile["mission_control_hashes"]
candidate = profile["candidate_hashes"]
new_paths = profile["new_paths"]
package_sha = profile["candidate_sha256"]
baseline_sha = control.OWNER_PWA_V114_BASELINE_MANIFEST_SHA256
rollback_sha = control.OWNER_PWA_V114_BASELINE_PACKAGE_SHA256
baseline_readback_sha = control.OWNER_PWA_V114_BASELINE_READBACK_SHA256


def fail(message: str) -> None:
    raise SystemExit("PREFLIGHT FAIL: " + message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


manifest = PACKAGE / "BASELINE.SHA256SUMS"
if not manifest.is_file() or sha256(manifest.read_bytes()) != baseline_sha:
    fail("v1.0.13 expected baseline manifest is missing or changed")
rollback = BASELINE_PACKAGE / "hbnf-owner-pwa-local-v1.0.13.zip"
if not rollback.is_file() or sha256(rollback.read_bytes()) != rollback_sha:
    fail("exact v1.0.13 rollback package is missing or changed")
if not BASELINE_READBACK.is_file() or sha256(BASELINE_READBACK.read_bytes()) != baseline_readback_sha:
    fail("historical v1.0.13 baseline evidence is missing or changed")
try:
    package = json.loads((PACKAGE / "PACKAGE.json").read_text())
except (OSError, ValueError) as exc:
    fail("candidate package manifest cannot be read: " + str(exc))
if package.get("sourceCommit") != profile["candidate_commit"] or package.get("transactionId") != TX:
    fail("candidate manifest is not bound to the pinned source and transaction")
archive = PACKAGE / "hbnf-owner-pwa-local-v1.0.14.zip"
if not archive.is_file() or sha256(archive.read_bytes()) != package_sha:
    fail("exact v1.0.14 candidate archive is missing or changed")
expected_candidate_sha = package_sha
owner_lines = "\n".join(f"{value}  {path.removeprefix('owner-pwa/')}" for path, value in expected_owner.items())
mission_lines = "\n".join(f"{value}  /www/mission-control-local/{path.removeprefix('mission-control-local/')}" for path, value in expected_mission.items())

remote = r'''set -u
FAILURES=0
fail() { echo "OPAL_BLOCKER: $*" >&2; FAILURES=$((FAILURES + 1)); return 0; }
TX=OWNER-PWA-LOCAL-V114-UV-20261026-01
BASE=/www/mission-control-local
TARGET="$BASE/owner-pwa"
BOARD=$(ubus call system board) || { echo "OPAL_PREFLIGHT=FAIL board identity unavailable"; exit 2; }
printf '%s\n' "$BOARD" | grep -F '"model": "GL-SFT1200"' >/dev/null || fail "unexpected device model"
printf '%s\n' "$BOARD" | grep -F '"board_name": "glinet,gl-sft1200"' >/dev/null || fail "unexpected board identity"
printf '%s\n' "$BOARD" | grep -F '"kernel": "4.14.90"' >/dev/null || fail "unexpected kernel"
printf '%s\n' "$BOARD" | grep -E '"distribution"[[:space:]]*:[[:space:]]*"OpenWrt"' >/dev/null || fail "unexpected firmware distribution"
printf '%s\n' "$BOARD" | grep -E '"version"[[:space:]]*:[[:space:]]*"LEDE"' >/dev/null || fail "unexpected firmware release"
[ -f /etc/openwrt_release ] && [ ! -L /etc/openwrt_release ] || fail "firmware release file missing or symlink"
grep -Fx "DISTRIB_TARGET='siflower/sf19a28-fullmask'" /etc/openwrt_release >/dev/null || fail "unexpected firmware target"
LAN=$(ubus call network.interface.lan status) || fail "LAN readback failed"
printf '%s\n' "$LAN" | grep -F '192.168.77.1' >/dev/null || fail "unexpected LAN address"
[ "$(cat /sys/class/net/br-lan/address 2>/dev/null)" = 94:83:c4:98:78:93 ] || fail "unexpected Opal LAN MAC"
[ -d /www ] && [ ! -L /www ] || fail "/www missing or symlink"
[ -d "$BASE" ] && [ ! -L "$BASE" ] || fail "Mission Control root missing or symlink"
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || fail "Owner PWA root missing or symlink"
[ "$(cat "$BASE/.hbnf-package-marker" 2>/dev/null)" = hbnf-owner-pwa-empty-runtime-recovery-v2 ] || fail "Mission Control identity mismatch"
[ "$(cat "$BASE/.hbnf-package-version" 2>/dev/null)" = 1.0.2 ] || fail "Mission Control version mismatch"
[ "$(cat "$TARGET/.hbnf-package-marker" 2>/dev/null)" = hbnf-owner-pwa-local-v1 ] || fail "Owner PWA identity mismatch"
[ "$(cat "$TARGET/.hbnf-package-version" 2>/dev/null)" = 1.0.13 ] || fail "Owner PWA is not the expected v1.0.13 baseline"
[ "$(find "$TARGET" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 21 ] || fail "Owner PWA does not contain exactly 21 regular files"
[ -z "$(find "$TARGET" -mindepth 1 -maxdepth 1 ! -type f -print)" ] || fail "Owner PWA contains a symlink or non-file entry"
echo 'OWNER_BASELINE_BEGIN'
(cd "$TARGET" && sha256sum -c - <<'OWNER_MANIFEST') || fail "Owner PWA baseline hash mismatch"
__OWNER_MANIFEST__
OWNER_MANIFEST
echo 'OWNER_BASELINE_END'
echo 'MISSION_CONTROL_BEGIN'
(cd /www && sha256sum -c - <<'MISSION_MANIFEST') || fail "Mission Control preservation hashes mismatch"
__MISSION_MANIFEST__
MISSION_MANIFEST
echo 'MISSION_CONTROL_END'
for path in \
  "/root/hbnf-owner-pwa-local.rollback-$TX" \
  "/root/hbnf-owner-pwa-$TX.BASELINE.SHA256SUMS" \
  "$BASE/.owner-pwa.stage-$TX" "$BASE/.owner-pwa.previous-$TX" "$BASE/.owner-pwa.failed-$TX"; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || fail "transaction path occupied: $path"
done
[ -w "$BASE" ] && [ -w /root ] || fail "install or rollback location is not writable"
for tool in awk cat chmod cp df find grep mkdir mv rm sed sha256sum tail tr wc; do
  command -v "$tool" >/dev/null 2>&1 || fail "required command unavailable: $tool"
done
WWW_DEVICE=$(df -P /www | tail -n 1 | awk '{print $1}')
BACKUP_DEVICE=$(df -P /root | tail -n 1 | awk '{print $1}')
[ -n "$WWW_DEVICE" ] && [ "$WWW_DEVICE" = "$BACKUP_DEVICE" ] || fail "serving and rollback locations are on different filesystems"
if [ "$FAILURES" -ne 0 ]; then printf 'OPAL_PREFLIGHT=FAIL\nBLOCKERS=%s\n' "$FAILURES"; exit 2; fi
printf 'OPAL_PREFLIGHT=PASS\nMODEL=GL-SFT1200\nOWNER_PWA_VERSION=1.0.13\nOWNER_PWA_BASELINE_FILES=21\nROLLBACK_FILESYSTEM=%s\n' "$WWW_DEVICE"
'''.replace("__OWNER_MANIFEST__", owner_lines).replace("__MISSION_MANIFEST__", mission_lines)

ssh_cmd = ["ssh", "-T", "-o", "StrictHostKeyChecking=yes", "-o", "HostKeyAlgorithms=+ssh-rsa",
           "-o", "NumberOfPasswordPrompts=1", DEVICE, "sh", "-s"]
result = subprocess.run(ssh_cmd, input=remote, text=True, capture_output=True)
if result.stdout:
    print(result.stdout, end="")
if result.stderr:
    print(result.stderr, file=sys.stderr, end="")
if result.returncode:
    fail("read-only SSH preflight failed; no device changes were made")
if "OPAL_PREFLIGHT=PASS" not in result.stdout:
    fail("Opal preflight did not report PASS")

def parse_hash_block(output: str, begin: str, end: str) -> dict[str, str]:
    try:
        contents = output.split(begin + "\n", 1)[1].split(end, 1)[0]
    except IndexError:
        fail("remote preflight omitted hash block " + begin)
    result: dict[str, str] = {}
    for line in contents.splitlines():
        fields = line.split()
        if len(fields) == 2 and len(fields[0]) == 64:
            result[fields[1]] = fields[0]
    return result

remote_owner = parse_hash_block(result.stdout, "OWNER_BASELINE_BEGIN", "OWNER_BASELINE_END")
remote_mission = parse_hash_block(result.stdout, "MISSION_CONTROL_BEGIN", "MISSION_CONTROL_END")
if remote_owner != {path.removeprefix("owner-pwa/"): value for path, value in expected_owner.items()}:
    fail("remote filesystem hashes do not match all 21 pinned v1.0.13 files")
if remote_mission != {path.removeprefix("mission-control-local/"): value for path, value in expected_mission.items()}:
    fail("remote Mission Control preservation hashes differ from the six recorded files")

served: dict[str, str] = {}
statuses: dict[str, int] = {}
for path, expected in profile["baseline_served_hashes"].items():
    relative = path if path.startswith("mission-control-local/") else "mission-control-local/" + path
    try:
        with urllib.request.urlopen("http://192.168.77.1/" + relative, timeout=4) as response:
            body = response.read()
            statuses[path] = response.status
            served[path] = sha256(body)
            if response.status != 200 or served[path] != expected:
                fail("served URL mismatch: " + relative)
    except Exception as exc:
        fail("served URL unavailable: " + relative + ": " + str(exc))
if len(served) != len(profile["baseline_served_hashes"]):
    fail("not all baseline URLs were verified")
new_path_status: dict[str, dict[str, object]] = {}
for path in new_paths:
    relative = "mission-control-local/" + path
    try:
        with urllib.request.urlopen("http://192.168.77.1/" + relative, timeout=4) as response:
            new_path_status[path] = {"filesystem_absent": False, "http_status": response.status}
            fail("candidate-only URL unexpectedly exists: " + relative)
    except urllib.error.HTTPError as exc:
        new_path_status[path] = {"filesystem_absent": True, "http_status": exc.code}
        if exc.code != 404:
            fail("candidate-only URL did not return HTTP 404: " + relative)
    except Exception as exc:
        fail("candidate-only URL absence could not be verified: " + relative + ": " + str(exc))

if len(candidate) != 18 or len(expected_owner) != 21:
    fail("pinned candidate or baseline path count is unexpected")

print(json.dumps({
    "schema": "hbnf-owner-pwa-live-preflight-v1",
    "status": "PASS",
    "captured_unix": time.time(),
    "device": "GL-SFT1200 at 192.168.77.1",
    "candidate_transaction": TX,
    "candidate_source_commit": profile["candidate_commit"],
    "candidate_zip_sha256": expected_candidate_sha,
    "baseline_runtime_version": "1.0.13",
    "baseline_expected_regular_files": len(expected_owner),
    "filesystem_sha256_by_path": expected_owner,
    "baseline_http_status_by_path": {path: 200 for path in served},
    "mission_control_preservation_hashes": expected_mission,
    "mission_control_sha256_by_path": expected_mission,
    "served_sha256_by_path": served,
    "new_path_preflight_by_path": new_path_status,
    "permissions": {"owner_files_regular_no_symlinks": True, "transport_regular_no_symlink": True,
                    "root_install_available": True, "recovery_paths_clear": True},
    "device_identity": {"model": "GL-SFT1200", "board": "glinet,gl-sft1200",
                        "br_lan_mac": "94:83:c4:98:78:93", "kernel": "4.14.90",
                        "firmware": "OpenWrt 18.06", "firmware_release_id": "OpenWrt",
                        "firmware_release": "LEDE", "firmware_target": "siflower/sf19a28-fullmask"},
    "target_ip": "192.168.77.1",
    "rollback": {"baseline_zip_sha256": rollback_sha, "baseline_manifest_sha256": baseline_sha,
                 "baseline_readback_sha256": baseline_readback_sha, "exact_backup_path_clear": True,
                 "same_filesystem": True, "sha256sum_available": True},
    "rollback_zip_sha256": rollback_sha,
    "baseline_manifest_sha256": baseline_sha,
    "historical_readback_receipt_sha256": baseline_readback_sha,
    "mutation_performed": False,
}, indent=2, sort_keys=True))
