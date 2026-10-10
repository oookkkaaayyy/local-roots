#!/usr/bin/env python3
"""Exercise the production R6 transaction coordinator without device I/O."""
from __future__ import annotations

import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py"
spec = importlib.util.spec_from_file_location("r6_audio_cache_transaction", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class FakePort:
    def __init__(self, *, admission=True, stage=True, installed=True,
                 qualification=True, recovery=True, device_failure=False):
        self.admission = admission
        self.stage = stage
        self.installed = installed
        self.qualification = qualification
        self.recovery_ok = recovery
        self.device_failure = device_failure
        self.device_requests = 0
        self.install_attempts = 0
        self.recovery_attempts = 0
        self.closed = False

    def admit(self):
        if not self.admission:
            raise RuntimeError("invalid-live-admission")

    def verify_local_artifacts(self):
        pass

    def preflight(self):
        self.device_requests += 6
        return {"pass": True}

    def stage_candidate(self):
        self.device_requests += 1  # Temporary Opal staging, not a Matrix request.
        if not self.stage:
            raise RuntimeError("stage-hash-mismatch")
        return {"sha256": module.CANDIDATE_SHA, "bytes": module.CANDIDATE_SIZE}

    def consume_install_attempt(self):
        self.install_attempts += 1

    def upload_candidate(self):
        self.device_requests += 1
        return {"confirmed": self.installed}

    def resolve_runtime(self, upload):
        if self.installed is None:
            return {"installed": None, "error": "readback-unavailable"}
        if not self.installed:
            return {"installed": False, "runtime": {"release_id": module.R4}}
        return {"installed": True, "runtime": {"release_id": module.RELEASE}}

    def qualify(self):
        if self.qualification:
            return {"passed": True, "report": {"status": "PASS"}}
        if self.device_failure:
            return {"passed": False, "abort": {"run_error": "kernel-0-kernel-gate-failed"}}
        return {"passed": False, "abort": {"run_error": "collector timeout; no performance conclusion"}}

    def recover_r4(self):
        self.recovery_attempts += 1
        if self.recovery_attempts > 1:
            raise RuntimeError("recovery-limit")
        if not self.recovery_ok:
            raise RuntimeError("R4-readback-not-proven")
        self.device_requests += 3
        return {"status": "R4_READBACK_VERIFIED", "runtime": {"release_id": module.R4}}

    def close(self, result):
        self.closed = True


def run_case(name, port, expected_status, installs, recoveries, min_requests=0):
    result = module.coordinate(port)
    assert result["status"] == expected_status, (name, result)
    assert result["candidate_install_attempts"] == installs, (name, result)
    assert result["recovery_attempts"] == recoveries, (name, result)
    assert result["device_requests"] == port.device_requests, (name, result)
    assert port.closed
    assert port.device_requests >= min_requests
    assert port.install_attempts <= 1 and port.recovery_attempts <= 1
    return result


def main():
    cases = []
    rejected = FakePort(admission=False)
    cases.append(run_case("invalid admission zero requests", rejected, "BLOCKED_OR_FAILED", 0, 0))
    assert rejected.device_requests == 0

    stage_fail = FakePort(stage=False)
    cases.append(run_case("stage failure no Matrix post", stage_fail, "BLOCKED_OR_FAILED", 0, 0, 7))
    assert stage_fail.device_requests == 7  # six read-only checks plus Opal staging

    good = FakePort()
    cases.append(run_case("full objective pass", good, "QUALIFIED_OBJECTIVE_GATES_PASS", 1, 0, 8))

    unchanged = FakePort(installed=False)
    cases.append(run_case("upload response but R4 remains", unchanged,
             "OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY", 1, 0, 8))

    gate_fail = FakePort(qualification=False, device_failure=True)
    cases.append(run_case("frozen device gate failure", gate_fail,
             "QUALIFICATION_FAILED_R4_RECOVERED", 1, 1, 11))

    collector_fail = FakePort(qualification=False, device_failure=False)
    cases.append(run_case("host collector failure does not consume recovery", collector_fail,
             "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED", 1, 0, 8))

    uncertain = FakePort(installed=None)
    cases.append(run_case("identity uncertainty uses one exact recovery", uncertain,
             "RUNTIME_IDENTITY_UNRESOLVED_R4_RECOVERED", 1, 1, 11))

    recovery_fail = FakePort(installed=None, recovery=False)
    cases.append(run_case("failed recovery stops without retry", recovery_fail,
             "RECOVERY_UNVERIFIED_STOP", 1, 1, 8))

    receipt = {
        "schema": "hbnf-r6-audio-cache-transaction-dryrun-v1",
        "candidate_release_id": module.RELEASE,
        "candidate_sha256": module.CANDIDATE_SHA,
        "rollback_sha256": module.R4_SHA,
        "device_or_cloud_mutation": False,
        "cases": cases,
        "invalid_admission_device_requests": rejected.device_requests,
        "assertions": "PASS",
    }
    evidence = ROOT / "evidence/cart2-r6-audio-cache-20261010/offline-dryrun/R6_TRANSACTION_DRYRUN.json"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    print("PASS: actual transaction coordinator replayed admission, stage, one install, readback, qualification, exact recovery, host failure, and recovery failure; invalid admission made zero device requests")


if __name__ == "__main__":
    main()
