#!/usr/bin/env python3
"""Prove the concrete legacy OTA transaction rejects before device calls."""
from __future__ import annotations
import importlib.util
import json
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
script = ROOT / "scripts/hbnf_packet20_r2_live_transaction.py"
spec = importlib.util.spec_from_file_location("packet20_live_transaction", script)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix="hbnf_live_entrypoint_guard_") as td:
    tmp = pathlib.Path(td)
    candidate = tmp / "candidate.bin"
    rollback = tmp / "rollback.bin"
    candidate.write_bytes(b"not-r2")
    rollback.write_bytes(b"not-r4")
    admission = tmp / "invalid-admission.json"
    admission.write_text(json.dumps({"schema": "wrong"}) + "\n")
    out = tmp / "must-not-be-created"
    argv = [
        str(script), "--candidate-bin", str(candidate), "--admission", str(admission),
        "--candidate-provenance", str(tmp / "missing-provenance.json"),
        "--recovery-manifest", str(tmp / "missing-manifest.json"),
        "--recovery-signature", str(tmp / "missing-signature"),
        "--release-public-key", str(tmp / "missing-key"), "--recovery-bin", str(rollback),
        "--adapter", str(tmp / "missing-adapter.json"), "--inventory", str(tmp / "missing-inventory.json"),
        "--outdir", str(out),
    ]
    original_argv = sys.argv
    calls = []
    module.capture = lambda *a, **k: calls.append("capture")
    module.upload_once = lambda *a, **k: calls.append("upload")
    sys.argv = argv
    try:
        try:
            module.main()
        except RuntimeError as exc:
            assert "live-admission-rejected-before-device-access" in str(exc), exc
        else:
            raise AssertionError("invalid admission was accepted")
    finally:
        sys.argv = original_argv
    assert calls == [], f"device functions were reached: {calls}"
    assert not out.exists(), "transaction outputs were created before admission"

print("PASS: concrete OTA entrypoint rejects invalid admission before device request, upload, or transaction output")
