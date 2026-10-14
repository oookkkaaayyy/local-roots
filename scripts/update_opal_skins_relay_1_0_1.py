#!/usr/bin/env python3
"""Guarded, single-attempt update from the installed 1.0.0 Opal relay to 1.0.1."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE_SHA = "88512f4a7e6540161e4f32beaed1373c51c54eeadc9b406bc3dbfb7fd549e135"
MATRIX = "http://192.168.77.10"
AUX = "http://192.168.77.11"
MATRIX_MAC = "704bca5b345c"
AUX_MAC = "8c94df55c34c"
RELEASES = {
    "hbnf-cart2-phase2-r6-vibe-first-ui-20261012": "43a33dfa21127a79f643ede9b2a054ff1aa21705b7733cfebea9c8a3e105c5f3",
    "hbnf-cart2-phase2-r6-skins-readable-20261014": "de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
}
OPAL = "root@192.168.77.1"
IDENTITY = pathlib.Path.home() / ".ssh" / "hbnf_opal_rsa"
OLD = {
    "/usr/libexec/hbnf-skins-relay": "2837340b73e50c34b3f8502b134ea09e911ff367332fb243fb9589d3c30c769e",
    "/usr/lib/hbnf-skins-relay-core.sh": "b0cbd0a8afcbe69ce06dad5e822590b5d84c6af1862282b06687ce6a2ce6d086",
    "/etc/init.d/hbnf-skins-relay": "4dd9ad2e3105dcd3a8b87e9369a6806d736b14839a17b3edb1d59eccd09b1e60",
}
NEW_MEMBERS = {
    "hbnf-skins-relay": "81f114c7f64040301d9443d4169bb917931daac7cf09d3351541db5464e041bf",
    "hbnf-skins-relay-core.sh": "d0d6d0597db1d086fbdb0afcbbfd65f276b7450680c20433f67623f57f61afd5",
}


class Blocked(RuntimeError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_package(path: pathlib.Path) -> dict[str, bytes]:
    raw = path.read_bytes()
    if digest(raw) != PACKAGE_SHA:
        raise Blocked("exact relay 1.0.1 package SHA mismatch")
    try:
        with tarfile.open(fileobj=__import__("io").BytesIO(raw), mode="r:gz") as archive:
            members = archive.getmembers()
            if len(members) != 6 or any(not item.isfile() or item.issym() or item.islnk() for item in members):
                raise Blocked("package member types/count are invalid")
            expected_prefix = "hbnf-opal-skins-relay-1.0.1/"
            data: dict[str, bytes] = {}
            for member in members:
                if not member.name.startswith(expected_prefix):
                    raise Blocked("package contains an unexpected path")
                name = member.name[len(expected_prefix):]
                if "/" in name or not name:
                    raise Blocked("package contains a nested or empty path")
                extracted = archive.extractfile(member)
                if extracted is None:
                    raise Blocked("package member could not be read")
                data[name] = extracted.read()
    except (OSError, tarfile.TarError) as exc:
        raise Blocked("relay package archive is invalid") from exc
    manifest = json.loads(data.pop("MANIFEST.json"))
    if manifest.get("version") != "1.0.1" or manifest.get("compatible_matrix_releases") != RELEASES:
        raise Blocked("relay package version or Matrix release bindings mismatch")
    if manifest.get("files") != {name: digest(value) for name, value in data.items()}:
        raise Blocked("relay package member hash mismatch")
    if any(data.get(name) is None or digest(data[name]) != expected for name, expected in NEW_MEMBERS.items()):
        raise Blocked("relay service/core bytes differ from the validated fix")
    return data


def ssh_base() -> list[str]:
    return ["ssh", "-i", str(IDENTITY), "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "HostKeyAlgorithms=+ssh-rsa", "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa",
            "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", OPAL]


def read_json(url: str) -> dict:
    import urllib.request
    req = urllib.request.Request(url, headers={"Cache-Control": "no-store"})
    with urllib.request.urlopen(req, timeout=4) as response:
        data = response.read(32769)
    if len(data) > 32768:
        raise Blocked("device read exceeded limit")
    value = json.loads(data)
    if not isinstance(value, dict):
        raise Blocked("device returned a non-object response")
    return value


def device_preflight() -> str:
    if shutil.which("ssh") is None or not IDENTITY.is_file():
        raise Blocked("existing passwordless Opal RSA key or SSH client unavailable")
    mi = read_json(MATRIX + "/json/info")
    build = read_json(MATRIX + "/hbnf/build.json")
    ai = read_json(AUX + "/json/info")
    if (mi.get("ip") != "192.168.77.10" or mi.get("mac", "").replace(":", "").lower() != MATRIX_MAC
            or mi.get("ver") != "16.0.1" or build.get("release_id") not in RELEASES
            or build.get("candidate") != build.get("release_id") or build.get("mac", "").replace(":", "").lower() != MATRIX_MAC):
        raise Blocked("Matrix identity is outside the two exact relay-compatible firmware releases")
    if (ai.get("ip") != "192.168.77.11" or ai.get("mac", "").replace(":", "").lower() != AUX_MAC
            or ai.get("live") is not True or ai.get("lm") != "DDP" or ai.get("lip") != "192.168.77.10"
            or ai.get("leds", {}).get("count") != 22):
        raise Blocked("AUX identity or Matrix DDP readback failed")
    return build["release_id"]


def remote_preflight(release: str) -> str:
    command = f'''set -eu
MODEL="$(ubus call system board | jsonfilter -e '@.model' 2>/dev/null)"
case "$MODEL" in *GL-SFT1200*) ;; *) exit 31;; esac
for c in sha256sum cp mv chmod mkdir logger logread cat; do command -v "$c" >/dev/null 2>&1 || exit 32; done
[ -x /sbin/procd ] && [ -L /etc/rc.d/S95hbnf-skins-relay ] || exit 33
[ -f /etc/hbnf-skins-relay.conf ] && [ ! -L /etc/hbnf-skins-relay.conf ] || exit 34
ls -ldn /etc/hbnf-skins-relay.conf | awk '$1 == "-rw-------" && $2 == "1" && $3 == "0" && $4 == "0" {{ ok=1 }} END {{ exit (ok ? 0 : 1) }}' || exit 35
[ ! -e /etc/hbnf-skins-relay-1.0.1-update-attempted ] || exit 36
'''
    for path, expected in OLD.items():
        command += f"test \"$(sha256sum {path} | awk '{{print $1}}')\" = '{expected}' || exit 37\n"
    command += '''/etc/init.d/hbnf-skins-relay status >/dev/null 2>&1 || exit 38
ps w | grep -q '[h]bnf-skins-relay' || exit 39
echo OPAL_RELAY_UPDATE_PREFLIGHT_PASS
'''
    result = subprocess.run(ssh_base() + ["sh -s"], input=command.encode(), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=20)
    if result.returncode:
        raise Blocked("Opal relay update preflight failed: " + result.stderr.decode(errors="replace")[-400:])
    output = result.stdout.decode(errors="replace")
    if "OPAL_RELAY_UPDATE_PREFLIGHT_PASS" not in output:
        raise Blocked("Opal relay preflight did not return its pass marker")
    return output


def install(path: pathlib.Path) -> None:
    data = checked_package(path)
    release = device_preflight()
    remote_evidence = remote_preflight(release)
    stage = "/tmp/hbnf-skins-relay-1.0.1-update"
    make_stage = "umask 077; mkdir -p " + stage + "; chmod 700 " + stage
    subprocess.run(ssh_base() + [make_stage], check=True, timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for name in NEW_MEMBERS:
            remote_path = shlex.quote(f"{stage}/{name}")
            with (path.parent / name).open("rb") as source:
                subprocess.run(ssh_base() + [f"umask 077; cat > {remote_path}"], input=source.read(),
                    check=True, timeout=20, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            subprocess.run(ssh_base() + [f"chmod 0600 {remote_path}"], check=True, timeout=10,
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        command = f'''set -eu
STAGE={stage}
BACKUP=/root/hbnf-skins-relay-1.0.0-backup-20261014
MARK=/etc/hbnf-skins-relay-1.0.1-update-attempted
mkdir -m 700 "$BACKUP" 2>/dev/null || exit 41
cp /usr/libexec/hbnf-skins-relay "$BACKUP/hbnf-skins-relay"
cp /usr/lib/hbnf-skins-relay-core.sh "$BACKUP/hbnf-skins-relay-core.sh"
cp /etc/init.d/hbnf-skins-relay "$BACKUP/hbnf-skins-relay.init"
chmod 0700 "$BACKUP"; chmod 0600 "$BACKUP"/*
printf '%s\\n' '1.0.1 update attempt consumed' > "$MARK"
chmod 0600 "$MARK"
'''
        for name, path_remote in (("hbnf-skins-relay", "/usr/libexec/hbnf-skins-relay"),
                                  ("hbnf-skins-relay-core.sh", "/usr/lib/hbnf-skins-relay-core.sh")):
            command += f"test \"$(sha256sum \"$STAGE/{name}\" | awk '{{print $1}}')\" = '{NEW_MEMBERS[name]}' || exit 42\n"
        command += f'''OLD_OK=1
restore_old() {{
    /etc/init.d/hbnf-skins-relay stop >/dev/null 2>&1 || true
    cp "$BACKUP/hbnf-skins-relay" /usr/libexec/hbnf-skins-relay
    cp "$BACKUP/hbnf-skins-relay-core.sh" /usr/lib/hbnf-skins-relay-core.sh
    chmod 0755 /usr/libexec/hbnf-skins-relay; chmod 0644 /usr/lib/hbnf-skins-relay-core.sh
    /etc/init.d/hbnf-skins-relay start
}}
trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$OLD_OK" = 1 ]; then restore_old; fi; exit "$rc"' EXIT HUP INT TERM
/etc/init.d/hbnf-skins-relay stop
cp "$STAGE/hbnf-skins-relay" /usr/libexec/.hbnf-skins-relay.new
cp "$STAGE/hbnf-skins-relay-core.sh" /usr/lib/.hbnf-skins-relay-core.sh.new
chmod 0755 /usr/libexec/.hbnf-skins-relay.new; chmod 0644 /usr/lib/.hbnf-skins-relay-core.sh.new
mv /usr/libexec/.hbnf-skins-relay.new /usr/libexec/hbnf-skins-relay
mv /usr/lib/.hbnf-skins-relay-core.sh.new /usr/lib/hbnf-skins-relay-core.sh
ash -n /usr/libexec/hbnf-skins-relay /usr/lib/hbnf-skins-relay-core.sh
/etc/init.d/hbnf-skins-relay start
sleep 2
/etc/init.d/hbnf-skins-relay status >/dev/null 2>&1
ps w | grep -q '[h]bnf-skins-relay'
test "$(sha256sum /usr/libexec/hbnf-skins-relay | awk '{{print $1}}')" = '{NEW_MEMBERS['hbnf-skins-relay']}'
test "$(sha256sum /usr/lib/hbnf-skins-relay-core.sh | awk '{{print $1}}')" = '{NEW_MEMBERS['hbnf-skins-relay-core.sh']}'
OLD_OK=0
echo OPAL_RELAY_UPDATE_PASS
'''
        result = subprocess.run(ssh_base() + ["sh -s"], input=command.encode(), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=45)
        if result.returncode or "OPAL_RELAY_UPDATE_PASS" not in result.stdout.decode(errors="replace"):
            raise Blocked("Opal update did not verify; inspect preserved 1.0.0 backup and service logs")
        print(json.dumps({"status": "OPAL_RELAY_1_0_1_INSTALLED", "package_sha256": PACKAGE_SHA,
                          "matrix_release": release, "old_files_and_config_preserved": True,
                          "preflight": remote_evidence.splitlines()[-1]}))
    finally:
        subprocess.run(ssh_base() + ["rm -rf " + stage], timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--package", type=pathlib.Path, required=True)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--install", action="store_true")
    args = ap.parse_args()
    try:
        package = checked_package(args.package)
        if args.self_test:
            print(json.dumps({"status": "PASS", "package_sha256": PACKAGE_SHA,
                              "version": "1.0.1", "members": sorted(package),
                              "install_attempt_limit": 1, "recovery": "persistent exact 1.0.0 backups"}))
        if args.install:
            install(args.package)
        if not args.self_test and not args.install:
            raise Blocked("select --self-test or the separately coordinated --install step")
    except Exception as exc:
        print(f"BLOCKED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
