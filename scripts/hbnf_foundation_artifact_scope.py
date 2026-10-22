#!/usr/bin/env python3
"""Select only firmware/evidence-bound Seq41/43 offline closure tests."""
from __future__ import annotations

import argparse
import pathlib
import sys

EXACT_INPUTS = frozenset({
    "tests/hbnf_foundation_seq41_offline.py",
    "tests/hbnf_foundation_seq43_offline.py",
    "scripts/hbnf_foundation_seq41_transaction.py",
    "scripts/hbnf_foundation_seq43_transaction.py",
    "scripts/hbnf_foundation_seq39_failure_policy.py",
    "scripts/hbnf_foundation_threshold_freeze.py",
    "scripts/hbnf_foundation_live_adapter.py",
    "scripts/hbnf_live_kernel_sweep.py",
    "scripts/hbnf_foundation_continuous_soak.py",
    "scripts/hbnf_foundation_soak_audit.py",
    "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json",
    "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006.json",
    "config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json",
    "firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp",
})
PREFIX_INPUTS = (
    "evidence/hbnf-foundation-qualification-20261005/seq39/",
    "evidence/hbnf-foundation-qualification-20261005/seq41/",
)


def requires_artifact_tests(changed_paths: list[str]) -> bool:
    """Return true when any exact Seq41/43 test input or source changed."""
    for raw_path in changed_paths:
        path = pathlib.PurePosixPath(raw_path).as_posix().removeprefix("./")
        if path in EXACT_INPUTS or any(path.startswith(prefix) for prefix in PREFIX_INPUTS):
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--github-output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    changed = [line.strip() for line in sys.stdin if line.strip()]
    should_run = requires_artifact_tests(changed)
    with args.github_output.open("a", encoding="utf-8") as output:
        output.write(f"run_foundation_artifact_tests={'true' if should_run else 'false'}\n")
    print(f"Seq41/43 artifact-dependent tests: {'RUN' if should_run else 'SKIP'} ({len(changed)} changed paths checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
