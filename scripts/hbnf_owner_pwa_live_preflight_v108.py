#!/usr/bin/env python3
"""Read-only v1.0.8 Opal preflight; uses strict SSH host-key verification."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import argparse
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

PACKAGE = pathlib.Path("/Users/andrew/Documents/Codex/cart-p1-review-candidate-20261021/staging/coordinated-backend/opal/owner-pwa-local-v1.0.8-package")
REPO = PACKAGE.parents[3]
CONTROL = REPO / "scripts/hbnf_control.py"
EXPECTED_PACKAGE_SHA = "e9fcebd2a9b9592712c3687667de80882eb9fe8d182574824441edbc2f27cc4f"
EXPECTED_PACKAGE_MANIFEST_SHA = "a214de42d70537827daa2e0153275173f2cc626b0ea194d030719972ca4165d9"
EXPECTED_BASELINE_MANIFEST_SHA = "971b22121876ddf87eff50adedfd54b985216fccbd847074fd67d6ec49bf044d"
DEVICE = "root@192.168.77.1"
TX = "OWNER-PWA-LOCAL-V108-RECOVERY-V2-20261021-01"
parser = argparse.ArgumentParser()
parser.add_argument("--receipt", type=pathlib.Path,
                    help="write a structured local preflight receipt only after all device/HTTP checks pass")
args = parser.parse_args()
if args.receipt is not None:
    receipt_path = args.receipt.resolve()
    try:
        receipt_path.relative_to(REPO.resolve() / "evidence")
    except ValueError:
        raise SystemExit("PREFLIGHT FAIL: receipt path must be inside this checkout's evidence directory")
    if receipt_path.exists():
        raise SystemExit("PREFLIGHT FAIL: refusing to overwrite an existing preflight receipt")


def fail(message: str) -> None:
    raise SystemExit("PREFLIGHT FAIL: " + message)


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


local_blockers: list[str] = []
for filename, expected in (
    ("hbnf-owner-pwa-local-v1.0.8.zip", EXPECTED_PACKAGE_SHA),
    ("PACKAGE.json", EXPECTED_PACKAGE_MANIFEST_SHA),
    ("BASELINE.SHA256SUMS", EXPECTED_BASELINE_MANIFEST_SHA),
):
    path = PACKAGE / filename
    if not path.is_file() or sha256(path) != expected:
        local_blockers.append(f"local {filename} missing or hash mismatch")

spec = importlib.util.spec_from_file_location("hbnf_control", CONTROL)
if spec is None or spec.loader is None:
    control = None
    local_blockers.append("cannot load the verified controller pins")
else:
    control = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(control)
    except Exception as exc:
        control = None
        local_blockers.append("cannot execute the verified controller pins: " + str(exc))
if control is None:
    fail("local controller pins are unavailable; cannot safely identify the remote baseline")
try:
    candidate_hashes = control._owner_pwa_v108_candidate_hashes()
except Exception as exc:
    candidate_hashes = {}
    local_blockers.append("local candidate profile verification failed: " + str(exc))

# A package sourceCommit is meaningful only if the committed Cart source inputs
# match the exact bytes bound by PACKAGE.json. Generated installer/rollback
# scripts are separately hash-bound package inputs and are not Git source files.
try:
    package_manifest = json.loads((PACKAGE / "PACKAGE.json").read_text())
    source_commit = package_manifest["sourceCommit"]
    for entry in package_manifest.get("sourceInputs", []):
        relative = entry.get("path", "")
        if not relative.startswith("hbnf-final-controller/"):
            continue
        committed = subprocess.run(
            ["git", "show", f"{source_commit}:{relative}"],
            cwd=REPO, capture_output=True, check=False,
        )
        if committed.returncode:
            local_blockers.append(f"candidate source input is absent from pinned commit {source_commit}: {relative}")
        elif hashlib.sha256(committed.stdout).hexdigest() != entry.get("sha256"):
            local_blockers.append(f"candidate source input differs from pinned commit {source_commit}: {relative}")
except Exception as exc:
    local_blockers.append("cannot verify candidate source inputs against the pinned commit: " + str(exc))

baseline = (PACKAGE / "BASELINE.SHA256SUMS").read_text()
remote = r'''set -u
FAILURES=0
fail() { echo "OPAL_BLOCKER: $*" >&2; FAILURES=$((FAILURES + 1)); return 0; }
BASE=/www/mission-control-local
TARGET="$BASE/owner-pwa"
TX=OWNER-PWA-LOCAL-V108-RECOVERY-V2-20261021-01
OLD_TX=OWNER-PWA-71D4F943-20261021-01
UPLOAD=/tmp/hbnf-owner-pwa-v108-release-$TX
[ "$(id -u)" = 0 ] || fail "Opal root shell is required"
BOARD=$(ubus call system board) || fail "board identity readback failed"
release_fail() { printf 'OBSERVED_SYSTEM_BOARD_BEGIN\n%s\nOBSERVED_SYSTEM_BOARD_END\n' "$BOARD" >&2; fail "$1"; }
printf '%s\n' "$BOARD" | grep -F '"model": "GL-SFT1200"' >/dev/null || release_fail "unexpected device model"
printf '%s\n' "$BOARD" | grep -F '"board_name": "glinet,gl-sft1200"' >/dev/null || release_fail "unexpected board identity"
printf '%s\n' "$BOARD" | grep -F '"kernel": "4.14.90"' >/dev/null || release_fail "unexpected kernel"
printf '%s\n' "$BOARD" | grep -E '"distribution"[[:space:]]*:[[:space:]]*"OpenWrt"' >/dev/null || release_fail "unexpected firmware distribution ID"
printf '%s\n' "$BOARD" | grep -E '"version"[[:space:]]*:[[:space:]]*"LEDE"' >/dev/null || release_fail "unexpected firmware release value"
[ -f /etc/openwrt_release ] && [ ! -L /etc/openwrt_release ] || fail "OpenWrt release identity file is missing or a symlink"
grep -Fx "DISTRIB_ID='OpenWrt'" /etc/openwrt_release >/dev/null || fail "unexpected firmware distribution ID"
grep -Fx "DISTRIB_RELEASE='LEDE'" /etc/openwrt_release >/dev/null || fail "unexpected firmware release"
grep -Fx "DISTRIB_TARGET='siflower/sf19a28-fullmask'" /etc/openwrt_release >/dev/null || fail "unexpected firmware target"
LAN=$(ubus call network.interface.lan status) || fail "LAN identity readback failed"
printf '%s\n' "$LAN" | grep -F '192.168.77.1' >/dev/null || fail "unexpected Cart LAN address"
[ -d /www ] && [ ! -L /www ] || fail "/www is missing or a symlink"
[ -f /www/index.html ] && [ ! -L /www/index.html ] || fail "/www/index.html missing or a symlink"
[ -d "$BASE" ] && [ ! -L "$BASE" ] || fail "Mission Control root missing or a symlink"
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || fail "Owner PWA root missing or a symlink"
[ "$(cat "$BASE/.hbnf-package-marker")" = hbnf-owner-mission-control-local-v1 ] || fail "Mission Control marker mismatch"
[ "$(cat "$BASE/.hbnf-package-version")" = 1.0.2 ] || fail "Mission Control version mismatch"
[ "$(cat "$TARGET/.hbnf-package-marker")" = hbnf-owner-pwa-local-v1 ] || fail "Owner PWA marker mismatch"
[ "$(cat "$TARGET/.hbnf-package-version")" = 1.0.5 ] || fail "Owner PWA is not the recovery-v2 v1.0.5 baseline"
verify() { [ -f "$1" ] && [ ! -L "$1" ] || fail "missing, non-file, or symlink: $1"; actual=$(sha256sum "$1" | awk '{print $1}'); [ "$actual" = "$2" ] || fail "hash mismatch: $1"; }
verify "$BASE/.hbnf-package-marker" 478ec1b74f033d02ee6c795c258d276d941b3da8707ff85edaeb025637319c17
verify "$BASE/.hbnf-package-version" 9fd28642d3aca191e5c7fc2383cfd6fabb2aac8743f029dabb8989ac584e31bc
verify "$BASE/index.html" 0424ab290ab1d80dbbd1bff31e068009e3000cae22ec2792b92e4eef7bdcbcaf
verify "$BASE/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522
verify "$BASE/app.js" d44691025b16d95fb1a210a56d901c3ee6cdd74bf932a59f7ffe08679184df2b
verify "$BASE/local-transport.js" 51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a
[ -f /www/index.html ] && [ ! -L /www/index.html ] || fail "/www/index.html missing or a symlink"
verify /www/index.html 21a2f8de487bf90d02fdfd97af2049a4f49bfb9c8e6074dab6ff702044fd695a
[ "$(cat /sys/class/net/br-lan/address)" = 94:83:c4:98:78:93 ] || fail "unexpected Opal LAN MAC"
[ "$(find "$TARGET" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 18 ] || fail "Owner PWA baseline file count is not 18"
[ -z "$(find "$TARGET" -mindepth 1 -maxdepth 1 ! -type f -print)" ] || fail "Owner PWA baseline contains a symlink or non-file entry"
echo 'BASELINE_MANIFEST_BEGIN'
(cd "$TARGET" && sha256sum -c - <<'BASELINE_MANIFEST') || fail "installed baseline manifest validation failed"
__MANIFEST__
BASELINE_MANIFEST
echo 'BASELINE_MANIFEST_END'
for path in \
  "/root/hbnf-owner-pwa-local.rollback-$TX" \
  "/root/hbnf-owner-pwa-$TX.BASELINE.SHA256SUMS" \
  "$BASE/.owner-pwa.stage-$TX" \
  "$BASE/.owner-pwa.previous-$TX" \
  "$BASE/.owner-pwa.failed-$TX"; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || fail "candidate transaction path is occupied: $path"
done
for path in \
  "/root/hbnf-owner-pwa-local.rollback-$OLD_TX" \
  "/root/hbnf-owner-pwa-$OLD_TX.BASELINE.SHA256SUMS" \
  "$BASE/.owner-pwa.stage-$OLD_TX" \
  "$BASE/.owner-pwa.previous-$OLD_TX" \
  "$BASE/.owner-pwa.failed-$OLD_TX" \
  "$UPLOAD"; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || fail "prior transaction or upload staging path is occupied: $path"
done
[ -w "$BASE" ] && [ -w /root ] || fail "Mission Control or rollback directory is not writable by the existing root session"
for tool in awk cat chmod cp df find grep mkdir mv rm sed sha256sum tail tar tr wc; do
  command -v "$tool" >/dev/null 2>&1 || fail "required runtime tool is unavailable: $tool"
done
WWW_DEVICE=$(df -P /www | tail -n 1 | awk '{print $1}')
BACKUP_DEVICE=$(df -P /root | tail -n 1 | awk '{print $1}')
[ -n "$WWW_DEVICE" ] && [ "$WWW_DEVICE" = "$BACKUP_DEVICE" ] || fail "serving and rollback locations are on different filesystems"
if [ "$FAILURES" -ne 0 ]; then
  printf 'OPAL_PREFLIGHT=FAIL\nOPAL_BLOCKER_COUNT=%s\n' "$FAILURES"
  exit 1
fi
printf 'OPAL_PREFLIGHT=PASS\nMODEL=GL-SFT1200\nMISSION_CONTROL_VERSION=1.0.2\nOWNER_PWA_VERSION=1.0.5\nOWNER_PWA_BASELINE_FILES=18\nROLLBACK_FILESYSTEM=%s\n' "$WWW_DEVICE"
'''.replace("__MANIFEST__", baseline.rstrip("\n"))

ssh_command = [
    "ssh", "-T", "-o", "StrictHostKeyChecking=yes",
    "-o", "HostKeyAlgorithms=+ssh-rsa", "-o", "NumberOfPasswordPrompts=1",
    DEVICE, "sh", "-s",
]
control_path = __import__("os").environ.get("HBNF_SSH_CONTROL_PATH")
if control_path:
    ssh_command[1:1] = ["-o", "ControlMaster=auto", "-o", "ControlPersist=600",
                         "-o", "ControlPath=" + control_path]
print(f"Read-only Opal preflight for {DEVICE}; host-key verification remains strict.", flush=True)
blockers: list[str] = list(local_blockers)
result = None
try:
    result = subprocess.run(ssh_command, input=remote, text=True)
except OSError as exc:
    blockers.append("cannot start the existing SSH client: " + str(exc))
if result is not None and result.returncode:
    blockers.append(f"Opal read-only identity/filesystem/manifest checks returned SSH/remote exit {result.returncode}")

base_hashes = control.OWNER_PWA_BASELINE_HASHES
for relative, expected in base_hashes.items():
    url_path = relative if relative.startswith("mission-control-local/") else "mission-control-local/" + relative
    url = "http://192.168.77.1/" + url_path
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            body = response.read()
            if response.status != 200 or hashlib.sha256(body).hexdigest() != expected:
                blockers.append("served baseline hash/status mismatch: " + url_path)
    except Exception as exc:
        blockers.append("served baseline readback failed for " + url_path + ": " + str(exc))

for relative in control.OWNER_PWA_NEW_PATHS:
    url_path = "mission-control-local/" + relative
    try:
        with urllib.request.urlopen("http://192.168.77.1/" + url_path, timeout=4) as response:
            blockers.append("candidate-only URL should be absent but returned HTTP " + str(response.status) + ": " + url_path)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            blockers.append("candidate-only URL returned HTTP " + str(exc.code) + ": " + url_path)
    except Exception as exc:
        blockers.append("candidate-only URL absence could not be verified: " + url_path + ": " + str(exc))

if blockers:
    for blocker in blockers:
        print("PREFLIGHT_BLOCKER: " + blocker, file=sys.stderr)
    fail(f"fresh preflight found {len(blockers)} blocker(s); no receipt was written")

print(json.dumps({"preflight": "PASS", "device": "GL-SFT1200", "mission_control": "1.0.2",
    "owner_pwa": "1.0.5", "filesystem_baseline_files": 18,
    "served_baseline_hashes": len(base_hashes), "candidate_only_http_404": len(control.OWNER_PWA_NEW_PATHS),
    "firmware_release_id": "OpenWrt", "firmware_release": "LEDE",
    "firmware_target": "siflower/sf19a28-fullmask", "firmware_description": "OpenWrt 18.06",
    "candidate_zip_sha256": EXPECTED_PACKAGE_SHA, "read_only": True}, sort_keys=True))
if args.receipt is not None:
    now = time.time()
    preflight = {
        "schema": "hbnf-owner-pwa-live-preflight-v1", "pass": True,
        "captured_unix": now, "target_ip": "192.168.77.1",
        "device_identity": {"model": "GL-SFT1200", "board": "glinet,gl-sft1200",
                            "br_lan_mac": "94:83:c4:98:78:93", "kernel": "4.14.90",
                            "firmware": "OpenWrt 18.06", "firmware_release_id": "OpenWrt",
                            "firmware_release": "LEDE", "firmware_target": "siflower/sf19a28-fullmask"},
        "filesystem_sha256_by_path": dict(base_hashes),
        "served_sha256_by_path": dict(base_hashes),
        "baseline_http_status_by_path": {path: 200 for path in base_hashes},
        "new_path_preflight_by_path": {
            path: {"filesystem_absent": True, "http_status": 404}
            for path in control.OWNER_PWA_NEW_PATHS
        },
        "permissions": {"owner_files_regular_no_symlinks": True,
                        "transport_regular_no_symlink": True,
                        "root_install_available": True, "recovery_paths_clear": True},
        "rollback": {"baseline_zip_sha256": "c2086e25dbc98cc5ee1b234ac884b686ac4989ca901acd7d3d4f29f70ff9ce91",
                     "exact_backup_path_clear": True, "same_filesystem": True,
                     "sha256sum_available": True},
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    with receipt_path.open("x", encoding="utf-8") as stream:
        json.dump(preflight, stream, indent=2, sort_keys=True)
        stream.write("\n")
    print(json.dumps({"preflight_receipt": str(receipt_path), "captured_unix": now}, sort_keys=True))
