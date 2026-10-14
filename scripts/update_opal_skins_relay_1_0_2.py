#!/usr/bin/env python3
"""One guarded, one-attempt update of the installed Opal relay to 1.0.2."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import pathlib
import shlex
import shutil
import subprocess
import sys
import tarfile

PACKAGE_SHA = "b28aaa67a01c181d169ba26f759e1409beaff2524886880ed4da17a437ca9d0f"
MATRIX = "http://192.168.77.10"
AUX = "http://192.168.77.11"
MATRIX_MAC = "704bca5b345c"
AUX_MAC = "8c94df55c34c"
RELEASE = "hbnf-cart2-phase2-r6-skins-readable-20261014"
RELEASE_SHA = "de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d"
OPAL = "root@192.168.77.1"
IDENTITY = pathlib.Path.home() / ".ssh" / "hbnf_opal_rsa"
OLD = {
    "/usr/libexec/hbnf-skins-relay": "81f114c7f64040301d9443d4169bb917931daac7cf09d3351541db5464e041bf",
    "/usr/lib/hbnf-skins-relay-core.sh": "d0d6d0597db1d086fbdb0afcbbfd65f276b7450680c20433f67623f57f61afd5",
    "/etc/init.d/hbnf-skins-relay": "4dd9ad2e3105dcd3a8b87e9369a6806d736b14839a17b3edb1d59eccd09b1e60",
}
NEW_CORE = "75637afeed98edbde9acce1aa0a04362c52272e970c87fa72cd08678539dc6be"
MARK = "/etc/hbnf-skins-relay-1.0.2-update-attempted"
BACKUP = "/root/hbnf-skins-relay-1.0.1-backup-20261014"


class Blocked(RuntimeError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_package(path: pathlib.Path) -> dict[str, bytes]:
    raw = path.read_bytes()
    if digest(raw) != PACKAGE_SHA:
        raise Blocked("exact 1.0.2 relay package SHA mismatch")
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
            members = archive.getmembers()
            prefix = "hbnf-opal-skins-relay-1.0.2/"
            if len(members) != 6 or any(not m.isfile() or m.issym() or m.islnk() for m in members):
                raise Blocked("package member types/count are invalid")
            data: dict[str, bytes] = {}
            for member in members:
                if not member.name.startswith(prefix):
                    raise Blocked("package contains an unexpected path")
                name = member.name[len(prefix):]
                if not name or "/" in name:
                    raise Blocked("package contains a nested or empty path")
                stream = archive.extractfile(member)
                if stream is None:
                    raise Blocked("package member could not be read")
                data[name] = stream.read()
    except (OSError, tarfile.TarError) as exc:
        raise Blocked("relay package archive is invalid") from exc
    try:
        manifest = json.loads(data.pop("MANIFEST.json"))
    except (KeyError, ValueError) as exc:
        raise Blocked("package manifest is missing or invalid") from exc
    expected_releases = {
        "hbnf-cart2-phase2-r6-vibe-first-ui-20261012": "43a33dfa21127a79f643ede9b2a054ff1aa21705b7733cfebea9c8a3e105c5f3",
        RELEASE: RELEASE_SHA,
    }
    if manifest.get("version") != "1.0.2" or manifest.get("compatible_matrix_releases") != expected_releases:
        raise Blocked("package version or exact Matrix-release bindings mismatch")
    if manifest.get("files") != {name: digest(value) for name, value in data.items()}:
        raise Blocked("package member hash mismatch")
    if digest(data.get("hbnf-skins-relay", b"")) != OLD["/usr/libexec/hbnf-skins-relay"]:
        raise Blocked("1.0.2 unexpectedly changes the relay process")
    if digest(data.get("hbnf-skins-relay.init", b"")) != OLD["/etc/init.d/hbnf-skins-relay"]:
        raise Blocked("1.0.2 unexpectedly changes the boot service")
    if digest(data.get("hbnf-skins-relay-core.sh", b"")) != NEW_CORE:
        raise Blocked("1.0.2 formatter bytes differ from the reviewed source")
    return data


def ssh_base() -> list[str]:
    if shutil.which("ssh") is None or not IDENTITY.is_file():
        raise Blocked("existing passwordless Opal SSH identity is unavailable")
    return ["ssh", "-i", str(IDENTITY), "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "HostKeyAlgorithms=+ssh-rsa", "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa",
            "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", OPAL]


def read_json(url: str) -> dict:
    import urllib.request
    req = urllib.request.Request(url, headers={"Cache-Control": "no-store"})
    with urllib.request.urlopen(req, timeout=4) as response:
        data = response.read(32769)
    if len(data) > 32768:
        raise Blocked("device read exceeded the established response limit")
    value = json.loads(data)
    if not isinstance(value, dict):
        raise Blocked("device returned a non-object response")
    return value


def device_preflight() -> dict:
    info = read_json(MATRIX + "/json/info")
    build = read_json(MATRIX + "/hbnf/build.json")
    state = read_json(MATRIX + "/json/state")
    aux = read_json(AUX + "/json/info")
    hbnf = state.get("HBNF", {})
    if (info.get("ip") != "192.168.77.10" or info.get("mac", "").replace(":", "").lower() != MATRIX_MAC
            or info.get("ver") != "16.0.1" or build.get("release_id") != RELEASE
            or build.get("candidate") != RELEASE or build.get("mac", "").replace(":", "").lower() != MATRIX_MAC
            or build.get("firmware_sha256") not in (None, RELEASE_SHA)
            or hbnf.get("candidate") != RELEASE or hbnf.get("matrixBrightness") != 53
            or hbnf.get("auxBrightness") != 51 or hbnf.get("vibe") != 5):
        raise Blocked("fresh Matrix identity/release/settings preflight failed")
    if (aux.get("ip") != "192.168.77.11" or aux.get("mac", "").replace(":", "").lower() != AUX_MAC
            or aux.get("live") is not True or aux.get("lm") != "DDP" or aux.get("lip") != "192.168.77.10"
            or aux.get("leds", {}).get("count") != 22):
        raise Blocked("fresh AUX identity/DDP preflight failed")
    if hbnf.get("overlayId") not in (None, "", False) or hbnf.get("gameActive") is True:
        raise Blocked("a manual overlay/game is active; relay restart could interrupt it")
    return {"matrix_release": build["release_id"], "matrix_settings": {
        "matrix": hbnf["matrixBrightness"], "aux": hbnf["auxBrightness"], "vibe": hbnf["vibe"]},
        "aux_ddp": "healthy"}


def remote_preflight() -> str:
    command = f'''set -eu
MODEL="$(ubus call system board | jsonfilter -e '@.model' 2>/dev/null)"
case "$MODEL" in *GL-SFT1200*) ;; *) exit 31;; esac
for c in sha256sum cp mv chmod mkdir logger logread cat curl jsonfilter; do command -v "$c" >/dev/null 2>&1 || exit 32; done
[ -x /sbin/procd ] && [ -L /etc/rc.d/S95hbnf-skins-relay ] || exit 33
[ -f /etc/hbnf-skins-relay.conf ] && [ ! -L /etc/hbnf-skins-relay.conf ] || exit 34
ls -ldn /etc/hbnf-skins-relay.conf | awk '$1 == "-rw-------" && $2 == "1" && $3 == "0" && $4 == "0" {{ ok=1 }} END {{ exit (ok ? 0 : 1) }}' || exit 35
[ ! -e {MARK} ] || exit 36
[ ! -e {BACKUP} ] || exit 37
AUTH=/tmp/hbnf-skins-relay/curl-auth.conf
[ -f "$AUTH" ] && [ ! -L "$AUTH" ] || exit 38
ls -ldn "$AUTH" | awk '$1 == "-rw-------" && $2 == "1" && $3 == "0" && $4 == "0" {{ ok=1 }} END {{ exit (ok ? 0 : 1) }}' || exit 39
'''
    for path, expected in OLD.items():
        command += f"test \"$(sha256sum {shlex.quote(path)} | awk '{{print $1}}')\" = '{expected}' || exit 40\n"
    command += f'''T=/tmp/hbnf-relay-preflight.$$
umask 077
curl -fsS --connect-timeout 4 --max-time 8 --max-filesize 32768 --config "$AUTH" \\
  -H 'Accept: application/json' -H 'Cache-Control: no-cache, no-store' -H 'Content-Type: application/json' \\
  --data-binary '{{"action":"live_status"}}' \\
  'https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control' -o "$T" || {{ rm -f "$T"; exit 41; }}
test "$(jsonfilter -q -i "$T" -e '@.selectorVersion' 2>/dev/null)" = 'skins-front-lock-v1' || {{ rm -f "$T"; exit 42; }}
rm -f "$T"
/etc/init.d/hbnf-skins-relay status >/dev/null 2>&1 || exit 43
ps w | grep -q '[h]bnf-skins-relay' || exit 44
echo OPAL_RELAY_1_0_1_PREFLIGHT_PASS
'''
    result = subprocess.run(ssh_base() + ["sh -s"], input=command.encode(), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=25)
    if result.returncode or "OPAL_RELAY_1_0_1_PREFLIGHT_PASS" not in result.stdout.decode(errors="replace"):
        raise Blocked("fresh read-only Opal preflight failed: " + result.stderr.decode(errors="replace")[-300:])
    return "pass"


def update(path: pathlib.Path) -> dict:
    data = checked_package(path)
    before = device_preflight()
    remote_preflight()
    stage = "/tmp/hbnf-skins-relay-1.0.2-update"
    subprocess.run(ssh_base() + [f"umask 077; mkdir -m 700 {shlex.quote(stage)}"], check=True, timeout=15,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        core_path = stage + "/hbnf-skins-relay-core.sh"
        subprocess.run(ssh_base() + [f"umask 077; cat > {shlex.quote(core_path)}"], input=data["hbnf-skins-relay-core.sh"],
                       check=True, timeout=20, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        subprocess.run(ssh_base() + [f"chmod 0600 {shlex.quote(core_path)}"], check=True, timeout=10,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        command = f'''set -eu
STAGE={stage}
BACKUP={BACKUP}
MARK={MARK}
CONFIG_SHA_BEFORE="$(sha256sum /etc/hbnf-skins-relay.conf | awk '{{print $1}}')"
mkdir -m 700 "$BACKUP" 2>/dev/null || exit 51
cp /usr/libexec/hbnf-skins-relay "$BACKUP/hbnf-skins-relay"
cp /usr/lib/hbnf-skins-relay-core.sh "$BACKUP/hbnf-skins-relay-core.sh"
cp /etc/init.d/hbnf-skins-relay "$BACKUP/hbnf-skins-relay.init"
chmod 0700 "$BACKUP"; chmod 0600 "$BACKUP"/*
printf '%s\\n' '1.0.2 relay formatter update attempt consumed' > "$MARK"
chmod 0600 "$MARK"
test "$(sha256sum "$STAGE/hbnf-skins-relay-core.sh" | awk '{{print $1}}')" = '{NEW_CORE}' || exit 52
OLD_OK=1
restore_old() {{
  /etc/init.d/hbnf-skins-relay stop >/dev/null 2>&1 || true
  cp "$BACKUP/hbnf-skins-relay" /usr/libexec/hbnf-skins-relay
  cp "$BACKUP/hbnf-skins-relay-core.sh" /usr/lib/hbnf-skins-relay-core.sh
  cp "$BACKUP/hbnf-skins-relay.init" /etc/init.d/hbnf-skins-relay
  chmod 0755 /usr/libexec/hbnf-skins-relay /etc/init.d/hbnf-skins-relay
  chmod 0644 /usr/lib/hbnf-skins-relay-core.sh
  /etc/init.d/hbnf-skins-relay start
}}
trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$OLD_OK" = 1 ]; then restore_old; fi; exit "$rc"' EXIT HUP INT TERM
/etc/init.d/hbnf-skins-relay stop
cp "$STAGE/hbnf-skins-relay-core.sh" /usr/lib/.hbnf-skins-relay-core.sh.new
chmod 0644 /usr/lib/.hbnf-skins-relay-core.sh.new
mv /usr/lib/.hbnf-skins-relay-core.sh.new /usr/lib/hbnf-skins-relay-core.sh
ash -n /usr/libexec/hbnf-skins-relay /usr/lib/hbnf-skins-relay-core.sh
/etc/init.d/hbnf-skins-relay start
sleep 2
/etc/init.d/hbnf-skins-relay status >/dev/null 2>&1
ps w | grep -q '[h]bnf-skins-relay'
test "$(sha256sum /usr/libexec/hbnf-skins-relay | awk '{{print $1}}')" = '{OLD['/usr/libexec/hbnf-skins-relay']}'
test "$(sha256sum /usr/lib/hbnf-skins-relay-core.sh | awk '{{print $1}}')" = '{NEW_CORE}'
test "$(sha256sum /etc/init.d/hbnf-skins-relay | awk '{{print $1}}')" = '{OLD['/etc/init.d/hbnf-skins-relay']}'
test "$(sha256sum /etc/hbnf-skins-relay.conf | awk '{{print $1}}')" = "$CONFIG_SHA_BEFORE"
OLD_OK=0
echo OPAL_RELAY_1_0_2_UPDATE_PASS
'''
        result = subprocess.run(ssh_base() + ["sh -s"], input=command.encode(), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=45)
        if result.returncode or "OPAL_RELAY_1_0_2_UPDATE_PASS" not in result.stdout.decode(errors="replace"):
            raise Blocked("single update failed; inspect preserved exact 1.0.1 backup and service logs")
        try:
            after = device_preflight()
            if after != before:
                raise Blocked("post-update Matrix/AUX identity or owner settings differ from fresh preflight")
        except Exception as exc:
            rollback = f'''set -eu
BACKUP={BACKUP}
test -d "$BACKUP" || exit 61
test "$(sha256sum "$BACKUP/hbnf-skins-relay" | awk '{{print $1}}')" = '{OLD['/usr/libexec/hbnf-skins-relay']}' || exit 62
test "$(sha256sum "$BACKUP/hbnf-skins-relay-core.sh" | awk '{{print $1}}')" = '{OLD['/usr/lib/hbnf-skins-relay-core.sh']}' || exit 63
/etc/init.d/hbnf-skins-relay stop >/dev/null 2>&1 || true
cp "$BACKUP/hbnf-skins-relay" /usr/libexec/hbnf-skins-relay
cp "$BACKUP/hbnf-skins-relay-core.sh" /usr/lib/hbnf-skins-relay-core.sh
cp "$BACKUP/hbnf-skins-relay.init" /etc/init.d/hbnf-skins-relay
chmod 0755 /usr/libexec/hbnf-skins-relay /etc/init.d/hbnf-skins-relay
chmod 0644 /usr/lib/hbnf-skins-relay-core.sh
ash -n /usr/libexec/hbnf-skins-relay /usr/lib/hbnf-skins-relay-core.sh
/etc/init.d/hbnf-skins-relay start
test "$(sha256sum /usr/lib/hbnf-skins-relay-core.sh | awk '{{print $1}}')" = '{OLD['/usr/lib/hbnf-skins-relay-core.sh']}'
echo OPAL_RELAY_1_0_1_ROLLBACK_PASS
'''
            restored = subprocess.run(ssh_base() + ["sh -s"], input=rollback.encode(), stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, timeout=30)
            if restored.returncode or "OPAL_RELAY_1_0_1_ROLLBACK_PASS" not in restored.stdout.decode(errors="replace"):
                raise Blocked("post-update health failed and exact 1.0.1 relay rollback could not be verified") from exc
            raise Blocked("post-update health differed; exact 1.0.1 relay/core/init restored") from exc
        return {"status": "OPAL_RELAY_1_0_2_INSTALLED", "package_sha256": PACKAGE_SHA,
                "matrix_release": before["matrix_release"], "settings_preserved": before["matrix_settings"],
                "aux_ddp": before["aux_ddp"], "exact_1_0_1_backup": BACKUP,
                "website_scoring_or_matrix_firmware_changed": False}
    finally:
        subprocess.run(ssh_base() + ["rm -rf " + shlex.quote(stage)], timeout=10,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--package", type=pathlib.Path, required=True)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--install", action="store_true")
    args = ap.parse_args()
    try:
        package = checked_package(args.package)
        if args.self_test:
            print(json.dumps({"status": "PASS", "package_sha256": PACKAGE_SHA, "version": "1.0.2",
                              "members": sorted(package), "one_attempt_marker": MARK,
                              "recovery": "exact 1.0.1 relay/core/init backup"}, sort_keys=True))
        if args.install:
            print(json.dumps(update(args.package), sort_keys=True))
        if not args.self_test and not args.install:
            raise Blocked("select --self-test or the separately authorized --install step")
    except Exception as exc:
        print(f"BLOCKED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
