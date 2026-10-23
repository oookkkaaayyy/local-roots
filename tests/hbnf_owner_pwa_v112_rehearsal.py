#!/usr/bin/env python3
"""Rehearse the exact v1.0.12 install and rollback in a temporary filesystem."""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

package = Path(sys.argv[1]).resolve()
repo = Path(__file__).resolve().parents[1]
prior = repo / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.11-retry-02"
mission = repo / "staging/coordinated-backend/opal/mission-control-local"
tx = "OWNER-PWA-LOCAL-V112-SHOW-SCORES-SYSTEM-20261022-01"
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def run(script, env):
    result = subprocess.run(["/bin/sh", str(script)], env=env, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(f"{script.name} failed ({result.returncode}): {result.stdout}\n{result.stderr}")
    return result.stdout

with tempfile.TemporaryDirectory(prefix="hbnf-v112-rehearsal-") as temp:
    temp = Path(temp)
    root = temp / "root"
    www = temp / "www"
    base = www / "mission-control-local"
    target = base / "owner-pwa"
    target.mkdir(parents=True)
    root.mkdir()
    shutil.copytree(prior / "owner-pwa", target, dirs_exist_ok=True)
    (target / ".hbnf-package-marker").write_text("hbnf-owner-pwa-local-v1\n")
    (target / ".hbnf-package-version").write_text("1.0.11\n")
    prior_payload = (prior / "PAYLOAD.SHA256SUMS").read_text().replace("owner-pwa/", "")
    (target / ".hbnf-payload.sha256").write_text(prior_payload)
    shutil.copy2(prior / "rollback.sh", target / ".hbnf-rollback.sh")
    (target / ".hbnf-rollback.sh").chmod(0o755)

    for name in (".hbnf-package-marker", ".hbnf-package-version", "index.html", "styles.css", "app.js", "local-transport.js"):
        source = mission / name
        if source.is_file(): shutil.copy2(source, base / name)
    # Preserve the exact known Mission Control v1.0.2 marker files used by the installer.
    (base / ".hbnf-package-marker").write_text("hbnf-owner-pwa-empty-runtime-recovery-v2\n")
    (base / ".hbnf-package-version").write_text("1.0.2\n")

    manifest = package / "BASELINE.SHA256SUMS"
    check = subprocess.run(["sha256sum", "-c", str(manifest)], cwd=target, capture_output=True, text=True)
    if check.returncode: raise AssertionError("Reconstructed installed v1.0.11 baseline failed: " + check.stderr)

    bin_dir = temp / "bin"
    bin_dir.mkdir()
    fake_id = bin_dir / "id"
    fake_id.write_text("#!/bin/sh\necho 0\n")
    fake_id.chmod(0o755)
    env = os.environ.copy()
    env.update({"PATH": f"{bin_dir}:{env['PATH']}", "HBNF_WWW_ROOT": str(www), "HBNF_BACKUP_ROOT": str(root)})

    run(package / "install.sh", env)
    assert (target / ".hbnf-package-version").read_text() == "1.0.12\n"
    check = subprocess.run(["sha256sum", "-c", ".hbnf-payload.sha256"], cwd=target, capture_output=True, text=True)
    if check.returncode: raise AssertionError("Installed candidate payload failed exact check: " + check.stderr)
    assert len([p for p in target.iterdir() if p.is_file()]) == 20

    run(target / ".hbnf-rollback.sh", env)
    check = subprocess.run(["sha256sum", "-c", str(manifest)], cwd=target, capture_output=True, text=True)
    if check.returncode: raise AssertionError("Rollback did not restore the exact v1.0.11 baseline: " + check.stderr)
    assert (target / ".hbnf-package-version").read_text() == "1.0.11\n"
    assert (base / f".owner-pwa.failed-{tx}").is_dir()
    assert sha(root / f"hbnf-owner-pwa-{tx}.BASELINE.SHA256SUMS") == sha(manifest)
    print("PASS: candidate install, v1.0.12 marker, 20-file payload, exact rollback to v1.0.11, and failed-candidate preservation")
