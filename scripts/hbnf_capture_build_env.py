#!/usr/bin/env python3
"""Read-only HBNF build-environment capture helper.

Writes JSON to stdout. It does not install packages, modify PlatformIO state,
build firmware, access hardware, or use network services.
"""
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()

def run(cmd):
    exe = shutil.which(cmd[0])
    if not exe:
        return {"ok": False, "error": f"{cmd[0]} not found"}
    p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    return {
        "ok": p.returncode == 0,
        "returncode": p.returncode,
        "stdout": p.stdout,
        "stderr": p.stderr,
    }

out = {
    "schema": "hbnf-build-env-capture-v1",
    "cwd": str(ROOT),
    "os": platform.platform(),
    "python": sys.version,
    "git": {
        "head": run(["git", "rev-parse", "HEAD"]),
        "status": run(["git", "status", "--porcelain=v1"]),
        "remote": run(["git", "remote", "-v"]),
    },
    "platformio": {
        "version": run(["pio", "--version"]),
        "project_config": run(["pio", "project", "config", "--json-output"]),
        "project_metadata": run(["pio", "project", "metadata", "--json-output"]),
        "packages": run(["pio", "pkg", "list"]),
        "env_core_dir": os.environ.get("PLATFORMIO_CORE_DIR"),
        "env_packages_dir": os.environ.get("PLATFORMIO_PACKAGES_DIR"),
        "env_libdeps_dir": os.environ.get("PLATFORMIO_LIBDEPS_DIR"),
        "env_build_dir": os.environ.get("PLATFORMIO_BUILD_DIR"),
        "env_cache_dir": os.environ.get("PLATFORMIO_CACHE_DIR"),
        "env_workspace_dir": os.environ.get("PLATFORMIO_WORKSPACE_DIR"),
    },
    "files": {},
    "materialization": {
        "note": "This helper records build-environment evidence only. A separate materialization preflight must prove all source/dependency inputs are local and not FileProvider placeholders before build."
    },
}

for name in ("platformio.ini", "platformio_override.ini", "platformio_override.sample.ini"):
    p = ROOT / name
    if p.exists():
        out["files"][name] = p.read_text(errors="replace")

# Preserve only safe build-relevant environment variable names.
safe_names = [k for k in os.environ if k.startswith(("PLATFORMIO_", "PIO"))]
out["environment_names_only"] = sorted(safe_names)

print(json.dumps(out, indent=2, sort_keys=True))
