#!/usr/bin/env python3
"""Contract tests for routing firmware-bound Seq41/43 checks by changed paths."""
from __future__ import annotations

import importlib.util
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/hbnf_foundation_artifact_scope.py"
spec = importlib.util.spec_from_file_location("foundation_artifact_scope", MODULE_PATH)
assert spec and spec.loader
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)

# Cart relay/control changes must retain the lightweight validation path only.
assert not scope.requires_artifact_tests([
    "scripts/platform.py",
    "tests/hbnf_control_execution_system.py",
    "staging/coordinated-backend/opal/hbnf-skins-relay",
    "staging/coordinated-backend/opal/hbnf-skins-relay-core.sh",
    "tests/opal-skins-relay-contract.mjs",
    "scripts/hbnf_foundation_artifact_scope.py",
    "tests/hbnf_foundation_artifact_scope.py",
    ".github/workflows/hbnf-coordinated-release-ci.yml",
])

# Every direct firmware/evidence input and both transactions' code closure select the tests.
for path in (
    "evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin",
    "evidence/hbnf-foundation-qualification-20261005/seq39/artifact/release07.bin",
    "evidence/hbnf-foundation-qualification-20261005/seq39/BUILD_PROVENANCE.json",
    "evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json",
    "evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep/PRE_SOAK_SWEEP_REUSE_MANIFEST.json",
    "evidence/hbnf-foundation-qualification-20261005/seq41/THRESHOLD_FREEZE_RECEIPT.json",
    "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json",
    "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006.json",
    "config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json",
    "firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp",
    "scripts/hbnf_foundation_seq41_transaction.py",
    "scripts/hbnf_foundation_seq43_transaction.py",
    "scripts/hbnf_foundation_seq39_failure_policy.py",
    "scripts/hbnf_foundation_threshold_freeze.py",
    "scripts/hbnf_foundation_live_adapter.py",
    "scripts/hbnf_live_kernel_sweep.py",
    "scripts/hbnf_foundation_continuous_soak.py",
    "scripts/hbnf_foundation_soak_audit.py",
    "tests/hbnf_foundation_seq41_offline.py",
    "tests/hbnf_foundation_seq43_offline.py",
):
    assert scope.requires_artifact_tests([path]), path

# CLI output used by GitHub Actions agrees with the pure selector.
with tempfile.TemporaryDirectory(prefix="hbnf-artifact-scope-") as directory:
    output = pathlib.Path(directory) / "github-output"
    relay = subprocess.run(
        [sys.executable, str(MODULE_PATH), "--github-output", str(output)],
        input="staging/coordinated-backend/opal/hbnf-skins-relay\ntests/opal-skins-relay-contract.mjs\n",
        text=True, capture_output=True, check=True,
    )
    assert "SKIP" in relay.stdout
    assert output.read_text() == "run_foundation_artifact_tests=false\n"
    firmware = subprocess.run(
        [sys.executable, str(MODULE_PATH), "--github-output", str(output)],
        input="evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin\n",
        text=True, capture_output=True, check=True,
    )
    assert "RUN" in firmware.stdout
    assert output.read_text().endswith("run_foundation_artifact_tests=true\n")

workflow = (ROOT / ".github/workflows/hbnf-coordinated-release-ci.yml").read_text()
assert "scripts/hbnf_foundation_artifact_scope.py" in workflow
assert "tests/hbnf_foundation_artifact_scope.py" in workflow
assert "steps.foundation_scope.outputs.run_foundation_artifact_tests" in workflow
assert "fetch-depth: 0" in workflow
assert 'git diff --name-only "$PR_BASE_SHA...$PR_HEAD_SHA"' in workflow
assert 'git diff --name-only "$PUSH_BEFORE" "$PUSH_SHA"' in workflow
assert 'if [[ "$RUN_FOUNDATION_ARTIFACT_TESTS" == "true" ]]; then' in workflow
assert workflow.count("tests/hbnf_foundation_artifact_scope.py") == 3
assert workflow.count("tests/hbnf_foundation_seq41_offline.py") == 3
assert "node --test tests/opal-skins-relay-contract.mjs" in workflow

print("PASS: Seq41/43 artifact scope, relay-only skip, firmware-path selection, and workflow wiring")
