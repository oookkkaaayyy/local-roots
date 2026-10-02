#!/usr/bin/env python3
"""Validate required HBNF release-capsule JSON fields.

This is source-only tooling. It does not build, sign, deploy, flash, or mutate hardware.
"""
import json
import sys
from pathlib import Path

REQUIRED = [
    "schema",
    "release_id",
    "accepted_baseline",
    "source",
    "build_environment",
    "source_materialization",
    "dependency_closure",
    "generated_inputs",
    "artifact",
    "rollback",
    "acceptance",
]

def fail(msg):
    print("FAIL:", msg)
    raise SystemExit(1)

if len(sys.argv) != 2:
    fail("usage: hbnf_validate_release_capsule.py <capsule.json>")

p = Path(sys.argv[1])
if not p.is_file():
    fail(f"missing file: {p}")

data = json.loads(p.read_text())
missing = [k for k in REQUIRED if k not in data]
if missing:
    fail("missing top-level keys: " + ", ".join(missing))

sha = data.get("artifact", {}).get("sha256")
if not isinstance(sha, str) or len(sha) != 64:
    fail("artifact.sha256 must be a 64-character SHA-256 hex string")

rollback = data.get("rollback", {}).get("sha256")
if not isinstance(rollback, str) or len(rollback) != 64:
    fail("rollback.sha256 must be a 64-character SHA-256 hex string")

if data.get("source", {}).get("lineage_verified") is not True:
    fail("source.lineage_verified must be true before a capsule is accepted")

if data.get("build_environment", {}).get("captured") is not True:
    fail("build_environment.captured must be true before a capsule is accepted")

mat = data.get("source_materialization", {})
if mat.get("fully_local") is not True or mat.get("fileprovider_placeholders_absent") is not True:
    fail("source_materialization must prove a fully local snapshot with no FileProvider placeholders")

deps = data.get("dependency_closure", {})
if deps.get("captured") is not True or deps.get("unexpected_global_libraries_absent") is not True:
    fail("dependency_closure must be captured and free of unexpected global-library resolution")

gen = data.get("generated_inputs", {})
if gen.get("policy_verified") is not True:
    fail("generated_inputs.policy_verified must be true before a capsule is accepted")

print("PASS: release capsule satisfies required structural gates")
