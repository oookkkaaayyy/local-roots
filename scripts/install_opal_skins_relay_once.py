#!/usr/bin/env python3
"""One-shot guarded installer for the already-approved Opal relay package.

Run from the canonical checkout on the Mac while it can reach 192.168.77.1,
192.168.77.10, and 192.168.77.11. It never changes router/Wi-Fi settings.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "staging/coordinated-backend/opal/hbnf-opal-skins-relay-1.0.0.tar.gz"
PACKAGE_SHA = "00d99d160b19830c12b38697997343e914231a0998a9c9b25a779fd149a30549"
V24_URL = "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control"
PROJECT_HOST = "phcpbvuqibyarpfrftgx.supabase.co"
CONFIG_URL = "https://hbnightflyers.com/config.js"
OPAL = "root@192.168.77.1"
MATRIX = "http://192.168.77.10"
AUX = "http://192.168.77.11"
MATRIX_MAC = "704bca5b345c"
AUX_MAC = "8c94df55c34c"
RELEASE = "hbnf-cart2-phase2-r6-vibe-first-ui-20261012"
SELECTOR = "skins-front-lock-v1"
FILES = {
    "hbnf-skins-relay": ("/usr/libexec/hbnf-skins-relay", "0755"),
    "hbnf-skins-relay-core.sh": ("/usr/lib/hbnf-skins-relay-core.sh", "0644"),
    "hbnf-skins-relay.init": ("/etc/init.d/hbnf-skins-relay", "0755"),
}
SERVICE = "/etc/init.d/hbnf-skins-relay"
REMOTE_ROOT = "/tmp/hbnf-skins-relay-install"


class Stop(Exception):
    pass


def say(message: str) -> None:
    print(message, flush=True)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def extract_verified() -> tuple[dict[str, bytes], dict]:
    if not PACKAGE.is_file():
        raise Stop("approved relay package is missing from this checkout")
    raw = PACKAGE.read_bytes()
    if digest(raw) != PACKAGE_SHA:
        raise Stop("package SHA-256 does not match the authorized value")
    with tarfile.open(PACKAGE, "r:gz") as tf:
        members = tf.getmembers()
        expected_names = {"hbnf-opal-skins-relay-1.0.0/" + n for n in (
            *FILES.keys(), "hbnf-skins-relay.conf.example", "README-skins-relay.md", "MANIFEST.json")}
        if {m.name for m in members} != expected_names or any(not m.isfile() for m in members):
            raise Stop("package member list or file types differ from the approved package")
        prefix = "hbnf-opal-skins-relay-1.0.0/"
        contents = {m.name[len(prefix):]: tf.extractfile(m).read() for m in members}
    manifest = json.loads(contents["MANIFEST.json"])
    if (manifest.get("version") != "1.0.0"
            or manifest.get("installed_matrix_firmware_sha256") != "43a33dfa21127a79f643ede9b2a054ff1aa21705b7733cfebea9c8a3e105c5f3"
            or manifest.get("installed_matrix_release") != RELEASE
            or manifest.get("requires_selector_version") != SELECTOR
            or manifest.get("supabase_function") != "hbnf-cart-control"):
        raise Stop("package manifest is not bound to the approved relay and installed Matrix")
    if set(manifest.get("files", {})) != set(contents) - {"MANIFEST.json"}:
        raise Stop("package manifest file list is incomplete")
    for name, expected in manifest["files"].items():
        if digest(contents[name]) != expected:
            raise Stop("package member hash mismatch: " + name)
    return contents, manifest


def parse_app_config(text: str) -> tuple[str, str]:
    # Accept only the current literal window.APP_CONFIG property format.
    if not re.search(r"window\s*\.\s*APP_CONFIG\s*=\s*\{", text):
        raise Stop("website config.js does not expose the expected APP_CONFIG")
    def prop(name: str) -> str:
        match = re.search(r"\b" + re.escape(name) + r"\s*:\s*(['\"])([^'\"\r\n]+)\1", text)
        if not match:
            raise Stop("website config.js is missing a required public setting")
        return match.group(2)
    url, key = prop("SUPABASE_URL"), prop("SUPABASE_ANON_KEY")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != PROJECT_HOST or parsed.path not in ("", "/"):
        raise Stop("website Supabase URL does not match the authorized project")
    if not re.fullmatch(r"[A-Za-z0-9._-]{20,2048}", key):
        raise Stop("website public API credential has an unsupported format")
    return url.rstrip("/"), key


def get_config() -> tuple[str, str]:
    request = urllib.request.Request(CONFIG_URL, headers={"User-Agent": "HBNF-Opal-Installer/1.0", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read(65537)
    except Exception as exc:
        raise Stop("cannot read the current public website configuration over HTTPS") from exc
    if len(raw) > 65536:
        raise Stop("website config.js exceeded the bounded size")
    return parse_app_config(raw.decode("utf-8", "strict"))


def request_json(url: str, *, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None, max_bytes: int = 65536) -> dict:
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            raw = response.read(max_bytes + 1)
    except Exception as exc:
        raise Stop("required local Matrix/AUX HTTP preflight did not succeed") from exc
    if len(raw) > max_bytes:
        raise Stop("device identity response exceeded the bounded size")
    try:
        value = json.loads(raw)
    except Exception as exc:
        raise Stop("device identity response was not valid JSON") from exc
    if not isinstance(value, dict):
        raise Stop("device response has an unexpected shape")
    return value


def preflight_devices() -> None:
    si = request_json(MATRIX + "/json/si")
    build = request_json(MATRIX + "/hbnf/build.json")
    if si.get("info", {}).get("ip") != "192.168.77.10" or si.get("info", {}).get("mac", "").replace(":", "").lower() != MATRIX_MAC:
        raise Stop("Matrix identity does not match the authorized device")
    if si.get("info", {}).get("ver") != "16.0.1" or si.get("state", {}).get("HBNF", {}).get("candidate") != RELEASE:
        raise Stop("Matrix firmware identity does not match the installed baseline")
    if build.get("release_id") != RELEASE or build.get("mac", "").replace(":", "").lower() != MATRIX_MAC or build.get("wled") != "16.0.1":
        raise Stop("Matrix build identity does not match the relay manifest")
    ai = request_json(AUX + "/json/info")
    ast = request_json(AUX + "/json/state")
    if ai.get("ip") != "192.168.77.11" or ai.get("mac", "").replace(":", "").lower() != AUX_MAC or ai.get("ver") != "16.0.1":
        raise Stop("AUX identity does not match the expected controller")
    if ast.get("live") is not True or ast.get("lm") != "DDP" or ast.get("lip") != "192.168.77.10":
        raise Stop("AUX DDP synchronization is not healthy before installation")
    hbnf = si.get("state", {}).get("HBNF", {})
    overlay = hbnf.get("overlayId")
    if overlay not in (None, "", False):
        raise Stop("a manual Matrix overlay is active; clear it before the one installation transaction")
    say("PASS: Matrix/AUX identity, firmware and DDP preflight")


def read_live_status(base_url: str, key: str) -> dict:
    body = b'{"action":"live_status"}'
    req = urllib.request.Request(V24_URL, data=body, method="POST", headers={
        "apikey": key, "Authorization": "Bearer " + key,
        "Accept": "application/json", "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read(32769)
    except Exception as exc:
        raise Stop("authorized Supabase live_status read did not succeed") from exc
    if len(raw) > 32768:
        raise Stop("Supabase live_status response exceeded the relay bound")
    try:
        result = json.loads(raw)
    except Exception as exc:
        raise Stop("Supabase live_status response was invalid JSON") from exc
    if not isinstance(result, dict) or result.get("selectorVersion") != SELECTOR or not isinstance(result.get("live"), dict):
        raise Stop("Supabase did not return the required v24 selector contract")
    return result


def matrix_post(snapshot: dict) -> bool:
    body = json.dumps(snapshot, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(MATRIX + "/hbnf/live", data=body, method="POST", headers={
        "Host": "192.168.77.10", "Origin": "http://192.168.77.10",
        "Content-Type": "application/json", "Cache-Control": "no-store"})
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            raw = response.read(2049)
    except Exception:
        return False
    try:
        return response.status == 200 and json.loads(raw).get("ok") is True
    except Exception:
        return False


def physical_overlay_check() -> None:
    # A local-only synthetic receiver check is safe: it never calls a scoring write route.
    entries = [f"TEST{i:02d} {i}" for i in range(1, 16)]
    snapshot = {"schema": "hbnf-live-v1", "active": True, "label": "F9", "acePot": 0, "entries": entries}
    if not matrix_post(snapshot):
        raise Stop("Matrix did not acknowledge the authorized synthetic local scoreboard")
    say("Synthetic TEST scoreboard sent to Matrix. Watch its pixels now; it will clear shortly.")
    time.sleep(15)
    if not matrix_post({"schema": "hbnf-live-v1", "active": False, "label": "", "acePot": 0, "entries": []}):
        raise Stop("Matrix did not acknowledge clearing the synthetic local scoreboard")
    try:
        answer = input("Did the TEST scoreboard visibly render, then normal Vibe animation resume? Type yes or no: ").strip().lower()
    except EOFError:
        answer = "no"
    if answer != "yes":
        raise Stop("owner could not confirm physical pixels and normal Vibe recovery")


def run(argv: list[str], *, input_bytes: bytes | None = None, prompt: bool = False, timeout: int = 20) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(argv, input=input_bytes, text=input_bytes is None, capture_output=not prompt, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Stop("a required local SSH/SCP operation could not complete") from exc


def main() -> int:
    self_test = len(sys.argv) == 2 and sys.argv[1] == "--self-test"
    if len(sys.argv) > 1 and not self_test:
        say("Usage: python3 scripts/install_opal_skins_relay_once.py [--self-test]")
        return 2
    try:
        contents, manifest = extract_verified()
        # The public key is never printed, passed in an argument, or written to a log.
        if self_test:
            installer_text = Path(__file__).read_text(encoding="utf-8")
            assert "StrictHostKeyChecking=yes" in installer_text
            assert "hbnf-skins-relay-1.0.0-attempted" in installer_text
            assert "--max-time 10" in installer_text and "--max-filesize 32768" in installer_text
            dummy = "sb_publishable_" + "x" * 24
            url, key = parse_app_config("window.APP_CONFIG = {SUPABASE_URL: 'https://" + PROJECT_HOST + "', SUPABASE_ANON_KEY: '" + dummy + "'};")
            assert url == "https://" + PROJECT_HOST and key == dummy
            try:
                parse_app_config("window.APP_CONFIG={SUPABASE_URL:'https://wrong.invalid',SUPABASE_ANON_KEY:'" + dummy + "'}")
            except Stop:
                pass
            else:
                raise AssertionError("foreign project URL must fail closed")
            say("PASS: exact package digest/member manifest and public-config parser fail-closed checks")
            return 0

        required = ("ssh", "curl", "python3")
        if sys.platform != "darwin" or any(shutil.which(item) is None for item in required):
            raise Stop("run this on the authorized macOS checkout with ssh, curl and python3")
        say("PASS: exact approved relay archive SHA-256 and member hashes")
        base_url, key = get_config()
        if base_url != "https://" + PROJECT_HOST:
            raise Stop("website points to a different Supabase project")
        live_result = read_live_status(base_url, key)
        say("PASS: current public website config and read-only Supabase v24 contract")
        preflight_devices()

        temp = Path(tempfile.mkdtemp(prefix="hbnf-opal-once-", dir="/tmp"))
        os.chmod(temp, 0o700)
        socket = str(temp / "c")
        master = False
        installed = False
        stage = REMOTE_ROOT + "-" + os.urandom(4).hex()
        ssh_common = ["-S", socket, "-o", "ControlMaster=auto", "-o", "ControlPersist=600", "-o", "ControlPath=" + socket, "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=6"]
        ssh_base = ["ssh", *ssh_common, OPAL]

        def remote(command: str, *, data: bytes | None = None, timeout: int = 30, interactive: bool = False) -> str:
            result = run([*ssh_base, command], input_bytes=data, prompt=interactive, timeout=timeout)
            if result.returncode != 0:
                failures = {
                    31: "router identity is not GL-SFT1200",
                    32: "router is missing curl, jsonfilter, sha256sum, install, or logger",
                    33: "router procd/init environment is incomplete",
                    34: "router CA bundle is unavailable",
                    35: "relay destination already exists; refusing a second installation",
                    36: "relay boot symlink already exists; refusing a second installation",
                    37: "router jsonfilter self-check failed",
                    38: "router HTTPS live_status request failed",
                    39: "router v24 selector marker mismatch",
                    40: "router returned an empty live_status response",
                    41: "relay destination changed during install preflight",
                    42: "procd boot-persistence symlink was not created",
                    43: "relay did not fetch valid live data after startup",
                    44: "router cannot read the installed Matrix build identity",
                    45: "router sees a different Matrix release",
                    46: "router sees a different Matrix MAC",
                    47: "the single authorized installation attempt was already consumed",
                }
                detail = failures.get(result.returncode, "router command failed with exit status " + str(result.returncode))
                raise Stop(detail + "; no retry was attempted")
            return result.stdout if not interactive else ""

        def upload(local: Path, remote_path: str, mode: str) -> None:
            remote("umask 077; cat > " + shlex.quote(remote_path), data=local.read_bytes())
            remote("chmod " + mode + " " + shlex.quote(remote_path))

        try:
            # Require an already-known router host key. Any SSH password prompt is handled by OpenSSH in Terminal only.
            first = run(["ssh", "-M", "-N", "-f", "-S", socket, "-o", "ControlMaster=yes", "-o", "ControlPersist=600", "-o", "ControlPath=" + socket, "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=6", OPAL], prompt=True, timeout=30)
            if first.returncode != 0:
                raise Stop("authenticated, host-key-verified Opal SSH access is unavailable")
            master = True
            remote("mkdir -m 700 " + shlex.quote(stage))

            # Securely stage the existing public key only after Mac/device identity checks.
            config_path = temp / "relay.conf"
            config_path.write_text("# Public website key; do not print.\nSUPABASE_ANON_KEY='" + key + "'\n", encoding="ascii")
            os.chmod(config_path, 0o600)
            upload(config_path, stage + "/relay.conf", "600")
            key = ""  # do not retain the credential in Python state beyond the staged file

            check_script = f'''set -eu
STAGE={shlex.quote(stage)}
umask 077
MODEL="$(ubus call system board | jsonfilter -e '@.model.name' 2>/dev/null)"
case "$MODEL" in *GL-SFT1200*) ;; *) exit 31;; esac
for c in curl jsonfilter sha256sum install logger logread; do command -v "$c" >/dev/null 2>&1 || exit 32; done
[ -x /sbin/procd ] && [ -d /etc/rc.d ] && [ -d /etc/init.d ] || exit 33
[ -s /etc/ssl/certs/ca-certificates.crt ] || [ -s /etc/ssl/cert.pem ] || exit 34
[ ! -e /usr/libexec/hbnf-skins-relay ] && [ ! -e /usr/lib/hbnf-skins-relay-core.sh ] && [ ! -e /etc/init.d/hbnf-skins-relay ] && [ ! -e /etc/hbnf-skins-relay.conf ] || exit 35
[ ! -L /etc/rc.d/S95hbnf-skins-relay ] && [ ! -L /etc/rc.d/K10hbnf-skins-relay ] || exit 36
[ ! -e /etc/hbnf-skins-relay-1.0.0-attempted ] || exit 47
printf '{{"x":1}}' > "$STAGE/jf.json"
[ "$(jsonfilter -i "$STAGE/jf.json" -e '@.x')" = 1 ] || exit 37
. "$STAGE/relay.conf"
printf 'header = "apikey: %s"\\nheader = "Authorization: Bearer %s"\\n' "$SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY" > "$STAGE/curl-auth.conf"
chmod 600 "$STAGE/curl-auth.conf"
unset SUPABASE_ANON_KEY
curl -fsS --connect-timeout 4 --max-time 10 --max-filesize 32768 --config "$STAGE/curl-auth.conf" \\
 -H 'Accept: application/json' -H 'Cache-Control: no-cache, no-store' -H 'Content-Type: application/json' \\
 --data-binary '{{"action":"live_status"}}' {shlex.quote(V24_URL)} -o "$STAGE/live.json" || exit 38
[ "$(jsonfilter -i "$STAGE/live.json" -e '@.selectorVersion')" = {shlex.quote(SELECTOR)} ] || exit 39
test -s "$STAGE/live.json" || exit 40
curl -fsS --connect-timeout 2 --max-time 4 --max-filesize 2048 \\
 http://192.168.77.10/hbnf/build.json -o "$STAGE/matrix-build.json" || exit 44
[ "$(jsonfilter -i "$STAGE/matrix-build.json" -e '@.release_id')" = {shlex.quote(RELEASE)} ] || exit 45
[ "$(jsonfilter -i "$STAGE/matrix-build.json" -e '@.mac' | tr -d ':' | tr '[:upper:]' '[:lower:]')" = {shlex.quote(MATRIX_MAC)} ] || exit 46
'''
            remote("sh -s", data=check_script.encode(), timeout=25)
            say("PASS: GL-SFT1200, OpenWrt tools/procd/CA, jsonfilter, HTTPS verification and live v24 read from the router")

            # Stage the exact binaries. No destination exists, so rollback removes only files created here.
            extracted = temp / "files"
            extracted.mkdir(mode=0o700)
            for name, data in contents.items():
                p = extracted / name
                p.write_bytes(data)
                os.chmod(p, 0o600)
            for name in FILES:
                upload(extracted / name, stage + "/" + name, "600")
                expected = manifest["files"][name]
                remote("printf '%s  %s\\n' " + shlex.quote(expected) + " " + shlex.quote(stage + "/" + name) + " | sha256sum -c -")

            install_script = f'''set -eu
STAGE={shlex.quote(stage)}
DONE=0
rollback() {{
  [ "$DONE" = 1 ] && return 0
  {SERVICE} stop >/dev/null 2>&1 || true
  {SERVICE} disable >/dev/null 2>&1 || true
  rm -f /etc/rc.d/S95hbnf-skins-relay /etc/rc.d/K10hbnf-skins-relay
  rm -f /usr/libexec/hbnf-skins-relay /usr/lib/hbnf-skins-relay-core.sh {SERVICE} /etc/hbnf-skins-relay.conf
}}
trap rollback EXIT HUP INT TERM
[ ! -e /usr/libexec/hbnf-skins-relay ] && [ ! -e /usr/lib/hbnf-skins-relay-core.sh ] && [ ! -e {SERVICE} ] && [ ! -e /etc/hbnf-skins-relay.conf ] || exit 41
printf '%s\\n' 'package 1.0.0 install attempt consumed' > "$STAGE/attempted"
install -o root -g root -m 0600 "$STAGE/attempted" /etc/hbnf-skins-relay-1.0.0-attempted
install -o root -g root -m 0755 "$STAGE/hbnf-skins-relay" /usr/libexec/hbnf-skins-relay
install -o root -g root -m 0644 "$STAGE/hbnf-skins-relay-core.sh" /usr/lib/hbnf-skins-relay-core.sh
install -o root -g root -m 0755 "$STAGE/hbnf-skins-relay.init" {SERVICE}
install -o root -g root -m 0600 "$STAGE/relay.conf" /etc/hbnf-skins-relay.conf
{SERVICE} enable
[ -L /etc/rc.d/S95hbnf-skins-relay ] || exit 42
rm -rf /tmp/hbnf-skins-relay
{SERVICE} start
N=0
while [ "$N" -lt 30 ]; do
  if ps w | grep -F '/usr/libexec/hbnf-skins-relay' | grep -v grep >/dev/null \\
     && [ -s /tmp/hbnf-skins-relay/live.json ] && [ -s /tmp/hbnf-skins-relay/snapshot.json ] \\
     && [ "$(jsonfilter -i /tmp/hbnf-skins-relay/live.json -e '@.selectorVersion' 2>/dev/null)" = {shlex.quote(SELECTOR)} ]; then break; fi
  N=$((N + 1)); sleep 1
done
[ "$N" -lt 30 ] || exit 43
DONE=1
trap - EXIT HUP INT TERM
rm -rf "$STAGE"
echo HBNF_RELAY_INSTALL_COMMITTED
'''
            remote("sh -s", data=install_script.encode(), timeout=35)
            installed = True
            svc_raw = remote("ubus call service list '{\"name\":\"hbnf-skins-relay\"}'", timeout=10)
            try:
                svc = json.loads(svc_raw).get("hbnf-skins-relay", {})
                instances = svc.get("instances", {})
                running = any(int(v.get("pid", 0)) > 0 for v in instances.values())
            except Exception:
                running = False
            if not running:
                raise Stop("procd did not report a running relay; automatic rollback is required")
            remote("test -s /tmp/hbnf-skins-relay/live.json && test -s /tmp/hbnf-skins-relay/snapshot.json && [ \"$(jsonfilter -i /tmp/hbnf-skins-relay/live.json -e '@.selectorVersion')\" = " + shlex.quote(SELECTOR) + " ]", timeout=10)
            live_active = remote("jsonfilter -i /tmp/hbnf-skins-relay/live.json -e '@.live.active' 2>/dev/null || echo false", timeout=10).strip().splitlines()[-1]
            if live_active == "true":
                accepted = remote("logread -e hbnf-skins-relay | grep -Fq 'fresh Skins snapshot accepted by Matrix' && echo yes || echo no", timeout=10).strip()
                if accepted != "yes":
                    raise Stop("active live standings were not confirmed accepted by Matrix")
                say("PASS: the running relay fetched active live standings and logged Matrix acceptance")
                try:
                    answer = input("Did the live standings visibly render and normal Vibe animation resume? Type yes or no: ").strip().lower()
                except EOFError:
                    answer = "no"
                if answer != "yes":
                    raise Stop("owner could not confirm live scoreboard pixels and normal Vibe recovery")
            else:
                physical_overlay_check()
                say("PASS: synthetic local scoreboard was acknowledged, physically confirmed, and cleared; no scoring data was changed")
            remote("rm -rf " + shlex.quote(stage))
            # Mark transaction committed only after startup persistence and first successful live fetch.
            say("PASS: relay enabled at boot, procd process running, and its first fresh v24 read completed")
            say("The relay remains installed. Manual-overlay precedence, real four-minute redisplay, and recovery after a WAN interruption remain separate physical observations; do not treat HTTP acceptance as proof of those behaviors.")
            say("If the physical test fails, immediately run the rollback command shown below; it stops and disables only this relay and removes its files/config.")
            say("Rollback command: ssh root@192.168.77.1 ' /etc/init.d/hbnf-skins-relay stop; /etc/init.d/hbnf-skins-relay disable; rm -f /etc/rc.d/S95hbnf-skins-relay /etc/rc.d/K10hbnf-skins-relay /usr/libexec/hbnf-skins-relay /usr/lib/hbnf-skins-relay-core.sh /etc/init.d/hbnf-skins-relay /etc/hbnf-skins-relay.conf ' ")
            return 0
        except Stop:
            # If installation has not started, remove only the unique temporary staging directory.
            # If remote install began and failed, its own trap removed the installed service/files.
            try:
                if master:
                    if installed:
                        rollback_script = "set +e; " + SERVICE + " stop >/dev/null 2>&1; " + SERVICE + " disable >/dev/null 2>&1; rm -f /etc/rc.d/S95hbnf-skins-relay /etc/rc.d/K10hbnf-skins-relay /usr/libexec/hbnf-skins-relay /usr/lib/hbnf-skins-relay-core.sh " + SERVICE + " /etc/hbnf-skins-relay.conf; rm -rf /tmp/hbnf-skins-relay " + shlex.quote(stage)
                        remote("sh -c " + shlex.quote(rollback_script), timeout=12)
                        say("ROLLBACK: relay stopped, disabled, and its installed files/config removed")
                    else:
                        remote("rm -rf " + shlex.quote(stage), timeout=10)
            except Stop:
                pass
            raise
        finally:
            if master:
                subprocess.run(["ssh", "-S", socket, "-o", "ControlPath=" + socket, "-O", "exit", OPAL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=5)
            shutil.rmtree(temp, ignore_errors=True)
    except Stop as exc:
        say("STOP: " + str(exc) + ". No further automatic attempt will be made.")
        return 1
    except Exception as exc:
        say("STOP: installer failed closed (" + type(exc).__name__ + "). No further automatic attempt will be made.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
