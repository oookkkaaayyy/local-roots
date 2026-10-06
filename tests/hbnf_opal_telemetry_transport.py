#!/usr/bin/env python3
"""Offline contract checks for the Opal-origin Foundation telemetry transport."""
from __future__ import annotations

import json
import pathlib
import subprocess
import tempfile
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "scripts"))
import hbnf_opal_telemetry_transport as transport

payload = {name: {"ok": name} for name in transport.PATHS}
successful = subprocess.CompletedProcess([], 0, json.dumps(payload), "")
with tempfile.TemporaryDirectory(prefix="hbnf-opal-transport-") as td:
    transport.SSH_KEY = pathlib.Path(td) / "key"
    transport.SSH_KEY.touch()
    with mock.patch.object(transport.subprocess, "run", return_value=successful) as run:
        bodies, elapsed = transport.fetch(str(pathlib.Path(td) / "run"))
    assert set(bodies) == set(transport.PATHS)
    assert elapsed >= 0
    argv = run.call_args.args[0]
    remote = argv[-1]
    assert "PasswordAuthentication=no" in argv
    assert "IdentitiesOnly=yes" in argv
    assert all(url in remote for url in transport.PATHS.values())
    assert remote.count("curl --silent") == 5
    assert all(f"wait \"$p_{name}\"" in remote for name in transport.PATHS)
    print("PASS: five fixed read-only LAN endpoints are fetched concurrently over key-only Opal SSH")

with tempfile.TemporaryDirectory(prefix="hbnf-opal-transport-fail-") as td:
    transport.SSH_KEY = pathlib.Path(td) / "key"
    transport.SSH_KEY.touch()
    failed = subprocess.CompletedProcess([], 41, "partial", "one endpoint timed out")
    with mock.patch.object(transport.subprocess, "run", return_value=failed):
        try:
            transport.fetch(td)
            raise AssertionError("transport failure accepted")
        except RuntimeError as exc:
            assert "opal-origin-parallel-telemetry-failed" in str(exc)
    receipt = pathlib.Path(td) / "TELEMETRY_OPAL_READ_FAILURES.jsonl"
    data = json.loads(receipt.read_text().splitlines()[0])
    assert data["transport"] == "ssh-key/opalshell-concurrent-curl"
    assert data["partial_stdout_sha256"]
    print("PASS: transport failure is fail-closed and a durable failure receipt is written")
