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
    if any(bool(stage.get("mutation")) for stage in wf.get("stages", [])):
        ids = [stage["id"] for stage in wf["stages"]]
        first_mutation = min(i for i, stage in enumerate(wf["stages"]) if stage.get("mutation"))
        for required in module.MANDATORY_PRELIVE_STAGES:
            assert required in ids, (path, required)
            assert ids.index(required) < first_mutation, (path, required, first_mutation)

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

# Mutating workflows that skip deterministic contract/recovery/rehearsal closure must fail.
missing_prelive = {
    "id": "missing-prelive",
    "stages": [
        {
            "id": "deploy",
            "kind": "deployment",
            "mutation": True,
            "retry_policy": "explicit_only",
            "rollback": {"strategy": "restore"},
        }
    ],
    "terminal_recovery": "restore",
}
missing_errors = []
module.validate_workflow(missing_prelive, missing_errors, [])
assert any("prelive_contract" in e for e in missing_errors), missing_errors
assert any("mandatory prelive stage" in e for e in missing_errors), missing_errors

# A recovery stage placed after mutation is not acceptable preparation.
late_recovery = {
    "id": "late-recovery",
    "prelive_contract": {
        "deterministic_prerequisites_closed_offline": True,
        "consumer_contract_verified": True,
        "recovery_proven_before_first_device_mutation": True,
        "end_to_end_rehearsal_required": True,
        "exact_pre_mutation_state_capture_required": True,
        "required_before_stage_id": "deploy",
    },
    "stages": [
        {"id":"contract-closure","kind":"verification","mutation":False,"retry_policy":"idempotent"},
        {"id":"transaction-rehearsal","kind":"verification","mutation":False,"retry_policy":"idempotent"},
        {"id":"capture-current-state","kind":"preflight","mutation":False,"retry_policy":"idempotent"},
        {"id":"deploy","kind":"deployment","mutation":True,"retry_policy":"explicit_only","rollback":{"strategy":"restore"}},
        {"id":"recovery-proof","kind":"verification","mutation":False,"retry_policy":"idempotent"},
    ],
    "terminal_recovery": "restore",
}
late_errors = []
module.validate_workflow(late_recovery, late_errors, [])
assert any("recovery-proof must occur before first mutation" in e for e in late_errors), late_errors

# Current policy must preserve the two-blocker circuit breaker and no inherited spend.
assert policies["process"]["max_consecutive_tooling_blockers_without_product_evidence"] == 2
assert policies["cost"]["retry_inherits_authorization"] is False
assert policies["user_interaction"]["terminal_relay"] is False
assert policies["process"]["deterministic_prerequisites_before_live"] == "required"
assert policies["process"]["full_transaction_rehearsal_before_mutation"] is True
assert policies["engineering_standard"]["recovery_path_proven_before_risky_mutation"] is True
assert policies["engineering_standard"]["worker_directive_policy"].startswith("derive from validated execution capsule")
assert policies["user_interaction"]["copy_paste_delivery"] == "one_single_fenced_block_per_action"
assert {
    "hidden-build-inputs",
    "timeout-budget-inversion",
    "restore-evidence-loss",
    "credential-transport-surprise",
    "mutable-pointer-role-mismatch",
    "cloud-asset-reconstruction-risk",
    "stale-operational-state",
    "manual-prompt-improvisation",
}.issubset(set(policies["failure_class_regressions"]))

# Prelive proof must bind exact capsule bytes and every mandatory stage to evidence.
with tempfile.TemporaryDirectory() as td:
    td = pathlib.Path(td)
    cap = {
        "schema": "local-roots-execution-capsule-v1",
        "run_id": "test-run",
        "repo_inputs": [],
    }
    cap_path = td / "CAPSULE.json"
    cap_path.write_text(json.dumps(cap, sort_keys=True) + "\n")
    proof = {
        "schema": "local-roots-prelive-proof-v1",
        "run_id": "test-run",
        "capsule_sha256": module.sha256_file(cap_path),
        "approved_for_mutation": True,
        "stages": {
            stage: {"status": "PASS", "evidence": [f"evidence/{stage}.json"]}
            for stage in module.MANDATORY_PRELIVE_STAGES
        },
        "recovery_identity": {"identity": "known-good", "verification": "sha256-verified"},
        "pre_mutation_state": {"deployment": "exact-version"},
        "consumer_contract": {"verified": True, "identity": "exact-consumer-path"},
    }
    proof_path = td / "PRELIVE_PROOF.json"
    proof_path.write_text(json.dumps(proof, sort_keys=True) + "\n")
    assert module.validate_prelive_proof(cap_path, proof_path) == []
    proof["stages"]["recovery-proof"]["status"] = "BLOCKED"
    proof_path.write_text(json.dumps(proof, sort_keys=True) + "\n")
    errs = module.validate_prelive_proof(cap_path, proof_path)
    assert any("recovery-proof is not PASS" in e for e in errs), errs

print("PASS: platform catalog, golden paths, timeout budgets, rollback rules, and anti-toil policy")
