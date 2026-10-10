#!/usr/bin/env python3
"""Exercise the public platform command path without touching a device or service."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLATFORM = ROOT / "scripts/platform.py"

with tempfile.TemporaryDirectory(prefix="platform_execute_") as td:
    repo = pathlib.Path(td)
    scripts = repo / "scripts"
    config = repo / "config"
    scripts.mkdir()
    config.mkdir()
    shutil.copy2(PLATFORM, scripts / "platform.py")
    shutil.copy2(ROOT / "scripts/hbnf_guarded_run.py", scripts / "hbnf_guarded_run.py")
    shutil.copy2(ROOT / "scripts/hbnf_control.py", scripts / "hbnf_control.py")
    shutil.copy2(ROOT / "config/HBNF_CONTROL_MODEL.json", config / "HBNF_CONTROL_MODEL.json")

    state = json.loads((ROOT / "config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"] = "PHASE2_INTEGRATING"
    state["live_mutation_authorized"] = True
    (config / "HBNF_CONTROL_STATE.json").write_text(json.dumps(state))

    marker = repo / "child-ran.marker"
    child = [
        sys.executable,
        "-c",
        f"from pathlib import Path; Path({str(marker)!r}).write_text('ran')",
    ]

    def run(*args):
        return subprocess.run(
            [sys.executable, str(scripts / "platform.py"), "execute", *args],
            cwd=repo,
            capture_output=True,
            text=True,
        )

    # The same front door runs an explicitly read-only child.
    p = run("--require-state", "PHASE2_INTEGRATING", "--", *child)
    assert p.returncode == 0, (p.stdout, p.stderr)
    assert marker.read_text() == "ran"

    marker.unlink()
    mutation_args = [
        "--require-state", "PHASE2_INTEGRATING",
        "--mutation",
        "--capsule", str(repo / "capsule.json"),
        "--prelive-proof", str(repo / "prelive.json"),
    ]

    # Missing admission is rejected by the guard before child execution.
    p = run(*mutation_args, "--", *child)
    assert p.returncode != 0 and "requires --admission" in (p.stdout + p.stderr)
    assert not marker.exists(), "child ran without exact LIVE_APPROVED admission"

    # Malformed admission is also rejected before the child can start.
    malformed = repo / "malformed-admission.json"
    malformed.write_text('{"schema":"wrong"}')
    p = run(*mutation_args, "--admission", str(malformed), "--", *child)
    assert p.returncode != 0
    assert "LIVE_APPROVED release admission failed" in (p.stdout + p.stderr)
    assert not marker.exists(), "child ran with malformed LIVE_APPROVED admission"

print("PASS: platform execute routes through the release guard; missing and malformed admission block before child execution")
