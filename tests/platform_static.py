#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("platform_cli", ROOT / "scripts/platform.py")
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

catalog = module.load_json(ROOT / "platform/catalog.json")
policies = module.load_json(ROOT / "platform/policies.json")

errors = []
module.validate_catalog(catalog, errors)
assert not errors, errors

workflow_ids = set()
for path in module.workflow_files():
    wf = module.load_json(path)
    workflow_ids.add(wf["id"])
    wf_errors = []
    wf_warnings = []
    module.validate_workflow(wf, wf_errors, wf_warnings)
    assert not wf_errors, (path, wf_errors)

assert workflow_ids == {
    "software-change",
    "artifact-release",
    "live-device-diagnostic",
}

# Timeout-budget regression: the class of defect that stopped Packet20 must fail.
bad = {
    "id": "bad-timeout",
    "stages": [
        {
            "id": "telemetry",
            "kind": "preflight",
            "mutation": False,
            "retry_policy": "idempotent",
            "timeout_budget": {
                "outer_seconds": 8,
                "inner_calls_max": 4,
                "inner_timeout_seconds": 4,
                "margin_seconds": 0,
            },
        }
    ],
}
bad_errors = []
module.validate_workflow(bad, bad_errors, [])
assert any("outer timeout" in e for e in bad_errors), bad_errors

# Mutation without rollback must fail.
unsafe = {
    "id": "unsafe",
    "stages": [
        {
            "id": "deploy",
            "kind": "deployment",
            "mutation": True,
            "retry_policy": "explicit_only",
        }
    ],
    "terminal_recovery": "stop",
}
unsafe_errors = []
module.validate_workflow(unsafe, unsafe_errors, [])
assert any("rollback" in e for e in unsafe_errors), unsafe_errors

# Current policy must preserve the two-blocker circuit breaker and no inherited spend.
assert policies["process"]["max_consecutive_tooling_blockers_without_product_evidence"] == 2
assert policies["cost"]["retry_inherits_authorization"] is False
assert policies["user_interaction"]["terminal_relay"] is False

print("PASS: platform catalog, golden paths, timeout budgets, rollback rules, and anti-toil policy")
