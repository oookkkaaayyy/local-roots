#!/usr/bin/env python3
"""Run the existing Foundation telemetry contract over Opal-origin LAN reads.

The Matrix API was responsive from Opal while two simultaneous Mac-origin GETs
timed out. This adapter keeps the existing sample validation and independent
sampler/state-changer, but originates the five bounded reads on Opal.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import shlex
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import hbnf_foundation_live_adapter as adapter

SSH_KEY = pathlib.Path.home() / ".ssh/hbnf_opal_rsa"
SSH_HOST = "root@192.168.77.1"
PATHS = {
    "matrix_info": "http://192.168.77.10/json/info",
    "matrix_build": "http://192.168.77.10/hbnf/build.json",
    "matrix_state": "http://192.168.77.10/json/state",
    "aux_info": "http://192.168.77.11/json/info",
    "aux_state": "http://192.168.77.11/json/state",
}
CURL_TIMEOUT_SECONDS = 8
SSH_COMMAND_TIMEOUT_SECONDS = 11


def fetch(session_id: str) -> tuple[dict, float]:
    started = time.monotonic()
    if not SSH_KEY.is_file():
        raise RuntimeError(f"verified Opal SSH identity missing: {SSH_KEY}")
    names = list(PATHS)
    commands = []
    for name, url in PATHS.items():
        target = f"$d/{name}.json"
        commands.append(
            f"curl --silent --show-error --fail --connect-timeout 2 --max-time {CURL_TIMEOUT_SECONDS} "
            f"{shlex.quote(url)} -o {target} & p_{name}=$!"
        )
    waits = "\n".join(f"wait \"$p_{name}\" || exit 41" for name in names)
    pieces = ["printf '{'"]
    for index, name in enumerate(names):
        if index:
            pieces.append("printf ','")
        pieces.extend([f"printf '\"{name}\":'", f"cat \"$d/{name}.json\""])
    pieces.append("printf '}'")
    remote = (
        "set -u; d=$(mktemp -d /tmp/hbnf-telemetry.XXXXXX) || exit 42; "
        "trap 'rm -rf \"$d\"' EXIT; " + "; ".join(commands) + "; " + waits +
        "; " + "; ".join(pieces)
    )
    argv = [
        "ssh", "-T", "-i", str(SSH_KEY), "-o", "IdentitiesOnly=yes",
        "-o", "HostKeyAlgorithms=+ssh-rsa", "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa",
        "-o", "PasswordAuthentication=no", "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=5", SSH_HOST, remote,
    ]
    try:
        proc = subprocess.run(argv, text=True, capture_output=True,
                              timeout=SSH_COMMAND_TIMEOUT_SECONDS, check=False)
        if proc.returncode:
            raise RuntimeError(f"Opal-origin telemetry command rc={proc.returncode}: {proc.stderr[-1000:]}")
        payload = json.loads(proc.stdout)
        if set(payload) != set(PATHS):
            raise RuntimeError(f"Opal-origin telemetry endpoint set mismatch: {sorted(payload)}")
        bodies = {}
        for name, body in payload.items():
            if not isinstance(body, dict):
                raise RuntimeError(f"Opal-origin telemetry response is not JSON object: {name}")
            bodies[name] = body
        return bodies, time.monotonic() - started
    except Exception as exc:
        failure = {
            "schema": "hbnf-opal-origin-parallel-read-failure-v1",
            "captured_at_unix": time.time(),
            "transport": "ssh-key/opalshell-concurrent-curl",
            "request_timeout_seconds": CURL_TIMEOUT_SECONDS,
            "error": f"{type(exc).__name__}: {exc}",
            "partial_stdout_sha256": hashlib.sha256(
                (locals().get("proc").stdout if "proc" in locals() else "").encode()
            ).hexdigest(),
        }
        out = pathlib.Path(session_id)
        out.mkdir(parents=True, exist_ok=True)
        path = out / "TELEMETRY_OPAL_READ_FAILURES.jsonl"
        with path.open("a") as stream:
            stream.write(json.dumps(failure, sort_keys=True, separators=(",", ":")) + "\n")
            stream.flush()
        raise RuntimeError("opal-origin-parallel-telemetry-failed:" + json.dumps(failure, sort_keys=True)) from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--session-id", required=True)
    args = parser.parse_args()
    adapter._parallel_soak_reads = lambda _session: fetch(args.session_id)
    sample = adapter.telemetry(args.inventory, args.session_id, emit=False)
    print(json.dumps(sample, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
