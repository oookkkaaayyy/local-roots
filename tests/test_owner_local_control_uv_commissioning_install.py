#!/usr/bin/env python3
"""Offline install and rollback rehearsal for the Opal UV commissioning slice."""
from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def manifest(text: str) -> dict[str, str]:
    result = {}
    for line in text.splitlines():
        digest, rel = line.split("  ", 1)
        result[rel] = digest
    return result


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    with zipfile.ZipFile(args.package) as archive:
        top = archive.namelist()[0].split("/", 1)[0]
        package = {}
        for name in archive.namelist():
            prefix = top + "/"
            if name.startswith(prefix) and not name.endswith("/"):
                package[name[len(prefix):]] = archive.read(name)
    sums = manifest(package["SHA256SUMS"].decode())
    if any(sha(package[name]) != digest for name, digest in sums.items()):
        raise SystemExit("candidate archive internal checksum failed")
    baseline = manifest(package["BASELINE_FILES.SHA256SUMS"].decode())
    updated = manifest(package["UPDATED_FILES.SHA256SUMS"].decode())
    if len(baseline) != 20 or baseline.keys() != updated.keys():
        raise SystemExit("baseline and candidate installed-file manifests do not bind the same 20 paths")
    changed = {path for path in baseline if baseline[path] != updated[path]}
    expected_changed = {
        "etc/hbnf-local-control/lua/uv_policy_access.lua",
        "etc/hbnf-local-control/lua/uv_runtime.lua",
        "etc/hbnf-local-control/lua/uv_status_access.lua",
    }
    if changed != expected_changed:
        raise SystemExit(f"update scope differs from the three intended Lua modules: {sorted(changed)}")

    with tempfile.TemporaryDirectory(prefix="hbnf-uv-update-rehearsal-") as temporary:
        root = Path(temporary) / "root"
        pkg = Path(temporary) / "package"
        root.mkdir()
        pkg.mkdir()
        baseline_zip_path = Path(temporary) / "baseline-inner.zip"
        baseline_zip_path.write_bytes(package["ROLLBACK_BASELINE.zip"])
        with zipfile.ZipFile(baseline_zip_path) as old_archive:
            old_top = "hbnf-owner-local-control-v1.0.14/"
            old_files = {Path(n).name: old_archive.read(n) for n in old_archive.namelist()
                         if n.startswith(old_top) and not n.endswith("/")}
        for relative, expected in baseline.items():
            name = Path(relative).name
            content = old_files.get(name)
            if content is None or sha(content) != expected:
                raise SystemExit("rollback ZIP does not reconstruct the exact baseline file: " + relative)
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            target.chmod(0o755 if relative.endswith((".sh", "hbnf-owner-local-control")) else 0o644)
        for name, content in package.items():
            target = pkg / name
            target.write_bytes(content)
            target.chmod(0o755 if name.endswith(".sh") else 0o644)

        for relative, content in {
            "usr/sbin/nginx": b"#!/bin/sh\nexit 0\n",
            "bin/netstat": b"#!/bin/sh\nprintf 'Active internet connections\\nProto Recv-Q Send-Q Local Foreign State\\ntcp 0 0 0.0.0.0:9443 0.0.0.0:* LISTEN\\n'\n",
            "var/run/hbnf-owner-local-control-nginx.pid": f"{os.getpid()}\n".encode(),
        }.items():
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            target.chmod(0o755 if relative.endswith(("nginx", "netstat")) else 0o644)
        reload_stub = Path(temporary) / "reload-stub"
        reload_stub.write_text("#!/bin/sh\nexit 0\n")
        reload_stub.chmod(0o755)
        environment = os.environ | {
            "HBNF_OPAL_ROOT": str(root),
            "HBNF_TEST_MODE": "1",
            "HBNF_TEST_RELOAD": str(reload_stub),
        }
        install = subprocess.run(["sh", str(pkg / "install.sh")], env=environment, text=True, capture_output=True)
        if install.returncode:
            raise SystemExit("offline install rehearsal failed:\n" + install.stdout + install.stderr)
        for relative, digest in updated.items():
            if sha((root / relative).read_bytes()) != digest:
                raise SystemExit("post-install candidate file failed readback: " + relative)
        rollback = subprocess.run(["sh", str(pkg / "rollback.sh")], env=environment, text=True, capture_output=True)
        if rollback.returncode:
            raise SystemExit("offline rollback rehearsal failed:\n" + rollback.stdout + rollback.stderr)
        for relative, digest in baseline.items():
            if sha((root / relative).read_bytes()) != digest:
                raise SystemExit("post-rollback baseline file failed readback: " + relative)
        print("PASS: exact 20-file baseline admitted; only 3 UV Lua modules changed; install and rollback readbacks match.")


if __name__ == "__main__":
    main()
