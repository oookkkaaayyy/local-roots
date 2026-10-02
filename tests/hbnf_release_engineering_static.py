#!/usr/bin/env python3
"""Static integrity checks for the HBNF release-engineering staging package."""
import json
from pathlib import Path

required = [
    Path("work/release-engineering/00_READ_FIRST.md"),
    Path("work/release-engineering/GOLDEN_RELEASE_CAPSULE_TEMPLATE.md"),
    Path("work/release-engineering/TARGETED_UPDATE_RUNBOOK.md"),
    Path("work/release-engineering/AFTER_CURRENT_TASK.md"),
    Path("config/HBNF_RELEASE_STATUS_TEMPLATE.json"),
    Path("config/HBNF_SOLVED_PROBLEMS.json"),
    Path("config/HBNF_GOLDEN_RELEASE_V1_1_PENDING.json"),
    Path("config/HBNF_DEPENDENCY_CLOSURE_TEMPLATE.json"),
    Path("config/HBNF_GENERATED_INPUTS_POLICY_TEMPLATE.json"),
    Path("scripts/hbnf_capture_build_env.py"),
    Path("scripts/hbnf_validate_release_capsule.py"),
]
missing=[str(p) for p in required if not p.is_file()]
assert not missing, "missing release-engineering files: " + ", ".join(missing)

status=json.loads(Path("config/HBNF_RELEASE_STATUS_TEMPLATE.json").read_text())
assert status["live_mutation_authorized"] is False
assert status["gates"]["baseline_source_proven"] is False

problems=json.loads(Path("config/HBNF_SOLVED_PROBLEMS.json").read_text())
ids=[x["id"] for x in problems["issues"]]
assert len(ids)==len(set(ids)), "duplicate solved-problem IDs"
assert any(x["status"]=="OPEN" for x in problems["issues"])
assert any(x["status"]=="WATCH" for x in problems["issues"])

capsule=json.loads(Path("config/HBNF_GOLDEN_RELEASE_V1_1_PENDING.json").read_text())
assert capsule["source"]["lineage_verified"] is False
assert capsule["build_environment"]["captured"] is False
assert capsule["artifact"]["sha256"]=="0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61"
assert capsule["source_materialization"]["fully_local"] is False
assert capsule["dependency_closure"]["captured"] is False
assert capsule["generated_inputs"]["policy_verified"] is False
assert any(x["id"]=="HBNF-WATCH-013" for x in problems["issues"])
assert any(x["id"]=="HBNF-WATCH-014" for x in problems["issues"])
assert any(x["id"]=="HBNF-WATCH-015" for x in problems["issues"])

print("PASS: HBNF release-engineering staging integrity")
